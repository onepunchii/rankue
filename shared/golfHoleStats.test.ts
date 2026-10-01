import { describe, it, expect } from "vitest";
import {
    blankHoleStats, readHoleStats, sanitizeHolePatch, sanitizeHolePatches, applyHolePatches, hasAnyHoleStats,
    fairwayApplies, puttsFit, greenInRegulation, withoutHoleStats, lastTimeByHole, summarizeHoleStats, roundHoleSummary,
    MAX_PUTTS, type RoundHoleData, type HoleStats,
} from "./golfHoleStats";

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const KNOWN = new Array(18).fill(true);

function round(over: Partial<RoundHoleData> & { stats?: HoleStats } = {}): RoundHoleData {
    const st = over.stats ?? blankHoleStats();
    return {
        sessionId: over.sessionId ?? "s1",
        scores: over.scores ?? PARS.slice(),
        pars: over.pars ?? PARS,
        parKnown: over.parKnown ?? KNOWN,
        putts: over.putts ?? st.putts,
        fairway: over.fairway ?? st.fairway,
        penaltyTags: over.penaltyTags ?? st.penaltyTags,
    };
}

describe("그린 적중(GIR) — 타수 − 퍼팅 ≤ 파 − 2", () => {
    it("파4 파(4타 2퍼트)는 적중, 보기(5타 2퍼트)는 아님", () => {
        expect(greenInRegulation(4, 2, 4)).toBe(true);
        expect(greenInRegulation(5, 2, 4)).toBe(false);
        expect(greenInRegulation(5, 3, 4)).toBe(true); // 2온 3퍼트 보기도 적중
    });
    it("파3 은 1타, 파5 는 3타 안에 올려야 한다", () => {
        expect(greenInRegulation(3, 2, 3)).toBe(true);
        expect(greenInRegulation(4, 2, 3)).toBe(false);
        expect(greenInRegulation(5, 2, 5)).toBe(true);
        expect(greenInRegulation(6, 2, 5)).toBe(false);
    });
    it("칩인(퍼팅 0): 그린 밖에서 넣은 버디는 적중이 아니고, 샷 이글은 적중", () => {
        expect(greenInRegulation(3, 0, 4)).toBe(false);
        expect(greenInRegulation(2, 0, 4)).toBe(true);
    });
    it("퍼팅을 안 적었거나 파를 모르면 모른다(null) — 추정 파로 적중을 지어내지 않는다", () => {
        expect(greenInRegulation(4, null, 4)).toBeNull();
        expect(greenInRegulation(4, undefined, 4)).toBeNull();
        expect(greenInRegulation(4, 2, 4, false)).toBeNull();
    });
    it("퍼팅이 타수 이상이면(티샷은 퍼팅이 아니다) 모른다", () => {
        expect(puttsFit(3, 2)).toBe(true);
        expect(puttsFit(3, 3)).toBe(false);
        expect(puttsFit(0, 0)).toBe(false); // 안 친 홀
        expect(greenInRegulation(3, 3, 4)).toBeNull();
        expect(greenInRegulation(2, 4, 4)).toBeNull();
    });
});

describe("페어웨이 칸은 파4·파5 에만", () => {
    it("파3 는 없고, 파를 모르면 보여 준다", () => {
        expect(fairwayApplies(3, true)).toBe(false);
        expect(fairwayApplies(4, true)).toBe(true);
        expect(fairwayApplies(5, true)).toBe(true);
        expect(fairwayApplies(3, false)).toBe(true);
    });
});

describe("저장 검증(sanitizeHolePatch)", () => {
    it("맞는 한 홀은 통과, 빈 값은 null·[] 로", () => {
        expect(sanitizeHolePatch({ holeNo: 1, putts: 2, fairway: "H", penaltyTags: ["ob"] }))
            .toEqual({ holeNo: 1, putts: 2, fairway: "H", penaltyTags: ["ob"] });
        expect(sanitizeHolePatch({ holeNo: 18 })).toEqual({ holeNo: 18, putts: null, fairway: null, penaltyTags: [] });
        expect(sanitizeHolePatch({ holeNo: 3, putts: 0 })?.putts).toBe(0); // 칩인
    });
    it("홀 번호는 1~18 정수만", () => {
        for (const holeNo of [0, 19, 1.5, "3", null, undefined]) expect(sanitizeHolePatch({ holeNo, putts: 2 })).toBeNull();
    });
    it("퍼팅은 0~9 정수만(문자열·음수·소수 거절)", () => {
        for (const putts of [-1, MAX_PUTTS + 1, 2.5, "2", true]) expect(sanitizeHolePatch({ holeNo: 1, putts })).toBeNull();
        expect(sanitizeHolePatch({ holeNo: 1, putts: MAX_PUTTS })?.putts).toBe(MAX_PUTTS);
    });
    it("페어웨이는 L·H·R 만", () => {
        for (const fairway of ["X", "h", 1, ["H"]]) expect(sanitizeHolePatch({ holeNo: 1, fairway })).toBeNull();
    });
    it("태그는 ob·hazard·bunker 만, 중복은 하나로, 정해진 순서로", () => {
        expect(sanitizeHolePatch({ holeNo: 1, penaltyTags: ["water"] })).toBeNull();
        expect(sanitizeHolePatch({ holeNo: 1, penaltyTags: "ob" })).toBeNull();
        expect(sanitizeHolePatch({ holeNo: 1, penaltyTags: ["bunker", "ob", "ob"] })?.penaltyTags).toEqual(["ob", "bunker"]);
        expect(sanitizeHolePatch({ holeNo: 1, penaltyTags: ["ob", "ob", "ob", "ob"] })).toBeNull(); // 너무 길면 거절
    });
    it("요청 전체는 1~18개, 같은 홀은 뒤의 것, 하나라도 틀리면 통째로 거절", () => {
        expect(sanitizeHolePatches([])).toBeNull();
        expect(sanitizeHolePatches(new Array(19).fill({ holeNo: 1 }))).toBeNull();
        expect(sanitizeHolePatches({ holeNo: 1 })).toBeNull();
        expect(sanitizeHolePatches([{ holeNo: 2, putts: 1 }, { holeNo: 2, putts: 3 }])).toEqual([{ holeNo: 2, putts: 3, fairway: null, penaltyTags: [] }]);
        expect(sanitizeHolePatches([{ holeNo: 2, putts: 1 }, { holeNo: 3, putts: -1 }])).toBeNull();
    });
});

describe("읽기·고치기", () => {
    it("칸이 없는 옛 경기는 빈 기록, 틀린 홀 하나만 비운다", () => {
        expect(readHoleStats({ memberId: "a", scores: [] })).toEqual(blankHoleStats());
        expect(readHoleStats(null)).toEqual(blankHoleStats());
        const putts = new Array(18).fill(2); putts[4] = "2"; putts[5] = 99;
        const fairway = new Array(18).fill("H"); fairway[0] = "Q";
        const tags: unknown[] = Array.from({ length: 18 }, () => []); tags[1] = ["ob", "junk"]; tags[2] = "ob";
        const s = readHoleStats({ putts, fairway, penaltyTags: tags });
        expect(s.putts[0]).toBe(2);
        expect(s.putts[4]).toBeNull();
        expect(s.putts[5]).toBeNull();
        expect(s.fairway[0]).toBeNull();
        expect(s.fairway[1]).toBe("H");
        expect(s.penaltyTags[1]).toEqual(["ob"]);
        expect(s.penaltyTags[2]).toEqual([]);
        expect(readHoleStats({ putts: [1, 2] }).putts.every((v) => v === null)).toBe(true); // 길이가 틀리면 칸 전체를 비운다
    });
    it("고친 홀만 바뀌고 원본은 그대로(교체라 두 번 보내도 같다)", () => {
        const base = blankHoleStats();
        const p = { holeNo: 5, putts: 2, fairway: "L" as const, penaltyTags: ["ob" as const] };
        const once = applyHolePatches(base, [p]);
        expect(once.putts[4]).toBe(2);
        expect(once.fairway[4]).toBe("L");
        expect(once.penaltyTags[4]).toEqual(["ob"]);
        expect(base.putts[4]).toBeNull();
        expect(applyHolePatches(once, [p])).toEqual(once);
        const cleared = applyHolePatches(once, [{ holeNo: 5, putts: null, fairway: null, penaltyTags: [] }]);
        expect(hasAnyHoleStats(cleared)).toBe(false);
        expect(hasAnyHoleStats(once)).toBe(true);
    });
});

describe("경기 응답에서 걷어 내기(withoutHoleStats)", () => {
    it("모든 선수의 기록 칸만 빼고 점수·벌타·이름은 남긴다", () => {
        const s = {
            id: "x",
            players: [
                { memberId: "a", name: "A", scores: [4], penalties: [{ ob: true }], putts: [2], fairway: ["H"], penaltyTags: [["ob"]] },
                { memberId: "b", name: "B", scores: [5] },
            ],
        };
        const out = withoutHoleStats(s);
        expect(out.players[0]).toEqual({ memberId: "a", name: "A", scores: [4], penalties: [{ ob: true }] });
        expect(out.players[1]).toBe(s.players[1]);
        expect(s.players[0]).toHaveProperty("putts"); // 원본은 건드리지 않는다
    });
    it("걷을 게 없으면 같은 객체, 이상한 값도 그대로 통과", () => {
        const s = { players: [{ memberId: "a" }] };
        expect(withoutHoleStats(s)).toBe(s);
        expect(withoutHoleStats(null)).toBeNull();
        expect(withoutHoleStats({ players: "x" })).toEqual({ players: "x" });
    });
});

describe("지난번 이 홀(lastTimeByHole)", () => {
    const scores = (fill: Record<number, number>) => { const a = new Array(18).fill(0); for (const [k, v] of Object.entries(fill)) a[Number(k)] = v; return a; };

    it("같은 코스·같은 반쪽의 같은 홀, 가장 최근 것", () => {
        const out = lastTimeByHole({ frontCourseName: "Lake", backCourseName: "Hill" }, [
            { frontCourseName: "Lake", backCourseName: "Hill", scores: scores({ 2: 5, 11: 4 }), playedAt: "2026-09-20" },
            { frontCourseName: "Lake", backCourseName: "Hill", scores: scores({ 2: 3 }), playedAt: "2026-09-01" },
        ]);
        expect(out[2]).toEqual({ strokes: 5, playedAt: "2026-09-20" });
        expect(out[11]).toEqual({ strokes: 4, playedAt: "2026-09-20" });
        expect(out[0]).toBeNull();
    });
    it("지난번에 그 코스를 반대쪽(후반)에 쳤어도 같은 홀로 친다", () => {
        const out = lastTimeByHole({ frontCourseName: "Lake", backCourseName: "Hill" }, [
            { frontCourseName: "Hill", backCourseName: "Lake", scores: scores({ 11: 6, 2: 3 }), playedAt: "2026-09-20" },
        ]);
        expect(out[2]).toEqual({ strokes: 6, playedAt: "2026-09-20" }); // 오늘 전반 Lake 3번 = 지난번 후반 Lake 3번(12번째 칸)
        expect(out[11]).toEqual({ strokes: 3, playedAt: "2026-09-20" }); // 오늘 후반 Hill 3번 = 지난번 전반 Hill 3번
    });
    it("그 홀을 안 친 라운드는 건너뛰고 그 전 라운드를 본다", () => {
        const out = lastTimeByHole({ frontCourseName: "Lake", backCourseName: null }, [
            { frontCourseName: "Lake", backCourseName: null, scores: scores({ 0: 4 }), playedAt: "new" },
            { frontCourseName: "Lake", backCourseName: null, scores: scores({ 0: 4, 5: 7 }), playedAt: "old" },
        ]);
        expect(out[5]).toEqual({ strokes: 7, playedAt: "old" });
    });
    it("코스 이름이 없는 골프장은 이름 없는 반쪽끼리 홀 번호로만, 이름 있는 쪽과는 섞지 않는다", () => {
        const past = [
            { frontCourseName: "East", backCourseName: null, scores: scores({ 3: 9, 12: 5 }), playedAt: "p1" },
        ];
        const out = lastTimeByHole({ frontCourseName: null, backCourseName: null }, past);
        expect(out[3]).toBeNull();
        expect(out[12]).toEqual({ strokes: 5, playedAt: "p1" });
        expect(lastTimeByHole({ frontCourseName: "  ", backCourseName: "" }, past)[12]).toEqual({ strokes: 5, playedAt: "p1" });
    });
    it("지난 기록이 없으면 전부 null", () => {
        expect(lastTimeByHole({ frontCourseName: "A", backCourseName: "B" }, []).every((x) => x === null)).toBe(true);
    });
});

describe("라운딩 리포트 통계(summarizeHoleStats)", () => {
    it("적은 홀·라운드만 센다 — 안 적은 라운드는 분모에도 없다", () => {
        const st = blankHoleStats();
        // 파4 1번: 4타 2퍼트(적중)·안착 · 파4 2번: 5타 3퍼트(적중, 3퍼트)·왼쪽 · 파3 3번: 4타 2퍼트(미스)
        const scores = PARS.slice(); scores[1] = 5; scores[2] = 4;
        st.putts[0] = 2; st.fairway[0] = "H";
        st.putts[1] = 3; st.fairway[1] = "L";
        st.putts[2] = 2;
        st.penaltyTags[4] = ["ob", "hazard"];
        const sum = summarizeHoleStats([round({ stats: st, scores }), round({ sessionId: "empty" })]);
        expect(sum.rounds).toBe(1);
        expect(sum.putts).toMatchObject({ holes: 3, total: 7, threePutts: 1 });
        expect(sum.putts!.perHole).toBeCloseTo(7 / 3);
        expect(sum.putts!.per18).toBeCloseTo((7 / 3) * 18);
        expect(sum.gir).toEqual({ holes: 3, hit: 2, rate: 2 / 3 });
        expect(sum.fairway).toEqual({ holes: 2, hit: 1, miss: 1, left: 1, right: 0, rate: 0.5 });
        expect(sum.ob).toEqual({ total: 1, perRound: 1 });
    });
    it("숫자가 안 맞는 퍼팅(퍼팅 ≥ 타수)은 퍼팅·적중 둘 다에서 뺀다", () => {
        const st = blankHoleStats();
        st.putts[0] = 4; // 4타에 4퍼트 — 불가능
        const sum = summarizeHoleStats([round({ stats: st })]);
        expect(sum.rounds).toBe(1);
        expect(sum.putts).toBeNull();
        expect(sum.gir).toBeNull();
    });
    it("파를 모르는 홀은 적중에서 빼고, 파를 아는 파3 에 적힌 페어웨이는 세지 않는다", () => {
        const st = blankHoleStats();
        st.putts[0] = 2; st.putts[2] = 2; // 파3 3타 2퍼트 = 1온 → 적중
        st.fairway[2] = "H"; // 파3 — 칸이 없는 홀(코스를 바꿔 파가 달라진 경우)
        st.fairway[3] = "R";
        const known = KNOWN.slice(); known[0] = false;
        const sum = summarizeHoleStats([round({ stats: st, parKnown: known })]);
        expect(sum.putts!.holes).toBe(2);
        expect(sum.gir).toEqual({ holes: 1, hit: 1, rate: 1 });
        expect(sum.fairway).toEqual({ holes: 1, hit: 0, miss: 1, left: 0, right: 1, rate: 0 });
    });

    it("러프(M)는 빗나감으로 센다 — 2026-10-01 화면은 페어웨이·러프 둘만 적는다", () => {
        expect(sanitizeHolePatch({ holeNo: 4, fairway: "M" })?.fairway).toBe("M");
        const fairway: (string | null)[] = new Array(18).fill(null); fairway[0] = "H"; fairway[1] = "M"; fairway[2] = "M";
        const st = readHoleStats({ fairway });
        expect(st.fairway.slice(0, 3)).toEqual(["H", "M", "M"]);
        const sum = summarizeHoleStats([{
            sessionId: "s", scores: new Array(18).fill(4), pars: new Array(18).fill(4), parKnown: new Array(18).fill(true),
            putts: new Array(18).fill(null), fairway: st.fairway, penaltyTags: st.penaltyTags,
        }]);
        expect(sum.fairway).toEqual({ holes: 3, hit: 1, miss: 2, left: 0, right: 0, rate: 1 / 3 });
    });
    it("벌타 태그를 한 번도 안 쓴 사람의 OB 는 0 이 아니라 모름(null)", () => {
        const st = blankHoleStats();
        st.putts[0] = 2;
        expect(summarizeHoleStats([round({ stats: st })]).ob).toBeNull();
        st.penaltyTags[3] = ["bunker"];
        expect(summarizeHoleStats([round({ stats: st }), round({ stats: st, sessionId: "s2" })]).ob).toEqual({ total: 0, perRound: 0 });
    });
    it("아무것도 없으면 전부 비고 0라운드", () => {
        expect(summarizeHoleStats([])).toEqual({ rounds: 0, putts: null, fairway: null, gir: null, ob: null });
    });
    it("라운드 한 판 요약 — 기록 상세 스코어카드의 퍼트 줄·적중", () => {
        const st = blankHoleStats();
        st.putts[0] = 2; st.putts[1] = 5;
        const one = roundHoleSummary(round({ stats: st }));
        expect(one).toMatchObject({ putts: 2, puttHoles: 1, girHit: 1, girHoles: 1 });
        expect(one.gir[0]).toBe(true);
        expect(one.gir[1]).toBeNull();
        expect(one.countedPutts[1]).toBeNull();
    });
});
