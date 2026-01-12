import 'dotenv/config';

// Force server restart for route update (fixed syntax errors)
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
// import session from "express-session"; // Session removed or mocked if not used
import { registerRoutes } from "./routes";
// Clean Auth 시스템 제거 - Simple Auth로 통합
import { registerSEORoutes } from "./seoRoutes";
import { registerOGImageRoutes } from "./ogImageGenerator";
import prerender from "prerender-node";
import { setupVite, serveStatic, log } from "./vite";

import { authMiddleware } from "./simpleAuth";
const app = express();
app.use(cookieParser());

// Global Request Logger - Debugging infinite loading
app.use((req, res, next) => {
  console.log(`[Global] Incoming Request: ${req.method} ${req.url}`);
  next();
});

app.use(authMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Prerender.io SEO 미들웨어 (검색엔진 크롤러를 위한 사전 렌더링)
if (process.env.PRERENDER_TOKEN) {
  app.use(prerender.set('prerenderToken', process.env.PRERENDER_TOKEN));
  console.log("✅ Prerender.io SEO 미들웨어 활성화");
} else {
  console.log("⚠️  PRERENDER_TOKEN 없음 - SEO 사전 렌더링 비활성화");
}

// 정적 파일 서빙 (이미지 등)
app.use('/images', express.static('public/images'));

// RSS 피드 라우터 등록 (정적 파일보다 먼저)
import { registerRSSRoutes } from "./rssRoutes";
registerRSSRoutes(app);

// 국회 법률안 라우터 등록
import assemblyBillRoutes from "./assemblyBillRoutes";
app.use(assemblyBillRoutes);

// 셀럽 배틀 라우터 등록
import { registerCelebrityRoutes } from "./celebrityRoutes";
registerCelebrityRoutes(app);

// 음악 랭킹 라우터 등록
import musicRoutes from "./musicRoutes";
app.use("/api/music", musicRoutes);

// 모든 POST 요청 디버깅
app.use('/api/surveys/:id/participate', (req, res, next) => {
  console.log('🚀 Direct middleware for /api/surveys/:id/participate');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('x-auth-id:', req.headers['x-auth-id']);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const pathValue = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (pathValue.startsWith("/api")) {
      let logLine = `${req.method} ${pathValue} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { storage } = await import("./storage");

  // SEO 최적화 라우터 등록 (frontend보다 먼저)
  registerSEORoutes(app);
  console.log("✅ SEO 라우터 등록 완료 (sitemap.xml, robots.txt, OG 이미지, 구조화 데이터)");

  // OG 이미지 생성 라우터 등록
  registerOGImageRoutes(app);
  console.log("✅ OG 이미지 생성 라우터 등록 완료 (동적 썸네일, 카테고리별 이미지)");

  // registerRoutes(app); // Old monolithic routes
  // registerModularRoutes 제거 (routes.ts로 통합됨)

  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);

  // 정치 스케줄러 임포트 및 설정 (Drizzle 종속성으로 비활성화)
  // const { createWeeklyPoliticalSurvey, updatePoliticalIndicators } = await import('./politicalScheduler');

  // 정책브리핑 스케줄러 및 국회 발의안 스케줄러는 아래에서 시작됨 (Supabase 연동)

  // 국회 발의법률안 자동 스케줄러 시작
  const { startAssemblyBillScheduler } = await import('./assemblyBillScheduler');
  startAssemblyBillScheduler();
  console.log("✅ 국회 발의법률안 스케줄러 시작 (Supabase 연동)");

  // 기초의원 데이터 초기화
  // const { initializeLocalCouncilData } = await import('./initLocalCouncilData');
  // await initializeLocalCouncilData();

  // 주간 정치 설문 자동 생성 시스템 설정 (매주 월요일 오전 6시)
  // function scheduleWeeklyPoliticalSurvey() {
  //   const now = new Date();
  //   const nextMonday = new Date(now);
  //   const daysUntilMonday = (1 + 7 - now.getDay()) % 7 || 7; // 다음 월요일까지 일수
  //   nextMonday.setDate(now.getDate() + daysUntilMonday);
  //   nextMonday.setHours(6, 0, 0, 0); // 월요일 오전 6시
  //
  //   const timeUntilNextMonday = nextMonday.getTime() - now.getTime();
  //
  //   // 첫 번째 생성 예약
  //   setTimeout(async () => {
  //     try {
  //       console.log('🗳️ 주간 정치 설문 자동 생성 시작 (월요일 06:00)');
  //       // await updatePoliticalIndicators(); // 정치 지표 업데이트
  //       // await createWeeklyPoliticalSurvey(); // 설문 생성
  //       console.log('✅ 주간 정치 설문 생성 완료');
  //     } catch (error) {
  //       console.error('❌ 주간 정치 설문 생성 실패:', error);
  //     }
  //
  //     // 7일마다 반복 실행
  //     setInterval(async () => {
  //       try {
  //         console.log('🗳️ 주간 정치 설문 자동 생성 시작 (월요일 06:00)');
  //         // await updatePoliticalIndicators();
  //         // await createWeeklyPoliticalSurvey();
  //         console.log('✅ 주간 정치 설문 생성 완료');
  //       } catch (error) {
  //         console.error('❌ 주간 정치 설문 생성 실패:', error);
  //       }
  //     }, 7 * 24 * 60 * 60 * 1000); // 7일 = 604800000ms
  //
  //   }, timeUntilNextMonday);
  //
  //   console.log(`🗳️ 정치 설문 자동 생성 시스템 활성화: ${Math.floor(timeUntilNextMonday / 1000 / 60 / 60)}시간 후 첫 생성`);
  // }

  // 자동 로또 추첨 시스템 설정
  // function scheduleDailyLotteryDraw() {
  //   const now = new Date();
  //   const nextMidnight = new Date(now);
  //   nextMidnight.setDate(nextMidnight.getDate() + 1);
  //   nextMidnight.setHours(0, 0, 0, 0);
  //
  //   const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
  //
  //   // 첫 번째 추첨 예약
  //   setTimeout(async () => {
  //     try {
  //       console.log('🎰 자동 로또 추첨 시작 (00:00)');
  //       // const draw = await storage.runDailyLotteryDraw();
  //       // console.log(`🎰 로또 추첨 완료: ${draw.winningNumbers.join(', ')} | 참가자: ${draw.totalParticipants}명 | 당첨자: ${draw.winnersCount}명`);
  //
  //       // 포인트 자동 지급 (사용자 포인트 추가)
  //       // await distributeWinningPrizes(draw.id);
  //
  //     } catch (error) {
  //       console.error('❌ 자동 로또 추첨 실패:', error);
  //     }
  //
  //     // 24시간마다 반복 실행
  //     setInterval(async () => {
  //       try {
  //         console.log('🎰 자동 로또 추첨 시작 (00:00)');
  //         // const draw = await storage.runDailyLotteryDraw();
  //         // console.log(`🎰 로또 추첨 완료: ${draw.winningNumbers.join(', ')} | 참가자: ${draw.totalParticipants}명 | 당첨자: ${draw.winnersCount}명`);
  //
  //         // 포인트 자동 지급
  //         // await distributeWinningPrizes(draw.id);
  //
  //       } catch (error) {
  //         console.error('❌ 자동 로또 추첨 실패:', error);
  //       }
  //     }, 24 * 60 * 60 * 1000); // 24시간 = 86400000ms
  //
  //   }, timeUntilMidnight);
  //
  //   console.log(`🎰 로또 자동 추첨 시스템 활성화: ${Math.floor(timeUntilMidnight / 1000 / 60)}분 후 첫 추첨`);
  // }

  // 당첨자 포인트 자동 지급 함수
  // async function distributeWinningPrizes(drawId: number) {
  //   try {
  //     console.log(`💰 당첨자 포인트 지급 시작 (Draw ID: ${drawId})`);
  //
  //     // Drizzle imports will crash
  //     // const { db } = await import("./db");
  //     // const { lotteryTickets, users } = await import("../shared/schema");
  //     // const { eq, and, gt } = await import("drizzle-orm");
  //
  //     // ... Logic skipped ...
  //     
  //     console.log(`💰 (기능 비활성화됨) 총 포인트 지급 완료: 0P (Supabase 이전 필요)`);
  //
  //   } catch (error) {
  //     console.error('❌ 포인트 지급 실패:', error);
  //   }
  // }

  // 서버 시작 시 자동 시스템 활성화

  // 정책브리핑 스케줄러 초기화
  // const PolicyBriefingScheduler = (await import('./policyBriefingScheduler')).default;
  // const policyBriefingScheduler = new PolicyBriefingScheduler();
  // console.log("✅ 정책브리핑 스케줄러 시작 (Supabase 연동)");

  // Legacy Drizzle Schedulers Disabled
  // scheduleDailyLotteryDraw(); // 매일 자정 로또 추첨
  // scheduleWeeklyPoliticalSurvey(); // 매주 월요일 정치 설문 생성

  // 국회 랭킹 월간 스케줄러 (New)
  const { setupCronJobs } = await import("./cron");
  setupCronJobs();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5001;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
