/**
 * 연습 세션 성적 재계산(일회성, 2026-09-12).
 *
 * ⚠️ 같은 날 오후에 오너가 "연습은 다 빼자, 공식 멀티경기만 적용"으로 정해서 이 집계는 더 이상 쓰지 않는다.
 * 스크립트는 남겨 둔다 — 연습 기록을 다시 세어야 할 일이 생기면 이게 정본 계산이다.
 *
 * 왜: hiq_sim_ratings 의 솔로 집계가 **완료 이닝이 0인 세션을 통째로 버렸다**(upsertSoloRating 의 innings <= 0 조기 반환).
 * 한 이닝에 목표를 다 채운 판 — 예컨대 4구 999점 목표로 1000점에 끝낸 판 — 이 기록에 안 남았다(오너 제보).
 * 코드는 고쳤고(이닝 0 = 1이닝), 이 스크립트는 그동안 빠진 판까지 넣어 집계를 세션 기록과 맞춘다.
 *
 *   npx tsx scripts/backfill-sim-solo-stats.ts           # 미리보기(기본) — 아무것도 쓰지 않는다
 *   npx tsx scripts/backfill-sim-solo-stats.ts --apply   # 실제로 맞춘다
 *
 * 여러 번 돌려도 같다(세션에서 통째로 다시 센다). 대전 레이팅(hiq_sim_match_ratings)·드릴은 건드리지 않는다.
 * 저장 단위는 그대로 점수다(4구는 1캐롬 = 10점) — 화면이 읽을 때 캐롬으로 바꾼다(shared/sim/handicap.caromsOf).
 */
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const apply = process.argv.includes("--apply");

const rows = (await db.execute(sql`
    select member_id, game_type, table_id,
           count(*)::int as sessions,
           coalesce(sum(score), 0)::int as total_score,
           coalesce(sum(greatest(1, innings)), 0)::int as total_innings,
           coalesce(max(score::numeric / greatest(1, innings)), 0)::numeric as best_avg,
           coalesce(max(high_run), 0)::int as best_high_run
    from hiq_sim_sessions
    where status = 'finished' and kind = 'solo'
    group by member_id, game_type, table_id
`)).rows as Record<string, unknown>[];

const now = (await db.execute(sql`
    select member_id, game_type, table_id, sessions, total_score, total_innings, best_avg, best_high_run
    from hiq_sim_ratings
`)).rows as Record<string, unknown>[];
const key = (r: Record<string, unknown>) => `${r.member_id}|${r.game_type}|${r.table_id}`;
const cur = new Map(now.map((r) => [key(r), r]));
const names = new Map((await db.execute(sql`select id, name from hiq_members`)).rows.map((r: any) => [r.id as string, r.name as string]));

let changed = 0;
for (const r of rows) {
    const c = cur.get(key(r));
    const same = c && Number(c.sessions) === Number(r.sessions) && Number(c.total_score) === Number(r.total_score)
        && Number(c.total_innings) === Number(r.total_innings);
    if (same) continue;
    changed += 1;
    console.log(`${(names.get(String(r.member_id)) ?? "?").padEnd(8)} ${r.game_type} ${r.table_id}: `
        + `${c ? `${c.sessions}판 ${c.total_score}점/${c.total_innings}이닝` : "(없음)"} → ${r.sessions}판 ${r.total_score}점/${r.total_innings}이닝`);
    if (!apply) continue;
    await db.execute(sql`
        insert into hiq_sim_ratings (member_id, game_type, table_id, sessions, total_score, total_innings, best_avg, best_high_run, updated_at)
        values (${r.member_id}, ${r.game_type}, ${r.table_id}, ${r.sessions}, ${r.total_score}, ${r.total_innings}, ${r.best_avg}, ${r.best_high_run}, now())
        on conflict (member_id, game_type, table_id) do update set
            sessions = excluded.sessions, total_score = excluded.total_score, total_innings = excluded.total_innings,
            best_avg = excluded.best_avg, best_high_run = excluded.best_high_run, updated_at = now()
    `);
}
console.log(apply ? `맞춘 행 ${changed}개` : `다를 행 ${changed}개 (미리보기 — --apply 로 실제 반영)`);
process.exit(0);
