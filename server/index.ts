import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./vite.js";
import { errorHandler } from "./middleware/error.js";

const log = (message: string, context: string = "Express") => console.log(`[${context}] ${message}`);

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`[Global] Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Register HiQ API Routes
const server = await registerRoutes(app);

// Error Handler
app.use(errorHandler);

// Vite / Static Setup
const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

if (!isProduction) {
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

