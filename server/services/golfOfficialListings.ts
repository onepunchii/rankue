/**
 * 홈페이지 예약 티를 부킹 목록에 싣기(2026-10-13 오너: "지금 남은 티 섹션 넣지 말고 부킹에 넣어줘 — 시간이랑 이런 거 자동화해서.
 * 부킹에서 누르면 '해당 부킹은 홈페이지 예약 티입니다'라고 안내하고 연결되게. 우리는 조인 · 부킹을 활성화해야 돼").
 *
 * 골프장 공식 예약 화면에 공개된 티타임(golf_open_tees — shared/golfOpenTee)을 **부킹 한 줄과 같은 꼴**로 바꿔 부킹 목록 · 날짜 띠의 건수에 더한다.
 * golf_bookings 표에는 넣지 않는다 — 회원이 올린 글이 아니라서 신청 · 채팅 · 삭제 · 알림의 대상이 아니고, 넣으면 그 길들이 전부 이 줄을 만난다.
 * 화면은 sellerType === "OFFICIAL" 로 가려 따로 그린다(신청 단추 대신 안내 + 골프장 예약 화면으로 가는 링크).
 *
 * 필터는 부킹 목록과 같은 문법으로 건다(storage/golf.repo buildGolfFilterConditions): 지역(코드) · 시간대(11시 · 15시 경계) · 가격 구간.
 * 조건(노캐디 · 식사 …) · 특가 · 긴급처럼 이 줄이 답할 수 없는 필터가 걸리면 싣지 않는다. 모르는 질의 키가 있어도 싣지 않는다(검색 등 다른 화면의 요청).
 */
import { kstDay, teeBookingUrl, teeSource, type OfficialListing, type OpenTeeFeedRow } from "../../shared/golfOpenTee.js";
import { expandRegionCodes, resolveGolfRegionCode } from "../../shared/golfRegions.js";
import { golfRegionCodeByCourseId } from "../../shared/golfCourseRegions.js";

/** 이 줄을 실어도 되는 질의인가 — 아는 키만 있고, 답할 수 없는 필터가 비어 있을 때 */
const KNOWN_KEYS = new Set(["date", "startDate", "endDate", "viewType", "region", "time", "price", "special"]);
const list = (v: unknown): string[] => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v.map(String) : []);

export function officialListingsWanted(query: Record<string, unknown>): boolean {
    for (const k of Object.keys(query)) if (!KNOWN_KEYS.has(k)) return false;
    if (query.viewType === "JOIN") return false;
    return list(query.special).length === 0;
}

export interface OfficialPage { slug: string; name: string; region: string; city: string | null; address: string | null; lat: number | null; lng: number | null; courseIds: number[] }

/** 지역 · 시간대 · 가격 — 부킹 목록의 서버 필터와 같은 판정 */
export function officialMatches(query: Record<string, unknown>, o: { regionCode: string | null; hour: number; price: number | null }): boolean {
    const regions = list(query.region);
    if (regions.length > 0) {
        const codes = expandRegionCodes(regions);
        // 아는 칩이 하나도 없으면(장난 값) 조건을 안 건다 — 부킹 목록과 같다
        if (codes.length > 0 && !(o.regionCode && codes.includes(o.regionCode))) return false;
    }
    const times = list(query.time).filter((t) => t !== "all");
    if (times.length > 0) {
        const span = o.hour < 11 ? "morning" : o.hour < 15 ? "afternoon" : "night";
        if (!times.includes(span)) return false;
    }
    const prices = list(query.price).filter((p) => !p.startsWith("sort_"));
    if (prices.length > 0) {
        const fee = o.price;
        if (fee == null) return false;
        const hit = (prices.includes("under_10") && fee <= 100000) || (prices.includes("range_10_15") && fee >= 100001 && fee <= 150000)
            || (prices.includes("range_15_20") && fee >= 150001 && fee <= 200000) || (prices.includes("over_20") && fee >= 200001);
        if (!hit) return false;
    }
    return true;
}

/** 남은 티 한 줄 → 부킹 한 줄의 꼴. 골프장 페이지를 모르는 줄은 버린다(이름 · 지역을 붙일 수 없다) */
export function toOfficialListing(t: OpenTeeFeedRow, page: OfficialPage | undefined): (OfficialListing & { regionCode: string | null }) | null {
    const source = teeSource(t.slug);
    if (!page || !source) return null;
    const courseId = page.courseIds[0];
    const regionCode = (courseId != null ? golfRegionCodeByCourseId(courseId) : null) ?? resolveGolfRegionCode(page.region, page.address) ?? null;
    return {
        id: `official:${t.slug}:${t.day}:${t.time}:${t.course}`,
        // 골프장 원장의 번호가 있으면 그것으로(골프장별 묶음 · 날씨가 같은 골프장으로 본다), 없으면 이 줄만의 열쇠
        courseId: courseId != null ? String(courseId) : `official:${t.slug}`,
        courseName: page.name,
        region: [page.region, page.city].filter(Boolean).join(" "),
        regionCode: regionCode ? String(regionCode) : null,
        // 한국 시각의 티타임 → 시각(UTC)
        datetime: new Date(`${t.day}T${t.time}:00+09:00`).toISOString(),
        greenFee: t.price ?? 0,
        isHotDeal: false, isBlind: false, options: [], comment: null,
        courseType: t.course || null,
        listingType: "BOOKING",
        sellerType: "OFFICIAL",
        lat: page.lat, lng: page.lng,
        // 예약 화면 — 그 사이트가 날짜를 받으면 그 날이 열린 화면으로
        official: { slug: t.slug, page: teeBookingUrl(source, t.day), course: t.course, holes: t.holes, listPrice: t.listPrice, price: t.price, checkedAt: t.checkedAt, fresh: t.fresh },
    };
}

/** 그 날의 홈페이지 예약 티(부킹 한 줄의 꼴) — 필터를 건 뒤, 이른 시각부터 */
export async function officialListingsOn(day: string, query: Record<string, unknown>, pages: ReadonlyMap<string, OfficialPage>, nowMs = Date.now()): Promise<OfficialListing[]> {
    if (!officialListingsWanted(query) || day < kstDay(nowMs)) return [];
    const { openTeesBetween } = await import("./golfOpenTees.js");
    const out: OfficialListing[] = [];
    for (const t of await openTeesBetween(day, day, nowMs)) {
        const row = toOfficialListing(t, pages.get(t.slug));
        if (!row || !officialMatches(query, { regionCode: row.regionCode, hour: Number(t.time.slice(0, 2)), price: t.price })) continue;
        const { regionCode: _code, ...listing } = row;
        out.push(listing);
    }
    return out;
}

/** 날짜별 건수 — 날짜 띠의 숫자에 더한다. 목록과 같은 필터 */
export async function officialListingCounts(startDay: string, endDay: string, query: Record<string, unknown>, pages: ReadonlyMap<string, OfficialPage>, nowMs = Date.now()): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!officialListingsWanted(query)) return counts;
    const { openTeesBetween } = await import("./golfOpenTees.js");
    for (const t of await openTeesBetween(startDay < kstDay(nowMs) ? kstDay(nowMs) : startDay, endDay, nowMs)) {
        const row = toOfficialListing(t, pages.get(t.slug));
        if (!row || !officialMatches(query, { regionCode: row.regionCode, hour: Number(t.time.slice(0, 2)), price: t.price })) continue;
        counts.set(t.day, (counts.get(t.day) ?? 0) + 1);
    }
    return counts;
}
