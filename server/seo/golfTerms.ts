// 골프 용어 사전 프리렌더(2026-10-05) — /golf/terms(허브) · /golf/terms/:slug(용어 한 개).
//
// 본문은 shared/golfTerms.ts, 제목·설명·주소·JSON-LD 는 shared/golfTermsMeta.ts 로 화면(client/src/golf/pages/GolfTerms.tsx)과 같은 것을 쓴다.
// 봇에게만 있는 문장을 만들지 않는다(클로킹 금지). 틀은 당구 용어 사전(server/seo/billiardsTerms.ts)과 같다.
//
// 주소 규칙:
//   - 자기 페이지(page)가 있는 용어만 200. 짧은 항목은 허브 앵커로 301(#슬러그).
//   - 모르는 슬러그·잘못된 인코딩은 404(noindex).
//   - 본문이 기준(GOLF_TERM_MIN_CHARS)보다 짧은 페이지는 200 이지만 noindex, 사이트맵에서도 뺀다.
// X-Prerender 로 쓰는 tag 는 ASCII 여야 한다(한글이면 Node 가 ERR_INVALID_CHAR 로 죽는다) — 슬러그는 인코딩해 싣는다.
//
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부르므로
// 모듈 초기화 순서와 상관없이 안전하다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import {
    GOLF_TERMS, GOLF_TERMS_INTRO, GOLF_TERMS_UPDATED, GOLF_TERM_CATEGORIES, golfTermBySlug, golfTermsInCategory, type GolfTerm,
} from "../../shared/golfTerms.js";
import {
    GOLF_TERMS_H1, GOLF_TERMS_PATH, GOLF_TERMS_TITLE, GOLF_TERM_NOT_FOUND, GOLF_TERM_SECTIONS, golfCategoryAnchorId, golfTermAnchorPath,
    golfTermDescription, golfTermHref, golfTermJsonLd, golfTermPath, golfTermTitle, golfTermsDesc, golfTermsJsonLd, hasGolfTermPage, isIndexableGolfTerm,
} from "../../shared/golfTermsMeta.js";
import { PACK_NAV_LABEL, PACK_PATH } from "../../shared/golfPack.js";

const ORIGIN = "https://www.rankue.co.kr";
const GOLF_IMAGE = { url: `${ORIGIN}/og-golf.png`, width: 1200, height: 630, alt: "랭큐 골프" };
const TERM_RE = /^\/golf\/terms\/([^/]+)$/;

export interface GolfTermsRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

function decodeSeg(seg: string): string | null {
    try {
        const s = decodeURIComponent(seg).normalize("NFC").trim();
        return s || null;
    } catch {
        return null;
    }
}
const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const more = () => `<nav aria-label="더 보기">${link(PACK_PATH, PACK_NAV_LABEL)} · ${link("/golf/courses", "전국 골프장 · 날씨")} · ${link("/golf/join", "조인 찾기")}</nav>`;

// ── 허브 ────────────────────────────────────────────────────────
function hubRow(t: GolfTerm): string {
    const name = hasGolfTermPage(t) ? link(golfTermPath(t.slug), t.term) : esc(t.term);
    const alias = t.aliases?.length ? ` <small>(${esc(t.aliases.join(" · "))})</small>` : "";
    return `    <dt id="${esc(t.slug)}">${esc(t.emoji)} ${name}${alias}</dt>\n    <dd>${esc(t.short)}</dd>`;
}
function renderHub(): GolfTermsRender {
    const total = GOLF_TERMS.length;
    const pages = GOLF_TERMS.filter(hasGolfTermPage).length;
    const sections = GOLF_TERM_CATEGORIES.map((c) => `  <section id="${golfCategoryAnchorId(c.id)}">
  <h2>${esc(`${c.emoji} ${c.label}`)}</h2>
  <dl>
${golfTermsInCategory(c.id).map(hubRow).join("\n")}
  </dl>
  </section>`).join("\n");
    return {
        status: 200, tag: "golf-terms:hub",
        html: page({
            lang: "ko", title: GOLF_TERMS_TITLE, desc: golfTermsDesc(total, pages), canonical: `${ORIGIN}${GOLF_TERMS_PATH}`,
            image: GOLF_IMAGE, jsonLd: [golfTermsJsonLd(GOLF_TERMS)],
            body: `<main>
  <nav aria-label="경로">${link("/golf/courses", "전국 골프장")} › ${esc(GOLF_TERMS_H1)}</nav>
  <h1>${esc(GOLF_TERMS_H1)}</h1>
  <p>${esc(GOLF_TERMS_INTRO)}</p>
  <p>용어 ${total}개 · 자세한 풀이 ${pages}개</p>
${sections}
  ${more()}
</main>
${hubNav("ko")}`,
        }),
    };
}

// ── 용어 한 개 ──────────────────────────────────────────────────
function renderTerm(t: GolfTerm): GolfTermsRender {
    const sections = GOLF_TERM_SECTIONS.map((s) => {
        const text = t.page?.[s.key];
        return text ? `  <h2>${esc(s.label)}</h2>\n  <p>${esc(text)}</p>` : "";
    }).filter(Boolean).join("\n");
    const links = t.links?.length ? `\n  <ul>\n${t.links.map((l) => `    <li>${link(l.href, l.label)}</li>`).join("\n")}\n  </ul>` : "";
    const related = (t.related ?? []).map((s) => golfTermBySlug(s)).filter((x): x is GolfTerm => !!x);
    const relatedHtml = related.length ? `\n  <h2>같이 보면 좋은 말</h2>\n  <p>${related.map((r) => link(golfTermHref(r), `${r.emoji} ${r.term}`)).join(" · ")}</p>` : "";
    return {
        status: 200, tag: `golf-terms:${encodeURIComponent(t.slug)}`,
        html: page({
            lang: "ko", title: golfTermTitle(t.term), desc: golfTermDescription(t), canonical: `${ORIGIN}${golfTermPath(t.slug)}`,
            noindex: !isIndexableGolfTerm(t), image: GOLF_IMAGE, jsonLd: [golfTermJsonLd(t)],
            body: `<main>
  <nav aria-label="경로">${link(GOLF_TERMS_PATH, GOLF_TERMS_H1)} › ${esc(t.term)}</nav>
  <h1>${esc(`${t.emoji} ${t.term}`)}</h1>${t.aliases?.length ? `\n  <p><small>${esc(t.aliases.join(" · "))}</small></p>` : ""}
  <p>${esc(t.short)}</p>
${sections}${links}${relatedHtml}
  <p>${link(GOLF_TERMS_PATH, "골프 용어 전체 보기")}</p>
</main>
${hubNav("ko")}`,
        }),
    };
}

function gone(): GolfTermsRender {
    return {
        status: 404, tag: "golf-terms:404",
        html: page({
            lang: "ko", title: GOLF_TERM_NOT_FOUND.title, desc: GOLF_TERM_NOT_FOUND.desc, canonical: `${ORIGIN}${GOLF_TERMS_PATH}`, noindex: true,
            body: `<main>
  <h1>${esc(GOLF_TERM_NOT_FOUND.heading)}</h1>
  <p>${esc(GOLF_TERM_NOT_FOUND.desc)}</p>
  <p>${link(GOLF_TERMS_PATH, "골프 용어 전체 보기")}</p>
</main>
${hubNav("ko")}`,
        }),
    };
}

/** 사전 경로 하나를 렌더한다. pathname 은 **인코딩된 그대로**(req.path). 사전 경로가 아니면 null. DB 를 쓰지 않는다. */
export function renderGolfTerms(pathname: string): GolfTermsRender | null {
    const path = pathname.replace(/\/+$/, "");
    if (path === GOLF_TERMS_PATH) return renderHub();
    const m = TERM_RE.exec(path);
    if (!m) return null;
    const slug = decodeSeg(m[1]);
    const t = slug ? golfTermBySlug(slug) : undefined;
    if (!t) return gone();
    // 짧은 항목은 자기 주소가 없다 — 허브의 그 줄로 보낸다(location 은 퍼센트 인코딩돼 ASCII 다)
    if (!hasGolfTermPage(t)) return { status: 301, tag: "golf-terms:301", html: "", location: golfTermAnchorPath(t.slug) };
    return renderTerm(t);
}

/** 사이트맵 "terms" 섹션에 얹는다 — 허브 + 색인 기준을 넘는 용어 페이지. lastmod 는 본문을 고친 날 */
export function golfTermsSitemapParts(): string[] {
    return [
        entry(`${ORIGIN}${GOLF_TERMS_PATH}`, { changefreq: "monthly", priority: "0.7", lastmod: GOLF_TERMS_UPDATED }),
        ...GOLF_TERMS.filter(isIndexableGolfTerm).map((t) => entry(`${ORIGIN}${golfTermPath(t.slug)}`, { changefreq: "monthly", priority: "0.5", lastmod: GOLF_TERMS_UPDATED })),
    ];
}
