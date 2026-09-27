import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// 선수 사진(2026-09-27) — PBA 공식 사진 주소로 돌려보낸다(저장하지 않는다). 없거나 실패하면 404(화면은 이니셜).
const fetchJson = vi.fn(async (path: string) => {
    if (path.includes("M1")) return { resultCode: "000", data: { ImgURL: "/upload/player/M1.jpg" } };
    if (path.includes("M2")) return { resultCode: "000", data: { ImgURL: "https://cdn.pbatour.org/p/M2.png" } };
    if (path.includes("M3")) return { resultCode: "000", data: { ImgURL: "" } };
    if (path.includes("BAD")) return { resultCode: "000", data: { ImgURL: "javascript:alert(1)" } };
    throw new Error("down");
});
vi.mock("../../services/pbaService.js", () => ({ fetchJson, PBA_ORIGIN: "https://www.pbatour.org" }));
vi.mock("../../storage/index.js", () => ({ storage: {} }));

let base = "", server: any;
beforeAll(async () => {
    const { default: router } = await import("./pba.js");
    const app = express();
    app.use("/pba", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const get = (code: string) => fetch(`${base}/pba/photo/${code}`, { redirect: "manual" });

describe("GET /pba/photo/:memCode", () => {
    it("상대 경로는 PBA 주소로 붙여 302, CDN 하루 캐시", async () => {
        const r = await get("M1");
        expect(r.status).toBe(302);
        expect(r.headers.get("location")).toBe("https://www.pbatour.org/upload/player/M1.jpg");
        expect(r.headers.get("cdn-cache-control")).toContain("s-maxage=86400");
    });
    it("절대 주소는 그대로", async () => {
        expect((await get("M2")).headers.get("location")).toBe("https://cdn.pbatour.org/p/M2.png");
    });
    it("사진 없음·이상한 주소·PBA 실패·잘못된 코드는 404", async () => {
        expect((await get("M3")).status).toBe(404);
        expect((await get("BAD")).status).toBe(404);
        expect((await get("DOWN")).status).toBe(404);
        expect((await get("a%20b")).status).toBe(404);
    });
    it("같은 선수는 다시 묻지 않는다(캐시)", async () => {
        const before = fetchJson.mock.calls.length;
        await get("M1");
        expect(fetchJson.mock.calls.length).toBe(before);
    });
});
