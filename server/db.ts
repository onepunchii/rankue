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

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10, // Max clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error if connection takes more than 5 seconds
};

export const pool = hasDbUrl
  ? new Pool(poolConfig)
  : mockPool;

export const db = hasDbUrl
  ? drizzle(pool, { schema })
  : new Proxy({}, {
    get: () => () => { throw new Error("Database not connected. Please migrate to Supabase."); }
  }) as any;