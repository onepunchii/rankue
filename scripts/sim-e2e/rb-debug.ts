import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = "https://www.rankue.co.kr";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const TITLE = "멀티방이 열렸어요";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""));
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const host = ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-rbd', '방송디버그') returning id`)).rows[0] as any).id as string;
try {
  const recent = (await db.execute(sql`select title, created_at from hiq_notifications where title=${TITLE} order by created_at desc limit 3`)).rows;
  console.log("기존 같은 제목 알림:", JSON.stringify(recent));
  await db.execute(sql`delete from hiq_notifications where title=${TITLE}`);
  const r = await fetch(`${BASE}/api/hiq/sim/matches`, { method: "POST", headers: { "content-type": "application/json", cookie: `hiq_user_id=s%3A${host}.${sig(host)}` }, body: JSON.stringify({ gameType: "3c", tableId: "DAEDAE", target: 15, isPublic: true }) });
  console.log("방 만들기:", r.status);
  await new Promise((x) => setTimeout(x, 4000));
  const after = (await db.execute(sql`select count(*)::int n from hiq_notifications where title=${TITLE}`)).rows[0];
  console.log("방송된 알림 수:", JSON.stringify(after));
  const targets = (await db.execute(sql`select count(*)::int n from hiq_members m join profiles p on p.id=m.profile_id where p.push_token is not null and m.id <> ${host}`)).rows[0];
  console.log("대상이어야 할 회원 수:", JSON.stringify(targets));
} finally {
  await db.execute(sql`delete from hiq_notifications where title=${TITLE}`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${host}`);
  await db.execute(sql`delete from hiq_notifications where member_id=${host}`);
  await db.execute(sql`delete from hiq_members where id=${host}`);
}
process.exit(0);
