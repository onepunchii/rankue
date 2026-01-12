import { db } from "../db";
import {
    surveys, surveyQuestions, surveyResponses, userSurveyParticipation,
    type Survey, type InsertSurvey, type SurveyQuestion, type InsertSurveyQuestion,
    type SurveyResponse, type InsertSurveyResponse, type UserSurveyParticipation,
    type InsertUserSurveyParticipation
} from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";

export class SurveyStorage {
    async getSurveys(category?: string): Promise<Survey[]> {
        let query = db.select().from(surveys).where(eq(surveys.isActive, true)).orderBy(desc(surveys.createdAt));
        if (category) {
            return await db.select().from(surveys).where(and(eq(surveys.isActive, true), eq(surveys.category, category))).orderBy(desc(surveys.createdAt));
        }
        return await query;
    }

    async getSurveysPaginated(page: number, limit: number, sortBy: 'recent' | 'timeLeft' = 'recent'): Promise<{ surveys: Survey[]; total: number }> {
        const offset = (page - 1) * limit;

        const [totalCount] = await db.select({ count: sql<number>`count(*)` }).from(surveys).where(eq(surveys.isActive, true));

        let query = db.select().from(surveys).where(eq(surveys.isActive, true));

        if (sortBy === 'timeLeft') {
            query = query.orderBy(surveys.votingEndDate);
        } else {
            query = query.orderBy(desc(surveys.createdAt));
        }

        const data = await query.limit(limit).offset(offset);

        return {
            surveys: data,
            total: Number(totalCount.count)
        };
    }

    async getSurvey(id: number): Promise<Survey | undefined> {
        const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
        return survey;
    }

    async createSurvey(surveyData: InsertSurvey): Promise<Survey> {
        const [newSurvey] = await db.insert(surveys).values(surveyData).returning();
        return newSurvey;
    }

    async getSurveyWithQuestions(id: number): Promise<(Survey & { questions: SurveyQuestion[] }) | undefined> {
        const survey = await this.getSurvey(id);
        if (!survey) return undefined;

        const questions = await this.getSurveyQuestions(id);
        return { ...survey, questions };
    }

    async createSurveyQuestion(questionData: InsertSurveyQuestion): Promise<SurveyQuestion> {
        const [newQuestion] = await db.insert(surveyQuestions).values(questionData).returning();
        return newQuestion;
    }

    async getSurveyQuestions(surveyId: number): Promise<SurveyQuestion[]> {
        return await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(surveyQuestions.order);
    }

    async createSurveyResponse(responseData: InsertSurveyResponse): Promise<SurveyResponse> {
        const [response] = await db.insert(surveyResponses).values(responseData).returning();
        return response;
    }

    async getSurveyResponses(surveyId: number): Promise<SurveyResponse[]> {
        return await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId));
    }

    async createParticipation(participationData: InsertUserSurveyParticipation): Promise<UserSurveyParticipation> {
        const [participation] = await db.insert(userSurveyParticipation).values(participationData).returning();

        // 참여자 수 증가
        await db.update(surveys)
            .set({ participantCount: sql`${surveys.participantCount} + 1` })
            .where(eq(surveys.id, Number(participationData.surveyId)));

        return participation;
    }

    async getUserParticipation(userId: string, surveyId: number): Promise<UserSurveyParticipation | undefined> {
        const [participation] = await db.select().from(userSurveyParticipation)
            .where(and(eq(userSurveyParticipation.userId, userId), eq(userSurveyParticipation.surveyId, surveyId)));
        return participation;
    }

    async getUserParticipations(userId: string): Promise<any[]> {
        // Optimized: Only select necessary fields (surveyId, completedAt) instead of full join
        // This dramatically reduces payload size and query time for the home page
        const rows = await db.select({
            surveyId: userSurveyParticipation.surveyId,
            completedAt: userSurveyParticipation.completedAt
        })
            .from(userSurveyParticipation)
            .where(eq(userSurveyParticipation.userId, userId))
            .orderBy(desc(userSurveyParticipation.completedAt))
        // Limit recent history if needed, but for now just removing the heavy JOIN is a big win
        //.limit(500); 

        return rows;
    }

    async getSurveyStats(surveyId: number): Promise<{ totalParticipants: number }> {
        const [survey] = await db.select({ totalParticipants: surveys.participantCount }).from(surveys).where(eq(surveys.id, surveyId));
        return { totalParticipants: survey?.totalParticipants || 0 };
    }

    async getTodayParticipantCount(): Promise<number> {
        try {
            // KST 기준 오늘 00:00 계산
            // 현재 시간을 UTC로 가져온 후 9시간을 더해 KST로 변환
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const kstOffset = 9 * 60 * 60 * 1000;
            const kstNow = new Date(utc + kstOffset);

            // KST 기준 0시 0분 0초 설정
            kstNow.setHours(0, 0, 0, 0);

            // 다시 UTC로 변환하여 DB 쿼리에 사용 (DB는 UTC 저장 가정)
            const kstStartOfDayInUtc = new Date(kstNow.getTime() - kstOffset);

            console.log(`[Storage] Counting stats from KST start: ${kstNow.toISOString()} (UTC equivalent: ${kstStartOfDayInUtc.toISOString()})`);

            const results = await db.select({
                count: sql<number>`cast(count(*) as integer)`
            })
                .from(userSurveyParticipation)
                .where(gte(userSurveyParticipation.completedAt, kstStartOfDayInUtc));

            const count = results[0]?.count || 0;
            console.log(`[Storage] Today's participant count: ${count}`);
            return Number(count);
        } catch (error) {
            console.error("[Storage] Error counting today's participants:", error);
            return 0;
        }
    }

    async getPopularSurveys(limit = 10): Promise<Survey[]> {
        return await db.select().from(surveys).where(eq(surveys.isActive, true)).orderBy(desc(surveys.participantCount)).limit(limit);
    }

    async getUserCreatedSurveys(userId: string): Promise<Survey[]> {
        return await db.select().from(surveys).where(eq(surveys.createdBy, userId)).orderBy(desc(surveys.createdAt));
    }

    async getCategoryCounts(): Promise<Record<string, number>> {
        const results = await db.select({
            category: surveys.category,
            count: sql<number>`count(*)`
        }).from(surveys).where(eq(surveys.isActive, true)).groupBy(surveys.category);

        const counts: Record<string, number> = {};
        results.forEach((r: { category: string; count: number }) => {
            counts[r.category] = Number(r.count);
        });
        return counts;
    }
}
