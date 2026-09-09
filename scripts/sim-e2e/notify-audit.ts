/** 대전 알림이 실제로 저장되는지 종류별로 확인(읽기만). 서버리스에서 응답 뒤 작업이 잘리면 여기 안 남는다. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
for (const r of (await db.execute(sql`
  select title, count(*)::int n, max(created_at) as last
  from hiq_notifications where created_at > now() - interval '7 days'
  group by title order by n desc limit 12`)).rows as any[]) {
  console.log(`${String(r.n).padStart(4)}건  ${String(r.last).slice(5, 16)}  ${r.title}`);
}
process.exit(0);
