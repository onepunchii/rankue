/** 랭킹이 종목·테이블 넷으로 갈려 얼마나 비어 보이는지(읽기만). */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
for (const r of (await db.execute(sql`
  select game_type, table_id,
         count(*) filter (where matches >= 3)::int as ranked,
         count(*)::int as rated, sum(matches)::int as matches
  from hiq_sim_ratings group by 1,2 order by 1,2`)).rows as any[]) {
  console.log(`${r.game_type} · ${String(r.table_id).padEnd(11)} 랭킹 등재 ${String(r.ranked).padStart(2)}명 · 레이팅 보유 ${String(r.rated).padStart(2)}명 · 누적 ${r.matches}판`);
}
const t = (await db.execute(sql`select count(distinct member_id)::int as people from hiq_sim_ratings where matches > 0`)).rows[0] as any;
console.log("대전을 한 번이라도 한 사람:", JSON.stringify(t));
process.exit(0);
