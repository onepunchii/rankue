import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

// 선수 사진(2026-09-27) — PBA 공식 사진을 찾아 우리가 받아 대신 보낸다(저장하지 않는다). 없거나 실패하면 404(화면은 이니셜).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1020, 7)]);
const fetchJson = vi.fn(async (path: string) => {
    if (path.includes("M1")) return { resultCode: "000", data: { Average: "1.2", PlayerImg: "/upload/player/M1.jpg" } };
    if (path.includes("M2")) return { resultCode: "000", data: { Average: "1.0" } }; // JSON 엔 없음 → 페이지 HTML
    // 실측 모양 — ImgURL(작은)·ImgURLBig(큰), 사진 서버는 content-type 을 image/* 로 주지 않는다
    if (path.includes("M4")) return { resultCode: "000", data: { ImgURLBig: "/players/PBA/big/M4_B.jpg", ImgURL: "/players/PBA/M4_S.jpg" } };
    if (path.includes("M3")) return { resultCode: "000", data: { Average: "0.9" } };
    throw new Error("down");
});
const fetchPbaRaw = vi.fn(async (url: string) => {
    if (url.includes("/players/PBA/M4_S")) return new Response(JPEG, { headers: { "content-type": "application/octet-stream" } });
    if (url.includes("/upload/")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    if (url.includes("search/detail?memCode=M2")) {
        return new Response(`<img src="/img/logo.png"><div class="pic"><img src="/files/player/M2_profile.jpg" alt="선수 사진"></div>`, { headers: { "content-type": "text/html" } });
    }
    if (url.includes("/files/player/M2")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    return new Response("<html><img src='/img/logo.png'></html>", { status: 200, headers: { "content-type": "text/html" } });
});
vi.mock("../../services/pbaService.js", () => ({ fetchJson, fetchPbaRaw, PBA_ORIGIN: "https://www.pbatour.org" }));
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

const get = (code: string, q = "") => fetch(`${base}/pba/photo/${code}${q}`, { redirect: "manual" });

describe("GET /pba/photo/:memCode", () => {
    it("상세 JSON 의 사진 칸(이름 무관)을 찾아 바이트를 대신 보낸다, CDN 하루 캐시", async () => {
        const r = await get("M1");
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("image/jpeg");
        expect(r.headers.get("cdn-cache-control")).toContain("s-maxage=86400");
        expect(Buffer.from(await r.arrayBuffer()).length).toBe(1024);
        expect(fetchPbaRaw).toHaveBeenCalledWith("https://www.pbatour.org/upload/player/M1.jpg", expect.any(String), true);
    });
    it("ImgURL(작은 사진) 먼저, content-type 이 이상해도 파일 머리가 jpeg 면 image/jpeg 로 보낸다", async () => {
        const r = await get("M4");
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("image/jpeg");
        expect(fetchPbaRaw).toHaveBeenCalledWith("https://www.pbatour.org/players/PBA/M4_S.jpg", expect.any(String), true);
    });
    it("JSON 에 없으면 공식 선수 페이지 HTML 에서 찾는다(로고는 건너뜀)", async () => {
        const r = await get("M2");
        expect(r.status).toBe(200);
        expect(fetchPbaRaw).toHaveBeenCalledWith("https://www.pbatour.org/files/player/M2_profile.jpg", expect.any(String), true);
    });
    it("사진 없음·PBA 실패·잘못된 코드는 404 — 짧게만 캐시", async () => {
        const r = await get("M3");
        expect(r.status).toBe(404);
        expect(r.headers.get("cdn-cache-control")).toContain("s-maxage=1800");
        expect((await get("DOWN")).status).toBe(404);
        expect((await get("a%20b")).status).toBe(404);
    });
    it("같은 선수는 다시 묻지 않는다(캐시)", async () => {
        const before = fetchJson.mock.calls.length;
        await get("M1");
        expect(fetchJson.mock.calls.length).toBe(before);
    });
    it("?why=1 진단 — 본 곳을 적고 캐시하지 않는다", async () => {
        const r = await get("M2", "?why=1");
        expect(r.headers.get("cache-control")).toBe("no-store");
        const j = await r.json();
        expect(j.url).toBe("https://www.pbatour.org/files/player/M2_profile.jpg");
        expect(j.bytes).toBe("image/jpeg 1024B");
        expect(j.trace[0]).toContain("keys=Average");
        expect(j.trace.at(-1)).toContain("sniff=image/jpeg");
    });
});
