import { describe, it, expect } from "vitest";
import {
    STASH_PREFIX, STASH_TTL_MS, STASH_KNOWN_MAX, clearStash, pickRestore, pruneStashes, readStash, rowFingerprint, stashKey,
    stateFingerprint, withKnown, writeStash, type BoardStash, type StorageLike,
} from "./scoreboardStash";

function mem(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => { map.set(k, v); },
        removeItem: (k) => { map.delete(k); },
        get length() { return map.size; },
        key: (i) => [...map.keys()][i] ?? null,
    };
}

const state = (over: Record<string, unknown> = {}) => ({
    p1Score: 3, p2Score: 1, p3Score: 0, p4Score: 0,
    p1HighRun: 3, p2HighRun: 1, p3HighRun: 0, p4HighRun: 0,
    p1Innings: [3], p2Innings: [1], p3Innings: [], p4Innings: [],
    p1FinishScore: 0, p2FinishScore: 0, p3FinishScore: 0, p4FinishScore: 0,
    p1Run: 0, p2Run: 0, p3Run: 0, p4Run: 0,
    innings: 2, currentTurn: 1, breaker: 1,
    ...over,
});
/** 위 상태를 PATCH 로 보냈을 때 서버에 남는 행(routes/game.ts 화이트리스트 칸) */
const rowOf = (s: ReturnType<typeof state>) => ({
    player1Score: s.p1Score, player2Score: s.p2Score, player3Score: s.p3Score, player4Score: s.p4Score,
    player1HighRun: s.p1HighRun, player2HighRun: s.p2HighRun, player3HighRun: s.p3HighRun, player4HighRun: s.p4HighRun,
    player1Innings: s.p1Innings, player2Innings: s.p2Innings, player3Innings: s.p3Innings, player4Innings: s.p4Innings,
    totalInnings: s.innings,
    finishProgress: { 1: s.p1FinishScore, 2: s.p2FinishScore, 3: s.p3FinishScore, 4: s.p4FinishScore } as Record<string, number>,
    breakPlayer: s.breaker,
});

describe("지문 — 보낸 상태와 서버 행이 같은 값이 된다", () => {
    it("PATCH 로 보낸 상태 → 서버 행의 지문이 같다", () => {
        const s = state();
        expect(rowFingerprint(rowOf(s))).toBe(stateFingerprint(s));
    });
    it("옛 행(이닝 배열 null · 마무리 없음 · 초구 칸 없음)은 빈 배열 · 0 · 초구 1 로 본다", () => {
        const s = state({ p1Score: 0, p2Score: 0, p1HighRun: 0, p2HighRun: 0, p1Innings: [], p2Innings: [], innings: 1 });
        const old = { ...rowOf(s), player1Innings: null, player2Innings: null, finishProgress: null, breakPlayer: undefined };
        expect(rowFingerprint(old)).toBe(stateFingerprint(s));
    });
    it("점수 · 이닝 배열 · 마무리 · 초구 중 하나만 달라도 다르다", () => {
        const base = stateFingerprint(state());
        expect(stateFingerprint(state({ p2Score: 2 }))).not.toBe(base);
        expect(stateFingerprint(state({ p1Innings: [3, 0] }))).not.toBe(base);
        expect(stateFingerprint(state({ p1FinishScore: 1 }))).not.toBe(base);
        expect(stateFingerprint(state({ breaker: 2 }))).not.toBe(base);
        // 서버가 받지 않는 칸(진행 중 점수 · 차례)은 지문에 없다 — 서버 행엔 그 값이 없으니 비교할 수 없다
        expect(stateFingerprint(state({ p1Run: 2, currentTurn: 2 }))).toBe(base);
    });
});

describe("되살리기 — 보내지 못한 변경이 있고 서버가 이 기기의 것 그대로일 때만", () => {
    const now = 1_800_000_000_000;
    const acked = state();
    const latest = state({ p1Score: 5, p1HighRun: 5, p1Run: 2, p1Innings: [3], innings: 2 });
    const stash = (over: Partial<BoardStash<ReturnType<typeof state>>> = {}): BoardStash<ReturnType<typeof state>> => ({
        v: 1, seq: 7, ackedSeq: 5, at: now - 60_000, state: latest, known: [stateFingerprint(acked)], ...over,
    });

    it("앱이 꺼진 동안 못 보낸 점수 — 서버는 마지막 성공 저장 그대로 → 기기 것을 되살린다", () => {
        expect(pickRestore(stash(), rowOf(acked), now)).toBe(latest);
    });
    it("답을 못 받은 저장이 사실은 닿았다(보낸 지문 목록에 있다) — 그래도 기기의 최신을 되살린다", () => {
        const mid = state({ p1Score: 4, p1HighRun: 4 });
        expect(pickRestore(stash({ known: [stateFingerprint(acked), stateFingerprint(mid)] }), rowOf(mid), now)).toBe(latest);
    });
    it("다 보냈으면(seq ≤ ackedSeq) 서버가 최신이다", () => {
        expect(pickRestore(stash({ seq: 5, ackedSeq: 5 }), rowOf(acked), now)).toBeNull();
    });
    it("서버가 다른 기기에서 바뀌었으면(모르는 지문) 서버를 믿는다", () => {
        const elsewhere = state({ p2Score: 9, p2HighRun: 9, p2Innings: [1, 8] });
        expect(pickRestore(stash(), rowOf(elsewhere), now)).toBeNull();
    });
    it("기기 것이 서버와 같으면 되살릴 것이 없다", () => {
        expect(pickRestore(stash({ state: acked }), rowOf(acked), now)).toBeNull();
    });
    it("일주일 넘은 보관은 믿지 않는다", () => {
        expect(pickRestore(stash({ at: now - STASH_TTL_MS - 1 }), rowOf(acked), now)).toBeNull();
        expect(pickRestore(stash({ at: now - STASH_TTL_MS + 1 }), rowOf(acked), now)).toBe(latest);
    });
    it("보관이 없으면 null", () => {
        expect(pickRestore(null, rowOf(acked), now)).toBeNull();
    });
});

describe("저장소 — 읽기 · 쓰기 · 지우기 · 오래된 것 정리", () => {
    it("쓴 것을 그대로 읽는다, 깨진 값 · 다른 판은 null", () => {
        const st = mem();
        const s: BoardStash<{ innings: number }> = { v: 1, seq: 1, ackedSeq: 0, at: 1, state: { innings: 1 }, known: ["a"] };
        expect(writeStash(st, "g1", s)).toBe(true);
        expect(readStash(st, "g1")).toEqual(s);
        st.map.set(stashKey("g2"), "{깨짐");
        expect(readStash(st, "g2")).toBeNull();
        st.map.set(stashKey("g3"), JSON.stringify({ v: 2, seq: 1 }));
        expect(readStash(st, "g3")).toBeNull();
        clearStash(st, "g1");
        expect(readStash(st, "g1")).toBeNull();
    });
    it("막힌 저장소(사파리 프라이빗 · 가득 참)는 조용히 넘어간다", () => {
        const broken: StorageLike = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("x"); } };
        expect(readStash(broken, "g")).toBeNull();
        expect(writeStash(broken, "g", { v: 1, seq: 1, ackedSeq: 0, at: 1, state: {}, known: [] })).toBe(false);
        expect(() => clearStash(broken, "g")).not.toThrow();
        expect(readStash(null, "g")).toBeNull();
    });
    it("지문은 STASH_KNOWN_MAX 개까지만, 같은 것은 맨 뒤로", () => {
        let k: string[] = [];
        for (let i = 0; i < STASH_KNOWN_MAX + 10; i++) k = withKnown(k, `f${i}`);
        expect(k.length).toBe(STASH_KNOWN_MAX);
        expect(k[k.length - 1]).toBe(`f${STASH_KNOWN_MAX + 9}`);
        expect(withKnown(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    });
    it("일주일 지난 보관과 깨진 보관만 지운다 — 다른 앱 값은 건드리지 않는다", () => {
        const st = mem();
        const now = 2_000_000_000_000;
        st.map.set(`${STASH_PREFIX}old`, JSON.stringify({ v: 1, at: now - STASH_TTL_MS - 5 }));
        st.map.set(`${STASH_PREFIX}new`, JSON.stringify({ v: 1, at: now - 1000 }));
        st.map.set(`${STASH_PREFIX}bad`, "{");
        st.map.set("rankue.sim.zoom", "1.5");
        expect(pruneStashes(st, now)).toBe(2);
        expect([...st.map.keys()].sort()).toEqual([`${STASH_PREFIX}new`, "rankue.sim.zoom"]);
    });
});
