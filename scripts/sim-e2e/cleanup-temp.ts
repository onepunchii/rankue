/** e2e 임시 회원(전화 '000-e2e-%') 잔여물 정리 — 알림·대전·샷·성적·세션·드릴·회원. 실전 테이블은 건드리지 않는다. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const rows = (await db.execute(sql`select id, name from hiq_members where phone like '000-e2e-%'`)).rows as { id: string; name: string }[];
console.log("temp members:", rows.map((r) => r.name).join(", ") || "(none)");
for (const { id } of rows) {
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id=${id} or guest_id=${id})`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${id} or guest_id=${id}`);
  await db.execute(sql`delete from hiq_sim_shots where session_id in (select id from hiq_sim_sessions where member_id=${id})`);
  await db.execute(sql`delete from hiq_sim_sessions where member_id=${id}`);
  await db.execute(sql`delete from hiq_sim_drill_attempts where member_id=${id}`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
  await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
  await db.execute(sql`delete from hiq_members where id=${id}`);
}
console.log("left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where phone like '000-e2e-%'`)).rows[0] as { n: number }).n);
process.exit(0);
