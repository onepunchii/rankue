/** 4구 점수 단위 점검(읽기만): 다마수 대비 실제 득점 크기와 끝난 대전의 최종 점수. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const rows = (await db.execute(sql`
  select id, host_target, guest_target, rules, status,
         (state->'players'->0->>'score')::int as host_score,
         (state->'players'->1->>'score')::int as guest_score,
         shots
  from hiq_sim_matches where game_type='4c' and state is not null
  order by created_at desc limit 6`)).rows as any[];
for (const r of rows) {
  console.log(`다마수 ${r.host_target}/${r.guest_target} · 점수 ${r.host_score}:${r.guest_score} · 샷 ${r.shots} · ${r.status} · pointUnit ${r.rules?.pointUnit}`);
}
process.exit(0);
