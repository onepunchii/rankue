import { db } from "../db.js";
import { URGENT_MAX_FEE, URGENT_MIN_LEAD_MS, convertibleSeats, conversionSlots, recruitCondition, type SlotGender } from "../../shared/golfJoin.js";
import {
    golfBookings,
    golfJoinRequests,
    golfJoins,
    golfMatchSessions,
    hiqGameHistory,
    hiqCourseHoleInfo,
    hiqMembers,
    profiles,
    golfClubs,
    golfClubCourses,
    rankueGolfClubs,
    golfCoursePages,
    rankueGolfCourses,
    golfMembershipOrders
} from "../../shared/schema.js";
import type {
    InsertGolfBooking,
    GolfBooking,
    InsertGolfJoin,
    GolfJoin,
    HiqGameHistory,
    GolfClub,
    InsertGolfClub,
    GolfClubCourse,
    InsertGolfClubCourse,
    RankueGolfClub,
    RankueGolfCourse,
    InsertGolfMembershipOrder,
    GolfMembershipOrder
} from "../../shared/schema.js";
import { eq, ne, desc, asc, and, or, sql, gte, lte, isNull, like, ilike, inArray } from "drizzle-orm";
import { notFound, conflict, badRequest } from "../utils/errors.js";
import { resolveGolfRegionCode, expandRegionCodes, legacyRegionKeywords, passportRegionGroup } from "../../shared/golfRegions.js";
import { golfRegionCodeByCourseId } from "../../shared/golfCourseRegions.js";
import { courseNameKey } from "../../shared/golfCourse.js";
import {
    resolvePars, sanitizeScores, isCompleteRound, roundTotals, settleMatch, rulesFor, isGuestId, GUEST_PREFIX, rankRound,
    type CoursePars,
} from "../../shared/golfMatch.js";

/** 대기방 핀이 살아 있는 시간. 지나면 그 핀으로는 못 들어온다(방장은 홈의 '진행 중 라운드' 로 돌아온다). */
const PIN_TTL_MS = 6 * 3600_000;
/** 진행 중 경기를 이어하기·재입장 대상으로 보는 시간(마지막으로 손댄 때부터). */
const ACTIVE_TTL_MS = 12 * 3600_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blankPenalties = () => Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }));
const PENALTY_KEYS = ["ob", "hz", "hazard", "bunk", "putt3"] as const;
/** 벌타 칸은 알려진 이름의 참/거짓만 남긴다. 모양이 틀리면 null(기존 값을 둔다). */
function sanitizePenalties(v: unknown): Record<string, boolean>[] | null {
    if (!Array.isArray(v) || v.length !== 18) return null;
    return v.map((h) => {
        const o: Record<string, boolean> = {};
        if (h && typeof h === "object") for (const k of PENALTY_KEYS) if (k in (h as any)) o[k] = !!(h as any)[k];
        return o;
    });
}

export interface GolfMatchCreateInput {
    courseId?: string | null;
    courseName?: string | null;
    gameMode: "stroke" | "skins";
    strokeMode?: "solo" | "group" | null;
    stake?: number;
    useDouble?: boolean;
    doublingMode?: "none" | "current" | "next";
    birdieAmount?: number;
    eagleAmount?: number;
    frontCourseName?: string | null;
    backCourseName?: string | null;
    /** 앱이 없는 동반자 이름(최대 3명). 기록·통계에는 들어가지 않고 이 경기 점수판에만 있다. */
    guests?: string[];
}

export const GOLF_GRADES = [
    { id: 'ALBATROSS', label: 'Albatross', minHandi: -Infinity, maxHandi: 0, icon: '🏆', color: '#c0c0c0' },
    { id: 'EAGLE', label: 'Eagle', minHandi: 1, maxHandi: 9, icon: '🦅', color: '#FFD700' },
    { id: 'BIRDIE', label: 'Birdie', minHandi: 10, maxHandi: 18, icon: '🐦', color: '#10b981' },
    { id: 'PAR', label: 'Par', minHandi: 19, maxHandi: 27, icon: '⭕', color: '#3b82f6' },
    { id: 'BOGEY', label: 'Bogey', minHandi: 28, maxHandi: 36, icon: '⬜', color: '#94a3b8' },
    { id: 'ROOKIE', label: 'Rookie', minHandi: 37, maxHandi: Infinity, icon: '🐣', color: '#CD7F32' },
];

/**
 * 목록·날짜 배지가 **같은 조건**을 쓰게 만드는 한 곳.
 *
 * 왜 필요했나: 날짜 칩의 "12개" 는 /bookings/counts 가 세는데, 그 라우트는 지역·시간·가격·옵션
 * 필터를 통째로 무시했다. 필터를 걸어 목록이 2개로 줄어도 칩은 계속 12개라고 말했다(2026-09-09 검토).
 * 게다가 시간·가격·옵션은 서버가 아예 안 걸고 화면에서만 걸러서, 세는 쪽과 보여 주는 쪽이 다른 규칙이었다.
 *
 * 판정은 화면(BookingList.tsx 의 filteredTimes)과 글자 그대로 같게 맞춘다:
 *  - 1부는 한국시각 12시 이전, 2부는 17시 이전, 3부는 그 뒤
 *  - 가격 칩의 sort_* 는 정렬용이라 거르는 조건이 아니다
 *  - 옵션은 고른 것 중 **하나라도** 있으면 통과
 */
function buildGolfFilterConditions(filters: any): any[] {
    const out: any[] = [];
    const list = (v: unknown): string[] =>
        typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v.map(String) : [];

    // 지역 — 넣을 때 굳혀 둔 region_code 로 본다. 코드가 없는 옛 행만 예전처럼 문자열로 되짚는다.
    const regions = list(filters?.region);
    if (regions.length > 0) {
        const codes = expandRegionCodes(regions);
        const words = legacyRegionKeywords(regions);
        const byCode = codes.length > 0 ? inArray(golfBookings.regionCode, codes) : undefined;
        const byText = words.length > 0
            ? and(isNull(golfBookings.regionCode), or(...words.map((w) => like(golfBookings.region, `%${w}%`))))
            : undefined;
        const both = [byCode, byText].filter(Boolean) as any[];
        // 아는 칩이 하나도 없으면(장난 값) 조건을 안 건다 — 빈 inArray 로 전부 지우는 사고를 막는다.
        if (both.length > 0) out.push(both.length === 1 ? both[0] : or(...both));
    }

    // 조인 종류(필드/스크린/파크). 옛 글(null)은 필드로 본다.
    const joinType = typeof filters?.joinType === "string" ? filters.joinType : "";
    if (joinType === "FIELD") out.push(or(isNull(golfBookings.joinType), eq(golfBookings.joinType, "FIELD")));
    else if (joinType === "SCREEN" || joinType === "PARK") out.push(eq(golfBookings.joinType, joinType));

    // 시간대 — 한국시각 기준. 'all' 은 거르지 않는다는 뜻이다.
    const times = list(filters?.time).filter((t) => t !== "all");
    if (times.length > 0) {
        const kstHour = sql<number>`extract(hour from (${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))`;
        const spans: any[] = [];
        // 경계 11시·15시 — 화면의 golfTimeSpan(client/src/golf/lib/bookingFilter.ts)과 **반드시 같아야** 한다.
        // 한쪽만 고치면 날짜 띠 배지에 3건인데 열면 1건이 나온다(2026-09-23 오너가 정한 관행 기준).
        if (times.includes("morning")) spans.push(sql`${kstHour} < 11`);
        if (times.includes("afternoon")) spans.push(sql`${kstHour} >= 11 AND ${kstHour} < 15`);
        if (times.includes("night")) spans.push(sql`${kstHour} >= 15`);
        if (spans.length > 0) out.push(or(...spans));
    }

    // 가격 — sort_* 는 정렬이라 뺀다.
    const prices = list(filters?.price).filter((p) => !p.startsWith("sort_"));
    if (prices.length > 0) {
        const spans: any[] = [];
        if (prices.includes("under_10")) spans.push(lte(golfBookings.greenFee, 100000));
        if (prices.includes("range_10_15")) spans.push(and(gte(golfBookings.greenFee, 100001), lte(golfBookings.greenFee, 150000)));
        if (prices.includes("range_15_20")) spans.push(and(gte(golfBookings.greenFee, 150001), lte(golfBookings.greenFee, 200000)));
        if (prices.includes("over_20")) spans.push(gte(golfBookings.greenFee, 200001));
        if (spans.length > 0) out.push(spans.length === 1 ? spans[0] : or(...spans));
    }

    // 특가 상품(핫딜)만 — 홈의 긴급티 티커가 쓴다. 값이 있을 때만 거른다(없으면 전부).
    if (filters?.hotDeal === "1" || filters?.hotDeal === true || filters?.hotDeal === "true") {
        out.push(eq(golfBookings.isHotDeal, true));
    }

    /**
     * 긴급 조인만 — 홈 배너가 쓴다. **shared/golfJoin.ts 의 isUrgentJoin 과 같은 조건**을 SQL 로 쓴 것이다.
     * (한쪽만 고치면 배너에 뜬 글이 카드에선 긴급이 아닌 일이 생긴다 — 상수는 shared 에서 가져온다.)
     * 조인 · 필드 · 고정가 · 그린피 ≤ URGENT_MAX_FEE · 지금+2시간 이후 · 한국 날짜로 오늘.
     */
    if (filters?.urgent === "1" || filters?.urgent === true || filters?.urgent === "true") {
        const from = new Date(Date.now() + URGENT_MIN_LEAD_MS);
        out.push(and(
            eq(golfBookings.listingType, "JOIN"),
            eq(golfBookings.joinType, "FIELD"),
            eq(golfBookings.costMode, "FIXED"),
            sql`${golfBookings.greenFee} is not null and ${golfBookings.greenFee} >= 0 and ${golfBookings.greenFee} <= ${URGENT_MAX_FEE}`,
            gte(golfBookings.datetime, from),
            // 한국 날짜로 오늘 — 서버가 UTC 라 날짜를 KST 로 옮겨 비교한다.
            sql`(${golfBookings.datetime} at time zone 'UTC' at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date`,
        )!);
    }

    // 이미 지난 티타임 빼기 — '지금부터' 를 보여 주는 화면(티커)에 어제 것이 섞이면 안 된다.
    if (filters?.upcoming === "1" || filters?.upcoming === true || filters?.upcoming === "true") {
        out.push(gte(golfBookings.datetime, new Date()));
    }

    // 옵션 — jsonb 배열에 고른 것 중 하나라도 있으면. '?|' 대신 함수형을 쓴다(물음표는 드라이버가 자리표시자로 볼 수 있다).
    const specials = list(filters?.special);
    if (specials.length > 0) {
        out.push(sql`jsonb_exists_any(coalesce(${golfBookings.options}, '[]'::jsonb), ARRAY[${sql.join(specials.map((v) => sql`${v}`), sql`, `)}]::text[])`);
    }

    return out;
}

/**
 * 정원을 세는 **단위**. 부킹과 조인은 파는 물건이 달라 세는 것도 다르다(2026-09-24).
 *   parties  부킹 — 티타임 하나를 한 팀에게 통째로 판다. 승인된 신청 **건수**를 센다(정원 1).
 *   seats    조인 — 한 사람이 한 자리. 승인된 **사람 수**(headcount 합)를 센다(정원 = 모집 자리 수).
 *
 * 숫자만 넘기면 어느 쪽인지 알 수 없다. 그게 오너가 본 버그였다 — 2명짜리 부킹 신청 하나를
 * count(*) 로 세어 '1자리'라 하고는, 네 자리 중 두 자리만 팔린 티타임을 '다 팔림'으로 잠갔다.
 * 조인 신청은 늘 1명이라 조인 글에서는 두 단위의 값이 언제나 같다(= 갈아끼워도 조인은 안 바뀐다).
 */
export interface SeatLimit {
    capacity: number;
    unit: "parties" | "seats";
}

/** 부킹 → 조인 전환의 결과. 실패 이유를 라우트가 그대로 문구로 옮긴다. */
export type ConvertResult =
    | { ok: true; row: GolfBooking; sold: number; open: number }
    | { ok: false; reason: "gone" | "forbidden" | "already_join" | "passed" | "full" | "bad_slots"; sold?: number; room?: number };

/** 승인된 것을 그 단위로 세는 SQL 조각. */
function seatExpr(limit: SeatLimit) {
    return limit.unit === "seats"
        ? sql<number>`coalesce(sum(${golfJoinRequests.headcount}), 0)::int`
        : sql<number>`count(*)::int`;
}

/**
 * 라운드용 골프장 목록(rankue_golf_clubs)에 붙일 골프장 페이지 정보 — 로고·페이지 주소(slug).
 * id 체계가 달라 golf_course_pages 의 이름·옛 이름을 이름 열쇠로 묶는다. 10분 캐시.
 * 같은 열쇠가 서로 다른 페이지로 두 번 나오면 그 열쇠는 버린다(엉뚱한 로고·링크보다 없는 게 낫다).
 */
type ClubPageInfo = { logo: string | null; slug: string };
let pageIndexCache: { at: number; map: Map<string, ClubPageInfo> } | null = null;
async function clubPageIndex(): Promise<Map<string, ClubPageInfo>> {
    if (pageIndexCache && Date.now() - pageIndexCache.at < 10 * 60_000) return pageIndexCache.map;
    const map = new Map<string, ClubPageInfo>();
    const bad = new Set<string>();
    try {
        const rows = await db.select({ slug: golfCoursePages.slug, name: golfCoursePages.name, aliases: golfCoursePages.aliases, logo: golfCoursePages.logo })
            .from(golfCoursePages);
        for (const r of rows) {
            for (const n of [r.name, ...(r.aliases ?? [])]) {
                const k = courseNameKey(n);
                if (!k || bad.has(k)) continue;
                const prev = map.get(k);
                if (prev && prev.slug !== r.slug) { map.delete(k); bad.add(k); continue; }
                map.set(k, { logo: r.logo ?? null, slug: r.slug });
            }
        }
    } catch (e) { console.warn("[golf] club page index failed:", (e as Error)?.message); }
    pageIndexCache = { at: Date.now(), map };
    return map;
}

export class GolfRepository {
    /**
     * 지역 코드는 **여기서** 굳힌다 — 라우트가 아니라 저장소에서. 넣는 길이 하나만 있는 게 아니라
     * (관리자 도구·스크립트가 늘어난다) 어느 길로 들어와도 코드가 비지 않아야 지역 필터가 믿을 만해진다.
     * 클라이언트가 보낸 region_code 는 버린다.
     *
     * **주소까지 본다.** 등록 화면이 고르는 골프장은 정적 원장(client/src/golf/data/golfCourses.ts)에서
     * 오는데, 그 파일의 region 은 '경기' 한 낱말뿐이고 시·군은 address 에만 있다. 지역 글자만 보면
     * 경기 골프장 168곳이 전부 '시·군 모름' 으로 굳어 남/북/동/서 칩이 다시 같은 결과를 낸다 —
     * 고치려던 그 증상이 그대로 돌아온다(2026-09-10 검토에서 실측).
     * 그래서 그 원장의 주소까지 본 판정을 shared/golfCourseRegions.ts 에 접어 두고 course_id 로 꺼낸다.
     * 클라이언트가 보낸 주소를 믿는 게 아니라 서버가 가진 표를 본다.
     */
    async createGolfBooking(data: InsertGolfBooking): Promise<GolfBooking> {
        const { regionCode: _ignored, ...rest } = data as any;
        const club = await this.findClubForBooking((data as any).courseId);
        const region = (data as any).region || club?.region || null;
        const values = {
            ...rest,
            region,
            // 1순위: 정적 원장의 course_id (등록 화면이 고르는 골프장은 여기서 온다)
            // 2순위: DB 원부의 주소  3순위: 지역 글자만
            regionCode: golfRegionCodeByCourseId((data as any).courseId)
                ?? resolveGolfRegionCode(region, club?.address ?? null),
        };
        const [booking] = await db.insert(golfBookings).values(values).returning();
        return booking;
    }

    /** 매물의 course_id 로 골프장 원부를 찾는다. uuid 가 아니면(옛 값·수기 입력) 조용히 없는 것으로 본다. */
    private async findClubForBooking(courseId: unknown): Promise<{ region: string | null; address: string | null } | null> {
        const id = String(courseId ?? "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
        const [club] = await db.select({ region: rankueGolfClubs.region, address: rankueGolfClubs.address })
            .from(rankueGolfClubs).where(eq(rankueGolfClubs.id, id)).limit(1);
        return club ?? null;
    }

    // --- Golf Club & Course Management (Updated to use Rankue Official DB) ---
    async getGolfClubs(search?: string, userLat?: number, userLng?: number): Promise<any[]> {
        let clubs;
        if (search) {
            // 이름뿐 아니라 지역으로도 찾는다(라운드 만들기 검색창 "용인"·"제주" — 2026-09-24). 대소문자 무시(88CC·OKCC).
            const q = `%${search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
            clubs = await db.select().from(rankueGolfClubs)
                .where(or(ilike(rankueGolfClubs.name, q), ilike(rankueGolfClubs.region, q)))
                .orderBy(asc(rankueGolfClubs.name));
        } else {
            clubs = await db.select().from(rankueGolfClubs).orderBy(asc(rankueGolfClubs.name));
        }

        const pages = await clubPageIndex();
        // Calculate distance and sort if user location is provided
        let result = clubs.map(c => ({
            ...c,
            totalHoles: 18, // Default
            imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=800",
            // 골프장 페이지(golf_course_pages)의 로고 — id 체계가 달라 이름 열쇠로 잇는다. 열쇠가 겹치면(두 곳) 붙이지 않는다.
            logo: pages.get(courseNameKey(c.name))?.logo ?? null,
            // 골프장 페이지 주소 — 도장깨기 지역 시트가 누르면 그 페이지로 간다
            pageSlug: pages.get(courseNameKey(c.name))?.slug ?? null,
            // 도장깨기 지역 묶음(경기·강원…) — 여권 통계(getGolfPassportStats)와 **같은 규칙**. "경기남부"·주소만 있는 곳도 여기서 묶인다.
            passportRegion: passportRegionGroup(resolveGolfRegionCode(c.region, c.address)),
            distance: (userLat && userLng && c.latitude && c.longitude)
                ? getDistanceFromLatLonInKm(userLat, userLng, c.latitude, c.longitude)
                : undefined
        }));

        if (userLat && userLng) {
            result.sort((a, b) => {
                if (a.distance !== undefined && b.distance !== undefined) {
                    return a.distance - b.distance;
                }
                return 0;
            });
        }

        return result;
    }

    async getGolfClubCourses(clubId: string): Promise<RankueGolfCourse[]> {
        return await db.select().from(rankueGolfCourses)
            .where(eq(rankueGolfCourses.clubId, clubId))
            .orderBy(asc(rankueGolfCourses.name));
    }

    async createGolfClub(data: InsertGolfClub): Promise<GolfClub> {
        const [club] = await db.insert(golfClubs).values(data).returning();
        return club;
    }

    /**
     * 회원이 알려 준 코스 이름을 원장에 남긴다 — 홀별 파는 아직 모르니 빈 배열로 둔다.
     *
     * 왜: 전국 634곳 중 317곳은 코스 구성 자료가 없다. 그 골프장을 고르면 전반/후반 목록이 비고,
     * '방 만들기' 가 영영 안 눌린다(2026-09-10 오너 제보). 자기가 친 코스 이름은 회원이 안다.
     * 한 사람이 적어 두면 다음 사람은 고르기만 하면 된다.
     *
     * 함부로 늘어나지 않게: 이미 코스가 등록된 골프장은 건드리지 않고, 한 곳당 6개까지, 이름은 20자까지.
     * 파는 빈 배열이라 점수 계산은 기본 파 배치로 돌아간다(이미 그렇게 되어 있다).
     */
    async addCourseNamesIfEmpty(clubId: string, names: string[]): Promise<RankueGolfCourse[]> {
        const clean = Array.from(new Set(
            names.map((n) => String(n ?? "").trim().slice(0, 20)).filter(Boolean)
        )).slice(0, 6);
        if (clean.length === 0) return [];

        const have = await db.select({ id: rankueGolfCourses.id })
            .from(rankueGolfCourses).where(eq(rankueGolfCourses.clubId, clubId));
        // 이미 자료가 있는 골프장은 회원 입력으로 덮지 않는다.
        if (have.length > 0) return await this.getGolfClubCourses(clubId);

        const [club] = await db.select({ id: rankueGolfClubs.id })
            .from(rankueGolfClubs).where(eq(rankueGolfClubs.id, clubId)).limit(1);
        if (!club) return [];

        await db.insert(rankueGolfCourses)
            .values(clean.map((name) => ({ clubId, name, pars: [] as number[] })));
        return await this.getGolfClubCourses(clubId);
    }

    async createGolfClubCourse(data: InsertGolfClubCourse): Promise<GolfClubCourse> {
        const [course] = await db.insert(golfClubCourses).values(data).returning();
        return course;
    }

    async getGolfBookings(date?: string, filters?: any): Promise<GolfBooking[]> {
        // 신고 누적·운영자 조치로 가려진 매물은 목록에서 뺀다(행은 남는다 — 추적용). 내 글 내역(includeBlinded)은 예외.
        const conditions: any[] = filters?.includeBlinded ? [] : [eq(golfBookings.isBlinded, false)];
        // 내가 올린 글만(2026-09-21 '내역'). 화면 질의 문자열로는 못 준다 — 라우트가 로그인 id 로만 넣는다.
        if (typeof filters?.ownerId === "string" && filters.ownerId) conditions.push(eq(golfBookings.ownerId, filters.ownerId));
        if (date) {
            const targetDate = new Date(date);
            const start = new Date(targetDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(-1);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        } else if (filters?.startDate && filters?.endDate) {
            const start = new Date(filters.startDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(filters.endDate);
            end.setUTCHours(end.getUTCHours() + 14, 59, 59, 999);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        if (filters) {
            conditions.push(...buildGolfFilterConditions(filters));

            if (filters.courseName && filters.courseName !== "") {
                // 비공개(isBlind) 글은 **가명으로만** 잡힌다 — 실명으로도 잡히면 "남서울"을 쳐서 가명 글의 실명을 확정할 수 있다(2026-09-22 리뷰).
                conditions.push(
                    or(
                        and(eq(golfBookings.isBlind, false), like(golfBookings.courseName, `%${filters.courseName}%`)),
                        like(golfBookings.blindName, `%${filters.courseName}%`)
                    )
                );
            }

            if (filters.listingType && filters.listingType !== 'ALL') {
                if (filters.listingType === 'BOOKING') {
                    conditions.push(or(eq(golfBookings.listingType, 'BOOKING'), isNull(golfBookings.listingType)));
                } else {
                    conditions.push(eq(golfBookings.listingType, filters.listingType));
                }
            }
        }

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        // 내 글 목록처럼 날짜 없이 부르는 질의의 하한(일). 티타임이 이보다 오래된 글은 뺀다.
        const sinceDays = Number(filters?.sinceDays);
        if (Number.isFinite(sinceDays) && sinceDays > 0) filteredConditions.push(sql`${golfBookings.datetime} > now() - make_interval(days => ${Math.floor(sinceDays)})`);
        const q = db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
        const limit = Number(filters?.limit);
        return Number.isFinite(limit) && limit > 0 ? await q.limit(Math.min(limit, 500)) : await q;
    }

    /** 최근 n분 동안 이 회원이 올린 글 수 — 등록 도배를 막는 데 쓴다. */
    async countRecentBookingsByOwner(ownerId: string, minutes: number): Promise<number> {
        const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(golfBookings)
            .where(and(eq(golfBookings.ownerId, ownerId), sql`${golfBookings.createdAt} > now() - make_interval(mins => ${minutes})`));
        return Number(row?.n ?? 0);
    }

    /**
     * 날짜 칩에 붙는 개수. 목록과 **같은 필터**를 건다 — 예전엔 지역·시간·가격·옵션을 무시해서
     * 칩은 12개라고 하는데 목록엔 2개만 있는 일이 생겼다(2026-09-09 검토).
     * 가려진 매물도 뺀다 — 목록에선 빠지는데 개수에는 들어 있었다.
     */
    async getGolfBookingCounts(startDate: string, endDate: string, viewType: string = 'ALL', filters?: any): Promise<any> {
        const start = new Date(startDate);
        start.setUTCHours(start.getUTCHours() - 9);

        const end = new Date(endDate);
        end.setUTCHours(end.getUTCHours() + 14, 59, 59, 999);

        const parts: any[] = [
            eq(golfBookings.isBlinded, false),
            gte(golfBookings.datetime, start),
            lte(golfBookings.datetime, end),
        ];

        if (viewType === 'JOIN') {
            parts.push(eq(golfBookings.listingType, 'JOIN'));
        } else if (viewType === 'BOOKING') {
            parts.push(or(eq(golfBookings.listingType, 'BOOKING'), isNull(golfBookings.listingType)));
        }

        if (filters) parts.push(...buildGolfFilterConditions(filters));

        const whereCondition = and(...parts);

        return await db.select({
            date: sql<string>`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`
        })
            .from(golfBookings)
            .where(whereCondition)
            .groupBy(sql`to_char(${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`);
    }

    /**
     * 등록자 본인만 지운다. 예전엔 manager_phone 문자열 하나로 판정했는데 그 값을 클라이언트가 보냈다 —
     * 남의 번호를 박아 올린 글은 피해자만 지울 수 있고 올린 사람은 못 지우는 상태였다(2026-09-09).
     * 이제 owner_id 로 본다. owner_id 가 없는 옛 행만 번호로 되짚는다.
     */
    async deleteGolfBooking(id: string, managerPhone?: string, ownerId?: string): Promise<boolean> {
        const owns = ownerId
            ? or(eq(golfBookings.ownerId, ownerId),
                 managerPhone ? and(isNull(golfBookings.ownerId), eq(golfBookings.managerPhone, managerPhone)) : undefined)
            : managerPhone ? eq(golfBookings.managerPhone, managerPhone) : undefined;
        const deleted = await db.delete(golfBookings)
            .where(owns ? and(eq(golfBookings.id, id), owns) : eq(golfBookings.id, id))
            .returning({ id: golfBookings.id });
        return deleted.length > 0;
    }

    /**
     * 부킹을 조인으로 돌린다(2026-09-23 오너: "내가 올린 부킹 내역에서 조인 돌리기 버튼, 그때 옵션을 넣고 바로 전환").
     *
     * **id 를 유지한다** — 지우고 다시 만들지 않는다. 공유 링크(/golf/booking-list/<id>)·채팅 방 열쇠(listing:<id>)·
     * 알림 딥링크가 전부 이 id 를 들고 있어서, 새 행으로 옮기면 그 링크들이 통째로 죽는다.
     *
     * 조건을 **where 에 담아** 한 문장으로 바꾼다: 읽고 나서 바꾸면 두 번 눌린 요청이 둘 다 통과해
     * 나중 것이 앞의 자리 구성을 덮어쓴다. 이렇게 두면 두 번째는 0행을 돌려받고 라우트가 409 를 준다.
     *   - 글쓴이 본인만(owner_id) · 아직 부킹인 글만(두 번 전환 방지) · 아직 안 지난 티타임만.
     * ⚠️ 지난 티타임 검사는 now() 로 **DB 안에서** 한다. JS Date 를 sql 에 끼워 넣으면 9시간이 어긋난다(이 저장소의 상습 함정).
     */
    async convertBookingToJoin(id: string, ownerId: string, patch: {
        /** 이제부터 **더 받을** 자리. 1 ~ (4 - 이미 팔린 자리). */
        more: number;
        /** 더 받을 자리마다 받고 싶은 성별. 모자라면 무관으로 채운다. */
        genders: SlotGender[];
        costMode: "FIXED" | "SPLIT";
    }): Promise<ConvertResult> {
        return await db.transaction(async (tx) => {
            // 글 행을 잠그고 → 팔린 자리를 세고 → 자리를 만들어 → 바꾼다.
            // 읽기와 쓰기 사이에 잠금이 없으면, 전환하는 사이 다른 탭에서 대기자를 승인해
            // 정원(내가 만든 OPEN 수)보다 많은 사람이 확정된 글이 만들어진다(2026-09-24 검토).
            const [row] = await tx.select().from(golfBookings).where(eq(golfBookings.id, id)).for("update").limit(1);
            if (!row) return { ok: false as const, reason: "gone" as const };
            if (!row.ownerId || row.ownerId !== ownerId) return { ok: false as const, reason: "forbidden" as const };
            if (row.listingType === "JOIN") return { ok: false as const, reason: "already_join" as const };
            if (new Date(row.datetime as any).getTime() <= Date.now()) return { ok: false as const, reason: "passed" as const };

            // 앱이 아는 '팔린 자리' = 승인된 신청의 **인원 합**. 2명짜리 신청 하나는 2자리다.
            const [cnt] = await tx.select({ n: sql<number>`coalesce(sum(${golfJoinRequests.headcount}), 0)::int` })
                .from(golfJoinRequests)
                .where(and(eq(golfJoinRequests.bookingId, id), eq(golfJoinRequests.status, "accepted")));
            const sold = Number(cnt?.n ?? 0);
            const room = convertibleSeats(sold);
            if (room < 1) return { ok: false as const, reason: "full" as const, sold };

            // 자리는 **서버가 만든다**. 화면이 보낸 배열을 믿으면 "2자리 팔렸는데 4자리 남았다"가 통과해
            // 한 팀에 여섯 명을 받게 된다. 화면은 '몇 자리 더 받을지'만 말한다.
            const genders = patch.genders.slice(0, patch.more);
            const slots = conversionSlots(sold, patch.more, genders);
            if (!slots) return { ok: false as const, reason: "bad_slots" as const, sold, room };

            const [updated] = await tx.update(golfBookings)
                .set({
                    listingType: "JOIN",
                    joinType: "FIELD",       // 부킹 올리기 시트는 골프장 마스터에서만 고른다 — 스크린·파크 부킹은 없다.
                    slots,
                    // 옛 화면·검색이 보는 '모집 n명' 요약. **이제부터 받을 자리**다 — 정원(openSlotCount)을 넣으면
                    // 이미 팔린 OPEN 칸까지 세어 "2자리 팔린 글이 4명 모집"이라고 적힌다(2026-09-24).
                    joinHeadcount: patch.more,
                    // 옛 화면·검색이 보는 요약값. **이제부터 받을** 자리만 본다 — 이미 팔린 OPEN 칸(무관)까지 세면 늘 '성별무관'이 된다.
                    joinCondition: recruitCondition(genders),
                    costMode: patch.costMode,
                    greenFee: patch.costMode === "SPLIT" ? 0 : Number(row.greenFee) || 0,
                    // sellerType 은 **지우지 않는다**. 조인은 원래 null 이라, 남아 있으면 그게 곧 "부킹에서 건너온 글" 표시다.
                    // 화면(joinUi.isConvertedJoin)이 그걸 보고 첫 자리를 '호스트'가 아니라 '이미 찬 자리'로 그린다 — 유령 자리 방지.
                })
                .where(eq(golfBookings.id, id))
                .returning();

            // 넘어온 대기 신청의 인원을 1 로 맞춘다.
            // 부킹 신청은 '팀 통째'라 1~4 명을 적어 보낼 수 있지만(apply 라우트), 조인 신청은 **늘 1 명**이다 — 자리 하나가 사람 하나다.
            // 그 값을 그대로 두면 4 명짜리 대기 행이 조인 자리 **하나**로 세어진다… 였는데 이제 정원 검사는 사람 수로 본다.
            // 그래도 1 로 맞추는 이유는 남았다: 조인 카드·자리 그림은 '한 자리 = 한 사람'을 전제로 그려지고,
            // 신청자 스스로 인원을 줄일 화면이 없다. 4명짜리 대기를 그대로 두면 2자리 조인에서 영영 승인이 안 된다.
            // 신청은 지우지 않는다(거절은 이 글에 한해 최종이라 대기열에서 빼면 되돌릴 길이 없다) — 인원만 자리 하나로 맞추고,
            // 라우트가 "조인으로 바뀌었다"고 알려 그 사람이 스스로 취소할 수 있게 둔다.
            // ⚠️ **승인된(accepted) 행은 건드리지 않는다.** 그 사람들이 이미 산 자리가 곧 sold 이고, 위에서 OPEN 칸으로 앉혀 두었다.
            await tx.update(golfJoinRequests)
                .set({ headcount: 1 })
                .where(and(
                    eq(golfJoinRequests.bookingId, id),
                    eq(golfJoinRequests.status, "applied"),
                    ne(golfJoinRequests.headcount, 1),
                ));
            return { ok: true as const, row: updated, sold, open: patch.more };
        });
    }

    /** 한 건 조회 — 조인 신청 전 검사(마감·본인 글·가려진 글)에 쓴다. */
    async getGolfBooking(id: string): Promise<GolfBooking | undefined> {
        const [row] = await db.select().from(golfBookings).where(eq(golfBookings.id, id)).limit(1);
        return row;
    }

    // ── 조인 신청 ────────────────────────────────────────────────────────
    // 조인 글은 golf_bookings(listing_type='JOIN') 행이고, 신청은 여기 따로 쌓인다.
    // 그전엔 '조인 신청하기' 가 문자만 열고 아무것도 안 남겼다(2026-09-09).

    /**
     * 조인 글별 인원 — accepted(자리 차지)와 applied(승인 대기)를 따로 센다(2026-09-21 호스트 승인제).
     * 자리를 차지하는 건 **승인된 사람뿐**이다. 신청은 정원과 무관하게 쌓이고 호스트가 고른다.
     *
     * 셋을 돌려준다 — 단위가 다르다:
     *   accepted  승인된 **신청 건수**(팀 수). 부킹의 정원은 '한 팀'이라 이 숫자로 본다.
     *   seats     승인된 **사람 수**(headcount 합). 조인의 정원은 자리라 이 숫자로 본다.
     *   pending   대기 중인 신청 건수.
     * 부킹 신청 한 건은 1~4명이라 둘이 갈린다(2026-09-24: 2명짜리 신청 하나 = accepted 1, seats 2).
     * 조인 신청은 늘 1명이라 조인 글에서는 accepted 와 seats 가 늘 같다.
     */
    async countJoinRequests(bookingIds: string[]): Promise<Map<string, { accepted: number; seats: number; pending: number }>> {
        if (bookingIds.length === 0) return new Map();
        const rows = await db.select({
            bookingId: golfJoinRequests.bookingId,
            accepted: sql<number>`count(*) filter (where ${golfJoinRequests.status} = 'accepted')::int`,
            seats: sql<number>`coalesce(sum(${golfJoinRequests.headcount}) filter (where ${golfJoinRequests.status} = 'accepted'), 0)::int`,
            pending: sql<number>`count(*) filter (where ${golfJoinRequests.status} = 'applied')::int`,
        })
            .from(golfJoinRequests)
            .where(inArray(golfJoinRequests.bookingId, bookingIds))
            .groupBy(golfJoinRequests.bookingId);
        return new Map(rows.map((r) => [r.bookingId, { accepted: Number(r.accepted), seats: Number(r.seats), pending: Number(r.pending) }]));
    }

    /** 내 신청 상태(조인 글 id → status). 취소한 글은 없는 것으로 본다(다시 신청할 수 있다). */
    async myJoinStatuses(memberId: string, bookingIds: string[]): Promise<Map<string, string>> {
        if (bookingIds.length === 0) return new Map();
        const rows = await db.select({ bookingId: golfJoinRequests.bookingId, status: golfJoinRequests.status })
            .from(golfJoinRequests)
            .where(and(
                eq(golfJoinRequests.memberId, memberId),
                inArray(golfJoinRequests.status, ["applied", "accepted", "rejected", "noshow"]),
                inArray(golfJoinRequests.bookingId, bookingIds),
            ));
        return new Map(rows.map((r) => [r.bookingId, r.status]));
    }

    /**
     * 신청한다. 정원이 차 있으면 거절한다 — 마지막 한 자리에 둘이 동시에 들어오는 경우까지 막으려면
     * 세고 넣는 사이가 갈라지면 안 되므로, 한 문장 안에서 세고 넣는다.
     */
    /**
     * 정원 한 칸 — **단위가 두 가지**다(2026-09-24).
     *   parties  부킹. 티타임 하나를 **한 팀에게 통째로** 판다 → 승인된 신청 **건수**로 센다(정원 1).
     *   seats    조인. 한 사람이 한 자리 → 승인된 **사람 수**(headcount 합)로 센다(정원 = 모집 자리 수).
     *
     * 숫자만 넘기면 어느 쪽인지 알 수 없다. 그게 오너가 본 버그였다 — 2명짜리 부킹 신청 하나를
     * count(*) 로 세어 '1자리'라 하고는, 네 자리 중 두 자리만 팔린 티타임을 '다 팔림'으로 잠갔다.
     */
    async applyToJoin(bookingId: string, memberId: string, limit: SeatLimit, headcount = 1): Promise<"ok" | "full" | "already" | "rejected" | "cooldown" | "too_many"> {
        const [existing] = await db.select({ status: golfJoinRequests.status, cancelCount: golfJoinRequests.cancelCount, updatedAt: golfJoinRequests.updatedAt })
            .from(golfJoinRequests)
            .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId)))
            .limit(1);
        if (existing?.status === "applied" || existing?.status === "accepted") return "already";
        // 거절은 이 글에 한해 최종이다(2026-09-22 오너 결정) — 예전엔 서버가 거절된 사람의 재신청을 그대로 받아
        // 거절이 무효가 되고 호스트에게 푸시가 되풀이됐다. 마음이 바뀐 호스트는 신청자 목록에서 되돌릴 수 있다.
        if (existing?.status === "rejected" || existing?.status === "noshow") return "rejected";
        // 신청↔취소 되풀이로 호스트에게 푸시를 퍼붓지 못하게: 취소 뒤 1분은 쉬고, 같은 글에 취소 3번이면 끝.
        if (existing?.status === "cancelled") {
            if (Number(existing.cancelCount ?? 0) >= 3) return "too_many";
            if (existing.updatedAt && Date.now() - new Date(existing.updatedAt).getTime() < 60_000) return "cooldown";
        }

        // 정원은 **승인된** 사람으로 센다(호스트 승인제). 대기는 정원과 무관하게 받는다.
        // 단위에 따라 세는 것이 다르다: 부킹은 팀(행), 조인은 자리(사람). SeatLimit 머리말 참고.
        // 내 몫도 더해서 비교한다 — 조인은 늘 1이라 예전 `count < capacity` 와 값이 같고,
        // 부킹은 `건수 + 1 <= 1` 이라 역시 '승인 0건일 때만' 으로 예전과 같다.
        const taken = limit.unit === "seats"
            ? sql`coalesce(sum(headcount), 0)`
            : sql`count(*)`;
        const mine = limit.unit === "seats" ? headcount : 1;
        const inserted = await db.execute(sql`
            INSERT INTO golf_join_requests (booking_id, member_id, status, headcount, updated_at)
            SELECT ${bookingId}::uuid, ${memberId}::uuid, 'applied', ${headcount}, now()
            WHERE (
              SELECT ${taken} FROM golf_join_requests
              WHERE booking_id = ${bookingId}::uuid AND status = 'accepted'
            ) + ${mine} <= ${limit.capacity}
            ON CONFLICT (booking_id, member_id)
            DO UPDATE SET status = 'applied', headcount = ${headcount}, updated_at = now()
            RETURNING id
        `);
        return (inserted.rows?.length ?? 0) > 0 ? "ok" : "full";
    }

    /**
     * 신청을 물린다. 행은 남기고 취소 횟수를 올린다 — 다시 신청해도 그 숫자는 안 줄어든다.
     * 그러지 않으면 취소·재신청을 반복하는 사람이 늘 깨끗해 보인다(2026-09-10 검토).
     */
    async cancelJoinRequest(bookingId: string, memberId: string): Promise<boolean> {
        const rows = await db.update(golfJoinRequests)
            .set({ status: "cancelled", cancelCount: sql`${golfJoinRequests.cancelCount} + 1`, updatedAt: new Date() })
            .where(and(
                eq(golfJoinRequests.bookingId, bookingId),
                eq(golfJoinRequests.memberId, memberId),
                inArray(golfJoinRequests.status, ["applied", "accepted"]),
            ))
            .returning({ id: golfJoinRequests.id });
        return rows.length > 0;
    }

    /**
     * 호스트의 승인·거절(2026-09-21 호스트 승인제). 대기(applied) 상태에서만 바뀐다.
     * 승인은 **정원 안에서만** — 세고 바꾸는 사이가 갈라지면 마지막 자리에 둘이 들어오므로 한 문장에서 한다.
     */
    async decideJoinRequest(bookingId: string, memberId: string, accept: boolean, limit: SeatLimit): Promise<"ok" | "full" | "gone"> {
        if (!accept) {
            const rows = await db.update(golfJoinRequests)
                .set({ status: "rejected", updatedAt: new Date() })
                .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId), eq(golfJoinRequests.status, "applied")))
                .returning({ id: golfJoinRequests.id });
            return rows.length > 0 ? "ok" : "gone";
        }
        // 글 행을 잠그고 세고 바꾼다 — 한 문장짜리 `count < 정원` 은 READ COMMITTED 에서 동시 승인 둘이 서로의
        // 미커밋 행을 못 세어 둘 다 통과했다(2026-09-22 리뷰). 같은 파일의 매치 참가와 같은 방식.
        // 거절해 둔 사람도 승인할 수 있다(거절 되돌리기) — 거절이 최종이 된 만큼 호스트에게 무를 길이 있어야 한다.
        return await db.transaction(async (tx) => {
            await tx.select({ id: golfBookings.id }).from(golfBookings).where(eq(golfBookings.id, bookingId)).for("update");
            const [row] = await tx.select({ status: golfJoinRequests.status, headcount: golfJoinRequests.headcount }).from(golfJoinRequests)
                .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId))).limit(1);
            if (row?.status !== "applied" && row?.status !== "rejected") return "gone" as const;
            // 이 사람이 차지할 몫까지 더해서 본다 — 2명짜리 신청을 1로 세면 정원 넷에 다섯이 들어온다.
            const [cnt] = await tx.select({ n: seatExpr(limit) }).from(golfJoinRequests)
                .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.status, "accepted")));
            const mine = limit.unit === "seats" ? Math.max(1, Number(row.headcount) || 1) : 1;
            if (Number(cnt?.n ?? 0) + mine > limit.capacity) return "full" as const;
            await tx.update(golfJoinRequests).set({ status: "accepted", updatedAt: new Date() })
                .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId)));
            return "ok" as const;
        });
    }

    /**
     * 내가 신청한 글(조인·부킹) — 글과 내 신청 상태를 함께(2026-09-21 '내 신청' 탭). 최근 30일 지난 글까지.
     * 취소한 글은 뺀다(다시 신청하면 다시 뜬다).
     */
    async listMyRequests(memberId: string, limit = 100): Promise<any[]> {
        const rows = await db.select({
            booking: golfBookings,
            myJoinStatus: golfJoinRequests.status,
            myHeadcount: golfJoinRequests.headcount,
            requestedAt: golfJoinRequests.createdAt,
            changedAt: golfJoinRequests.updatedAt,
        })
            .from(golfJoinRequests)
            .innerJoin(golfBookings, eq(golfBookings.id, golfJoinRequests.bookingId))
            .where(and(
                eq(golfJoinRequests.memberId, memberId),
                eq(golfBookings.isBlinded, false), // 운영자가 가린 글은 본 목록에 없어 '보기'를 눌러도 아무 일도 없었다
                inArray(golfJoinRequests.status, ["applied", "accepted", "rejected", "noshow"]),
                sql`${golfBookings.datetime} > now() - interval '30 days'`,
            ))
            .orderBy(asc(golfBookings.datetime))
            .limit(limit);
        return rows.map((r) => ({ ...r.booking, myJoinStatus: r.myJoinStatus, myHeadcount: r.myHeadcount, requestedAt: r.requestedAt, changedAt: r.changedAt }));
    }

    /**
     * 아직 대기(applied) 중인 신청자 — 마감·자리 재개를 알릴 사람들.
     * 예전엔 부킹 확정 시 나머지를 거절로 돌렸는데(rejectOtherPending), 거절이 최종이 되면서(2026-09-22) 그러면
     * 확정자가 취소해 자리가 다시 나도 아무도 돌아올 수 없다. 대기는 **대기열로 남기고** 알림만 보낸다.
     */
    async pendingRequesterIds(bookingId: string): Promise<string[]> {
        const rows = await db.select({ memberId: golfJoinRequests.memberId }).from(golfJoinRequests)
            .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.status, "applied")));
        return rows.map((r) => String(r.memberId));
    }

    /** 대기·확정 중인 신청자 id — 글을 내릴 때 알리려고(행은 cascade 로 지워진다). */
    async activeRequesterIds(bookingId: string): Promise<{ memberId: string; status: string }[]> {
        const rows = await db.select({ memberId: golfJoinRequests.memberId, status: golfJoinRequests.status }).from(golfJoinRequests)
            .where(and(eq(golfJoinRequests.bookingId, bookingId), inArray(golfJoinRequests.status, ["applied", "accepted"])));
        return rows.map((r) => ({ memberId: String(r.memberId), status: r.status }));
    }

    /**
     * 조인 글에 누가 신청했는지 — 글쓴이에게만 보여 준다.
     *
     * 왜 필요했나: 신청은 쌓이는데 그걸 볼 화면이 없으면 글쓴이는 여전히 누가 오는지 모른다.
     * 그리고 노쇼를 표시하려면 먼저 사람 목록이 있어야 한다(2026-09-10).
     *
     * 함께 싣는 것: 그 사람의 **여태까지** 취소·노쇼 횟수. 한 번 늦게 취소한 사람과 매번 그러는 사람은
     * 다르게 봐야 하는데, 이 글 하나만 보면 그게 안 보인다.
     */
    async listJoinApplicants(bookingId: string): Promise<any[]> {
        const rows = await db.select({
            memberId: golfJoinRequests.memberId,
            status: golfJoinRequests.status,
            headcount: golfJoinRequests.headcount,
            appliedAt: golfJoinRequests.createdAt,
            changedAt: golfJoinRequests.updatedAt,
            name: hiqMembers.name,
            golfGrade: hiqMembers.golfGrade,
            profileImageUrl: profiles.profileImageUrl,
        })
            .from(golfJoinRequests)
            .innerJoin(hiqMembers, eq(hiqMembers.id, golfJoinRequests.memberId))
            .leftJoin(profiles, eq(profiles.id, hiqMembers.profileId))
            .where(eq(golfJoinRequests.bookingId, bookingId))
            .orderBy(asc(golfJoinRequests.createdAt));

        if (rows.length === 0) return [];

        const memberIds: string[] = Array.from(new Set<string>(rows.map((r) => String(r.memberId))));
        // 지금 상태가 아니라 **쌓인 숫자**를 더한다 — 다시 신청해서 status 가 'applied' 로 돌아가도
        // 취소·노쇼 이력은 남아 있어야 한다.
        const history = await db.select({
            memberId: golfJoinRequests.memberId,
            cancelled: sql<number>`coalesce(sum(${golfJoinRequests.cancelCount}), 0)::int`,
            noshow: sql<number>`coalesce(sum(${golfJoinRequests.noShowCount}), 0)::int`,
        })
            .from(golfJoinRequests)
            .where(inArray(golfJoinRequests.memberId, memberIds as any))
            .groupBy(golfJoinRequests.memberId);
        const hist = new Map<string, { cancelled: number; noshow: number }>(
            history.map((h: any) => [String(h.memberId), { cancelled: Number(h.cancelled), noshow: Number(h.noshow) }]),
        );

        return rows.map((r) => ({
            ...r,
            cancelCount: hist.get(String(r.memberId))?.cancelled ?? 0,
            noShowCount: hist.get(String(r.memberId))?.noshow ?? 0,
        }));
    }

    /**
     * 안 나타났다고 표시하거나 되돌린다. 글쓴이 확인은 라우트가 한다.
     * 되돌리면 'accepted' 로(정원 안에서만) — 잘못 누른 걸 못 고치면 표시를 무서워서 못 쓴다.
     * 본인이 취소한 행('cancelled')은 건드리지 않는다. 취소와 노쇼는 다른 일이다.
     */
    async setJoinNoShow(bookingId: string, memberId: string, noShow: boolean, limit: SeatLimit = { capacity: Number.MAX_SAFE_INTEGER, unit: "parties" }): Promise<"ok" | "gone" | "full"> {
        return await db.transaction(async (tx) => {
            await tx.select({ id: golfBookings.id }).from(golfBookings).where(eq(golfBookings.id, bookingId)).for("update");
            if (!noShow) {
                // 노쇼는 자리를 비운다 — 그 사이 다른 대기자를 승인했다면 되돌릴 자리가 없다.
                // 되돌리려는 사람이 차지할 몫까지 더해서 본다(부킹 2명짜리면 두 자리가 필요하다).
                const [row] = await tx.select({ status: golfJoinRequests.status, headcount: golfJoinRequests.headcount }).from(golfJoinRequests)
                    .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId))).limit(1);
                // 애초에 되돌릴 대상이 아니면 '자리가 찼다'가 아니라 'gone' 이다 — 거짓 설명을 하지 않는다.
                if (row?.status !== "noshow") return "gone" as const;
                const [cnt] = await tx.select({ n: seatExpr(limit) }).from(golfJoinRequests)
                    .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.status, "accepted")));
                const mine = limit.unit === "seats" ? Math.max(1, Number(row.headcount) || 1) : 1;
                if (Number(cnt?.n ?? 0) + mine > limit.capacity) return "full" as const;
            }
            const rows = await tx.update(golfJoinRequests)
                .set({
                    status: noShow ? "noshow" : "accepted",
                    // 되돌리면 숫자도 되돌린다(0 아래로는 안 내려간다). 표시가 다시 신청으로 지워지지 않게
                    // 숫자는 status 와 따로 남는다.
                    noShowCount: noShow
                        ? sql`${golfJoinRequests.noShowCount} + 1`
                        : sql`greatest(${golfJoinRequests.noShowCount} - 1, 0)`,
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(golfJoinRequests.bookingId, bookingId),
                    eq(golfJoinRequests.memberId, memberId),
                    eq(golfJoinRequests.status, noShow ? "accepted" : "noshow"),
                ))
                .returning({ id: golfJoinRequests.id });
            return rows.length > 0 ? "ok" as const : "gone" as const;
        });
    }

    async createGolfJoin(data: InsertGolfJoin): Promise<GolfJoin> {
        const [join] = await db.insert(golfJoins).values(data).returning();
        return join;
    }

    async getGolfJoins(filters?: any): Promise<GolfJoin[]> {
        const conditions: any[] = [eq(golfBookings.isBlinded, false)];
        conditions.push(eq(golfBookings.listingType, 'JOIN'));

        if (filters?.date) {
            const targetDate = new Date(filters.date);
            const start = new Date(targetDate);
            start.setUTCHours(start.getUTCHours() - 9);

            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(-1);

            conditions.push(and(gte(golfBookings.datetime, start), lte(golfBookings.datetime, end)));
        }

        conditions.push(...buildGolfFilterConditions(filters ?? {}));

        const filteredConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
    }

    async deleteGolfJoin(id: string, hostId?: string): Promise<boolean> {
        // Scope to the host so a user can't delete another user's join post (IDOR).
        const deleted = await db.delete(golfJoins)
            .where(hostId
                ? and(eq(golfJoins.id, id), eq(golfJoins.hostId, hostId))
                : eq(golfJoins.id, id))
            .returning({ id: golfJoins.id });
        return deleted.length > 0;
    }

    async updateGolfStats(userId: string): Promise<any> {
        // 1. Get all golf history for this member
        const history = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, userId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ));

        if (history.length === 0) return null;

        // 2. Calculate Average Score
        const validGames = history.filter(h => h.score > 0);
        if (validGames.length === 0) return null;

        const totalScore = validGames.reduce((sum, h) => sum + h.score, 0);
        const avgScore = totalScore / validGames.length;
        const bestScore = Math.min(...validGames.map(h => h.score));

        // 3. Determine Grade based on Average Score (Handicap)
        let newGrade = '🐣 ROOKIE';
        if (avgScore <= 72) newGrade = '🏆 ALBATROSS';
        else if (avgScore <= 79) newGrade = '🦅 EAGLE';
        else if (avgScore <= 89) newGrade = '🐦 BIRDIE';
        else if (avgScore <= 99) newGrade = '⭕ PAR';
        else if (avgScore <= 109) newGrade = '⬜ BOGEY';

        // 4. Update Member Table
        const [member] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, userId));
        if (!member) return null;

        await db.update(hiqMembers)
            .set({
                golfAvgScore: avgScore,
                golfBestScore: bestScore,
                golfGrade: newGrade,
                totalGolfGames: validGames.length,
                updatedAt: new Date()
            })
            .where(eq(hiqMembers.id, userId));

        return {
            oldGrade: member.golfGrade,
            newGrade,
            avgScore: avgScore.toFixed(1),
            totalRounds: validGames.length
        };
    }

    /**
     * 골프 여권(도장깨기).
     *
     * 2026-09-11 다시 짰다. 예전엔 (1) 도장을 골프장 **이름 글자**로만 이어서 서버·여권·Elite60 이 서로 다른
     * 숫자를 냈고, (2) 같은 곳을 다시 치면 도장이 하나 더 찍혔고, (3) '상위 N%' 는 공식으로 지어낸 숫자,
     * 분모 520 은 하드코딩이었다. 이제 도장은 **골프장당 하나**(기록의 golf_club_id, 옛 기록은 이름으로),
     * 분모와 지역별 총수는 실제 골프장 원장에서 센다.
     */
    async getGolfPassportStats(memberId: string) {
        const history = await db.select({
            locationName: hiqGameHistory.locationName,
            golfClubId: hiqGameHistory.golfClubId,
            score: hiqGameHistory.score,
            createdAt: hiqGameHistory.createdAt,
        })
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.sportCategory, 'GOLF' as any)))
            .orderBy(asc(hiqGameHistory.createdAt));

        const clubs = await db.select({
            id: rankueGolfClubs.id, name: rankueGolfClubs.name,
            region: rankueGolfClubs.region, address: rankueGolfClubs.address,
        }).from(rankueGolfClubs);

        const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
        const byId = new Map(clubs.map((c) => [c.id, c]));
        const byName = new Map<string, (typeof clubs)[number]>();
        for (const c of clubs) if (!byName.has(squash(c.name))) byName.set(squash(c.name), c);
        const groupOf = (c: { region: string | null; address: string | null }) =>
            passportRegionGroup(resolveGolfRegionCode(c.region, c.address));

        const regionTotals: Record<string, number> = {};
        for (const c of clubs) {
            const g = groupOf(c);
            if (g) regionTotals[g] = (regionTotals[g] ?? 0) + 1;
        }

        type Stamp = { clubId: string | null; name: string; region: string | null; firstDate: Date; lastDate: Date; bestScore: number; rounds: number };
        const stamps = new Map<string, Stamp>();
        for (const h of history) {
            const club = (h.golfClubId && byId.get(h.golfClubId)) || (h.locationName ? byName.get(squash(h.locationName)) : undefined);
            // 골프장을 모르는 기록(옛 '알 수 없는 구장' 포함)은 라운드 수에만 들어가고 도장은 없다.
            if (!club && (!h.locationName || h.locationName === "알 수 없는 구장")) continue;
            const key = club?.id ?? `name:${squash(h.locationName!)}`;
            const cur = stamps.get(key);
            if (!cur) {
                stamps.set(key, {
                    clubId: club?.id ?? null,
                    name: club?.name ?? h.locationName!,
                    region: club ? groupOf(club) : null,
                    firstDate: h.createdAt, lastDate: h.createdAt,
                    bestScore: h.score, rounds: 1,
                });
            } else {
                cur.rounds++;
                cur.lastDate = h.createdAt;
                if (h.score > 0 && (cur.bestScore <= 0 || h.score < cur.bestScore)) cur.bestScore = h.score;
            }
        }
        const list = [...stamps.values()];
        const regionConquered: Record<string, number> = {};
        for (const st of list) if (st.region) regionConquered[st.region] = (regionConquered[st.region] ?? 0) + 1;

        const conquered = list.length;
        let level = "골프 입문자";
        let levelNum = 1;
        let nextLevelAt: number | null = 3;
        if (conquered >= 30) { level = "골프 매니아"; levelNum = 4; nextLevelAt = null; }
        else if (conquered >= 10) { level = "골프 탐험가"; levelNum = 3; nextLevelAt = 30; }
        else if (conquered >= 3) { level = "골프 비기너"; levelNum = 2; nextLevelAt = 10; }

        return {
            conquered,
            totalCourses: clubs.length,
            rounds: history.length,
            starsCollected: history.filter((h) => h.score > 0 && h.score < 85).length,
            level,
            levelNum,
            nextLevelAt,
            stamps: list,
            regionTotals,
            regionConquered,
        };
    }

    // seedGolfSampleData 는 2026-09-09 삭제했다. "기록이 없으면 표본 8라운드를 심는" 코드였는데,
    // 없는 경기 번호(00000000-…)로 넣어 프로덕션에서 여권 화면을 열 때마다 500 이 났다.
    // 외래키가 없었다면 조용히 모든 사용자에게 가짜 라운드가 쌓였을 것이다. 다시 만들지 말 것.

    async processScorecardOCR(ocrData: any) {
        const items = ocrData.textAnnotations || [];
        if (items.length <= 1) return null;

        const words = items.slice(1).map((ann: any) => ({
            text: ann.description,
            bounds: ann.boundingPoly.vertices,
            center: {
                x: (ann.boundingPoly.vertices[0].x + ann.boundingPoly.vertices[2].x) / 2,
                y: (ann.boundingPoly.vertices[0].y + ann.boundingPoly.vertices[2].y) / 2
            }
        }));

        const rows: any[][] = [];
        words.sort((a: any, b: any) => a.center.y - b.center.y);

        let currentRow: any[] = [];
        let lastY = -1;

        words.forEach((w: any) => {
            if (lastY === -1 || Math.abs(w.center.y - lastY) < 15) {
                currentRow.push(w);
            } else {
                rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));
                currentRow = [w];
            }
            lastY = w.center.y;
        });
        if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.center.x - b.center.x));

        const parsed = {
            meta: { source_type: "SMART_SCORE_IMAGE", course_name_raw: "Auto Detected", date: new Date().toISOString().split('T')[0] },
            courses: [] as any[]
        };

        let currentCourse: any = { course_name: "Out Course", pars: [], players: [] };

        rows.forEach(row => {
            const rowText = row.map(w => w.text).join(' ');
            if (rowText.includes('PAR') || rowText.match(/[345]\s[345]\s[345]/)) {
                currentCourse.pars = row.filter(w => w.text.match(/^\d$/)).map(w => parseInt(w.text));
            } else if (row.length >= 10 && row[0].text.length >= 2) {
                const scores = row.slice(1, 10).map(w => parseInt(w.text) || 0);
                const total = parseInt(row[10]?.text) || scores.reduce((a, b) => a + b, 0);
                currentCourse.players.push({ name: row[0].text, scores, total });
            }
        });

        if (currentCourse.pars.length > 0) parsed.courses.push(currentCourse);

        return parsed;
    }

    async updateCourseHoleInfo(data: { courseId: string, courseName: string, subPathName?: string, holeNo: number, par: number }) {
        const [existing] = await db.select().from(hiqCourseHoleInfo)
            .where(and(
                eq(hiqCourseHoleInfo.courseId, data.courseId),
                eq(hiqCourseHoleInfo.subPathName, data.subPathName || ""),
                eq(hiqCourseHoleInfo.holeNo, data.holeNo)
            ));

        if (existing) {
            if (existing.par === data.par) {
                await db.update(hiqCourseHoleInfo)
                    .set({ voteCount: existing.voteCount + 1, isVerified: existing.voteCount + 1 >= 5 })
                    .where(eq(hiqCourseHoleInfo.id, existing.id));
            } else {
                console.warn(`PAR Mismatch for ${data.courseName} H${data.holeNo}: DB ${existing.par} vs Extracted ${data.par}`);
            }
        } else {
            await db.insert(hiqCourseHoleInfo).values({
                courseId: data.courseId,
                courseName: data.courseName,
                subPathName: data.subPathName || "",
                holeNo: data.holeNo,
                par: data.par,
                voteCount: 1,
                isVerified: false
            });
        }
    }

    // --- Golf Match Session (PIN based) ---
    //
    // 2026-09-11 다시 짰다(골프 리뷰). 예전 구멍:
    //  1. 점수 저장이 클라이언트가 보낸 players 배열을 그대로 병합해, 남의 회원번호를 끼워 넣거나 남의 점수·이름을
    //     덮을 수 있었다 → 이미 방에 있는 사람의 점수·벌타 칸만, 모양을 검사해서 받는다.
    //  2. 끝난 경기에 저장이 한 번 더 오면 'playing' 으로 되돌아가 종료가 두 번 기록됐다 → 상태를 먼저 본다.
    //  3. 안 친 홀을 파로 채워 빈 경기도 '70타 공식 라운드' 가 됐다 → 18홀을 다 적은 회원만 기록한다.
    //  4. 핀이 겹치는지·만료됐는지 보지 않았다 → 살아 있는 방과 안 겹치는 핀, 대기방 핀은 6시간.
    //  5. 종료가 트랜잭션이 아니어서 중간 실패 시 일부 기록만 남았다 → 상태 변경과 기록을 한 트랜잭션으로.
    // 누가 쓸 수 있는지(방장만)는 라우트(golf.ts)가 정한다.

    async createGolfMatchSession(hostId: string, input: GolfMatchCreateInput): Promise<any> {
        const [host] = await db.select({ name: hiqMembers.name, profileImageUrl: profiles.profileImageUrl })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, hostId))
            .limit(1);
        if (!host) throw notFound("회원 정보를 찾을 수 없어요");

        const rules = rulesFor(input.gameMode, input);
        const solo = input.gameMode === "stroke" && input.strokeMode === "solo";
        const guests = solo ? [] : (input.guests ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 3);
        const players = [
            { memberId: hostId, name: host.name || "방장", profileImageUrl: host.profileImageUrl ?? null, scores: new Array(18).fill(0), penalties: blankPenalties() },
            ...guests.map((name) => ({
                memberId: `${GUEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
                name, isGuest: true, profileImageUrl: null,
                scores: new Array(18).fill(0), penalties: blankPenalties(),
            })),
        ];

        const pinCode = await this.freshPin();
        const [session] = await db.insert(golfMatchSessions).values({
            pinCode,
            hostId,
            courseId: input.courseId || null,
            courseName: input.courseName || null,
            gameMode: input.gameMode,
            strokeMode: input.gameMode === "stroke" ? (input.strokeMode ?? "group") : null,
            stake: rules.stake,
            useOecd: false,
            useDouble: rules.useDouble,
            doublingMode: rules.doublingMode,
            birdieAmount: rules.birdieAmount,
            eagleAmount: rules.eagleAmount,
            frontCourseName: input.frontCourseName || null,
            backCourseName: input.backCourseName || null,
            // 혼자 기록은 기다릴 사람이 없다 — 바로 진행 중으로 연다(예전엔 화면이 점수 저장을 한 번 불러 시작시켰다).
            status: solo ? "playing" : "waiting",
            currentHole: 1,
            players,
        }).returning();
        return session;
    }

    /** 살아 있는 방(대기 6시간·진행 12시간)과 겹치지 않는 4자리 핀. */
    private async freshPin(): Promise<string> {
        const now = Date.now();
        for (let i = 0; i < 40; i++) {
            const pin = String(Math.floor(1000 + Math.random() * 9000));
            const [clash] = await db.select({ id: golfMatchSessions.id }).from(golfMatchSessions)
                .where(and(eq(golfMatchSessions.pinCode, pin), or(
                    and(eq(golfMatchSessions.status, "waiting"), gte(golfMatchSessions.createdAt, new Date(now - PIN_TTL_MS))),
                    and(eq(golfMatchSessions.status, "playing"), gte(golfMatchSessions.updatedAt, new Date(now - ACTIVE_TTL_MS))),
                )))
                .limit(1);
            if (!clash) return pin;
        }
        throw conflict("지금 열린 방이 너무 많아요. 잠시 후 다시 만들어 주세요");
    }

    /** 전반·후반 코스의 실제 파. 모르는 홀은 known=false 로 표시된다(계산에서 버디·배판 판정에 안 쓴다). */
    private async parsFor(session: { courseId: string | null; frontCourseName: string | null; backCourseName: string | null }): Promise<CoursePars> {
        if (!session.courseId || !UUID_RE.test(session.courseId)) return resolvePars(null, null);
        try {
            const courses = await db.select({ name: rankueGolfCourses.name, pars: rankueGolfCourses.pars })
                .from(rankueGolfCourses)
                .where(eq(rankueGolfCourses.clubId, session.courseId));
            return resolvePars(
                courses.find((c) => c.name === session.frontCourseName)?.pars,
                courses.find((c) => c.name === session.backCourseName)?.pars,
            );
        } catch (e) {
            console.error("[golf] course pars", e);
            return resolvePars(null, null);
        }
    }

    async getGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        if (!session) return null;
        const cp = await this.parsFor(session);
        return { ...session, pars: cp.pars, parKnown: cp.known };
    }

    /** 핀으로 들어갈 수 있는 방: 6시간 안에 만든 대기방, 또는 12시간 안에 손댄 진행 중 방(늦게 온 사람·다시 들어오기). */
    private async findJoinableByPin(pin: string): Promise<any> {
        const now = Date.now();
        const [row] = await db.select().from(golfMatchSessions)
            .where(and(eq(golfMatchSessions.pinCode, pin), or(
                and(eq(golfMatchSessions.status, "waiting"), gte(golfMatchSessions.createdAt, new Date(now - PIN_TTL_MS))),
                and(eq(golfMatchSessions.status, "playing"), gte(golfMatchSessions.updatedAt, new Date(now - ACTIVE_TTL_MS))),
            )))
            .orderBy(desc(golfMatchSessions.createdAt))
            .limit(1);
        return row;
    }

    /** added: 새로 들어왔는가(다시 들어오기는 false — PIN 시도 카운터를 지우지 않는다). */
    async joinGolfMatchSession(pin: string, memberId: string): Promise<{ session: any; added: boolean }> {
        const found = await this.findJoinableByPin(pin);
        if (!found) throw notFound("그 번호로 열린 방이 없어요. 번호를 다시 확인해 주세요");

        const [me] = await db.select({ name: hiqMembers.name, profileImageUrl: profiles.profileImageUrl })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, memberId))
            .limit(1);

        // 행을 잠그고 다시 읽는다 — 두 사람이 동시에 들어오거나 방장이 막 시작/종료해도 낡은 상태에 붙지 않는다.
        return await db.transaction(async (tx) => {
            const [session] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, found.id))
                .for("update");
            if (!session || (session.status !== "waiting" && session.status !== "playing")) {
                throw conflict("이미 끝난 경기예요");
            }
            const players = (session.players || []) as any[];
            if (players.some((p) => p.memberId === memberId)) return { session, added: false }; // 다시 들어오기
            // 시작한 경기엔 원래 있던 사람만 다시 들어온다. 새 참가를 받으면 4자리만 맞힌 낯선 사람이 라운드 도중
            // 참가자가 돼 전원의 이름·점수를 읽고, 방장은 내보낼 방법이 없었다(2026-09-11 리뷰). 혼자 기록 방도 같다.
            if (session.status !== "waiting" || session.strokeMode === "solo") {
                throw conflict("이미 시작한 경기라 새로 들어올 수 없어요");
            }
            if (players.length >= 4) throw conflict("방이 꽉 찼어요 (최대 4명)");

            const [updated] = await tx.update(golfMatchSessions)
                .set({
                    players: [...players, {
                        memberId,
                        name: me?.name || "동반자",
                        profileImageUrl: me?.profileImageUrl ?? null,
                        scores: new Array(18).fill(0),
                        penalties: blankPenalties(),
                    }],
                    updatedAt: new Date(),
                })
                .where(eq(golfMatchSessions.id, session.id))
                .returning();
            return { session: updated, added: true };
        });
    }

    async startGolfMatchSession(id: string): Promise<any> {
        const [started] = await db.update(golfMatchSessions)
            .set({ status: "playing", currentHole: 1, updatedAt: new Date() })
            .where(and(eq(golfMatchSessions.id, id), eq(golfMatchSessions.status, "waiting")))
            .returning();
        if (started) return started;
        const [cur] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        if (cur?.status === "playing") return cur; // 두 번 눌러도 같다
        throw conflict("이미 끝난 방이에요");
    }

    /**
     * 방장이 보낸 점수를 **이미 방에 있는 사람의 점수·벌타 칸에만** 적는다.
     * 이름·사진·회원번호는 여기서 절대 바뀌지 않고, 모르는 회원번호는 버린다.
     */
    async updateGolfMatchScore(id: string, holeNo: number, incoming: unknown): Promise<any> {
        return await db.transaction(async (tx) => {
            const [current] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, id))
                .for("update");
            if (!current) throw notFound("게임을 찾을 수 없어요");
            if (current.status === "waiting") throw conflict("아직 시작하지 않은 경기예요");
            if (current.status !== "playing") throw conflict("이미 끝난 경기예요. 점수를 바꿀 수 없어요");

            const byId = new Map<string, any>();
            for (const p of Array.isArray(incoming) ? incoming : []) {
                if (p && typeof p.memberId === "string") byId.set(p.memberId, p);
            }
            const merged = ((current.players || []) as any[]).map((dbP) => {
                const inc = byId.get(dbP.memberId);
                if (!inc) return dbP;
                const scores = sanitizeScores(inc.scores);
                if (!scores) throw badRequest("점수 형식이 올바르지 않아요 (홀당 1~15타)");
                return { ...dbP, scores, penalties: sanitizePenalties(inc.penalties) ?? dbP.penalties };
            });

            const [session] = await tx.update(golfMatchSessions)
                .set({ players: merged, currentHole: holeNo, updatedAt: new Date() })
                .where(eq(golfMatchSessions.id, id))
                .returning();
            return session;
        });
    }

    async updateGolfMatchCourse(id: string, frontName?: string, backName?: string): Promise<any> {
        const updateData: any = { updatedAt: new Date() };
        if (frontName) updateData.frontCourseName = frontName;
        if (backName) updateData.backCourseName = backName;

        // 끝난 경기의 코스를 바꾸면 파가 소급해서 바뀌었다 — 진행 중일 때만.
        const [session] = await db.update(golfMatchSessions)
            .set(updateData)
            .where(and(eq(golfMatchSessions.id, id), inArray(golfMatchSessions.status, ["waiting", "playing"])))
            .returning();
        if (!session) throw conflict("끝난 경기는 코스를 바꿀 수 없어요");
        return session;
    }

    /** 방장이 방을 접는다. 기록은 남기지 않는다. */
    async abandonGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.update(golfMatchSessions)
            .set({ status: "abandoned", updatedAt: new Date() })
            .where(and(eq(golfMatchSessions.id, id), inArray(golfMatchSessions.status, ["waiting", "playing"])))
            .returning();
        if (!session) throw conflict("이미 끝난 경기예요");
        return session;
    }

    /** 홈의 '진행 중 라운드' 카드. 12시간 안에 손댄, 내가 들어 있는 대기·진행 중 방 하나. */
    async getActiveGolfMatch(memberId: string): Promise<any> {
        const [s] = await db.select().from(golfMatchSessions)
            .where(and(
                inArray(golfMatchSessions.status, ["waiting", "playing"]),
                gte(golfMatchSessions.updatedAt, new Date(Date.now() - ACTIVE_TTL_MS)),
                sql`${golfMatchSessions.players} @> ${JSON.stringify([{ memberId }])}::jsonb`,
            ))
            .orderBy(desc(golfMatchSessions.updatedAt))
            .limit(1);
        if (!s) return null;
        const isHost = s.hostId === memberId;
        return {
            id: s.id,
            status: s.status,
            courseName: s.courseName,
            currentHole: s.currentHole,
            isHost,
            pinCode: isHost ? s.pinCode : undefined,
            playerCount: ((s.players || []) as any[]).length,
            updatedAt: s.updatedAt,
        };
    }

    /**
     * 경기를 끝낸다. 상태 변경·정산 저장·기록 추가를 **한 트랜잭션**으로 한다.
     * 기록(평균·등급·여권 도장)은 18홀을 다 적은 회원만. 게스트·중도 종료한 사람은 점수판에만 남는다.
     */
    async finishGolfMatchSession(id: string): Promise<any> {
        const [pre] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        if (!pre) throw notFound("게임을 찾을 수 없어요");
        if (pre.status === "finished") return { ...pre, ...(await this.parsView(pre)), recordedMemberIds: [] };
        if (pre.status !== "playing") throw conflict("진행 중인 경기만 끝낼 수 있어요");

        const cp = await this.parsFor(pre);

        // 기록 대상 후보: 실제 회원만(탈퇴 등으로 없는 번호면 외래키에 걸려 전체가 실패한다).
        const memberIds = ((pre.players || []) as any[])
            .map((p) => String(p?.memberId ?? ""))
            .filter((mid) => !isGuestId(mid) && UUID_RE.test(mid));
        const existing = memberIds.length
            ? new Set((await db.select({ id: hiqMembers.id }).from(hiqMembers).where(inArray(hiqMembers.id, memberIds))).map((r) => r.id))
            : new Set<string>();

        const { session, recorded } = await db.transaction(async (tx) => {
            const [cur] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, id))
                .for("update");
            if (!cur) throw notFound("게임을 찾을 수 없어요");
            if (cur.status === "finished") return { session: cur, recorded: [] as string[] };
            if (cur.status !== "playing") throw conflict("진행 중인 경기만 끝낼 수 있어요");

            const players = (cur.players || []) as any[];
            const settlement = settleMatch(players, cp, rulesFor(cur.gameMode, cur as any));
            const [done] = await tx.update(golfMatchSessions)
                .set({ status: "finished", settlement, finishedAt: new Date(), updatedAt: new Date() })
                .where(eq(golfMatchSessions.id, id))
                .returning();

            const complete = players.filter((p) => existing.has(p.memberId) && isCompleteRound(p.scores));
            const strokes = complete.map((p) => roundTotals(p.scores, cp.pars).strokes);
            // 승자는 결과 화면과 같은 규칙(shared rankRound): 18홀을 다 친 사람 중 파 대비 가장 적게 친 사람.
            // 게스트가 이겼으면 회원 누구도 승자가 아니다. 혼자 친 라운드엔 승자가 없다. 동타면 공동 승.
            const winnerIds = new Set(
                rankRound(players, cp.pars).filter((r) => r.winner && r.holesPlayed === 18).map((r) => r.player.memberId),
            );
            const recorded: string[] = [];
            for (let i = 0; i < complete.length; i++) {
                const p = complete[i];
                const ins = await tx.insert(hiqGameHistory).values({
                    memberId: p.memberId,
                    gameId: null,
                    gameMode: "match",
                    gameType: "golf",
                    score: strokes[i],
                    innings: 18,
                    average: (strokes[i] / 18).toFixed(2),
                    isWinner: winnerIds.has(p.memberId),
                    isRanked: true,
                    // 골프장을 모르면 비워 둔다 — '알 수 없는 구장' 이름이 여권에 가짜 골프장 도장으로 찍혔다.
                    locationName: cur.courseName || null,
                    subType: [cur.frontCourseName, cur.backCourseName].filter(Boolean).join(" / ") || null,
                    sportCategory: "GOLF" as any,
                    scoreJson: p.scores,
                    golfSessionId: cur.id,
                    golfClubId: cur.courseId || null,
                }).onConflictDoNothing().returning({ id: hiqGameHistory.id });
                if (ins.length > 0) recorded.push(p.memberId);
            }
            return { session: done, recorded };
        });

        for (const mid of recorded) {
            await this.updateGolfStats(mid).catch((e) => console.error("[golf] updateGolfStats", e));
        }
        return { ...session, pars: cp.pars, parKnown: cp.known, recordedMemberIds: recorded };
    }

    private async parsView(session: any): Promise<{ pars: number[]; parKnown: boolean[] }> {
        const cp = await this.parsFor(session);
        return { pars: cp.pars, parKnown: cp.known };
    }

    async findGolfSessionForHistory(history: HiqGameHistory): Promise<any> {
        // 2026-09-11 부터 기록에 경기 번호가 붙는다. 있으면 그걸로 바로 찾는다.
        const linkedId = (history as any).golfSessionId as string | null | undefined;
        if (linkedId) {
            const [linked] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, linkedId));
            if (linked) return this.golfSessionAsGame(linked);
        }
        return this.findGolfSessionByTime(history);
    }

    /** 경기 번호가 없는 옛 기록: 종료 시각 근처의 경기를 추측한다. */
    private async findGolfSessionByTime(history: HiqGameHistory): Promise<any> {
        // Heuristic: Find session updated around the same time as history creation
        const timeWindowMinutes = 10;
        const historyTime = new Date(history.createdAt);
        const startTime = new Date(historyTime.getTime() - timeWindowMinutes * 60000);
        const endTime = new Date(historyTime.getTime() + timeWindowMinutes * 60000);

        // Find session
        const sessions = await db.select().from(golfMatchSessions)
            .where(and(
                eq(golfMatchSessions.status, 'finished'),
                gte(golfMatchSessions.updatedAt, startTime),
                lte(golfMatchSessions.updatedAt, endTime)
            ));

        // Candidates: any finished session in the window that contains this member.
        const candidates = sessions.filter(s => (s.players || []).some((p: any) => p.memberId === history.memberId));
        if (candidates.length === 0) return null;

        // Time-only matching is ambiguous when the same member finishes two sessions within the
        // window. Disambiguate deterministically using data already stored on the history row:
        // the exact per-hole scoreJson and the course name. Fall back to closest-in-time.
        const historyScores = JSON.stringify((history as any).scoreJson ?? null);
        const sameMemberScores = (s: any) => {
            const p = (s.players || []).find((pl: any) => pl.memberId === history.memberId);
            return p ? JSON.stringify(p.scores ?? null) : null;
        };
        const score = (s: any) => {
            let pts = 0;
            if (historyScores !== "null" && sameMemberScores(s) === historyScores) pts += 4; // strongest signal
            if (history.locationName && s.courseName === history.locationName) pts += 2;
            // Tiebreak: prefer the session updated closest to when the history row was created.
            const proximity = 1 - Math.min(1, Math.abs(new Date(s.updatedAt).getTime() - historyTime.getTime()) / (timeWindowMinutes * 60000));
            return pts + proximity;
        };
        const match = candidates.reduce((best, s) => (score(s) > score(best) ? s : best), candidates[0]);

        if (!match) return null;
        return this.golfSessionAsGame(match);
    }

    /** 기록 상세 대화상자가 쓰는 HiqGame 모양으로 바꾼다. 파는 그 경기 코스의 실제 파(모르면 기본 배치). */
    private async golfSessionAsGame(match: any): Promise<any> {
        const players = match.players;
        const pars = (await this.parsFor(match)).pars;

        const calculateBirdiePlus = (scores: number[] | undefined) => {
            if (!scores) return 0;
            return scores.reduce((count, score, idx) => {
                if (score > 0 && score <= (pars[idx] || 4) - 1) return count + 1;
                return count;
            }, 0);
        };

        return {
            id: match.id,
            gameMode: 'match',
            gameType: 'golf',
            storeId: 'golf-field',
            isRanked: true,
            winnerId: null, // Not strictly identifying winner here
            totalInnings: 18,
            status: 'finished',
            pars, // Include PAR data for scorecard display

            player1Id: players[0]?.memberId,
            player1Name: players[0]?.name,
            player1Avatar: players[0]?.profileImageUrl,
            player1Score: players[0]?.scores ? players[0].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player1Innings: players[0]?.scores,
            player1HighRun: calculateBirdiePlus(players[0]?.scores),

            player2Id: players[1]?.memberId,
            player2Name: players[1]?.name,
            player2Avatar: players[1]?.profileImageUrl,
            player2Score: players[1]?.scores ? players[1].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player2Innings: players[1]?.scores,
            player2HighRun: calculateBirdiePlus(players[1]?.scores),

            player3Id: players[2]?.memberId,
            player3Name: players[2]?.name,
            player3Avatar: players[2]?.profileImageUrl,
            player3Score: players[2]?.scores ? players[2].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player3Innings: players[2]?.scores,
            player3HighRun: calculateBirdiePlus(players[2]?.scores),

            player4Id: players[3]?.memberId,
            player4Name: players[3]?.name,
            player4Avatar: players[3]?.profileImageUrl,
            player4Score: players[3]?.scores ? players[3].scores.reduce((sum: number, s: number, idx: number) => sum + (s > 0 ? s : (pars[idx] || 4)), 0) : 0,
            player4Innings: players[3]?.scores,
            player4HighRun: calculateBirdiePlus(players[3]?.scores),
        };
    }

    // --- Golf Membership Orders ---
    async createGolfMembershipOrder(data: InsertGolfMembershipOrder): Promise<GolfMembershipOrder> {
        const [order] = await db.insert(golfMembershipOrders).values(data).returning();
        return order;
    }

    async getGolfMembershipOrders(): Promise<GolfMembershipOrder[]> {
        return await db.select().from(golfMembershipOrders).orderBy(desc(golfMembershipOrders.createdAt));
    }

    async updateGolfMembershipOrderStatus(id: string, status: any): Promise<GolfMembershipOrder | undefined> {
        const [order] = await db.update(golfMembershipOrders)
            .set({ status, updatedAt: new Date() })
            .where(eq(golfMembershipOrders.id, id))
            .returning();
        return order;
    }
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}
