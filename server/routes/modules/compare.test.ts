import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// "나와 비교하기" API — 공개 입력(에버리지 검증·캐시 머리글·비슷한 프로에서 이 선수 빼기)과 회원 전용 쪽
vi.mock("../../storage/index.js", () => ({
    storage: {
        compare: {
            memberRank: vi.fn(async (avg: number) => ({ rank: avg >= 1 ? 10 : 500, total: 1000, topPct: avg >= 1 ? 1 : 50 })),
            myStats: vi.fn(async (_id: string, type = "3c") => (type === "4c" ? null : { avg: 0.8, games: 12, highRun: 6, winRate: 0.5, perMonth: 0.01 })),
            handiBasis: vi.fn(async (_id: string, type: string) => (type === "4c" ? { ranked: 2, avg: 0.5 } : { ranked: 9, avg: 0.66 })),
            peers: vi.fn(async () => ({ count: 3, avg: 0.6, highRun: 7 })),
        },
        getMemberById: vi.fn(async () => ({ id: "u1", handi3c: 23, handi4c: null })),
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

describe("GET /compare/real", () => {
    it("3쿠션: 핸디·다음 핸디(최근 10판 평균 기준)·닮은 프로 / 4구: 공식 5판 전이면 준비 안 됨", async () => {
        const r = await fetch(`${base}/compare/real`, { headers: { "x-test-user": "u1" } });
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        const { data } = await r.json();
        expect(data.preferred).toBe("3c");
        const c3 = data["3c"];
        expect(c3.ready).toBe(true);
        expect(c3.handi).toBe(23);
        // 0.66 → 핸디 23(0.6 이상), 다음 칸은 25(0.7) — 남은 차이 0.04
        expect(c3.nextHandi.handi).toBe(25);
        expect(c3.nextHandi.gap).toBeCloseTo(0.04, 5);
        expect(c3.pro.memCode).toBe("A");
        expect(data["4c"].ready).toBe(false);
        expect(data["4c"].games).toBe(2);
    });
    it("로그인 필요", async () => {
        expect((await fetch(`${base}/compare/real`)).status).toBe(401);
    });
});
