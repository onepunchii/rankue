import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { TIERS } from "../../../../shared/sim/rank";
import { RANK_TROPHY_SRC, TIER_GLOW, rankMedalSrc, tierEmblemSrc } from "./TierEmblem";

/**
 * 등급 배지·메달 그림(2026-10-12 오너: "티어 배지를 만들어 달라는 얘기가 많은데" · "게임 느낌도 나고 진짜 소유욕이 들게끔").
 * 그림 파일과 코드가 어긋나면 화면에 깨진 그림이 뜬다 — 등급을 더하거나 이름을 바꾸면 여기서 걸린다.
 */
const PUBLIC = resolve(__dirname, "../../../public");
const file = (src: string) => resolve(PUBLIC, `.${src}`);
/** webp(RIFF … WEBP) 인가 */
const isWebp = (p: string) => { const b = readFileSync(p); return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"; };

describe("등급 배지 그림", () => {
    it("일곱 등급 모두 그림과 빛깔이 있다 — 등급 표(shared/sim/rank)와 같은 순서", () => {
        expect(TIERS.map((t) => t.id)).toEqual(["iron", "bronze", "silver", "gold", "platinum", "diamond", "master"]);
        for (const t of TIERS) {
            const src = tierEmblemSrc(t.id);
            expect(src).toBe(`/sim/rank/tier-${t.id}.webp`);
            expect(existsSync(file(src)), src).toBe(true);
            expect(isWebp(file(src)), src).toBe(true);
            expect(TIER_GLOW[t.id]).toMatch(/^#[0-9A-F]{6}$/);
        }
        expect(Object.keys(TIER_GLOW).sort()).toEqual(TIERS.map((t) => t.id).sort());
    });

    it("메달 셋 · 트로피 · 머리 배경 · 대시보드 그림(홈 배너) · 멀티방 그림이 있다", () => {
        for (const src of [rankMedalSrc(1), rankMedalSrc(2), rankMedalSrc(3), RANK_TROPHY_SRC, "/sim/rank/hall.webp", "/sim/rank/icon-stats.webp", "/sim/rank/rooms.webp"]) {
            expect(existsSync(file(src)), src).toBe(true);
            expect(isWebp(file(src)), src).toBe(true);
        }
        // 머리 배경은 스타일이 부른다
        expect(readFileSync(resolve(__dirname, "../../index.css"), "utf8")).toContain('url("/sim/rank/hall.webp")');
    });

    it("가볍다 — 한 장 60KB, 모두 합쳐 400KB 를 넘지 않는다(랭킹을 열 때 한꺼번에 받는다)", () => {
        const all = [...TIERS.map((t) => tierEmblemSrc(t.id)), rankMedalSrc(1), rankMedalSrc(2), rankMedalSrc(3), RANK_TROPHY_SRC, "/sim/rank/hall.webp", "/sim/rank/icon-stats.webp", "/sim/rank/rooms.webp"];
        let total = 0;
        for (const src of all) { const n = statSync(file(src)).size; total += n; expect(n, src).toBeLessThan(60 * 1024); }
        expect(total).toBeLessThan(400 * 1024);
    });

    it("숫자·글자는 그림에 넣지 않는다 — 메달의 등수는 화면이 얹는다", () => {
        const src = readFileSync(resolve(__dirname, "TierEmblem.tsx"), "utf8");
        expect(src).toContain("{rank}");
        expect(src).toContain('top: "63%"');
    });
});
