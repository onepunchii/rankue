import type { Express } from "express";
import { createServer, type Server } from "http";
import hiqRouter from "./routes/index.js";
import superRouter from "./routes/modules/super.js";
import errorsRouter from "./routes/modules/errors.js";
import cronRouter from "./routes/modules/cron.js";
import { registerSitemap } from "./sitemap.js";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== HiQ Billiards API Starting ===");

  // 동적 sitemap.xml (정적 페이지 + 크루 + 매장) — SPA/정적 폴백보다 먼저 등록
  registerSitemap(app);

  // HiQ Router 연결
  // (프론트 변경에 맞춰 경로를 /api/hiq -> /api 로 줄일 수도 있지만,
  //  일단 기존 코드 호환성을 위해 /api/hiq 유지를 추천합니다)
  app.use("/api/hiq", hiqRouter);

  // 슈퍼관리자 요약 (/api/super-summary) — 외부 모니터링용이라 /api/hiq 밖에 마운트
  app.use("/api", superRouter);

  // 클라이언트 에러 수집기 (/api/errors) — 익명 허용이라 /api/hiq 밖에 마운트
  app.use("/api", errorsRouter);

  // Vercel Cron (/api/cron/reminders) — CRON_SECRET 헤더로 자체 인증
  app.use("/api/cron", cronRouter);

  const httpServer = createServer(app);
  return httpServer;
}
