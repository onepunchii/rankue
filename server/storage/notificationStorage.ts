import { db } from "../db.js";
import { notifications, type Notification, type InsertNotification } from "../../shared/schema.js";
import { eq, desc, and, count } from "drizzle-orm";

export class NotificationStorage {
    async getNotifications(userId: string): Promise<Notification[]> {
        return await db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(50);
    }

    async createNotification(notification: InsertNotification): Promise<Notification> {
        const [newNotification] = await db
            .insert(notifications)
            .values(notification)
            .returning();
        return newNotification;
    }

    async markNotificationAsRead(id: number): Promise<void> {
        await db
            .update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, id));
    }

    async markAllNotificationsAsRead(userId: string): Promise<void> {
        await db
            .update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.userId, userId));
    }

    async getUnreadNotificationCount(userId: string): Promise<number> {
        const [result] = await db
            .select({ value: count() })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
        return Number(result.value);
    }
}
