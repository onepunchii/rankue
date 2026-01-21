import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema.js";
import path from 'path';
import fs from 'fs';

// Debug Env Loading
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log(`✅ .env file found at ${envPath}`);
} else {
  console.warn(`❌ .env file NOT found at ${envPath} (CWD: ${process.cwd()})`);
}

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. The backend will not be able to connect to the database.");
  console.log("Current Env Keys:", Object.keys(process.env).filter(k => k.includes('DB') || k.includes('SUPABASE')));
} else {
  console.log("✅ DATABASE_URL is set (starting with):", process.env.DATABASE_URL.substring(0, 15) + "...");
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
  connectionString: process.env.DATABASE_URL?.includes(':6543') && !process.env.DATABASE_URL.includes('pgbouncer=true')
    ? process.env.DATABASE_URL + '?pgbouncer=true'
    : process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // Increased for Transaction Pooler
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased timeout
};

export const pool = hasDbUrl
  ? new Pool(poolConfig)
  : mockPool;

export const db = hasDbUrl
  ? drizzle(pool, { schema })
  : new Proxy({}, {
    get: () => () => { throw new Error("Database not connected. Please migrate to Supabase."); }
  }) as any;