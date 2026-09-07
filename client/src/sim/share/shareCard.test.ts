/**
 * shareCard 검증: 순수 레이아웃(카드 안에 테이블·통계·푸터가 겹치지 않고 들어간다)·문구 헬퍼·표식 계획, 그리고
 * 기록형 가짜 캔버스로 renderShareCard 스모크(1080×1350, 제목·부제·푸터·링크 문구가 찍히고 공 수만큼 명암 그라데이션).
 */
import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { simulateShot } from "@shared/sim/simulate";
import type { ShotInput } from "@shared/sim/types";
import type { CushionMark } from "../overlay/paths";
import { ko } from "../../lib/i18n/ko";
import { buildConfig } from "../setupPresets";
import { paramsFromConfig } from "../simReducer";
import {
    CARD_H, CARD_W, cardLayout, cardPaths, dateLabel, fileNameFor, fitText, gameBadge, markPlan, renderShareCard,
    replayShortText, sessionStatsLine, shotSubtitle, shotTitle, type ShareCardOptions,
} from "./shareCard";

const t = (k: string) => ko[k] ?? k;
const cfg3c = buildConfig({ gameType: "3c", target: 15 });
const layout3c = openingLayout("3c", TABLES.DAEDAE, "white");
const input: ShotInput = { cueBallId: "white", phi: 1.25, V0: 3, a: 0.2, b: 0, theta: 0 };
const result = simulateShot(layout3c, input, paramsFromConfig(cfg3c));

type Call = { name: string; args: unknown[] };

function fakeCanvas(calls: Call[], withContext = true) {
    const gradient = { addColorStop: () => undefined };
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
        get(_t, prop: string) {
            if (prop in store) return store[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return (...args: unknown[]) => { calls.push({ name: prop, args }); return gradient; };
            if (prop === "measureText") return (s: string) => ({ width: String(s).length * 14 });
            return (...args: unknown[]) => { calls.push({ name: prop, args }); };
        },
        set(_t, prop: string, value) { store[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const canvas = { width: 0, height: 0, getContext: () => (withContext ? ctx : null) };
    return canvas as unknown as HTMLCanvasElement;
}

const opts = (over: Partial<ShareCardOptions> = {}): ShareCardOptions => ({
    table: TABLES.DAEDAE, gameType: "3c", cueBallId: "white",
    badge: "3쿠션", title: "3쿠션 득점 · 쿠션 4", subtitle: "대대 · 3쿠션 UMB · 3.0 m/s",
    footer: "랭큐 시뮬레이터 · rankue.co.kr", replayText: "rankue.co.kr/online-game?replay=abc", date: "2026.09.07",
    ...over,
});

describe("shareCard 레이아웃", () => {
    it.each([TABLES.DAEDAE, TABLES.JUNGDAE_KR])("$id: 카드 안에 테이블이 잘리지 않게 들어가고 푸터는 카드 바닥에 붙는다", (table) => {
        for (const hasStats of [false, true]) {
            const L = cardLayout(table, { hasStats });
            expect(L.width).toBe(CARD_W);
            expect(L.height).toBe(CARD_H);
            expect(L.card.x).toBeGreaterThan(0);
            expect(L.card.x + L.card.w).toBeLessThan(CARD_W);
            expect(L.card.y + L.card.h).toBeLessThan(CARD_H);
            // 제목·부제 → 테이블 상자 → (통계) → 푸터 순서로 겹치지 않는다
            expect(L.title.y).toBeGreaterThan(L.badge.y + L.badge.h);
            expect(L.subtitle.y).toBeGreaterThan(L.title.y);
            expect(L.tableBox.y).toBeGreaterThan(L.subtitle.y);
            expect(L.tableBox.y + L.tableBox.h).toBeLessThan(L.footer.y);
            expect(L.footer.y + L.footer.h).toBe(L.card.y + L.card.h);
            // 테이블(레일 포함)은 상자 안
            const o = L.table.outer;
            expect(o.x).toBeGreaterThanOrEqual(0);
            expect(o.y).toBeGreaterThanOrEqual(0);
            expect(o.x + o.w).toBeLessThanOrEqual(L.tableBox.w + 1e-6);
            expect(o.y + o.h).toBeLessThanOrEqual(L.tableBox.h + 1e-6);
            expect(L.table.scale).toBeGreaterThan(200);
            if (hasStats) {
                expect(L.stats).not.toBeNull();
                expect(L.stats!.y).toBeGreaterThan(L.tableBox.y + L.tableBox.h);
                expect(L.stats!.y).toBeLessThan(L.footer.y);
            } else {
                expect(L.stats).toBeNull();
            }
        }
        // 통계가 있으면 테이블이 그만큼 작아진다
        expect(cardLayout(table, { hasStats: true }).table.scale).toBeLessThan(cardLayout(table, { hasStats: false }).table.scale);
    });
});

describe("shareCard 문구", () => {
    it("shotTitle: 3쿠션 득점은 쿠션 수, 4구 득점, 그 외는 연습 샷", () => {
        expect(shotTitle(t, { scored: true, cushionsBeforeSecond: 4 }, "3c")).toBe("3쿠션 득점 · 쿠션 4");
        expect(shotTitle(t, { scored: true, cushionsBeforeSecond: 1 }, "4c")).toBe("4구 득점");
        expect(shotTitle(t, { scored: false, cushionsBeforeSecond: 2 }, "3c")).toBe("연습 샷");
        expect(shotTitle(t, null, "3c")).toBe("연습 샷");
    });

    it("shotSubtitle: 테이블 · 규칙 · 세기", () => {
        expect(shotSubtitle(t, cfg3c, { V0: 2.5 })).toBe("대대 · 3쿠션 UMB · 2.5 m/s");
        const cfg4c = buildConfig({ gameType: "4c", target: 80, rules: { threeCushionDouble: true } });
        expect(shotSubtitle(t, cfg4c, { V0: 3 })).toBe("중대 · 4구 · 3쿠션 2배 · 3.0 m/s");
    });

    it("sessionStatsLine: 점수판 규약(진행 중 이닝 포함)으로 에버리지를 낸다", () => {
        const p = { score: 12, target: 15, innings: 8, currentRun: 0 };
        expect(sessionStatsLine(t, p, "finished")).toBe("12/15 · 9이닝 · 에버리지 1.33");
        expect(sessionStatsLine(t, p, "setup")).toBe("12/15 · 8이닝 · 에버리지 1.50");
        expect(sessionStatsLine(t, { score: -10, target: 80, innings: 0, currentRun: 0 }, "aim")).toBe("-10/80 · 1이닝 · 에버리지 -10.00");
    });

    it("gameBadge · replayShortText · fitText · dateLabel · fileNameFor", () => {
        expect(gameBadge(t, "3c")).toBe("3쿠션");
        expect(gameBadge(t, "4c")).toBe("4구");
        const long = `https://www.rankue.co.kr/online-game?replay=${"a".repeat(100)}`;
        const short = replayShortText(long);
        expect(short.startsWith("rankue.co.kr/online-game?replay=")).toBe(true);
        expect(short.length).toBe(48);
        expect(short.endsWith("…")).toBe(true);
        expect(replayShortText("https://rankue.co.kr/x")).toBe("rankue.co.kr/x");
        const m = (s: string) => s.length * 10;
        expect(fitText(m, "abcdef", 100)).toBe("abcdef");
        expect(fitText(m, "abcdefghijkl", 60)).toBe("abcde…");
        expect(fitText(m, "abc", 0)).toBe("");
        expect(dateLabel(new Date(2026, 8, 7))).toBe("2026.09.07");
        expect(fileNameFor({ hash: "0123456789abcdef" }, new Date(2026, 8, 7))).toBe("rankue-shot-20260907-01234567.png");
    });

    it("markPlan: 두 번째 적구 접촉 전 쿠션만 번호, 없으면 전부 번호", () => {
        const mk = (i: number, tt: number): CushionMark => ({ index: i, t: tt, x: 0, y: 0, cushion: "left" });
        const marks = [mk(1, 0.1), mk(2, 0.2), mk(3, 0.3)];
        expect(markPlan(marks, 0.25)).toEqual({ numbered: [marks[0], marks[1]], plain: [marks[2]] });
        expect(markPlan(marks, null)).toEqual({ numbered: marks, plain: [] });
        expect(markPlan(marks, 0.3)).toEqual({ numbered: marks, plain: [] });
    });

    it("cardPaths: 끝까지 그린다(컷오프 = history 끝) · 큐볼 경로 포함", () => {
        const { paths, secondContactT } = cardPaths(result, "white", "3c");
        expect(paths.cutoffT).toBe(result.history[result.history.length - 1].t);
        expect(paths.paths.some((p) => p.id === "white")).toBe(true);
        if (secondContactT !== null) expect(secondContactT).toBeLessThanOrEqual(paths.cutoffT);
        expect(paths.cushions.length).toBe(result.events.filter((e) => e.type === "ball-cushion" && e.ids[0] === "white").length);
    });
});

describe("renderShareCard 스모크", () => {
    it("1080×1350 캔버스에 제목·부제·알약·푸터·링크·날짜를 찍고 공마다 명암을 그린다", () => {
        const calls: Call[] = [];
        const canvas = renderShareCard(result, opts({ createCanvas: () => fakeCanvas(calls) }));
        expect(canvas.width).toBe(CARD_W);
        expect(canvas.height).toBe(CARD_H);
        const texts = calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0]));
        for (const s of ["3쿠션", "3쿠션 득점 · 쿠션 4", "대대 · 3쿠션 UMB · 3.0 m/s", "랭큐 시뮬레이터 · rankue.co.kr", "rankue.co.kr/online-game?replay=abc", "2026.09.07"]) {
            expect(texts).toContain(s);
        }
        // 번호 매긴 쿠션 점
        const numbered = cardPaths(result, "white", "3c");
        const plan = markPlan(numbered.paths.cushions, numbered.secondContactT);
        for (const m of plan.numbered) expect(texts).toContain(String(m.index));
        // 라사 비네트 1 + 공마다 명암·하이라이트 2
        expect(calls.filter((c) => c.name === "createRadialGradient")).toHaveLength(1 + result.final.length * 2);
        // 안쪽 그늘 4면
        expect(calls.filter((c) => c.name === "createLinearGradient")).toHaveLength(4);
        // 통계 줄은 없을 때 찍히지 않는다
        expect(texts.some((s) => s.includes("에버리지"))).toBe(false);
    });

    it("통계 줄이 있으면 찍힌다 · 2D 컨텍스트가 없으면 throw", () => {
        const calls: Call[] = [];
        renderShareCard(result, opts({ stats: "12/15 · 9이닝 · 에버리지 1.33", createCanvas: () => fakeCanvas(calls) }));
        expect(calls.filter((c) => c.name === "fillText").map((c) => c.args[0])).toContain("12/15 · 9이닝 · 에버리지 1.33");
        expect(() => renderShareCard(result, opts({ createCanvas: () => fakeCanvas([], false) }))).toThrow();
    });

    it("4구(중대)도 그려진다", () => {
        const cfg4c = buildConfig({ gameType: "4c", target: 80 });
        const layout4c = openingLayout("4c", TABLES.JUNGDAE_KR, "white");
        const r4 = simulateShot(layout4c, input, paramsFromConfig(cfg4c));
        const calls: Call[] = [];
        renderShareCard(r4, opts({ table: TABLES.JUNGDAE_KR, gameType: "4c", badge: "4구", title: "4구 득점", createCanvas: () => fakeCanvas(calls) }));
        expect(calls.filter((c) => c.name === "createRadialGradient")).toHaveLength(1 + 4 * 2);
    });
});
