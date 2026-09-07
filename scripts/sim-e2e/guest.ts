// 브라우저 실측용 게스트 도우미: 임시 회원을 만들어 코드로 참가하고(join), 지시대로 샷을 치거나(shoot) 정리(cleanup)한다.
//   npx tsx scripts/sim-e2e/guest.ts join <code>        → 임시 회원 생성 + 참가, member id 출력
//   npx tsx scripts/sim-e2e/guest.ts shoot <matchId> <memberId> → 게스트 차례면 정면 샷 한 번
//   npx tsx scripts/sim-e2e/guest.ts cleanup <memberId>  → 임시 회원과 그 시뮬 데이터 삭제
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = process.env.E2E_BASE || "http://localhost:5001";
const secret = process.env.COOKIE_SECRET!;
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""))}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as any;
}
const [cmd, a, b] = process.argv.slice(2);
if (cmd === "join") {
  const store = (await db.execute(sql`select store_id from hiq_members where name='rankue' limit 1`)).rows[0] as any;
  const g = (await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-guest', '대전테스트') returning id`)).rows[0] as any;
  const r = await api(cookieFor(g.id), "POST", `/api/hiq/sim/matches/code/${a}/join`, { target: 3 });
  console.log(JSON.stringify({ memberId: g.id, status: r.status, matchStatus: r.data?.status, matchId: r.data?.id, turn: r.data?.turn }));
} else if (cmd === "shoot") {
  const m = await api(cookieFor(b), "GET", `/api/hiq/sim/matches/${a}`);
  const s = await api(cookieFor(b), "POST", `/api/hiq/sim/matches/${a}/shots`, { idx: m.data.shots, input: { cueBallId: "yellow", phi: Math.PI / 2, V0: 2.2, a: 0.15, b: 0.1, theta: 0 } });
  console.log(JSON.stringify({ status: s.status, code: s.code, outcome: s.data?.outcome?.code, turn: s.data?.turn, events: s.data?.events?.length }));
} else if (cmd === "cleanup") {
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where guest_id=${a})`);
  await db.execute(sql`delete from hiq_sim_matches where guest_id=${a} or (host_id=(select id from hiq_members where name='rankue' limit 1) and status in ('waiting','canceled'))`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id=${a}`);
  await db.execute(sql`delete from hiq_notifications where member_id=${a}`);
  await db.execute(sql`delete from hiq_members where id=${a}`);
  console.log("cleaned");
}
process.exit(0);
