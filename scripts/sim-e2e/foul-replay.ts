/** 감점이 붙은 4구 샷을 그대로 재시뮬해 "내 공이 상대공을 직접 맞혔는지"를 본다(읽기만). */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { simulateShot, TABLES, DEFAULT_CUE } from "../../shared/sim";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const rows = (await db.execute(sql`
  select s.id, s.pre_state, s.input, s.outcome_code, s.points, s.member_id,
         m.rules, m.table_id, m.cushion_model, m.condition, m.host_id
  from hiq_sim_match_shots s join hiq_sim_matches m on m.id = s.match_id
  where m.game_type='4c' and s.points < 0 and (m.host_id=${OWNER} or m.guest_id=${OWNER})
  order by s.created_at desc limit 3`)).rows as any[];
for (const r of rows) {
  const params = { table: TABLES[r.table_id as "DAEDAE" | "JUNGDAE_KR"], cue: DEFAULT_CUE, cushionModel: r.cushion_model, condition: Number(r.condition) };
  const res = simulateShot(r.pre_state, r.input, params);
  const cue = r.input.cueBallId as string;
  const opp = cue === "white" ? "yellow" : "white";
  const order = res.events.filter((e: any) => e.type === "ball-ball").map((e: any) => e.ids.join("↔"));
  const direct = res.events.some((e: any) => e.type === "ball-ball" && e.ids.includes(cue) && e.ids.includes(opp));
  const passive = res.events.some((e: any) => e.type === "ball-ball" && e.ids.includes(opp) && !e.ids.includes(cue));
  console.log(`샷 ${String(r.id).slice(0, 8)} 큐볼 ${cue} · 규칙 간접파울 ${r.rules.passiveOpponentContactIsFoul}`);
  console.log(`  공끼리 접촉 순서: ${order.join(" → ") || "없음"}`);
  console.log(`  내 공이 상대공을 직접: ${direct ? "예" : "아니오"} · 적구가 상대공을 건드림(간접): ${passive ? "예" : "아니오"} → 판정 ${r.outcome_code} ${r.points}`);
}
process.exit(0);
