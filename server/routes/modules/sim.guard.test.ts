import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 시뮬레이터는 실전 성적(RP·에버리지·핸디)을 절대 건드리지 않는다.
 * 2026-08-30 테스트 데이터로 RP 가 오염된 사고 이후 세운 규칙. 아래 식별자가 시뮬 서버 코드에
 * 하나라도 나타나면 실패한다.
 */
const FORBIDDEN = /finishHiqGame|hiqGames\b|hiqGameHistory|rating3c|rating4c|avg3c|avg4c|handi3c|handi4c|createHiqGame|updateUserAverage|totalSimPoints/;

const FILES = [
    "server/routes/modules/sim.ts",
    "server/storage/sim.repo.ts",
    "server/routes/modules/simMatch.ts",
    "server/storage/simMatch.repo.ts",
];

describe("시뮬레이터 ↔ 실전 성적 격리", () => {
    for (const f of FILES) {
        it(`${f} 는 실전 성적 식별자를 참조하지 않는다`, () => {
            const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
            // 주석 안의 언급은 허용하지 않는다 — 코드에 들어올 길을 아예 막는다.
            const hits = src.split("\n").map((l, i) => [i + 1, l] as const).filter(([, l]) => FORBIDDEN.test(l));
            expect(hits, hits.map(([n, l]) => `${n}: ${l.trim()}`).join("\n")).toEqual([]);
        });
    }
});
