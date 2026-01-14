import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema.js";

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. The backend will not be able to connect to the database.");
}

const hasDbUrl = !!process.env.DATABASE_URL;

// Mock Pool for frontend-only dev
const mockPool = {
  connect: () => { throw new Error("DB not connected"); },
  on: () => { },
  end: () => { },
  query: () => { throw new Error("DB not connected"); },
} as any;

export const pool = hasDbUrl
  ? new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL generally required for cloud postgres (Supabase, Neon)
    ssl: { rejectUnauthorized: false }
  })
  : mockPool;

export const db = hasDbUrl
  ? drizzle(pool, { schema })
  : new Proxy({}, {
    get: () => () => { throw new Error("Database not connected. Please migrate to Supabase."); }
  }) as any;