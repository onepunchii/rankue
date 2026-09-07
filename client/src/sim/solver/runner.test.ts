/**
 * 협조적 실행기 테스트 — 워커·메인 스레드 폴백이 공유하는 runSearchCooperatively 를 가짜 양보·가짜 시계로 돌린다.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_PARAMS } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { DEFAULT_3C_RULES } from "@shared/sim/rules";
import { runSearchCooperatively } from "./runner";
import { isSolverOutMessage } from "./protocol";
import type { SolveProgress, SolveRequest } from "./search";

function req(over: Partial<SolveRequest> = {}): SolveRequest {
    return {
        balls: openingLayout("3c", DEFAULT_PARAMS.table), cueBallId: "white", gameType: "3c",
        rules: DEFAULT_3C_RULES, params: DEFAULT_PARAMS, seed: 7, maxSimulations: 500, ...over,
    };
}

describe("runSearchCooperatively", () => {
    it("배치마다 양보하고, 진행을 알리고, 끝나면 결과를 준다", async () => {
        let yields = 0;
        const progress: SolveProgress[] = [];
        const r = await runSearchCooperatively(req(), {
            now: () => 0,
            batch: 50,
            yieldFn: async () => { yields++; },
            onProgress: (p) => progress.push(p),
            progressIntervalMs: 0,
        });
        expect(r.aborted).toBe(false);
        expect(r.tried).toBeLessThanOrEqual(500);
        expect(r.candidates.length).toBeGreaterThanOrEqual(1);
        // 500회를 50씩 → 양보 9~10회
        expect(yields).toBeGreaterThanOrEqual(8);
        expect(yields).toBeLessThanOrEqual(10);
        expect(progress.length).toBeGreaterThanOrEqual(yields);
        expect(progress[progress.length - 1].phase).toBe("done");
        expect(progress[progress.length - 1].tried).toBe(r.tried);
        for (let i = 1; i < progress.length; i++) expect(progress[i].tried).toBeGreaterThanOrEqual(progress[i - 1].tried);
    });

    it("취소되면 다음 양보에서 멈추고 부분 결과(aborted)를 돌려준다", async () => {
        let yields = 0;
        let cancelled = false;
        const r = await runSearchCooperatively(req(), {
            now: () => 0,
            batch: 40,
            yieldFn: async () => { yields++; if (yields === 3) cancelled = true; },
            isCancelled: () => cancelled,
        });
        expect(r.aborted).toBe(true);
        expect(r.tried).toBe(120);
        expect(yields).toBe(3);
        // 부분 결과도 정렬된 후보
        for (let i = 1; i < r.candidates.length; i++) expect(r.candidates[i - 1].score).toBeGreaterThanOrEqual(r.candidates[i].score);
    });

    it("진행 알림은 간격(가짜 시계)마다 한 번 + 마지막", async () => {
        let clock = 0;
        const progress: SolveProgress[] = [];
        await runSearchCooperatively(req({ maxSimulations: 300 }), {
            now: () => clock, // 배치마다 시계를 우리가 민다
            batch: 30,
            yieldFn: async () => { clock += 100; },
            onProgress: (p) => progress.push(p),
            progressIntervalMs: 200,
        });
        // 첫 배치(즉시) + 200 ms 마다 + 마지막 → 10 배치면 6개 안팎
        expect(progress.length).toBeGreaterThanOrEqual(5);
        expect(progress.length).toBeLessThanOrEqual(8);
        expect(progress[progress.length - 1].phase).toBe("done");
    });

    it("기본 양보(setTimeout 0)로도 끝난다", async () => {
        const r = await runSearchCooperatively(req({ maxSimulations: 120 }), { batch: 40 });
        expect(r.tried).toBeLessThanOrEqual(120);
        expect(r.aborted).toBe(false);
    });
});

describe("protocol", () => {
    it("isSolverOutMessage 는 id 와 type 을 검사한다", () => {
        expect(isSolverOutMessage({ type: "progress", id: 1, tried: 0, found: 0, phase: "seed" })).toBe(true);
        expect(isSolverOutMessage({ type: "result", id: 2, result: {} })).toBe(true);
        expect(isSolverOutMessage({ type: "error", id: 3, message: "x" })).toBe(true);
        expect(isSolverOutMessage({ type: "solve", id: 1 })).toBe(false);
        expect(isSolverOutMessage({ type: "result" })).toBe(false);
        expect(isSolverOutMessage(null)).toBe(false);
        expect(isSolverOutMessage("result")).toBe(false);
    });
});
