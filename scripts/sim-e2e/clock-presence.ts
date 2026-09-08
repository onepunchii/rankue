/**
 * 접속 기반 시계 e2e: 임시 회원 둘. 게스트가 대전 화면을 폴링 중(접속)이면 호스트 샷 직후 게스트 시계가 서버에서 바로 시작(샷 + 재생 여유),
 * 호스트가 20초 넘게 안 보면 게스트 샷 뒤 호스트 시계는 null(조준 화면 ack 로 시작). 끝나면 전부 삭제.
 * `npx tsx scripts/sim-e2e/clock-presence.ts [base]` (약 30초)
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { PRESENCE_MS, REPLAY_GRACE_MS } from "../../shared/sim/rules/session";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (id: string) => encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; data?: any; code?: string; message?: string };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("ASSERT " + msg); console.log("ok  ", msg); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;
const host = await mk("000-e2e-pres-h", "접속호스트"), guest = await mk("000-e2e-pres-g", "접속게스트");
const H = cookieFor(host), G = cookieFor(guest);
// 개시 배치에서 긴 축으로 똑바로: 아무 공도 안 맞아 득점 없이 차례가 넘어간다(paths.test 와 같은 샷)
const straight = (cueBallId: "white" | "yellow") => ({ cueBallId, phi: Math.PI / 2, V0: 2, a: 0, b: 0, theta: 0 });
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data; assert(created.status === 201, "대전 만들기");
  const joined = await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  assert(joined.status === 200 && joined.data.turn === 0, "게스트 참가 → 호스트 차례");
  // 게스트가 화면을 보고 있다(폴링) → 접속 표시
  const g0 = await api(G, "GET", `/api/hiq/sim/matches/${m.id}`);
  assert(g0.status === 200 && g0.data.turnSeenAt === null, "시작 직후 호스트 시계는 ack 전(없음)");
  const t0 = Date.now();
  const shot = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 0, input: straight("white") });
  assert(shot.status === 200 && shot.data.turn === 1, `호스트 샷 → 게스트 차례 (${shot.status} ${shot.message ?? ""})`);
  const g1 = await api(G, "GET", `/api/hiq/sim/matches/${m.id}`);
  const seen = g1.data.turnSeenAt ? Date.parse(g1.data.turnSeenAt) : NaN;
  assert(Number.isFinite(seen) && seen - t0 >= REPLAY_GRACE_MS - 3000 && seen - t0 <= REPLAY_GRACE_MS + 5000, `접속 중인 게스트의 시계가 샷 + 재생 여유(${REPLAY_GRACE_MS} ms)에 시작: +${Math.round(seen - t0)} ms`);
  const early = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  assert(early.status === 409 && early.code === "TOO_EARLY", "바로는 TOO_EARLY");
  // 호스트는 이제 화면을 안 본다(PRESENCE_MS 넘게) → 게스트 샷 뒤 호스트 시계는 null
  console.log(`   호스트 부재 대기 ${Math.ceil((PRESENCE_MS + 2000) / 1000)}초…`);
  await sleep(PRESENCE_MS + 2000);
  const shot2 = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 1, input: straight("yellow") });
  assert(shot2.status === 200 && shot2.data.turn === 0, `게스트 샷 → 호스트 차례 (${shot2.status} ${shot2.message ?? ""})`);
  const h2 = await api(H, "GET", `/api/hiq/sim/matches/${m.id}`);
  assert(h2.data.turnSeenAt === null, "부재중인 호스트의 시계는 아직 없음(조준 화면 ack 로 시작)");
  const h3 = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  assert(h3.data.turnSeenAt && Math.abs(Date.parse(h3.data.turnSeenAt) - Date.now()) < 5000, "호스트 ack → 시계 지금 시작");
  console.log("ALL OK");
} finally {
  await sleep(1500);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    for (let i = 0; i < 5; i++) { try { await db.execute(sql`delete from hiq_notifications where member_id=${id}`); await db.execute(sql`delete from hiq_members where id=${id}`); break; } catch (e) { if (i === 4) throw e; await sleep(1000); } }
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where id in (${host}, ${guest})`)).rows[0] as { n: number }).n);
}
process.exit(0);
