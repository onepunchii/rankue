/** PBA 적재 현황(읽기만): 시즌별 선수 수 · 상세 갱신 시각. `npx tsx scripts/pba-state.ts` */
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
for (const r of (await db.execute(sql`select season, league, count(*)::int n from pba_season_ranks group by 1,2 order by season desc, league limit 8`)).rows as any[])
  console.log(`시즌 ${r.season} ${String(r.league).padEnd(6)} 선수 ${String(r.n).padStart(4)}`);
const d = (await db.execute(sql`select count(*)::int total, max(updated_at) as last_detail from pba_players`)).rows[0] as any;
console.log("선수:", JSON.stringify(d));
process.exit(0);
