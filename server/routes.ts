import type { Express } from "express";
import { createServer, type Server } from "http";
import hiqRouter from "./routes/hiq.js";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== HiQ Billiards API Starting ===");

  // HiQ Router 연결
  // (프론트 변경에 맞춰 경로를 /api/hiq -> /api 로 줄일 수도 있지만, 
  //  일단 기존 코드 호환성을 위해 /api/hiq 유지를 추천합니다)
  app.use("/api/hiq", hiqRouter);

  const httpServer = createServer(app);
  return httpServer;
}
