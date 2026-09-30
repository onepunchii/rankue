import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 이 홀 기록(2026-10-01 오너 승인) — 누가 어디에 쓰는지를 소스로 지킨다. 누가 저장 경로를 방장 전용으로 바꾸거나
 * 본문의 회원번호로 칸을 고르게 하면, 오류 없이 조용히 '남의 퍼팅을 적는' 구멍이 생기거나 동반자 카드가 403 만 낸다.
 * 규칙 자체(검증·그린 적중·통계)는 shared/golfHoleStats.test.ts.
 */
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");
const between = (s: string, from: string, to: string) => {
    const i = s.indexOf(from);
    expect(i, from).toBeGreaterThan(-1);
    const j = s.indexOf(to, i + from.length);
    return s.slice(i, j > -1 ? j : undefined);
};

describe("저장 — 참가자 누구나, 자기 칸만", () => {
    const route = code("server/routes/modules/golf.ts");
    const post = between(route, 'router.post("/match/:id/hole-stats"', "router.");

    it("참가자 문지기(방장 전용 아님)를 지나고, 본문은 shared 검증을 거친다", () => {
        expect(post).toContain("loadMatch(req, res, false)");
        expect(post).not.toContain("loadMatch(req, res, true)");
        expect(post).toContain("sanitizeHolePatches(req.body?.holes)");
    });
    it("고칠 칸은 로그인 회원으로 정한다 — 본문의 memberId 는 쓰지 않는다", () => {
        expect(post).toContain("updateMyHoleStats(session.id, req.userId!, patches)");
        expect(post).not.toContain("req.body?.memberId");
        expect(post).not.toContain("req.body.memberId");
    });
});

describe("저장소 — 잠그고, 내 칸의 세 칸만, updated_at 은 그대로", () => {
    const repo = code("server/storage/golf.repo.ts");
    const fn = between(repo, "async updateMyHoleStats(", "async holeStatsView(");

    it("행을 잠그고 로그인 회원의 선수 객체만 고친다", () => {
        expect(fn).toContain('.for("update")');
        expect(fn).toContain("p?.memberId === memberId");
        expect(fn).toContain("i === at ? { ...p, putts: next.putts, fairway: next.fairway, penaltyTags: next.penaltyTags } : p");
    });
    it("점수·벌타·updated_at 은 건드리지 않는다(기록·진행 중 라운드·핀 규칙이 읽는 값)", () => {
        expect(fn).toContain(".set({ players: merged })");
        expect(fn).not.toContain("updatedAt");
        expect(fn).not.toContain("scores");
        expect(fn).not.toContain("penalties");
    });
    it("끝난 경기는 유예 시간 안에서만, 대기·접은 경기는 받지 않는다", () => {
        expect(fn).toContain("HOLE_STATS_GRACE_MINUTES * 60_000");
        expect(fn).toContain('cur.status === "waiting"');
        expect(fn).toContain('cur.status === "abandoned"');
    });
    it("방장의 점수 저장은 잠근 행의 선수 객체를 펼쳐 써서 동반자가 적은 기록을 지우지 않는다", () => {
        const score = between(repo, "async updateGolfMatchScore(", "async updateMyHoleStats(");
        expect(score).toContain("return { ...dbP, scores, penalties:");
    });
    it("끝내기(평균·도장·현장 인증)는 이 기록을 읽지 않는다", () => {
        const finish = between(repo, "async finishGolfMatchSession(", "async recordGolfCheckin(");
        for (const k of ["putts", "fairway", "penaltyTags", "golfHoleStats"]) expect(finish).not.toContain(k);
    });
});

describe("경기 응답 — 남의 기록은 걷어 낸다", () => {
    const route = code("server/routes/modules/golf.ts");
    const block = between(route, 'router.post("/match/create"', "// --- 이 홀 기록");

    it("경기 행을 돌려주는 곳은 전부 withoutHoleStats 를 거친다", () => {
        expect(block.match(/withoutHoleStats\(/g)?.length).toBe(8);
        expect(block).not.toMatch(/sendSuccess\(res, session\)/);
        expect(block).not.toMatch(/sendSuccess\(res, await storage\.(start|finish|abandon)GolfMatchSession/);
    });
    it("내 기록 GET 은 참가자만, 리포트 재료는 로그인 회원 것만", () => {
        const get = between(route, 'router.get("/match/:id/hole-stats"', "router.");
        expect(get).toContain("loadMatch(req, res, false)");
        expect(get).toContain("holeStatsView(session, req.userId!)");
        const mine = between(route, 'router.get("/hole-stats/mine"', "router.");
        expect(mine).toContain("myHoleStatsRounds(req.userId!)");
    });
});
