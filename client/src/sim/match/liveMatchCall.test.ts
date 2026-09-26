import { describe, it, expect } from "vitest";
import { pickCallMatch, secondsLeft, parseCallRows, type CallMatch as MatchPublic } from "./liveMatchCall";

const m = (o: Partial<MatchPublic>): MatchPublic => ({ id: "x", status: "playing", myIndex: 0, turn: 0, shots: 0, version: 1, turnSeenAt: null, serverNow: null, opponentName: "상대", ...o });

describe("대전 호출 띠", () => {
    it("진행 중 · 내 차례인 대전만, 여럿이면 시계가 먼저 끝나는 것", () => {
        expect(pickCallMatch([m({ turn: 1 }), m({ status: "waiting" })])).toBeNull();
        const a = m({ id: "a", turnSeenAt: "2026-09-26T10:00:30.000Z" });
        const b = m({ id: "b", turnSeenAt: "2026-09-26T10:00:10.000Z" });
        const c = m({ id: "c", turnSeenAt: null });
        expect(pickCallMatch([a, c, b])?.id).toBe("b");
    });
    it("남은 초 = 시계 시작 + 40초 - 서버 시각(받은 뒤 흐른 시간 포함), 시계가 없으면 null", () => {
        const now = Date.parse("2026-09-26T10:00:00.000Z");
        const x = m({ turnSeenAt: "2026-09-26T10:01:00.000Z", serverNow: "2026-09-26T10:00:00.000Z" });
        // 1분 뒤 시계 시작 → 100초 남음. 5초 지나면 95초
        expect(secondsLeft(x, now, now)).toBe(100);
        expect(secondsLeft(x, now + 5_000, now)).toBe(95);
        expect(secondsLeft(m({ turnSeenAt: null }), now, now)).toBeNull();
        expect(secondsLeft(x, now + 500_000, now)).toBe(0);
    });
    it("응답 파싱: 상대 이름은 내 자리의 반대편, 이상한 줄은 버린다", () => {
        const rows = parseCallRows([{ id: "a", status: "playing", myIndex: 0, turn: 0, shots: 0, version: 2, hostName: "나", guestName: "김철수", turnSeenAt: null }, { nope: 1 }, null]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: "a", opponentName: "김철수", myIndex: 0 });
        expect(parseCallRows("x")).toEqual([]);
    });
});
