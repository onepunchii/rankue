import { storage } from "../storage";
import { generateSurveyFromNews } from "../ai";
import { db } from "../db";
import { surveys, surveyQuestions, newsArticles } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export async function generateAutoSurvey(articleUrl: string) {
    try {
        console.log(`[AutoSurvey] Attempting to generate survey for: ${articleUrl}`);

        // 1. Article 정보 가져오기
        const [article] = await db.select().from(newsArticles).where(eq(newsArticles.url, articleUrl)).limit(1);
        if (!article) {
            console.warn(`[AutoSurvey] Article not found in DB: ${articleUrl}`);
            return;
        }

        // 2. 이미 이 기사로 설문이 생성되었는지 확인 (제목이나 설명을 통해 체크 가능하지만, 기사 내용에 마킹하는게 가장 확실)
        // 현재 news_articles 테이블에 surveyId 필드가 없으므로, 설문 제목에 기사 제목이 포함되는지 등으로 체크하거나
        // 간단하게 같은 카테고리에 오늘 생성된 설문이 있는지 체크 (너무 자주 생성되는 것 방지)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existingSurveys = await db.select().from(surveys)
            .where(and(
                eq(surveys.category, mapNewsCategoryToSurveyCategory(article.category || '기타')),
                gte(surveys.createdAt, today)
            ))
            .limit(1);

        if (existingSurveys.length > 0) {
            console.log(`[AutoSurvey] Survey for category ${article.category} already created today. Skipping.`);
            return;
        }

        // 3. AI를 통한 설문 생성
        console.log(`[AutoSurvey] Generating AI survey for: ${article.title}`);
        const generated = await generateSurveyFromNews(article.title, article.content || '');

        // 4. 설문 저장
        console.log(`[AutoSurvey] Saving generated survey: ${generated.title}`);

        // 투표 종료일은 7일 후로 설정
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);

        const [newSurvey] = await db.insert(surveys).values({
            title: generated.title,
            description: generated.description,
            category: mapNewsCategoryToSurveyCategory(article.category || '기타'),
            isActive: true,
            experienceReward: 20,
            personalPointsReward: 10,
            votingStartDate: new Date(),
            votingEndDate: endDate,
            // 풍성한 AI 분석 데이터 저장
            aiAnalysisSummary: generated.analysis.summary,
            aiAnalysisPros: generated.analysis.pros,
            aiAnalysisCons: generated.analysis.cons,
            aiAnalysisKeywords: generated.analysis.keywords,
            aiAnalysisOneLiner: generated.analysis.oneLiner,
            // slug는 나중에 자동 생성되거나 타이틀 기반으로 생성
            slug: `auto-${Date.now()}`
        }).returning();

        // 5. 질문 저장
        for (let i = 0; i < generated.questions.length; i++) {
            const q = generated.questions[i];
            await db.insert(surveyQuestions).values({
                surveyId: newSurvey.id,
                question: q.question,
                type: q.type,
                options: q.options,
                isRequired: true,
                order: i + 1
            });
        }

        console.log(`✅ [AutoSurvey] Successfully created survey (ID: ${newSurvey.id}) for article: ${article.title}`);
        return newSurvey;

    } catch (error) {
        console.error(`❌ [AutoSurvey] Error generating survey for ${articleUrl}:`, error);
    }
}

/**
 * 뉴스 카테고리를 설문 카테고리로 매핑
 */
function mapNewsCategoryToSurveyCategory(newsCat: string): string {
    const mapping: Record<string, string> = {
        '정치': 'politics',
        '경제': 'economy',
        '사회': 'social',
        '생활/문화': 'life',
        '세계': 'international',
        'IT/과학': 'tech',
        '랭킹': 'ranking'
    };
    return mapping[newsCat] || 'general';
}
