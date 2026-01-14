import 'dotenv/config';

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { registerSEORoutes } from "./seoRoutes.js";
import { registerOGImageRoutes } from "./ogImageGenerator.js";
import prerender from "prerender-node";
import { authMiddleware } from "./simpleAuth.js";
import { aggregateAllPastPoliticalSurveys } from "./services/politicalStatsService.js";

const log = (message: string) => console.log(`[Express] ${message}`);
const app = express();
// Trigger restart for DB connection reset

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
app.use('/uploads', express.static('public/uploads'));

// RSS 피드 라우터 등록 (정적 파일보다 먼저)
import { registerRSSRoutes } from "./rssRoutes.js";
registerRSSRoutes(app);

// 국회 법률안 라우터 등록
import assemblyBillRoutes from "./assemblyBillRoutes.js";
app.use(assemblyBillRoutes);

// 셀럽 배틀 라우터 등록
import { registerCelebrityRoutes } from "./celebrityRoutes.js";
registerCelebrityRoutes(app);

// 음악 랭킹 라우터 등록
import musicRoutes from "./musicRoutes.js";
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


// ... (imports remain)

const { storage } = await import("./storage.js");

// SEO 최적화 라우터 등록 (frontend보다 먼저)
registerSEORoutes(app);
console.log("✅ SEO 라우터 등록 완료 (sitemap.xml, robots.txt, OG 이미지, 구조화 데이터)");

// OG 이미지 생성 라우터 등록
registerOGImageRoutes(app);
console.log("✅ OG 이미지 생성 라우터 등록 완료 (동적 썸네일, 카테고리별 이미지)");

const server = await registerRoutes(app);


// 국회 발의법률안 자동 스케줄러 시작
const { startAssemblyBillScheduler } = await import('./assemblyBillScheduler.js');
startAssemblyBillScheduler();
console.log("✅ 국회 발의법률안 스케줄러 시작 (Supabase 연동)");

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
  const { setupVite } = await import("./vite.js");
  await setupVite(app, server);
} else {
  const { serveStatic } = await import("./vite.js");
  serveStatic(app);
}

// Export app for Vercel
export default app;

// Start server if not running in Vercel
if (!process.env.VERCEL) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5001;
  server.listen({
    port,
    host: "0.0.0.0",
  }, async () => {
    log(`serving on port ${port}`);

    // 포트가 확보된 후 초기화 작업 수행
    try {
      const { setupCronJobs } = await import("./cron.js");
      setupCronJobs();
    } catch (e) {
      console.error("Failed to setup cron jobs on startup:", e);
    }
  });
}
