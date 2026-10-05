import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { proTier } from "../../../shared/proCompare.js";

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

    // 2026-10-06 오너: 비로그인 홈 예시 카드에 "프로도 실존 인물로" — 예시 카드는 로그인 없이 이 공개 응답으로 닮은 프로를 그린다.
    // 등급 칩·사다리(tier·pos)는 프로 전체 분포가 있어야 셀 수 있어 서버가 같이 싣는다(회원용 /real 과 같은 proTier).
    describe("재미 등급(tier·pos)", () => {
        // LPBA 4명(0.6~0.9) · PBA 21명(1.00~2.00, 0.05 간격) → 경계 = 0.6 · 0.7 · 1.5(PBA 중앙값) · 1.55(PBA 위에서 10번째)
        const pool = [
            ...[0.6, 0.7, 0.8, 0.9].map((average, i) => ({ memCode: `L${i}`, nameKo: `L${i}`, nameEn: null, league: "LPBA" as const, nationCode: "KR", average })),
            ...Array.from({ length: 21 }, (_, i) => ({ memCode: `P${i}`, nameKo: `P${i}`, nameEn: null, league: "PBA" as const, nationCode: "KR", average: Math.round((1 + i * 0.05) * 100) / 100 })),
        ];
        const withPool = async () => {
            const { storage } = await import("../../storage/index.js");
            vi.mocked(storage.pba.comparePros).mockResolvedValueOnce(pool as any);
        };

        it("프로 분포가 충분하면 응답에 실린다 — 서버가 든 풀 전체로 센 값(두 명짜리 pros 로는 못 센다)", async () => {
            await withPool();
            const { data } = await (await fetch(`${base}/compare/avg?avg=0.53`)).json();
            // 0.53 은 첫 경계(0.6) 아래 = 아마추어 칸(0). 칸 안 자리 0.53 ÷ 0.6 → 사다리 전체의 18%
            expect(data.tier).toBe(0);
            expect(data.pos).toBe(18);
            expect({ tier: data.tier, pos: data.pos }).toEqual(proTier(pool, 0.53));
            // 닮은 프로는 그대로 가장 가까운 순 — 화면은 첫 번째를 쓴다
            expect(data.pros.map((p: any) => p.memCode)).toEqual(["L0", "L1"]);
            expect(proTier(data.pros, 0.53)).toBeNull();
        });

        it("등급이 올라가는 입력도 같은 식 — LPBA 하위 25%~중앙값 사이는 1등급", async () => {
            await withPool();
            const { data } = await (await fetch(`${base}/compare/avg?avg=0.65`)).json();
            expect({ tier: data.tier, pos: data.pos }).toEqual({ tier: 1, pos: 30 });
            expect({ tier: data.tier, pos: data.pos }).toEqual(proTier(pool, 0.65));
        });

        it("exclude 는 비슷한 프로 목록에서만 뺀다 — 등급 경계는 그대로", async () => {
            await withPool();
            const { data } = await (await fetch(`${base}/compare/avg?avg=0.53&exclude=L0`)).json();
            expect(data.pros.map((p: any) => p.memCode)).toEqual(["L1", "L2"]);
            expect({ tier: data.tier, pos: data.pos }).toEqual(proTier(pool, 0.53));
        });

        it("프로가 모자라면(LPBA 4명·PBA 10명 미만) null 로 실린다 — 칸이 빠지지 않는다", async () => {
            const { data } = await (await fetch(`${base}/compare/avg?avg=0.8`)).json();
            expect(data).toHaveProperty("tier", null);
            expect(data).toHaveProperty("pos", null);
        });

        it("회원용 /real 은 그대로 — 같은 풀이면 같은 등급을 준다", async () => {
            await withPool();
            const { data } = await (await fetch(`${base}/compare/real`, { headers: { "x-test-user": "u1" } })).json();
            // 모의 회원의 3쿠션 에버리지는 0.8
            expect({ tier: data["3c"].tier, pos: data["3c"].pos }).toEqual(proTier(pool, 0.8));
        });
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
