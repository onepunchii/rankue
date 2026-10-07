/**
 * 어드민 · 회원 상세의 골프 칸 + 부킹매니저 켜기·끄기 — 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *
 * 회원 목록(getAllMembersForAdmin)에 골프 칸을 더하지 않고 여기서 따로 읽는다 — 목록은 전 회원 × 서브쿼리라 이미 무겁고,
 * 화면이 7일 동안 기기에 저장해 두는 응답(react-query 영속 캐시)이라 모양을 바꾸면 옛 캐시와 어긋난다. 시트를 열 때만 부른다.
 *
 * 노쇼·취소 횟수는 평판 정보다 — 관리자 라우트(checkSuperAdmin)만 이 파일을 부른다. 화면도 캐시에 남기지 않는다(gcTime 0).
 * 시각은 to_char(…'Z') 로 내보낸다: raw SQL 의 시간대 없는 timestamp 를 드라이버가 기기 시각으로 읽으면 9시간 어긋난다(admin.repo 의 lastSeenAt 과 같은 식).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { profiles } from "../../shared/schema.js";
import { bookingManagerSwitch, type AdminMemberGolf } from "../../shared/adminMemberGolf.js";
import { subAdminSwitch } from "../../shared/adminRole.js";

const ISO = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
const num = (v: unknown): number => Number(v ?? 0) || 0;
/** DB 기본값 0 은 '없음'이다(핸디·평균·베스트) */
const positiveOrNull = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const strOrNull = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

/** 회원 한 명의 골프 요약. 없는 회원이면 null. 질의 두 번(합계 한 문장 + 최근 기록 10건)을 동시에 보낸다. */
export async function getMemberGolfForAdmin(memberId: string): Promise<AdminMemberGolf | null> {
    const [aggRes, roundRes] = await Promise.all([
        db.execute(sql`
            select
              m.golf_grade, m.golf_avg_score, m.golf_best_score, m.total_golf_games, m.golf_handicap,
              p.role,
              h.rounds, h.verified, h.unverified, h.legacy, h.official, h.last_round_at,
              r.applications, r.accepted, r.pending, r.rejected, r.cancels, r.no_shows, r.last_applied_at,
              b.joins, b.bookings, b.personal, b.blinded, b.upcoming, b.last_posted_at
            from hiq_members m
            left join profiles p on p.id = m.profile_id
            cross join lateral (
              select count(*)::int as rounds,
                     count(*) filter (where on_site is true)::int as verified,
                     count(*) filter (where on_site is false)::int as unverified,
                     count(*) filter (where on_site is null)::int as legacy,
                     -- 공식 라운드: updateGolfStats 와 같은 규칙(점수 > 0 · 미인증 제외, 옛 기록은 인증으로 센다)
                     count(*) filter (where score > 0 and on_site is not false)::int as official,
                     ${ISO("max(created_at)")} as last_round_at
              from hiq_game_history
              where member_id = m.id and sport_category = 'GOLF'
            ) h
            cross join lateral (
              select count(*)::int as applications,
                     -- 노쇼는 승인된 신청에만 찍힌다(setJoinNoShow) — 승인 수에 넣어야 '승인 중 노쇼' 비율이 맞는다
                     count(*) filter (where status in ('accepted', 'noshow'))::int as accepted,
                     count(*) filter (where status = 'applied')::int as pending,
                     count(*) filter (where status = 'rejected')::int as rejected,
                     coalesce(sum(cancel_count), 0)::int as cancels,
                     coalesce(sum(no_show_count), 0)::int as no_shows,
                     ${ISO("max(created_at)")} as last_applied_at
              from golf_join_requests
              where member_id = m.id
            ) r
            cross join lateral (
              select count(*) filter (where listing_type = 'JOIN')::int as joins,
                     count(*) filter (where listing_type <> 'JOIN')::int as bookings,
                     count(*) filter (where listing_type <> 'JOIN' and seller_type = 'PERSONAL')::int as personal,
                     count(*) filter (where is_blinded)::int as blinded,
                     -- 티타임이 아직 안 지난 글(가려진 글 제외). datetime 은 UTC 벽시계라 now() 도 UTC 로 맞춘다
                     count(*) filter (where not is_blinded and datetime > (now() at time zone 'UTC'))::int as upcoming,
                     ${ISO("max(created_at)")} as last_posted_at
              from golf_bookings
              where owner_id = m.id
            ) b
            where m.id = ${memberId}::uuid
        `),
        db.execute(sql`
            select id, ${ISO("created_at")} as played_at, location_name, sub_type, score, on_site
            from hiq_game_history
            where member_id = ${memberId}::uuid and sport_category = 'GOLF'
            order by created_at desc
            limit 10
        `),
    ]);
    const a = (aggRes.rows as Record<string, unknown>[])[0];
    if (!a) return null;
    const rounds = (roundRes.rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        playedAt: strOrNull(r.played_at),
        course: strOrNull(r.location_name),
        subType: strOrNull(r.sub_type),
        score: num(r.score),
        onSite: r.on_site == null ? null : r.on_site === true,
    }));
    return {
        role: strOrNull(a.role),
        stats: {
            grade: strOrNull(a.golf_grade),
            avgScore: positiveOrNull(a.golf_avg_score),
            bestScore: positiveOrNull(a.golf_best_score),
            storedRounds: num(a.total_golf_games),
            officialRounds: num(a.official),
            handicap: positiveOrNull(a.golf_handicap),
            lastRoundAt: strOrNull(a.last_round_at),
        },
        onSite: { verified: num(a.verified), unverified: num(a.unverified), legacy: num(a.legacy), total: num(a.rounds) },
        rounds,
        reputation: {
            applications: num(a.applications),
            accepted: num(a.accepted),
            pending: num(a.pending),
            rejected: num(a.rejected),
            cancels: num(a.cancels),
            noShows: num(a.no_shows),
            lastAppliedAt: strOrNull(a.last_applied_at),
        },
        posts: {
            joins: num(a.joins),
            bookings: num(a.bookings),
            personalBookings: num(a.personal),
            blinded: num(a.blinded),
            upcoming: num(a.upcoming),
            lastPostedAt: strOrNull(a.last_posted_at),
        },
    };
}

export type BookingManagerResult =
    /** 바꿨다(from → role) */
    | { status: "changed"; from: string; role: string }
    /** 이미 그 값이었다 — 아무것도 안 바꿨다 */
    | { status: "same"; role: string }
    /** 사장님·관리자 같은 다른 역할이라 손대지 않았다 */
    | { status: "blocked"; role: string }
    /** 프로필이 없다 */
    | { status: "missing" };

/**
 * 부킹매니저 켜기·끄기. **지금 역할이 from 일 때만** to 로 바꾸는 한 문장이다(shared/adminMemberGolf 머리말) —
 * 읽고 나서 쓰면 그 사이에 매장 승인(store_owner 로 올림)이 끼어들었을 때 사장님 권한을 덮어쓴다.
 */
export async function setBookingManagerRole(profileId: string, on: boolean): Promise<BookingManagerResult> {
    const { from, to } = bookingManagerSwitch(on);
    const changed = await db.update(profiles)
        .set({ role: to, updatedAt: new Date() })
        .where(and(eq(profiles.id, profileId), eq(profiles.role, from)))
        .returning({ role: profiles.role });
    if (changed.length > 0) return { status: "changed", from, role: to };
    const [cur] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, profileId));
    if (!cur) return { status: "missing" };
    return cur.role === to ? { status: "same", role: to } : { status: "blocked", role: cur.role };
}

/**
 * 관리자(보기 전용) 임명·해제(2026-10-07) — user ↔ admin 사이만, "지금 값이 from 일 때만" 한 문장으로 바꾼다.
 * 사장님·부킹매니저·슈퍼관리자는 건드리지 않는다(blocked). 결과 꼴은 부킹매니저 스위치와 같다.
 */
export async function setSubAdminRole(profileId: string, on: boolean): Promise<BookingManagerResult> {
    const { from, to } = subAdminSwitch(on);
    const changed = await db.update(profiles)
        .set({ role: to, updatedAt: new Date() })
        .where(and(eq(profiles.id, profileId), eq(profiles.role, from)))
        .returning({ role: profiles.role });
    if (changed.length > 0) return { status: "changed", from, role: to };
    const [cur] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, profileId));
    if (!cur) return { status: "missing" };
    return cur.role === to ? { status: "same", role: to } : { status: "blocked", role: cur.role };
}
