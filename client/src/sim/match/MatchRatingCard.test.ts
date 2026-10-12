/**
 * 끝난 대전 화면의 레이팅 칸(2026-10-12 — 순서의 2번 "승급하는 순간").
 * DOM 없이 글자로 그려서 본다(renderToStaticMarkup). "@" 별칭은 vi.mock 으로 — MatchLobby.test 와 같은 방식.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ko } from "../../lib/i18n/ko";
import type { RatingChange } from "@shared/sim/rating";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => ko[k] ?? k, locale: "ko" }) }));
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

async function html(rating: RatingChange): Promise<string> {
    const React = await import("react");
    // 이 시험 환경의 JSX 는 전역 React 를 찾는다(다른 화면 시험도 같은 방식으로 넣는다)
    const g = globalThis as unknown as { React?: unknown };
    if (!g.React) g.React = React;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MatchRatingCard } = await import("./MatchRatingCard");
    return renderToStaticMarkup(React.createElement(MatchRatingCard, { rating }));
}
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("MatchRatingCard", () => {
    it("등급이 오르면 새 배지를 크게 — 어디서 올라왔는지 · 레이팅 · 변화", async () => {
        const h = await html({ delta: 12, before: 1140, after: 1152, matches: 40, tierBefore: "silver", tierAfter: "gold", promoted: true });
        expect(h).toContain('data-testid="match-promo"');
        expect(h).toContain("/sim/rank/tier-gold.webp");
        expect(h).toContain('width="128"');
        expect(h).toContain("hall-rays");
        const t = text(h);
        expect(t).toContain(ko["sim.rank.promoted"]);
        expect(t).toContain(ko["sim.rank.tier.gold"]);
        expect(t).toContain(ko["sim.rank.promotedFrom"].replace("{tier}", ko["sim.rank.tier.silver"]));
        expect(t).toContain("레이팅 1152");
        expect(t).toContain("+12");
    });

    it("배치를 마친 판 — '첫 등급을 얻었어요', 어디서 올라왔다는 말은 없다", async () => {
        const t = text(await html({ delta: -12, before: 952, after: 940, matches: 3, tierBefore: null, tierAfter: "iron", promoted: true }));
        expect(t).toContain(ko["sim.rank.firstTier"]);
        expect(t).not.toContain(ko["sim.rank.promoted"]);
        expect(t).toContain(ko["sim.rank.tier.iron"]);
        expect(t).toContain("−12");
        expect(t).not.toContain("올라왔어요");
    });

    it("그 밖에는 작은 한 칸 — 배지 · 레이팅 · 변화 · 다음 등급까지", async () => {
        const h = await html({ delta: 12, before: 1030, after: 1042, matches: 21, tierBefore: "bronze", tierAfter: "bronze", promoted: false });
        expect(h).toContain('data-testid="match-rating"');
        expect(h).not.toContain("match-promo");
        expect(h).toContain("/sim/rank/tier-bronze.webp");
        const t = text(h);
        expect(t).toContain("레이팅 1042");
        expect(t).toContain("+12");
        expect(t).toContain(ko["sim.rank.nextTier"].replace("{tier}", ko["sim.rank.tier.silver"]).replace("{n}", "8"));
    });

    it("내려가도 알리지 않는다 — 숫자와 지금 등급만", async () => {
        const h = await html({ delta: -12, before: 1156, after: 1144, matches: 65, tierBefore: "gold", tierAfter: "silver", promoted: false });
        expect(h).not.toContain("match-promo");
        const t = text(h);
        expect(t).toContain("−12");
        expect(t).toContain(ko["sim.rank.tier.silver"]);
        expect(t).not.toContain(ko["sim.rank.tier.gold"] + "에서");
    });

    it("배치 중에는 배지가 없다(실루엣) — 배치 중 n/3", async () => {
        const h = await html({ delta: 12, before: 1012, after: 1024, matches: 2, tierBefore: null, tierAfter: null, promoted: false });
        expect(h).toContain("/sim/rank/tier-iron.webp");
        expect(h).toContain("grayscale(1)");
        expect(text(h)).toContain(ko["sim.rank.unranked"].replace("{n}", "2").replace("{m}", "3"));
    });

    it("마스터는 다음 등급이 없다 · 무승부는 ±0", async () => {
        expect(text(await html({ delta: 4, before: 1498, after: 1502, matches: 212, tierBefore: "master", tierAfter: "master", promoted: false }))).toContain(ko["sim.rank.topTier"]);
        expect(text(await html({ delta: 0, before: 1010, after: 1010, matches: 5, tierBefore: "bronze", tierAfter: "bronze", promoted: false }))).toContain("±0");
    });

    it("끝난 화면에 붙어 있고, 문구가 다섯 언어에 있고, 움직임을 줄여 달라는 기기에서는 멈춘다", () => {
        const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
        expect(read("MatchEndRapport.tsx")).toContain("{info.rating && <MatchRatingCard rating={info.rating} />}");
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = read(`../../lib/i18n/${l}.ts`);
            for (const k of ["sim.rank.promoted", "sim.rank.firstTier", "sim.rank.promotedFrom", "sim.rank.ratingNow"]) expect(d, `${l} ${k}`).toContain(`"${k}":`);
            expect(d.match(/"sim\.rank\.promotedFrom": "(.*)",/)![1]).toContain("{tier}");
            expect(d.match(/"sim\.rank\.ratingNow": "(.*)",/)![1]).toContain("{n}");
        }
        const css = read("../../index.css");
        expect(css).toContain(".rank-hall .hall-promo {");
        expect(css).toContain(".rank-hall .hall-rays, .rank-hall .hall-pop { animation: none; }");
    });
});
