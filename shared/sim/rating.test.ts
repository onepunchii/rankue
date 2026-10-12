import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ratingEligibility, ratingDelta, isAtFaultLoss, ELO_K, MIN_SHOTS_EACH, parseRatingResult, ratingChangeOf } from "./rating";

describe("온라인 대전 레이팅 규칙", () => {
    it("다마수 수동 방(맞대결)은 반영하지 않는다", () => {
        expect(ratingEligibility({ handicap: false, hasGuest: true, shots: [30, 30] })).toEqual({ rated: false, reason: "manual" });
    });
    it("핸디전이라도 한쪽이 거의 안 쳤으면 반영하지 않는다(들어오자마자 기권)", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [MIN_SHOTS_EACH, MIN_SHOTS_EACH - 1] }))
            .toEqual({ rated: false, reason: "tooShort" });
    });
    it("핸디전이고 둘 다 충분히 쳤으면 반영한다", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [MIN_SHOTS_EACH, MIN_SHOTS_EACH] })).toEqual({ rated: true });
    });
    it("기대 승률 50:50 — 이기면 +K/2, 지면 -K/2, 무승부 0", () => {
        expect(ratingDelta(0)).toBe(ELO_K / 2);
        expect(ratingDelta(1)).toBe(-ELO_K / 2);
        expect(ratingDelta(null)).toBe(0);
    });
    it("같은 상대와 연달아 치면 폭이 줄어든다", () => {
        expect(ratingDelta(0, 1)).toBe(Math.round(ELO_K / 4));
        expect(ratingDelta(0, 3)).toBe(Math.round(ELO_K / 8));
    });
    it("자리 비움(시간 초과 실격·무응답 주장)은 샷이 모자라도 반영한다 — 진 사람이 한 번이라도 쳤으면", () => {
        // 게스트가 한 번 치고 떠나 시간 초과 세 번 → 방장 승
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [2, 1], endReason: "timeout", winner: 0 })).toEqual({ rated: true });
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [1, 1], endReason: "claim", winner: 1 })).toEqual({ rated: true });
        expect(isAtFaultLoss({ shots: [0, 2], endReason: "timeout", winner: 1 })).toBe(false);
    });
    it("한 번도 안 친 사람이 자리를 비운 판(노쇼)은 반영하지 않는다", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [0, 2], endReason: "timeout", winner: 1 })).toEqual({ rated: false, reason: "tooShort" });
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [2, 0], endReason: "claim", winner: 0 })).toEqual({ rated: false, reason: "tooShort" });
    });
    it("기권은 귀책 예외가 아니다(들어오자마자 기권 주고받기 방지)", () => {
        expect(ratingEligibility({ handicap: true, hasGuest: true, shots: [2, 1], endReason: "resign", winner: 0 })).toEqual({ rated: false, reason: "tooShort" });
    });
    it("맞대결(수동 다마수)은 자리 비움이어도 반영하지 않는다", () => {
        expect(ratingEligibility({ handicap: false, hasGuest: true, shots: [2, 1], endReason: "timeout", winner: 0 })).toEqual({ rated: false, reason: "manual" });
    });
});

/**
 * 그 판의 레이팅 변화(2026-10-12 — 끝난 화면의 "레이팅 +12" · "등급이 올랐어요").
 * 끝난 화면은 지금 사다리 값이 아니라 **그 판에 남긴 값**으로 그린다 — 나중에 다시 열어 본 끝난 판에서도 같아야 한다.
 */
describe("그 판의 레이팅 변화(ratingChangeOf)", () => {
    const r = (delta: number, after: [number, number], matches: [number, number]) => ({ delta, after, matches });

    it("방장은 delta 그대로, 게스트는 부호 반대 — 반영 전 = 반영 뒤 − 변화", () => {
        const res = r(12, [1042, 988], [21, 9]);
        expect(ratingChangeOf(res, 0)).toMatchObject({ delta: 12, before: 1030, after: 1042, matches: 21, tierBefore: "bronze", tierAfter: "bronze", promoted: false });
        expect(ratingChangeOf(res, 1)).toMatchObject({ delta: -12, before: 1000, after: 988, matches: 9, tierBefore: "bronze", tierAfter: "bronze", promoted: false });
    });

    it("등급이 오르면 promoted — 문턱을 넘은 그 판에서만", () => {
        expect(ratingChangeOf(r(12, [1152, 1000], [40, 40]), 0)).toMatchObject({ tierBefore: "silver", tierAfter: "gold", promoted: true });
        expect(ratingChangeOf(r(12, [1164, 1000], [41, 41]), 0)).toMatchObject({ tierBefore: "gold", tierAfter: "gold", promoted: false });
    });

    it("배치를 마치는 판에서 첫 등급을 얻는다 — 그 전에는 등급이 없다", () => {
        expect(ratingChangeOf(r(12, [1024, 976], [2, 2]), 0)).toMatchObject({ tierBefore: null, tierAfter: null, promoted: false });
        expect(ratingChangeOf(r(12, [1036, 964], [3, 3]), 0)).toMatchObject({ tierBefore: null, tierAfter: "bronze", promoted: true });
        // 졌어도 배치를 마치면 첫 등급을 받는다
        expect(ratingChangeOf(r(12, [1036, 940], [3, 3]), 1)).toMatchObject({ delta: -12, tierBefore: null, tierAfter: "iron", promoted: true });
        expect(ratingChangeOf(r(12, [1048, 928], [4, 4]), 0)).toMatchObject({ tierBefore: "bronze", tierAfter: "bronze", promoted: false });
    });

    it("내려간 것은 알리지 않는다", () => {
        expect(ratingChangeOf(r(12, [1000, 1144], [30, 30]), 1)).toMatchObject({ delta: -12, tierBefore: "gold", tierAfter: "silver", promoted: false });
    });

    it("무승부(변화 0)도 값이 있다 — 반영하지 않은 판은 null", () => {
        expect(ratingChangeOf(r(0, [1010, 1010], [5, 5]), 0)).toMatchObject({ delta: 0, before: 1010, after: 1010, promoted: false });
        expect(ratingChangeOf(null, 0)).toBeNull();
    });

    it("저장된 값은 모양을 보고 받는다 — 틀리면 없는 것으로", () => {
        expect(parseRatingResult({ delta: 12, after: [1042, 988], matches: [21, 9] })).toEqual({ delta: 12, after: [1042, 988], matches: [21, 9] });
        for (const bad of [null, undefined, "x", 3, {}, { delta: "12", after: [1, 2], matches: [1, 2] }, { delta: 1, after: [1], matches: [1, 2] }, { delta: 1, after: [1, 2], matches: [1, Number.NaN] }, { delta: 1, after: [1, 2] }]) {
            expect(parseRatingResult(bad)).toBeNull();
        }
    });

    it("서버: 반영하면서 그 판에 남기고(rating_result), 끝난 화면 응답(rapport)이 내 쪽 변화를 싣는다", () => {
        const read = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");
        const repo = read("server/storage/simMatch.repo.ts");
        expect(repo).toContain("}).returning({ rating: hiqSimMatchRatings.rating, matches: hiqSimMatchRatings.matches });");
        expect(repo).toContain("await tx.update(hiqSimMatches).set({ ratingResult: result }).where(eq(hiqSimMatches.id, m.id));");
        // 세 갈래(샷으로 끝 · 시간 초과 · 기권/무응답) 모두 돌려주는 행에 얹는다
        expect(repo.match(/ratingResult: rated \}/g)).toHaveLength(3);
        const route = read("server/routes/modules/simMatch.ts");
        expect(route).toContain('const rating = m.status === "finished" ? ratingChangeOf(parseRatingResult(m.ratingResult), myIndex, PLACEMENT_MATCHES) : null;');
        // cup: 월대회 판인가(2026-10-12) — 끝난 화면이 대진표로 가는 길을 낸다
        expect(route).toContain("return sendSuccess(res, { opponentId: otherId, opponentName: otherName, headToHead, isRival, rating, cup: !!m.cupGameId });");
        expect(read("shared/schema.ts")).toContain('ratingResult: jsonb("rating_result"),');
        expect(read("migrations/sim_match_rating_result.sql")).toContain("ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS rating_result jsonb;");
    });
});

/**
 * 이름 옆 등급 배지(2026-10-12 — 순서의 2번): 대전 응답이 두 선수의 등급을 싣는다. 배치 전인 사람은 등급이 없다.
 */
describe("대전 응답의 등급(tiers)", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");

    it("서버: 이 대전의 종목에서 두 사람의 레이팅 · 판 수를 같이 읽고, 배치를 마친 사람만 등급을 준다", () => {
        const repo = read("server/storage/simMatch.repo.ts");
        expect(repo).toContain(".leftJoin(hostLadder, and(eq(hostLadder.memberId, hiqSimMatches.hostId), eq(hostLadder.gameType, hiqSimMatches.gameType)))");
        expect(repo).toContain(".leftJoin(guestLadder, and(eq(guestLadder.memberId, hiqSimMatches.guestId), eq(guestLadder.gameType, hiqSimMatches.gameType)))");
        // 줄을 대전 행으로 바꾸는 곳은 한 군데(named)다 — 다섯 곳에 따로 적혀 있던 것을 모았다
        expect(repo.match(/hostCountry: r\.hostCountry \?\? null/g)).toHaveLength(1);
        const route = read("server/routes/modules/simMatch.ts");
        expect(route).toContain('return typeof rating === "number" && (rated ?? 0) >= PLACEMENT_MATCHES ? tierFor(rating).id : null;');
        expect(route).toContain("tiers: [tierIdOf(m.hostRating, m.hostRated), m.guestId ? tierIdOf(m.guestRating, m.guestRated) : null] as const,");
    });

    it("화면: 응답 → 대전 상태 → 방 목록 · 대전 시작 · 대전 헤더 · 관전 헤더", () => {
        expect(read("client/src/sim/matchApi.ts")).toContain("tiers: Array.isArray(raw.tiers) ? [tierOrNull(raw.tiers[0]), tierOrNull(raw.tiers[1])] : [null, null],");
        expect(read("client/src/sim/simReducer.ts")).toContain("tiers: [m.tiers?.[0] ?? null, m.tiers?.[1] ?? null] as const,");
        expect(read("client/src/sim/useSimulator.ts")).toContain("tiers: m.tiers ?? [null, null],");
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain("tier: m.tiers[i] ?? null,");
        expect(page).toContain("tiers={sim.match.tiers}");
        expect(read("client/src/sim/watch/WatchPage.tsx")).toContain("tier: match.tiers?.[i] ?? null,");
        expect(read("client/src/sim/match/MatchIntro.tsx")).toContain("{tiers?.[i] && <TierEmblem tier={tiers[i]!} size={46} glow />}");
        expect(read("client/src/sim/components/TopBar.tsx")).toContain("{pl.tier && <TierEmblem tier={pl.tier} size={18} />}");
    });
});
