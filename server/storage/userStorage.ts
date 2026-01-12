import { profiles, type Profile } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";

export class UserStorage {
    async getUser(id: string): Promise<Profile | undefined> {
        const [user] = await db.select().from(profiles).where(eq(profiles.id, id));
        return user;
    }

    async getUserByEmail(email: string): Promise<Profile | undefined> {
        const [user] = await db.select().from(profiles).where(eq(profiles.email, email));
        return user;
    }

    async upsertUser(userData: any): Promise<Profile> {
        const [user] = await db
            .insert(profiles)
            .values(userData)
            .onConflictDoUpdate({
                target: profiles.id,
                set: {
                    ...userData,
                    updatedAt: new Date(),
                },
            })
            .returning();

        return user;
    }

    async updateUser(userId: string, updateData: Partial<Profile>): Promise<Profile> {
        const [user] = await db
            .update(profiles)
            .set({
                ...updateData,
                updatedAt: new Date(),
            })
            .where(eq(profiles.id, userId))
            .returning();

        if (!user) {
            throw new Error(`User with id ${userId} not found`);
        }

        return user;
    }

    async updateUserLocation(userId: string, city: string, region: string): Promise<void> {
        await db
            .update(profiles)
            .set({
                city,
                region,
                updatedAt: new Date()
            })
            .where(eq(profiles.id, userId));
    }

    async updateUserPushToken(userId: string, pushToken: string): Promise<void> {
        await db
            .update(profiles)
            .set({
                pushToken,
                updatedAt: new Date()
            })
            .where(eq(profiles.id, userId));
    }

    async getUsersByPushToken(): Promise<Profile[]> {
        return await db
            .select()
            .from(profiles)
            .where(sql`${profiles.pushToken} IS NOT NULL AND ${profiles.pushToken} != ''`);
    }

    async updateUserNotificationSettings(userId: string, settings: any): Promise<void> {
        await db
            .update(profiles)
            .set({
                notificationSettings: settings,
                updatedAt: new Date()
            })
            .where(eq(profiles.id, userId));
    }

    // 게임화 요소 업데이트
    async updateUserGameStats(userId: string, experienceGained: number): Promise<void> {
        const user = await this.getUser(userId);
        if (!user) return;

        const newExperience = user.experience + experienceGained;
        const newLevel = Math.floor(newExperience / 100) + 1;
        const bonusTickets = newLevel > user.level ? (newLevel - user.level) : 0;

        await db.update(profiles).set({
            experience: newExperience,
            level: newLevel,
            availableLotteryTickets: user.availableLotteryTickets + bonusTickets,
            updatedAt: new Date()
        }).where(eq(profiles.id, userId));
    }
}
