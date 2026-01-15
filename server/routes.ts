
import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerAdminRoutes } from "./adminRoutes.js";
import { registerAssemblyRoutes } from "./assemblyRoutes.js";
import { registerLocalCouncilRoutes } from "./localCouncilRoutes.js";
import { politicianRoutes } from "./politicianRoutes.js";
import brainRouter from "./brainRoutes.js";

// Modularized Routers
import authRouter from "./routes/auth.js";
import lotteryRouter from "./routes/lottery.js";
import balanceGameRouter from "./routes/balance-game.js";
import newsRouter from "./routes/news.js";
import notificationRouter from "./routes/notifications.js";
import surveyRouter from "./routes/surveys.js";
import personalityRouter from "./routes/personality.js";
import statsRouter from "./routes/stats.js";
import politicalRouter from "./routes/political.js";
import { registerRewardsRoutes } from "./rewardsRoutes.js";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== Polli API Routers Registering ===");

  // 1. Auth & Profiles
  app.use("/api/auth", authRouter);

  // 2. News
  app.use("/api/news", newsRouter);

  // 3. Surveys & Quick Polls
  app.use("/api/surveys", surveyRouter);

  // 4. Personality Analysis
  app.use("/api/auth/personality", personalityRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/political", politicalRouter);

  // Legacy Compatibility Aliases for Politics Category
  app.get("/api/auth/politics-surveys", (req, res, next) => {
    req.url = "/api/political/surveys";
    next();
  }, politicalRouter);

  app.get("/api/auth/politics-survey-results/:id", (req, res, next) => {
    req.url = `/api/political/survey-results/${req.params.id}`;
    next();
  }, politicalRouter);

  // 5. Lottery
  app.use("/api/lottery", lotteryRouter);

  // 6. Balance Games
  app.use("/api/balance-games", balanceGameRouter);

  // 7. Notifications
  app.use("/api/notifications", notificationRouter);

  // 10. External API & Legacy Registrations
  registerAdminRoutes(app);
  registerAssemblyRoutes(app);
  registerLocalCouncilRoutes(app);

  // Other specialized routes
  app.use('/api', politicianRoutes);
  app.use('/api', brainRouter);

  const httpServer = createServer(app);
  return httpServer;
}
