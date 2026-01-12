import {
    quickPolls,
    quickPollVotes,
    surveys,
    type QuickPoll,
    type InsertQuickPoll,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, count, sql } from "drizzle-orm";

export class DiscussionStorage {
    async createQuickPoll(poll: InsertQuickPoll): Promise<QuickPoll> {
        const [newPoll] = await db.insert(quickPolls).values(poll).returning();
        return newPoll;
    }

    async getQuickPoll(pollId: number): Promise<QuickPoll | undefined> {
        const [poll] = await db.select().from(quickPolls).where(eq(quickPolls.id, pollId));
        return poll;
    }

    async voteQuickPoll(userId: string, pollId: number, optionId: number): Promise<{ success: boolean }> {
        const [existing] = await db.select().from(quickPollVotes).where(
            and(
                eq(quickPollVotes.userId, userId),
                eq(quickPollVotes.pollId, pollId)
            )
        );

        if (existing) throw new Error("이미 투표하셨습니다");

        await db.insert(quickPollVotes).values({ userId, pollId, optionId });
        await db.update(quickPolls).set({ voteCount: sql`${quickPolls.voteCount} + 1` }).where(eq(quickPolls.id, pollId));
        return { success: true };
    }

    async searchContent(query: string, types: string[]): Promise<any> {
        const results: any = {};
        if (types.includes("surveys")) {
            results.surveys = await db.select().from(surveys).where(and(eq(surveys.isActive, true), sql`${surveys.title} ILIKE ${'%' + query + '%'}`)).limit(10);
        }
        return results;
    }
}
