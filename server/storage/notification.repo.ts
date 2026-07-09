import { db } from "../db.js";
import { hiqNotifications } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import type { HiqNotification, InsertHiqNotification } from "../../shared/schema.js";

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

    async deleteNotification(id: string, memberId: string): Promise<void> {
        await db.delete(hiqNotifications)
            .where(and(eq(hiqNotifications.id, id), eq(hiqNotifications.memberId, memberId)));
    }
}
