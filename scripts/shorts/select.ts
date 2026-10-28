/**
 * 쇼츠 0단계 — 오늘 만들 경기 고르기. DB는 읽기만 한다.
 *
 *   npx tsx scripts/shorts/select.ts [days=7] [limit=10]
 *
 * 확인용 목록이다 — 매일 실제로 고르는 건 daily.ts. 점수식은 score.ts(레이팅 높고 비슷한 대결이 1순위).
 * 기권·탈주로 몇 샷 만에 끝난 경기는 영상거리가 없어 MIN_SHOTS 미만이면 뺀다. 공개 방에서 끝난 경기만.
 * 경기마다 쇼츠 한 편에 쓸 대표 샷(두 번째 적구 전 쿠션이 가장 많은 득점 샷)도 같이 고른다.
 */
import pg from "pg";
import { matchScore } from "./score";

const days = Number(process.argv[2] ?? 7);
const limit = Number(process.argv[3] ?? 10);
const MIN_SHOTS = 20;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("SET default_transaction_read_only = on");
const rows = (await db.query(`
  with fin as (
    select m.id, m.game_type, m.table_id, m.host_id, m.guest_id, m.winner_id, m.shots, m.last_shot_at
    from hiq_sim_matches m
    where m.status = 'finished' and m.is_public and m.guest_id is not null
      and m.last_shot_at > now() - ($1 || ' days')::interval
  ), sc as (
    select s.match_id, sum(case when s.player_index = 0 then s.points else 0 end) a, sum(case when s.player_index = 1 then s.points else 0 end) b,
           max(s.cushions) filter (where s.points > 0) best_cush
    from hiq_sim_match_shots s join fin on fin.id = s.match_id group by s.match_id
  ), best as (
    select distinct on (s.match_id) s.match_id, s.idx, s.cushions
    from hiq_sim_match_shots s join fin on fin.id = s.match_id
    where s.points > 0 order by s.match_id, s.cushions desc, s.idx desc
  )
  select fin.*, coalesce(ra.rating, 1000) ra, coalesce(rb.rating, 1000) rb, sc.a, sc.b, best.idx best_idx, best.cushions best_cush
  from fin join sc on sc.match_id = fin.id left join best on best.match_id = fin.id
  left join hiq_sim_match_ratings ra on ra.member_id = fin.host_id and ra.game_type = fin.game_type
  left join hiq_sim_match_ratings rb on rb.member_id = fin.guest_id and rb.game_type = fin.game_type
`, [String(days)])).rows;
await db.end();

const ranked = rows
    .filter((r) => r.shots >= MIN_SHOTS && Number(r.a) + Number(r.b) > 0)
    .map((r) => {
        const gap = Math.abs(r.ra - r.rb);
        const score = matchScore(r.ra, r.rb, Number(r.a), Number(r.b));
        return { matchId: r.id, game: r.game_type, table: r.table_id, ratings: [r.ra, r.rb], gap, final: `${r.a}:${r.b}`,
            shots: r.shots, bestShot: { idx: r.best_idx, cushions: r.best_cush }, score: Math.round(score), at: r.last_shot_at };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
console.log(JSON.stringify(ranked, null, 2));
