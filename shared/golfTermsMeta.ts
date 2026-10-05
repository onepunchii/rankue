// 골프 용어 사전의 주소·제목·설명·구조화 데이터(2026-10-05) — 화면(useSeo)과 프리렌더(server/seo/golfTerms.ts)가 같이 쓴다.
// 본문(shared/golfTerms.ts)은 타입으로만 끌어온다 — 이 파일은 프리렌더의 허브 내비처럼 주소만 필요한 곳에서도 불리니 글을 달고 다니지 않는다.
// 틀은 shared/billiardsTermsMeta.ts 와 같다(자기 페이지가 있는 용어만 주소를 갖고, 짧은 항목은 허브의 앵커).
// ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
import type { GolfTerm, GolfTermCategory } from "./golfTerms.js";

const ORIGIN = "https://www.rankue.co.kr";
export const GOLF_TERMS_PATH = "/golf/terms";
export const GOLF_TERMS_SET_NAME = "랭큐 골프 용어 사전";
export const GOLF_TERMS_NAV_LABEL = "골프 용어";
export const GOLF_TERMS_H1 = "골프 용어 사전";

export const golfTermPath = (slug: string) => `${GOLF_TERMS_PATH}/${encodeURIComponent(slug)}`;
/** 짧은 항목은 허브의 그 줄로 — #앵커 */
export const golfTermAnchorPath = (slug: string) => `${GOLF_TERMS_PATH}#${encodeURIComponent(slug)}`;
export const golfCategoryAnchorId = (c: GolfTermCategory) => `cat-${c}`;

/** 자기 페이지를 색인에 올리는 본문 길이(자) — 이보다 짧으면 200 이지만 noindex, 사이트맵에서도 뺀다 */
export const GOLF_TERM_MIN_CHARS = 300;

/** 본문 절 — 순서가 곧 화면·프리렌더의 제목 순서다 */
export const GOLF_TERM_SECTIONS = [
    { key: "meaning", label: "뜻" },
    { key: "usage", label: "이렇게 써요" },
    { key: "example", label: "예를 들면" },
    { key: "confusion", label: "헷갈리기 쉬운 것" },
    { key: "inApp", label: "랭큐 골프에서는" },
] as const;

export const hasGolfTermPage = (t: GolfTerm): boolean => !!t.page;
export function golfTermBodyChars(t: GolfTerm): number {
    if (!t.page) return 0;
    return GOLF_TERM_SECTIONS.reduce((n, s) => n + (t.page![s.key]?.length ?? 0), 0);
}
export const isIndexableGolfTerm = (t: GolfTerm) => hasGolfTermPage(t) && golfTermBodyChars(t) >= GOLF_TERM_MIN_CHARS;
/** 자기 페이지가 있으면 그 주소, 없으면 허브 앵커 */
export const golfTermHref = (t: GolfTerm) => (hasGolfTermPage(t) ? golfTermPath(t.slug) : golfTermAnchorPath(t.slug));

// ── 제목·설명 ────────────────────────────────────────────────────
export const GOLF_TERMS_TITLE = "골프 용어 사전 — 버디·보기·핸디캡부터 양파·라베까지 | 랭큐 골프";
export const golfTermsDesc = (total: number, pages: number) =>
    `골프 용어 ${total}개를 스코어·코스·샷·규칙·라운드·경기 방식으로 나눠 쉬운 말로 풀었어요. 자주 찾는 ${pages}개는 뜻과 쓰임새, 예시, 헷갈리기 쉬운 점까지 정리했어요.`;
export const golfTermTitle = (term: string) => `${term} 뜻 — 골프 용어 사전 | 랭큐 골프`;
export const GOLF_TERM_NOT_FOUND = {
    title: "용어를 찾을 수 없어요 | 랭큐 골프",
    heading: "용어를 찾을 수 없어요",
    desc: "찾는 골프 용어가 사전에 없어요. 전체 목록에서 찾아보세요.",
};
/** "버디(Birdie): 기준 타수보다 …" — 155자 안쪽으로 자른다 */
export function golfTermDescription(t: Pick<GolfTerm, "term" | "aliases" | "short">): string {
    const head = t.aliases?.length ? `${t.term}(${t.aliases.join(" · ")})` : t.term;
    const s = `${head}: ${t.short}`;
    return s.length <= 155 ? s : `${s.slice(0, 154)}…`;
}

// ── 구조화 데이터 ────────────────────────────────────────────────
const setRef = () => ({ "@type": "DefinedTermSet", "@id": `${ORIGIN}${GOLF_TERMS_PATH}`, name: GOLF_TERMS_SET_NAME, url: `${ORIGIN}${GOLF_TERMS_PATH}` });
const crumbs = (items: { name: string; path: string }[]) => ({
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
});
const HOME = { name: "전국 골프장", path: "/golf/courses" };

export function golfTermsJsonLd(terms: readonly GolfTerm[]): object {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                ...setRef(),
                description: golfTermsDesc(terms.length, terms.filter(hasGolfTermPage).length),
                inLanguage: "ko",
                hasDefinedTerm: terms.map((t) => ({
                    "@type": "DefinedTerm",
                    name: t.term,
                    ...(t.aliases?.length ? { alternateName: t.aliases } : {}),
                    description: t.short,
                    url: `${ORIGIN}${golfTermHref(t)}`,
                })),
            },
            crumbs([HOME, { name: GOLF_TERMS_H1, path: GOLF_TERMS_PATH }]),
        ],
    };
}
export function golfTermJsonLd(t: GolfTerm): object {
    const url = `${ORIGIN}${golfTermPath(t.slug)}`;
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "DefinedTerm", "@id": url, name: t.term,
                ...(t.aliases?.length ? { alternateName: t.aliases } : {}),
                description: t.short, url,
                // inLanguage 는 CreativeWork 속성이라 DefinedTerm 에는 달지 않는다(당구 용어 사전과 같은 까닭)
                inDefinedTermSet: { ...setRef(), inLanguage: "ko" },
            },
            crumbs([HOME, { name: GOLF_TERMS_H1, path: GOLF_TERMS_PATH }, { name: t.term, path: golfTermPath(t.slug) }]),
        ],
    };
}
