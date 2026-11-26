// 도메인 나누기 미들웨어(2026-11-26) — 실제 express 위에서 본다. 뒤의 사이트맵 · 프리렌더는 가짜로 세워 '나가는 글이 어떻게 고쳐지는가'만 본다.
// 규칙과 까닭은 shared/siteSplit.ts 머리말, 순수 함수의 시험은 shared/siteSplit.test.ts.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

// prerender.ts 는 DB 를 끌고 온다 — 봇 판별만 같은 뜻으로 세운다
vi.mock("./prerender.js", () => ({ isBot: (req: express.Request) => /bot|Yeti|Daum\/[0-9]/i.test(req.get("user-agent") || "") }));

import { registerSiteSplit } from "./siteSplit";
import { MAIN_DEINDEX_LIVE } from "../shared/siteSplit";

const MAIN = "https://www.rankue.co.kr";
const KR = "https://www.rankue.kr";
const page = (path: string) => `<!DOCTYPE html><html><head><title>t</title>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<link rel="canonical" href="${MAIN}${path}" />
<meta property="og:url" content="${MAIN}${path}" /></head>
<body><a href="/golf/courses">목록</a> <a href="/stores">당구장</a> <a href="/golf/find/3people">3인</a>
<nav aria-label="RANKUE"><a href="/">홈</a> · <a href="/hiking">등산</a></nav></body></html>`;
const urlset = `<?xml version="1.0"?><urlset>
  <url><loc>${MAIN}/golf/course/a</loc></url>
  <url><loc>${MAIN}/golf/courses/x/y</loc></url>
  <url><loc>${MAIN}/golfer/owgr/1</loc></url>
</urlset>`;

let base = "";
let server: ReturnType<express.Express["listen"]>;
let reached: string[] = [];

beforeAll(async () => {
    const app = express();
    registerSiteSplit(app);
    app.get("/sitemap.xml", (_req, res) => { res.setHeader("Content-Type", "application/xml; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600"); res.send(`<sitemapindex><sitemap><loc>${MAIN}/sitemap-core.xml</loc></sitemap><sitemap><loc>${MAIN}/sitemap-golf-courses.xml</loc></sitemap></sitemapindex>`); });
    app.get("/sitemap-:section.xml", (_req, res) => { res.setHeader("Content-Type", "application/xml; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600"); res.send(urlset); });
    app.get("/api/hiq/thing", (req, res) => { reached.push(req.path); res.json({ success: true, data: { url: `${MAIN}/golf/course/a` } }); });
    app.post("/api/hiq/thing", (req, res) => { reached.push("POST " + req.path); res.json({ success: true }); });
    app.get("/og/x.png", (req, res) => { reached.push(req.path); res.type("png").send(Buffer.from([1, 2, 3])); });
    app.get("*", (req, res) => { reached.push(req.path); res.setHeader("Cache-Control", "no-store"); res.send(page(req.path)); });
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
// co.kr 쪽은 두 단계로 켠다(shared 의 MAIN_DEINDEX_LIVE) — 시험은 켠 상태를 기준으로 보고, 끈 상태 · 기본값은 따로 본다
beforeEach(() => { process.env.SITE_SPLIT = "on"; });
afterEach(() => { reached = []; delete process.env.SITE_SPLIT; });

const BOT = "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)";
const MAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";
const get = (path: string, o: { host?: string; ua?: string; method?: string } = {}) =>
    fetch(base + path, { method: o.method ?? "GET", redirect: "manual", headers: { "x-forwarded-host": o.host ?? "www.rankue.co.kr", "user-agent": o.ua ?? BOT } });

describe("www.rankue.kr — 골프만", () => {
    const kr = (path: string, ua = BOT) => get(path, { host: "www.rankue.kr", ua });

    it("여는 주소 — 봇 화면이 .kr 것으로 나간다(대표 주소 · 링크 · 길잡이)", async () => {
        const r = await kr("/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC");
        const html = await r.text();
        expect(r.status).toBe(200);
        expect(html).toContain(`<link rel="canonical" href="${KR}/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC" />`);
        expect(html).toContain('content="index, follow');
        expect(html).not.toContain("rankue.co.kr");
        expect(html).toContain('<a href="/golf/courses">목록</a> 당구장 3인');
        expect(html).not.toContain("등산");
        expect(r.headers.get("x-robots-tag")).toBeNull();
    });

    it("안 여는 주소 — 봇에게는 404 + noindex, 뒤의 화면 코드까지 가지 않는다", async () => {
        for (const p of ["/stores", "/world-ranking", "/hiking/mountains/x", "/golf/courses/a/b", "/golf/find/3people", "/golfer/owgr/1", "/dashboard"]) {
            const r = await kr(p);
            const html = await r.text();
            expect(r.status, p).toBe(404);
            expect(html, p).toContain('content="noindex, follow"');
            expect(html, p).not.toContain("rankue.co.kr");
        }
        expect(reached).toEqual([]);
    });

    it("안 여는 주소 — 사람은 원래 사이트의 같은 주소로(302 · 물음표 뒤도 그대로)", async () => {
        const r = await kr("/stores/C1?tab=price", MAN);
        expect(r.status).toBe(302);
        expect(r.headers.get("location")).toBe(`${MAIN}/stores/C1?tab=price`);
        expect(r.headers.get("cache-control")).toBe("no-store");
    });

    it("첫 주소는 골프 홈으로 — 같은 도메인 안에서", async () => {
        for (const ua of [BOT, MAN]) {
            const r = await kr("/", ua);
            expect(r.status).toBe(301);
            expect(r.headers.get("location")).toBe("/golf");
        }
    });

    it("robots.txt · 사이트맵 묶음은 .kr 것", async () => {
        const robots = await (await kr("/robots.txt")).text();
        expect(robots).toContain(`Sitemap: ${KR}/sitemap.xml`);
        expect(robots).not.toContain("rankue.co.kr");
        const idx = await kr("/sitemap.xml");
        const xml = await idx.text();
        expect(xml).toContain(`${KR}/sitemap-golf-courses.xml`);
        expect(xml).not.toContain("rankue.co.kr");
        expect(xml).not.toContain("sitemap-core.xml");
        expect(idx.headers.get("cache-control")).toBe("no-store");
    });

    it("사이트맵 구역 — 여는 주소만 .kr 로, 캐시에 싣지 않는다. 골프가 아닌 구역 · 피드는 없다", async () => {
        const r = await kr("/sitemap-golf-courses.xml");
        const xml = await r.text();
        expect(xml).toContain(`<loc>${KR}/golf/course/a</loc>`);
        expect(xml).not.toContain("rankue.co.kr");
        expect(xml).not.toContain("/golf/courses/x/y");
        expect(xml).not.toContain("golfer");
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(r.headers.get("content-type")).toContain("application/xml");
        for (const p of ["/sitemap-stores.xml", "/sitemap-hiking.xml", "/sitemap-golf.xml", "/sitemap-core.xml", "/rss.xml", "/feed.xml"]) expect((await kr(p)).status, p).toBe(404);
    });

    it("API · 그림은 그대로 지나간다 — 앱 화면이 .kr 에서도 돈다", async () => {
        const api = await kr("/api/hiq/thing", MAN);
        expect(api.status).toBe(200);
        // JSON 은 고치지 않는다(화면 코드가 받는 값이다)
        expect((await api.json()).data.url).toBe(`${MAIN}/golf/course/a`);
        expect((await kr("/og/x.png")).status).toBe(200);
        expect((await get("/api/hiq/thing", { host: "www.rankue.kr", ua: MAN, method: "POST" })).status).toBe(200);
        expect(reached).toEqual(["/api/hiq/thing", "/og/x.png", "POST /api/hiq/thing"]);
    });

    it("뿌리 도메인(rankue.kr)도 같은 규칙", async () => {
        expect((await get("/stores", { host: "rankue.kr" })).status).toBe(404);
    });
});

describe("www.rankue.co.kr — 골프 색인을 뺀다", () => {
    it("/golf 아래 봇 화면은 noindex — 대표 주소는 co.kr 자신 그대로, 링크도 그대로", async () => {
        for (const p of ["/golf", "/golf/course/a", "/golf/courses/x/y", "/golf/find/3people", "/golf/terms/b"]) {
            const r = await get(p);
            const html = await r.text();
            expect(r.status, p).toBe(200);
            expect(html, p).toContain('<meta name="robots" content="noindex, follow" />');
            expect(html, p).toContain(`<link rel="canonical" href="${MAIN}${p}" />`);
            expect(html, p).not.toContain("rankue.kr/");
            expect(html, p).toContain('<a href="/stores">당구장</a>');
            expect(r.headers.get("x-robots-tag"), p).toBe("noindex, follow");
        }
    });

    it("다른 화면은 손대지 않는다", async () => {
        for (const p of ["/", "/stores", "/world-ranking", "/golfer/owgr/1", "/golf-ranking", "/hiking"]) {
            const r = await get(p);
            const html = await r.text();
            expect(html, p).toContain('content="index, follow');
            expect(r.headers.get("x-robots-tag"), p).toBeNull();
        }
    });

    it("사이트맵 — /golf 아래 주소와 빈 구역을 뺀다. 캐시 설정은 그대로", async () => {
        const r = await get("/sitemap-golf.xml");
        const xml = await r.text();
        expect(xml).not.toContain("/golf/course/a");
        expect(xml).not.toContain("/golf/courses/x/y");
        expect(xml).toContain(`<loc>${MAIN}/golfer/owgr/1</loc>`);
        expect(r.headers.get("cache-control")).toContain("s-maxage=3600");
        const idx = await (await get("/sitemap.xml")).text();
        expect(idx).toContain("sitemap-core.xml");
        expect(idx).not.toContain("sitemap-golf-courses.xml");
    });

    it("스위치를 끄면(SITE_SPLIT=off) co.kr 은 예전 그대로", async () => {
        process.env.SITE_SPLIT = "off";
        const html = await (await get("/golf/course/a")).text();
        expect(html).toContain('content="index, follow');
        expect(await (await get("/sitemap-golf.xml")).text()).toContain("/golf/course/a");
        expect(await (await get("/sitemap.xml")).text()).toContain("sitemap-golf-courses.xml");
    });

    it("환경변수가 없으면 MAIN_DEINDEX_LIVE 를 따른다 — .kr 규칙은 그 값과 무관하게 늘 선다", async () => {
        delete process.env.SITE_SPLIT;
        const html = await (await get("/golf/course/a")).text();
        expect(html.includes("noindex, follow")).toBe(MAIN_DEINDEX_LIVE);
        expect((await get("/stores", { host: "www.rankue.kr" })).status).toBe(404);
        expect(await (await get("/golf/course/a", { host: "www.rankue.kr" })).text()).toContain(`${KR}/golf/course/a`);
    });

    it("사람 요청 · 모르는 호스트는 건드리지 않는다", async () => {
        const man = await (await get("/golf/course/a", { ua: MAN })).text();
        expect(man).toContain('content="index, follow');
        const preview = await (await get("/golf/course/a", { host: "rankue-abc.vercel.app" })).text();
        // 미리보기 주소는 main 으로 본다 — 골프 화면은 거기서도 noindex
        expect(preview).toContain("noindex, follow");
        expect(preview).toContain(`${MAIN}/golf/course/a`);
    });
});
