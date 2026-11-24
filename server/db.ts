import 'dotenv/config';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from 'ws';
import * as schema from "../shared/schema.js";

// 드라이버는 DATABASE_URL 이 가리키는 곳에 맞춘다(2026-11-24, Supabase 이전 준비).
//  - Neon(…neon.tech): Neon serverless 드라이버(WebSocket). 2026-07 에 node-postgres TCP Pool 이 Vercel 에서
//    Neon 에 붙지 못해 바꿨던 그대로 둔다.
//  - 그 밖(Supabase 풀러 등): node-postgres Pool. Neon 드라이버는 Neon 전용 WebSocket 프록시가 있어야 해서
//    Supabase 에는 붙지 않는다. 폴리(server/db.ts)가 같은 방식으로 Supabase·Neon 모두에서 돌았다.
// 그래서 주소만 바꾸면 드라이버도 따라 바뀐다 — 이전 당일 코드 배포 없이 환경변수만 바꾸면 된다.
// Vercel 의 DATABASE_URL 은 Neon 연동(스토어)이 관리해 직접 바꿀 수 없다 → SUPABASE_DB_URL 이 있으면 그것을 쓴다
// (2026-11-24 이전). 다른 곳(스크립트 등)도 같은 주소를 보게 process.env 자체를 바꿔 둔다.
if (process.env.SUPABASE_DB_URL) process.env.DATABASE_URL = process.env.SUPABASE_DB_URL;
const url = process.env.DATABASE_URL;
const hasDbUrl = !!url;
const isNeon = !!url && /\.neon\.tech/.test(url);

if (!hasDbUrl) {
  console.warn("⚠️ DATABASE_URL is not set. The backend will not be able to connect to the database.");
} else {
  console.log(`✅ DATABASE_URL is set (${isNeon ? "Neon serverless driver" : "node-postgres"})`);
}

// Mock Pool for frontend-only dev (no DATABASE_URL)
const mockPool = {
  connect: () => { throw new Error("DB not connected"); },
  on: () => { },
  end: () => { },
  query: () => { throw new Error("DB not connected"); },
} as any;

function makePool() {
  if (!hasDbUrl) return mockPool;
  if (isNeon) {
    neonConfig.webSocketConstructor = ws;
    return new NeonPool({ connectionString: url });
  }
  const p = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // 서버리스 함수 하나가 여는 연결 수. Supabase Micro 의 풀러는 클라이언트 200개까지 받으므로, 함수가 여럿
    // 동시에 떠도 넘지 않게 작게 둔다(트랜잭션 풀러 6543 기준 — 연결은 쿼리 동안만 실제 DB 연결을 쓴다).
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // 유휴 연결을 서버가 끊을 때 나는 'error' 를 잡지 않으면 Node 프로세스가 죽는다(폴리 2026-08-13 사고와 같은 이유).
  p.on('error', (err: Error) => console.warn('[db] 유휴 커넥션 에러(무해 — 풀이 재연결함):', err.message));
  return p;
}

export const pool = makePool();

export const db = hasDbUrl
  ? (isNeon ? drizzleNeon(pool, { schema }) : (drizzlePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>))
  : new Proxy({}, {
    get: () => () => { throw new Error("Database not connected."); }
  }) as any;
