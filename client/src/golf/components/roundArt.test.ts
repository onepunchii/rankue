import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 라운드 화면의 그림(2026-10-13 오너: "스코어카드는 스코어카드 느낌 나고, 라운드 만들기에도 골프장 느낌이 … 라운드 완료 시에도").
 * 화면은 갈무리로 확인했다(360 · 412 폭). 여기는 그림이 제자리에 있고 가벼운지, 세 화면이 그것을 쓰는지만 묶는다.
 */
const root = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const art = read("client/src/golf/components/RoundArt.tsx");

describe("라운드 화면의 그림", () => {
    it("세 장이 우리 폴더에 있고 가볍다(한 장 40KB 아래)", () => {
        for (const name of ["new", "card", "done"]) {
            expect(art, name).toContain(`/${name}.webp`);
            const file = resolve(root, `client/public/golf/round-art/${name}.webp`);
            expect(existsSync(file), name).toBe(true);
            expect(statSync(file).size, name).toBeLessThan(40_000);
        }
    });
    it("그림은 꾸밈이다 — alt 는 비우고, 자리 크기(width · height)를 적는다. 바깥 서버를 부르지 않는다", () => {
        const imgs = art.match(/<img[^>]*>/g) ?? [];
        expect(imgs).toHaveLength(3);
        for (const tag of imgs) {
            expect(tag).toContain('alt=""');
            expect(tag).toMatch(/width=\{\d+\} height=\{\d+\}/);
        }
        expect(art).not.toMatch(/https?:\/\//);
    });
    it("세 화면이 쓴다 — 라운드 만들기 · 기록표 · 라운드 완료", () => {
        expect(read("client/src/golf/pages/NewGame.tsx")).toContain("<NewRoundBanner");
        expect(read("client/src/golf/pages/GamePage.tsx")).toContain("<ScorecardBand");
        expect(read("client/src/golf/pages/GameResult.tsx")).toContain("<ResultHeroArt />");
    });
    it("완료 화면 — 밝은 하늘 위의 글은 어두운 알약 안에 둔다", () => {
        const page = read("client/src/golf/pages/GameResult.tsx");
        const at = page.indexOf("<ResultHeroArt />");
        expect(page.slice(at, at + 400)).toContain("bg-[#050505B3]");
    });
});
