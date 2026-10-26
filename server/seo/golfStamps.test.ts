import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 — 모양만 본다(DB · 프리렌더 전체를 끌고 오지 않게. seo/golfGuide.test.ts 와 같은 방식).
// 썸네일은 조각에 싣지 않는다 — page() 가 주소를 보고 허브 카드를 고른다(그 규칙은 shared/pageCovers.test.ts 가 본다).
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    hubNav: () => "<nav>hub</nav>",
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { GOLF_STAMPS_RE, golfStampsSitemapParts, renderGolfStamps } from "./golfStamps";
import { hubCard } from "../../shared/ogCards";
import { STAMP_BOOKS } from "../../shared/golfStampBooks";
import { GOLF_PINS } from "../../shared/golfPins";
import { coursePath } from "../../shared/golfCourse";
import {
    STAMPS_HUB_PATH, STAMPS_NAV_LABEL, STAMP_GUIDE_STEPS, STAMP_INVITE_ASIDE, STAMP_INVITE_NOTE, STAMP_INVITE_TITLE, STAMP_OPEN_ASIDE, STAMP_OPEN_TITLE, STAMP_SHELF_PATH,
    SHELF_HIDDEN_HOW, SHELF_HIDDEN_NAME, SHELF_MARKER_TITLE, SHELF_PIN_TITLE, SHELF_SPECIAL_NOTE, SHELF_SPECIAL_TITLE, SHELF_TAG_NOTE, SHELF_TAG_TITLE, SHELF_TIER_NOTE, SHELF_TROPHY_TITLE, stampBookPath, stampBookSeo, stampShelfSeo, stampsHubSeo,
} from "../../shared/golfStampGuide";

/**
 * 골프 도장깨기의 검색용 화면(2026-10-12) — 책장 · 도장첩 아홉 권 · 장식장이 검색 로봇에게 제목도 본문도 없는 껍데기로 나가던 것을 고쳤다.
 * 봇에게만 있는 문장을 만들지 않는다 — 화면과 같은 글(shared)을 쓰는지도 여기서 본다.
 */
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const gangwon = STAMP_BOOKS.find((b) => b.id === "gangwon")!;
/** page() 에 넘긴 조각 */
const doc = (r: { html: string }) => JSON.parse(r.html) as { title: string; desc: string; canonical: string; body: string; image?: unknown; lang: string; jsonLd: unknown[] };
const ORIGIN = "https://www.rankue.co.kr";

describe("/golf/stamps 책장", () => {
    const r = renderGolfStamps("/golf/stamps")!;

    it("제목 · 설명 · 정본 주소 · 썸네일(허브 카드)", () => {
        const seo = stampsHubSeo();
        expect(r.status).toBe(200);
        expect(doc(r)).toMatchObject({ title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${STAMPS_HUB_PATH}`, lang: "ko" });
        // 조각에 그림을 싣지 않는다 — page() 가 이 주소의 허브 카드를 고른다. 본문에는 그 카드가 그림으로 들어간다
        expect(doc(r).image).toBeUndefined();
        expect(hubCard(ORIGIN, STAMPS_HUB_PATH)!.url).toBe(`${ORIGIN}/og-hub/golf-stamps.jpg?v=1`);
        expect(doc(r).body).toContain(`<img src="${ORIGIN}/og-hub/golf-stamps.jpg?v=1" width="1200" height="1200" alt="골프 도장깨기 — 랭큐 골프" />`);
        expect(r.tag).toBe("golf:stamps");
    });

    it("아홉 권이 다 있고 권마다 그 권으로 가는 링크 · 골프장 이름", () => {
        for (const b of STAMP_BOOKS) {
            expect(doc(r).body, b.id).toContain(`<a href="${stampBookPath(b.id)}">${b.name} 도장첩</a>`);
            for (const s of b.slots) expect(text(doc(r).body), s.name).toContain(s.name);
        }
        expect(text(doc(r).body)).toContain(STAMP_OPEN_ASIDE);
        expect(text(doc(r).body)).toContain(STAMP_INVITE_NOTE);
        for (const s of STAMP_GUIDE_STEPS) { expect(text(doc(r).body)).toContain(s.title); expect(text(doc(r).body)).toContain(s.body); }
    });

    it("끝에 빗금이 붙어도 같은 화면", () => {
        expect(renderGolfStamps("/golf/stamps/")!.tag).toBe("golf:stamps");
    });
});

describe("/golf/stamps/<권> 도장첩 한 권", () => {
    const pages = gangwon.slots.slice(0, 3).map((s, i) => ({ slug: `강원-골프장-${i}`, courseIds: [s.courseIds[0], 99000 + i] }));
    const r = renderGolfStamps("/golf/stamps/gangwon", pages)!;

    it("제목 · 썸네일(그 권의 카드) · 골프장 목록", () => {
        const seo = stampBookSeo(gangwon);
        expect(doc(r)).toMatchObject({ title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}` });
        expect(doc(r).body).toContain(`<img src="${ORIGIN}/og-hub/golf-stamps-gangwon.jpg?v=1"`);
        expect(doc(r).body).toContain(`<h1>${gangwon.name} 도장첩</h1>`);
        for (const s of gangwon.slots) expect(text(doc(r).body), s.name).toContain(s.name);
        expect(text(doc(r).body)).toContain(`다 채우면 받는 볼마커 — ${gangwon.name} 볼마커`);
        expect(r.tag).toBe("golf:stamps:gangwon");
    });

    it("슬러그를 찾은 칸은 그 골프장 공개 페이지로 잇고, 못 찾은 칸은 이름만 적는다(숫자 주소로 잇지 않는다)", () => {
        expect(doc(r).body).toContain(`<li><a href="${coursePath("강원-골프장-0")}">${gangwon.slots[0].name}</a></li>`);
        expect(doc(r).body).toContain(`<li>${gangwon.slots[3].name}</li>`);
        expect(doc(r).body).not.toMatch(/href="\/golf\/course\/\d+"/);
        // 요약을 못 받아도(빈 목록) 화면은 나간다
        const bare = renderGolfStamps("/golf/stamps/gangwon")!;
        expect(doc(bare).body).not.toContain("/golf/course/");
        for (const s of gangwon.slots) expect(text(doc(bare).body)).toContain(s.name);
    });

    it("다른 여덟 권으로 가는 링크가 있다. 초대장 권은 회원제라고 적는다", () => {
        for (const b of STAMP_BOOKS.filter((x) => x.id !== "gangwon")) expect(doc(r).body, b.id).toContain(`<a href="${stampBookPath(b.id)}">`);
        const invite = renderGolfStamps("/golf/stamps/invite-capital")!;
        expect(text(doc(invite).body)).toContain("회원제 골프장");
        expect(doc(invite).title).toContain("회원제 골프장 11곳");
    });

    it("없는 권 · 모양이 틀린 주소는 넘긴다(화면이 '없는 도장첩이에요'를 그린다)", () => {
        for (const p of ["/golf/stamps/nowhere", "/golf/stamps/gangwon/x", "/golf/stampsx", "/golf/stamps/GANGWON", "/golf/shelf/x"]) expect(renderGolfStamps(p), p).toBeNull();
    });
});

describe("/golf/shelf 장식장", () => {
    const r = renderGolfStamps("/golf/shelf")!;

    it("볼마커 열 · 트로피 다섯 · 업적 핀 아홉 — 화면의 세 구역과 같은 이름", () => {
        expect(doc(r).title).toBe(stampShelfSeo().title);
        for (const h of [SHELF_MARKER_TITLE, SHELF_TROPHY_TITLE, SHELF_TAG_TITLE, SHELF_SPECIAL_TITLE, SHELF_PIN_TITLE]) expect(doc(r).body).toContain(`>${h}</h2>`);
        // 등급 · 태그 · 한정 볼마커의 설명도 화면과 같은 글. 숨은 볼마커의 조건은 검색용 화면에도 내지 않는다
        for (const t of [SHELF_TIER_NOTE, SHELF_TAG_NOTE, SHELF_SPECIAL_NOTE]) expect(doc(r).body).toContain(t);
        expect(doc(r).body).toContain(`${SHELF_HIDDEN_NAME} — ${SHELF_HIDDEN_HOW}`);
        expect(doc(r).body).not.toMatch(/1월 1일|새해 첫 티/);
        for (const b of STAMP_BOOKS) expect(text(doc(r).body)).toContain(`${b.name} 볼마커`);
        for (const p of GOLF_PINS) expect(text(doc(r).body), p.id).toContain(`${p.name} — ${p.how}`);
        expect(text(doc(r).body)).toContain("트로피 10곳");
        expect(doc(r).body).toContain(`<img src="${ORIGIN}/og-hub/golf-stamps.jpg?v=1"`);
    });
});

describe("봇이 여기까지 오는 길 — 네 곳", () => {
    it("① vercel.json 봇 라우트 ② 프리렌더 라우트 — 같은 주소를 받는다", () => {
        const src = JSON.parse(read("vercel.json")).routes.map((x: any) => x.src).find((x: string) => x?.includes("golf/checklist")) as string;
        const re = new RegExp(`^${src}$`);
        for (const p of [STAMPS_HUB_PATH, `${STAMPS_HUB_PATH}/`, stampBookPath("gangwon"), stampBookPath("invite-capital"), STAMP_SHELF_PATH]) {
            expect(re.test(p), `vercel ${p}`).toBe(true);
            expect(GOLF_STAMPS_RE.test(p), `route ${p}`).toBe(true);
        }
        expect(GOLF_STAMPS_RE.test("/golf/stamps/a/b")).toBe(false);
        expect(read("server/prerender.ts")).toContain("  app.get(GOLF_STAMPS_RE, async (req, res, next) => {");
    });

    it("④ 사이트맵 — 책장 · 아홉 권 · 장식장, 썸네일과 함께. 허브 내비에 도장깨기가 있다", () => {
        const parts = golfStampsSitemapParts();
        expect(parts).toHaveLength(STAMP_BOOKS.length + 2);
        const rows = parts.map((x) => JSON.parse(x));
        expect(rows[0]).toMatchObject({ loc: `${ORIGIN}${STAMPS_HUB_PATH}`, image: `${ORIGIN}/og-hub/golf-stamps.jpg?v=1`, changefreq: "monthly" });
        expect(rows.find((x) => x.loc === `${ORIGIN}${stampBookPath("gangwon")}`).image).toBe(`${ORIGIN}/og-hub/golf-stamps-gangwon.jpg?v=1`);
        expect(rows.at(-1).loc).toBe(`${ORIGIN}${STAMP_SHELF_PATH}`);
        expect(code(read("server/sitemap.ts"))).toContain("...golfGuideSitemapParts(), ...golfStampsSitemapParts()]");
        // 허브 내비 — 한국어 문서에만 건다
        expect(read("server/prerender.ts")).toContain("    ...(ko ? [[STAMPS_HUB_PATH, STAMPS_NAV_LABEL] as [string, string]] : []),");
        expect(STAMPS_NAV_LABEL).toBe("골프 도장깨기");
    });
});

describe("화면과 같은 글", () => {
    it("책장의 구역 이름 · 안내, 세 단계 — 화면이 쓰는 글자와 같다", () => {
        const books = read("client/src/golf/pages/StampBooks.tsx");
        expect(books).toContain(`<StampSection title="${STAMP_OPEN_TITLE}" sample={sample}`);
        expect(books).toContain(`<StampSection title="${STAMP_INVITE_TITLE}" sample={sample}`);
        expect(books).toContain(STAMP_INVITE_NOTE);
        expect(STAMP_OPEN_ASIDE).toBe("대중제 코스가 있는 36곳");
        expect(STAMP_INVITE_ASIDE).toBe("회원제 20곳");
        const help = code(read("client/src/golf/stamps/StampHelp.tsx"));
        for (const i of [0, 1, 2]) { expect(help).toContain(`STAMP_GUIDE_STEPS[${i}].title`); expect(help).toContain(`STAMP_GUIDE_STEPS[${i}].body`); }
        const shelf = read("client/src/golf/pages/GolfShelf.tsx");
        for (const h of [SHELF_MARKER_TITLE, SHELF_TROPHY_TITLE, SHELF_TAG_TITLE, SHELF_SPECIAL_TITLE, SHELF_PIN_TITLE]) expect(shelf).toContain(`<StampSection title="${h}"`);
    });

    it("세 화면이 검색용 화면과 같은 제목 · 설명을 단다", () => {
        expect(code(read("client/src/golf/pages/StampBooks.tsx"))).toContain("useSeo({ title: seo.title, description: seo.desc, path: seo.path });");
        expect(code(read("client/src/golf/pages/StampBook.tsx"))).toContain("useSeo(seo ? { title: seo.title, description: seo.desc, path: seo.path } : null);");
        expect(code(read("client/src/golf/pages/GolfShelf.tsx"))).toContain("const seo = stampShelfSeo();");
    });
});
