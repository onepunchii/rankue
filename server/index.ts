import 'dotenv/config';

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { registerSEORoutes } from "./seoRoutes.js";
import { registerOGImageRoutes } from "./ogImageGenerator.js";
import prerender from "prerender-node";
import { authMiddleware } from "./auth.js";
import session from "express-session";
import MemoryStoreLoader from "memorystore";
import { serveStatic } from "./vite.js";
import { errorHandler } from "./middleware/error.js";

const MemoryStore = MemoryStoreLoader(session);

const log = (message: string) => console.log(`[Express] ${message}`);
const app = express();
// Trigger restart for DB connection reset

app.use(cookieParser());

// Global Request Logger - Debugging infinite loading
app.use((req, res, next) => {
  console.log(`[Global] Incoming Request: ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  cookie: { maxAge: 86400000 },
  store: new MemoryStore({
    checkPeriod: 86400000
  }),
  resave: false,
  saveUninitialized: false,
  secret: process.env.SESSION_SECRET || 'polli-secret-key'
}));

// 정적 파일 서빙 (이미지 등) - 인증 미들웨어보다 앞에 배치하여 성능 최적화
app.use('/images', express.static('public/images'));
app.use('/uploads', express.static('public/uploads'));

// Auth middleware
app.use(authMiddleware);

// Prerender.io SEO 미들웨어 (검색엔진 크롤러를 위한 사전 렌더링)
if (process.env.PRERENDER_TOKEN) {
  app.use(prerender.set('prerenderToken', process.env.PRERENDER_TOKEN));
  console.log("✅ Prerender.io SEO 미들웨어 활성화");
} else {
  console.log("⚠️  PRERENDER_TOKEN 없음 - SEO 사전 렌더링 비활성화");
}


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

// SEO 최적화 라우터 등록
registerSEORoutes(app);
registerOGImageRoutes(app);

// RSS 피드 라우터 등록
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

const server = await registerRoutes(app);

// 국회 발의법률안 자동 스케줄러 시작 (Vercel에서는 별도 설정 필요하지만 로컬 및 Replit에서는 동작)
if (!process.env.VERCEL) {
  try {
    const { startAssemblyBillScheduler } = await import('./assemblyBillScheduler.js');
    startAssemblyBillScheduler();
  } catch (e) {
    console.error("Failed to start assembly bill scheduler:", e);
  }
}



app.use(errorHandler);

// importantly only setup vite in development and after
// setting up all the other routes so the catch-all route
// doesn't interfere with the other routes
if (app.get("env") === "development") {
  const { setupVite } = await import("./vite.js");
  await setupVite(app, server);
} else {
  serveStatic(app);
}

// Export app for Vercel
export default app;

// Start server if not running in Vercel
if (!process.env.VERCEL) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5001;
  const serverInstance = server.listen({
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

  serverInstance.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use.`);
      console.error(`Please kill the process using port ${port} or specify a different PORT.`);
      process.exit(1);
    } else {
      console.error("Server startup error:", e);
    }
  });
}
