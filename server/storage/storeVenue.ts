/**
 * 테이블 QR 로 친 경기의 셈(2026-11-06 — shared/storeVenue). hiq_games.venue_store_id = 그 매장.
 *  · 사장님(대시보드 '우리 매장에서 친 경기'): 오늘 · 이번 달 판 수, 지금 치는 판, 이번 달 친 손님 수, 최근 손님 목록(이름 · 이번 달 판 · 마지막 날)
 *  · 공개(매장 페이지): 이번 달 판 수 · 지금 치는 판 · 이달의 에버 왕(3쿠션 랭킹전, 이번 달 VENUE_KING_MIN_GAMES 판 이상)
 * hiq_games.played_at 은 시간대 없는 UTC 다 — 한국 날짜 경계는 한국 자정에서 9시간을 뺀 값과 견준다.
 * 손님 목록에 전화번호는 싣지 않는다(우리 매장 회원이 아닌 손님도 있다 — 이름 · 판 수 · 날짜만).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { VENUE_KING_MIN_GAMES } from "../../shared/storeVenue.js";

const rowsOf = (r: unknown) => ((r as { rows?: any[] })?.rows ?? (r as any[])) as any[];
const KST_TODAY_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '9 hours')`;
const KST_MONTH_START = sql`(date_trunc('month', now() at time zone 'Asia/Seoul') - interval '9 hours')`;
/** '지금 치는 판' — 끝나지 않았고 4시간 안에 시작한 판(버려진 판이 오래 남지 않게) */
const LIVE = sql`g.status in ('playing_base', 'playing_finish') and g.played_at > now() at time zone 'UTC' - interval '4 hours'`;

export interface VenueKing { name: string; avg: number; games: number }
export interface VenuePublic { monthGames: number; live: number; king: VenueKing | null }
export interface VenuePlayer { memberId: string; name: string; monthGames: number; lastAt: string }
export interface VenueOwnerStats { today: number; month: number; live: number; monthPlayers: number; players: VenuePlayer[]; king: VenueKing | null }

async function venueKing(storeId: string): Promise<VenueKing | null> {
    const [k] = rowsOf(await db.execute(sql`
        select m.name, sum(h.score)::int as s, sum(h.innings)::int as i, count(*)::int as n
        from hiq_game_history h
        join hiq_games g on g.id = h.game_id
        join hiq_members m on m.id = h.member_id
        where g.venue_store_id = ${storeId} and g.game_type = '3c' and g.played_at >= ${KST_MONTH_START} and h.innings > 0
          -- 에버리지의 정본: 랭킹전(match · isRanked)만, sum(score)/sum(innings) — 연습 · 혼자 친 판은 빼야 왕이 부풀지 않는다
          and h.game_mode = 'match' and h.is_ranked
        group by m.id, m.name
        having count(*) >= ${VENUE_KING_MIN_GAMES}
        order by sum(h.score)::float / nullif(sum(h.innings), 0) desc nulls last
        limit 1`));
    if (!k || !(Number(k.i) > 0)) return null;
    return { name: String(k.name ?? ""), avg: Math.round((Number(k.s) / Number(k.i)) * 1000) / 1000, games: Number(k.n) };
}

/** 매장 페이지에 싣는 것 — 이번 달 판 수 · 지금 치는 판 · 이달의 에버 왕 */
export async function venuePublic(storeId: string): Promise<VenuePublic> {
    const [c] = rowsOf(await db.execute(sql`
        select count(*) filter (where g.played_at >= ${KST_MONTH_START})::int as month,
               count(*) filter (where ${LIVE})::int as live
        from hiq_games g where g.venue_store_id = ${storeId} and g.played_at >= ${KST_MONTH_START} - interval '1 day'`));
    return { monthGames: Number(c?.month ?? 0), live: Number(c?.live ?? 0), king: await venueKing(storeId) };
}

/** 사장님 대시보드 — 우리 매장에서 친 경기 · 손님 */
export async function venueOwnerStats(storeId: string): Promise<VenueOwnerStats> {
    const [c] = rowsOf(await db.execute(sql`
        select count(*) filter (where g.played_at >= ${KST_TODAY_START})::int as today,
               count(*) filter (where g.played_at >= ${KST_MONTH_START})::int as month,
               count(*) filter (where ${LIVE})::int as live
        from hiq_games g where g.venue_store_id = ${storeId} and g.played_at >= ${KST_MONTH_START} - interval '1 day'`));
    const players = rowsOf(await db.execute(sql`
        select m.id, m.name,
               count(*) filter (where g.played_at >= ${KST_MONTH_START})::int as month_games,
               to_char(max(g.played_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_at
        from hiq_games g
        cross join lateral (values (g.player1_id), (g.player2_id), (g.player3_id), (g.player4_id)) p(mid)
        join hiq_members m on m.id = p.mid
        where g.venue_store_id = ${storeId} and g.played_at >= now() at time zone 'UTC' - interval '90 days'
        group by m.id, m.name
        order by max(g.played_at) desc
        limit 60`));
    const list: VenuePlayer[] = players.map((r) => ({ memberId: String(r.id), name: String(r.name ?? ""), monthGames: Number(r.month_games ?? 0), lastAt: String(r.last_at ?? "") }));
    return {
        today: Number(c?.today ?? 0), month: Number(c?.month ?? 0), live: Number(c?.live ?? 0),
        monthPlayers: list.filter((p) => p.monthGames > 0).length,
        players: list,
        king: await venueKing(storeId),
    };
}
