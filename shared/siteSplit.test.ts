import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    KR_NAV, KR_ORIGIN, KR_SITEMAP_SECTIONS, MAIN_ORIGIN, isAssetPath, krAllowed, krHtml, krLeaks, krNearest, krRobotsTxt,
    krSitemapIndex, krSitemapXml, mainDeindexed, mainNoindexHtml, mainSitemapXml, mainUrlFor, siteOfHost,
} from "./siteSplit";

/**
 * 2026-11-26 오너: 네이버 강등이 풀리지 않아 골프 공개 페이지를 www.rankue.kr 로 옮긴다. "복제하면 품질에 걸리지 않나?"
 * → 복제가 아니라 이사여야 한다. 여기는 그 규칙(shared/siteSplit.ts 머리말 1~5)을 고정한다.
 * 하나라도 깨지면 같은 글이 두 도메인에서 색인되거나, 두 도메인이 서로를 가리키게 된다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const ALLOWED = [
    "/golf", "/golf/", "/golf/courses", "/golf/courses/경기", "/golf/courses/%EA%B2%BD%EA%B8%B0", "/golf/course/자유로CC",
    "/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC", "/golf/booking", "/golf/join", "/golf/urgent", "/golf/checklist", "/golf/terms", "/golf/terms/버디",
];
const BLOCKED = [
    "/", "/dashboard", "/stores", "/stores/C00017", "/world-ranking", "/player/players/2980", "/hiking", "/hiking/mountains/북한산",
    "/fishing", "/festivals", "/golf/festivals", "/golf-ranking", "/golfer/owgr/123", "/golf/courses/경기/연천", "/golf/find/3people",
    "/golf/find/3people/경상", "/golf/stamps", "/golf/stamps/invite-capital", "/golf/shelf", "/golf/join/경기", "/golf/booking/경기/연천",
    "/golf/course", "/golf/course/a/b", "/golf/terms/a/b", "/golfx", "/admin", "/about", "/menu", "/chat", "/online-game",
];

describe("어느 도메인인가", () => {
    it("rankue.kr · www.rankue.kr 만 골프 도메인 — 나머지는 전부 원래 사이트", () => {
        for (const h of ["rankue.kr", "www.rankue.kr", "WWW.RANKUE.KR", "www.rankue.kr:443"]) expect(siteOfHost(h), h).toBe("kr");
        for (const h of ["www.rankue.co.kr", "rankue.co.kr", "localhost:5177", "rankue-abc.vercel.app", "www.rankue.kr.evil.com", "notrankue.kr", "", undefined, null])
            expect(siteOfHost(h), String(h)).toBe("main");
    });
});

describe(".kr 에 여는 주소", () => {
    it("골프 홈 · 목록 · 권역 · 골프장 · 조인/부킹/긴급 · 준비물 · 용어만", () => {
        for (const p of ALLOWED) expect(krAllowed(p), p).toBe(true);
        for (const p of BLOCKED) expect(krAllowed(p), p).toBe(false);
    });

    it("vercel.json 의 .kr 규칙과 같은 뜻이다 — 사람 요청을 서버로 보내는 주소 = 안 여는 주소", () => {
        const routes = JSON.parse(root("vercel.json")).routes as { src?: string; dest?: string; has?: { type: string; value: string }[]; status?: number }[];
        const kr = routes.filter((r) => r.has?.some((h) => h.type === "host" && /rankue\\\.kr/.test(h.value)));
        // 맨 앞 넷 중 셋(뿌리 도메인 → www · robots/첫 주소 · 안 여는 주소) + 맨 끝의 사람용 셸
        expect(kr).toHaveLength(4);
        expect(routes.indexOf(kr[0])).toBe(0);
        expect(kr[0].status).toBe(308);
        expect(kr[0].has![0].value).toBe("^rankue\\.kr$");
        for (const r of kr.slice(1)) expect(r.has![0].value).toBe("^www\\.rankue\\.kr$");
        expect(kr[3].dest).toBe("/index.kr.html");
        expect(routes.indexOf(kr[3])).toBe(routes.length - 2);

        const blockRe = new RegExp(`^(?:${kr[2].src})$`);
        const rootRe = new RegExp(`^(?:${kr[1].src})$`);
        for (const p of ALLOWED) expect(blockRe.test(p), `연다: ${p}`).toBe(false);
        for (const p of BLOCKED.filter((x) => x !== "/")) expect(blockRe.test(p), `막는다: ${p}`).toBe(true);
        expect(rootRe.test("/")).toBe(true);
        expect(rootRe.test("/robots.txt")).toBe(true);
        // 두 도메인에서 똑같이 나가야 하는 것은 건드리지 않는다
        for (const p of ["/api/hiq/me", "/og/golf-course/x.png", "/og-hub/golf-courses.jpg", "/assets/index-abc.js", "/img/golf-logos/454.png",
            "/sitemap.xml", "/sitemap-golf-courses.xml", "/manifest.json", "/sw.js", "/favicon.ico", "/og-golf.png", "/.well-known/assetlinks.json"])
            expect(blockRe.test(p), `그대로: ${p}`).toBe(false);
    });

    it("안 여는 주소의 가장 가까운 윗주소", () => {
        expect(krNearest("/golf/courses/경기/연천")).toBe("/golf/courses/경기");
        expect(krNearest("/golf/find/3people")).toBe("/golf");
        expect(krNearest("/")).toBe("/golf");
        expect(krNearest("/stores/C1")).toBe("/golf");
    });
});

describe("co.kr 에서 색인을 빼는 주소", () => {
    it("/golf 아래 전부 — 옮긴 것과 얇아서 안 옮긴 것 모두. 프로 선수 · 골프 랭킹 · 다른 종목은 그대로", () => {
        for (const p of [...ALLOWED, "/golf/courses/경기/연천", "/golf/find/3people", "/golf/stamps", "/golf/shelf", "/golf/festivals"]) expect(mainDeindexed(p), p).toBe(true);
        for (const p of ["/", "/golf-ranking", "/golfer/owgr/1", "/golfx", "/stores", "/hiking", "/world-ranking"]) expect(mainDeindexed(p), p).toBe(false);
    });

    it(".kr 에 여는 주소는 빠짐없이 co.kr 에서 색인이 빠진다 — 두 곳에서 색인되는 주소가 없다", () => {
        for (const p of ALLOWED) expect(mainDeindexed(p), p).toBe(true);
    });

    it("robots 메타를 noindex 로 바꾼다", () => {
        const html = `<head><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />\n<link rel="canonical" href="${MAIN_ORIGIN}/golf" /></head>`;
        const out = mainNoindexHtml(html);
        expect(out).toContain('<meta name="robots" content="noindex, follow" />');
        // 대표 주소는 그대로 co.kr 자신 — .kr 을 가리키게 하지 않는다(규칙 2)
        expect(out).toContain(`<link rel="canonical" href="${MAIN_ORIGIN}/golf" />`);
        expect(out).not.toContain("rankue.kr/");
    });
});

const PAGE = `<!DOCTYPE html>
<html lang="ko">
<head>
  <title>자유로CC(연천) 날씨·그린피·부킹·조인 | 랭큐 골프</title>
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <link rel="canonical" href="${MAIN_ORIGIN}/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC" />
  <link rel="alternate" hreflang="ko" href="${MAIN_ORIGIN}/golf/course/x" />
  <link rel="alternate" hreflang="x-default" href="${MAIN_ORIGIN}/golf/course/x" />
  <meta property="og:url" content="${MAIN_ORIGIN}/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC" />
  <meta property="og:image" content="${MAIN_ORIGIN}/og/golf-course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC.png?v=2" />
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"GolfCourse","@id":"${MAIN_ORIGIN}/golf/course/x#course","url":"${MAIN_ORIGIN}/golf/course/x","image":"${MAIN_ORIGIN}/og/golf-course/x.png?v=2","logo":"${MAIN_ORIGIN}/img/golf-logos/454.png","publisher":{"@id":"${MAIN_ORIGIN}/#organization"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"전국 골프장","item":"${MAIN_ORIGIN}/golf/courses"},{"@type":"ListItem","position":2,"name":"경기","item":"${MAIN_ORIGIN}/golf/courses/경기"},{"@type":"ListItem","position":3,"name":"연천","item":"${MAIN_ORIGIN}/golf/courses/경기/연천"},{"@type":"ListItem","position":4,"name":"자유로CC","item":"${MAIN_ORIGIN}/golf/course/x"}]}]}</script>
</head>
<body>
<main>
  <nav aria-label="경로"><a href="/golf/courses">전국 골프장</a> › <a href="/golf/courses/%EA%B2%BD%EA%B8%B0">경기·수도권</a> › <a href="/golf/courses/%EA%B2%BD%EA%B8%B0/%EC%97%B0%EC%B2%9C">연천</a> › 자유로CC</nav>
  <h1>자유로CC</h1>
  <img src="${MAIN_ORIGIN}/img/golf-logos/454.png" alt="" />
  <p><a href="https://map.kakao.com/link/map/1">카카오맵에서 보기</a> · <a href="tel:031-839-1500">031-839-1500</a> · <a href="#sec-1">날씨</a></p>
  <p><a href="/golf/find/3people">3인 플레이 골프장</a> · <a href="/golf/stamps">도장깨기</a> · <a href="/">랭큐</a> · <a href="${MAIN_ORIGIN}/stores">당구장</a> · <a href="/golf/course/%ED%83%80%EC%9D%B4%EA%B1%B0CC">타이거CC</a></p>
  <nav aria-label="RANKUE"><a href="/">랭큐 홈</a> · <a href="/world-ranking">당구 세계랭킹</a> · <a href="/hiking">전국 명산</a> · <a href="/stores">당구장</a></nav>
</main>
</body>
</html>`;

describe(".kr 봇 화면", () => {
    const out = krHtml(PAGE);

    it("대표 주소 · og · 그림은 .kr 자신을 가리킨다", () => {
        expect(out).toContain(`<link rel="canonical" href="${KR_ORIGIN}/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC" />`);
        expect(out).toContain(`<meta property="og:url" content="${KR_ORIGIN}/golf/course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC" />`);
        expect(out).toContain(`content="${KR_ORIGIN}/og/golf-course/%EC%9E%90%EC%9C%A0%EB%A1%9CCC.png?v=2"`);
        expect(out).toContain(`<img src="${KR_ORIGIN}/img/golf-logos/454.png"`);
        expect(out).toContain('content="index, follow');
    });

    it("co.kr 로 가는 것이 하나도 남지 않는다 — 링크 · 대표 주소 · hreflang", () => {
        expect(krLeaks(out)).toEqual([]);
        expect(out).not.toContain("rankue.co.kr");
        expect(out).not.toContain("hreflang");
    });

    it("안 여는 곳으로 가는 링크는 글자만 남는다 · 여는 곳과 바깥 사이트 링크는 그대로", () => {
        expect(out).toContain("› 연천 › 자유로CC");
        expect(out).not.toMatch(/href="\/golf\/courses\/%EA%B2%BD%EA%B8%B0\/%EC%97%B0%EC%B2%9C"/);
        expect(out).toContain('<a href="/golf/courses/%EA%B2%BD%EA%B8%B0">경기·수도권</a>');
        expect(out).toContain("3인 플레이 골프장 · 도장깨기");
        expect(out).not.toContain('href="/golf/find');
        expect(out).toContain('<a href="/golf">랭큐</a>');
        expect(out).toContain(" · 당구장 · ");
        expect(out).toContain('<a href="/golf/course/%ED%83%80%EC%9D%B4%EA%B1%B0CC">타이거CC</a>');
        expect(out).toContain('<a href="https://map.kakao.com/link/map/1">');
        expect(out).toContain('<a href="tel:031-839-1500">');
        expect(out).toContain('<a href="#sec-1">');
    });

    it("공용 길잡이 자리에는 골프 길잡이 — 다른 종목 링크가 없다", () => {
        expect(out).not.toContain("당구 세계랭킹");
        expect(out).not.toContain("전국 명산");
        for (const [href, label] of KR_NAV) {
            expect(krAllowed(href), href).toBe(true);
            expect(out).toContain(`<a href="${href}">${label}</a>`);
        }
    });

    it("구조화 데이터 — 주소는 .kr, 안 여는 경로 조각은 빼고 번호를 다시 매긴다", () => {
        const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(out)![1]);
        const [course, crumbs] = ld["@graph"];
        expect(course["@id"]).toBe(`${KR_ORIGIN}/golf/course/x#course`);
        expect(course.url).toBe(`${KR_ORIGIN}/golf/course/x`);
        expect(course.logo).toBe(`${KR_ORIGIN}/img/golf-logos/454.png`);
        expect(course.publisher["@id"]).toBe(`${KR_ORIGIN}/golf#organization`);
        expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["전국 골프장", "경기", "자유로CC"]);
        expect(crumbs.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
        expect(JSON.stringify(ld)).not.toContain("rankue.co.kr");
    });

    it("새는 곳을 잡아낸다 — 고치지 않은 화면은 걸린다", () => {
        expect(krLeaks(PAGE).length).toBeGreaterThan(5);
    });
});

const urlset = (...locs: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${locs
        .map((l) => `  <url>\n    <loc>${MAIN_ORIGIN}${l}</loc>\n    <lastmod>2026-11-01</lastmod>\n    <image:image><image:loc>${MAIN_ORIGIN}/og/x.png</image:loc></image:image>\n  </url>`).join("\n")}\n</urlset>\n`;
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("사이트맵", () => {
    const mixed = urlset("/golf", "/golf/course/a", "/golf/courses/경기", "/golf/courses/경기/연천", "/golf/find/3people", "/golfer/owgr/1", "/golf-ranking", "/golf/terms/버디", "/billiards/terms/x");

    it("co.kr — /golf 아래를 뺀다. 프로 선수 · 골프 랭킹 · 다른 종목은 남는다", () => {
        expect(locs(mainSitemapXml(mixed))).toEqual([`${MAIN_ORIGIN}/golfer/owgr/1`, `${MAIN_ORIGIN}/golf-ranking`, `${MAIN_ORIGIN}/billiards/terms/x`]);
    });

    it("co.kr 묶음 — 통째로 비는 구역(골프장 · 골프 허브)을 뺀다", () => {
        const index = `<sitemapindex>\n${["core", "golf", "golf-courses", "golf-hubs", "stores"].map((s) => `  <sitemap>\n    <loc>${MAIN_ORIGIN}/sitemap-${s}.xml</loc>\n  </sitemap>`).join("\n")}\n</sitemapindex>`;
        expect(locs(mainSitemapXml(index))).toEqual(["core", "golf", "stores"].map((s) => `${MAIN_ORIGIN}/sitemap-${s}.xml`));
    });

    it("co.kr 의 구글 전용 묶음에서도 같은 구역을 뺀다", () => {
        const index = `<sitemapindex>\n${["core", "golf", "golf-courses", "golf-hubs"].map((s) => `  <sitemap>\n    <loc>${MAIN_ORIGIN}/sitemap-google-${s}.xml</loc>\n  </sitemap>`).join("\n")}\n</sitemapindex>`;
        expect(locs(mainSitemapXml(index))).toEqual(["core", "golf"].map((s) => `${MAIN_ORIGIN}/sitemap-google-${s}.xml`));
    });

    it(".kr — 여는 주소만, 도메인은 .kr(그림 주소 포함)", () => {
        const out = krSitemapXml(mixed);
        expect(locs(out)).toEqual(["/golf", "/golf/course/a", "/golf/courses/경기", "/golf/terms/버디"].map((p) => KR_ORIGIN + p));
        expect(out).not.toContain("rankue.co.kr");
        expect(out).toContain(`<image:loc>${KR_ORIGIN}/og/x.png</image:loc>`);
        expect(out.trim().endsWith("</urlset>")).toBe(true);
    });

    it("두 도메인의 사이트맵에 같은 주소(경로)가 겹치지 않는다", () => {
        const a = new Set(locs(mainSitemapXml(mixed)).map((u) => u.replace(MAIN_ORIGIN, "")));
        for (const u of locs(krSitemapXml(mixed))) expect(a.has(u.replace(KR_ORIGIN, "")), u).toBe(false);
    });

    it(".kr 묶음과 robots", () => {
        expect(locs(krSitemapIndex())).toEqual(KR_SITEMAP_SECTIONS.map((s) => `${KR_ORIGIN}/sitemap-${s}.xml`));
        expect(krRobotsTxt()).toContain(`Sitemap: ${KR_ORIGIN}/sitemap.xml`);
        expect(krRobotsTxt()).not.toContain("rankue.co.kr");
    });
});

describe("뼈대", () => {
    it("301 · 교차 대표 주소를 걸지 않는다 — .kr 에서 co.kr 로 보내는 것은 302 뿐", () => {
        const server = root("server/siteSplit.ts");
        expect(server).toContain("res.redirect(302, mainUrlFor(req.originalUrl))");
        // 301 은 같은 도메인 안의 '/' → '/golf' 하나뿐
        expect(server.match(/redirect\(301/g)).toHaveLength(1);
        expect(server).toContain('res.redirect(301, "/golf")');
        expect(mainUrlFor("/stores?x=1")).toBe(`${MAIN_ORIGIN}/stores?x=1`);
    });

    it("가르는 미들웨어가 사이트맵 · 프리렌더보다 먼저 걸린다", () => {
        const routes = root("server/routes.ts");
        expect(routes.indexOf("registerSiteSplit(app)")).toBeGreaterThan(-1);
        expect(routes.indexOf("registerSiteSplit(app)")).toBeLessThan(routes.indexOf("registerSitemap(app)"));
        expect(routes.indexOf("registerSiteSplit(app)")).toBeLessThan(routes.indexOf("registerPrerender(app)"));
    });

    it("사람용 .kr 첫 문서를 빌드가 만든다 — 없으면 .kr 의 사람 화면이 전부 404 다", () => {
        expect(JSON.parse(root("package.json")).scripts.build).toContain("vite build && node scripts/make-kr-shell.mjs");
    });

    it("그림 · 파일 · API 는 화면이 아니다", () => {
        for (const p of ["/api/hiq/me", "/og/a.png", "/assets/x.js", "/img/a/b.png", "/og-golf.png", "/robots.txt"]) expect(isAssetPath(p), p).toBe(true);
        for (const p of ["/golf", "/golf/course/자유로CC", "/stores"]) expect(isAssetPath(p), p).toBe(false);
    });
});
