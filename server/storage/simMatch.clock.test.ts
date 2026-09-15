import { describe, expect, it } from "vitest";
import { nextTurnSeenAt } from "./simMatch.repo";
import { ABSENT_GRACE_MS, PRESENCE_MS, REPLAY_GRACE_MS } from "../../shared/sim/rules/session";

/**
 * 40초 시계가 "언제 시작하는가" — 2026-09-15 오너 제보("상대가 앱을 끄면 시간이 아예 안 흘러간다")의 회귀 테스트.
 * 예전에는 자리를 비운 사람에게 차례가 가면 null 을 돌려줘 시계가 영영 시작되지 않았고, 남은 사람은 48시간을 기다렸다.
 */
const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const at = (msAgo: number) => new Date(NOW - msAgo);

describe("nextTurnSeenAt", () => {
    it("접속 중인 사람에게 넘어가면 재생 여유 뒤에 시작한다", () => {
        const t = nextTurnSeenAt({ hostSeenAt: at(1_000), guestSeenAt: null }, 0, false, REPLAY_GRACE_MS, NOW);
        expect(t!.getTime()).toBe(NOW + REPLAY_GRACE_MS);
    });

    it("자리를 비운 사람에게 넘어가도 시계는 시작한다 — 이탈 유예 뒤", () => {
        // 앱을 끈 지 오래된 게스트에게 차례가 넘어간 경우
        const t = nextTurnSeenAt({ hostSeenAt: at(1_000), guestSeenAt: at(PRESENCE_MS + 5_000) }, 1, false, REPLAY_GRACE_MS, NOW);
        expect(t).not.toBeNull();
        expect(t!.getTime()).toBe(NOW + ABSENT_GRACE_MS);
    });

    it("한 번도 접속한 적 없는 사람도 마찬가지다", () => {
        const t = nextTurnSeenAt({ hostSeenAt: null, guestSeenAt: null }, 1, false, 0, NOW);
        expect(t!.getTime()).toBe(NOW + ABSENT_GRACE_MS);
    });

    it("이탈 유예는 재생 여유보다 길다 — 푸시를 보고 돌아올 시간이라서", () => {
        expect(ABSENT_GRACE_MS).toBeGreaterThan(REPLAY_GRACE_MS);
    });

    it("접속 판정 경계: PRESENCE_MS 안이면 접속 중이다", () => {
        const inside = nextTurnSeenAt({ hostSeenAt: at(PRESENCE_MS - 1_000), guestSeenAt: null }, 0, false, REPLAY_GRACE_MS, NOW);
        expect(inside!.getTime()).toBe(NOW + REPLAY_GRACE_MS);
    });

    it("끝난 대전은 셀 시계가 없다", () => {
        expect(nextTurnSeenAt({ hostSeenAt: at(1_000), guestSeenAt: at(1_000) }, 0, true, REPLAY_GRACE_MS, NOW)).toBeNull();
    });
});
