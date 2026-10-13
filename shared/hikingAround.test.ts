import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    FROM_ME_MAX_KM, HIKING_NEARBY_HOLD_MS, HIKING_NEARBY_KINDS, HIKING_NEARBY_RADIUS_KM, MOUNTAIN_AROUND_LABEL, MOUNTAIN_SECTIONS, NEARBY_DIAL_MIN, SECTION_NAV_MIN,
    cleanMountainName, courseTrailhead, fromMeText, hikingNaverMapUrl, hikingNearbyNames, hikingNearbyQuery, hikingNearbyWord, hikingPlaceUrl, isHikingNearbyKind,
    nearbyDialItems, shortestCourse, trailheadName, type NearbySummary,
} from "./hikingAround";
import { naverMapSearchUrl, nearbyWordQuery } from "./golfAround";
import type { LinePoint } from "./hikingGeo";
import { courseShape } from "./hikingPage";
import { HIKING_PHOTOS_ANCHOR } from "./hikingPhotos";

// 산 화면에 골프장 상세의 기능을 옮긴 것(2026-10-13) — 구역 줄 · 한눈 숫자 · 내 위치에서 · 들머리 · 가까운 산의 판 · 근처 맛집(네이버).
const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** 주석을 뺀 코드 — 설명 글의 낱말이 고정 시험에 걸리지 않게 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("근처 맛집 · 카페 — 검색어", () => {
    it("칩은 맛집 · 카페 둘뿐이다(재지 않은 낱말은 싣지 않는다) — 술을 권하는 낱말이 없다", () => {
        expect(HIKING_NEARBY_KINDS.map((k) => [k.key, k.word])).toEqual([["food", "맛집"], ["cafe", "카페"]]);
        expect(isHikingNearbyKind("food")).toBe(true);
        expect(isHikingNearbyKind("cafe")).toBe(true);
        for (const v of ["stay", "haejang", "", null, undefined, 3, "맛집", "food "]) expect(isHikingNearbyKind(v), String(v)).toBe(false);
        expect(JSON.stringify([HIKING_NEARBY_KINDS, MOUNTAIN_AROUND_LABEL, MOUNTAIN_SECTIONS])).not.toMatch(/술|주점|포차|맥주|소주|막걸리|와인|내기|베팅|도박|상금|빨리|기록 단축|야간/);
    });
    it("검색어는 산 이름 + 근처 + 낱말", () => {
        expect(hikingNearbyQuery("설악산", "food")).toBe("설악산 근처 맛집");
        expect(hikingNearbyQuery("설악산", "cafe")).toBe("설악산 근처 카페");
        expect(hikingNearbyWord("cafe")).toBe("카페");
    });
    it("서버가 실제로 말을 잇는 함수(골프의 nearbyWordQuery — naverLocal 이 쓴다)와 같은 말이 나온다", () => {
        expect(read("server/services/naverLocal.ts")).toContain("const query = nearbyWordQuery(n.name, word);");
        for (const k of HIKING_NEARBY_KINDS) expect(nearbyWordQuery("북한산", hikingNearbyWord(k.key))).toBe(hikingNearbyQuery("북한산", k.key));
    });
    it("검색에 쓸 이름 — 산 이름, 그다음 산 이름 + 시군구", () => {
        expect(hikingNearbyNames({ name: "설악산", slug: "설악산", sigungu: "양양군" })).toEqual([{ name: "설악산" }, { name: "설악산 양양군" }]);
        // 시군구가 두 마디면 앞의 것만("창원시 마산합포구" → 창원시)
        expect(hikingNearbyNames({ name: "무학산", slug: "무학산", sigungu: "창원시 마산합포구" })).toEqual([{ name: "무학산" }, { name: "무학산 창원시" }]);
        // 시군구를 모르면 이름 하나
        expect(hikingNearbyNames({ name: "백운산", sigungu: null })).toEqual([{ name: "백운산" }]);
        expect(hikingNearbyNames({ name: "백운산" })).toEqual([{ name: "백운산" }]);
    });
    it("같은 이름 가운데 뒤의 산(주소에 시군이 붙은 산)은 시군구를 붙인 말부터 묻는다", () => {
        expect(hikingNearbyNames({ name: "지리산", slug: "지리산-통영", sigungu: "통영시" })).toEqual([{ name: "지리산 통영시" }, { name: "지리산" }]);
        expect(hikingNearbyNames({ name: "백운산", slug: "백운산-포천-이동면", sigungu: "포천시" })[0]).toEqual({ name: "백운산 포천시" });
        // 이름 그대로를 주소로 가진 산은 이름부터
        expect(hikingNearbyNames({ name: "지리산", slug: "지리산", sigungu: "함양군" })[0]).toEqual({ name: "지리산" });
        // 시군구를 모르면 이름뿐
        expect(hikingNearbyNames({ name: "지리산", slug: "지리산-2", sigungu: null })).toEqual([{ name: "지리산" }]);
    });
    it("이름의 괄호 · 쉼표는 뗀다 — 그대로는 지도에서도 안 잡힌다", () => {
        expect(cleanMountainName("팔공산(비로봉)")).toBe("팔공산");
        expect(cleanMountainName("가야산 (상왕봉")).toBe("가야산");
        expect(cleanMountainName("  덕유산  ")).toBe("덕유산");
        expect(hikingNearbyNames({ name: "팔공산(비로봉)", slug: "팔공산비로봉", sigungu: "군위군" })).toEqual([{ name: "팔공산" }, { name: "팔공산 군위군" }]);
    });
    it("네이버에 가는 말 전부 — 산 한 곳에 많아야 네 가지(이름 둘 × 칩 둘)", () => {
        const names = hikingNearbyNames({ name: "설악산", slug: "설악산", sigungu: "양양군" });
        expect(HIKING_NEARBY_KINDS.flatMap((k) => names.map((n) => nearbyWordQuery(n.name, k.word)))).toEqual(["설악산 근처 맛집", "설악산 양양군 근처 맛집", "설악산 근처 카페", "설악산 양양군 근처 카페"]);
    });
    it("가게 줄 · '더 보기'의 주소는 골프의 줄과 같은 식이다(이름 + 주소 앞 세 마디)", () => {
        expect(hikingNaverMapUrl("설악산 근처 맛집")).toBe(naverMapSearchUrl("설악산 근처 맛집"));
        const p = { name: "오색식당", category: "한식>산채", address: "강원특별자치도 양양군 서면 오색리 123" };
        expect(hikingPlaceUrl(p)).toBe(naverMapSearchUrl("오색식당 강원특별자치도 양양군 서면"));
        expect(hikingPlaceUrl({ name: "카페 산", category: "", address: "" })).toBe(naverMapSearchUrl("카페 산"));
    });
    it("반경 · 들고 있는 시간", () => {
        // 골프장(15km)보다 넉넉하다 — 큰 산은 정상에서 들머리 마을까지가 멀다. 재지 않은 값이라는 것은 머리말에 적혀 있다
        expect(HIKING_NEARBY_RADIUS_KM).toBe(30);
        expect(HIKING_NEARBY_HOLD_MS).toBe(60_000);
        expect(read("shared/hikingAround.ts")).toContain("검색어의 품질은 아직 재지 않았다");
    });
});

describe("네이버에 실제로 가는 말 — 서비스를 가짜 응답으로 돌려 본다(밖으로 나가는 요청은 없다)", () => {
    // 설악산(대청봉) — 이름 그대로를 주소로 가진 산
    const seorak = { name: "설악산", slug: "설악산", sigungu: "양양군", lat: 38.1191, lng: 128.4654 };
    const target = (m: typeof seorak) => ({ names: hikingNearbyNames(m), at: { lat: m.lat, lng: m.lng, radiusKm: HIKING_NEARBY_RADIUS_KM } });
    /** 네이버의 한 줄 — 좌표는 1e7 을 곱한 정수 글자 */
    const row = (title: string, lat: number, lng: number) => ({ title: `<b>${title}</b>`, category: "한식", roadAddress: "강원특별자치도 양양군 서면", mapx: String(Math.round(lng * 1e7)), mapy: String(Math.round(lat * 1e7)) });
    const near = [row("가", 38.08, 128.45), row("나", 38.17, 128.55), row("다", 38.20, 128.59)];
    const far = [row("라", 37.55, 126.99), row("마", 37.56, 126.98), row("바", 38.10, 128.46)];
    let asked: string[] = [];
    const serve = (answers: Record<string, unknown[] | number>) => vi.stubGlobal("fetch", async (u: string | URL) => {
        const q = new URL(String(u)).searchParams.get("query") ?? "";
        asked.push(q);
        const a = answers[q] ?? [];
        return typeof a === "number" ? new Response("{}", { status: a }) : new Response(JSON.stringify({ items: a }), { status: 200 });
    });
    const search = async (m: typeof seorak, kind: "food" | "cafe") => (await import("../server/services/naverLocal")).searchNearbyWord(target(m), hikingNearbyWord(kind));
    beforeEach(() => { asked = []; vi.stubEnv("NAVER_HUB_CLIENT_ID", "test-id"); vi.stubEnv("NAVER_HUB_CLIENT_SECRET", "test-secret"); });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    it("산 이름으로 물어 가까운 답이 오면 한 번에 끝난다 — 받은 순서 그대로", async () => {
        serve({ "설악산 근처 맛집": near });
        const r = await search(seorak, "food");
        expect(asked).toEqual(["설악산 근처 맛집"]);
        expect(r).toEqual({ ok: true, query: "설악산 근처 맛집", items: ["가", "나", "다"].map((name) => ({ name, category: "한식", address: "강원특별자치도 양양군 서면" })) });
    });
    it("다른 고장의 답이면(가까운 곳이 둘이 안 된다) 통째로 버리고 시군구를 붙여 다시 묻는다", async () => {
        serve({ "설악산 근처 카페": far, "설악산 양양군 근처 카페": near });
        const r = await search(seorak, "cafe");
        expect(asked).toEqual(["설악산 근처 카페", "설악산 양양군 근처 카페"]);
        expect(r.ok && r.query).toBe("설악산 양양군 근처 카페");
        expect(r.ok && r.items.map((p) => p.name)).toEqual(["가", "나", "다"]);
    });
    it("같은 이름 가운데 뒤의 산은 시군구를 붙인 말부터 묻는다", async () => {
        const tongyeong = { name: "지리산", slug: "지리산-통영", sigungu: "통영시", lat: 34.84, lng: 128.21 };
        serve({ "지리산 통영시 근처 맛집": [row("사", 34.85, 128.42), row("아", 34.84, 128.43)] });
        const r = await search(tongyeong, "food");
        expect(asked).toEqual(["지리산 통영시 근처 맛집"]);
        expect(r.ok && r.items).toHaveLength(2);
    });
    it("끝내 못 찾으면 빈 목록 — 화면은 '네이버 지도에서 찾아보기' 줄만 남긴다. 한도가 찼으면 그대로 알린다", async () => {
        serve({ "설악산 근처 맛집": far });
        expect(await search(seorak, "food")).toEqual({ ok: true, query: "설악산 근처 맛집", items: [] });
        expect(asked).toEqual(["설악산 근처 맛집", "설악산 양양군 근처 맛집"]);
        asked = [];
        serve({ "설악산 근처 맛집": 429 });
        expect(await search(seorak, "food")).toEqual({ ok: false, reason: "quota" });
        expect(asked).toEqual(["설악산 근처 맛집"]);
    });
    it("열쇠가 없으면 부르지 않는다", async () => {
        vi.stubEnv("NAVER_HUB_CLIENT_ID", "");
        serve({});
        expect(await search(seorak, "food")).toEqual({ ok: false, reason: "nokey" });
        expect(asked).toEqual([]);
    });
});

describe("고정: 근처 맛집은 저장 · 가공 없이 그대로", () => {
    const route = code(read("server/routes/modules/hiking.ts"));
    const a = route.indexOf('router.get("/mountains/:slug/nearby"');
    /** 그 길 하나(여는 줄부터 닫는 줄까지) */
    const fn = route.slice(a, route.indexOf("\n}));", a) + 5);
    it("길이 있고, 응답은 no-store 다 — 찾기 전에 먼저 건다(오류 답도 캐시에 남지 않게)", () => {
        expect(a).toBeGreaterThan(-1);
        expect(fn).toContain('res.set("Cache-Control", "no-store");');
        expect(fn.indexOf("no-store")).toBeLessThan(fn.indexOf("searchNearbyWord("));
        expect(fn.indexOf("no-store")).toBeLessThan(fn.indexOf("nearbyAllow("));
        expect(fn).not.toContain("PUBLIC_CACHE");
    });
    it("검색어는 서버가 만든다 — 요청에서 읽는 것은 산의 주소와 칩의 종류뿐이다", () => {
        expect(fn.match(/req\.(?:query|body|params|headers)(?:\.\w+)?/g)).toEqual(["req.params.slug", "req.query.kind", "req.query.kind"]);
        expect(fn).toContain('const kind = isHikingNearbyKind(req.query.kind) ? req.query.kind : "food";');
        expect(fn).toContain("names: hikingNearbyNames(m)");
        expect(fn).toContain("await searchNearbyWord(target, hikingNearbyWord(kind))");
    });
    it("받은 답을 그대로 돌려준다 — 거르지도 다시 줄 세우지도 않고, 어디에도 적지 않는다", () => {
        expect(fn).toContain("return sendSuccess(res, { query: r.query, items: r.items });");
        expect(fn).not.toMatch(/\.(sort|filter|slice|reverse|map)\(/);
        expect(fn).not.toMatch(/sql`|insert|upsert|addPhoto|writeFile|storage\./i);
        // 정상의 자리는 다른 고장의 같은 이름 산이 낸 답을 통째로 버리는 데만 쓴다(naverLocal 의 규칙)
        expect(fn).toContain("radiusKm: HIKING_NEARBY_RADIUS_KM");
    });
    it("한 사람이 하루 한도를 태우지 못하게 막고, 한도 · 열쇠 없음 · 실패를 골프와 같은 답으로 알린다", () => {
        expect(fn).toContain('if (!nearbyAllow(String(req.ip ?? ""))) return sendError(res, 429, "잠시 뒤에 다시 시도해 주세요");');
        expect(fn).toContain('r.reason === "nokey" ? 501 : r.reason === "quota" ? 429 : 502');
        expect(route).toContain("return ++h.n <= 30;");
        // 골프의 길과 같은 막이 · 같은 답
        const golf = code(read("server/routes/modules/golfCourses.ts"));
        expect(golf).toContain("return ++h.n <= 30;");
        expect(golf).toContain('r.reason === "nokey" ? 501 : r.reason === "quota" ? 429 : 502');
    });
    it("검색엔진용 화면에는 싣지 않는다", () => {
        expect(read("server/seo/hiking.ts")).not.toMatch(/hikingAround|naverLocal|searchNearby|\/nearby|네이버|맛집/);
    });
    it("화면 — 구역 이름만 발자국에 남기고, 기기에 남는 조회 캐시에 넣지 않는다", () => {
        const ui = read("client/src/hiking/components/MountainNearbyPlaces.tsx");
        expect(ui).toContain('data-track-as="hiking-nearby-places"');
        // 결과 줄과 '더 보기'가 그 구역 안에 있다
        const zone = ui.slice(ui.indexOf('data-track-as="hiking-nearby-places"'));
        expect(zone).toContain("href={hikingPlaceUrl(p)}");
        expect(zone).toContain("href={hikingNaverMapUrl(query)}");
        // 앱의 조회 캐시는 기기에 일주일 남는다 — 그래서 조회 훅을 쓰지 않는다
        expect(read("client/src/lib/queryClient.ts")).toContain("persistQueryClient(");
        expect(code(ui)).not.toMatch(/useQuery|queryKey|localStorage|sessionStorage/);
        expect(code(read("client/src/hiking/lib/api.ts"))).not.toMatch(/nearbyKey/i);
        expect(code(ui)).toContain("fetchMountainNearby(slug, kind)");
        // 순서 · 줄 수를 건드리지 않는다. 네이버 표시가 붙는다
        expect(code(ui)).not.toMatch(/items\.(sort|filter|slice|reverse)\(/);
        expect(ui).toContain("aside={MOUNTAIN_AROUND_LABEL.naver}");
        expect(MOUNTAIN_AROUND_LABEL.naver).toBe("네이버 검색 결과");
        // 구역이 화면에 들어온 뒤에만 부른다
        expect(code(ui)).toContain("if (!seen) return;");
    });
});

describe("들머리 — 고른 코스의 선에서", () => {
    const up: LinePoint[] = [[38.10, 128.40, 300, 0], [38.11, 128.42, 900, 3], [38.12, 128.46, 1700, 6.8]];
    it("코스 선의 첫 점이 들머리다", () => {
        expect(courseTrailhead({ line: up, km: 6.8, summitKm: 6.8, loop: false })).toEqual({ lat: 38.10, lng: 128.40, fromEnd: false });
        // 원점 회귀 · 정상을 지나는 길 · 정상이 없는 길도 첫 점
        expect(courseTrailhead({ line: up, km: 6.8, summitKm: 0.2, loop: true })?.fromEnd).toBe(false);
        expect(courseTrailhead({ line: up, km: 6.8, summitKm: 3.4, loop: false })?.fromEnd).toBe(false);
        expect(courseTrailhead({ line: up, km: 6.8, summitKm: null })).toEqual({ lat: 38.10, lng: 128.40, fromEnd: false });
    });
    it("정상에서 시작해 내려오는 기록이면 아래쪽 끝이 들머리다 — 정상으로 길찾기를 걸지 않는다", () => {
        const down = [...up].reverse().map((p, i) => [p[0], p[1], p[2], [0, 3.8, 6.8][i]] as const);
        const c = { line: down, km: 6.8, summitKm: 0, loop: false };
        expect(courseShape(c)).toBe("정상에서 내려오는 길");
        expect(courseTrailhead(c)).toEqual({ lat: 38.10, lng: 128.40, fromEnd: true });
        // 금은 courseShape 와 같다(앞 15%)
        expect(courseTrailhead({ ...c, summitKm: 1.0 })?.fromEnd).toBe(true);
        expect(courseTrailhead({ ...c, summitKm: 1.1 })?.fromEnd).toBe(false);
    });
    it("선이 없으면 들머리도 없다", () => {
        expect(courseTrailhead(null)).toBeNull();
        expect(courseTrailhead(undefined)).toBeNull();
        expect(courseTrailhead({ line: [], km: 0, summitKm: null })).toBeNull();
        expect(trailheadName("설악산")).toBe("설악산 들머리");
    });
    it("화면 — 고른 코스의 들머리로 카카오맵 · 길찾기를 열고, 코스가 없으면 산 이름으로 찾는다고 말한다", () => {
        const ui = read("client/src/hiking/components/MountainLocation.tsx");
        expect(ui).toContain('import { kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";');
        expect(ui).toContain("href={kakaoMapUrl(name, head.lat, head.lng)}");
        expect(ui).toContain("href={kakaoRouteUrl(name, head.lat, head.lng)}");
        expect(ui).toContain("href={kakaoMapUrl(d.name)}");
        expect(MOUNTAIN_AROUND_LABEL.noCourse).toBe("코스가 없어 산 이름으로 찾아요.");
        expect([MOUNTAIN_AROUND_LABEL.trailMap, MOUNTAIN_AROUND_LABEL.trailRoute]).toEqual(["들머리 지도 보기", "들머리까지 길찾기"]);
        // 코스 자료가 2022년 것이라는 줄 — 코스 구역과 같은 글을 쓴다
        expect(ui).toContain("<p>{COURSE_SOURCE_NOTE}</p>");
        // 고른 코스는 산 화면이 들고 있다가 넘겨 준다
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain("<Courses key={`courses:${d.slug}`} d={d} canStart={my.mine} i={ci} onPick={pickCourse} />");
        expect(page).toContain("<MountainLocation key={`location:${d.slug}`} d={d} course={course} fromMe={fromMe} ask={loc.ask} asking={loc.asking} />");
    });
});

describe("내 위치에서 — 기기에서만 센다", () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    it("방향과 직선 거리", () => {
        expect(fromMeText(seoul, { lat: 37.6587, lng: 126.9779 })).toBe("내 위치에서 북쪽 10km");
        expect(fromMeText(seoul, { lat: 37.4452, lng: 126.9638 })).toBe("내 위치에서 남쪽 14km");
        expect(fromMeText(seoul, { lat: 33.3617, lng: 126.5292 })).toMatch(/^내 위치에서 남쪽 4\d\dkm$/);
        // 가까우면 소수 한 자리 · 100m 단위
        expect(fromMeText(seoul, { lat: 37.5849, lng: 126.9577 })).toBe("내 위치에서 북서쪽 2.7km");
        // 바로 그 자리에서는 방향을 적지 않는다
        expect(fromMeText(seoul, { lat: 37.5666, lng: 126.978 })).toBe("내 위치에서 100m");
    });
    it("자리를 모르거나 나라 밖이면 적지 않는다", () => {
        expect(fromMeText(null, { lat: 37.6, lng: 127 })).toBeNull();
        expect(fromMeText(seoul, { lat: null, lng: 127 })).toBeNull();
        expect(fromMeText({ lat: NaN, lng: 127 }, { lat: 37.6, lng: 127 })).toBeNull();
        // 도쿄에서 연 화면
        expect(fromMeText({ lat: 35.68, lng: 139.76 }, { lat: 37.6587, lng: 126.9779 })).toBeNull();
        expect(FROM_ME_MAX_KM).toBe(700);
    });
    it("고정: 내 위치는 서버로 가지 않고, 기기에도 적어 두지 않는다", () => {
        const hook = code(read("client/src/hiking/lib/useMyLocation.ts"));
        expect(hook).not.toMatch(/apiRequest|fetch\(|localStorage|sessionStorage|setItem|cookie/);
        // 들어오자마자 묻지 않는다 — 묻지 않고 받아 보고, 누른 뒤에만 묻는다
        expect(hook).toContain("getDevicePosition({ prompt: false, ...READ })");
        expect(hook.indexOf("getDevicePosition({ prompt: true, ...READ })")).toBeGreaterThan(hook.indexOf("const ask = useCallback("));
        const page = code(read("client/src/hiking/pages/MountainPage.tsx"));
        expect(page).not.toMatch(/apiRequest|fetch\(|localStorage|sessionStorage/);
        expect(page).toContain("const fromMe = fromMeText(loc.here, d);");
        // 내 자리는 조회 열쇠(서버로 가는 주소)에 섞이지 않는다
        expect(page).not.toMatch(/queryKey:[^\n]*loc\./);
        // 위치 구역은 센 글자만 받는다
        expect(code(read("client/src/hiking/components/MountainLocation.tsx"))).not.toMatch(/getDevicePosition|useMyLocation|apiRequest|fetch\(/);
        expect(MOUNTAIN_AROUND_LABEL.onDevice).toBe("직선 거리예요. 내 위치는 이 기기에서만 써요.");
    });
});

describe("가까운 산의 판 — 이 산이 가운데", () => {
    const near = (over: Partial<NearbySummary>): NearbySummary => ({ slug: "a", name: "가", lat: 38, lng: 128, heightM: 900, tier: 2, lists: [], courses: 1, region: "gangwon", km: 5, ...over });
    it("방향은 이 산의 정상에서 본 것, 거리는 받은 값 그대로", () => {
        const items = nearbyDialItems({ lat: 38, lng: 128 }, [
            near({ slug: "north", lat: 38.05, lng: 128, km: 5.6 }),
            near({ slug: "east", lat: 38, lng: 128.1, km: 8.8, tier: 1, lists: ["kfs100"] }),
            near({ slug: "nowhere", lat: null }),
        ]);
        expect(items.map((m) => m.slug)).toEqual(["north", "east"]);
        expect(items[0].bearing).toBeCloseTo(0, 1);
        expect(items[1].bearing).toBeCloseTo(90, 0);
        expect(items.map((m) => m.km)).toEqual([5.6, 8.8]);
        expect(items[0]).toMatchObject({ famous: false, kfs: false, region: "gangwon", courses: 1, heightM: 900 });
        expect(items[1]).toMatchObject({ famous: true, kfs: true });
    });
    it("이 산의 자리를 모르면 판을 그리지 않는다 · 한 곳뿐이어도 그리지 않는다", () => {
        expect(nearbyDialItems({ lat: null, lng: 128 }, [near({})])).toEqual([]);
        expect(NEARBY_DIAL_MIN).toBe(2);
    });
    it("화면 — 홈의 판을 그대로 쓴다(가운데의 말과 읽어 주는 말만 바꾼다)", () => {
        const dial = read("client/src/hiking/components/NearMe.tsx");
        expect(dial).toContain("export function NearDial({ items, done, centre, label, featured }: {");
        // 홈은 가운데의 말 없이 쓰고(가운데가 '나'), 카드로 소개하는 두 산만 따로 알려 준다
        expect(dial).toContain("<NearDial items={onMap} done={isDone} featured={featured} />");
        expect(dial).toContain('data-testid="hk-near-dial"');
        expect(dial).toContain("aria-label={label ?? `내 근처의 산 ${items.length}곳`}");
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain("centre={MOUNTAIN_AROUND_LABEL.dialCentre} label={`${d.name}에서 가까운 산 ${dial.length}곳`}");
        expect(page).toContain("{dial.length >= NEARBY_DIAL_MIN && (");
        expect(MOUNTAIN_AROUND_LABEL.dialCentre).toBe("이 산");
    });
});

describe("한눈 숫자 · 구역 줄 · 공유 · 검색", () => {
    it("가장 짧은 코스 — 거리가 같으면 앞의 것, 코스가 없으면 없다", () => {
        expect(shortestCourse([{ km: 7.1 }, { km: 3.2 }, { km: 11.4 }])).toEqual({ course: { km: 3.2 }, index: 1 });
        expect(shortestCourse([{ km: 3.2, id: "a" }, { km: 3.2, id: "b" }])?.course).toEqual({ km: 3.2, id: "a" });
        expect(shortestCourse([])).toBeNull();
        expect(MOUNTAIN_AROUND_LABEL.coursesSoon).toBe("코스 준비 중");
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        // 높이는 띠에 있으므로 칩에는 다시 적지 않는다
        expect(page).toContain("{[mountainPlace(d), ...lists].filter(Boolean).map((t) => <Fact key={`fact:${t}`}>{t}</Fact>)}");
        expect(page).toContain('stats.push({ key: "height", label: "높이", value: h,');
        expect(page).toContain("value: MOUNTAIN_AROUND_LABEL.coursesSoon");
    });
    it("구역의 순서와 이름 — 셋보다 적으면 줄을 그리지 않는다", () => {
        expect(MOUNTAIN_SECTIONS.map((s) => `${s.id}:${s.label}`)).toEqual(["courses:코스", "photos:사진", "weather:날씨", "about:이야기", "map:위치", "food:맛집", "nearby:주변"]);
        expect(SECTION_NAV_MIN).toBe(3);
        expect(read("client/src/hiking/components/HkSectionNav.tsx")).toContain("const on = shown.length >= SECTION_NAV_MIN;");
    });
    it("구역마다 이름표(sec)가 붙어 있다 — 줄이 건너가고, 붙박이 줄 밑에 멈춘다", () => {
        const shell = read("client/src/hiking/components/HikingShell.tsx");
        expect(shell).toContain("<section id={id ?? (sec ? `sec-${sec}` : undefined)} data-sec={sec}");
        expect(shell).toContain("style={sec ? { scrollMarginTop: HK_SCROLL_MARGIN } : undefined}");
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        for (const id of ["courses", "photos", "weather", "about", "map", "nearby"]) expect(page, id).toContain(` sec="${id}">`);
        expect(read("client/src/hiking/components/MountainNearbyPlaces.tsx")).toContain(' sec="food">');
        // '사진'은 이 산의 사진으로, 없으면 내 산행 사진으로 — 알림이 쓰는 #sec-photos 는 그대로다
        expect(page).toContain('{ ...s, els: ["sec-mountain-photos", HIKING_PHOTOS_ANCHOR] }');
        expect(read("client/src/hiking/photos/MountainPhotos.tsx")).toContain('id="sec-mountain-photos"');
        expect(page).toContain('id={HIKING_PHOTOS_ANCHOR} sec="photos">');
        expect(HIKING_PHOTOS_ANCHOR).toBe("sec-photos");
    });
    it("공유 단추 — 기기의 공유 창, 없으면 주소 복사. 발자국에는 이름만", () => {
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain('data-track-as="hiking-mountain-share"');
        expect(page).toContain("if (navigator.share) { await navigator.share({ title: `${d.name} | 랭큐 등산`, url }); return; }");
        expect(page).toContain('try { await navigator.clipboard.writeText(url); toast({ title: "주소를 복사했어요" }); }');
        expect(page).toContain("right={shareBtn}>");
    });
    it("구조화 자료(Mountain)와 미리보기 그림(권역 카드) — 새 그림 길을 만들지 않는다", () => {
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain('"@context": "https://schema.org", "@type": "Mountain", name: d.name,');
        expect(page).toContain('geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng,');
        expect(page).toContain("elevation: `${d.heightM} m`");
        expect(page).toContain('containedInPlace: { "@type": "AdministrativeArea", name: where }');
        expect(page).toContain("image: r ? hubCard(ORIGIN, hikingRegionPath(r.id))?.url : undefined, jsonLd };");
        expect(page).not.toMatch(/\/og\/hiking|og\/mountain/);
    });
    it("새 화면 조각도 등산의 색 · 글자 규칙을 지킨다 — 골프 · 당구의 그림을 가져다 쓰지 않는다", () => {
        for (const f of ["client/src/hiking/components/HkSectionNav.tsx", "client/src/hiking/components/MountainLocation.tsx", "client/src/hiking/components/MountainNearbyPlaces.tsx"]) {
            const src = read(f);
            expect(src, f).not.toMatch(/golfStamp|InkStamp|볼마커|MarkerArt|sim\/|TierEmblem|HereMap"|CourseDotMap|CourseLogo/);
            expect(code(src), f).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black)\b/);
            expect([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((x) => Number(x[1]) >= 12), f).toBe(true);
            expect(code(src), f).not.toMatch(/font-(?:bold|extrabold|black)\b/);
            // 화면의 글은 한국어 리터럴이다(번역 열쇠를 쓰지 않는다)
            expect(code(src), f).not.toMatch(/\bt\(["'`]/);
        }
    });
});
