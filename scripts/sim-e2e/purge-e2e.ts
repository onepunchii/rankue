/** e2e 임시 회원(전화 '000-e2e-%') 과 딸린 기록을 지운다(읽고 지우기만, 실제 회원은 건드리지 않는다). */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const ids = ((await db.execute(sql`select id, name from hiq_members where phone like '000-e2e-%'`)).rows as { id: string; name: string }[]);
console.log("남은 임시 회원:", ids.length, ids.map((r) => r.name).join(", "));
for (const { id } of ids) {
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id=${id} or guest_id=${id})`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${id} or guest_id=${id}`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
  await db.execute(sql`delete from hiq_visit_logs where member_id=${id}`);
  await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
  await db.execute(sql`delete from hiq_members where id=${id}`);
}
console.log("정리 뒤 남은 수:", ((await db.execute(sql`select count(*)::int n from hiq_members where phone like '000-e2e-%'`)).rows[0] as { n: number }).n);
process.exit(0);
