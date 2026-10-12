import { describe, it, expect } from "vitest";
import { PLACEMENT_MATCHES, tierProgress } from "../../../../shared/sim/rank";
import { hubStateOf, otherGame, type HubBoard } from "./hubState";

/**
 * 홈 '온라인 대전' 배너의 상태(2026-10-12 오너: "당구 홈에 혼자 치기 카드 위에 배너 카드를 …").
 * 배지는 얻은 사람에게만 준다 — 배치 전·옛 응답에서 등급을 지어내면 안 된다.
 */
const b = (gameType: "3c" | "4c", matches: number, rating?: number, o: Partial<HubBoard> = {}): HubBoard =>
    ({ gameType, matches, rating, wins: 0, rank: matches >= PLACEMENT_MATCHES ? 1 : null, total: matches >= PLACEMENT_MATCHES ? 5 : 0, ...o });

describe("hubStateOf", () => {
    it("대전을 한 판도 안 뒀으면 fresh — 판이 없거나, 판은 있는데 0판이거나", () => {
        expect(hubStateOf([], 3)).toEqual({ kind: "fresh", canSwap: false });
        expect(hubStateOf([b("3c", 0, 1000)], 3)).toEqual({ kind: "fresh", canSwap: false });
    });

    it("배치 중에는 배지를 주지 않는다 — 남은 판 수와 전적만", () => {
        const s = hubStateOf([b("3c", 2, 1024, { wins: 2 })], 3);
        expect(s).toEqual({ kind: "placing", gameType: "3c", matches: 2, left: 1, wins: 2, losses: 0, canSwap: false });
    });

    it("배치를 마치면 등급 · 다음 등급 · 남은 점수 · 막대", () => {
        const s = hubStateOf([b("3c", 21, 1042, { wins: 12, rank: 2, total: 7 })], 3);
        expect(s.kind).toBe("ranked");
        if (s.kind !== "ranked") return;
        expect(s.tier.id).toBe("bronze");
        expect(s.next?.id).toBe("silver");
        expect(s.toNext).toBe(8);
        expect(s.progress).toBeCloseTo(0.92, 2);
        expect([s.rank, s.total, s.wins, s.losses]).toEqual([2, 7, 12, 9]);
        expect(s.canSwap).toBe(false);
    });

    it("마스터는 다음 등급이 없고 막대가 꽉 찬다", () => {
        const s = hubStateOf([b("4c", 40, 1502)], 3);
        expect(s.kind === "ranked" && [s.tier.id, s.next, s.toNext, s.progress]).toEqual(["master", null, null, 1]);
    });

    it("아이언은 아래 끝이 없다 — 브론즈 문턱 100점 아래를 바닥으로 본다", () => {
        expect(tierProgress(900)).toBeCloseTo(0.5, 5);
        expect(tierProgress(700)).toBe(0);
        const s = hubStateOf([b("3c", 5, 900)], 3);
        expect(s.kind === "ranked" && [s.tier.id, s.toNext]).toEqual(["iron", 50]);
    });

    it("두 종목이면 등급이 있는 쪽 가운데 많이 둔 종목 — '내 온라인 실력' 카드의 기본 탭과 같은 규칙", () => {
        const both = [b("3c", 4, 1180), b("4c", 30, 1010)];
        const s = hubStateOf(both, 3);
        expect(s.kind === "ranked" && [s.gameType, s.tier.id, s.canSwap]).toEqual(["4c", "bronze", true]);
        // 등급이 있는 쪽이 먼저다 — 배치 중인 종목을 더 많이… 는 있을 수 없지만(배치는 3판), 등급 없는 쪽이 앞서지 않는다
        const s2 = hubStateOf([b("3c", 2, 1020), b("4c", 3, 990)], 3);
        expect(s2.kind === "ranked" && s2.gameType).toBe("4c");
        // 판 수가 같으면 레이팅이 높은 쪽
        const s3 = hubStateOf([b("3c", 10, 1100), b("4c", 10, 1210)], 3);
        expect(s3.kind === "ranked" && s3.gameType).toBe("4c");
    });

    it("종목을 고르면 그 종목 — 배치 중이면 배치 중으로. 안 둔 종목을 고르면 무시한다", () => {
        const both = [b("3c", 4, 1180), b("4c", 2, 1010)];
        expect(hubStateOf(both, 3, "4c")).toMatchObject({ kind: "placing", gameType: "4c", left: 1, canSwap: true });
        expect(hubStateOf(both, 3, "3c")).toMatchObject({ kind: "ranked", gameType: "3c" });
        expect(hubStateOf([b("3c", 4, 1180), b("4c", 0, 1000)], 3, "4c")).toMatchObject({ kind: "ranked", gameType: "3c", canSwap: false });
        expect(otherGame("3c")).toBe("4c");
        expect(otherGame("4c")).toBe("3c");
    });

    it("레이팅이 없는 옛 응답에서는 등급을 지어내지 않는다", () => {
        expect(hubStateOf([b("3c", 9, undefined)], 3)).toEqual({ kind: "waiting", gameType: "3c", canSwap: false });
        expect(hubStateOf([b("3c", 9, Number.NaN)], 3).kind).toBe("waiting");
    });

    it("승수가 판 수보다 크게 와도 패가 음수가 되지 않는다", () => {
        const s = hubStateOf([b("3c", 3, 1000, { wins: 9 })], 3);
        expect(s.kind === "ranked" && [s.wins, s.losses]).toEqual([3, 0]);
    });
});
