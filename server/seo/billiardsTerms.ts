// 당구 용어 사전 프리렌더(2026-09-24) — /billiards/terms(허브) · /billiards/terms/:slug(용어 한 개).
//
// 본문은 shared/billiardsTerms.ts, 제목·설명·주소·JSON-LD 는 shared/billiardsTermsMeta.ts 로 화면과 같은 것을 쓴다.
// 봇에게만 있는 문장을 만들지 않는다(클로킹 금지) — 화면의 검색창·강조 같은 조작 요소만 빠진다.
//
// 주소 규칙:
//   - 자기 페이지(page)가 있는 용어만 200. 짧은 항목(은어 등)은 허브 앵커로 301(#슬러그).
//   - 모르는 슬러그·잘못된 인코딩은 404(noindex).
//   - 본문이 기준(TERM_MIN_CHARS)보다 짧은 페이지는 200 이지만 noindex, 사이트맵에서도 뺀다.
// X-Prerender 로 쓰는 tag 는 ASCII 여야 한다(한글이면 Node 가 ERR_INVALID_CHAR 로 죽는다) — 슬러그는 인코딩해 싣는다.
//
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부르므로
// 모듈 초기화 순서와 상관없이 안전하다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import {
    BILLIARDS_TERMS, TERM_CATEGORIES, TERMS_HUB_INTRO, TERMS_UPDATED, termBySlug, termsInCategory, type BilliardsTerm,
} from "../../shared/billiardsTerms.js";
import {
    TERMS_HUB_PATH, TERMS_HUB_TITLE, TERM_SECTIONS, TERM_LABELS, TERM_NOT_FOUND, termsHubDesc, termTitle, termDescription, termPath, termAnchorPath,
    termHref, categoryAnchorId, hasOwnPage, isIndexableTerm, termsHubJsonLd, termJsonLd,
} from "../../shared/billiardsTermsMeta.js";

const ORIGIN = "https://www.rankue.co.kr";
const TERM_RE = /^\/billiards\/terms\/([^/]+)$/;

export interface TermsRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

function decodeSeg(seg: string): string | null {
    try {
        const s = decodeURIComponent(seg).normalize("NFC").trim();
        return s || null;
    } catch {
        return null;
    }
}

const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const termLink = (t: BilliardsTerm) => link(termHref(t), t.term);

/** 보이는 경로 표시. 마지막 칸은 현재 페이지(링크 없음). BreadcrumbList 는 JSON-LD 쪽(meta)에 있다. */
function crumbs(items: { name: string; path?: string }[]): string {
    return `<nav aria-label="경로">${items.map((c) => (c.path ? link(c.path, c.name) : esc(c.name))).join(" › ")}</nav>`;
}

// ── 허브 ────────────────────────────────────────────────────────
function hubRow(t: BilliardsTerm): string {
    const name = hasOwnPage(t) ? link(termPath(t.slug), t.term) : esc(t.term);
    const alias = t.aliases?.length ? ` <small>(${esc(t.aliases.join(" · "))})</small>` : "";
    // 짧은 항목은 자기 페이지가 없으니 풀이가 있는 용어로 건너갈 길을 붙인다(화면의 '→ 밀어치기'와 같다).
    const rel = !hasOwnPage(t) && t.related?.length
        ? ` → ${t.related.map((r) => termBySlug(r)).filter((x): x is BilliardsTerm => !!x).map(termLink).join(", ")}`
        : "";
    return `    <dt id="${esc(t.slug)}">${name}${alias}</dt>\n    <dd>${esc(t.short)}${rel}</dd>`;
}

function renderHub(): TermsRender {
    const total = BILLIARDS_TERMS.length;
    const pages = BILLIARDS_TERMS.filter(hasOwnPage).length;
    const sections = TERM_CATEGORIES.map((c) => `  <section id="${categoryAnchorId(c.id)}">
  <h2>${esc(c.label)}</h2>
  <dl>
${termsInCategory(c.id).map(hubRow).join("\n")}
  </dl>
  </section>`).join("\n");
    const body = `<main>
  ${crumbs([{ name: TERM_LABELS.home, path: "/" }, { name: TERM_LABELS.hub }])}
  <h1>${esc(TERM_LABELS.hub)}</h1>
  <p>${esc(TERMS_HUB_INTRO)}</p>
  <p>용어 ${total}개 · 자세한 풀이 ${pages}개</p>
${sections}
</main>
${hubNav("ko")}`;
    return {
        status: 200,
        tag: "terms:hub",
        html: page({
            lang: "ko",
            title: TERMS_HUB_TITLE,
            desc: termsHubDesc(total, pages),
            canonical: `${ORIGIN}${TERMS_HUB_PATH}`,
            jsonLd: [termsHubJsonLd(BILLIARDS_TERMS)],
            body,
        }),
    };
}

// ── 용어 한 개 ───────────────────────────────────────────────────
function renderTerm(t: BilliardsTerm): TermsRender {
    const p = t.page!;
    const cat = TERM_CATEGORIES.find((c) => c.id === t.category)!;
    const related = (t.related ?? []).map((r) => termBySlug(r)).filter((x): x is BilliardsTerm => !!x);
    const siblings = termsInCategory(t.category).filter((x) => x.slug !== t.slug);

    const head: string[] = [];
    if (t.aliases?.length) head.push(`<p>${esc(TERM_LABELS.aliases)}: ${esc(t.aliases.join(" · "))}</p>`);
    head.push(`<p>분류: ${link(`${TERMS_HUB_PATH}#${categoryAnchorId(t.category)}`, cat.label)}</p>`);
    head.push(`<p><strong>${esc(t.short)}</strong></p>`);
    if (t.origin || t.standard) {
        head.push(`<p>${[
            t.origin ? `${esc(TERM_LABELS.origin)}: ${esc(t.origin)}` : "",
            t.standard ? `${esc(TERM_LABELS.standard)}: ${esc(t.standard)}` : "",
        ].filter(Boolean).join(" · ")}</p>`);
    }

    const secs = TERM_SECTIONS.filter((s) => p[s.key]).map((s) => `  <h2>${esc(s.label)}</h2>\n  <p>${esc(p[s.key])}</p>`);
    const links = t.links?.length ? `  <ul>${t.links.map((l) => `<li>${link(l.href, l.label)}</li>`).join("")}</ul>` : "";
    const rel = related.length
        ? `  <h2>${esc(TERM_LABELS.related)}</h2>\n  <ul>${related.map((r) => `<li>${termLink(r)} — ${esc(r.short)}</li>`).join("")}</ul>`
        : "";
    const sib = siblings.length
        ? `  <h2>${esc(TERM_LABELS.sameCategory)}</h2>\n  <p>${siblings.map(termLink).join(" · ")}</p>`
        : "";

    const body = `<main>
  ${crumbs([{ name: TERM_LABELS.home, path: "/" }, { name: TERM_LABELS.hub, path: TERMS_HUB_PATH }, { name: t.term }])}
  <article>
  <h1>${esc(t.term)}</h1>
  ${head.join("\n  ")}
${secs.join("\n")}
${links}
${rel}
${sib}
  </article>
  <p>${link(TERMS_HUB_PATH, TERM_LABELS.all)}</p>
</main>
${hubNav("ko")}`;

    return {
        status: 200,
        tag: `terms:${encodeURIComponent(t.slug)}`,
        html: page({
            lang: "ko",
            title: termTitle(t.term),
            desc: termDescription(t),
            canonical: `${ORIGIN}${termPath(t.slug)}`,
            noindex: !isIndexableTerm(t),
            jsonLd: [termJsonLd(t)],
            body,
        }),
    };
}

function gone(): TermsRender {
    return {
        status: 404,
        tag: "terms:404",
        html: page({
            lang: "ko",
            title: TERM_NOT_FOUND.title,
            desc: TERM_NOT_FOUND.desc,
            canonical: `${ORIGIN}${TERMS_HUB_PATH}`,
            noindex: true,
            body: `<main>
  <h1>${esc(TERM_NOT_FOUND.heading)}</h1>
  <p>${esc(TERM_NOT_FOUND.desc)}</p>
  <p>${link(TERMS_HUB_PATH, TERM_LABELS.all)}</p>
</main>
${hubNav("ko")}`,
        }),
    };
}

/**
 * 사전 경로 하나를 렌더한다. pathname 은 **인코딩된 그대로**(req.path). 사전 경로가 아니면 null.
 * DB 를 쓰지 않으므로 던지지 않는다(본문은 코드에 있다).
 */
export async function renderBilliardsTerms(pathname: string, _query: Record<string, string>): Promise<TermsRender | null> {
    const path = pathname.replace(/\/+$/, "");
    if (path === TERMS_HUB_PATH) return renderHub();
    const m = TERM_RE.exec(path);
    if (!m) return null;
    const slug = decodeSeg(m[1]);
    const t = slug ? termBySlug(slug) : undefined;
    if (!t) return gone();
    // 짧은 항목은 자기 주소가 없다 — 허브의 그 줄로 보낸다(location 은 퍼센트 인코딩돼 ASCII 다).
    if (!hasOwnPage(t)) return { status: 301, tag: "terms:301", html: "", location: termAnchorPath(t.slug) };
    return renderTerm(t);
}

/** 사이트맵 "terms" 섹션 — 허브 + 색인 기준을 넘는 용어 페이지. lastmod 는 본문을 고친 날(TERMS_UPDATED). */
export async function billiardsTermsSitemapParts(): Promise<string[]> {
    return [
        entry(`${ORIGIN}${TERMS_HUB_PATH}`, { changefreq: "monthly", priority: "0.6", lastmod: TERMS_UPDATED }),
        ...BILLIARDS_TERMS.filter(isIndexableTerm).map((t) =>
            entry(`${ORIGIN}${termPath(t.slug)}`, { changefreq: "monthly", priority: "0.5", lastmod: TERMS_UPDATED })),
    ];
}
