/**
 * 골프 관리 · 라운드(2026-10-01) — DB 없이 확인하는 규칙들: 멈춘 방 판정, 참가자·홀 요약, 현장 인증 요약,
 * 거르기 파싱, 점수판 줄, 무효화 뒤 평균 다시 세기(공식 라운드가 다 빠지면 기본값으로).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db.js", () => ({ db: {} }));

import {
    staleKindOf, summarizePlayers, historyVerdict, checkinVerdict, parseListQuery, escapeLike, scorecardOf, recountMembers,
    STALE_WAITING_HOURS, STALE_PLAYING_HOURS, GOLF_STAT_DEFAULTS,
} from "./adminGolfRounds.js";
import { DEFAULT_PAR } from "../../shared/golfMatch.js";
import { hiqMembers } from "../../shared/schema.js";

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000);
const M1 = "11111111-1111-1111-1111-111111111111";
const M2 = "22222222-2222-2222-2222-222222222222";

describe("staleKindOf — 멈춘 방", () => {
    it("대기방은 만든 지 6시간이 지나면(핀이 죽는다)", () => {
        expect(staleKindOf({ status: "waiting", createdAt: hoursAgo(STALE_WAITING_HOURS + 0.1), updatedAt: hoursAgo(0) }, NOW)).toBe("waiting");
        expect(staleKindOf({ status: "waiting", createdAt: hoursAgo(STALE_WAITING_HOURS - 0.1), updatedAt: hoursAgo(0) }, NOW)).toBeNull();
    });
    it("진행 중 방은 마지막으로 손댄 지 12시간 — 오래전에 만들었어도 방금 적었으면 멈춘 게 아니다", () => {
        expect(staleKindOf({ status: "playing", createdAt: hoursAgo(48), updatedAt: hoursAgo(STALE_PLAYING_HOURS + 1) }, NOW)).toBe("playing");
        expect(staleKindOf({ status: "playing", createdAt: hoursAgo(48), updatedAt: hoursAgo(1) }, NOW)).toBeNull();
    });
    it("끝난·접은 방은 멈춘 방이 아니다, 시각을 모르면 판단하지 않는다", () => {
        expect(staleKindOf({ status: "finished", createdAt: hoursAgo(500), updatedAt: hoursAgo(500) }, NOW)).toBeNull();
        expect(staleKindOf({ status: "abandoned", createdAt: hoursAgo(500), updatedAt: hoursAgo(500) }, NOW)).toBeNull();
        expect(staleKindOf({ status: "waiting", createdAt: null, updatedAt: null }, NOW)).toBeNull();
        expect(staleKindOf({ status: "waiting", createdAt: hoursAgo(7).toISOString(), updatedAt: null }, NOW)).toBe("waiting");
    });
});

describe("summarizePlayers — 회원·게스트·적힌 홀", () => {
    const blank = () => new Array(18).fill(0);
    it("게스트는 guest- 접두어나 isGuest 표시로 센다", () => {
        const s = summarizePlayers([
            { memberId: M1, scores: blank() },
            { memberId: "guest-abcd1234", isGuest: true, scores: blank() },
            { memberId: "guest-ffff0000", scores: blank() },
        ]);
        expect([s.members, s.guests]).toEqual([1, 2]);
    });
    it("홀은 누구든 한 명이라도 적었으면 적힌 홀 — 0·범위 밖·글자는 안 적은 것", () => {
        const a = blank(); a[0] = 4; a[1] = 16; a[2] = 0;
        const b = blank(); b[2] = 5; b[17] = 3; (b as any)[5] = "x";
        expect(summarizePlayers([{ memberId: M1, scores: a }, { memberId: M2, scores: b }]).holesEntered).toBe(3);
    });
    it("모양이 틀린 입력도 죽지 않는다", () => {
        expect(summarizePlayers(null)).toEqual({ members: 0, guests: 0, holesEntered: 0 });
        expect(summarizePlayers([{ memberId: M1 }]).holesEntered).toBe(0);
    });
});

describe("현장 인증 요약", () => {
    it("끝난 경기 — 기록의 on_site: 인증 > 미인증 > 옛 기록 > 없음", () => {
        expect(historyVerdict({ onsite: 1, unverified: 1, legacy: 0 })).toBe("onsite");
        expect(historyVerdict({ onsite: 0, unverified: 2, legacy: 0 })).toBe("unverified");
        expect(historyVerdict({ onsite: 0, unverified: 0, legacy: 2 })).toBe("legacy");
        expect(historyVerdict({ onsite: 0, unverified: 0, legacy: 0 })).toBe("none");
    });
    it("진행 중 — 그 경기 실제 회원의 확인만 센다(묶어 센 n 도 받는다)", () => {
        const rows = [
            { memberId: M1, verified: false, n: 3 },
            { memberId: "33333333-3333-3333-3333-333333333333", verified: true, n: 1 }, // 경기 밖 번호
        ];
        expect(checkinVerdict(rows, [M1, M2])).toEqual({ verdict: "tried", total: 3, verified: 0 });
        expect(checkinVerdict([...rows, { memberId: M2, verified: true }], [M1, M2])).toEqual({ verdict: "verified", total: 4, verified: 1 });
        expect(checkinVerdict([], [M1]).verdict).toBe("none");
    });
});

describe("parseListQuery", () => {
    it("기본값과 상한", () => {
        expect(parseListQuery({})).toEqual({ status: null, stale: false, days: 0, q: "", limit: 30, offset: 0 });
        expect(parseListQuery({ limit: "999", offset: "-5", days: "abc" })).toMatchObject({ limit: 100, offset: 0, days: 0 });
    });
    it("모르는 상태는 거르지 않는다, stale 은 1·true 만", () => {
        expect(parseListQuery({ status: "playing", stale: "1" })).toMatchObject({ status: "playing", stale: true });
        expect(parseListQuery({ status: "deleted", stale: "yes" })).toMatchObject({ status: null, stale: false });
    });
    it("검색어는 다듬고 60자까지", () => {
        expect(parseListQuery({ q: "  동강  " }).q).toBe("동강");
        expect(parseListQuery({ q: "가".repeat(80) }).q.length).toBe(60);
        expect(parseListQuery({ q: ["a", "b"] }).q).toBe("");
    });
    it("LIKE 특수문자는 글자 그대로", () => {
        expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
    });
});

describe("scorecardOf — 점수판 한 줄", () => {
    it("전반·후반·합계·파 대비", () => {
        const scores = [...DEFAULT_PAR].map((p, i) => (i === 0 ? p + 1 : p)); // 1번 홀 보기, 나머지 파
        const c = scorecardOf(scores, DEFAULT_PAR);
        expect(c.out + c.in).toBe(c.strokes);
        expect(c.strokes).toBe(DEFAULT_PAR.reduce((a, b) => a + b, 0) + 1);
        expect([c.relative, c.holesPlayed, c.complete]).toEqual([1, 18, true]);
    });
    it("덜 친 라운드는 친 홀만 — 모양이 틀린 점수는 빈 줄", () => {
        const part = new Array(18).fill(0); part[0] = 3; part[9] = 6;
        expect(scorecardOf(part, DEFAULT_PAR)).toMatchObject({ out: 3, in: 6, strokes: 9, holesPlayed: 2, complete: false });
        expect(scorecardOf("nope", DEFAULT_PAR)).toMatchObject({ strokes: 0, holesPlayed: 0, complete: false });
    });
});

describe("recountMembers — 무효화 뒤 평균 다시 세기", () => {
    it("updateGolfStats 가 null(공식 라운드 없음)이면 기본값으로 되돌린다, 값이 있으면 그대로", async () => {
        const recompute = vi.fn(async (id: string) => (id === M1 ? null : { avgScore: "88.0" }));
        const reset = vi.fn(async () => true);
        const out = await recountMembers([M1, M2, M1], recompute, reset);
        expect(recompute).toHaveBeenCalledTimes(2); // 같은 회원은 한 번
        expect(reset.mock.calls).toEqual([[M1]]);
        expect(out.get(M1)).toEqual({ reset: true, error: null });
        expect(out.get(M2)).toEqual({ reset: false, error: null });
    });
    it("한 명이 실패해도 다음 사람은 센다 — 실패한 사람은 되돌리지 않고 오류를 적는다", async () => {
        const recompute = vi.fn(async (id: string) => { if (id === M1) throw new Error("boom"); return null; });
        const reset = vi.fn(async () => false);
        const out = await recountMembers([M1, M2], recompute, reset);
        expect(out.get(M1)).toEqual({ reset: false, error: "boom" });
        expect(reset.mock.calls).toEqual([[M2]]);
        expect(out.get(M2)).toEqual({ reset: false, error: null });
    });
    it("되돌리는 값은 스키마 기본값 그대로(평균·베스트 0, 등급 없음, 라운드 0)", () => {
        expect(GOLF_STAT_DEFAULTS).toEqual({ golfAvgScore: 0, golfBestScore: 0, golfGrade: null, totalGolfGames: 0 });
        expect(hiqMembers.golfAvgScore.default).toBe(GOLF_STAT_DEFAULTS.golfAvgScore);
        expect(hiqMembers.golfBestScore.default).toBe(GOLF_STAT_DEFAULTS.golfBestScore);
        expect(hiqMembers.totalGolfGames.default).toBe(GOLF_STAT_DEFAULTS.totalGolfGames);
        expect([hiqMembers.golfGrade.hasDefault, hiqMembers.golfGrade.notNull]).toEqual([false, false]); // 기본값이 없는 칸 = null
    });
});
