import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    FESTIVALS_PATH, festivalsSportPath, festivalSportPath, festivalCardInput, addDays, cleanTourText, festivalBadge, festivalFromTour, festivalPath, festivalPeriod, festivalPhone, festivalRegion, festivalSeo, festivalState, kstToday,
    liveFestivals, overlaps, thisWeekend, tourHomepage, weekdayKo, FISHING_FESTIVAL_WORDS, HIKING_FESTIVAL_WORDS, type FestivalRow,
} from "./festivals";
import { sportForPath } from "./sportRoute";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const row = (o: Partial<FestivalRow>): FestivalRow => ({ id: "1", title: "축제", start: "20261024", end: "20261025", addr: null, region: "강원", lat: 37.7, lng: 128.9, cat: null, image: null, lic: null, mod: null, ...o });

/** 전국 축제(2026-10-21, 오너 "전국 축제 … 공개 페이지 + 종목별") — 한국관광공사 축제를 표로 옮겨 지도 · 달력 · 축제 한 곳 */
describe("전국 축제 — 규칙", () => {
    it("시도: 긴 이름 · 줄임 이름 · 전남광주 통합 · 법정동 코드", () => {
        expect(festivalRegion("강원특별자치도 강릉시 창해로 20")).toBe("강원");
        expect(festivalRegion("부산 해운대구 우동")).toBe("부산");
        expect(festivalRegion("충북 단양군 단양읍")).toBe("충북");
        expect(festivalRegion("전남광주통합특별시 광산구 송정동")).toBe("광주");
        expect(festivalRegion("전남광주통합특별시 순천시 조례동")).toBe("전남");
        expect(festivalRegion("포항시 북구", "47")).toBe("경북");
        expect(festivalRegion("", null)).toBeNull();
    });
    it("기간은 요일까지 · 같은 달이면 끝 날만 · 해가 바뀌면 해를 적는다", () => {
        expect(weekdayKo("20261024")).toBe("토");
        expect(festivalPeriod({ start: "20261024", end: "20261025" })).toBe("10월 24일(토) ~ 25일(일)");
        expect(festivalPeriod({ start: "20261030", end: "20261102" })).toBe("10월 30일(금) ~ 11월 2일(월)");
        expect(festivalPeriod({ start: "20261024", end: "20261024" }, true)).toBe("2026년 10월 24일(토)");
        expect(festivalPeriod({ start: "20261226", end: "20270103" }, true)).toBe("2026년 12월 26일(토) ~ 2027년 1월 3일(일)");
    });
    it("상태 · 알약", () => {
        const f = { start: "20261024", end: "20261026" };
        expect(festivalState(f, "20261021")).toEqual({ state: "soon", days: 3 });
        expect(festivalBadge(f, "20261021")).toBe("D-3");
        expect(festivalBadge(f, "20261023")).toBe("내일 시작");
        expect(festivalBadge(f, "20261024")).toBe("2일 남음");
        expect(festivalBadge(f, "20261025")).toBe("내일까지");
        expect(festivalBadge(f, "20261026")).toBe("오늘까지");
        expect(festivalBadge(f, "20261027")).toBe("끝남");
    });
    it("이번 주말 · 겹침 · 날 더하기 · 한국 시각 오늘", () => {
        expect(thisWeekend("20261021")).toEqual({ sat: "20261024", sun: "20261025" });   // 수요일
        expect(thisWeekend("20261024")).toEqual({ sat: "20261024", sun: "20261025" });   // 토요일
        expect(thisWeekend("20261025")).toEqual({ sat: "20261025", sun: "20261025" });   // 일요일은 오늘만
        expect(overlaps({ start: "20261020", end: "20261024" }, "20261024", "20261025")).toBe(true);
        expect(overlaps({ start: "20261026", end: "20261030" }, "20261024", "20261025")).toBe(false);
        expect(addDays("20261231", 1)).toBe("20270101");
        expect(kstToday(Date.UTC(2026, 9, 20, 15, 30))).toBe("20261021");             // UTC 15:30 = 한국 다음 날 0:30
    });
    it("지금 · 곧 열리는 것 — 열린 것 먼저, 끝난 것 · 먼 것은 뺀다", () => {
        const list = [row({ id: "a", start: "20261101", end: "20261102" }), row({ id: "b", start: "20261018", end: "20261022" }), row({ id: "c", start: "20261001", end: "20261010" }), row({ id: "d", start: "20270301", end: "20270302" })];
        expect(liveFestivals(list, "20261021", 45).map((f) => f.id)).toEqual(["b", "a"]);
    });
    it("받은 한 줄: 축제(EV01)만 · 60일 넘는 것 · 좌표 밖 · 번호 없는 것은 뺀다 · 사진은 1 · 3유형만 https 로", () => {
        const base = { contentid: "825295", title: " 강릉커피축제 ", eventstartdate: "20261021", eventenddate: "20261025", lclsSystm2: "EV01", lclsSystm3: "EV010200", mapx: "128.94", mapy: "37.77", addr1: "강원특별자치도 강릉시 창해로14번길 20-1", firstimage: "http://tong.visitkorea.or.kr/a.jpg", cpyrhtDivCd: "Type3", modifiedtime: "20261019100926", tel: "033-647-6802", lDongRegnCd: "51" };
        const f = festivalFromTour(base)!;
        expect(f).toMatchObject({ id: "825295", title: "강릉커피축제", region: "강원", cat: "EV010200", image: "https://tong.visitkorea.or.kr/a.jpg", lic: "Type3", mod: "20261019", tel: "033-647-6802" });
        expect(festivalFromTour({ ...base, lclsSystm2: "EV02" })).toBeNull();
        expect(festivalFromTour({ ...base, eventenddate: "20270101" })).toBeNull();
        expect(festivalFromTour({ ...base, mapy: "0" })).toBeNull();
        expect(festivalFromTour({ ...base, contentid: "" })).toBeNull();
        expect(festivalFromTour({ ...base, cpyrhtDivCd: "" })!.image).toBeNull();
    });
    it("문의 번호: 지역번호 · 대표번호만, 휴대전화는 싣지 않는다", () => {
        expect(festivalPhone("033-647-6802")).toBe("033-647-6802");
        expect(festivalPhone("1688-3005")).toBe("1688-3005");
        expect(festivalPhone("02-123-4567 / 02-765-4321")).toBe("02-123-4567");
        expect(festivalPhone("010-1234-5678")).toBeNull();
        expect(festivalPhone("")).toBeNull();
    });
    it("홈페이지 · 소개 글 다듬기", () => {
        expect(tourHomepage('<a href="http://www.narafestival.com" target="_blank">www.narafestival.com</a>')).toBe("http://www.narafestival.com/");
        expect(tourHomepage("www.narafestival.com")).toBe("https://www.narafestival.com/");
        expect(tourHomepage("javascript:alert(1)")).toBeNull();
        expect(cleanTourText("첫 줄<br>둘째 &amp; 셋째<br /><br><br>넷째")).toBe("첫 줄\n둘째 & 셋째\n\n넷째");
        expect(cleanTourText("   ")).toBeNull();
        expect(cleanTourText("가".repeat(50), 10)).toBe(`${"가".repeat(9)}…`);
    });
    it("종목에 맞는 축제 — 낱말을 좁게(대게 · 방어 · 주꾸미는 먹거리라 낚시가 아니다)", () => {
        expect(HIKING_FESTIVAL_WORDS.test("영주 소백산 철쭉제")).toBe(true);
        expect(HIKING_FESTIVAL_WORDS.test("광주서창억새축제")).toBe(true);
        expect(HIKING_FESTIVAL_WORDS.test("대구앞산축제")).toBe(true);
        expect(HIKING_FESTIVAL_WORDS.test("강릉커피축제")).toBe(false);
        expect(FISHING_FESTIVAL_WORDS.test("얼음나라화천 산천어축제")).toBe(true);
        expect(FISHING_FESTIVAL_WORDS.test("평창송어축제")).toBe(true);
        expect(FISHING_FESTIVAL_WORDS.test("울진대게와 붉은대게 축제")).toBe(false);
        expect(FISHING_FESTIVAL_WORDS.test("서천 동백꽃 주꾸미 축제")).toBe(false);
    });
    it("검색 제목 — 없는 것은 적지 않는다", () => {
        const f = row({ id: "507599", title: "얼음나라화천 산천어축제", start: "20270109", end: "20270131", addr: "강원특별자치도 화천군 화천읍", region: "강원" });
        const s = festivalSeo(f, { mountains: 2, golf: 0, fishing: 1 });
        expect(s.path).toBe("/festivals/507599");
        expect(s.title).toContain("얼음나라화천 산천어축제 2027");
        expect(s.desc).toContain("산 2곳 · 낚시터 1곳");
        expect(s.desc).not.toContain("골프장");
        expect(festivalSeo(f, { mountains: 0, golf: 0, fishing: 0 }).desc).not.toContain("가는 길");
    });
});

describe("종목마다의 축제 화면(2026-10-21 오너: 낚시에서 누르면 등산으로 가잖아 — 골프 · 등산 · 낚시 각각)", () => {
    it("주소: /golf · /hiking · /fishing 아래 — 주소가 종목의 색 · 하단 탭을 정한다, 정본은 /festivals", () => {
        expect(festivalsSportPath("GOLF")).toBe("/golf/festivals");
        expect(festivalSportPath("FISHING", "507599")).toBe("/fishing/festivals/507599");
        expect(sportForPath("/golf/festivals")).toBe("GOLF");
        expect(sportForPath("/fishing/festivals/507599")).toBe("FISHING");
        expect(sportForPath("/hiking/festivals")).toBe("HIKING");
        const app = read("client/src/App.tsx");
        for (const sp of ["golf", "hiking", "fishing"]) for (const p of [`/${sp}/festivals`, `/${sp}/festivals/:id`]) expect(app).toContain(`<Route path="${p}"`);
        // 정본 — 종목 화면도 useSeo 의 path 는 /festivals(검색용 화면 하나만 색인)
        expect(read("client/src/festivals/pages/FestivalsHub.tsx")).toContain("useSeo(data ? { title: seo.title, description: seo.desc, path: seo.path } : null);");
        expect(festivalSeo(row({ id: "9" }), { mountains: 0, golf: 0, fishing: 0 }).path).toBe("/festivals/9");
    });
    it("종목마다 색 · 표지 · 지도 밑의 점 · 가는 길의 순서가 다르다", async () => {
        const th = read("client/src/festivals/theme.tsx");
        for (const hero of ["/festivals/art/hero.webp", "/festivals/art/hero-golf.webp", "/festivals/art/hero-fishing.webp"]) expect(th).toContain(hero);
        expect(th).toContain('aroundOrder: ["golf", "mountain", "fishing"]');
        expect(th).toContain('aroundOrder: ["fishing", "mountain", "golf"]');
        expect(th).toContain('picksTitle: "라운드 길에 들를 축제"');
        // 축제 줄이 틀을 끌고 오지 않게 — 틀은 FestShell 에만
        expect(th).not.toContain("HikingShell");
        expect(th).not.toContain("CourseShell");
        expect(read("client/src/festivals/FestShell.tsx")).toContain("CourseShell");
        // 종목의 자리(지도 밑) · 골프 축제 줄
        const r = read("server/routes/modules/festivals.ts");
        expect(r.indexOf('router.get("/layer"')).toBeGreaterThan(0);
        expect(r.indexOf('router.get("/layer"')).toBeLessThan(r.indexOf('router.get("/:id"'));
        expect(r).toContain('if (sport === "GOLF") {');
        expect(read("client/src/golf/pages/Dashboard.tsx")).toContain('<FestivalPicks sport="GOLF" golfHome />');
    });
});

describe("축제 카드(미리보기 1200 정사각)", () => {
    it("글 — 기간은 해까지 · 알약은 열림 · D-day · 끝났으면 없음", () => {
        const f = row({ id: "1", title: "강릉커피축제", start: "20261021", end: "20261025", region: "강원", addr: "강원특별자치도 강릉시 창해로" });
        expect(festivalCardInput(f, "20261022")).toMatchObject({ title: "강릉커피축제", period: "2026년 10월 21일(수) ~ 25일(일)", place: "강원 · 강릉시 창해로", tag: "지금 열려요", live: true });
        expect(festivalCardInput(f, "20261025").tag).toBe("오늘까지");
        expect(festivalCardInput(f, "20261018")).toMatchObject({ tag: "D-3", live: false });
        expect(festivalCardInput(f, "20261101").tag).toBeNull();
    });
    it("관광공사 사진은 카드에 얹지 않는다(제3유형) · 우리 그림만 · 검색용 화면과 화면이 같은 주소", () => {
        const c = read("server/services/festivalCard.ts");
        expect(c).toContain("server/assets/festivals/cover.png");
        expect(c).not.toMatch(/f\.image|\.image\b.*src/);
        expect(read("server/ogImage.ts")).toContain('app.get("/og/festival/:id.png"');
        expect(read("server/seo/festivals.ts")).toContain("url: festivalCardUrl(ORIGIN, f.id), width: 1200, height: 1200");
        expect(read("client/src/festivals/pages/FestivalPage.tsx")).toContain("image: festivalCardUrl(ORIGIN, f.id)");
    });
});

describe("전국 축제 — 이어 붙인 곳", () => {
    it("주소 · 색: /festivals 는 등산의 색 · 앱 라우트 · 메뉴", () => {
        expect(FESTIVALS_PATH).toBe("/festivals");
        expect(festivalPath("825295")).toBe("/festivals/825295");
        expect(sportForPath("/festivals")).toBe("HIKING");
        expect(sportForPath("/festivals/825295")).toBe("HIKING");
        const app = read("client/src/App.tsx");
        for (const p of ["/festivals", "/festivals/:id"]) expect(app).toContain(`<Route path="${p}"`);
        for (const sp of ["golf", "hiking", "fishing"]) expect(read("client/src/pages/hiq/menu.tsx")).toContain(`setLocation("/${sp}/festivals")`);
    });
    it("서버: 공개 라우터 · 검색용 화면 · 봇 경로 · 사이트맵 · 매일 받기", () => {
        expect(read("server/routes/index.ts")).toContain('router.use("/festivals", festivalsRouter);');
        expect(read("server/prerender.ts")).toContain("app.get(FESTIVALS_RE,");
        expect(read("vercel.json")).toContain('"src": "/(festivals(?:/[0-9]+)?|about|');
        expect(read("server/sitemap.ts")).toContain('SITEMAP_SECTIONS = ["core", "festivals", ');
        expect(read("server/routes/modules/cron.ts")).toContain("await festivalsQuietly()");
        expect(read("migrations/tour_festivals.sql")).toContain("CREATE TABLE IF NOT EXISTS tour_festivals");
        // 산 페이지의 '이 근처 축제'도 표를 먼저 읽는다(볼 때마다 부르지 않는다)
        expect(read("server/services/tourFestivals.ts")).toContain("const stored = await allFestivals();");
    });
    it("사진은 자르지 않는다(제3유형) · 사진 위에 얹지 않는다 · 출처를 적는다", () => {
        for (const p of ["client/src/festivals/components/FestivalBits.tsx", "client/src/festivals/pages/FestivalPage.tsx", "client/src/festivals/components/FestivalPicks.tsx"]) {
            const c = read(p);
            expect(c, p).not.toContain("object-cover");
        }
        expect(read("client/src/festivals/components/FestivalBits.tsx")).toContain("w-auto max-w-none");
        expect(read("client/src/festivals/pages/FestivalPage.tsx")).toContain("festivalPhotoCredit(f.lic)");
        // 허브 표지만 object-cover — 우리가 만든 그림이다
        expect(read("client/src/festivals/pages/FestivalsHub.tsx").match(/object-cover/g)?.length).toBe(1);
        expect(read("client/src/festivals/pages/FestivalsHub.tsx")).toContain("src={t.hero}");
    });
    it("골프장 · 낚시터 페이지에도 이 근처 축제(종목별) — 서버가 산 페이지와 같은 셈으로 싣고, 화면은 우리 축제 페이지로 잇는다", () => {
        expect(read("server/routes/modules/golfCourses.ts")).toContain("festivals: p.lat != null && p.lng != null ? nearbyFestivals(await tourFestivals()");
        expect(read("server/routes/modules/fishing.ts")).toContain("nearbyFestivals(await tourFestivals().catch(() => []), place.lat, place.lng, kstYmd())");
        expect(read("client/src/golf/pages/GolfCoursePage.tsx")).toContain('<NearbyFestivalList items={d.festivals!} tone={GOLF_FESTIVAL_TONE} sport="GOLF" />');
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain('<NearbyFestivalList items={data!.festivals!} tone={FISHING_FESTIVAL_TONE} sport="FISHING" />');
        expect(read("client/src/festivals/components/NearbyFestivalList.tsx")).toContain("href={festivalSportPath(sport, f.id)}");
        // 골프는 차로 간다 — 50km(오너: 동강시스타에서 본 메밀 축제, 봉평 효석문화제가 46km)
        expect(read("server/routes/modules/golfCourses.ts")).toContain("kstYmd(), 50, 45, 4)");
    });
    it("산 페이지의 근처 축제는 우리 축제 페이지로 잇는다", () => {
        const c = read("client/src/hiking/pages/MountainPage.tsx");
        expect(c).toContain('href={festivalSportPath("HIKING", f.id)}');
        expect(c).not.toContain("search.naver.com/search.naver?query=${encodeURIComponent(f.title)}");
    });
});
