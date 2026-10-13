import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { officialListingsWanted, officialMatches, toOfficialListing, type OfficialPage } from "./golfOfficialListings";
import { OFFICIAL_LISTING_COPY, isOfficialListing, type OpenTeeFeedRow } from "../../shared/golfOpenTee";

const root = resolve(__dirname, "../..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");

// 2026-10-13 오너: "지금 남은 티 섹션 넣지 말고 부킹에 넣어줘 — 시간이랑 이런 거 자동화해서. 그리고 부킹에서 누르고 '해당 부킹은 홈페이지 예약 티입니다'라고
// 안내하고 연결되게. 우리는 조인 · 부킹을 활성화해야 돼."
const PAGE: OfficialPage = { slug: "솔라고CC", name: "솔라고CC", region: "충청", city: "태안군", address: "충남 태안군 태안읍", lat: 36.7, lng: 126.3, courseIds: [] };
const TEE: OpenTeeFeedRow = { slug: "솔라고CC", day: "2026-10-14", time: "06:16", course: "Lago-Out", holes: 18, listPrice: 185000, price: 80000, fresh: true, checkedAt: 1_760_000_000_000, page: "x" };

describe("홈페이지 예약 티를 부킹 한 줄의 꼴로", () => {
    it("꼴 — 부킹과 같은 칸 + sellerType OFFICIAL + 골프장 예약 화면. 티타임은 한국 시각을 그대로 옮긴다", () => {
        const l = toOfficialListing(TEE, PAGE)!;
        expect(l).toMatchObject({
            id: "official:솔라고CC:2026-10-14:06:16:Lago-Out", courseName: "솔라고CC", region: "충청 태안군", listingType: "BOOKING", sellerType: "OFFICIAL",
            datetime: "2026-10-13T21:16:00.000Z", greenFee: 80000, courseType: "Lago-Out", isBlind: false, isHotDeal: false, options: [],
            official: { slug: "솔라고CC", page: "http://sollago.co.kr/GolfRes/onepage/real_reservation.asp", course: "Lago-Out", holes: 18, listPrice: 185000, price: 80000, fresh: true },
        });
        expect(isOfficialListing(l)).toBe(true);
        // 부킹의 uuid 와 겹치지 않는다 — 신청 · 삭제 주소에 넣어도 어떤 글과도 맞지 않는다
        expect(l.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
        // 요금을 모르면 0 으로 두되 official.price 는 null(화면이 '요금은 골프장에서'라고 적는다)
        expect(toOfficialListing({ ...TEE, price: null, listPrice: null }, PAGE)).toMatchObject({ greenFee: 0, official: { price: null } });
        // 골프장 페이지를 모르거나 받는 곳이 아니면 싣지 않는다
        expect(toOfficialListing(TEE, undefined)).toBeNull();
        expect(toOfficialListing({ ...TEE, slug: "레이크사이드CC" }, { ...PAGE, slug: "레이크사이드CC" })).toBeNull();
        // 회원이 올린 부킹은 이 꼴이 아니다
        expect(isOfficialListing({ id: "a", sellerType: "STORE" })).toBe(false);
        expect(isOfficialListing({ id: "a", sellerType: "OFFICIAL" })).toBe(false);
    });
    it("싣는 요청 — 날짜 목록 · 건수의 아는 키만. 조인 · 조건 필터 · 특가 · 긴급 · 검색 · 내 글에는 싣지 않는다", () => {
        expect(officialListingsWanted({ date: "2026-10-14" })).toBe(true);
        expect(officialListingsWanted({ date: "2026-10-14", region: "chungcheong", time: "morning", price: "sort_low" })).toBe(true);
        expect(officialListingsWanted({ startDate: "2026-10-13", endDate: "2026-10-19", viewType: "BOOKING" })).toBe(true);
        expect(officialListingsWanted({ startDate: "2026-10-13", endDate: "2026-10-19", viewType: "JOIN" })).toBe(false);
        expect(officialListingsWanted({ date: "2026-10-14", special: "no_caddie" })).toBe(false);
        expect(officialListingsWanted({ date: "2026-10-14", special: "" })).toBe(true);
        for (const k of ["hotDeal", "urgent", "upcoming", "q", "mine", "applied", "joinType", "courseId"]) expect(officialListingsWanted({ date: "2026-10-14", [k]: "1" }), k).toBe(false);
    });
    it("필터 — 부킹 목록과 같은 문법: 시간대(11시 · 15시 경계) · 가격 구간 · 지역 코드. 정렬 칩은 거르지 않는다", () => {
        const o = { regionCode: "chungcheong", hour: 6, price: 80000 };
        expect(officialMatches({}, o)).toBe(true);
        expect(officialMatches({ time: "morning" }, o)).toBe(true);
        expect(officialMatches({ time: "afternoon,night" }, o)).toBe(false);
        expect(officialMatches({ time: "afternoon" }, { ...o, hour: 11 })).toBe(true);
        expect(officialMatches({ time: "night" }, { ...o, hour: 15 })).toBe(true);
        expect(officialMatches({ time: "all" }, o)).toBe(true);
        expect(officialMatches({ price: "under_10" }, o)).toBe(true);
        expect(officialMatches({ price: "range_10_15,over_20" }, o)).toBe(false);
        expect(officialMatches({ price: "sort_low" }, o)).toBe(true);
        // 요금을 모르는 줄은 가격으로 거를 때 뺀다(0원으로 '10만원 이하'에 끼지 않게)
        expect(officialMatches({ price: "under_10" }, { ...o, price: null })).toBe(false);
        // 지역 — 모르는 칩(장난 값)은 조건을 걸지 않는다
        expect(officialMatches({ region: "nowhere" }, o)).toBe(true);
    });
    it("문구 — '홈페이지 예약 티'라고 밝히고, 우리가 받는 예약이 아니라고 적는다", () => {
        expect(OFFICIAL_LISTING_COPY.notice).toBe("이 부킹은 골프장 홈페이지 예약 티예요.");
        expect(OFFICIAL_LISTING_COPY.how).toContain("랭큐가 받는 예약이 아니에요");
        expect(Object.values(OFFICIAL_LISTING_COPY).join(" ")).not.toMatch(/바로 예약|예약 완료|내기|술/);
    });
});

describe("부킹 목록에 싣는 자리", () => {
    it("서버 — golf_bookings 에는 넣지 않고 응답에만 붙인다 · 신청 수 · 날씨를 붙이는 길을 타지 않는다 · 못 읽어도 부킹 목록은 나간다 · 날짜 띠의 건수도 같이 센다", () => {
        const route = read("server/routes/modules/golf.ts");
        expect(route).toContain("const listed = await withTeeWeather(await withJoinCounts(bookings as any[], req.userId));");
        expect(route).toContain("return sendSuccess(res, official.length ? [...listed, ...official] : listed);");
        const fn = route.slice(route.indexOf("async function officialFor("), route.indexOf('router.get("/bookings/counts"'));
        expect(fn).toContain("} catch (e) {");
        expect(fn).toContain("return [];");
        expect(route).toContain("for (const [d, n] of extra) merged.set(d, (merged.get(d) ?? 0) + n);");
        const svc = read("server/services/golfOfficialListings.ts").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(svc).not.toMatch(/insert into|golfBookings|golf_bookings/);
    });
    it("화면 — 회원이 올린 부킹 아래에 따로, 늘 골프장별로 묶어서 · 누르면 안내와 골프장 홈페이지 링크 · 신청 · 삭제 단추는 없다", () => {
        const page = read("client/src/golf/pages/BookingList.tsx");
        expect(page).toContain("return { listed: all.filter((x) => !isOfficialListing(x)), officialTees: all.filter(isOfficialListing) as OfficialListing[] };");
        expect(page).toContain("groupingOn ? groupByCourse(listed as any[], groupSortOf(selectedFilters.price)) : null");
        expect(page).toContain("{listed.map(renderCard)}");
        expect(page).not.toContain("{filteredTimes.map(renderCard)}");
        const card = read("client/src/golf/components/booking/OfficialTees.tsx");
        expect(card).toContain("{COPY.notice}");
        expect(card).toContain('<a href={o.page} target="_blank" rel="noopener noreferrer nofollow" data-track-as="golf-official-tee-go" data-testid="official-tee-go"');
        expect(card).toContain("확인 {kstClock(o.checkedAt)}");
        expect(card.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/onApply|onDelete|onShare|apiRequest|useMutation/);
        for (const m of card.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);
        expect(card.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/font-(bold|extrabold|black)/);
    });
});

// 2026-10-13 오너: 골프장 허브의 "부킹 0"을 보고 "요기 부킹 누락이야 확인해줘"
describe("골프장 허브 — 부킹 건수 · 글 목록에도 홈페이지 예약 티", () => {
    const routes = read("server/routes/modules/golfCourses.ts");
    it("회원이 올린 글과 따로 두고(official), 허브의 건수 · 글 목록 · 지역 칩 · 관심 골프장만 합쳐 본다", () => {
        expect(routes).toContain("official: (PublicListing & { slug: string })[];");
        expect(routes).toContain("function withOfficial(s: Summary): (PublicListing & { slug: string })[] {");
        expect(routes.match(/bySlugOf\(withOfficial\(s\)\)/g)?.length).toBe(3);
        expect(routes).toContain("const out = withOfficial(s).filter((l) => {");
        // 못 읽어도 요약은 나간다
        expect(routes).toContain('} catch (e) { console.error("[GolfOfficialTees]", (e as Error)?.message); }');
    });
    it("섞지 않는 곳 — 골프장 상세의 티타임 구역(신청 단추가 달린다) · 검색용 화면 · 사이트맵은 회원이 올린 글만", () => {
        expect(routes).toContain("const listings = s.listings.filter((l) => l.slug === slug);");
        for (const f of ["server/prerender.ts", "server/sitemap.ts"]) expect(read(f)).not.toMatch(/withOfficial|\.official\b/);
    });
    it("화면 — 줄에는 '홈페이지 예약', 누르면 글 하나가 아니라 그 날의 부킹 목록으로", () => {
        expect(read("client/src/golf/components/course/list/HubListingRow.tsx")).toContain('l.sellerType === "OFFICIAL" ? "홈페이지 예약"');
        expect(read("client/src/golf/pages/GolfCourseHub.tsx")).toContain("? `/golf/booking-list?date=${kstDateKey(l.datetime)}&view=BOOKING`");
    });
});

