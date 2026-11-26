/**
 * 도메인 나누기(2026-11-26 오너) — 골프 공개 페이지를 `www.rankue.kr` 로 '이사'한다.
 *
 * 왜: 2026-11-07 밤 네이버가 rankue.co.kr 을 사이트 단위로 강등했다(memory naver-demotion-1107). 회복이 없어 종목을 새 도메인으로
 * 하나씩 옮겨 보기로 했다 — 첫 번째가 골프. co.kr 은 앱 · 로그인 · 당구가 쓰는 주소라 그대로 남는다.
 *
 * 지키는 규칙(하나라도 어기면 '이사'가 아니라 '복제'가 된다):
 *  1. 같은 페이지가 검색에 잡히는 주소는 한 곳뿐 — .kr 의 골프 페이지는 index, co.kr 의 /golf 아래는 전부 noindex + 사이트맵에서 뺌.
 *  2. **301 도, .kr 을 가리키는 canonical 도 걸지 않는다** — 둘 다 '옛 평가를 합쳐 달라'는 신호라 강등이 따라갈 수 있다.
 *  3. .kr 에는 여기 적힌 골프 주소만 연다. 그 밖은 봇에게 404, 사람은 co.kr 로 보낸다(302).
 *  4. 두 도메인을 서로 대량으로 링크하지 않는다 — .kr 봇 화면에는 co.kr 로 가는 링크를 싣지 않는다.
 *  5. 얇은 묶음(시군 허브 131 · 조건 조합 21 · 도장첩 10 · 프로 선수 634)은 .kr 에 가져가지 않는다(11/26 전수 점검: 고유 본문 13~23%).
 *
 * 두 단계로 켠다: ① .kr 규칙만 먼저 배포해 .kr 응답을 확인하고(MAIN_DEINDEX_LIVE=false — co.kr 은 예전 그대로)
 * ② DNS 가 붙은 날 MAIN_DEINDEX_LIVE 를 true 로 바꿔 co.kr 의 골프 색인을 뺀다. ①과 ② 사이에는 같은 글이 두 도메인에서 index 로 나가므로
 * **며칠씩 벌려 두지 말 것**. 환경변수 SITE_SPLIT=on|off 가 이 값을 덮는다(급히 되돌릴 때). .kr 을 닫으려면 Vercel 에서 도메인을 뗀다. 종목을 더 옮길 때는 KR_ALLOWED 와 vercel.json 의 .kr 규칙을 **같이** 고친다(시험이 견준다).
 *
 * 이 파일은 순수 함수만 둔다(서버 · 화면 · 시험이 같이 쓴다). 요청을 받아 가르는 일은 server/siteSplit.ts.
 */

/** co.kr 의 골프 색인 빼기(noindex · 사이트맵 제외)를 켰는가 — 머리말의 ②. 켜는 날 true 로 */
// 2026-11-26 16:10 켬 — DNS · https 가 붙고 .kr 527주소를 https 로 전수 확인한 뒤(전부 200 · index · 자기 canonical · co.kr 글자 0)
export const MAIN_DEINDEX_LIVE = true;

export const MAIN_ORIGIN = "https://www.rankue.co.kr";
export const KR_ORIGIN = "https://www.rankue.kr";

export type Site = "main" | "kr";

/** 요청의 Host → 어느 사이트인가. 모르는 호스트(미리보기 · localhost)는 main */
export function siteOfHost(host: string | null | undefined): Site {
    const h = String(host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    return h === "rankue.kr" || h === "www.rankue.kr" ? "kr" : "main";
}

/** 주소의 경로만 — 끝의 / 를 떼고, %XX 는 푼다(견줄 때만 쓴다) */
export function normPath(pathname: string): string {
    let p = pathname.split("?")[0].split("#")[0];
    try { p = decodeURIComponent(p); } catch { /* 깨진 %XX 는 그대로 */ }
    p = p.replace(/\/+$/, "");
    return p === "" ? "/" : p;
}

/**
 * .kr 에 여는 골프 주소. ⚠️ vercel.json 의 .kr 규칙(KR_PAGE_PREFIX)과 같은 뜻이어야 한다.
 *  · /golf — 골프 홈
 *  · /golf/courses, /golf/courses/<권역> — 전국 목록과 권역 여섯(시군 단계는 얇아서 안 연다)
 *  · /golf/course/<골프장> — 골프장 490곳
 *  · /golf/booking · /golf/join · /golf/urgent — 목록의 첫 화면만(지역으로 쪼갠 주소는 안 연다)
 *  · /golf/checklist · /golf/terms · /golf/terms/<용어>
 */
const KR_ALLOWED: RegExp[] = [
    /^\/golf$/,
    /^\/golf\/courses(?:\/[^/]+)?$/,
    /^\/golf\/course\/[^/]+$/,
    /^\/golf\/(?:booking|join|urgent|checklist)$/,
    /^\/golf\/terms(?:\/[^/]+)?$/,
];
export function krAllowed(pathname: string): boolean {
    const p = normPath(pathname);
    return KR_ALLOWED.some((re) => re.test(p));
}

/** co.kr 에서 색인을 빼는 주소 — /golf 아래 전부(옮긴 것 + 얇아서 안 옮긴 것). /golfer · /golf-ranking 은 그대로 둔다 */
export function mainDeindexed(pathname: string): boolean {
    const p = normPath(pathname);
    return p === "/golf" || p.startsWith("/golf/");
}

/** 화면(문서)이 아닌 요청 — API · 그림 · 정적 파일 · 사이트맵. 두 도메인에서 똑같이 나간다 */
export function isAssetPath(pathname: string): boolean {
    const p = pathname.split("?")[0];
    return /^\/(?:api|og|og-hub|assets|img|\.well-known)\//.test(p) || /\.[a-z0-9]{2,5}$/i.test(p);
}

/** .kr 에서 안 여는 주소에 가장 가까운, 여는 윗주소(없으면 /golf) */
export function krNearest(pathname: string): string {
    const segs = normPath(pathname).split("/").filter(Boolean);
    while (segs.length) {
        const p = "/" + segs.join("/");
        if (krAllowed(p)) return p;
        segs.pop();
    }
    return "/golf";
}

// ─────────────────────────── .kr 봇 화면 ───────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** .kr 봇 화면 아래에 놓는 길잡이 — 공용 hubNav(당구 · 등산 · 낚시로 가는 링크 열다섯) 자리에 골프 것만 */
export const KR_NAV: ReadonlyArray<readonly [string, string]> = [
    ["/golf", "랭큐 골프"], ["/golf/courses", "전국 골프장"], ["/golf/join", "골프 조인"], ["/golf/booking", "골프 부킹"],
    ["/golf/urgent", "긴급 티"], ["/golf/checklist", "골프 준비물"], ["/golf/terms", "골프 용어"],
];
// 줄 구분 글자(U+2028 · U+2029) — 스크립트 안에서 줄바꿈으로 읽힌다. 소스에 그 글자를 직접 적지 않으려고 코드값으로 만든다
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");
const krNavHtml = () => `<nav aria-label="RANKUE">${KR_NAV.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join(" · ")}</nav>`;

/** co.kr 절대 주소 하나를 .kr 화면에 실을 꼴로. 여는 주소 · 그림/파일 → .kr, 그 밖 → null(싣지 않는다) */
function krUrl(abs: string): string | null {
    const rest = abs.slice(MAIN_ORIGIN.length);
    const path = rest.split("?")[0].split("#")[0] || "/";
    if (isAssetPath(path) || krAllowed(path)) return KR_ORIGIN + rest;
    return null;
}

/** JSON-LD 한 덩이를 .kr 용으로 — 여는 주소는 .kr 로, 안 여는 주소를 가리키는 경로 조각(BreadcrumbList)은 빼고 번호를 다시 매긴다 */
function krJsonLd(node: unknown): unknown {
    if (typeof node === "string") {
        if (!node.startsWith(MAIN_ORIGIN)) return node;
        // 안 여는 주소 — 가장 가까운 윗주소로(조직 · 사이트의 '/' 는 골프 홈이 된다)
        // 주소 뒤의 #조각(@id 의 #organization 등)은 지킨다 — 떼면 서로 다른 마디의 @id 가 같아진다
        const hash = node.includes("#") ? node.slice(node.indexOf("#")) : "";
        return krUrl(node) ?? KR_ORIGIN + krNearest(node.slice(MAIN_ORIGIN.length)) + hash;
    }
    if (Array.isArray(node)) return node.map(krJsonLd);
    if (!node || typeof node !== "object") return node;
    const o = node as Record<string, unknown>;
    if (o["@type"] === "BreadcrumbList" && Array.isArray(o.itemListElement)) {
        const urlOf = (it: unknown): string | null => {
            const item = (it as Record<string, unknown> | null)?.item;
            const u = typeof item === "string" ? item : (item as Record<string, unknown> | null)?.["@id"];
            return typeof u === "string" ? u : null;
        };
        const kept = o.itemListElement.filter((it) => {
            const u = urlOf(it);
            return !u || !u.startsWith(MAIN_ORIGIN) || krUrl(u) !== null;
        });
        return { ...o, itemListElement: kept.map((it, i) => ({ ...(krJsonLd(it) as Record<string, unknown>), position: i + 1 })) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = krJsonLd(v);
    return out;
}

/**
 * co.kr 용으로 만든 봇 화면(HTML)을 .kr 용으로 고친다. 여는 주소의 화면에만 쓴다.
 *  · 대표 주소 · og · 그림의 co.kr 절대 주소 → .kr(여는 주소 · 그림만)
 *  · 안 여는 곳으로 가는 링크는 글자만 남긴다(다른 도메인으로 가는 링크를 싣지 않는다 — 규칙 4)
 *  · 공용 길잡이(hubNav)는 골프 길잡이로 바꾼다
 *  · hreflang 은 뺀다(골프 화면은 한국어뿐이고, 남기면 co.kr 주소를 가리킨다)
 */
export function krHtml(html: string): string {
    let out = html;

    // 1) JSON-LD — 글자 치환이 아니라 읽어서 고친다(경로 조각을 빼야 해서)
    out = out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body: string) => {
        try {
            const fixed = JSON.stringify(krJsonLd(JSON.parse(body)))
                .replace(/</g, "\\u003c").replace(LINE_SEP, "\\u2028").replace(PARA_SEP, "\\u2029");
            return `<script type="application/ld+json">${fixed}</script>`;
        } catch {
            return ""; // 못 읽는 덩이는 co.kr 주소가 섞여 나갈 수 있다 — 싣지 않는다
        }
    });

    // 2) hreflang
    out = out.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>/g, "");

    // 3) 공용 길잡이 → 골프 길잡이
    out = out.replace(/<nav aria-label="RANKUE">[\s\S]*?<\/nav>/g, krNavHtml());

    // 4) 링크 — 안 여는 곳으로 가는 것은 글자만
    out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (m, attrs: string, inner: string) => {
        const hm = /\bhref="([^"]*)"/.exec(attrs);
        if (!hm) return m;
        const href = unesc(hm[1]);
        if (href.startsWith("#")) return m;
        if (href.startsWith(MAIN_ORIGIN)) {
            const k = krUrl(href);
            return k ? `<a${attrs.replace(hm[0], `href="${esc(k)}"`)}>${inner}</a>` : inner;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return m; // 바깥 사이트 · tel: · mailto:
        if (!href.startsWith("/")) return m;
        const path = href.split("?")[0].split("#")[0];
        if (path === "/") return `<a${attrs.replace(hm[0], 'href="/golf"')}>${inner}</a>`;
        return isAssetPath(path) || krAllowed(path) ? m : inner;
    });

    // 5) 남은 co.kr 절대 주소(대표 주소 · og · 그림 · 사이트맵에 없는 속성) — 여는 주소와 그림만 .kr 로
    out = out.replace(/https:\/\/www\.rankue\.co\.kr[^\s"'<>\\)]*/g, (u) => {
        const k = krUrl(unesc(u));
        return k ? esc(k) : u;
    });
    return out;
}

/** co.kr 의 골프 봇 화면 — 색인에서 뺀다(링크는 따라가게 둔다). 이미 noindex 면 그대로 */
export function mainNoindexHtml(html: string): string {
    return html.replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, follow" />');
}

/** .kr 에 남아 있으면 안 되는 것 — 대표 주소 · og:url · 링크가 co.kr 을 가리키는가(시험 · 배포 뒤 대조가 쓴다) */
export function krLeaks(html: string): string[] {
    const leaks: string[] = [];
    for (const m of html.matchAll(/<link rel="canonical" href="([^"]*)"/g)) if (!m[1].startsWith(KR_ORIGIN)) leaks.push(`canonical ${m[1]}`);
    for (const m of html.matchAll(/<meta property="og:url" content="([^"]*)"/g)) if (!m[1].startsWith(KR_ORIGIN)) leaks.push(`og:url ${m[1]}`);
    for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
        const h = unesc(m[1]);
        if (h.startsWith(MAIN_ORIGIN)) leaks.push(`a ${h}`);
        else if (h.startsWith("/") && !h.startsWith("//")) {
            const p = h.split("?")[0].split("#")[0];
            if (!isAssetPath(p) && !krAllowed(p)) leaks.push(`a ${h}`);
        }
    }
    for (const m of html.matchAll(/hreflang="[^"]*" href="([^"]*)"/g)) leaks.push(`hreflang ${m[1]}`);
    return leaks;
}

// ─────────────────────────── 사이트맵 · robots ───────────────────────────

/** .kr 사이트맵 묶음이 읽어 오는 co.kr 의 구역 — 여는 주소가 들어 있는 것만 */
// ("golf" 구역은 프로 선수 · 골프 랭킹뿐이라 걸러 내면 비어서 넣지 않는다 — 2026-11-26 운영 사이트맵으로 확인: 골프장 490 · 허브 12 · 용어 25)
export const KR_SITEMAP_SECTIONS = ["golf-courses", "golf-hubs", "terms"] as const;
/** co.kr 묶음에서 빼는 구역 — 통째로 /golf 아래 주소뿐이라 거르면 빈다 */
export const MAIN_EMPTY_SECTIONS = ["golf-courses", "golf-hubs"] as const;

const locOf = (block: string): string | null => {
    const m = /<loc>([^<]+)<\/loc>/.exec(block);
    return m ? unesc(m[1]) : null;
};
const pathOfLoc = (loc: string): string => loc.replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/";

/** 사이트맵(urlset)의 <url> 덩이를 거른다 — keep 이 false 면 덩이째 뺀다 */
function filterUrls(xml: string, keep: (path: string) => boolean): string {
    return xml.replace(/[ \t]*<url>[\s\S]*?<\/url>\s*/g, (block) => {
        const loc = locOf(block);
        return loc && keep(pathOfLoc(loc)) ? block : "";
    });
}

/** co.kr 사이트맵 — /golf 아래 주소를 뺀다. 묶음(index)이면 빈 구역을 뺀다 */
export function mainSitemapXml(xml: string): string {
    if (xml.includes("<sitemapindex")) {
        return xml.replace(/[ \t]*<sitemap>[\s\S]*?<\/sitemap>\s*/g, (block) => {
            const loc = locOf(block) ?? "";
            return MAIN_EMPTY_SECTIONS.some((s) => loc.endsWith(`/sitemap-${s}.xml`)) ? "" : block;
        });
    }
    return filterUrls(xml, (p) => !mainDeindexed(p));
}

/** .kr 사이트맵 구역 — 여는 주소만 남기고 도메인을 .kr 로 */
export function krSitemapXml(xml: string): string {
    return filterUrls(xml, (p) => krAllowed(p)).replace(/https:\/\/www\.rankue\.co\.kr/g, KR_ORIGIN);
}

/** .kr 사이트맵 묶음 */
export function krSitemapIndex(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${KR_SITEMAP_SECTIONS
        .map((s) => `  <sitemap>\n    <loc>${KR_ORIGIN}/sitemap-${s}.xml</loc>\n  </sitemap>`).join("\n")}\n</sitemapindex>\n`;
}

/** .kr 의 robots.txt — 정적 파일(client/public/robots.txt)은 co.kr 사이트맵을 가리켜서 그대로 쓸 수 없다 */
export function krRobotsTxt(): string {
    return [
        "# 랭큐 골프 — www.rankue.kr",
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /admin",
        "",
        `Sitemap: ${KR_ORIGIN}/sitemap.xml`,
        "",
    ].join("\n");
}

/** .kr 에서 못 여는 주소를 사람이 열었을 때 보낼 co.kr 주소 */
export function mainUrlFor(pathAndQuery: string): string {
    return MAIN_ORIGIN + (pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`);
}
