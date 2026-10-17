import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUTLINE_TO_STORE_REGION, packStoreDots, storeRegionCounts, unpackStoreDots } from "./storeDots";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("전국 당구장 지도 — 점 묶기", () => {
    it("묶고 풀면 같은 자리(소수 셋째 자리) · 좌표 없는 곳과 한반도 밖은 뺀다", () => {
        const w = packStoreDots([
            { lat: 37.56654, lng: 126.97796, region: "서울" },
            { lat: 35.17982, lng: 129.07501, region: "부산" },
            { lat: null, lng: 127, region: "경기" },
            { lat: 0, lng: 0, region: "경기" },
            { lat: 37.4, lng: 127.1, region: "서울" },
        ]);
        expect(w.total).toBe(3);
        expect(w.regions).toEqual(["서울", "부산"]);
        const dots = unpackStoreDots(JSON.parse(JSON.stringify(w)));
        expect(dots[0]).toEqual({ lat: 37.567, lng: 126.978, region: "서울" });
        expect(dots[1]).toEqual({ lat: 35.18, lng: 129.075, region: "부산" });
        expect(storeRegionCounts(dots)).toEqual([{ region: "서울", count: 2 }, { region: "부산", count: 1 }]);
    });

    it("모양이 틀린 답은 빈 목록(지도를 그리지 않는다)", () => {
        expect(unpackStoreDots(null)).toEqual([]);
        expect(unpackStoreDots({ regions: ["서울"], pts: [1, 2] })).toEqual([]);
        expect(unpackStoreDots({ regions: [], pts: [1, 2, 0] })).toEqual([]);
    });

    it("윤곽선 17개 id 가 디렉터리의 지역 이름 17개에 하나씩 이어진다", () => {
        const ids = [...read("client/src/golf/data/koreaMapData.ts").matchAll(/"([A-Za-z][A-Za-z ]+)":"m/g)].map((m) => m[1]);
        expect(ids.length).toBe(17);
        for (const id of ids) expect(OUTLINE_TO_STORE_REGION[id], id).toBeTruthy();
        expect(new Set(Object.values(OUTLINE_TO_STORE_REGION)).size).toBe(17);
    });

    it("길: /listings/dots 는 /:code 보다 먼저(뒤면 'dots' 가 매장 코드로 빠진다) · 서버는 ./x.js 로 부른다", () => {
        const src = read("server/routes/modules/listings.ts");
        expect(src.indexOf('router.get("/dots"')).toBeGreaterThan(0);
        expect(src.indexOf('router.get("/dots"')).toBeLessThan(src.indexOf('router.get("/:code"'));
        expect(src).toContain('from "../../../shared/storeDots.js"');
    });

    it("화면: 홈 둘러보기는 가로 당구대 · 매장 찾기는 세로 당구대 + 지역별 · 홈의 매장 수는 지도와 같은 값", () => {
        expect(read("client/src/components/hiq/dashboard/QuickActions.tsx")).toContain("<StoreTableBanner onOpen={() => setLocation(\"/stores\")}");
        const stores = read("client/src/pages/stores.tsx");
        expect(stores).toContain("<StoreTableMap region={region} onPick={(r) => setRegion(r)}");
        for (const k of ["mapAll", "mapIn", "mapLegend", "mapHint", "mapByRegion", "mapOthers"]) expect(stores.match(new RegExp(`\\n    ${k}: `, "g"))!.length, k).toBe(5);
        const dash = read("client/src/pages/hiq/dashboard.tsx");
        expect(dash).toContain("const storeN = useStoreDots().dots.length;");
        expect(dash).not.toContain("1,197");
    });

    it("다섯 언어에 홈 지도 글이 있다", () => {
        for (const lc of ["ko", "en", "es", "vi", "tr"]) {
            const s = read(`client/src/lib/i18n/${lc}.ts`);
            for (const k of ["storeMap.title", "storeMap.count", "storeMap.sub", "storeMap.cta"]) expect(s, `${lc} ${k}`).toContain(`"${k}": "`);
        }
    });
});
