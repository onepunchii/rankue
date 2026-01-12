import { db } from "../db";
import { politicalStats, surveys, surveyQuestions, surveyResponses } from "@shared/schema";
import { eq, and, like, desc, gte, lte } from "drizzle-orm";

type SurveyResponseInfo = typeof surveyResponses.$inferSelect;
type SurveyQuestionInfo = typeof surveyQuestions.$inferSelect;

export async function aggregatePoliticalStats(surveyId: number): Promise<void> {
    try {
        console.log(`[Stats] Aggregating stats for survey ${surveyId}...`);

        // 1. Fetch Survey Info
        const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId));
        if (!survey) {
            console.error(`[Stats] Survey ${surveyId} not found.`);
            return;
        }

        // Validate it's a political survey
        if (survey.category !== 'politics') {
            console.warn(`[Stats] Skipping aggregation for non-politics survey ${surveyId}`);
            return;
        }

        // 2. Fetch Questions
        const questions = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(surveyQuestions.order);

        // 3. Fetch Responses
        const responses = await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId));

        // Count distinct users? (userId can be null for anonymous, use simple length for now or set)
        const totalParticipants = responses.length; // Simplified for now

        // Initialize Result Objects
        const presidential: any = {};
        const parties: any = {};
        const candidates: any = {};

        // Helper to count frequencies
        const countResponses = (qResponses: SurveyResponseInfo[]) => {
            const counts: Record<string, number> = {};
            qResponses.forEach((r) => {
                let ans = r.answer;
                if (typeof ans === 'object' && ans !== null) {
                    // @ts-ignore - JSON handling
                    ans = ans.choice || ans.text || ans.answer;
                }
                if (typeof ans === 'string') {
                    counts[ans] = (counts[ans] || 0) + 1;
                }
            });
            return counts;
        };

        // Q1: Presidential (Order 1) logic
        const q1 = questions.find((q: SurveyQuestionInfo) => q.order === 1);
        if (q1) {
            const q1Responses = responses.filter((r) => r.questionId === q1.id);
            const counts = countResponses(q1Responses);
            const total = q1Responses.length || 1;

            let positive = 0;
            let negative = 0;
            let neutral = 0;

            Object.entries(counts).forEach(([label, count]) => {
                if (label.includes('잘하고')) positive += count;
                else if (label.includes('잘못하고')) negative += count;
                else neutral += count;
            });

            presidential.positive = Math.round((positive / total) * 100);
            presidential.negative = Math.round((negative / total) * 100);
            presidential.neutral = Math.round((neutral / total) * 100);
            presidential.raw = counts;
        }

        // Q2: Parties (Order 2)
        const q2 = questions.find((q: SurveyQuestionInfo) => q.order === 2);
        if (q2) {
            const q2Responses = responses.filter((r) => r.questionId === q2.id);
            const counts = countResponses(q2Responses);
            const total = q2Responses.length || 1;

            Object.entries(counts).forEach(([party, count]) => {
                parties[party] = Math.round((count / total) * 100);
            });
        }

        // Q3: Candidates (Order 3)
        const q3 = questions.find((q: SurveyQuestionInfo) => q.order === 3);
        if (q3) {
            const q3Responses = responses.filter((r) => r.questionId === q3.id);
            const counts = countResponses(q3Responses);
            const total = q3Responses.length || 1;

            Object.entries(counts).forEach(([candidate, count]) => {
                candidates[candidate] = Math.round((count / total) * 100);
            });
        }

        // 4. Generate Weak Label
        let weekLabel = "Unknown";
        const titleMatch = survey.title.match(/(\d+년\s*\d+월\s*\d+주차)/);
        if (titleMatch) {
            weekLabel = titleMatch[1];
        } else {
            const d = new Date(survey.createdAt);
            weekLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 W${Math.ceil(d.getDate() / 7)}`;
        }

        // 5. Upsert to DB
        const existingStats = await db.select().from(politicalStats).where(eq(politicalStats.surveyId, surveyId));

        if (existingStats.length > 0) {
            await db.update(politicalStats)
                .set({
                    presidential,
                    parties,
                    candidates,
                    totalParticipants,
                    weekLabel,
                    updatedAt: new Date()
                })
                .where(eq(politicalStats.surveyId, surveyId));
        } else {
            await db.insert(politicalStats).values({
                surveyId,
                weekLabel,
                presidential,
                parties,
                candidates,
                totalParticipants
            });
        }
        console.log(`[Stats] Aggregated ${weekLabel} (ID: ${surveyId})`);

    } catch (e) {
        console.error(`[Stats] Error aggregating survey ${surveyId}:`, e);
    }
}

export async function aggregateAllPastPoliticalSurveys() {
    console.log('[Stats] Starting full aggregation...');
    try {
        const politicalSurveys = await db.select().from(surveys)
            .where(and(
                eq(surveys.category, 'politics'),
                like(surveys.title, '%정기 여론조사%')
            ));

        console.log(`[Stats] Found ${politicalSurveys.length} political surveys to aggregate.`);
        for (const survey of politicalSurveys) {
            await aggregatePoliticalStats(survey.id);
        }
        console.log('[Stats] Full aggregation completed.');
    } catch (e) {
        console.error('[Stats] Full aggregation failed:', e);
    }
}
