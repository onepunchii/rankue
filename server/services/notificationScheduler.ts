import cron from "node-cron";
import { db } from "../db.js";
import { hiqCrewActivities, hiqCrewActivityParticipants, hiqPolls, hiqCrewMembers, hiqCrews, hiqNotifications } from "../../shared/schema.js";
import { eq, and, gte, lte, ne, desc, or, notInSelect } from "drizzle-orm";
import { notificationService } from "./notificationService.js";

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

async function wasRecentlyNotified(paramsKey: string, memberId: string, activityId: string, hoursAgo: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const [notif] = await db.select({ id: hiqNotifications.id })
    .from(hiqNotifications)
    .where(and(
      eq(hiqNotifications.memberId, memberId),
      gte(hiqNotifications.createdAt, cutoff),
    ))
    .orderBy(desc(hiqNotifications.createdAt))
    .limit(10);
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
  const recentKey = `activity_reminder_${hoursLeft}h`;
  if (await wasRecentlyNotified(recentKey, participantId, activityId, 20)) return;

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
    params: { url: `/crew/${crewId}/activity` },
  }).catch(err => console.error(`[Scheduler] Activity reminder failed for ${participantId}:`, err));
}

async function sendPollReminder(pollId: string, participantId: string, crewId: string, title: string, endTime: Date) {
  if (await wasRecentlyNotified("poll_reminder", participantId, pollId, 20)) return;

  const sportCategory = await getCrewSportCategory(crewId);
  const timeStr = endTime.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  await notificationService.sendAndSaveNotification({
    memberId: participantId,
    title: `📊 [크루] 투표 마감 임박`,
    body: `"${title}" 투표가 ${timeStr}에 마감됩니다. 지금 투표해주세요!`,
    category: sportCategory,
    type: "POLL_REMINDER",
    params: { url: `/crew/${crewId}` },
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

export function startNotificationScheduler() {
  console.log("[Scheduler] Starting notification scheduler — runs every 30 minutes");
  cron.schedule(SCHEDULE, async () => {
    console.log("[Scheduler] Running activity & poll reminders...");
    await Promise.all([runActivityReminders(), runPollReminders()]);
    console.log("[Scheduler] Reminder run complete.");
  });
}
