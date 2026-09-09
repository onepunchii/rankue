/** UMB 랭킹 적재 현황(읽기만): 부문별 최신 회차·행 수·적재 시각. `npx tsx scripts/umb-state.ts` */
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
const rows = (await db.execute(sql`
  select category, edition_date, count(*)::int as players, min(created_at) as loaded_at
  from umb_rankings group by category, edition_date order by category, edition_date desc`)).rows as any[];
const seen: Record<string, number> = {};
for (const r of rows) {
  seen[r.category] = (seen[r.category] ?? 0) + 1;
  if (seen[r.category] <= 3) console.log(`${String(r.category).padEnd(8)} ${String(r.edition_date).slice(0, 10)}  선수 ${String(r.players).padStart(5)}  적재 ${String(r.loaded_at).slice(0, 19)}`);
}
console.log("부문별 회차 수:", JSON.stringify(seen));
process.exit(0);
