// 당구 용어 사전(/billiards/terms) 제목·설명·주소·구조화데이터 — 화면(useSeo)과 봇 프리렌더가 같은 함수를 쓴다.
// 봇과 사람이 같은 제목을 보게 하는 것이 목적이다(shared/pbaMeta.ts 와 같은 패턴).
//
// 왜 본문(shared/billiardsTerms.ts)을 여기서 import 하지 않는가: 이 파일은 허브 내비·사이트맵처럼
// 사전 페이지가 아닌 곳에서도 주소(termPath)만 필요해 불러 쓸 수 있다. 본문을 끌어오면 수만 자짜리
// 글이 앱 메인 번들에 딸려 들어간다. 그래서 용어 객체는 인자로만 받는다(타입만 import — 런타임 비용 0).
import type { BilliardsTerm, TermCategory } from "./billiardsTerms.js";

const ORIGIN = "https://www.rankue.co.kr";

export const TERMS_HUB_PATH = "/billiards/terms";
export const TERMS_SET_NAME = "랭큐 당구 용어 사전";

/** 한글 슬러그는 퍼센트 인코딩한 모양이 정본 — 사이트맵·canonical·useSeo 가 모두 이 문자열을 쓴다. */
export const termPath = (slug: string) => `${TERMS_HUB_PATH}/${encodeURIComponent(slug)}`;
/** 자기 주소가 없는 짧은 항목은 허브 안의 앵커로 보낸다. */
export const termAnchorPath = (slug: string) => `${TERMS_HUB_PATH}#${encodeURIComponent(slug)}`;
/** 허브의 분류 묶음 앵커 — h2 에 id 를 달면 프리렌더 목차(withToc)가 그 제목을 건너뛰어서 감싸는 section 에 단다. */
export const categoryAnchorId = (c: TermCategory) => `cat-${c}`;

/**
 * 자기 페이지를 가질 만큼 글이 있는가의 기준(공백 제외 글자 수). 이보다 짧으면 페이지를 noindex 로 내고
 * 사이트맵에서 뺀다 — 한두 문장짜리 페이지를 색인시키면 사이트 전체 품질 신호를 끌어내린다(2026-09-18 브리핑 교훈).
 */
export const TERM_MIN_CHARS = 300;

/** 본문 절 — 순서가 곧 화면·프리렌더의 제목 순서다. 이모지는 화면(Section)에서만 쓴다. */
export const TERM_SECTIONS = [
    { key: "meaning", label: "뜻", emoji: "📖" },
    { key: "usage", label: "어떻게 쓰나", emoji: "🎱" },
    { key: "example", label: "예시", emoji: "✍️" },
    { key: "confusion", label: "헷갈리기 쉬운 점", emoji: "⚠️" },
    { key: "inApp", label: "랭큐에서는", emoji: "📱" },
] as const;
export type TermSectionKey = (typeof TERM_SECTIONS)[number]["key"];

export const TERM_LABELS = {
    aliases: "다른 이름",
    origin: "말의 뿌리",
    standard: "표준어",
    related: "관련 용어",
    sameCategory: "같은 분류의 다른 용어",
    all: "당구 용어 사전 전체 보기",
    hub: "당구 용어 사전",
    home: "랭큐",
} as const;

export const hasOwnPage = (t: BilliardsTerm): boolean => !!t.page;

/** 본문 글자 수(공백 제외) — 색인 기준 판정용 */
export function termBodyChars(t: BilliardsTerm): number {
    if (!t.page) return 0;
    return TERM_SECTIONS.reduce((n, s) => n + (t.page?.[s.key] ?? "").replace(/\s+/g, "").length, 0);
}

export const isIndexableTerm = (t: BilliardsTerm) => hasOwnPage(t) && termBodyChars(t) >= TERM_MIN_CHARS;

/** 자기 페이지가 있으면 그 주소, 없으면 허브 앵커 */
export const termHref = (t: BilliardsTerm) => (hasOwnPage(t) ? termPath(t.slug) : termAnchorPath(t.slug));

// ── 제목·설명 ────────────────────────────────────────────────────
export const TERMS_HUB_TITLE = "당구 용어 사전 — 3쿠션·4구·포켓볼 용어 뜻 | 랭큐";

export const termsHubDesc = (total: number, pages: number) =>
    `에버리지·하이런·다마수·뱅크샷부터 오시·히키·겐세이 같은 일본식 표현까지, 당구 용어 ${total}개의 뜻을 한 줄로 정리했습니다. 자주 쓰는 ${pages}개는 쓰임새·예시·헷갈리는 점까지 풀었습니다.`;

export const termTitle = (term: string) => `${term} 뜻 — 당구 용어 사전 | 랭큐`;

/** 모르는 슬러그 — 화면과 프리렌더(404·noindex)가 같은 문구를 쓴다. */
export const TERM_NOT_FOUND = {
    title: "용어를 찾을 수 없습니다 · 당구 용어 사전 | 랭큐",
    heading: "용어를 찾을 수 없습니다",
    desc: "요청한 당구 용어가 사전에 없습니다.",
} as const;

export function termDescription(t: Pick<BilliardsTerm, "term" | "aliases" | "short">): string {
    const alias = t.aliases?.length ? `(${t.aliases.slice(0, 2).join("·")})` : "";
    return `${t.term}${alias} 뜻: ${t.short} 쓰임새와 예시, 헷갈리기 쉬운 점까지 랭큐 당구 용어 사전에서 정리했습니다.`;
}

// ── 구조화데이터 ─────────────────────────────────────────────────
// 화면은 useSeo 에 객체 하나만 넘길 수 있어 @graph 로 묶는다. 프리렌더도 같은 객체를 그대로 싣는다.
const crumbs = (items: { name: string; path: string }[]) => ({
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
});

const setRef = () => ({ "@type": "DefinedTermSet", "@id": `${ORIGIN}${TERMS_HUB_PATH}`, name: TERMS_SET_NAME, url: `${ORIGIN}${TERMS_HUB_PATH}` });

export function termsHubJsonLd(terms: BilliardsTerm[]): object {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                ...setRef(),
                description: termsHubDesc(terms.length, terms.filter(hasOwnPage).length),
                inLanguage: "ko",
                hasDefinedTerm: terms.map((t) => ({
                    "@type": "DefinedTerm",
                    name: t.term,
                    ...(t.aliases?.length ? { alternateName: t.aliases } : {}),
                    description: t.short,
                    url: `${ORIGIN}${termHref(t)}`,
                })),
            },
            crumbs([{ name: TERM_LABELS.home, path: "/" }, { name: TERM_LABELS.hub, path: TERMS_HUB_PATH }]),
        ],
    };
}

export function termJsonLd(t: BilliardsTerm): object {
    const url = `${ORIGIN}${termPath(t.slug)}`;
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "DefinedTerm",
                "@id": url,
                name: t.term,
                ...(t.aliases?.length ? { alternateName: t.aliases } : {}),
                description: t.short,
                url,
                // inLanguage 는 CreativeWork 속성이라 DefinedTerm(Intangible)에는 달지 않는다 — 검사기가 경고를 낸다.
                // 언어는 inDefinedTermSet 쪽(DefinedTermSet = CreativeWork)과 <html lang> 으로 충분하다.
                inDefinedTermSet: { ...setRef(), inLanguage: "ko" },
            },
            crumbs([
                { name: TERM_LABELS.home, path: "/" },
                { name: TERM_LABELS.hub, path: TERMS_HUB_PATH },
                { name: t.term, path: termPath(t.slug) },
            ]),
        ],
    };
}
