import 'dotenv/config';
import { localeMiddleware } from "./middleware/locale.js";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./vite.js";
import { errorHandler } from "./middleware/error.js";
import { startNotificationScheduler } from "./services/notificationScheduler.js";

const log = (message: string, context: string = "Express") => console.log(`[${context}] ${message}`);

const app = express();
// Signed cookies: the auth identity (hiq_user_id / hiq_partner_auth) is signed with an
// HMAC secret so a forged cookie value is rejected. Without this, the cookie is just a
// member UUID and anyone who learns a UUID can impersonate that account.
if (!process.env.COOKIE_SECRET) {
  console.warn("⚠️ COOKIE_SECRET is not set — auth cookies will NOT be signed. Set it in the environment.");
}
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 요청 언어(x-locale) → res.locals.locale. 오류 메시지가 이 언어로 나간다.
app.use(localeMiddleware);

// Global Request Logger
// 위치·서명 값은 로그에 남기지 않는다(2026-09-30) — 가까운 골프장(/golf/clubs?lat=&lng=)이 좌표를, 발자국 공유 카드(?t=)가
// 서명 토큰을 주소에 싣는다. 개인정보처리방침이 "좌표는 저장하지 않음"이라 적은 뒤라 Vercel 로그에도 남기지 않는다.
const REDACT_QUERY = /([?&](?:lat|lng|lon|latitude|longitude|t|token|sig)=)[^&#]*/gi;
app.use((req, res, next) => {
  console.log(`[Global] Incoming Request: ${req.method} ${req.url.replace(REDACT_QUERY, "$1…")}`);
  next();
});

// Start cron reminder scheduler (only in non-Vercel environment)
if (!process.env.VERCEL) {
  startNotificationScheduler();
}

// Register HiQ API Routes
const server = await registerRoutes(app);

// Error Handler
app.use(errorHandler);

// Vite / Static Setup
const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

if (!isProduction) {
  const { setupVite } = await import("./vite.js");
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5001;
  await setupVite(app, server, port);
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
  }, () => {
    log(`serving on port ${port}`);
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

