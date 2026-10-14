import { describe, it, expect } from "vitest";
import { FISH_INFO, cleanFishInfo, fishInfoOf, hasFishInfo } from "./fishingFishInfo";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISH } from "./fishingFish";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("어종 정보의 틀", () => {
    it("실린 정보는 우리 어종의 것만이고, 틀을 지킨다(지어 쓴 것이 없는지는 사람이 본다 — 여기서는 꼴만)", () => {
        const ids = new Set(FISH.map((f) => f.id));
        for (const [id, info] of Object.entries(FISH_INFO)) {
            expect(ids.has(id), id).toBe(true);
            expect(cleanFishInfo(info), id).toEqual(info);
            // 금어기 · 금지체장은 출처가 있어야만 실린다
            if (info.ban) expect(info.ban.source, id).toBeTruthy();
        }
        expect(fishInfoOf("없는어종")).toBeNull();
    });
    it("받은 덩이를 거른다 — 달은 1~12, 글은 다듬고, 모르는 칸은 버린다", () => {
        expect(cleanFishInfo({ aka: " 감시 , 구로다이 ", intro: "  갯바위의  제왕 ", season: [10, 11, 12, 13, 0, 10, "3"], methods: ["찌낚시", "", "원투"], bait: "크릴·홍갯지렁이", price: "비쌈" }))
            .toEqual({ aka: ["감시", "구로다이"], intro: "갯바위의 제왕", season: [3, 10, 11, 12], methods: ["찌낚시", "원투"], bait: ["크릴", "홍갯지렁이"] });
        expect(cleanFishInfo(null)).toEqual({});
        expect(cleanFishInfo({ season: ["봄"] })).toEqual({});
    });
    it("금어기 · 금지체장은 출처가 없으면 통째로 버린다", () => {
        expect(cleanFishInfo({ ban: { period: "5.1 ~ 5.31", minCm: 25 } })).toEqual({});
        expect(cleanFishInfo({ ban: { period: "5.1 ~ 5.31", minCm: "25", source: "수산자원관리법 시행령(2026-01-01 기준)" } }))
            .toEqual({ ban: { period: "5.1 ~ 5.31", minCm: 25, source: "수산자원관리법 시행령(2026-01-01 기준)" } });
        expect(cleanFishInfo({ ban: { source: "어딘가", minCm: -3 } })).toEqual({});
    });
    it("채워진 칸이 있는가 — 출처만 있는 것은 빈 것이다", () => {
        expect([hasFishInfo(null), hasFishInfo({}), hasFishInfo({ sources: ["x"] }), hasFishInfo({ season: [5] })]).toEqual([false, false, false, true]);
    });
    it("받는 형식 문서가 지금 있는 어종을 빠짐없이 적는다(어종을 넣으면 표에도 한 줄)", () => {
        const doc = read("docs/01-plan/features/fishing-fish-info-format.md");
        for (const f of FISH) expect(doc, f.name).toContain(`| ${f.id} | ${f.name} |`);
    });
    it("어종 한 장은 받은 자료만 그리고, 기관의 값에는 누구의 값인지 적는다", () => {
        const sheet = read("client/src/fishing/FishSheet.tsx");
        expect(sheet).toContain("fishInfoOf(fish.id)");
        expect(sheet).toContain("hasFishInfo(info)");
        expect(sheet).toContain("랭큐가 매긴 값이 아니에요");
        expect(sheet).toContain("{MARKET_NOTE} 출처: {MARKET_SOURCE}.");
        expect(sheet).toContain("출처: {info.ban.source}");
        // 어종의 사실을 화면 코드에 적지 않는다 — 제철 · 미끼 같은 글은 FISH_INFO 에서만 온다
        expect(sheet).not.toMatch(/크릴|지렁이|찌낚시|루어낚시|원투낚시/);
    });
});
