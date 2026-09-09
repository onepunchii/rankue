/**
 * 멀티방 참가 알림 e2e: 게스트가 방에 들어가면 방장에게 "대전 시작" 알림이 가는지(인앱 + 딥링크) 확인. 끝나면 정리.
 * `npx tsx scripts/sim-e2e/join-notify.ts [base]`
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
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as any;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as any).id as string;
const host = await mk("000-e2e-jn-h", "방장테스트"), guest = await mk("000-e2e-jn-g", "참가자테스트");
try {
  const created = await api(cookieFor(host), "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15, isPublic: true });
  const m = created.data;
  ok(created.status === 201, "방 만들기");
  const before = (await db.execute(sql`select count(*)::int n from hiq_notifications where member_id=${host}`)).rows[0] as any;
  const joined = await api(cookieFor(guest), "POST", `/api/hiq/sim/matches/${m.id}/join`, { target: 15 });
  ok(joined.status === 200 && joined.data.status === "playing", "멀티방 목록에서 참가 → 진행 중");
  await sleep(1200);
  const rows = (await db.execute(sql`select title, body, params from hiq_notifications where member_id=${host} order by created_at desc limit 3`)).rows as any[];
  console.log("   방장 알림함:", JSON.stringify(rows.map((r) => ({ t: r.title, b: String(r.body).slice(0, 40), url: r.params?.url }))));
  ok(rows.length > (before.n ?? 0), "방장에게 알림이 생겼다");
  ok(/참가자테스트/.test(rows[0]?.body ?? ""), "참가자 이름이 들어간다");
  ok(String(rows[0]?.params?.url ?? "").includes(`/online-game?match=${m.id}`), `누르면 그 대전으로 (${rows[0]?.params?.url})`);
  // 코드로 참가도 같은 경로인지
  console.log("ALL OK");
} finally {
  await sleep(400);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    await db.execute(sql`delete from hiq_visit_logs where member_id=${id}`);
    await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
    await db.execute(sql`delete from hiq_members where id=${id}`);
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int n from hiq_members where id in (${host}, ${guest})`)).rows[0] as any).n);
}
process.exit(0);
