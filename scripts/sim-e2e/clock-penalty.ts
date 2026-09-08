/**
 * 자리 비움 = 패널티(2026-09-08 오너 결정) e2e: 차례인 사람이 화면을 닫아도 시계는 계속 돌고,
 * 상대가 50초(40 + 유예 10) 뒤 시간 초과를 걸면 차례가 넘어가고 아웃이 하나 쌓인다. 끝나면 정리.
 * `npx tsx scripts/sim-e2e/clock-penalty.ts [base]` (약 1분)
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { SHOT_CLOCK_S, SHOT_CLOCK_GRACE_S } from "../../shared/sim/rules/session";
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
const host = await mk("000-e2e-pen-h", "패널티호스트"), guest = await mk("000-e2e-pen-g", "패널티게스트");
const H = cookieFor(host), G = cookieFor(guest);
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  const ack = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  ok(!!ack.data.turnSeenAt, "호스트(차례)가 화면을 열어 시계 시작");
  console.log(`   호스트는 그대로 화면을 닫는다 — ${SHOT_CLOCK_S + SHOT_CLOCK_GRACE_S + 2}초 뒤 상대가 시간 초과를 건다…`);
  const until = Date.now() + (SHOT_CLOCK_S + SHOT_CLOCK_GRACE_S + 2) * 1000;
  while (Date.now() < until) { await api(G, "GET", `/api/hiq/sim/matches/${m.id}`); await sleep(3000); }
  const forced = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  ok(forced.status === 200, `자리를 비워도 시간 초과가 걸린다 (${forced.status} ${forced.code ?? ""} ${forced.message ?? ""})`);
  ok(forced.data.turn === 1, "차례가 상대에게 넘어간다");
  ok(forced.data.timeouts[0] === 1, `호스트 아웃 1 (${JSON.stringify(forced.data.timeouts)})`);
  ok(forced.data.status === "playing", "아직 진행 중(3번째에 실격패)");
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
