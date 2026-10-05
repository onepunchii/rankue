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

import { renderGolfChecklist, golfGuideSitemapParts } from "./golfGuide.js";
import { PACK_BASE, PACK_FAQ, PACK_FIRST, PACK_SEASONS, PACK_TITLE, PACK_DESC, PACK_WEATHER, PACK_WEATHER_NOTE, PACK_UPDATED } from "../../shared/golfPack.js";

const ORIGIN = "https://www.rankue.co.kr";
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");

describe("/golf/checklist 검색엔진용 화면", () => {
    const r = renderGolfChecklist();
    const p = JSON.parse(r.html) as { title: string; desc: string; canonical: string; body: string; jsonLd: any[]; image: { url: string }; noindex?: boolean };

    it("200 · 정본 주소 · 골프 그림 · 색인", () => {
        expect(r.status).toBe(200);
        expect(r.tag).toBe("golf:checklist");
        expect(r.tag).toMatch(/^[\x20-\x7e]+$/); // X-Prerender 에 한글이 들어가면 Node 가 죽는다
        expect(p.canonical).toBe(`${ORIGIN}/golf/checklist`);
        expect(p.title).toBe(PACK_TITLE);
        expect(p.desc).toBe(PACK_DESC);
        expect(p.image.url).toBe(`${ORIGIN}/og-golf.png`);
        expect(p.noindex).toBeFalsy();
    });
    it("화면의 글이 전부 있다 — 늘 챙기는 것·날씨별·계절별·처음 가는 날·자주 묻는 것", () => {
        expect(p.body.match(/<h1>/g)).toHaveLength(1);
        for (const i of PACK_BASE) { expect(p.body).toContain(`${i.emoji} ${i.label}`); if (i.note) expect(p.body).toContain(i.note); }
        for (const w of PACK_WEATHER) { expect(p.body).toContain(w.when); for (const g of w.gear) expect(p.body).toContain(g); }
        expect(p.body).toContain(PACK_WEATHER_NOTE);
        for (const s of PACK_SEASONS) { expect(p.body).toContain(`${s.emoji} ${s.title}`); expect(p.body).toContain(s.lead); for (const i of s.items) expect(p.body).toContain(i.label); }
        for (const t of PACK_FIRST) expect(p.body).toContain(t);
        for (const f of PACK_FAQ) { expect(p.body).toContain(f.q); expect(p.body).toContain(f.a); }
        expect(p.body).toContain('href="/golf/courses"');
        expect(p.body).toContain("<nav>hub</nav>");
    });
    it("구조화 데이터 — 질문·답(FAQPage)과 경로(BreadcrumbList)", () => {
        expect(p.jsonLd.map((o) => o["@type"])).toEqual(["FAQPage", "BreadcrumbList"]);
        expect(p.jsonLd[0].mainEntity).toHaveLength(PACK_FAQ.length);
        expect(p.jsonLd[1].itemListElement.at(-1).item).toBe(`${ORIGIN}/golf/checklist`);
    });
    it("사이트맵 — 글을 고친 날로", () => {
        expect(golfGuideSitemapParts().map((s) => JSON.parse(s))).toEqual([{ loc: `${ORIGIN}/golf/checklist`, changefreq: "monthly", priority: "0.6", lastmod: PACK_UPDATED }]);
    });
});

describe("봇이 여기까지 오는 길 — 셋이 같은 경로를 안다", () => {
    it("vercel.json 봇 라우트 · 프리렌더 라우트 · 화면 라우트 · 허브 내비", () => {
        const vercel = JSON.parse(read("vercel.json")).routes.find((x: any) => String(x.src).includes("billiards/terms"));
        expect(new RegExp(`^${vercel.src}$`).test("/golf/checklist")).toBe(true);
        expect(new RegExp(`^${vercel.src}$`).test("/golf/checklist/")).toBe(true);
        const pre = read("server/prerender.ts");
        expect(pre).toContain("app.get(/^\\/golf\\/checklist\\/?$/");
        expect(pre).toContain("[PACK_PATH, PACK_NAV_LABEL]");
        expect(read("client/src/App.tsx")).toContain('<Route path="/golf/checklist" component={GolfChecklistRoute} />');
        expect(read("server/sitemap.ts")).toContain("golfGuideSitemapParts()");
    });
});
