/**
 * 대전 이닝 기록 로더(matchHistory) — 화면 배선의 경합 규칙만 따로 본다. 컨트롤러와 함께 도는 흐름은
 * simController.match.test.ts "이닝 기록 되살리기".
 */
import { describe, it, expect, vi } from "vitest";
import { createSession, DEFAULT_3C_RULES } from "@shared/sim/rules";
import { EMPTY_LOG, type HistoryShot, type InningLog, type ShotEntry } from "./inningLog";
import { makeHistoryLoader } from "./matchHistory";

const state = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "h", target: 10 }, { id: "g", target: 10 }] });
const shot = (idx: number, playerIndex: number, inning: number, points = 0): HistoryShot =>
    ({ idx, playerIndex, inning, points, outcomeCode: points > 0 ? "point" : "miss-cushions", cushions: 3 });
const entry = (idx: number, points = 0): ShotEntry => ({ shot: idx + 1, idx, player: 0, inning: 9, code: "point", points, cushions: 3, consumesInning: false });

async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

function harness(start: InningLog = EMPTY_LOG) {
    let log = start;
    let open: string | null = null;
    const pending: { id: string; resolve: (s: readonly HistoryShot[]) => void; reject: (e: unknown) => void }[] = [];
    const timers: (() => void)[] = [];
    const getShots = vi.fn((id: string) => new Promise<readonly HistoryShot[]>((resolve, reject) => { pending.push({ id, resolve, reject }); }));
    const load = makeHistoryLoader({
        getShots, update: (fn) => { log = fn(log); }, isOpen: (id) => open === id,
        setTimer: (cb) => { timers.push(cb); },
    });
    return {
        getShots, pending, timers,
        base: (matchId: string, shots: number, fresh: boolean) => { open = matchId; load({ matchId, shots, state, fresh }); },
        leave: () => { open = null; },
        log: () => log,
        setLog: (l: InningLog) => { log = l; },
    };
}

describe("makeHistoryLoader", () => {
    it("새로 연 대전: 앞 대전 기록을 즉시 비우고, 서버 기록(기준점 앞)으로 채운다", async () => {
        const h = harness({ entries: [entry(0, 5), entry(1, 5)] });   // 앞 판(한 판 더 전) 기록
        h.base("m-2", 2, true);
        expect(h.log().entries).toEqual([]);
        await flush();
        expect(h.getShots).toHaveBeenCalledWith("m-2", 0);
        h.pending[0].resolve([shot(0, 0, 1, 1), shot(1, 0, 1), shot(2, 1, 1)]);   // 기준점 뒤(2)는 화면이 쌓을 몫
        await flush();
        expect(h.log().entries.map((e) => `${e.idx}:${e.player}:${e.inning}:${e.points}`)).toEqual(["0:0:1:1", "1:0:1:0"]);
    });

    it("샷이 없는 대전은 요청하지 않는다", () => {
        const h = harness();
        h.base("m-1", 0, true);
        expect(h.getShots).not.toHaveBeenCalled();
    });

    it("더 새 기준점이 오면 늦게 도착한 옛 응답은 버린다", async () => {
        const h = harness();
        h.base("m-1", 1, true);
        h.base("m-1", 2, false);
        await flush();
        h.pending[1].resolve([shot(0, 0, 1, 1), shot(1, 0, 1)]);
        await flush();
        h.pending[0].resolve([shot(0, 0, 7, 9)]);                       // 옛 응답(엉뚱한 값)
        await flush();
        expect(h.log().entries.map((e) => `${e.idx}:${e.inning}:${e.points}`)).toEqual(["0:1:1", "1:1:0"]);
    });

    it("그사이 연습으로 넘어갔으면(대전이 닫혔으면) 대전 기록을 섞지 않는다", async () => {
        const h = harness();
        h.base("m-1", 1, true);
        await flush();
        h.leave();
        h.setLog({ entries: [entry(0, 3)] });                          // 연습 기록
        h.pending[0].resolve([shot(0, 0, 1, 1)]);
        await flush();
        expect(h.log().entries.map((e) => e.points)).toEqual([3]);
    });

    it("갈아탄 기준점(fresh 아님): idx ≥ 샷 수 줄은 즉시 버리고, 앞 줄은 서버 기록으로 바꾼다", async () => {
        const h = harness({ entries: [entry(0, 5), entry(1, 5), entry(2, 5)] });
        h.base("m-1", 2, false);
        expect(h.log().entries.map((e) => e.idx)).toEqual([0, 1]);
        await flush();
        h.pending[0].resolve([shot(0, 0, 1, 1), shot(1, 0, 1)]);
        await flush();
        expect(h.log().entries.map((e) => `${e.idx}:${e.points}`)).toEqual(["0:1", "1:0"]);
    });

    it("실패하면 한 번만 더 해 본다", async () => {
        const h = harness();
        h.base("m-1", 1, true);
        await flush();
        h.pending[0].reject(new TypeError("Failed to fetch"));
        await flush();
        expect(h.timers).toHaveLength(1);
        h.timers[0]();
        await flush();
        expect(h.getShots).toHaveBeenCalledTimes(2);
        h.pending[1].reject(new TypeError("Failed to fetch"));
        await flush();
        expect(h.timers).toHaveLength(1);
        expect(h.log()).toEqual(EMPTY_LOG);
    });

    it("getShots 가 동기로 던져도 화면 콜백 밖으로 새지 않는다", async () => {
        let log: InningLog = EMPTY_LOG;
        const load = makeHistoryLoader({
            getShots: () => { throw new Error("boom"); },
            update: (fn) => { log = fn(log); }, isOpen: () => true, setTimer: () => undefined,
        });
        expect(() => load({ matchId: "m-1", shots: 3, state, fresh: true })).not.toThrow();
        await flush();
        expect(log).toEqual(EMPTY_LOG);
    });
});
