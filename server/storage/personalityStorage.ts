import {
    personalityAnalyses,
    profiles,
    surveys,
    userSurveyParticipation,
    surveyResponses,
    type PersonalityAnalysis,
    type InsertPersonalityAnalysis
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, count, gte, lt, sql } from "drizzle-orm";

export class PersonalityStorage {
    async getUserPersonalityData(userId: string) {
        const [userCreatedSurveys, userResponses, participations] = await Promise.all([
            db.select().from(surveys).where(eq(surveys.createdBy, userId)).orderBy(desc(surveys.createdAt)),
            db.select().from(surveyResponses).where(eq(surveyResponses.userId, userId)),
            db.select({
                participation: userSurveyParticipation,
                survey: surveys
            }).from(userSurveyParticipation)
                .leftJoin(surveys, eq(userSurveyParticipation.surveyId, surveys.id))
                .where(eq(userSurveyParticipation.userId, userId))
        ]);

        return {
            createdSurveys: userCreatedSurveys,
            surveyResponses: userResponses,
            participations: participations.map((p: any) => ({
                ...p.participation,
                survey: p.survey || undefined
            }))
        };
    }

    async checkPersonalityAnalysisEligibility(userId: string) {
        const [createdSurveys, participations] = await Promise.all([
            db.select().from(surveys).where(eq(surveys.createdBy, userId)),
            db.select().from(userSurveyParticipation).where(eq(userSurveyParticipation.userId, userId))
        ]);

        const totalActivities = createdSurveys.length + participations.length;
        const milestones = [10, 50, 100];

        let currentMilestone = 0;
        let analysisLevel: 'basic' | 'advanced' | 'comprehensive' | null = null;
        let isEligible = false;

        if (totalActivities >= 10) {
            isEligible = true;
            currentMilestone = 10;
            analysisLevel = "basic";
            if (totalActivities >= 50) {
                currentMilestone = 50;
                analysisLevel = "advanced";
            }
            if (totalActivities >= 100) {
                currentMilestone = 100;
                analysisLevel = "comprehensive";
            }
        }

        let nextAnalysisAt = 10;
        if (totalActivities >= 100) nextAnalysisAt = totalActivities;
        else if (totalActivities >= 50) nextAnalysisAt = 100;
        else if (totalActivities >= 10) nextAnalysisAt = 50;
        else nextAnalysisAt = 10;

        return {
            isEligible,
            totalActivities,
            createdSurveys: createdSurveys.length,
            participations: participations.length,
            nextAnalysisAt,
            currentMilestone,
            analysisLevel
        };
    }

    async getCachedPersonalityAnalysis(userId: string): Promise<PersonalityAnalysis | undefined> {
        const [analysis] = await db.select().from(personalityAnalyses)
            .where(eq(personalityAnalyses.userId, userId))
            .orderBy(desc(personalityAnalyses.createdAt))
            .limit(1);
        return analysis;
    }

    async savePersonalityAnalysis(userId: string, analysisData: any, activityCount: number, analysisLevel: string): Promise<PersonalityAnalysis> {
        const [analysis] = await db.insert(personalityAnalyses).values({
            userId,
            analysisData,
            activityCount,
            analysisLevel
        } as any).returning();
        return analysis;
    }

    async shouldUpdatePersonalityAnalysis(userId: string, currentActivityCount: number): Promise<boolean> {
        const cachedAnalysis = await this.getCachedPersonalityAnalysis(userId);
        if (!cachedAnalysis) return true;

        const activityIncrease = currentActivityCount - cachedAnalysis.activityCount;
        if (activityIncrease >= 10) return true;

        if (cachedAnalysis.createdAt) {
            const daysSinceAnalysis = (Date.now() - new Date(cachedAnalysis.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceAnalysis >= 7) return true;
        }

        return false;
    }
}
