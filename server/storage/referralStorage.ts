import {
    friendReferrals,
    profiles,
    type FriendReferral
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and } from "drizzle-orm";

export class ReferralStorage {
    async createReferralCode(userId: string): Promise<any> {
        let referralCode = "";
        let isUnique = false;

        while (!isUnique) {
            referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
            const existing = await db.select().from(friendReferrals).where(eq(friendReferrals.referralCode, referralCode));
            if (existing.length === 0) isUnique = true;
        }

        const [referral] = await db.insert(friendReferrals).values({
            referrerId: userId,
            referralCode,
            isUsed: false,
            rewardsClaimed: false
        }).returning();

        return referral;
    }

    async getUserReferralCode(userId: string): Promise<FriendReferral | undefined> {
        const [referral] = await db.select().from(friendReferrals).where(eq(friendReferrals.referrerId, userId));
        return referral;
    }

    async useReferralCode(code: string, newUserId: string): Promise<FriendReferral | null> {
        const [referral] = await db.select().from(friendReferrals).where(
            and(
                eq(friendReferrals.referralCode, code),
                eq(friendReferrals.isUsed, false)
            )
        );

        if (!referral || referral.referrerId === newUserId) return null;

        const [updatedReferral] = await db.update(friendReferrals).set({
            referredId: newUserId,
            isUsed: true
        }).where(eq(friendReferrals.id, referral.id)).returning();

        // Referrer rewards (3 tickets)
        const [referrer] = await db.select().from(profiles).where(eq(profiles.id, referral.referrerId));
        if (referrer) {
            await db.update(profiles).set({
                availableLotteryTickets: (referrer.availableLotteryTickets || 0) + 3,
                updatedAt: new Date()
            }).where(eq(profiles.id, referral.referrerId));
        }

        // New user rewards (5 tickets)
        const [referredUser] = await db.select().from(profiles).where(eq(profiles.id, newUserId));
        if (referredUser) {
            await db.update(profiles).set({
                availableLotteryTickets: (referredUser.availableLotteryTickets || 0) + 5,
                updatedAt: new Date()
            }).where(eq(profiles.id, newUserId));
        }

        return updatedReferral;
    }

    async claimReferralRewards(referralId: number): Promise<void> {
        await db.update(friendReferrals).set({ rewardsClaimed: true }).where(eq(friendReferrals.id, referralId));
    }

    async getUserReferrals(userId: string): Promise<FriendReferral[]> {
        return await db.select().from(friendReferrals).where(eq(friendReferrals.referrerId, userId)).orderBy(desc(friendReferrals.createdAt));
    }
}
