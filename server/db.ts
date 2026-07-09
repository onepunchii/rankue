import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from "../shared/schema.js";

// Neon serverless driver (WebSocket-based). node-postgres' TCP Pool is unreliable in
// Vercel serverless functions and fails there even though it works locally; the Neon
// serverless driver is the supported path and works in both. In a Node runtime we must
// provide a WebSocket implementation.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. The backend will not be able to connect to the database.");
} else {
  console.log("✅ DATABASE_URL is set (starting with):", process.env.DATABASE_URL.substring(0, 15) + "...");
}

const hasDbUrl = !!process.env.DATABASE_URL;

// Mock Pool for frontend-only dev (no DATABASE_URL)
const mockPool = {
  connect: () => { throw new Error("DB not connected"); },
  on: () => { },
  end: () => { },
  query: () => { throw new Error("DB not connected"); },
} as any;

export const pool = hasDbUrl
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : mockPool;

export const db = hasDbUrl
  ? drizzle(pool, { schema })
  : new Proxy({}, {
    get: () => () => { throw new Error("Database not connected."); }
  }) as any;
