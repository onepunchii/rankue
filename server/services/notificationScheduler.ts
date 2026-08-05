import cron from "node-cron";
import { db } from "../db.js";
import { hiqCrewActivities, hiqCrewActivityParticipants, hiqPolls, hiqPollVotes, hiqCrewMembers, hiqCrews, hiqNotifications } from "../../shared/schema.js";
import { eq, and, gte, lte, ne, sql } from "drizzle-orm";
import { notificationService } from "./notificationService.js";
import { storage } from "../storage/index.js";

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
  const timeStr = activityDate.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const emoji = hoursLeft === 24 ? "📅" : "⏰";
  const body = hoursLeft === 24
    ? `내일 ${timeStr}에 "${title}"이(가) 있습니다. 지금 확인해주세요!`
    : `곧 시작합니다! "${title}"이(가) ${timeStr}에 시작해요.`;

  await notificationService.sendAndSaveNotification({
    memberId: participantId,
    title: `${emoji} [크루] 정모 리마인더`,
    body,
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
  const timeStr = endTime.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  await notificationService.sendAndSaveNotification({
    memberId: participantId,
    title: `📊 [크루] 투표 마감 임박`,
    body: `"${title}" 투표가 ${timeStr}에 마감됩니다. 지금 투표해주세요!`,
    category: sportCategory,
    type: "POLL_REMINDER",
    params: { url: `/crew/${crewId}`, reminderKey },
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
    const hourWindow = timeWindow(1);
    const polls = await db.select()
      .from(hiqPolls)
      .where(and(
        eq(hiqPolls.status, "active"),
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
