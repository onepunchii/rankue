import { describe, it, expect } from "vitest";
import { matchParamsKey, planWatch, roomSetKey, shouldRefreshWatch, shouldSkipAnimation, nextPollMs, normalizeShots, WATCH_POLL_MS } from "./watchPlan";
import type { MatchShot } from "../matchApi";

const shot = (idx: number): MatchShot => ({
    idx, playerIndex: (idx % 2) as 0 | 1, preState: [], input: {} as any, hash: "h",
    outcomeCode: "miss", points: 0, cushions: 0, createdAt: "2026-09-12T00:00:00.000Z",
});

describe("planWatch", () => {
    it("서버에 새 샷이 있으면 내가 본 다음 번호부터 받아온다", () => {
        expect(planWatch({ serverShots: 5, playedShots: 3, animating: false })).toEqual({ kind: "fetch", from: 3 });
    });
    it("따라잡았으면 아무것도 안 한다", () => {
        expect(planWatch({ serverShots: 3, playedShots: 3, animating: false })).toEqual({ kind: "idle" });
    });
    it("재생 중에는 새 샷을 받아오지 않는다 — 중간에 갈아치우면 공이 순간이동한다", () => {
        expect(planWatch({ serverShots: 9, playedShots: 3, animating: true })).toEqual({ kind: "idle" });
    });
});

describe("nextPollMs", () => {
    it("진행 중이고 화면이 보이면 4초", () => {
        expect(nextPollMs("playing", true)).toBe(WATCH_POLL_MS);
    });
    it("끝난 대전이나 가려진 화면은 쉰다", () => {
        expect(nextPollMs("finished", true)).toBeNull();
        expect(nextPollMs("playing", false)).toBeNull();
    });
});

describe("shouldSkipAnimation", () => {
    it("많이 밀렸으면 재생을 건너뛴다", () => {
        expect(shouldSkipAnimation(1)).toBe(false);
        expect(shouldSkipAnimation(3)).toBe(false);
        expect(shouldSkipAnimation(4)).toBe(true);
    });
});

describe("normalizeShots", () => {
    it("순서대로 이어지는 구간만 돌려준다", () => {
        expect(normalizeShots([shot(3), shot(4), shot(5)], 3).map((s) => s.idx)).toEqual([3, 4, 5]);
    });
    it("중복은 버리고, 번호가 비면 거기서 끊는다", () => {
        expect(normalizeShots([shot(1), shot(3), shot(4)], 3).map((s) => s.idx)).toEqual([3, 4]);
        expect(normalizeShots([shot(3), shot(5)], 3).map((s) => s.idx)).toEqual([3]);
    });
});

/**
 * 방 목록이 바뀌면 관전 목록을 바로 다시 받는다(2026-09-13 오너 제보:
 * "누가 방을 만들고 누가 참여하면 '열린 방이 없어요' 라고 뜨고 얼마 뒤에 관전이 된다고 뜬다").
 */
describe("shouldRefreshWatch", () => {
    it("방이 빠지면(누가 참가했다) 다시 받는다", () => {
        expect(shouldRefreshWatch(roomSetKey(["a", "b"]), roomSetKey(["a"]))).toBe(true);
    });
    it("방이 새로 열려도 다시 받는다 — 목록 두 개가 어긋나지 않게", () => {
        expect(shouldRefreshWatch(roomSetKey(["a"]), roomSetKey(["a", "b"]))).toBe(true);
    });
    it("그대로면 받지 않는다. 순서만 다른 것도 그대로다", () => {
        expect(shouldRefreshWatch(roomSetKey(["a", "b"]), roomSetKey(["b", "a"]))).toBe(false);
    });
    it("첫 응답은 '바뀐 것' 이 아니다", () => {
        expect(shouldRefreshWatch(null, roomSetKey(["a"]))).toBe(false);
        expect(shouldRefreshWatch(null, roomSetKey([]))).toBe(false);
    });
});

describe("matchParamsKey", () => {
    const base: any = {
        id: "m1", status: "playing", gameType: "3c", tableId: "large", rules: { target: 20 }, finishType: "target", inningCap: 30,
        cushionModel: "standard", condition: "normal", aimAssist: true, fullPreview: false, shots: 3, turn: 1, version: 3, balls: null, state: null,
    };
    it("폴링으로 받은 새 객체라도 설정이 같으면 같은 키 — 렌더러가 재마운트되지 않는다", () => {
        expect(matchParamsKey({ ...base, shots: 4, version: 4, turn: 0 })).toBe(matchParamsKey({ ...base }));
    });
    it("테이블·쿠션 모델이 다르면 다른 키", () => {
        expect(matchParamsKey({ ...base, tableId: "medium" })).not.toBe(matchParamsKey(base));
        expect(matchParamsKey({ ...base, cushionModel: "lively" })).not.toBe(matchParamsKey(base));
    });
    it("없는 대전은 null", () => { expect(matchParamsKey(null)).toBeNull(); });
});
