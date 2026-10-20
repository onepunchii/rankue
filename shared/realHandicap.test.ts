import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    HANDICAP_MAP_3C, HANDICAP_MAP_4C, HANDI_4C_INNINGS, HANDI_4C_MAX, HANDI_MIN_GAMES, HANDI_RECENT_GAMES,
    handiBasis, handiBasisAverage, handiGameAverage, handicapFor, nextHandicap, handiBandProgress,
} from "./realHandicap";

/**
 * 실전(점수판) 다마 표(2026-10-12 오너: "점수판 에버가 1.5에 마스터가 되나? 4구는 다르지 않아 한번 조사해줘" · 표 둘 → "추천대로").
 *  - 3쿠션: 대대 점수별 권장 에버리지 16칸(오너가 준 표). 그 에버리지 이상이면 그 점수.
 *  - 4구: 다마 ÷ 20이닝. 예전 표는 다마 ÷ 33이닝이라 에버리지 1.5 에 500(실전 마스터)이 됐다.
 */
describe("3쿠션 — 대대 점수별 권장 에버리지(오너가 준 표 그대로)", () => {
    const TABLE: [number, number][] = [
        [12, 0.221], [15, 0.270], [17, 0.328], [18, 0.357], [20, 0.411], [21, 0.451], [22, 0.485], [23, 0.520],
        [24, 0.561], [25, 0.605], [27, 0.710], [28, 0.776], [30, 0.869], [32, 0.997], [35, 1.159], [40, 1.388],
    ];

    it("16칸 · 그 에버리지에 닿으면 그 점수, 바로 아래면 아랫칸", () => {
        expect(HANDICAP_MAP_3C.map((s) => s.handi).sort((a, b) => a - b)).toEqual(TABLE.map(([h]) => h));
        for (const [handi, avg] of TABLE) {
            expect(handicapFor(avg, "3c"), `${handi}점 = ${avg}`).toBe(handi);
            const below = TABLE[TABLE.findIndex(([h]) => h === handi) - 1]?.[0];
            if (below !== undefined) expect(handicapFor(avg - 0.001, "3c"), `${avg} 바로 아래`).toBe(below);
        }
    });

    it("맨 아래는 12점 — 표의 12점 권장값(0.221)보다 낮아도 12점이다", () => {
        expect(handicapFor(0, "3c")).toBe(12);
        expect(handicapFor(0.1, "3c")).toBe(12);
        expect(handicapFor(0.269, "3c")).toBe(12);
        expect(HANDICAP_MAP_3C[HANDICAP_MAP_3C.length - 1]).toEqual({ avg: 0, handi: 12 });
    });

    it("예전 표와 견주면 — 스스로 20점이라 적고 치는 사람(에버 0.395~0.41)이 15점이 아니라 18~20점이 된다", () => {
        expect(handicapFor(0.395, "3c")).toBe(18);   // 예전 표: 15
        expect(handicapFor(0.411, "3c")).toBe(20);   // 예전 표: 18
        expect(handicapFor(1.0, "3c")).toBe(32);     // 예전 표: 30(맨 위)
        expect(handicapFor(1.5, "3c")).toBe(40);
    });

    it("내림차순이고 같은 값이 없다(위에서부터 처음 닿는 칸을 고르는 식이라 순서가 뜻이다)", () => {
        for (const map of [HANDICAP_MAP_3C, HANDICAP_MAP_4C]) {
            for (let i = 1; i < map.length; i++) {
                expect(map[i - 1].avg).toBeGreaterThan(map[i].avg);
                expect(map[i - 1].handi).toBeGreaterThan(map[i].handi);
            }
            expect(map[map.length - 1].avg).toBe(0);
        }
    });
});

describe("4구 — 다마 ÷ 20이닝", () => {
    it("칸은 예전 그대로(30~500), 문턱은 다마 ÷ 20", () => {
        expect(HANDI_4C_INNINGS).toBe(20);
        expect(HANDICAP_MAP_4C.map((s) => s.handi).sort((a, b) => a - b)).toEqual([3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
        for (const s of HANDICAP_MAP_4C) {
            // 맨 아래 칸(30)은 바닥이라 0 부터다
            expect(s.avg, `${s.handi}`).toBe(s.handi === 3 ? 0 : s.handi / HANDI_4C_INNINGS);
        }
    });

    it("오너가 준 20이닝 기준 표와 같다 — 100 = 0.50 · 200 = 1.00 · 300 = 1.50 · 500 = 2.50", () => {
        for (const [dama, avg] of [[100, 0.5], [150, 0.75], [200, 1.0], [250, 1.25], [300, 1.5], [400, 2.0], [500, 2.5]]) {
            expect(handicapFor(avg, "4c"), `${dama}`).toBe(dama / 10);
        }
    });

    it("에버리지 1.5 는 이제 300 이다 — 예전 표는 500(실전 마스터)이었다", () => {
        expect(handicapFor(1.5, "4c")).toBe(30);
        expect(handicapFor(1.588, "4c")).toBe(30);
        expect(handicapFor(2.49, "4c")).toBe(40);
        expect(handicapFor(2.5, "4c")).toBe(50);
        expect(handicapFor(0.6, "4c")).toBe(12);     // 예전 표: 20
        expect(handicapFor(0.2, "4c")).toBe(3);
    });

    it("다음 칸 — 맨 위면 없다", () => {
        expect(nextHandicap(0.9, "4c")).toEqual({ avg: 1.0, handi: 20 });
        expect(nextHandicap(2.6, "4c")).toBeNull();
        expect(nextHandicap(0.66, "3c")).toEqual({ avg: 0.71, handi: 27 });
        expect(nextHandicap(1.4, "3c")).toBeNull();
    });
});

describe("다마에 넣는 판의 에버리지", () => {
    it("4구에서 목표를 다마 표의 맨 위(50)보다 크게 적은 판은 세지 않는다 — 점수판의 눈금 밖이다", () => {
        expect(HANDI_4C_MAX).toBe(50);
        expect(handiGameAverage({ average: "8.18", target: 180 }, "4c")).toBeNull();
        expect(handiGameAverage({ average: "5.55", target: 150 }, "4c")).toBeNull();
        // 채팅 카드가 4구 목표를 80 으로 적어 주던 때의 판 — 득점 수로 친 판이라 10으로 나누면 거꾸로 깎인다. 빼는 것이 안전하다
        expect(handiGameAverage({ average: "0.75", target: 80 }, "4c")).toBeNull();
        // 다마 표 안의 목표는 그대로
        expect(handiGameAverage({ average: "1.688", target: 33 }, "4c")).toBe(1.688);
        expect(handiGameAverage({ average: "1.5", target: 50 }, "4c")).toBe(1.5);
        // 목표를 모르는 옛 줄 · 3쿠션은 그대로
        expect(handiGameAverage({ average: "2.4", target: null }, "4c")).toBe(2.4);
        expect(handiGameAverage({ average: "2.4" }, "4c")).toBe(2.4);
        expect(handiGameAverage({ average: "0.9", target: 60 }, "3c")).toBe(0.9);
        expect(handiGameAverage({ average: 0.5 }, "3c")).toBe(0.5);
    });

    it("숫자가 아닌 줄은 평균에서 뺀다", () => {
        expect(handiGameAverage({ average: "" }, "3c")).toBeNull();
        expect(handiGameAverage({ average: "abc" }, "4c")).toBeNull();
        expect(handiBasisAverage([{ average: "0.4" }, { average: "" }, { average: "0.6" }], "3c")).toBeCloseTo(0.5, 10);
        expect(handiBasis([{ average: "0.4" }, { average: "" }, { average: "0.6" }], "3c")!.games).toBe(2);
        expect(handiBasis([], "3c")).toBeNull();
        expect(handiBasisAverage([{ average: "x" }], "4c")).toBeNull();
    });

    it("최근 10판까지만, 판별 에버리지의 평균 — 눈금 밖의 판 하나가 다마를 500 으로 만들지 않는다", () => {
        expect([HANDI_MIN_GAMES, HANDI_RECENT_GAMES]).toEqual([5, 10]);
        // 운영에 있던 꼴: 0.6 쯤 치는 사람의 다섯 판 가운데 하나가 목표 150 으로 적혀 5.55 로 남았다
        const games = [{ average: "5.55", target: 150 }, { average: "0.61", target: 12 }, { average: "0.58", target: 12 }, { average: "0.66", target: 13 }, { average: "0.55", target: 12 }];
        const b = handiBasis(games, "4c")!;
        expect(b.games).toBe(4);
        expect(b.avg).toBeCloseTo((0.61 + 0.58 + 0.66 + 0.55) / 4, 10);
        expect(handicapFor(b.avg, "4c")).toBe(12);
        // 그 판을 그대로 넣으면 평균 1.59 — 예전 표로는 500, 새 표로도 300 이 된다
        expect(handicapFor((5.55 + 0.61 + 0.58 + 0.66 + 0.55) / 5, "4c")).toBe(30);
        const many = Array.from({ length: 14 }, (_, i) => ({ average: i < 10 ? "1.0" : "9.9" }));
        expect(handiBasis(many, "4c")).toEqual({ avg: 1, games: 10 });
    });
});

/** 서버가 그 표와 그 셈을 쓰는가 — 소스를 읽어 지킨다 */
describe("서버: 경기 끝의 다마 산정과 홈 '다음 다마까지'가 같은 판 · 같은 셈", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

    it("경기 끝: 최근 공식 판(목표와 함께)을 읽어 표에 넣는다 — 표를 따로 훑지 않는다", () => {
        const repo = read("server/storage/game.repo.ts");
        const fn = repo.slice(repo.indexOf("async checkAndUpdateHandicap("), repo.indexOf("async getMemberStatsAnalysis("));
        expect(fn).toContain("const basis = handiBasis(await recentHandiGames(memberId, gameType), gameType);");
        // 셀 수 있는 판이 다섯에 못 미치면 다마를 건드리지 않는다(눈금 밖의 판을 뺀 뒤의 수로 센다)
        expect(fn).toContain("if (!basis || basis.games < HANDI_MIN_GAMES) return { oldHandi: 0, newHandi: 0, message: null };");
        expect(fn).toContain("const newHandi = handicapFor(totalAvg, gameType);");
        expect(repo).not.toMatch(/HANDICAP_MAP_3C\s*:|for \(const tier of map\)/);
        const q = repo.slice(repo.indexOf("export async function recentHandiGames("), repo.indexOf("export class GameRepository"));
        expect(q).toContain("where h.member_id = ${memberId} and h.game_type = ${gameType} and h.is_ranked");
        expect(q).toContain("order by h.created_at desc");
        expect(q).toContain("limit ${HANDI_RECENT_GAMES}");
        expect(q).toContain("when g.player1_id = h.member_id then g.player1_target");
    });

    it("홈 카드의 근거도 같은 함수 둘이다", () => {
        const repo = read("server/storage/compare.repo.ts");
        const fn = repo.slice(repo.indexOf("async handiBasis("), repo.indexOf("/** 같은 핸디 회원"));
        expect(fn).toContain("avg: handiBasisAverage(await recentHandiGames(memberId, type), type)");
    });
});

describe("다음 다마 막대 — 지금 핸디 칸 안의 자리(2026-10-20 시안 A)", () => {
    it("칸 아래 끝 0 · 위 끝 1 · 맨 위 칸은 null", () => {
        expect(handiBandProgress(0.52, "3c")).toBeCloseTo(0, 5);          // 23점 칸의 아래 끝
        expect(handiBandProgress(0.5405, "3c")).toBeCloseTo(0.5, 2);      // 0.52 ~ 0.561 의 가운데
        expect(handiBandProgress(1.5, "3c")).toBeNull();                  // 40점 — 더 오를 칸이 없다
        expect(handiBandProgress(Number.NaN, "3c")).toBeNull();
        expect(handiBandProgress(0.1, "3c")).toBeGreaterThan(0);          // 맨 아래 칸(12점)도 막대가 있다
    });
});
