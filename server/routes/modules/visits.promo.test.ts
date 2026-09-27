import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// 검색 유입 깔때기 비콘(2026-09-27) — 정해진 출처·단계만 받고, 표가 없어도(쓰기 실패) 200 으로 조용히 넘어간다
const execute = vi.fn(async () => ({}));
vi.mock("../../db.js", () => ({ db: { execute } }));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./visits.js");
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => { execute.mockClear(); });

const post = (body: any) => fetch(`${base}/api/promo-event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/promo-event", () => {
    it("정해진 출처·단계면 한 행 넣는다", async () => {
        const r = await post({ v: "abc", src: "store", step: "click" });
        expect(r.status).toBe(200);
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it("모르는 출처·단계·빈 방문자·긴 방문자는 400, 쓰지 않는다", async () => {
        for (const b of [{ v: "a", src: "evil", step: "click" }, { v: "a", src: "pba", step: "drop" }, { v: "", src: "pba", step: "view" }, { v: "x".repeat(65), src: "umb", step: "view" }]) {
            expect((await post(b)).status).toBe(400);
        }
        expect(execute).not.toHaveBeenCalled();
    });
    it("표가 없어 쓰기가 실패해도 200(부가 기능)", async () => {
        execute.mockRejectedValueOnce(new Error('relation "promo_events" does not exist'));
        expect((await post({ v: "abc", src: "umb", step: "signup" })).status).toBe(200);
    });
});
