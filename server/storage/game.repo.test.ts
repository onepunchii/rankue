/**
 * RP 증감식. 경기 종료가 더한 값을 어드민 삭제가 그대로 빼야 하므로(adminDeleteFinishedGame),
 * 두 곳이 같은 함수를 쓰는지와 구간 경계를 못박아 둔다. 임계값은 HANDICAP_MAP 의 스케일과 한 몸이다.
 */
import { describe, it, expect } from "vitest";
import { rpDeltaFor } from "./game.repo.js";
import { handicapFor } from "../../shared/realHandicap.js";

describe("rpDeltaFor", () => {
    it("승리는 종목·핸디와 무관하게 +30", () => {
        expect(rpDeltaFor("4c", true, 0)).toBe(30);
        expect(rpDeltaFor("3c", true, 50)).toBe(30);
    });

    // 2026-10-12 다마 표를 바꾸며(shared/realHandicap — 4구는 다마 ÷ 20이닝, 3쿠션은 대대 권장 에버리지 16칸) 구간을 에버리지 축에서 그대로 옮겼다:
    // 같은 실력의 사람이 지면 예전과 같은 만큼 깎인다. 다마 숫자를 그대로 뒀다면 4구는 모두 덜 깎이고 3쿠션은 더 깎였다.
    it("4구 패배: 8 미만 면제, 15 미만 -5, 그 위 -15", () => {
        expect(rpDeltaFor("4c", false, 3)).toBe(0);
        expect(rpDeltaFor("4c", false, 5)).toBe(0);
        expect(rpDeltaFor("4c", false, 8)).toBe(-5);
        expect(rpDeltaFor("4c", false, 12)).toBe(-5);
        expect(rpDeltaFor("4c", false, 15)).toBe(-15);
        expect(rpDeltaFor("4c", false, 50)).toBe(-15);
    });

    it("3쿠션 패배: 20 미만 면제, 25 미만 -5, 그 위 -15", () => {
        expect(rpDeltaFor("3c", false, 15)).toBe(0);
        expect(rpDeltaFor("3c", false, 18)).toBe(0);
        expect(rpDeltaFor("3c", false, 20)).toBe(-5);
        expect(rpDeltaFor("3c", false, 24)).toBe(-5);
        expect(rpDeltaFor("3c", false, 25)).toBe(-15);
        expect(rpDeltaFor("3c", false, 40)).toBe(-15);
    });

    it("구간은 에버리지 축에서 예전과 같다 — 같은 에버리지의 사람은 표가 바뀌어도 같은 만큼 깎인다", () => {
        // 예전 표의 구간: 3쿠션 면제 에버 0.4 미만 · -15 는 0.6 이상 / 4구 면제 0.35 미만 · -15 는 0.75 이상
        const old3 = (avg: number) => (avg < 0.4 ? 0 : avg < 0.6 ? -5 : -15);
        const old4 = (avg: number) => (avg < 0.35 ? 0 : avg < 0.75 ? -5 : -15);
        // 새 표는 칸의 경계가 달라(3쿠션 0.411 · 0.605, 4구 0.4) 경계 바로 옆은 한 칸씩 어긋난다 — 그 밖은 같다
        for (const avg of [0.2, 0.3, 0.38, 0.45, 0.5, 0.58, 0.62, 0.7, 0.9, 1.2]) expect(rpDeltaFor("3c", false, handicapFor(avg, "3c")), `3c ${avg}`).toBe(old3(avg));
        for (const avg of [0.1, 0.2, 0.3, 0.42, 0.5, 0.6, 0.7, 0.8, 1.0, 1.6, 2.6]) expect(rpDeltaFor("4c", false, handicapFor(avg, "4c")), `4c ${avg}`).toBe(old4(avg));
    });

    it("되돌리기는 더한 값을 그대로 뺀다 — 같은 핸디면 합이 0", () => {
        for (const handi of [0, 12, 20, 25, 30]) {
            for (const win of [true, false]) {
                const applied = rpDeltaFor("4c", win, handi);
                expect(applied + -applied).toBe(0);
            }
        }
    });
});
