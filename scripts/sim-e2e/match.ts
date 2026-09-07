// 시뮬 대전 A 서버 e2e. 로컬 서버(PORT=5001)를 띄운 뒤 `npx tsx scripts/sim-e2e/match.ts`.
// 임시 회원을 만들어 게스트로 쓰고 끝나면 시뮬 테이블·알림·임시 회원을 지운다. 실전 테이블은 건드리지 않는다.
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = process.env.E2E_BASE || "http://localhost:5001";
const secret = process.env.COOKIE_SECRET!;
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""))}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
// 1) 호스트 = rankue, 게스트 = 임시 회원(테스트 뒤 삭제)
const host = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const store = (await db.execute(sql`select store_id from hiq_members where id=${host}`)).rows[0] as any;
const g = (await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-sim', '시뮬테스트') returning id`)).rows[0] as any;
const guest = g.id as string;
const H = cookieFor(host), G = cookieFor(guest);
const fail = (m: string) => { console.error("FAIL", m); process.exitCode = 1; };
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 2, inningCap: 0 });
  if (created.status !== 201) fail("create " + JSON.stringify(created));
  const m = created.data; console.log("created", m.code, m.status, "myIndex", m.myIndex);
  const look = await api(G, "GET", `/api/hiq/sim/matches/code/${m.code}`);
  if (look.status !== 200 || look.data.hostName !== "rankue") fail("lookup " + JSON.stringify(look));
  const selfJoin = await api(H, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, {});
  if (selfJoin.status !== 400) fail("self join should be 400: " + selfJoin.status);
  const joined = await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 3 });
  if (joined.status !== 200 || joined.data.status !== "playing" || joined.data.turn !== 0) fail("join " + JSON.stringify(joined).slice(0, 300));
  console.log("joined: guest myIndex", joined.data.myIndex, "players", joined.data.state.players.map((p: any) => p.cueBallId + ":" + p.target).join(","));
  // 2) 게스트가 먼저 치려 하면 409
  const wrong = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 0, input: { cueBallId: "yellow", phi: Math.PI, V0: 2.5, a: 0, b: 0, theta: 0 } });
  if (wrong.status !== 409 || wrong.code !== "NOT_YOUR_TURN") fail("guest first should be 409 NOT_YOUR_TURN: " + JSON.stringify(wrong).slice(0, 200));
  // 3) 호스트 샷(정면 미스) → 턴이 게스트로
  const s0 = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 0, input: { cueBallId: "white", phi: Math.PI, V0: 2.5, a: 0, b: 0, theta: 0 } });
  if (s0.status !== 200 || s0.data.turn !== 1) fail("host shot " + JSON.stringify(s0).slice(0, 300));
  console.log("host shot:", s0.data.outcome.code, "turn→", s0.data.turn, "version", s0.data.version);
  // 4) 게스트 폴링: 놓친 샷 따라잡기
  const catchup = await api(G, "GET", `/api/hiq/sim/matches/${m.id}/shots?from=0`);
  if (catchup.status !== 200 || catchup.data.length !== 1 || catchup.data[0].hash !== s0.data.hash) fail("catchup " + JSON.stringify(catchup).slice(0, 200));
  // 5) 게스트 샷 — 서버 상태(balls)를 그대로 preState 로 쓰는 것이 규약. 큐볼은 yellow.
  const st = await api(G, "GET", `/api/hiq/sim/matches/${m.id}`);
  const s1 = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 1, input: { cueBallId: "yellow", phi: 0.3, V0: 3, a: 0.2, b: 0.1, theta: 0 }, clientHash: "0000000000000000" });
  if (s1.status !== 200 || s1.data.mismatch !== true) fail("guest shot " + JSON.stringify(s1).slice(0, 300));
  console.log("guest shot:", s1.data.outcome.code, "mismatch(expected true)", s1.data.mismatch, "turn→", s1.data.turn);
  // 6) 재전송(같은 idx) → duplicate
  const dup = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 1, input: { cueBallId: "yellow", phi: 0.3, V0: 3, a: 0.2, b: 0.1, theta: 0 } });
  if (dup.status !== 200 && dup.status !== 409) fail("dup " + JSON.stringify(dup).slice(0, 200));
  console.log("dup resend →", dup.status, dup.data?.duplicate ?? dup.code);
  // 7) claim 은 아직 이르다 → 409 TOO_EARLY (호스트 차례이므로 게스트가 주장)
  const claim = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/claim`, {});
  if (claim.status !== 409 || claim.code !== "TOO_EARLY") fail("claim " + JSON.stringify(claim).slice(0, 200));
  // 8) 호스트 기권 → 게스트 승, Elo 반영
  const resign = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/resign`, {});
  if (resign.status !== 200 || resign.data.winnerIndex !== 1) fail("resign " + JSON.stringify(resign));
  const fin = await api(H, "GET", `/api/hiq/sim/matches/${m.id}`);
  console.log("finished:", fin.data.status, "winner", fin.data.winnerIndex, "reason", fin.data.endReason, "mismatches", (await db.execute(sql`select mismatches from hiq_sim_matches where id=${m.id}`)).rows[0]);
  const elo = await db.execute(sql`select member_id, sim_rating, matches, wins from hiq_sim_ratings where member_id in (${host}, ${guest}) and game_type='3c'`);
  console.log("elo:", JSON.stringify(elo.rows));
  const mine = await api(G, "GET", `/api/hiq/sim/matches`);
  console.log("guest list:", mine.data.length, mine.data[0]?.status);
  // 실전 성적 불변 확인
  const rp = await db.execute(sql`select rating_3c, rating_4c, avg_3c, avg_4c from hiq_members where id=${host}`);
  console.log("host real stats untouched:", JSON.stringify(rp.rows[0]));
} finally {
  // 정리: 시뮬 테이블 → 알림 → 임시 회원 (실전 테이블은 건드린 적 없음)
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id=${host} and guest_id=${guest})`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${host} and (guest_id=${guest} or guest_id is null)`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id in (${host}, ${guest}) and matches > 0`);
  await db.execute(sql`delete from hiq_notifications where member_id=${guest} or (member_id=${host} and created_at > now() - interval '3 minutes' and type='MATCH')`);
  await db.execute(sql`delete from hiq_members where id=${guest}`);
  console.log("cleanup done");
}
process.exit(process.exitCode ?? 0);
