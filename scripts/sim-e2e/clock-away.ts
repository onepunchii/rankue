/**
 * 자리 비움 e2e(2026-09-08 리뷰): 차례인 사람이 대전 화면을 20초 넘게 안 보면
 *  (1) 상대가 시간 초과를 걸어도 서버가 AWAY 로 거절하고 시계를 지운다 → 실격 누적 없음
 *  (2) 돌아와서 폴링하면 40초가 처음부터 다시 시작한다
 * `npx tsx scripts/sim-e2e/clock-away.ts [base]` (약 2분)
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { SHOT_CLOCK_S, PRESENCE_MS } from "../../shared/sim/rules/session";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; data?: any; code?: string; message?: string };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;
const host = await mk("000-e2e-away-h", "자리비움호스트"), guest = await mk("000-e2e-away-g", "자리비움게스트");
const H = cookieFor(host), G = cookieFor(guest);
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  const ack = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  ok(!!ack.data.turnSeenAt, "호스트(차례)가 화면을 열어 시계 시작");
  // 호스트는 이제 화면을 닫는다(폴링 없음). 게스트만 계속 본다.
  console.log(`   호스트 자리 비움 ${Math.ceil((SHOT_CLOCK_S + PRESENCE_MS / 1000 + 3))}초 대기…`);
  const until = Date.now() + (SHOT_CLOCK_S + PRESENCE_MS / 1000 + 3) * 1000;
  while (Date.now() < until) { await api(G, "GET", `/api/hiq/sim/matches/${m.id}`); await sleep(2000); }
  const forced = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  ok(forced.status === 409 && forced.code === "AWAY", `자리 비운 사람에겐 시간 초과를 매기지 않는다 (${forced.status} ${forced.code})`);
  const afterClear = await api(G, "GET", `/api/hiq/sim/matches/${m.id}`);
  ok(afterClear.data.turnSeenAt === null, "시계가 지워졌다(돌아오면 다시 시작)");
  ok(afterClear.data.timeouts[0] === 0, `실격 누적 없음 (${JSON.stringify(afterClear.data.timeouts)})`);
  ok(afterClear.data.turn === 0 && afterClear.data.status === "playing", "차례도 그대로");
  // 호스트가 돌아온다 → 40초가 처음부터
  const back = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  const seen = Date.parse(back.data.turnSeenAt);
  ok(Number.isFinite(seen) && Math.abs(Date.now() - seen) < 5000, "돌아오면 40초가 지금부터 다시 시작");
  const early = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  ok(early.status === 409 && early.code === "TOO_EARLY", "바로는 다시 TOO_EARLY");
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
