import { db } from "../db.js";
import { hiqNotifications } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import type { HiqNotification, InsertHiqNotification, InsertHiqCrewNotificationSetting } from "../../shared/schema.js";

export class NotificationRepository {
    async getNotifications(memberId: string): Promise<HiqNotification[]> {
        return await db.select()
            .from(hiqNotifications)
            .where(eq(hiqNotifications.memberId, memberId))
            .orderBy(desc(hiqNotifications.createdAt));
    }

    async createNotification(data: InsertHiqNotification): Promise<HiqNotification> {
        const [notif] = await db.insert(hiqNotifications).values(data).returning();
        return notif;
    }

    async markNotificationAsRead(id: string, memberId: string): Promise<void> {
        await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }

    /**
     * 내 알림 전부 읽음 처리. 이미 읽은 건 건드리지 않는다(updatedAt 이 있는 스키마가
     * 아니라 실익은 없지만, 쓰기 행 수를 줄이고 반환값으로 "몇 건이 새로 읽혔는지"를 준다).
     */
    async markAllNotificationsAsRead(memberId: string): Promise<number> {
        const rows = await db.update(hiqNotifications)
            .set({ isRead: true })
            .where(and(eq(hiqNotifications.memberId, memberId), eq(hiqNotifications.isRead, false)))
            .returning({ id: hiqNotifications.id });
        return rows.length;
    }

    async deleteNotification(id: string, memberId: string): Promise<void> {
        await db.delete(hiqNotifications)
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }

    // Crew notification settings
    async getCrewNotificationSetting(crewId: string, memberId: string): Promise<{ chatEnabled: boolean; activityEnabled: boolean; settlementEnabled: boolean; postCommentEnabled: boolean; pollEnabled: boolean }> {
      const { eq, and } = await import("drizzle-orm");
      const { hiqCrewNotificationSettings } = await import("../../shared/schema.js");
      const [row] = await db.select().from(hiqCrewNotificationSettings)
        .where(and(eq(hiqCrewNotificationSettings.crewId, crewId), eq(hiqCrewNotificationSettings.memberId, memberId)));
      if (!row) return { chatEnabled: true, activityEnabled: true, settlementEnabled: true, postCommentEnabled: true, pollEnabled: true };
      return row;
    }

    async upsertCrewNotificationSetting(data: InsertHiqCrewNotificationSetting): Promise<void> {
      const { hiqCrewNotificationSettings } = await import("../../shared/schema.js");
      await db.insert(hiqCrewNotificationSettings).values(data as any)
        .onConflictDoUpdate({ target: [hiqCrewNotificationSettings.crewId, hiqCrewNotificationSettings.memberId], set: { chatEnabled: data.chatEnabled, activityEnabled: data.activityEnabled, settlementEnabled: data.settlementEnabled, postCommentEnabled: data.postCommentEnabled, pollEnabled: data.pollEnabled, updatedAt: new Date() } });
    }
}
