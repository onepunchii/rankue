import { useEffect, useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { LucideChevronRight, LucideArrowRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { Section, List, Chip } from "@/components/hiq/umb/ui";
import { ShareButton } from "@/components/hiq/ShareButton";
import { TermsHeader, KoreanOnlyNote } from "@/components/hiq/terms/TermsParts";
import { TERM_CATEGORIES, termBySlug, termsInCategory, type BilliardsTerm } from "@shared/billiardsTerms";
import {
    TERMS_HUB_PATH, TERM_SECTIONS, TERM_LABELS, TERM_NOT_FOUND, termTitle, termDescription, termJsonLd, termPath, termAnchorPath, termHref,
    categoryAnchorId, hasOwnPage,
} from "@shared/billiardsTermsMeta";

// 당구 용어 한 개(/billiards/terms/:slug, 2026-09-24) — 공개 페이지, 한국어 전용.
// 글·절 순서·제목·JSON-LD 는 프리렌더(server/seo/billiardsTerms.ts)와 같은 shared 함수에서 온다.
// 짧은 항목(자기 페이지 없음)으로 들어오면 허브의 그 줄로 보낸다 — 프리렌더의 301 과 같은 동작.

const ORIGIN = "https://www.rankue.co.kr";

function decodeSlug(raw: string | undefined): string {
    if (!raw) return "";
    try { return decodeURIComponent(raw).normalize("NFC"); } catch { return raw; }
}

export default function BilliardsTermPage() {
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/billiards/terms/:slug");
    const slug = decodeSlug(params?.slug);
    const t = slug ? termBySlug(slug) : undefined;
    const own = !!t && hasOwnPage(t);

    useEffect(() => {
        if (t && !hasOwnPage(t)) setLocation(termAnchorPath(t.slug), { replace: true });
    }, [t, setLocation]);
    // 용어에서 용어로 옮겨 다녀도 새 글의 맨 위부터 읽게 한다(wouter 는 스크롤을 되돌리지 않는다)
    useEffect(() => { window.scrollTo(0, 0); }, [slug]);

    const jsonLd = useMemo(() => (t && own ? termJsonLd(t) : null), [t, own]);
    // 짧은 항목(t 는 있지만 자기 페이지 없음)은 곧 허브로 옮겨 가므로 '찾을 수 없습니다' 제목을 잠깐이라도 걸지 않는다(null = 그대로 둠)
    useSeo(t && own
        ? { title: termTitle(t.term), description: termDescription(t), path: termPath(t.slug), locale: "ko", jsonLd }
        : t
            ? null
            : { title: TERM_NOT_FOUND.title, description: TERM_NOT_FOUND.desc, path: TERMS_HUB_PATH, locale: "ko" });

    const back = () => setLocation(TERMS_HUB_PATH);

    if (!t || !own) {
        return (
            <div className="min-h-screen w-full bg-surface-0 text-ink-1 font-sans">
                <div className="mx-auto max-w-2xl px-5 pt-6 pb-16">
                    <TermsHeader title={TERM_LABELS.hub} backLabel={TERM_LABELS.hub} onBack={back} />
                    {!t && (
                        <div className="rk-card p-6 text-center">
                            <p className="text-[17px] font-bold text-ink-1">{TERM_NOT_FOUND.heading}</p>
                            <p className="mt-2 text-[14px] text-ink-3">{TERM_NOT_FOUND.desc}</p>
                            <Link href={TERMS_HUB_PATH} className="mt-5 inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-bold">
                                {TERM_LABELS.all}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const p = t.page!;
    const cat = TERM_CATEGORIES.find((c) => c.id === t.category)!;
    const related = (t.related ?? []).map((r) => termBySlug(r)).filter((x): x is BilliardsTerm => !!x);
    const siblings = termsInCategory(t.category).filter((x) => x.slug !== t.slug);

    return (
        <div className="min-h-screen w-full bg-surface-0 text-ink-1 font-sans">
            <div className="mx-auto max-w-2xl px-5 pt-6 pb-16">
                <TermsHeader
                    title={TERM_LABELS.hub}
                    backLabel={TERM_LABELS.hub}
                    onBack={back}
                    right={<ShareButton url={`${ORIGIN}${termPath(t.slug)}`} title={termTitle(t.term)} />}
                />
                <KoreanOnlyNote />

                <article className="rk-card p-5 sm:p-6 flex flex-col gap-7 min-w-0">
                    <header className="flex flex-col gap-3">
                        <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5">
                            <Link href={`${TERMS_HUB_PATH}#${categoryAnchorId(t.category)}`}>
                                <Chip tone="brand">{cat.emoji} {cat.label}</Chip>
                            </Link>
                            {/* 용어 자체가 외래 표현일 때만(표준어가 따로 있을 때). 끌어치기처럼 다른 이름만 일본식인 용어에는 달지 않는다 */}
                            {t.standard && <Chip tone="gold">외래 표현</Chip>}
                        </nav>
                        <div>
                            <h1 className="text-[26px] font-bold text-ink-1 leading-tight">{t.term}</h1>
                            {t.aliases?.length ? (
                                <p className="mt-1.5 text-[13px] font-medium text-ink-3">
                                    {TERM_LABELS.aliases} · {t.aliases.join(" · ")}
                                </p>
                            ) : null}
                        </div>
                        {/* 한 줄 뜻 — 초록 히어로 한 장(선수 페이지 디자인 언어와 같다) */}
                        <p className="rounded-2xl bg-brand text-brand-fg px-4 py-4 text-[15.5px] font-semibold leading-relaxed break-keep">{t.short}</p>
                        {(t.origin || t.standard) && (
                            <List>
                                {t.origin && (
                                    <div className="flex gap-3 px-4 py-3">
                                        <span className="w-16 shrink-0 text-[12.5px] font-semibold text-ink-3 pt-px">{TERM_LABELS.origin}</span>
                                        <span className="text-[13.5px] text-ink-2 leading-relaxed break-keep">{t.origin}</span>
                                    </div>
                                )}
                                {t.standard && (
                                    <div className="flex gap-3 px-4 py-3">
                                        <span className="w-16 shrink-0 text-[12.5px] font-semibold text-ink-3 pt-px">{TERM_LABELS.standard}</span>
                                        <span className="text-[13.5px] font-semibold text-ink-1">{t.standard}</span>
                                    </div>
                                )}
                            </List>
                        )}
                    </header>

                    {TERM_SECTIONS.filter((s) => p[s.key]).map((s) => (
                        <Section key={s.key} emoji={s.emoji} title={s.label}>
                            <p className="text-[15px] leading-[1.8] text-ink-1 break-keep">{p[s.key]}</p>
                        </Section>
                    ))}

                    {t.links?.length ? (
                        <div className="flex flex-col gap-2">
                            {t.links.map((l) => (
                                <Link
                                    key={l.href + l.label}
                                    href={l.href}
                                    className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-brand/[0.08] text-brand text-[14px] font-bold"
                                >
                                    {l.label}
                                    <LucideArrowRight className="w-4 h-4" />
                                </Link>
                            ))}
                        </div>
                    ) : null}

                    {related.length > 0 && (
                        <Section emoji="🔗" title={TERM_LABELS.related}>
                            <List>
                                {related.map((r) => (
                                    <Link key={r.slug} href={termHref(r)} className="flex items-start gap-3 px-4 py-3.5 active:bg-surface-3">
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[15px] font-semibold text-ink-1">{r.term}</span>
                                            <span className="block mt-0.5 text-[13px] leading-relaxed text-ink-2 break-keep">{r.short}</span>
                                        </div>
                                        <LucideChevronRight className="w-4 h-4 mt-1 shrink-0 text-ink-4" />
                                    </Link>
                                ))}
                            </List>
                        </Section>
                    )}

                    {siblings.length > 0 && (
                        <Section emoji="🗂️" title={TERM_LABELS.sameCategory}>
                            <div className="flex flex-wrap gap-1.5">
                                {siblings.map((x) => (
                                    <Link key={x.slug} href={termHref(x)}>
                                        <Chip>{x.term}</Chip>
                                    </Link>
                                ))}
                            </div>
                        </Section>
                    )}
                </article>

                <Link
                    href={TERMS_HUB_PATH}
                    className="mt-5 flex items-center justify-center gap-1.5 h-12 rounded-2xl bg-surface-1 text-[14px] font-semibold text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    {TERM_LABELS.all}
                    <LucideChevronRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
}
