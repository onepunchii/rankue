import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { suggestPrimarySport, type PrimarySport } from "../../shared/primarySport.js";

/**
 * 주 종목을 아직 안 고른 회원의 기본값(2026-10-01) — 골프 라운드 기록·조인/부킹 글·신청이 하나라도 있으면 골프.
 * /me 가 고르기 전까지만 부른다(고른 뒤엔 안 부른다). 셋 다 '있나'만 보는 질의라 가볍다.
 */
export async function suggestedSportFor(memberId: string): Promise<PrimarySport> {
    const r: any = await db.execute(sql`select
        (select count(*) from (select 1 from hiq_game_history where member_id = ${memberId} and sport_category = 'GOLF' limit 1) a)::int as rounds,
        (select count(*) from (select 1 from golf_bookings where owner_id = ${memberId} limit 1) b)::int as posts,
        (select count(*) from (select 1 from golf_join_requests where member_id = ${memberId} limit 1) c)::int as requests`);
    const row = (r.rows ?? r)[0] ?? {};
    return suggestPrimarySport({ golfRounds: Number(row.rounds) || 0, golfPosts: Number(row.posts) || 0, golfRequests: Number(row.requests) || 0 });
}
