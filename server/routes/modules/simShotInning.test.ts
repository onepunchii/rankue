import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 샷 행의 이닝 번호(2026-09-18 오너: "방 나갔다 다시 이어 하면 이닝별 스코어가 다 지워져 있다").
 * 라우트가 적고 → 저장소가 넣고 → 조회가 내보내야 다시 들어온 화면이 이닝별 점수판을 되살린다. 한 군데라도 빠지면
 * 오류 없이 화면만 추정으로 돌아간다(연속 시간 초과 뒤 이닝이 한 칸씩 밀린다). DB 없이 소스로 본다(simChat.test 와 같은 방식).
 */
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

describe("샷 행 이닝 번호가 서버를 끝까지 통과한다", () => {
    const route = code("server/routes/modules/simMatch.ts");

    it("POST /shots 가 적용 뒤 세션의 친 사람 상태로 shotInning 을 계산해 recordShot 에 넘긴다", () => {
        expect(route).toContain("inning: shotInning(applied.outcome, applied.session.players[myIndex])");
    });

    it("recordShot 이 inning 칸을 넣는다", () => {
        const repo = code("server/storage/simMatch.repo.ts");
        const i = repo.indexOf("async recordShot(");
        const block = repo.slice(i, repo.indexOf("\n    async ", i + 20));
        expect(block).toMatch(/insert\(hiqSimMatchShots\)[\s\S]*inning: a\.inning/);
    });

    it("GET /shots 가 inning 을 내보낸다(옛 행은 null)", () => {
        const i = route.indexOf('router.get("/sim/matches/:id/shots"');
        const block = route.slice(i, route.indexOf("router.", i + 10));
        expect(block).toContain("inning: s.inning ?? null");
    });

    it("스키마 칸과 마이그레이션이 같이 있다(배포 전 적용 — 없으면 샷 조회·기록이 통째로 죽는다)", () => {
        expect(read("shared/schema.ts")).toMatch(/inning: integer\("inning"\),/);
        expect(read("migrations/sim_shot_inning.sql")).toMatch(/alter table hiq_sim_match_shots add column if not exists inning integer;/);
    });
});
