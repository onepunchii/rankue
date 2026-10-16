import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONLINE_FLAG_RULES, endReasonLabel, isRatedMatch, onlineFlags, type OnlineFlagInput } from "./simMatchFlags";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const m = (o: Partial<OnlineFlagInput>): OnlineFlagInput => ({ handicap: true, hasGuest: true, shots: [20, 20], endReason: "target", winner: 0, mismatches: 0, ...o });

describe("온라인 대전 — 다시 볼 것", () => {
    it("레이팅 판인데 진 사람이 세 번도 안 치고 시간 초과로 끝나면 표시", () => {
        const f = onlineFlags(m({ endReason: "timeout", winner: 0, shots: [6, 1] }));
        expect(f.map((x) => x.id)).toEqual(["quickEnd"]);
        expect(f[0].text).toContain("1번 치고 시간 초과 실격");
        // 세 번 넘게 쳤으면 보통 판
        expect(onlineFlags(m({ endReason: "timeout", winner: 0, shots: [6, 3] }))).toEqual([]);
        // 친선전(핸디 끔)은 레이팅이 안 움직여 보지 않는다
        expect(onlineFlags(m({ handicap: false, endReason: "timeout", winner: 0, shots: [6, 1] }))).toEqual([]);
        // 기권은 규칙상 두 사람 다 세 번 넘게 쳐야 레이팅 판 — 짧은 기권은 레이팅 판이 아니다
        expect(isRatedMatch(m({ endReason: "resign", winner: 1, shots: [1, 2] }))).toBe(false);
    });

    it("앱과 서버의 계산이 어긋나면 레이팅 판이 아니어도 표시", () => {
        expect(onlineFlags(m({ handicap: false, mismatches: 2 })).map((x) => x.text)).toEqual(["앱과 서버의 샷 계산이 2번 달랐어요"]);
    });

    it(`같은 두 사람이 하루 레이팅 판 ${ONLINE_FLAG_RULES.samePairPerDay}판을 넘기면 표시`, () => {
        expect(onlineFlags(m({}), ONLINE_FLAG_RULES.samePairPerDay)).toEqual([]);
        expect(onlineFlags(m({}), ONLINE_FLAG_RULES.samePairPerDay + 1).map((x) => x.id)).toEqual(["samePair"]);
        expect(onlineFlags(m({ handicap: false }), 9)).toEqual([]);
    });

    it("끝난 까닭 이름 — 무효 · 모르는 값", () => {
        expect(endReasonLabel("void")).toBe("운영자 무효");
        expect(endReasonLabel("weird")).toBe("weird");
        expect(endReasonLabel(null)).toBe("끝남");
    });
});

describe("온라인 대전 무효 — 오래 멈춘 판 정리와 같은 길", () => {
    const route = read("server/routes/modules/adminBilliards.ts");
    it("무효는 canceled · end_reason 'void' 로 닫고 원래 까닭을 남긴다, 되살리면 그 까닭으로", () => {
        expect(route).toMatch(/set status = 'canceled', end_reason = 'void',[\s\S]*'prevEndReason', end_reason\)[\s\S]*where id = \$\{id\}::uuid and status = 'finished' and cup_game_id is null/);
        expect(route).toMatch(/set status = 'finished', end_reason = admin_void ->> 'prevEndReason'/);
    });

    it("무효 · 되살리기 뒤에 레이팅을 다시 계산하고 1분 재료도 새로 읽는다", () => {
        const after = (word: string) => route.slice(route.indexOf(`router.post("/online/:id/${word}"`));
        for (const w of ["void", "restore"]) {
            expect(after(w)).toMatch(/recomputeRatings\(false\)[\s\S]*ratedDeltas\(true\)/);
        }
    });

    it("월대회 판은 막는다(대진이 걸려 있다)", () => {
        expect(route).toMatch(/if \(m\.cup_game_id\) return "월대회 판은/);
    });

    it("레이팅 · 이달의 랭킹 · 장식장 · 큐 케이스 재료는 finished 만 읽는다 — 무효로 한 판은 저절로 빠진다", () => {
        const repo = read("server/storage/simMatch.repo.ts");
        const recompute = repo.slice(repo.indexOf("async recomputeRatings("));
        expect(recompute).toMatch(/where m\.status = 'finished' and m\.guest_id is not null/);
        const replay = repo.slice(repo.indexOf("async finishedForReplay("), repo.indexOf("async ratedDeltas("));
        expect(replay).toMatch(/where m\.status = 'finished' and m\.guest_id is not null/);
    });

    it("마이그레이션은 칸 하나를 더하기만 한다", () => {
        const body = read("migrations/sim_match_void.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toEqual(["alter table hiq_sim_matches add column if not exists admin_void jsonb;"]);
    });
});
