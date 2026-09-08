/** 쓰리아웃 e2e: 임시 회원 둘. 시간 초과 3번이면 실격패(endReason "timeout", 상대 승). 정리까지. `npx tsx scripts/sim-e2e/strikeout.ts [base]` (약 2분) */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { SHOT_CLOCK_S, SHOT_CLOCK_STRIKES } from "../../shared/sim/rules/session";
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
const host = await mk("000-e2e-out-h", "아웃호스트"), guest = await mk("000-e2e-out-g", "아웃게스트");
const H = cookieFor(host), G = cookieFor(guest);
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  // 쓰리아웃은 "사람마다" 3번 — 번갈아 넘기면 3번에 끝나지 않는다(정상). 호스트에게 2번을 미리 적어 두고 3번째만 실제로 넘긴다.
  await db.execute(sql`update hiq_sim_matches set host_timeouts = ${SHOT_CLOCK_STRIKES - 1} where id = ${m.id}`);
  const before = await api(H, "GET", `/api/hiq/sim/matches/${m.id}`);
  ok(before.data.turn === 0 && before.data.timeouts[0] === SHOT_CLOCK_STRIKES - 1, `호스트 차례 · 누적 ${JSON.stringify(before.data.timeouts)}`);
  const ack = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  ok(!!ack.data.turnSeenAt, "호스트 시계 시작");
  const early = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  ok(early.status === 409 && early.code === "TOO_EARLY", "40초 전에는 처리하지 않는다");
  await sleep(SHOT_CLOCK_S * 1000 + 800);
  const to = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  ok(to.status === 200, `3번째 시간 초과 처리 (${to.status} ${to.message ?? ""})`);
  ok(to.data.status === "finished" && to.data.endReason === "timeout", `실격패로 종료(endReason ${to.data.endReason})`);
  ok(to.data.winnerIndex === 1, "승자는 게스트");
  ok(to.data.timeouts[0] === SHOT_CLOCK_STRIKES, `호스트 누적 ${to.data.timeouts[0]}회`);
  const notes = (await db.execute(sql`select title from hiq_notifications where member_id in (${host}, ${guest}) order by created_at desc limit 4`)).rows as { title: string }[];
  ok(notes.some((n) => n.title === "실격패"), `알림: ${notes.map((n) => n.title).join(" / ")}`);
  console.log("ALL OK");
} finally {
  await sleep(1000);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    for (let i = 0; i < 5; i++) { try { await db.execute(sql`delete from hiq_notifications where member_id=${id}`); await db.execute(sql`delete from hiq_members where id=${id}`); break; } catch (e) { if (i === 4) throw e; await sleep(1000); } }
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where id in (${host}, ${guest})`)).rows[0] as { n: number }).n);
}
process.exit(0);
