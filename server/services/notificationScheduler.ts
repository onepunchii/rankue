import cron from "node-cron";
import { db } from "../db.js";
import { hiqCrewActivities, hiqCrewActivityParticipants, hiqPolls, hiqPollVotes, hiqCrewMembers, hiqCrews, hiqNotifications, hiqMembers } from "../../shared/schema.js";
import { eq, and, gte, lte, ne, sql, inArray } from "drizzle-orm";
import { notificationService } from "./notificationService.js";
import { storage } from "../storage/index.js";
import { msg, memberLocale, type Locale } from "../lib/i18n.js";

// Runs every 30 minutes
const SCHEDULE = "*/30 * * * *";

function hoursFromNow(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

function timeWindow(hours: number, minutes: number = 30): { start: Date; end: Date } {
  const now = new Date();
  const target = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const delta = minutes * 60 * 1000;
  return { start: new Date(target.getTime() - delta), end: new Date(target.getTime() + delta) };
}

async function getCrewSportCategory(crewId: string): Promise<string> {
  const [crew] = await db.select().from(hiqCrews).where(eq(hiqCrews.id, crewId));
  return crew?.sportCategory || "BILLIARDS";
}

async function getActivityParticipants(activityId: string): Promise<string[]> {
  const rows = await db.select({ memberId: hiqCrewActivityParticipants.memberId })
    .from(hiqCrewActivityParticipants)
    .where(eq(hiqCrewActivityParticipants.activityId, activityId));
  return rows.map(r => r.memberId);
}

// 같은 리마인더가 중복 발송되는 것만 막는다. 알림 저장 시 params.reminderKey에
// "<종류>:<대상id>"를 남기고 그 키로만 조회한다.
// (이전 구현은 memberId+시간만 봐서 "최근에 아무 알림이나 받은 사람"을 전부 건너뛰었고,
//  채팅 알림 하나만 받아도 정모 리마인더가 영영 오지 않았다.)
async function wasRecentlyNotified(reminderKey: string, memberId: string, hoursAgo: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const [notif] = await db.select({ id: hiqNotifications.id })
    .from(hiqNotifications)
    .where(and(
      eq(hiqNotifications.memberId, memberId),
      gte(hiqNotifications.createdAt, cutoff),
      sql`${hiqNotifications.params}->>'reminderKey' = ${reminderKey}`,
    ))
    .limit(1);
  return !!notif;
}

// 알림 본문에 넣는 시각은 **한국 시각**으로, 받는 사람의 언어 모양으로 찍는다.
// 예전엔 toLocaleString("ko-KR") 에 timeZone 이 없어서 서버(Vercel, UTC) 시각이 그대로 나갔다 —
// 밤 9시 정모가 "오후 12:00"으로, 23:59 마감 투표가 "오후 2:59"로 갔다(2026-09-26 검토 P0).
const INTL_TAG: Record<Locale, string> = { ko: "ko-KR", en: "en-US", es: "es-ES", tr: "tr-TR", vi: "vi-VN" };
export function kstTimeLabel(at: Date, locale: Locale = "ko"): string {
  const s = at.toLocaleString(INTL_TAG[locale] ?? "ko-KR", {
    timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  // 외국어 사용자는 한국 시각이라는 걸 알아야 자기 시각으로 옮길 수 있다.
  return locale === "ko" ? s : `${s} KST`;
}

async function localeOfMember(memberId: string): Promise<Locale> {
  const [m] = await db.select({ locale: hiqMembers.locale }).from(hiqMembers).where(eq(hiqMembers.id, memberId));
  return memberLocale(m);
}

async function sendActivityReminder(
  activityId: string,
  participantId: string,
  crewId: string,
  title: string,
  activityDate: Date,
  hoursLeft: number,
) {
  // 크루별 알림 설정 존중 — 사용자가 정모 알림을 꺼도 크론이 계속 보내던 문제.
  const setting = await storage.notifs.getCrewNotificationSetting(crewId, participantId);
  if (!setting.activityEnabled) return;

  // 같은 정모·같은 시점(24h/1h)의 리마인더는 1회만.
  const reminderKey = `activity:${activityId}:${hoursLeft}h`;
  if (await wasRecentlyNotified(reminderKey, participantId, 20)) return;

  const sportCategory = await getCrewSportCategory(crewId);
  const timeStr = kstTimeLabel(activityDate, await localeOfMember(participantId));
  // 제목·본문은 받는 사람 언어로 풀린다(notificationService). 이모지(📅/⏰)는 사전 값 안에 있다.
  const k = hoursLeft === 24 ? "notif.reminder.activity24" : "notif.reminder.activity1";

  await notificationService.sendAndSaveNotification({
    memberId: participantId,
    title: msg(`${k}.title`),
    body: msg(`${k}.body`, { time: timeStr, title }),
    category: sportCategory,
    type: "ACTIVITY_REMINDER",
    params: { url: `/crew/${crewId}/activity`, reminderKey },
  }).catch(err => console.error(`[Scheduler] Activity reminder failed for ${participantId}:`, err));
}

async function sendPollReminder(pollId: string, participantId: string, crewId: string, title: string, endTime: Date) {
  // 크루별 알림 설정 존중 — 투표 알림을 꺼도 크론이 계속 보내던 문제.
  const setting = await storage.notifs.getCrewNotificationSetting(crewId, participantId);
  if (!setting.pollEnabled) return;

  // 이미 투표한 사람에게 "지금 투표해주세요"는 스팸이다.
  const [voted] = await db.select({ id: hiqPollVotes.id })
    .from(hiqPollVotes)
    .where(and(eq(hiqPollVotes.pollId, pollId), eq(hiqPollVotes.memberId, participantId)))
    .limit(1);
  if (voted) return;

  const reminderKey = `poll:${pollId}`;
  if (await wasRecentlyNotified(reminderKey, participantId, 20)) return;

  const sportCategory = await getCrewSportCategory(crewId);
  const timeStr = kstTimeLabel(endTime, await localeOfMember(participantId));

  await notificationService.sendAndSaveNotification({
    memberId: participantId,
    title: msg("notif.reminder.poll.title"),
    body: msg("notif.reminder.poll.body", { title, time: timeStr }),
    category: sportCategory,
    type: "POLL_REMINDER",
    // 크루 홈이 아니라 투표 탭으로 — 알림을 누른 사람은 투표하러 온 것이다(/crew/:id/:tab 별칭이 poll 을 받는다).
    params: { url: `/crew/${crewId}/poll`, crewId, tab: "poll", reminderKey },
  }).catch(err => console.error(`[Scheduler] Poll reminder failed for ${participantId}:`, err));
}

async function runActivityReminders() {
  try {
    // 24h reminders
    const dayWindow = timeWindow(24);
    const dayActivities = await db.select()
      .from(hiqCrewActivities)
      .where(and(
        gte(hiqCrewActivities.activityDate, dayWindow.start),
        lte(hiqCrewActivities.activityDate, dayWindow.end),
      ));

    for (const activity of dayActivities) {
      const participantIds = await getActivityParticipants(activity.id);
      for (const pid of participantIds) {
        await sendActivityReminder(activity.id, pid, activity.crewId, activity.title, activity.activityDate, 24);
      }
    }

    // 1h reminders
    const hourWindow = timeWindow(1);
    const hourActivities = await db.select()
      .from(hiqCrewActivities)
      .where(and(
        gte(hiqCrewActivities.activityDate, hourWindow.start),
        lte(hiqCrewActivities.activityDate, hourWindow.end),
      ));

    for (const activity of hourActivities) {
      const participantIds = await getActivityParticipants(activity.id);
      for (const pid of participantIds) {
        await sendActivityReminder(activity.id, pid, activity.crewId, activity.title, activity.activityDate, 1);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Activity reminder error:", err);
  }
}

async function runPollReminders() {
  try {
    // 마감 판정의 정본은 endTime 이다(shared/crewPoll). '일찍 마감'은 endTime 을 지금으로 당기므로
    // 창(30분~90분 뒤) 밖으로 빠진다. status 조건은 옛 행을 위한 안전장치로만 남긴다.
    const hourWindow = timeWindow(1);
    const polls = await db.select()
      .from(hiqPolls)
      .where(and(
        ne(hiqPolls.status, "closed"),
        gte(hiqPolls.endTime, hourWindow.start),
        lte(hiqPolls.endTime, hourWindow.end),
      ));

    for (const poll of polls) {
      // Get all crew members
      const members = await db.select({ memberId: hiqCrewMembers.memberId })
        .from(hiqCrewMembers)
        .where(and(
          eq(hiqCrewMembers.crewId, poll.crewId),
          ne(hiqCrewMembers.role, "pending"),
        ));
      for (const m of members) {
        await sendPollReminder(poll.id, m.memberId, poll.crewId, poll.title, poll.endTime!);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Poll reminder error:", err);
  }
}

/**
 * 투표 '재알림'(작성자·운영진이 누르는 수동 알림)이 최근 hours 시간 안에 나갔는지.
 * 서버리스라 메모리 카운터는 인스턴스마다 따로 놀아 믿을 수 없다 — 이미 저장되는 알림 행
 * (params.reminderKey = "pollNudge:<id>")을 그대로 증거로 쓴다. 받는 사람 id 로 좁혀야
 * (member_id, created_at) 인덱스를 탄다.
 */
export async function wasPollNudgedRecently(pollId: string, memberIds: string[], hours = 1): Promise<boolean> {
  if (memberIds.length === 0) return false;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await db.select({ id: hiqNotifications.id })
    .from(hiqNotifications)
    .where(and(
      inArray(hiqNotifications.memberId, memberIds),
      gte(hiqNotifications.createdAt, cutoff),
      sql`${hiqNotifications.params}->>'reminderKey' = ${`pollNudge:${pollId}`}`,
    ))
    .limit(1);
  return !!row;
}

/** 재알림 한 명분 — 크루 투표 알림 설정을 존중하고, 보냈으면 true. */
export async function sendPollNudge(p: { pollId: string; crewId: string; crewName: string; memberId: string; title: string; endTime: Date | null; category: string }): Promise<boolean> {
  const setting = await storage.notifs.getCrewNotificationSetting(p.crewId, p.memberId);
  if (!setting.pollEnabled) return false;
  const locale = await localeOfMember(p.memberId);
  await notificationService.sendAndSaveNotification({
    memberId: p.memberId,
    title: msg("crewPoll.nudgeTitle", { crew: p.crewName }),
    body: p.endTime
      ? msg("crewPoll.nudgeBodyDeadline", { title: p.title, time: kstTimeLabel(p.endTime, locale) })
      : msg("crewPoll.nudgeBody", { title: p.title }),
    category: p.category,
    type: "POLL_REMINDER",
    params: { url: `/crew/${p.crewId}/poll`, crewId: p.crewId, tab: "poll", reminderKey: `pollNudge:${p.pollId}` },
  });
  return true;
}

// 리마인더 1회 실행. 로컬은 node-cron이, 프로덕션(Vercel)은 /api/cron/reminders가 호출한다.
export async function runReminders(): Promise<{ ok: true }> {
  console.log("[Scheduler] Running activity & poll reminders...");
  await Promise.all([runActivityReminders(), runPollReminders()]);
  console.log("[Scheduler] Reminder run complete.");
  return { ok: true };
}

// 상주 프로세스가 있는 환경(로컬 개발)에서만 사용. Vercel 서버리스에는 상주 프로세스가
// 없어 node-cron이 돌지 않으므로 vercel.json의 crons가 HTTP로 runReminders를 호출한다.
export function startNotificationScheduler() {
  console.log("[Scheduler] Starting notification scheduler — runs every 30 minutes");
  cron.schedule(SCHEDULE, () => { void runReminders(); });
}
