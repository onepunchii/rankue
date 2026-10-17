import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUTLINE_TO_STORE_REGION, nearDistText, nearViewKm, packStoreDots, spreadBalls, storeRegionCounts, unpackStoreDots } from "./storeDots";

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

describe("매장 상세 '이 근처' 당구대", () => {
    it("판의 크기 — 다섯째 곳까지 · 1.2 ~ 150km(제주 · 강원 고성처럼 다섯째가 100km 넘게 먼 곳)", () => {
        expect(nearViewKm([{ distanceKm: 0 }, { distanceKm: 0.3 }])).toBe(1.2);
        expect(nearViewKm([{ distanceKm: 1.2 }])).toBeCloseTo(1.416, 3);
        expect(nearViewKm([{ distanceKm: 118 }])).toBeCloseTo(139.24, 2);
        expect(nearViewKm([{ distanceKm: 400 }])).toBe(150);
    });
    it("겹친 번호 공은 비킨다 — 이 매장(가운데)과 같은 건물의 두 곳도 서로 · 가운데와 겹치지 않게", () => {
        const r = 1;
        const out = spreadBalls([[0, 0], [0, 0], [10, 10]], r, { x: 0, y: 0, r: 1.15 });
        expect(out[2]).toEqual([10, 10]);
        const all = [{ x: 0, y: 0, r: 1.15 }, ...out.map(([x, y]) => ({ x, y, r }))];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y)).toBeGreaterThanOrEqual((all[i].r + all[j].r) * 0.98);
    });
    it("판 끝에 몰린 공도 판 안에서 서로 비킨다(제주 — 북쪽 끝에 3 · 4 · 5)", () => {
        const box = { hw: 18, hh: 8 };
        const out = spreadBalls([[0, -12], [0.2, -12], [0.4, -12.1]], 1, { x: 0, y: 0, r: 1.15 }, box);
        for (const [x, y] of out) { expect(Math.abs(x)).toBeLessThanOrEqual(box.hw); expect(Math.abs(y)).toBeLessThanOrEqual(box.hh); }
        for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1])).toBeGreaterThanOrEqual(1.96);
    });
    it("거리 글 — 50m 안 · 1km 아래는 100m 단위 · 10km 넘으면 정수", () => {
        expect(nearDistText(0, "50m 안")).toBe("50m 안");
        expect(nearDistText(0.4, "")).toBe("400m");
        expect(nearDistText(0.96, "")).toBe("1.0km");
        expect(nearDistText(1.2, "")).toBe("1.2km");
        expect(nearDistText(32.4, "")).toBe("32km");
    });
    it("상세 화면에 붙어 있다 · 거리순 목록은 좌표를 같이 준다", () => {
        expect(read("client/src/pages/store-listing.tsx")).toContain("<StoreNearTable");
        expect(read("server/routes/modules/listings.ts")).toContain("...(nearby ? { lat: storeListings.latitude, lng: storeListings.longitude } : {}),");
    });
});

describe("없는 주소 · 큐 케이스 명판(2026-10-17 리뷰)", () => {
    it("404 는 개발 틀의 영어 문구가 아니라 다섯 언어 안내 + 홈 / 뒤로", () => {
        const nf = read("client/src/pages/not-found.tsx");
        expect(nf).not.toContain("Did you forget to add the page to the router?");
        expect(nf).toContain('t("notFound.title")');
        for (const lc of ["ko", "en", "es", "vi", "tr"]) {
            const s = read(`client/src/lib/i18n/${lc}.ts`);
            for (const k of ["notFound.title", "notFound.desc", "notFound.home", "notFound.back"]) expect(s, `${lc} ${k}`).toContain(`"${k}": "`);
        }
        expect(read("client/src/pages/hiq/cue-case.tsx")).toContain('!d.member.mine && name.trim() ? t("case.ownerTitle")');
    });
});
