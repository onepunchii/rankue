/**
 * 관전 허용 규칙. 공개 방이고 비밀번호가 없는 대전만 참가자 아닌 사람에게 열린다.
 * 비밀번호 방은 그들끼리 치겠다는 뜻이고, 대기 중(waiting)인 방은 관전할 것이 아직 없다(참가 대상이다).
 */
import { describe, it, expect } from "vitest";
import { isWatchable } from "./simMatch.js";

const m = (o: Partial<{ isPublic: boolean; passwordHash: string | null; status: string }>) =>
    ({ isPublic: true, passwordHash: null, status: "playing", ...o });

describe("isWatchable", () => {
    it("공개·비밀번호 없음·진행 중 → 관전 가능", () => {
        expect(isWatchable(m({}))).toBe(true);
    });
    it("끝난 대전도 다시보기로 열린다", () => {
        expect(isWatchable(m({ status: "finished" }))).toBe(true);
    });
    it("비공개 방은 막는다", () => {
        expect(isWatchable(m({ isPublic: false }))).toBe(false);
    });
    it("비밀번호 방은 막는다", () => {
        expect(isWatchable(m({ passwordHash: "salt:hash" }))).toBe(false);
    });
    it("대기 중·취소된 방은 관전 대상이 아니다", () => {
        expect(isWatchable(m({ status: "waiting" }))).toBe(false);
        expect(isWatchable(m({ status: "canceled" }))).toBe(false);
    });
});
