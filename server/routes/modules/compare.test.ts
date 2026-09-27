import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// "나와 비교하기" API — 공개 입력(에버리지 검증·캐시 머리글·비슷한 프로에서 이 선수 빼기)과 회원 전용 쪽
vi.mock("../../storage/index.js", () => ({
    storage: {
        compare: {
            memberRank: vi.fn(async (avg: number) => ({ rank: avg >= 1 ? 10 : 500, total: 1000, topPct: avg >= 1 ? 1 : 50 })),
            myStats: vi.fn(async () => ({ avg: 0.8, games: 12, highRun: 6, winRate: 0.5, perMonth: 0.01 })),
        },
        pba: {
            comparePros: vi.fn(async () => [
                { memCode: "A", nameKo: "A", nameEn: null, league: "LPBA", nationCode: "KR", average: 0.81 },
                { memCode: "B", nameKo: "B", nameEn: null, league: "LPBA", nationCode: "KR", average: 0.79 },
                { memCode: "C", nameKo: "C", nameEn: null, league: "PBA", nationCode: "KR", average: 1.5 },
            ]),
        },
    },
}));
vi.mock("../../middleware/auth.js", () => ({
    requireAuth: (req: any, res: any, next: any) => (req.headers["x-test-user"] ? ((req.userId = req.headers["x-test-user"]), next()) : res.status(401).json({ success: false })),
}));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./compare.js");
    const app = express();
    app.use("/compare", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

describe("GET /compare/avg", () => {
    it("넣은 에버리지로 순위·비슷한 프로(이 선수 제외) — 공개 캐시", async () => {
        const r = await fetch(`${base}/compare/avg?avg=0.8123&exclude=A`);
        expect(r.status).toBe(200);
        expect(r.headers.get("cdn-cache-control")).toContain("s-maxage=600");
        const { data } = await r.json();
        expect(data.avg).toBe(0.81);
        expect(data.members.topPct).toBe(50);
        expect(data.pros.map((p: any) => p.memCode)).toEqual(["B", "C"]);
    });
    it("범위 밖 입력은 400", async () => {
        expect((await fetch(`${base}/compare/avg?avg=9`)).status).toBe(400);
        expect((await fetch(`${base}/compare/avg?avg=abc`)).status).toBe(400);
    });
});

describe("GET /compare/me", () => {
    it("로그인 필요", async () => {
        expect((await fetch(`${base}/compare/me`)).status).toBe(401);
    });
    it("내 기록 + 순위 + 비슷한 프로, 캐시 안 함", async () => {
        const r = await fetch(`${base}/compare/me`, { headers: { "x-test-user": "u1" } });
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        const { data } = await r.json();
        expect(data.stats.games).toBe(12);
        expect(data.members.rank).toBe(500);
        expect(data.pros).toHaveLength(2);
    });
});
