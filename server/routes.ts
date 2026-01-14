import { generateBalanceGameFromNews } from "./services/balanceGameGenerator.js";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { userSurveyParticipation, surveys, profiles, newsArticles, quickPolls, quickPollVotes, lotteryDraws, surveyQuestions, surveyResponses, politicalStats } from "../shared/schema.js";
import { eq, and, sql, desc, like, gte, lte } from "drizzle-orm";
import { upload } from "./uploads.js";
import express from "express";
import { insertSurveySchema, insertSurveyQuestionSchema, insertSurveyResponseSchema } from "../shared/schema.js";
import { analyzeNews, crawlNewsContent, searchNews } from "./newsAnalyzer.js";
import { analyzeUserPersonality } from "./ai.js";
import { syncNews } from "./services/newsService.js";
import { z } from "zod";
import { registerAdminRoutes } from "./adminRoutes.js";
import { registerAssemblyRoutes } from "./assemblyRoutes.js";
import { registerLocalCouncilRoutes } from "./localCouncilRoutes.js";
import { authenticateUser, handleGetProfile } from "./auth.js";
import { simpleAuthStorage, requireAuth } from "./simpleAuth.js";
import { politicianRoutes } from "./politicianRoutes.js";
import brainRouter from "./brainRoutes.js";

function getUserId(req: any): string | null {
  return req.user?.id || req.body?.userId || null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== 라우터 등록 시작 (Supabase Integration) ===");

  // 1. Auth & Profiles
  app.get("/api/auth/profile", authenticateUser, handleGetProfile);

  // Simple Auth Profile Endpoint (Used by Client AuthContext)
  app.get("/api/auth/me", (req: any, res) => {
    if (req.user) {
      res.json(req.user);
    } else {
      res.json({ isGuest: true, isAuthenticated: false });
    }
  });

  app.patch("/api/user/profile", authenticateUser, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log(`[API] PATCH /api/user/profile for ${userId}. Body:`, JSON.stringify(req.body, null, 2));
      const updated = await simpleAuthStorage.updateUser(userId, req.body);
      console.log('✅ Update User Result:', JSON.stringify(updated, null, 2));
      res.json({ success: true, updatedFields: updated });
    } catch (error) {
      res.status(500).json({ message: "프로필 업데이트 실패" });
    }
  });

  app.post("/api/user/avatar", authenticateUser, upload.single("avatar"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const userId = req.user.id;
      const fileUrl = `/uploads/${req.file.filename}`;

      await simpleAuthStorage.updateUser(userId, { profileImageUrl: fileUrl });
      res.json({ success: true, url: fileUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ message: "Avatar upload failed" });
    }
  });

  // User Participations Endpoint
  app.get("/api/auth/user/participations", authenticateUser, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const participations = await storage.getUserParticipations(userId);
      res.json(participations);
    } catch (error) {
      console.error('Error fetching user participations:', error);
      res.status(500).json({ message: "참여 내역 조회 실패" });
    }
  });

  // 2. News Analysis (Mind Translation)
  app.get('/api/news', async (req, res) => {
    console.log("[API] /api/news called - fetching from DB...");
    try {
      const category = req.query.category as string || '전체';
      const searchQuery = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 50;

      let articles: any[] = [];

      // 1. Polli 특화 카테고리 필터링 로직
      if (category === '전체') {
        const rankingNews = await storage.getLatestNewsArticles(10, '랭킹', searchQuery);
        const coreNews = await storage.getLatestNewsArticles(limit - rankingNews.length, undefined, searchQuery);

        // 중복 제거 및 합치기 (랭킹 우선)
        const seenUrls = new Set(rankingNews.map(a => a.url));
        articles = [...rankingNews, ...coreNews.filter(a => !seenUrls.has(a.url))].slice(0, limit);
      } else if (category === '기타') {
        // 생활/문화, IT/과학, 세계 통합
        const otherCategories = ['생활/문화', 'IT/과학', '세계'];
        const results = await Promise.all(otherCategories.map(c => storage.getLatestNewsArticles(20, c, searchQuery)));
        articles = results.flat().sort((a, b) => {
          const dateA = a.publishedAt?.getTime() || a.createdAt?.getTime() || 0;
          const dateB = b.publishedAt?.getTime() || b.createdAt?.getTime() || 0;
          return dateB - dateA;
        }).slice(0, limit);
      } else if (category === '토론') {
        // AI 분석(mindTranslation)이 완료된 기사 = 토론 가치가 높은 기사
        // storage 메서드에 filter 옵션이 없으므로 직접 DB 쿼리하거나 필터링
        const allLatest = await storage.getLatestNewsArticles(100, undefined, searchQuery);
        articles = allLatest.filter(a => !!a.mindTranslation).slice(0, limit);
      } else {
        // 일반 섹션 (정치, 경제, 사회, 랭킹)
        articles = await storage.getLatestNewsArticles(limit, category, searchQuery);
      }

      // 2. 만약 DB에 데이터가 없고 검색어가 없다면 동기화 실행 (전체 탭일 때만)
      if (articles.length === 0 && !searchQuery && category === '전체') {
        console.log("[API] No news in DB, triggering sync...");
        await syncNews();
        articles = await storage.getLatestNewsArticles(limit, '전체');
      }

      // 프런트엔드 호환성을 위해 필드 매핑
      const formattedNews = articles.map(article => {
        // 내용이 메뉴 텍스트인지 확인
        const isJunkContent = article.content?.includes('* [언론사별]') || article.content?.includes('## 이슈 NOW');

        return {
          id: article.url,
          title: article.title,
          link: article.url,
          // 정크 데이터인 경우 설명을 비움 (클라이언트에서 처리하도록)
          description: isJunkContent ? "" : (article.content || ""),
          pubDate: article.publishedAt?.toISOString() || article.createdAt?.toISOString(),
          imageUrl: article.imageUrl,
          category: article.category,
          provider: '네이버 뉴스',
          hasAnalysis: !!article.mindTranslation
        };
      });

      res.json(formattedNews);
    } catch (error) {
      console.error("News fetch error:", error);
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.get('/api/news/search', async (req, res) => {
    const keyword = req.query.query as string;
    if (!keyword) return res.status(400).json({ message: "Keyword required" });
    const items = await searchNews(keyword);
    res.json(items);
  });

  app.post('/api/news/content', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "URL required" });

    try {
      // 1. DB (Supabase) Check - Fail safe
      const cached = await storage.getNewsAnalysis(url).catch(e => null);
      // 내용이 300자 미만이면 스니펫일 가능성이 높으므로 새로 크롤링
      if (cached?.content && cached.content.length > 300) return res.json({ content: cached.content });

      // 2. Crawl Content
      const content = await crawlNewsContent(url);

      // 3. Save to DB - Log Warning if fails but continue
      try {
        await storage.saveNewsAnalysis({ url, content, title: "" });
      } catch (dbError) {
        console.warn("⚠️ DB Storage Failed (Table missing?):", dbError);
      }

      res.json({ content });
    } catch (error) {
      console.error("Content Error:", error);
      res.status(500).json({ message: "Failed to load content" });
    }
  });

  app.post('/api/news/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "URL required" });

    try {
      const cached = await storage.getNewsAnalysis(url).catch(e => null);
      if (cached?.mindTranslation) return res.json(cached.mindTranslation);

      const result = await analyzeNews(url, cached?.content);
      if (!result) return res.status(500).json({ message: "Analysis failed" });

      try {
        await storage.saveNewsAnalysis({
          url,
          content: result.content,
          mindTranslation: result,
          // title 필드를 생략하여 원본 제목이 유지되도록 함
        });
      } catch (dbError) {
        console.warn("⚠️ DB Analysis Storage Failed:", dbError);
      }

      res.json(result);
    } catch (error) {
      console.error("Analysis Error:", error);
      res.status(500).json({ message: "AI Analysis failed" });
    }
  });

  // 3. Surveys
  app.get("/api/surveys", async (req, res) => {
    const surveys = await storage.getSurveys(req.query.category as string);
    res.json(surveys);
  });

  app.get("/api/surveys/paginated", async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string;
    const result = await storage.getSurveysPaginated(page, limit, category);
    res.json(result);
  });

  app.get("/api/surveys/popular", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 5;
    const surveys = await storage.getPopularSurveys(limit);
    res.json(surveys);
  });

  app.get("/api/surveys/category-counts", async (req, res) => {
    const counts = await storage.getCategoryCounts();
    res.json(counts);
  });

  app.get("/api/surveys/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const survey = await storage.getSurveyWithQuestions(id);
    if (!survey) return res.status(404).json({ message: "Not found" });
    res.json(survey);
  });

  app.post("/api/surveys/:id/participate", authenticateUser, async (req: any, res) => {
    const surveyId = parseInt(req.params.id);
    if (isNaN(surveyId)) return res.status(400).json({ message: "Invalid ID" });
    const userId = req.user.id;

    // Check for existing participation
    try {
      const existingParticipation = await storage.getUserParticipation(userId, surveyId);
      if (existingParticipation) {
        return res.status(400).json({ message: "이미 참여한 설문입니다.", code: "ALREADY_PARTICIPATED" });
      }

      // Fetch survey to get correct reward amount
      const survey = await storage.getSurvey(surveyId);
      const pointsEarned = survey?.experienceReward || 10;

      const participation = await storage.createParticipation({ userId, surveyId, pointsEarned });
      await storage.updateUserGameStats(userId, 20);
      res.status(201).json(participation);
    } catch (error: any) {
      if (error?.code === '23505' || error?.message?.includes('unique constraint')) {
        return res.status(400).json({ message: "이미 참여한 설문입니다.", code: "ALREADY_PARTICIPATED" });
      }
      throw error;
    }
  });

  app.post("/api/surveys/:id/responses", authenticateUser, async (req: any, res) => {
    const surveyId = parseInt(req.params.id);
    if (isNaN(surveyId)) return res.status(400).json({ message: "Invalid ID" });
    const userId = req.user.id;

    // Check for existing responses or participation
    const existingParticipation = await storage.getUserParticipation(userId, surveyId);
    if (existingParticipation) {
      return res.status(400).json({ message: "이미 응답을 제출한 설문입니다.", code: "ALREADY_RESPONDED" });
    }

    const { responses } = req.body;
    for (const r of responses) {
      await storage.createSurveyResponse({ ...r, surveyId, userId });
    }
    res.status(201).json({ success: true });
  });

  // --- Political Indicators Linked to Survey ---

  // Helper to calculate stats from survey (current week only)
  async function getSurveyQuestionStats(questionOrder: number) {
    // Calculate current week range (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const thisWeekMonday = new Date(now);
    thisWeekMonday.setDate(now.getDate() - daysFromMonday);
    thisWeekMonday.setHours(0, 0, 0, 0);

    const thisWeekSunday = new Date(thisWeekMonday);
    thisWeekSunday.setDate(thisWeekMonday.getDate() + 6);
    thisWeekSunday.setHours(23, 59, 59, 999);

    // Find current week's political survey only
    const [survey] = await db.select().from(surveys)
      .where(and(
        eq(surveys.category, 'politics'),
        like(surveys.title, '%정기 여론조사%'),
        gte(surveys.createdAt, thisWeekMonday),
        lte(surveys.createdAt, thisWeekSunday)
      ))
      .orderBy(desc(surveys.createdAt))
      .limit(1);

    if (!survey) {
      console.log(`[Indicators] No current week poll found.`);
      return [];
    }

    const [question] = await db.select().from(surveyQuestions)
      .where(and(eq(surveyQuestions.surveyId, survey.id), eq(surveyQuestions.order, questionOrder)));

    if (!question) {
      console.log(`[Indicators] Question order ${questionOrder} not found for survey ${survey.id}`);
      return [];
    }

    const responses = await storage.getSurveyResponses(survey.id);
    const qResponses = responses.filter(r => r.questionId === question.id);
    const totalResponses = qResponses.length;

    console.log(`[Indicators] Survey ${survey.id} (${survey.title}) Q${questionOrder} Stats: ${totalResponses} responses`);

    if (!question.options || !Array.isArray(question.options)) return [];

    return question.options.map((opt: string) => {
      const count = qResponses.filter(r => {
        const ans = r.answer;
        if (typeof ans === 'string') return ans === opt;
        if (typeof ans === 'object' && ans !== null) {
          // @ts-ignore
          return ans.choice === opt || ans.text === opt || ans.answer === opt;
        }
        return false;
      }).length;

      return {
        label: opt,
        value: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0,
        count,
        totalParticipants: totalResponses,
        // Previous data (mock for now, or fetch previous week survey)
        change: 0
      };
    });
  }

  // --- Middleware for Optional Auth ---
  // 헤더가 있으면 유저 확인, 없으면 통과 (비회원 조회용)
  async function checkUser(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    // Use existing module if possible, or naive implementation
    // For now, let's assuming importing authenticateUser logic or using a simple version
    // But since we can't easily import supabaseAdmin here without adding import
    // Let's modify authenticateUser import or use the storage
    // Actually, routes.ts doesn't import supabaseAdmin. 
    // Let's skip deep auth logic here and trust that if client sends token, it might be handled.
    // Wait, we need to decode it to know WHO it is for 'isParticipated' checks later.

    // Simpler approach: Just remove authenticateUser from the GET route. 
    // If the logical code inside needs req.user, it should check if it exists.
    // The previous implementation of /api/auth/politics-surveys didn't use req.user for filtering.
    // BUT front-end might rely on it implicitly? No.

    // However, if we want to show "My Participation Status", we need user info.
    // Let's rely on a loose check.

    next();
  }

  // Political Surveys Route (VIEW ONLY - Public access allowed)
  // Changed middleware from authenticateUser to allowing anonymous
  app.get("/api/auth/politics-surveys", checkUser, async (req: any, res) => {
    try {
      // Fetch all politics surveys directly from DB
      const allPoliticsSurveys = await db.select().from(surveys)
        .where(eq(surveys.category, 'politics'))
        .orderBy(desc(surveys.createdAt));

      console.log(`[API] Found ${allPoliticsSurveys.length} politics surveys total.`);
      // allPoliticsSurveys.forEach(s => console.log(` - ${s.id}: ${s.title} (${s.createdAt})`));

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const currentSurveys = allPoliticsSurveys.filter(s =>
        s.isActive &&
        new Date(s.votingEndDate!) > now &&
        new Date(s.createdAt) > oneWeekAgo
      );

      const pastSurveys = allPoliticsSurveys.filter(s =>
        !s.isActive ||
        new Date(s.votingEndDate!) <= now
      );

      res.json({
        currentSurveys,
        pastSurveys
      });
    } catch (error) {
      console.error("Failed to fetch politics surveys:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Politics Survey Results Route (VIEW ONLY - Public access allowed)
  app.get("/api/auth/politics-survey-results/:id", checkUser, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      if (isNaN(surveyId)) return res.status(400).json({ message: "Invalid ID" });

      const survey = await storage.getSurveyWithQuestions(surveyId);
      if (!survey) return res.status(404).json({ message: "Not found" });

      const questions = await storage.getSurveyQuestions(surveyId);
      const responses = await storage.getSurveyResponses(surveyId);

      // Unique participants count
      const participantIds = new Set(responses.map(r => r.userId).filter(Boolean));
      const totalParticipants = participantIds.size > 0 ? participantIds.size : responses.length > 0 ? 1 : 0;

      const questionResults = questions.map(q => {
        const qResponses = responses.filter(r => r.questionId === q.id);
        const totalResponses = qResponses.length;

        let optionStats: any[] = [];
        if (q.options && Array.isArray(q.options)) {
          optionStats = q.options.map(opt => {
            const count = qResponses.filter(r => {
              const ans = r.answer;
              if (typeof ans === 'string') return ans === opt;
              if (typeof ans === 'object' && ans !== null) {
                // @ts-ignore
                return ans.choice === opt || ans.text === opt || ans.answer === opt;
              }
              return false;
            }).length;

            return {
              option: opt,
              count: count,
              percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
            };
          });
        }

        return {
          questionId: q.id,
          question: q.question,
          type: q.type,
          totalResponses,
          optionStats
        };
      });

      res.json({
        survey: survey,
        totalParticipants,
        questionResults
      });

    } catch (error) {
      console.error("Detailed error fetching survey results:", error);
      res.status(500).json({ message: "Failed to fetch survey results" });
    }
  });
  app.get("/api/political/presidential-approval", async (req, res) => {
    try {
      const stats = await getSurveyQuestionStats(1); // Q1 is Approval
      // Transform to match chart format if needed
      // Assuming chart expects { approval: number, disassembly: number, ... } or list
      // Let's return list for now as frontend likely handles it
      res.json(stats);
    } catch (e) {
      res.status(500).json([]);
    }
  });

  app.get("/api/political/party-support", async (req, res) => {
    try {
      const stats = await getSurveyQuestionStats(2); // Q2 is Party
      res.json(stats);
    } catch (e) {
      res.status(500).json([]);
    }
  });

  // New API for Candidate Support
  app.get("/api/political/candidate-support", async (req, res) => {
    try {
      const stats = await getSurveyQuestionStats(3); // Q3 is Candidate
      res.json(stats);
    } catch (e) {
      res.status(500).json([]);
    }
  });

  // Candidate Search API
  app.get("/api/political/candidates/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.json([]);

    // Search in politicians/assembly members
    // ... logic to search members ...
    // For now return empty or simple mock to enable UI
    res.json([]);
  });

  // Get latest aggregated stats with breakdowns
  app.get("/api/political/current-stats", async (req, res) => {
    try {
      const [latest] = await db.select()
        .from(politicalStats)
        .innerJoin(surveys, eq(politicalStats.surveyId, surveys.id))
        .orderBy(desc(surveys.createdAt))
        .limit(1);

      if (!latest) return res.status(404).json({ message: "No stats found" });
      res.json(latest.political_stats);
    } catch (error) {
      console.error("Failed to fetch current stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Weekly Trends API - Returns aggregated data by week (excluding current week)
  app.get("/api/political/weekly-trends", async (req, res) => {
    try {
      const { gender, ageGroup, region } = req.query as Record<string, string>;

      // Optimally fetch from political_stats table
      const stats = await db.select({
        stats: politicalStats,
        createdAt: surveys.createdAt
      })
        .from(politicalStats)
        .innerJoin(surveys, eq(politicalStats.surveyId, surveys.id))
        .where(eq(surveys.category, 'politics'))
        .orderBy(surveys.createdAt);

      // Get current week to exclude it
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisWeekMonday = new Date(now);
      thisWeekMonday.setDate(now.getDate() - daysFromMonday);
      thisWeekMonday.setHours(0, 0, 0, 0);

      const pastStats = stats.filter((row: any) => {
        const surveyDate = new Date(row.createdAt);
        return surveyDate < thisWeekMonday;
      });

      const weeklyData: any = {
        presidential: [],
        party: [],
        priority: []
      };

      for (const row of pastStats) {
        const s = row.stats;
        const match = s.weekLabel.match(/(\d+)월\s*(\d+)주/);
        const displayLabel = match ? `${match[1]}월 ${match[2]}주` : s.weekLabel;

        // Determine which data to use (Total vs Breakdown)
        let pres: any = s.presidential;
        let partyObj: any = s.parties;
        let prioObj: any = s.priorities || s.candidates; // Fallback for old data

        if (gender && s.genderBreakdown && (s.genderBreakdown as any)[gender]) {
          const b = (s.genderBreakdown as any)[gender];
          pres = b.presidential || pres;
          partyObj = b.parties || partyObj;
          prioObj = b.priorities || b.candidates || prioObj;
        } else if (ageGroup && s.ageBreakdown && (s.ageBreakdown as any)[ageGroup]) {
          const b = (s.ageBreakdown as any)[ageGroup];
          pres = b.presidential || pres;
          partyObj = b.parties || partyObj;
          prioObj = b.priorities || b.candidates || prioObj;
        } else if (region && s.regionBreakdown && (s.regionBreakdown as any)[region]) {
          const b = (s.regionBreakdown as any)[region];
          pres = b.presidential || pres;
          partyObj = b.parties || partyObj;
          prioObj = b.priorities || b.candidates || prioObj;
        }

        // 1. Presidential
        weeklyData.presidential.push({
          week: displayLabel,
          긍정: pres.positive || 0,
          부정: pres.negative || 0,
          중립: pres.neutral || 0,
          참여자: s.totalParticipants,
          raw: s
        });

        // 2. Party
        const partyEntry: any = { week: displayLabel, 참여자: s.totalParticipants, raw: s };
        Object.assign(partyEntry, partyObj);
        weeklyData.party.push(partyEntry);

        // 3. Priority
        const prioEntry: any = { week: displayLabel, 참여자: s.totalParticipants, raw: s };
        Object.assign(prioEntry, prioObj);
        weeklyData.priority.push(prioEntry);
      }

      res.json(weeklyData);
    } catch (error) {
      console.error("Failed to fetch weekly trends:", error);
      res.status(500).json({ message: "Failed to fetch trends" });
    }
  });

  // Personality Analysis Endpoints
  const ANALYSIS_THRESHOLD = 3; // TODO: Revert to 10 after testing

  app.get("/api/auth/personality-eligibility", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const createdSurveys = await storage.getUserCreatedSurveys(userId);
      const participations = await storage.getUserParticipations(userId);

      const totalActivities = createdSurveys.length + participations.length;

      // Calculate next milestone
      let nextAnalysisAt = 10;
      if (totalActivities >= 100) nextAnalysisAt = 200; // Example
      else if (totalActivities >= 50) nextAnalysisAt = 100;
      else if (totalActivities >= 10) nextAnalysisAt = 50;

      // Determine analysis level
      let analysisLevel: any = null;
      if (totalActivities >= 100) analysisLevel = 'comprehensive';
      else if (totalActivities >= 50) analysisLevel = 'advanced';
      else if (totalActivities >= 10) analysisLevel = 'basic';

      res.json({
        isEligible: totalActivities >= ANALYSIS_THRESHOLD,
        totalActivities,
        createdSurveys: createdSurveys.length,
        participations: participations.length,
        nextAnalysisAt,
        currentMilestone: totalActivities,
        analysisLevel
      });
    } catch (e: any) {
      console.error("Error in eligibility check:", e);
      res.status(500).json({ message: "Failed to check eligibility" });
    }
  });

  app.get("/api/auth/personality-analysis", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const MILESTONES = [10, 50, 100, 150, 200, 300, 400, 500, 1000];

      // Fetch Data
      const createdSurveys = await storage.getUserCreatedSurveys(userId);
      const participations = await storage.getUserParticipations(userId);
      const totalActivities = createdSurveys.length + participations.length;

      // 1. Check Eligibility (Min 10)
      if (totalActivities < ANALYSIS_THRESHOLD) {
        return res.status(400).json({ message: "Not enough activities for analysis" });
      }

      // 2. Check if Update is Needed based on Milestones
      // Find the highest milestone currently achieved
      const currentMilestone = MILESTONES.slice().reverse().find(m => totalActivities >= m) || 0;

      // Get stored analysis meta
      // Refresh user from DB to ensure we have latest aiPersona
      const freshUser = await storage.getUser(userId);
      const storedAnalysis = freshUser?.aiPersona as any;
      const lastAnalyzedAtCount = storedAnalysis?.meta?.analyzedAtCount || 0;

      // Logic: Update ONLY if we entered a NEW milestone bracket that is higher than the last analyzed one
      // e.g. Current 12 (Milestone 10), Last 0 -> Update
      // e.g. Current 15 (Milestone 10), Last 12 (Milestone 10) -> Cached
      // e.g. Current 50 (Milestone 50), Last 12 (Milestone 10) -> Update
      const needsUpdate = currentMilestone > 0 &&
        ((!storedAnalysis || !storedAnalysis.profile) || // No data
          (currentMilestone > (MILESTONES.slice().reverse().find(m => lastAnalyzedAtCount >= m) || 0)) // New milestone
        );

      // Determine next milestone for UI
      const nextAnalysisAt = MILESTONES.find(m => m > totalActivities) || (totalActivities + 100);

      // Construct Eligibility Data
      const eligibility = {
        isEligible: true,
        totalActivities,
        createdSurveys: createdSurveys.length,
        participations: participations.length,
        nextAnalysisAt,
        currentMilestone,
        analysisLevel: totalActivities >= 100 ? 'comprehensive' : totalActivities >= 50 ? 'advanced' : 'basic'
      };

      if (!needsUpdate && storedAnalysis && storedAnalysis.profile) {
        // Return Cached Data
        console.log(`[Persona] Returning Cached Analysis for user ${userId} (Activities: ${totalActivities}, Analysis from: ${lastAnalyzedAtCount})`);
        return res.json({
          analysis: storedAnalysis,
          eligibility,
          cached: true
        });
      }

      console.log(`[Persona] Generating NEW Analysis for user ${userId} (Activities: ${totalActivities}, New Milestone: ${currentMilestone})`);

      // 3. Generate New Analyis
      // Fetch full context: Response + Question + Survey info
      const richUserResponses = await db.select({
        response: surveyResponses,
        question: surveyQuestions,
        survey: surveys
      })
        .from(surveyResponses)
        .innerJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
        .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
        .where(eq(surveyResponses.userId, userId));

      // Transform for AI consumption
      const formattedResponses = richUserResponses.map(r => ({
        surveyId: r.survey.id,
        title: r.survey.title,
        category: r.survey.category,
        question: r.question.question,
        questionType: r.question.type,
        answer: r.response.answer
      }));

      const newAnalysis = await analyzeUserPersonality(createdSurveys, formattedResponses, participations);

      // 4. Save to DB with Metadata
      const analysisToSave = {
        ...newAnalysis,
        meta: {
          analyzedAtCount: totalActivities,
          milestone: currentMilestone,
          generatedAt: new Date().toISOString()
        }
      };

      await storage.updateUser(userId, { aiPersona: analysisToSave });

      res.json({
        analysis: analysisToSave,
        eligibility,
        cached: false
      });

    } catch (e: any) {
      console.error("Error in personality analysis:", e);
      res.status(500).json({ message: "Failed to generate analysis" });
    }
  });

  app.get("/api/stats/today-participants", async (req, res) => {
    try {
      // Cache for 60 seconds (Client) / 60 seconds (CDN/Vercel) / Allow stale for 30s
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');

      const count = await storage.getTodayParticipantCount();
      console.log(`[Stats] Fetched: ${count} (Cached when possible)`);
      res.json({ count });
    } catch (error) {
      console.error("[Stats] Error fetching today's participants:", error);
      res.status(500).json({ count: 0, error: "Failed to fetch stats" });
    }
  });

  // 4. Quick Polls
  app.get("/api/quick-polls/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const poll = await storage.getQuickPoll(id);
    res.json(poll);
  });

  app.post("/api/quick-polls/:id/vote", authenticateUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const result = await storage.voteQuickPoll(req.user.id, id, req.body.optionId);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // 5. Lottery
  app.get("/api/lottery/today-draw", async (req, res) => {
    // Cache for 5 minutes as draw info rarely changes during the day
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    const draw = await storage.getTodayLotteryDraw();
    res.json(draw);
  });

  app.get("/api/lottery/tickets", authenticateUser, async (req: any, res) => {
    const tickets = await storage.getUserLotteryTickets(req.user.id);
    res.json(tickets);
  });

  app.get("/api/lottery/history", async (req, res) => {
    try {
      // const history = await db.select().from(lotteryDraws).orderBy(desc(lotteryDraws.drawDate)).limit(30);
      const history = await storage.getLotteryHistoryWithStats(30);
      res.json(history);
    } catch (error) {
      console.error("Lottery history error:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // Use verifyAuth from simpleAuth which is lightweight and doesn't re-fetch from Supabase if not needed
  app.post("/api/lottery/create-ticket", requireAuth, async (req: any, res) => {
    try {
      console.log("[API] Creating lottery ticket request:", req.body);
      const { roundId, numbers } = req.body;
      if (!roundId || !numbers || !Array.isArray(numbers) || numbers.length !== 5) {
        console.error("🔥 [DEBUG_SERVER] Validation Failed: Invalid input data", { roundId, numbers });
        return res.status(400).json({ message: "Invalid ticket data (need roundId and 5 numbers)" });
      }

      console.log("🔥 [DEBUG_SERVER] Calling storage.createLotteryTicket...");
      const ticket = await storage.createLotteryTicket(req.user!.id, roundId, numbers);
      console.log("🔥 [DEBUG_SERVER] Ticket created successfully:", ticket);

      res.json(ticket);
    } catch (error: any) {
      console.error("🔥 [DEBUG_SERVER] Error in create-ticket route:", error);
      res.status(500).json({ error: error.message || "티켓 생성 중 오류가 발생했습니다." });
    }
  });

  // 6. Balance Game Routes
  app.get("/api/balance-games", async (req, res) => {
    try {
      // Get ACTIVE games for public
      const games = await storage.getBalanceGames('ACTIVE');
      res.json(games);
    } catch (error) {
      console.error("Failed to fetch balance games:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/balance-games/all", requireAuth, async (req: any, res) => {
    // Admin check logic can be added here or in the middleware
    // For now, assuming authenticated user is admin for this proof of concept or check simple flag
    try {
      const games = await storage.getBalanceGames('PENDING'); // or all
      // To get ALL statuses, we might need to adjust getBalanceGames or call it multiple times
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending games" });
    }
  });

  app.post("/api/balance-games/:id/vote", authenticateUser, async (req: any, res) => {
    // Only allow logged-in users to vote
    try {
      const gameId = parseInt(req.params.id);
      const userId = req.user.id;
      const choice = req.body.choice; // 'A' or 'B'

      // Check if already voted by this user
      const existingVote = await storage.getUserBalanceGameVote(userId, undefined, gameId);
      if (existingVote) {
        return res.status(400).json({ message: "Already voted", code: "ALREADY_VOTED" });
      }

      const vote = await storage.voteBalanceGame({
        userId,
        deviceId: undefined, // deviceId no longer used
        gameId,
        choice
      });

      // [POLLI STANDARD] Logic:
      // 1. Voting Period: Unlimited
      // 2. Rewards: 5 EXP (Always awarded since auth is required)
      // 3. Stats: Count towards today's participants
      await storage.updateUserGameStats(userId, 5);

      res.json(vote);
    } catch (error: any) {
      if (error?.message?.includes('violates unique constraint')) {
        return res.status(400).json({ message: "Already voted", code: "ALREADY_VOTED" });
      }
      res.status(500).json({ message: "Vote failed" });
    }
  });

  app.patch("/api/balance-games/:id/status", requireAuth, async (req: any, res) => {
    // Update status (Approve/Reject)
    try {
      const gameId = parseInt(req.params.id);
      const status = req.body.status;
      const updated = await storage.updateBalanceGameStatus(gameId, status);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Update failed" });
    }
  });

  app.delete("/api/balance-games/:id", requireAuth, async (req: any, res) => {
    try {
      const gameId = parseInt(req.params.id);
      await storage.deleteBalanceGame(gameId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Delete failed" });
    }
  });

  app.post("/api/balance-games/generate", requireAuth, async (req: any, res) => {
    const url = req.body.url;
    if (!url) return res.status(400).json({ message: "URL required" });

    try {
      console.log(`[API] Triggering Balance Game Generation for ${url}`);
      const game = await generateBalanceGameFromNews(url);
      if (game) {
        res.json({ success: true, game });
      } else {
        res.status(500).json({ message: "Failed to generate game content" });
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Generation failed" });
    }
  });

  // Get My Balance Game Votes
  app.get("/api/balance-games/votes/me", authenticateUser, async (req: any, res) => {
    try {
      const votes = await storage.getUserBalanceGameVotes(req.user.id);
      res.json(votes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch votes" });
    }
  });

  // Get Balance Game Stats
  app.get("/api/balance-games/:id/stats", async (req, res) => {
    try {
      const stats = await storage.getBalanceGameStats(Number(req.params.id));
      res.json(stats);
    } catch (error) {
      console.error("Stats error", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Get Comments
  app.get("/api/balance-games/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getBalanceGameComments(Number(req.params.id));
      res.json(comments);
    } catch (error) {
      console.error("Comments fetch error", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Post Comment
  app.post("/api/balance-games/:id/comments", authenticateUser, async (req: any, res) => {
    try {
      const content = req.body.content;
      if (!content || !content.trim()) return res.status(400).json({ message: "Content required" });

      const comment = await storage.createBalanceGameComment({
        gameId: Number(req.params.id),
        userId: req.user.id,
        content: content.trim()
      });
      res.json(comment);
    } catch (error) {
      console.error("Comment post error", error);
      res.status(500).json({ message: "Failed to post comment" });
    }
  });

  // 7. Notifications
  app.get("/api/notifications", authenticateUser, async (req: any, res) => {
    try {
      const notifications = await storage.getNotifications(req.user.id);
      res.json(notifications);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", authenticateUser, async (req: any, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user.id);
      res.json({ count });
    } catch (e) {
      res.status(500).json({ count: 0 });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markNotificationAsRead(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/read-all", authenticateUser, async (req: any, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.user.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // 8. External Module Registrations
  registerAdminRoutes(app);
  registerAssemblyRoutes(app);
  registerLocalCouncilRoutes(app);

  // Register politician routes (for AI persona generation)
  // Register politician routes (for AI persona generation)
  app.use('/api', politicianRoutes);
  app.use('/api', brainRouter);

  const httpServer = createServer(app);
  return httpServer;
}
