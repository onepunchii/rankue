import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { LOCAL_DISHES, findLocalDish, localDishLabel, localDishLine, localDishes } from "./golfLocalDish";
import { GOLF_REGIONS } from "./golfCourse";
import { nearbyWordQuery } from "./golfAround";

// 이 동네 대표 메뉴 — 우리가 쓴 사전. 꼴과, 서버가 사전 밖의 낱말을 검색어로 받지 않는지를 붙든다.
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 2020년 이후 이모지(Emoji 13+) */
const tooNew = (cp: number) => [[0x1f6d6, 0x1f6d7], [0x1f6dc, 0x1f6df], [0x1f6fb, 0x1f6fc], [0x1f7f0, 0x1f7f0], [0x1f90c, 0x1f90c], [0x1f972, 0x1f972],
    [0x1f977, 0x1f979], [0x1f9cb, 0x1f9cc], [0x1fa74, 0x1fa77], [0x1fa7b, 0x1fa7c], [0x1fa83, 0x1fa8f], [0x1fa96, 0x1faff]].some(([a, b]) => cp >= a && cp <= b);

describe("사전", () => {
    const entries = Object.entries(LOCAL_DISHES);
    it("열쇠는 '지역|시군' — 지역은 여섯 가운데 하나, 시군은 시·군으로 끝난다", () => {
        expect(entries.length).toBeGreaterThanOrEqual(40);
        for (const [k] of entries) {
            const [region, city, more] = k.split("|");
            expect(more, k).toBeUndefined();
            expect(GOLF_REGIONS as readonly string[], k).toContain(region);
            expect(city, k).toMatch(/^[가-힣]+(시|군)$/);
        }
    });
    it("메뉴는 한글 낱말 하나(띄어쓰기 없음) · 그림 하나 · 한 시군에 셋까지, 겹치지 않게", () => {
        for (const [k, ds] of entries) {
            expect(ds.length, k).toBeGreaterThanOrEqual(1);
            expect(ds.length, k).toBeLessThanOrEqual(3);
            expect(new Set(ds.map((x) => x.word)).size, k).toBe(ds.length);
            for (const x of ds) {
                expect(x.word, k).toMatch(/^[가-힣]{1,6}$/);
                expect(x.emoji, `${k} ${x.word}`).not.toBe("");
                for (const ch of x.emoji) { const cp = ch.codePointAt(0)!; if (cp !== 0xfe0f) expect(tooNew(cp), `${x.word} ${cp.toString(16)}`).toBe(false); }
            }
        }
    });
    it("재 보고 뺀 것은 없다 — 이름은 났어도 골프장 근처에서 안 잡힌 메뉴", () => {
        const has = (k: string, w: string) => (LOCAL_DISHES[k] ?? []).some((x) => x.word === w);
        for (const [k, w] of [["강원|춘천시", "막국수"], ["전라|전주시", "비빔밥"], ["경상|남해군", "멸치쌈밥"], ["강원|삼척시", "곰치국"], ["제주|제주시", "흑돼지"], ["전라|담양군", "떡갈비"]]) expect(has(k, w), `${k} ${w}`).toBe(false);
        expect(has("강원|춘천시", "닭갈비")).toBe(true);
        expect(has("제주|서귀포시", "흑돼지")).toBe(true);
    });
});

describe("찾기", () => {
    it("그 시군의 메뉴만 — 지역이 다르면 같은 이름의 군도 다르다(고성군)", () => {
        expect(localDishes("강원", "춘천시").map((x) => x.word)).toEqual(["닭갈비"]);
        expect(localDishes("강원", "고성군").map((x) => x.word)).toEqual(["물회"]);
        expect(localDishes("경상", "고성군")).toEqual([]);
        for (const [r, c] of [["강원", null], [null, "춘천시"], ["강원", "없는시"], ["", ""], ["__proto__", "x"], ["강원", "toString"]] as [any, any][]) expect(localDishes(r, c)).toEqual([]);
    });
    it("손님이 보낸 낱말은 사전에 있을 때만 받는다 — 다른 시군의 메뉴·아무 말·글자가 아닌 것은 버린다", () => {
        expect(findLocalDish("강원", "춘천시", "닭갈비")).toEqual({ word: "닭갈비", emoji: "🍗" });
        expect(findLocalDish("강원", "춘천시", "닭갈비".normalize("NFD"))?.word).toBe("닭갈비"); // 풀어쓴 한글도
        for (const w of ["흑돼지", "맛집", "닭갈비 ", "", null, undefined, 1, ["닭갈비"], { word: "닭갈비" }, "강남 룸살롱"]) expect(findLocalDish("강원", "춘천시", w), String(w)).toBeNull();
        expect(findLocalDish("경기", "성남시", "닭갈비")).toBeNull(); // 사전에 없는 시군
    });
    it("이름표와 한 줄 — 화면의 칩 줄과 검색엔진용 화면이 같은 글", () => {
        expect(localDishLabel("춘천시")).toBe("춘천 대표 메뉴");
        expect(localDishLabel("평창군")).toBe("평창 대표 메뉴");
        expect(localDishLine(localDishes("제주", "서귀포시"))).toBe("🐖 흑돼지 · 🐟 갈치 · 🍜 고기국수");
        expect(nearbyWordQuery("라비에벨CC", "닭갈비")).toBe("라비에벨CC 근처 닭갈비");
    });
});

describe("길 — 서버는 사전에서 꺼낸 낱말만 검색어로 쓴다", () => {
    const routes = read("server/routes/modules/golfCourses.ts");
    const route = routes.slice(routes.indexOf('router.get("/:slug/nearby"'), routes.indexOf("// ── 날씨(2026-10-05)"));
    it("라우트 — findLocalDish 로 거른 뒤에만 searchNearbyWord", () => {
        expect(route).toContain("findLocalDish(page.region, page.city, req.query.dish)");
        expect(route).toContain("dish ? await searchNearbyWord(target, dish.word) : await searchNearby(target, kind)");
        expect(route).not.toMatch(/searchNearbyWord\([^)]*req\.query/);
        expect(route).toContain('res.set("Cache-Control", "no-store")');
    });
    it("검색엔진용 화면 — 사전(우리 글)은 싣고, 네이버 결과는 싣지 않는다", () => {
        const pre = read("server/prerender.ts");
        expect(pre).toContain("localDishLine(dishes)");
        expect(pre).not.toMatch(/naverLocal|golfAround|searchNearby/);
    });
    it("화면 — 대표 메뉴는 ?dish= 로 부르고, 접시는 그 메뉴의 그림", () => {
        expect(read("client/src/golf/lib/courseApi.ts")).toContain("dish=${encodeURIComponent(dish)}");
        const ui = read("client/src/golf/components/course/detail/NearbyPlaces.tsx");
        expect(ui).toContain("useCourseNearby(slug, kind, seen, dish?.word)");
        expect(ui).toContain("localDishLabel(city)");
    });
});
