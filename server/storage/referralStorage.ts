// This file is temporarily disabled due to schema mismatch with @shared/schema.
// The friendReferrals table definition is missing in the shared schema.

/*
import {
    friendReferrals,
    profiles,
    type FriendReferral
} from "../../shared/schema.js";
import { db } from "../db";
import { eq, desc, and } from "drizzle-orm";

export class FriendReferralStorage {
    async createReferral(referrerId: string, refereeId: string): Promise<FriendReferral> {
        const [referral] = await db.insert(friendReferrals)
            .values({
                referrerId,
                refereeId,
                status: 'pending'
            })
            .returning();
        return referral;
    }

    async getReferralsByReferrer(referrerId: string): Promise<FriendReferral[]> {
        return db.select()
            .from(friendReferrals)
            .where(eq(friendReferrals.referrerId, referrerId))
            .orderBy(desc(friendReferrals.createdAt));
    }

    async completeReferral(id: number): Promise<FriendReferral> {
        const [referral] = await db.update(friendReferrals)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(friendReferrals.id, id))
            .returning();
        return referral;
    }
}
*/
