/**
 * 멀티방 개설 방송 e2e: 공개 방을 열면 기기 알림 가능한 회원에게 "멀티방이 열렸어요"가 가고,
 * 30분 안에 또 열면 건너뛴다(도배 방지). 비공개 방은 방송하지 않는다. 만든 알림은 전부 지운다.
 * `npx tsx scripts/sim-e2e/room-broadcast.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const TITLE = "멀티방이 열렸어요";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as any;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const count = async () => ((await db.execute(sql`select count(*)::int n from hiq_notifications where title=${TITLE} and created_at > now() - interval '10 minutes'`)).rows[0] as any).n as number;
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const host = ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-rb-h', '방송테스트') returning id`)).rows[0] as any).id as string;
const H = cookieFor(host);
try {
  await db.execute(sql`delete from hiq_notifications where title=${TITLE} and created_at > now() - interval '40 minutes'`);
  const before = await count();
  const priv = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  ok(priv.status === 201, "비공개 방 만들기");
  await sleep(1500);
  ok(await count() === before, "비공개 방은 방송하지 않는다");
  const pub = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 20, isPublic: true });
  ok(pub.status === 201, "멀티방 만들기");
  await sleep(2500);
  const sent = await count() - before;
  ok(sent > 0, `방송이 나갔다 (${sent}명)`);
  const one = (await db.execute(sql`select body, params from hiq_notifications where title=${TITLE} order by created_at desc limit 1`)).rows[0] as any;
  console.log("   문구:", one.body, "· 링크:", one.params?.url);
  ok(/방송테스트님이 3쿠션 · 대대 20점 방을 열었어요/.test(one.body), "누가 어떤 방을 열었는지 들어간다");
  ok(String(one.params?.url).includes("rooms=1"), "누르면 멀티방 목록으로");
  const again = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "4c", tableId: "JUNGDAE_KR", target: 30, isPublic: true });
  ok(again.status === 201, "곧바로 또 방 만들기");
  await sleep(2000);
  ok(await count() - before === sent, "30분 안에는 다시 방송하지 않는다(도배 방지)");
  console.log("ALL OK");
} finally {
  await sleep(500);
  await db.execute(sql`delete from hiq_notifications where title=${TITLE} and created_at > now() - interval '40 minutes'`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${host}`);
  await db.execute(sql`delete from hiq_notifications where member_id=${host}`);
  await db.execute(sql`delete from hiq_visit_logs where member_id=${host}`);
  await db.execute(sql`delete from hiq_members where id=${host}`);
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int n from hiq_members where id=${host}`)).rows[0] as any).n);
}
process.exit(0);
