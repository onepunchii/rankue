/**
 * 멀티방 중복 e2e: 임시 회원이 방을 두 번 만들면 먼저 만든 방은 접히고(canceled) 새 방만 대기 상태로 남는다.
 * 시작된 대전은 접지 않는다는 것도 확인. 끝나면 전부 삭제. `npx tsx scripts/sim-e2e/rooms-dedupe.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; data?: any; message?: string };
}
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;
const host = await mk("000-e2e-dedupe-h", "중복호스트"), guest = await mk("000-e2e-dedupe-g", "중복게스트");
const H = cookieFor(host), G = cookieFor(guest);
const room = { gameType: "3c", tableId: "DAEDAE", target: 15, isPublic: true };
try {
  const a = await api(H, "POST", "/api/hiq/sim/matches", room);
  ok(a.status === 201 && a.data.closedRooms === 0, `첫 방 (닫힌 방 ${a.data?.closedRooms})`);
  const b = await api(H, "POST", "/api/hiq/sim/matches", room);
  ok(b.status === 201 && b.data.closedRooms === 1, `두 번째 방을 만들면 먼저 방이 접힌다 (닫힌 방 ${b.data?.closedRooms})`);
  const mine = await api(H, "GET", "/api/hiq/sim/matches");
  const waiting = (mine.data as any[]).filter((m) => m.status === "waiting");
  ok(waiting.length === 1 && waiting[0].id === b.data.id, `내 대기 방은 하나 (${waiting.length}개)`);
  const gone = await api(G, "GET", `/api/hiq/sim/matches/code/${a.data.code}`);
  ok(gone.status === 404, "접힌 방은 코드로도 안 열린다");
  const rooms = await api(G, "GET", "/api/hiq/sim/rooms");
  ok((rooms.data as any[]).filter((m) => m.hostName === "중복호스트").length === 1, "목록에도 하나만");
  // 시작된 대전은 접지 않는다
  const joined = await api(G, "POST", `/api/hiq/sim/matches/${b.data.id}/join`, { target: 15 });
  ok(joined.status === 200 && joined.data.status === "playing", "게스트 참가 → 진행 중");
  const c = await api(H, "POST", "/api/hiq/sim/matches", room);
  ok(c.status === 201 && c.data.closedRooms === 0, "진행 중인 대전은 그대로 두고 새 방만 연다");
  const after = await api(H, "GET", "/api/hiq/sim/matches");
  ok((after.data as any[]).filter((m) => m.status === "playing").length === 1, "진행 중 대전 그대로");
  console.log("ALL OK");
} finally {
  await sleep(500);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    for (let i = 0; i < 5; i++) { try { await db.execute(sql`delete from hiq_notifications where member_id=${id}`); await db.execute(sql`delete from hiq_members where id=${id}`); break; } catch (e) { if (i === 4) throw e; await sleep(800); } }
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where id in (${host}, ${guest})`)).rows[0] as { n: number }).n);
}
process.exit(0);
