import { db } from "../db.js";
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
import { eq, ne, desc, asc, and, or, sql, gte, lte, isNull, like, inArray } from "drizzle-orm";
import { notFound, conflict } from "../utils/errors.js";
import { resolveGolfRegionCode, expandRegionCodes, legacyRegionKeywords } from "../../shared/golfRegions.js";
import { golfRegionCodeByCourseId } from "../../shared/golfCourseRegions.js";

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

    // 시간대 — 한국시각 기준. 'all' 은 거르지 않는다는 뜻이다.
    const times = list(filters?.time).filter((t) => t !== "all");
    if (times.length > 0) {
        const kstHour = sql<number>`extract(hour from (${golfBookings.datetime} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))`;
        const spans: any[] = [];
        if (times.includes("morning")) spans.push(sql`${kstHour} < 12`);
        if (times.includes("afternoon")) spans.push(sql`${kstHour} >= 12 AND ${kstHour} < 17`);
        if (times.includes("night")) spans.push(sql`${kstHour} >= 17`);
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
            clubs = await db.select().from(rankueGolfClubs)
                .where(like(rankueGolfClubs.name, `%${search}%`))
                .orderBy(asc(rankueGolfClubs.name));
        } else {
            clubs = await db.select().from(rankueGolfClubs).orderBy(asc(rankueGolfClubs.name));
        }

        // Calculate distance and sort if user location is provided
        let result = clubs.map(c => ({
            ...c,
            totalHoles: 18, // Default
            imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=800",
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
        // 신고 누적·운영자 조치로 가려진 매물은 목록에서 뺀다(행은 남는다 — 추적용)
        const conditions: any[] = [eq(golfBookings.isBlinded, false)];
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
                conditions.push(
                    or(
                        like(golfBookings.courseName, `%${filters.courseName}%`),
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

        return await db.select().from(golfBookings)
            .where(filteredConditions.length > 0 ? and(...filteredConditions) : undefined)
            .orderBy(asc(golfBookings.datetime));
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

    /** 한 건 조회 — 조인 신청 전 검사(마감·본인 글·가려진 글)에 쓴다. */
    async getGolfBooking(id: string): Promise<GolfBooking | undefined> {
        const [row] = await db.select().from(golfBookings).where(eq(golfBookings.id, id)).limit(1);
        return row;
    }

    // ── 조인 신청 ────────────────────────────────────────────────────────
    // 조인 글은 golf_bookings(listing_type='JOIN') 행이고, 신청은 여기 따로 쌓인다.
    // 그전엔 '조인 신청하기' 가 문자만 열고 아무것도 안 남겼다(2026-09-09).

    /** 조인 글별 현재 신청 인원. 목록에 뿌리려고 한 번에 센다. */
    async countJoinRequests(bookingIds: string[]): Promise<Map<string, number>> {
        if (bookingIds.length === 0) return new Map();
        const rows = await db.select({
            bookingId: golfJoinRequests.bookingId,
            n: sql<number>`count(*)::int`,
        })
            .from(golfJoinRequests)
            .where(and(inArray(golfJoinRequests.bookingId, bookingIds), eq(golfJoinRequests.status, "applied")))
            .groupBy(golfJoinRequests.bookingId);
        return new Map(rows.map((r) => [r.bookingId, Number(r.n)]));
    }

    /** 내가 신청해 둔 조인 글 id 들. */
    async myJoinRequestIds(memberId: string, bookingIds: string[]): Promise<Set<string>> {
        if (bookingIds.length === 0) return new Set();
        const rows = await db.select({ bookingId: golfJoinRequests.bookingId })
            .from(golfJoinRequests)
            .where(and(
                eq(golfJoinRequests.memberId, memberId),
                eq(golfJoinRequests.status, "applied"),
                inArray(golfJoinRequests.bookingId, bookingIds),
            ));
        return new Set(rows.map((r) => r.bookingId));
    }

    /**
     * 신청한다. 정원이 차 있으면 거절한다 — 마지막 한 자리에 둘이 동시에 들어오는 경우까지 막으려면
     * 세고 넣는 사이가 갈라지면 안 되므로, 한 문장 안에서 세고 넣는다.
     */
    async applyToJoin(bookingId: string, memberId: string, capacity: number): Promise<"ok" | "full" | "already"> {
        const [existing] = await db.select({ status: golfJoinRequests.status })
            .from(golfJoinRequests)
            .where(and(eq(golfJoinRequests.bookingId, bookingId), eq(golfJoinRequests.memberId, memberId)))
            .limit(1);
        if (existing?.status === "applied") return "already";

        const inserted = await db.execute(sql`
            INSERT INTO golf_join_requests (booking_id, member_id, status, updated_at)
            SELECT ${bookingId}::uuid, ${memberId}::uuid, 'applied', now()
            WHERE (
              SELECT count(*) FROM golf_join_requests
              WHERE booking_id = ${bookingId}::uuid AND status = 'applied'
            ) < ${capacity}
            ON CONFLICT (booking_id, member_id)
            DO UPDATE SET status = 'applied', updated_at = now()
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
                eq(golfJoinRequests.status, "applied"),
            ))
            .returning({ id: golfJoinRequests.id });
        return rows.length > 0;
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
     * 되돌리면 'applied' 로 — 잘못 누른 걸 못 고치면 표시를 무서워서 못 쓴다.
     * 본인이 취소한 행('cancelled')은 건드리지 않는다. 취소와 노쇼는 다른 일이다.
     */
    async setJoinNoShow(bookingId: string, memberId: string, noShow: boolean): Promise<boolean> {
        const rows = await db.update(golfJoinRequests)
            .set({
                status: noShow ? "noshow" : "applied",
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
                eq(golfJoinRequests.status, noShow ? "applied" : "noshow"),
            ))
            .returning({ id: golfJoinRequests.id });
        return rows.length > 0;
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

    async getGolfPassportStats(memberId: string) {
        const history = await db.select().from(hiqGameHistory)
            .where(and(
                eq(hiqGameHistory.memberId, memberId),
                eq(hiqGameHistory.sportCategory, 'GOLF' as any)
            ));

        const uniqueCourses = new Set(history.map(h => h.locationName).filter(Boolean));
        const starsCollected = history.filter(h => h.score !== null && h.score < 85).length;

        let level = "골프 입문자";
        let levelNum = 1;
        if (uniqueCourses.size >= 30) { level = "골프 매니아"; levelNum = 4; }
        else if (uniqueCourses.size >= 10) { level = "골프 탐험가"; levelNum = 3; }
        else if (uniqueCourses.size >= 3) { level = "골프 비기너"; levelNum = 2; }

        return {
            conquered: uniqueCourses.size,
            starsCollected,
            rankPercent: Math.max(1, 15 - Math.floor(uniqueCourses.size / 2)),
            level,
            levelNum,
            totalCourses: 520
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
    async createGolfMatchSession(data: any): Promise<any> {
        const pinCode = Math.floor(1000 + Math.random() * 9000).toString();

        const host = await db.select({
            name: hiqMembers.name,
            profileImageUrl: profiles.profileImageUrl
        })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, data.hostId))
            .limit(1);

        const [session] = await db.insert(golfMatchSessions).values({
            ...data,
            doublingMode: data.doublingMode, // Explicitly set to avoid default override
            pinCode,
            players: [{
                memberId: data.hostId,
                name: host[0]?.name || "Host",
                profileImageUrl: host[0]?.profileImageUrl,
                scores: new Array(18).fill(0),
                penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
            }]
        }).returning();
        return session;
    }

    async getGolfMatchSession(id: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
        if (!session) return null;

        let pars: number[] = new Array(18).fill(4);

        if (session.courseId) {
            try {
                // Fetch course info to populate Hole Pars
                const courses = await db.select().from(rankueGolfCourses)
                    .where(eq(rankueGolfCourses.clubId, session.courseId));

                const frontPars = courses.find(c => c.name === session.frontCourseName)?.pars as number[];
                const backPars = courses.find(c => c.name === session.backCourseName)?.pars as number[];

                if (frontPars && backPars) {
                    pars = [...frontPars, ...backPars];
                } else if (frontPars) {
                    pars = [...frontPars, ...frontPars];
                }
            } catch (e) {
                console.error("Error fetching course pars:", e);
            }
        }

        return { ...session, pars };
    }

    async getGolfMatchSessionByPin(pin: string): Promise<any> {
        const [session] = await db.select().from(golfMatchSessions).where(and(eq(golfMatchSessions.pinCode, pin), eq(golfMatchSessions.status, 'waiting')));
        return session;
    }

    async joinGolfMatchSession(pin: string, memberId: string, name: string): Promise<any> {
        const found = await this.getGolfMatchSessionByPin(pin);
        if (!found) throw notFound("게임을 찾을 수 없거나 이미 시작되었습니다.");

        const player = await db.select({
            name: hiqMembers.name,
            profileImageUrl: profiles.profileImageUrl
        })
            .from(hiqMembers)
            .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
            .where(eq(hiqMembers.id, memberId))
            .limit(1);

        // Append the joining player under a row lock. Re-read inside the transaction so the
        // capacity/dedup checks and the write see a consistent snapshot — two players joining
        // at once (or a join racing a host score-save) can't both append onto stale state.
        return await db.transaction(async (tx) => {
            const [session] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, found.id))
                .for('update');
            if (!session) throw notFound("게임을 찾을 수 없거나 이미 시작되었습니다.");

            const players = session.players || [];
            if (players.length >= 4) throw conflict("방이 꽉 찼습니다.");
            if (players.some((p: any) => p.memberId === memberId)) return session;

            const updatedPlayers = [...players, {
                memberId,
                name: player[0]?.name || name,
                profileImageUrl: player[0]?.profileImageUrl,
                scores: new Array(18).fill(0),
                penalties: Array.from({ length: 18 }, () => ({ ob: false, hz: false, bunk: false, putt3: false }))
            }];

            const [updated] = await tx.update(golfMatchSessions)
                .set({ players: updatedPlayers })
                .where(eq(golfMatchSessions.id, session.id))
                .returning();
            return updated;
        });
    }

    async updateGolfMatchScore(id: string, holeNo: number, players: any, nearHistory?: any): Promise<any> {
        // Concurrent writers (host saving scores vs a guest joining via joinGolfMatchSession)
        // both touch the same row's `players` JSON. A blind overwrite is last-write-wins and
        // silently drops the other writer's change. Serialize with a row lock and merge by
        // memberId so a concurrent join is preserved and we only apply the incoming scores.
        return await db.transaction(async (tx) => {
            const [current] = await tx.select().from(golfMatchSessions)
                .where(eq(golfMatchSessions.id, id))
                .for('update');
            if (!current) return undefined;

            const incomingById = new Map<string, any>((players || []).map((p: any) => [p.memberId, p]));
            const merged = (current.players || []).map((dbP: any) => {
                const inc = incomingById.get(dbP.memberId);
                if (!inc) return dbP; // player not in this payload (e.g. concurrently joined) — keep as-is
                incomingById.delete(dbP.memberId);
                return { ...dbP, ...inc };
            });
            // Append any genuinely new players present only in the payload.
            for (const inc of incomingById.values()) merged.push(inc);

            const [session] = await tx.update(golfMatchSessions)
                .set({
                    players: merged,
                    currentHole: holeNo,
                    // Preserve existing nearHistory when the caller doesn't send it (most saves don't).
                    nearHistory: nearHistory !== undefined ? nearHistory : (current.nearHistory || {}),
                    updatedAt: new Date(),
                    status: 'playing'
                })
                .where(eq(golfMatchSessions.id, id))
                .returning();
            return session;
        });
    }

    async updateGolfMatchCourse(id: string, frontName?: string, backName?: string): Promise<any> {
        const updateData: any = { updatedAt: new Date() };
        if (frontName) updateData.frontCourseName = frontName;
        if (backName) updateData.backCourseName = backName;

        const [session] = await db.update(golfMatchSessions)
            .set(updateData)
            .where(eq(golfMatchSessions.id, id))
            .returning();
        return session;
    }

    async finishGolfMatchSession(id: string): Promise<any> {
        // Idempotency guard: only the FIRST caller transitions the row to 'finished'.
        // The WHERE status != 'finished' makes this atomic, so concurrent/duplicate finish
        // requests (double-tap, retry) cannot both insert history / double-count stats.
        const [session] = await db.update(golfMatchSessions)
            .set({ status: 'finished', updatedAt: new Date() })
            .where(and(eq(golfMatchSessions.id, id), ne(golfMatchSessions.status, 'finished')))
            .returning();

        // Already finished (or not found): return current state without re-inserting history.
        if (!session) {
            const [existing] = await db.select().from(golfMatchSessions).where(eq(golfMatchSessions.id, id));
            return existing;
        }

        {
            const DEFAULT_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
            const pars = (session as any).pars || DEFAULT_PAR;

            for (const player of session.players) {
                if (!player.memberId) continue; // Skip malformed player entries
                const scores = player.scores || new Array(18).fill(0);

                // Batch Update Fix: Treat 0 as Par for total calculation
                let totalScore = 0;
                for (let i = 0; i < 18; i++) {
                    const s = scores[i] || 0;
                    totalScore += (s > 0) ? s : (pars[i] || 4);
                }

                await db.insert(hiqGameHistory).values({
                    memberId: player.memberId,
                    gameId: null,
                    gameMode: 'match',
                    gameType: 'golf',
                    score: totalScore,
                    innings: 18,
                    average: (totalScore / 18).toFixed(2),
                    isWinner: false,
                    isRanked: true,
                    locationName: session.courseName || "알 수 없는 구장",
                    sportCategory: 'GOLF' as any,
                    scoreJson: player.scores
                });

                // Update member's golf stats (Average based)
                await this.updateGolfStats(player.memberId);
            }
        }

        return session;
    }

    async findGolfSessionForHistory(history: HiqGameHistory): Promise<any> {
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

        // Transform to HiqGame shape for the dialog
        const players = match.players;
        const DEFAULT_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
        // Use session pars if available, otherwise default
        const pars = (match as any).pars || DEFAULT_PAR;

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
