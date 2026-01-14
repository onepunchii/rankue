// This file is temporarily disabled due to schema mismatch with @shared/schema.
// The personalityAnalyses table definition is missing in the shared schema.

/*
import {
    personalityAnalyses,
    surveyResponses,
    type PersonalityAnalysis,
    type InsertPersonalityAnalysis
} from "../../shared/schema.js";
import { db } from "../db";
import { eq, desc, and, count, gte, lt, sql } from "drizzle-orm";

export class PersonalityStorage {
    async createAnalysis(data: InsertPersonalityAnalysis): Promise<PersonalityAnalysis> {
        const [analysis] = await db.insert(personalityAnalyses)
            .values(data)
            .returning();
        return analysis;
    }

    async getLatestAnalysis(userId: string): Promise<PersonalityAnalysis | undefined> {
        const [analysis] = await db.select()
            .from(personalityAnalyses)
            .where(eq(personalityAnalyses.userId, userId))
            .orderBy(desc(personalityAnalyses.createdAt))
            .limit(1);
        return analysis;
    }
}
*/
