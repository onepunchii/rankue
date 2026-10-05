import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 — 모양만 본다(DB 를 끌고 오지 않게)
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    hubNav: () => "<nav>hub</nav>",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { renderGolfTerms, golfTermsSitemapParts } from "./golfTerms.js";
import { GOLF_TERMS, GOLF_TERMS_UPDATED, golfTermBySlug } from "../../shared/golfTerms.js";
import { GOLF_TERMS_PATH, GOLF_TERMS_TITLE, golfTermAnchorPath, golfTermPath, hasGolfTermPage } from "../../shared/golfTermsMeta.js";

const ORIGIN = "https://www.rankue.co.kr";
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
type Parts = { title: string; desc: string; canonical: string; body: string; jsonLd: any[]; noindex?: boolean; image?: { url: string } };
const parts = (html: string) => JSON.parse(html) as Parts;
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));

describe("/golf/terms 허브", () => {
    const r = renderGolfTerms("/golf/terms/")!;
    const p = parts(r.html);
    it("200 · 정본 · 골프 그림 · 용어 전부", () => {
        expect(r.status).toBe(200);
        expect(r.tag).toBe("golf-terms:hub");
        expect(p.canonical).toBe(`${ORIGIN}${GOLF_TERMS_PATH}`);
        expect(p.title).toBe(GOLF_TERMS_TITLE);
        expect(p.image!.url).toBe(`${ORIGIN}/og-golf.png`);
        expect(p.body.match(/<h1>/g)).toHaveLength(1);
        expect(p.body.match(/<dt id="/g)).toHaveLength(GOLF_TERMS.length);
        for (const t of GOLF_TERMS) { expect(p.body, t.term).toContain(`<dt id="${t.slug}">`); expect(p.body, t.term).toContain(esc(t.short)); }
    });
    it("자기 페이지가 있는 용어만 링크다", () => {
        expect(p.body).toContain(`<a href="${golfTermPath("버디")}">버디</a>`);
        expect(p.body).not.toContain(`<a href="${golfTermPath("파")}">`);
        expect(p.body.match(/<a href="\/golf\/terms\//g)).toHaveLength(GOLF_TERMS.filter(hasGolfTermPage).length);
    });
});

describe("/golf/terms/:slug", () => {
    it("자세한 풀이 — 절 제목과 글, 구조화 데이터, 색인", () => {
        const t = golfTermBySlug("양파")!;
        const r = renderGolfTerms(golfTermPath("양파"))!; // 인코딩된 경로 그대로
        const p = parts(r.html);
        expect(r.status).toBe(200);
        expect(r.tag).toBe(`golf-terms:${encodeURIComponent("양파")}`);
        expect(r.tag).toMatch(/^[\x20-\x7e]+$/);
        expect(p.title).toBe("양파 뜻 — 골프 용어 사전 | 랭큐 골프");
        expect(p.canonical).toBe(`${ORIGIN}${golfTermPath("양파")}`);
        expect(p.noindex).toBeFalsy();
        expect(p.body).toContain("<h1>🧅 양파</h1>");
        for (const k of ["meaning", "usage", "example", "confusion"] as const) expect(p.body).toContain(esc(t.page![k]));
        expect(p.body).toContain("<h2>헷갈리기 쉬운 것</h2>");
        expect(p.body).not.toContain("<h2>랭큐 골프에서는</h2>"); // 양파에는 앱 설명이 없다
        expect(p.jsonLd[0]["@graph"][0]["@type"]).toBe("DefinedTerm");
    });
    it("앱 설명·링크가 있는 용어는 그것까지", () => {
        const p = parts(renderGolfTerms(golfTermPath("조인"))!.html);
        expect(p.body).toContain("<h2>랭큐 골프에서는</h2>");
        expect(p.body).toContain('<a href="/golf/join">지금 올라온 조인 보기</a>');
        expect(p.body).toContain('<a href="/golf/find/2people">2인 플레이 가능 골프장</a>');
    });
    it("짧은 항목은 허브의 그 줄로 301, 모르는 말·잘못된 인코딩은 404(noindex)", () => {
        expect(renderGolfTerms(golfTermPath("파"))).toMatchObject({ status: 301, location: golfTermAnchorPath("파") });
        for (const bad of ["/golf/terms/%EC%97%86%EB%8A%94%EB%A7%90", "/golf/terms/%E0%A4%A", "/golf/terms/%20"]) {
            const r = renderGolfTerms(bad)!;
            expect(r.status, bad).toBe(404);
            expect(parts(r.html).noindex).toBe(true);
        }
        expect(renderGolfTerms("/golf/terms/a/b")).toBeNull();
        expect(renderGolfTerms("/golf/termsx")).toBeNull();
    });
});

describe("사이트맵과 길", () => {
    it("허브 + 자세한 풀이만 — 글을 고친 날로", () => {
        const got = golfTermsSitemapParts().map((s) => JSON.parse(s));
        const pages = GOLF_TERMS.filter(hasGolfTermPage);
        expect(got).toHaveLength(1 + pages.length);
        expect(got[0]).toEqual({ loc: `${ORIGIN}${GOLF_TERMS_PATH}`, changefreq: "monthly", priority: "0.7", lastmod: GOLF_TERMS_UPDATED });
        expect(got.map((g) => g.loc)).toContain(`${ORIGIN}${golfTermPath("버디")}`);
        expect(got.map((g) => g.loc)).not.toContain(`${ORIGIN}${golfTermPath("파")}`);
    });
    it("vercel.json 봇 라우트 · 프리렌더 라우트 · 화면 라우트 · 허브 내비 · 사이트맵이 같은 경로를 안다", () => {
        const vercel = JSON.parse(read("vercel.json")).routes.find((x: any) => String(x.src).includes("billiards/terms"));
        const re = new RegExp(`^${vercel.src}$`);
        for (const p of ["/golf/terms", "/golf/terms/", golfTermPath("버디")]) expect(re.test(p), p).toBe(true);
        expect(re.test("/golf/terms/a/b")).toBe(false);
        const pre = read("server/prerender.ts");
        expect(pre).toContain("app.get(/^\\/golf\\/terms(?:\\/[^/]+)?\\/?$/");
        expect(pre).toContain("[GOLF_TERMS_PATH, GOLF_TERMS_NAV_LABEL]");
        const app = read("client/src/App.tsx");
        expect(app).toContain('<Route path="/golf/terms" component={GolfTermsRoute} />');
        expect(app).toContain('<Route path="/golf/terms/:slug" component={GolfTermsRoute} />');
        expect(read("server/sitemap.ts")).toContain("...golfTermsSitemapParts()");
    });
});
