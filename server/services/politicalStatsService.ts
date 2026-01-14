import { db } from "../db.js";
import { politicalStats, surveys, surveyQuestions, surveyResponses, profiles } from "../../shared/schema.js";
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

        // 3. Fetch Responses joined with Profiles for demographic info
        const responsesWithProfiles = await db.select({
            response: surveyResponses,
            profile: profiles
        })
            .from(surveyResponses)
            .leftJoin(profiles, eq(surveyResponses.userId, profiles.id))
            .where(eq(surveyResponses.surveyId, surveyId));

        if (responsesWithProfiles.length === 0) {
            console.warn(`[Stats] No responses for survey ${surveyId}`);
            return;
        }

        // Total Teilnehmer (unique users?) - simple for now
        const totalParticipants = new Set(responsesWithProfiles.map((r: any) => r.response.userId).filter(Boolean)).size || 1;

        // Initialize Breakdown Objects
        // Structure: breakdowns[dimension][value][metric] = percent
        const genderBreakdown: any = {};
        const ageBreakdown: any = {};
        const regionBreakdown: any = {};

        const DIMENSIONS = [
            { key: 'gender', target: genderBreakdown },
            { key: 'ageGroup', target: ageBreakdown },
            { key: 'region', target: regionBreakdown }
        ];

        // 4. Processing logic
        const q1 = questions.find((q: any) => q.order === 1); // Presidential
        const q2 = questions.find((q: any) => q.order === 2); // Parties
        const q3 = questions.find((q: any) => q.order === 3); // Priorities

        // Helper to extract answer label
        const getLabel = (ans: any) => {
            if (typeof ans === 'object' && ans !== null) {
                return ans.choice || ans.text || ans.answer;
            }
            return ans;
        };

        // --- Calculate TOTALS ---
        const calcTotals = (questionId: number | undefined) => {
            if (!questionId) return {};
            const qResponses = responsesWithProfiles.filter((r: any) => r.response.questionId === questionId);
            const counts: Record<string, number> = {};
            qResponses.forEach((r: any) => {
                const label = getLabel(r.response.answer);
                if (label) counts[label] = (counts[label] || 0) + 1;
            });
            const total = qResponses.length || 1;
            const percentages: Record<string, number> = {};
            Object.entries(counts).forEach(([k, v]) => {
                percentages[k] = Math.round((v / total) * 100);
            });
            return { percentages, raw: counts };
        };

        const presidentialTotal = calcTotals(q1?.id);
        const partiesTotal = calcTotals(q2?.id);
        const candidatesTotal = calcTotals(q3?.id);

        // --- Calculate BREAKDOWNS ---
        DIMENSIONS.forEach(dim => {
            const groups: Record<string, any[]> = {};
            responsesWithProfiles.forEach((r: any) => {
                // @ts-ignore
                const val = r.profile?.[dim.key] || 'Unknown';
                if (!groups[val]) groups[val] = [];
                groups[val].push(r);
            });

            Object.entries(groups).forEach(([groupVal, groupResponses]) => {
                const results: any = { presidential: {}, parties: {}, priorities: {} };

                // Helper to calculate score for group
                const calcGroup = (questionId: number | undefined) => {
                    const qResponses = groupResponses.filter((r: any) => r.response.questionId === questionId);
                    const counts: Record<string, number> = {};
                    qResponses.forEach((r: any) => {
                        const label = getLabel(r.response.answer);
                        if (label) counts[label] = (counts[label] || 0) + 1;
                    });
                    const total = qResponses.length || 1;
                    const percentages: Record<string, number> = {};
                    Object.entries(counts).forEach(([k, v]) => {
                        percentages[k] = Math.round((v / total) * 100);
                    });
                    return percentages;
                };

                // Presidential Aggregate (Simplify to positive/negative/neutral)
                const pres = calcGroup(q1?.id);
                results.presidential = {
                    positive: Object.entries(pres).filter(([k]) => k.includes('잘하고')).reduce((a, b) => a + b[1], 0),
                    negative: Object.entries(pres).filter(([k]) => k.includes('잘못하고')).reduce((a, b) => a + b[1], 0),
                    neutral: Object.entries(pres).filter(([k]) => !k.includes('잘하고') && !k.includes('잘못하고')).reduce((a, b) => a + b[1], 0)
                };

                results.parties = calcGroup(q2?.id);
                results.priorities = calcGroup(q3?.id);

                dim.target[groupVal] = results;
            });
        });

        // 5. Generate Week Label
        let weekLabel = "Unknown";
        const titleMatch = survey.title.match(/(\d+년\s*\d+월\s*\d+주차)/);
        if (titleMatch) {
            weekLabel = titleMatch[1];
        } else {
            const d = new Date(survey.createdAt);
            weekLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 W${Math.ceil(d.getDate() / 7)}`;
        }

        // Final structured data
        const statsToSave = {
            surveyId,
            weekLabel,
            presidential: {
                positive: Object.entries(presidentialTotal.percentages || {}).filter(([k]) => k.includes('잘하고')).reduce((a, b) => a + b[1], 0),
                negative: Object.entries(presidentialTotal.percentages || {}).filter(([k]) => k.includes('잘못하고')).reduce((a, b) => a + b[1], 0),
                neutral: Object.entries(presidentialTotal.percentages || {}).filter(([k]) => !k.includes('잘하고') && !k.includes('잘못하고')).reduce((a, b) => a + b[1], 0)
            },
            parties: partiesTotal.percentages,
            priorities: candidatesTotal.percentages,
            genderBreakdown,
            ageBreakdown,
            regionBreakdown,
            totalParticipants,
            updatedAt: new Date()
        };

        // 6. Upsert to DB
        const existingStats = await db.select().from(politicalStats).where(eq(politicalStats.surveyId, surveyId));

        if (existingStats.length > 0) {
            await db.update(politicalStats)
                .set(statsToSave)
                .where(eq(politicalStats.surveyId, surveyId));
        } else {
            await db.insert(politicalStats).values(statsToSave as any);
        }
        console.log(`[Stats] Aggregated ${weekLabel} with breakdowns (ID: ${surveyId})`);

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

