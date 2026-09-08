/** 멀티방 상태 점검(읽기만): 내 방 목록·상태별 개수·전체 대기 방. `npx tsx scripts/sim-e2e/rooms-audit.ts [memberId]` */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const who = process.argv[2] || "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
for (const r of (await db.execute(sql`select code, status, is_public, guest_id is not null as has_guest, created_at from hiq_sim_matches where host_id=${who} order by created_at desc limit 12`)).rows) console.log(JSON.stringify(r));
console.log("내 방 상태별:", JSON.stringify((await db.execute(sql`select status, count(*)::int n from hiq_sim_matches where host_id=${who} group by 1`)).rows));
console.log("전체 대기 방:", JSON.stringify((await db.execute(sql`select count(*)::int n, count(distinct host_id)::int hosts from hiq_sim_matches where status='waiting'`)).rows));
console.log("한 사람이 가진 대기 방 최대:", JSON.stringify((await db.execute(sql`select max(n)::int as max_per_host from (select count(*)::int n from hiq_sim_matches where status='waiting' group by host_id) x`)).rows));
process.exit(0);
