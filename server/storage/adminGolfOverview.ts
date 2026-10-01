/**
 * 골프 현황 숫자(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 어드민 '골프 현황' 한 화면이 1분마다 부른다 — 그래서 묶음(라운드·조인/부킹·사진·골프장·회원권·시세)마다 SQL 한 번,
 * 여섯 번을 **나란히** 보낸다(왕복 한 번 시간 — 운영 DB 로 실측 약 0.2초, 첫 연결 포함 0.9초).
 * 한 묶음이 실패해도 나머지는 보인다(그 묶음만 null + failed 에 이름).
 *
 * 시각 규칙(admin.repo 와 같다): timestamp 칸은 UTC 벽시계로 저장된다. "오늘"은 한국 날짜 0시를 UTC 로 바꿔 비교하고,
 * 7일·30일은 **오늘을 포함한 한국 날짜 7일·30일**이다. JS Date 를 raw sql 에 넣지 않는다 — KST 기기에서 9시간 밀린다.
 * 화면에 내보낼 시각은 SQL 에서 바로 ISO 문자열로 만든다(드라이버가 timestamp 를 지역 시각으로 읽는 함정).
 *
 * 연락처(manager_phone·contact)는 하나도 읽지 않는다 — 숫자만.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { isUrgentJoin, URGENT_MAX_FEE, type UrgentJoinLike } from "../../shared/golfJoin.js";

const NOW = sql`(now() at time zone 'UTC')`;
const KST_TODAY_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '9 hours')`;
const KST_7D_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '6 days' - interval '9 hours')`;
const KST_30D_START = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') - interval '29 days' - interval '9 hours')`;
const ISO = (col: SQL) => sql`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const UUID_RE_SQL = sql.raw(`'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`);

/** 대기방이 이만큼 넘으면 멈춘 방 */
export const STALE_WAITING_HOURS = 6;
/** 진행 중인데 이만큼 손대지 않았으면 멈춘 방 — 홈 '진행 중 라운드' 카드가 숨기는 기준(golf.repo ACTIVE_TTL_MS)과 같다 */
export const STALE_PLAYING_HOURS = 12;

const n = (v: unknown) => Number(v ?? 0) || 0;
const firstRow = (r: any): Record<string, unknown> => ((r?.rows ?? r) as any[])[0] ?? {};

// ── 타입 ─────────────────────────────────────────────────────────

export interface RoundsStats {
    finishedToday: number; finished7d: number; finished30d: number;
    /** 30일 안에 방장이 접은 방 */
    abandoned30d: number;
    playing: number; waiting: number;
    stale: number; staleWaiting: number; stalePlaying: number;
    /** 30일 안에 시작한(진행·끝남) 방에 든 회원 수(게스트 제외) */
    golfers30d: number;
    /** 30일 기록(hiq_game_history GOLF — 18홀을 다 적은 회원 한 명당 한 줄)과 그 회원 수 */
    records30d: number; recorders30d: number;
    /** 30일 기록의 현장 인증: true · false · null(규칙 전 옛 기록) */
    onSite: { verified: number; unverified: number; legacy: number };
}

export interface ListingsStats {
    upcomingJoin: number; upcomingBooking: number;
    /** 다가오는 글 중 티오프가 한국 날짜로 오늘인 것 */
    upcomingJoinToday: number; upcomingBookingToday: number;
    createdToday: number; createdTodayJoin: number; createdTodayBooking: number;
    /** 아직 호스트가 정하지 않은 신청 — 다가오는 글만 / 지난 글 포함 */
    appliedUpcoming: number; appliedTotal: number;
    blinded: number; blindedUpcoming: number;
    /** 오늘 티의 긴급 조인(shared isUrgentJoin) — 올린 때 긴급이었거나 지금 긴급인 것 / 지금 긴급 배지가 붙은 것 */
    urgentToday: number; urgentNow: number;
    /** 7일 긴급 방송: 글 수 · 받은 사람(알림함 행) */
    urgentPosts7d: number; urgentRecipients7d: number;
    /** 7일 관심 골프장 알림(같은 GOLF_URGENT 형식, params.watchSlug 로 가른다) */
    watchAlerts7d: number;
}

export interface PhotosStats { total: number; public: number; hidden: number; appealsOpen: number; uploaded7d: number; uploadedToday: number }

export interface CoursesStats {
    pages: number; withLogo: number; withWebsite: number; withPhone: number; withCourses: number; withClub: number;
    /** rankue_golf_courses — 9홀 코스 한 줄. 파 9개가 다 있는 것 */
    nines: number; ninesWithPars: number;
    clubs: number; clubsNoCoords: number;
    /**
     * 명부에도, 그 명부에 이어진 골프장 페이지에도 좌표가 없는 곳 — 현장 인증(golf.repo courseCoordsFor)이 이름 열쇠까지
     * 뒤져도 못 찾을 가능성이 큰 곳이다(이름 열쇠는 SQL 로 못 따라가 상한값이다).
     */
    clubsNoCoordsAnywhere: number;
    watches: number; watchers: number;
}

export interface OrdersStats { pending: number; contacted: number; oldestPendingAt: string | null }

export interface PriceFeedRow { asOf: string | null; items: number; updatedAt: string | null }

export type PriceFeedState = "ok" | "late" | "stopped";
export interface PriceFeedHealth extends PriceFeedRow {
    state: PriceFeedState;
    /** 기준일이 한국 날짜로 며칠 전 */
    asOfAgeDays: number | null;
    /** 마지막으로 우리 DB 에 쓴 지 몇 시간(소수 한 자리) */
    syncAgeHours: number | null;
    /** 무엇이 문제인가 — 짧게(정상이면 빈 문자열) */
    reason: string;
    detail: string;
}

export interface GolfOverviewStats {
    rounds: RoundsStats | null;
    listings: ListingsStats | null;
    photos: PhotosStats | null;
    courses: CoursesStats | null;
    orders: OrdersStats | null;
    priceRow: PriceFeedRow | null;
    /** 못 읽은 묶음 이름 */
    failed: string[];
}

// ── 순수 판정 ─────────────────────────────────────────────────────

/**
 * 회원권 시세 상태. 크론 golf-prices 는 매일 12:40 UTC(21:40 KST, TGM 이 20시에 갱신한 뒤)에 돌고, 쓸 때마다 모든 종목의
 * updated_at 을 찍는다(writePrices) → 마지막으로 쓴 때가 30시간(하루 + 6시간) 넘으면 **멈춤**.
 * 기준일(as_of)은 거래소 시세라 주말·연휴엔 안 바뀐다 — 토·일 + 사흘 연휴 = 닷새, 하루 더 봐서 6일 넘으면 **늦음**.
 */
export const PRICE_SYNC_LIMIT_HOURS = 30;
export const PRICE_ASOF_LIMIT_DAYS = 6;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const round1 = (x: number) => Math.round(x * 10) / 10;
const kstDay = (ms: number) => new Date(ms + 9 * HOUR_MS).toISOString().slice(0, 10);

export function judgePriceFeed(row: PriceFeedRow, nowMs: number): PriceFeedHealth {
    const upMs = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
    const syncAgeHours = Number.isFinite(upMs) ? round1(Math.max(0, nowMs - upMs) / HOUR_MS) : null;
    const asOfMs = row.asOf && /^\d{4}-\d{2}-\d{2}$/.test(row.asOf) ? Date.parse(`${row.asOf}T00:00:00Z`) : NaN;
    const asOfAgeDays = Number.isFinite(asOfMs) ? Math.max(0, Math.round((Date.parse(`${kstDay(nowMs)}T00:00:00Z`) - asOfMs) / DAY_MS)) : null;
    let state: PriceFeedState = "ok";
    let reason = "";
    let detail: string;
    if (row.items === 0 || syncAgeHours === null) {
        state = "stopped";
        reason = detail = "시세가 하나도 없음";
    } else if (syncAgeHours > PRICE_SYNC_LIMIT_HOURS) {
        state = "stopped";
        reason = `${PRICE_SYNC_LIMIT_HOURS}시간 넘게 새로 못 받음`;
        detail = `마지막 반영 ${syncAgeHours < 48 ? `${Math.round(syncAgeHours)}시간` : `${Math.floor(syncAgeHours / 24)}일`} 전(기준 ${PRICE_SYNC_LIMIT_HOURS}시간)`;
    } else if (asOfAgeDays !== null && asOfAgeDays > PRICE_ASOF_LIMIT_DAYS) {
        state = "late";
        reason = `기준일이 ${PRICE_ASOF_LIMIT_DAYS}일 넘게 그대로 — TGM 쪽 시세가 안 바뀜`;
        detail = `기준일이 ${asOfAgeDays}일 전(기준 ${PRICE_ASOF_LIMIT_DAYS}일) — TGM 쪽 시세가 안 바뀜`;
    } else {
        detail = `기준일 ${row.asOf ?? "-"} · ${row.items}종목`;
    }
    return { ...row, state, asOfAgeDays, syncAgeHours, reason, detail };
}

/** 긴급 조인 후보 한 줄(SQL 이 ISO 문자열로 준다) */
export interface UrgentCandidate extends UrgentJoinLike { createdAt: string }

/**
 * 오늘 티의 긴급 조인 수 — 판정은 shared isUrgentJoin 하나(배지·전체 방송과 같은 규칙).
 *  - now: 지금 긴급 배지가 붙은 글(티오프까지 2시간 넘게 남은 것만).
 *  - today: 올린 순간 긴급이었던 글(= 방송이 나갔을 글) + 지금 긴급인 글. 티가 가까워 배지가 떨어진 글도 오늘 몫으로 센다.
 */
export function countUrgent(candidates: readonly UrgentCandidate[], nowMs: number): { today: number; now: number } {
    let today = 0, now = 0;
    for (const c of candidates) {
        const isNow = isUrgentJoin(c, nowMs);
        const created = Date.parse(c.createdAt);
        const atPost = Number.isFinite(created) && isUrgentJoin(c, created);
        if (isNow) now++;
        if (isNow || atPost) today++;
    }
    return { today, now };
}

// ── 묶음별 SQL(읽기만) ────────────────────────────────────────────

async function loadRounds(): Promise<RoundsStats> {
    const row = firstRow(await db.execute(sql`
        with s as (
            select
                count(*) filter (where status = 'finished' and coalesce(finished_at, updated_at) >= ${KST_TODAY_START})::int as finished_today,
                count(*) filter (where status = 'finished' and coalesce(finished_at, updated_at) >= ${KST_7D_START})::int as finished_7d,
                count(*) filter (where status = 'finished' and coalesce(finished_at, updated_at) >= ${KST_30D_START})::int as finished_30d,
                count(*) filter (where status = 'abandoned' and updated_at >= ${KST_30D_START})::int as abandoned_30d,
                count(*) filter (where status = 'playing')::int as playing,
                count(*) filter (where status = 'waiting')::int as waiting,
                count(*) filter (where status = 'waiting' and created_at < ${NOW} - make_interval(hours => ${STALE_WAITING_HOURS}))::int as stale_waiting,
                count(*) filter (where status = 'playing' and updated_at < ${NOW} - make_interval(hours => ${STALE_PLAYING_HOURS}))::int as stale_playing
            from golf_match_sessions
        ), g as (
            select count(distinct p.v ->> 'memberId')::int as golfers_30d
            from golf_match_sessions m
            cross join lateral jsonb_array_elements(case when jsonb_typeof(m.players) = 'array' then m.players else '[]'::jsonb end) as p(v)
            where m.status in ('playing', 'finished') and m.created_at >= ${KST_30D_START}
              and (p.v ->> 'memberId') ~* ${UUID_RE_SQL}
        ), h as (
            select count(*)::int as records_30d,
                   count(distinct member_id)::int as recorders_30d,
                   count(*) filter (where on_site is true)::int as on_site_true,
                   count(*) filter (where on_site is false)::int as on_site_false,
                   count(*) filter (where on_site is null)::int as on_site_null
            from hiq_game_history
            where sport_category = 'GOLF' and created_at >= ${KST_30D_START}
        )
        select * from s, g, h`));
    const staleWaiting = n(row.stale_waiting), stalePlaying = n(row.stale_playing);
    return {
        finishedToday: n(row.finished_today), finished7d: n(row.finished_7d), finished30d: n(row.finished_30d),
        abandoned30d: n(row.abandoned_30d),
        playing: n(row.playing), waiting: n(row.waiting),
        stale: staleWaiting + stalePlaying, staleWaiting, stalePlaying,
        golfers30d: n(row.golfers_30d),
        records30d: n(row.records_30d), recorders30d: n(row.recorders_30d),
        onSite: { verified: n(row.on_site_true), unverified: n(row.on_site_false), legacy: n(row.on_site_null) },
    };
}

async function loadListings(nowMs: number): Promise<ListingsStats> {
    // 긴급 방송 알림 = type GOLF_URGENT 중 watchSlug 가 없는 것(관심 골프장 알림은 watchSlug 를 단다 — golfCourseWatch.ts).
    // 글 하나에 받은 사람 수만큼 행이 생기고, params.url 이 글마다 하나다.
    const row = firstRow(await db.execute(sql`
        select
            count(*) filter (where listing_type = 'JOIN' and datetime >= ${NOW} and not is_blinded)::int as upcoming_join,
            count(*) filter (where listing_type = 'BOOKING' and datetime >= ${NOW} and not is_blinded)::int as upcoming_booking,
            count(*) filter (where listing_type = 'JOIN' and datetime >= ${NOW} and datetime < ${KST_TODAY_START} + interval '1 day' and not is_blinded)::int as upcoming_join_today,
            count(*) filter (where listing_type = 'BOOKING' and datetime >= ${NOW} and datetime < ${KST_TODAY_START} + interval '1 day' and not is_blinded)::int as upcoming_booking_today,
            count(*) filter (where created_at >= ${KST_TODAY_START})::int as created_today,
            count(*) filter (where created_at >= ${KST_TODAY_START} and listing_type = 'JOIN')::int as created_today_join,
            count(*) filter (where is_blinded)::int as blinded,
            count(*) filter (where is_blinded and datetime >= ${NOW})::int as blinded_upcoming,
            (select count(*) from golf_join_requests r join golf_bookings b on b.id = r.booking_id
               where r.status = 'applied' and b.datetime >= ${NOW} and not b.is_blinded)::int as applied_upcoming,
            (select count(*) from golf_join_requests r where r.status = 'applied')::int as applied_total,
            (select count(*) from hiq_notifications x
               where x.type = 'GOLF_URGENT' and x.params ->> 'watchSlug' is null and x.created_at >= ${KST_7D_START})::int as urgent_recipients_7d,
            (select count(distinct x.params ->> 'url') from hiq_notifications x
               where x.type = 'GOLF_URGENT' and x.params ->> 'watchSlug' is null and x.created_at >= ${KST_7D_START})::int as urgent_posts_7d,
            (select count(*) from hiq_notifications x
               where x.type = 'GOLF_URGENT' and x.params ->> 'watchSlug' is not null and x.created_at >= ${KST_7D_START})::int as watch_alerts_7d,
            (select coalesce(json_agg(c), '[]'::json) from (
                select listing_type as "listingType", join_type as "joinType", cost_mode as "costMode", green_fee as "greenFee",
                       ${ISO(sql`datetime`)} as "datetime", ${ISO(sql`created_at`)} as "createdAt"
                from golf_bookings
                where listing_type = 'JOIN' and join_type = 'FIELD' and cost_mode = 'FIXED' and not is_blinded
                  and green_fee between 0 and ${URGENT_MAX_FEE}
                  and datetime >= ${KST_TODAY_START} and datetime < ${KST_TODAY_START} + interval '1 day'
                order by created_at desc
                limit 500
            ) c) as urgent_candidates
        from golf_bookings`));
    const raw = row.urgent_candidates;
    const candidates: UrgentCandidate[] = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
    const urgent = countUrgent(candidates, nowMs);
    const createdToday = n(row.created_today), createdTodayJoin = n(row.created_today_join);
    return {
        upcomingJoin: n(row.upcoming_join), upcomingBooking: n(row.upcoming_booking),
        upcomingJoinToday: n(row.upcoming_join_today), upcomingBookingToday: n(row.upcoming_booking_today),
        createdToday, createdTodayJoin, createdTodayBooking: createdToday - createdTodayJoin,
        appliedUpcoming: n(row.applied_upcoming), appliedTotal: n(row.applied_total),
        blinded: n(row.blinded), blindedUpcoming: n(row.blinded_upcoming),
        urgentToday: urgent.today, urgentNow: urgent.now,
        urgentPosts7d: n(row.urgent_posts_7d), urgentRecipients7d: n(row.urgent_recipients_7d),
        watchAlerts7d: n(row.watch_alerts_7d),
    };
}

async function loadPhotos(): Promise<PhotosStats> {
    // 이의제기 열림 = 가려진 뒤에 낸 것(golfPhoto.repo 의 appealed 와 같은 식). 가려지기 전의 옛 이의제기는 세지 않는다.
    const row = firstRow(await db.execute(sql`
        select count(*)::int as total,
               count(*) filter (where is_public and hidden_at is null)::int as public,
               count(*) filter (where hidden_at is not null)::int as hidden,
               count(*) filter (where hidden_at is not null and appeal_at is not null and appeal_at >= hidden_at)::int as appeals_open,
               count(*) filter (where created_at >= ${KST_7D_START})::int as uploaded_7d,
               count(*) filter (where created_at >= ${KST_TODAY_START})::int as uploaded_today
        from golf_round_photos`));
    return {
        total: n(row.total), public: n(row.public), hidden: n(row.hidden), appealsOpen: n(row.appeals_open),
        uploaded7d: n(row.uploaded_7d), uploadedToday: n(row.uploaded_today),
    };
}

async function loadCourses(): Promise<CoursesStats> {
    // courses 칸은 SQL NULL · JSON null · 배열이 섞여 있다(2026-10-01 실측) — jsonb_array_length 는 배열일 때만.
    // AND 는 평가 순서를 보장하지 않아 case 로 감싼다(스칼라에 부르면 쿼리 전체가 터진다).
    const row = firstRow(await db.execute(sql`
        select count(*)::int as pages,
               count(*) filter (where coalesce(logo, '') <> '')::int as with_logo,
               count(*) filter (where coalesce(website, '') <> '')::int as with_website,
               count(*) filter (where coalesce(phone, '') <> '')::int as with_phone,
               count(*) filter (where case when jsonb_typeof(courses) = 'array' then jsonb_array_length(courses) else 0 end > 0)::int as with_courses,
               count(*) filter (where club_id is not null)::int as with_club,
               (select count(*) from rankue_golf_courses)::int as nines,
               (select count(*) from rankue_golf_courses c
                  where case when jsonb_typeof(c.pars) = 'array' then jsonb_array_length(c.pars) else 0 end >= 9)::int as nines_with_pars,
               (select count(*) from rankue_golf_clubs)::int as clubs,
               (select count(*) from rankue_golf_clubs k where k.latitude is null or k.longitude is null)::int as clubs_no_coords,
               (select count(*) from rankue_golf_clubs k where (k.latitude is null or k.longitude is null)
                  and not exists (select 1 from golf_course_pages q where q.club_id = k.id and q.lat is not null and q.lng is not null))::int as clubs_no_coords_any,
               (select count(*) from golf_course_watches)::int as watches,
               (select count(distinct w.member_id) from golf_course_watches w)::int as watchers
        from golf_course_pages`));
    return {
        pages: n(row.pages), withLogo: n(row.with_logo), withWebsite: n(row.with_website), withPhone: n(row.with_phone),
        withCourses: n(row.with_courses), withClub: n(row.with_club),
        nines: n(row.nines), ninesWithPars: n(row.nines_with_pars),
        clubs: n(row.clubs), clubsNoCoords: n(row.clubs_no_coords), clubsNoCoordsAnywhere: n(row.clubs_no_coords_any),
        watches: n(row.watches), watchers: n(row.watchers),
    };
}

async function loadOrders(): Promise<OrdersStats> {
    const row = firstRow(await db.execute(sql`
        select count(*) filter (where status = 'PENDING')::int as pending,
               count(*) filter (where status = 'CONTACTED')::int as contacted,
               ${ISO(sql`min(created_at) filter (where status = 'PENDING')`)} as oldest_pending_at
        from golf_membership_orders`));
    return { pending: n(row.pending), contacted: n(row.contacted), oldestPendingAt: row.oldest_pending_at ? String(row.oldest_pending_at) : null };
}

async function loadPriceRow(): Promise<PriceFeedRow> {
    // as_of 는 date 칸 — 드라이버가 Date 로 읽으면 KST 기기에서 하루 전날로 보인다. 글자로 바로 받는다.
    const row = firstRow(await db.execute(sql`
        select to_char(max(as_of), 'YYYY-MM-DD') as as_of,
               count(*)::int as items,
               ${ISO(sql`max(updated_at)`)} as updated_at
        from golf_membership_prices`));
    return { asOf: row.as_of ? String(row.as_of) : null, items: n(row.items), updatedAt: row.updated_at ? String(row.updated_at) : null };
}

/** 한 묶음이 실패해도 나머지는 보이게 — 실패는 서버 로그 + failed 에 이름만. */
async function safe<T>(label: string, failed: string[], run: () => Promise<T>): Promise<T | null> {
    try {
        return await run();
    } catch (e) {
        console.error(`[admin/golf/overview] ${label}`, (e as Error)?.message ?? e);
        failed.push(label);
        return null;
    }
}

export async function loadGolfOverview(nowMs = Date.now()): Promise<GolfOverviewStats> {
    const failed: string[] = [];
    const [rounds, listings, photos, courses, orders, priceRow] = await Promise.all([
        safe("rounds", failed, loadRounds),
        safe("listings", failed, () => loadListings(nowMs)),
        safe("photos", failed, loadPhotos),
        safe("courses", failed, loadCourses),
        safe("orders", failed, loadOrders),
        safe("prices", failed, loadPriceRow),
    ]);
    return { rounds, listings, photos, courses, orders, priceRow, failed };
}
