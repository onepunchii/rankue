/** 4구 점수 감점이 언제 붙었는지(읽기만): 최근 샷의 판정 코드·점수와 그 방의 규칙. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const OWNER = process.argv[2] || "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const rows = (await db.execute(sql`
  select s.created_at, s.outcome_code, s.points, s.cushions, m.game_type, m.rules, m.id as match_id,
         (s.member_id = ${OWNER}) as mine
  from hiq_sim_match_shots s join hiq_sim_matches m on m.id = s.match_id
  where m.game_type = '4c' and (m.host_id = ${OWNER} or m.guest_id = ${OWNER})
  order by s.created_at desc limit 20`)).rows as any[];
for (const r of rows) {
  console.log(`${String(r.created_at).slice(5, 19)} ${r.mine ? "나 " : "상대"} ${String(r.outcome_code).padEnd(16)} 점수 ${String(r.points).padStart(4)}  쿠션 ${r.cushions}`);
}
const ruleSet = new Set(rows.map((r) => JSON.stringify(r.rules)));
console.log("이 방들의 4구 규칙:", [...ruleSet].join(" / "));
const neg = (await db.execute(sql`
  select s.outcome_code, count(*)::int n from hiq_sim_match_shots s join hiq_sim_matches m on m.id = s.match_id
  where m.game_type='4c' and s.points < 0 group by 1`)).rows;
console.log("감점이 붙은 판정(전체 4구):", JSON.stringify(neg));
process.exit(0);
