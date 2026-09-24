import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { LucideChevronRight, LucideSearch, LucideX } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";
import { Section, List } from "@/components/hiq/umb/ui";
import { TermsHeader, KoreanOnlyNote } from "@/components/hiq/terms/TermsParts";
import { BILLIARDS_TERMS, TERM_CATEGORIES, TERMS_HUB_INTRO, termBySlug, type BilliardsTerm } from "@shared/billiardsTerms";
import {
    TERMS_HUB_PATH, TERMS_HUB_TITLE, TERM_LABELS, termsHubDesc, termsHubJsonLd, termPath, categoryAnchorId, hasOwnPage,
} from "@shared/billiardsTermsMeta";

// 당구 용어 사전 허브(2026-09-24) — 공개 페이지, 한국어 전용. 본문·제목은 shared 에서 가져와 프리렌더와 같은 글을 보여 준다.
// 자기 페이지가 있는 용어는 줄 전체가 링크, 짧은 항목은 이 페이지 안의 앵커(#슬러그)로만 산다.
// 화면에만 있는 것은 검색창과 앵커 강조뿐이다(글은 더하지 않는다 — 클로킹 금지).

const TOTAL = BILLIARDS_TERMS.length;
const PAGES = BILLIARDS_TERMS.filter(hasOwnPage).length;

/** 검색 — 용어·다른 이름·한 줄 정의에서 찾는다. 띄어쓰기는 무시한다('빈 쿠션'으로 쳐도 '빈쿠션'이 나오게). */
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
function matches(t: BilliardsTerm, q: string): boolean {
    if (!q) return true;
    return [t.term, ...(t.aliases ?? []), t.short].some((s) => squash(s).includes(q));
}

function decodeHash(raw: string): string {
    try { return decodeURIComponent(raw).normalize("NFC"); } catch { return raw; }
}

export default function BilliardsTermsPage() {
    const [, setLocation] = useLocation();
    const [query, setQuery] = useState("");
    const [flash, setFlash] = useState<string | null>(null);
    const flashTimer = useRef<number | undefined>(undefined);
    const q = squash(query.trim());

    const jsonLd = useMemo(() => termsHubJsonLd(BILLIARDS_TERMS), []);
    useSeo({ title: TERMS_HUB_TITLE, description: termsHubDesc(TOTAL, PAGES), path: TERMS_HUB_PATH, locale: "ko", jsonLd });

    const groups = useMemo(
        () => TERM_CATEGORIES.map((c) => ({ ...c, terms: BILLIARDS_TERMS.filter((t) => t.category === c.id && matches(t, q)) })),
        [q],
    );
    const found = groups.reduce((n, g) => n + g.terms.length, 0);

    // 앵커(#오시 등)로 들어오면 그 줄로 스크롤하고 잠깐 칠한다. 상세 페이지의 '→ 앞돌리기' 같은 링크도 여기로 온다.
    // 검색으로 그 줄이 숨어 있으면 검색을 비우고, 목록이 다시 그려진 다음 프레임에 찾는다.
    // highlight 는 ref·상태 setter 만 만지므로 첫 렌더의 것을 effect 가 계속 써도 된다.
    const pendingHash = useRef<string | null>(null);
    const highlight = (id: string): boolean => {
        const el = document.getElementById(id);
        if (!el) return false;
        // 분류 묶음(#cat-…)은 머리가 위에 오게, 용어 한 줄은 가운데 오게 하고 그 줄만 칠한다
        if (id.startsWith("cat-")) {
            el.scrollIntoView({ block: "start" });
            return true;
        }
        el.scrollIntoView({ block: "center" });
        setFlash(id);
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
        return true;
    };
    useEffect(() => {
        const go = () => {
            const raw = window.location.hash.slice(1);
            if (!raw) return;
            const id = decodeHash(raw);
            if (highlight(id)) return;
            pendingHash.current = id;
            setQuery("");
        };
        const r = requestAnimationFrame(go);
        window.addEventListener("hashchange", go);
        return () => {
            cancelAnimationFrame(r);
            window.removeEventListener("hashchange", go);
            window.clearTimeout(flashTimer.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const id = pendingHash.current;
        if (!id || q) return;
        pendingHash.current = null;
        const r = requestAnimationFrame(() => { highlight(id); });
        return () => cancelAnimationFrame(r);
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="min-h-screen w-full bg-surface-0 text-ink-1 font-sans">
            <div className="mx-auto max-w-2xl px-5 pt-6 pb-16">
                <TermsHeader title={TERM_LABELS.hub} backLabel={TERM_LABELS.home} onBack={() => setLocation("/")} />
                <KoreanOnlyNote />

                <div className="rk-card p-5 sm:p-6 flex flex-col gap-7 min-w-0">
                    <header>
                        <h1 className="text-[24px] font-bold text-ink-1 leading-tight">{TERM_LABELS.hub}</h1>
                        <p className="mt-1.5 text-[13px] font-semibold text-brand tabular-nums">
                            용어 {TOTAL}개 · 자세한 풀이 {PAGES}개
                        </p>
                        <p className="mt-3 text-[14px] leading-relaxed text-ink-2 break-keep">{TERMS_HUB_INTRO}</p>
                    </header>

                    <div className="flex flex-col gap-3">
                        <label className="relative block">
                            <span className="sr-only">용어 찾기</span>
                            <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-3" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="예: 에버리지, 오시, 빈쿠션"
                                className="w-full h-12 rounded-2xl bg-surface-3 pl-10 pr-10 text-[15px] font-medium text-ink-1 placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-brand/30"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery("")}
                                    aria-label="검색어 지우기"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-ink-3"
                                >
                                    <LucideX className="w-4 h-4" />
                                </button>
                            )}
                        </label>
                        {/* 분류 바로 가기 — 같은 페이지 앵커라 wouter 가 아니라 평범한 링크로 둔다 */}
                        {!q && (
                            <nav aria-label="분류" className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
                                {TERM_CATEGORIES.map((c) => (
                                    <a
                                        key={c.id}
                                        href={`#${categoryAnchorId(c.id)}`}
                                        className="shrink-0 inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-surface-3 text-[13px] font-semibold text-ink-2 active:bg-brand/10"
                                    >
                                        <span className="leading-none">{c.emoji}</span>
                                        {c.label}
                                    </a>
                                ))}
                            </nav>
                        )}
                        {q && <p className="text-[13px] font-medium text-ink-3 tabular-nums">찾은 용어 {found}개</p>}
                    </div>

                    {found === 0 ? (
                        <p className="rounded-2xl bg-surface-3 px-4 py-6 text-center text-[14px] text-ink-3 break-keep">
                            찾는 용어가 사전에 없어요. 다른 이름으로 찾아보세요.
                        </p>
                    ) : (
                        groups.map((g) => g.terms.length > 0 && (
                            <div key={g.id} id={categoryAnchorId(g.id)} className="scroll-mt-4">
                                <Section emoji={g.emoji} title={g.label} meta={<span className="tabular-nums">{g.terms.length}개</span>}>
                                    <List>
                                        {g.terms.map((t) => <TermRow key={t.slug} t={t} flash={flash === t.slug} />)}
                                    </List>
                                </Section>
                            </div>
                        ))
                    )}
                </div>

                <nav aria-label="함께 보기" className="mt-5 flex flex-wrap gap-2">
                    <Link href="/world-ranking" className="h-10 px-4 rounded-full bg-surface-1 text-[13px] font-semibold text-ink-2 inline-flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">🌍 당구 세계랭킹</Link>
                    <Link href="/pba" className="h-10 px-4 rounded-full bg-surface-1 text-[13px] font-semibold text-ink-2 inline-flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">🏆 PBA 투어 랭킹</Link>
                    <Link href="/stores" className="h-10 px-4 rounded-full bg-surface-1 text-[13px] font-semibold text-ink-2 inline-flex items-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">📍 전국 당구장 찾기</Link>
                </nav>
            </div>
        </div>
    );
}

function TermRow({ t, flash }: { t: BilliardsTerm; flash: boolean }) {
    const own = hasOwnPage(t);
    const body = (
        <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                <span className="text-[15px] font-semibold text-ink-1">{t.term}</span>
                {t.aliases?.length ? <span className="text-[12px] font-medium text-ink-3">{t.aliases.join(" · ")}</span> : null}
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2 break-keep">{t.short}</p>
            {/* 짧은 항목은 풀이가 있는 용어로 건너가는 길을 붙인다(프리렌더의 '→ 밀어치기'와 같다) */}
            {!own && t.related?.length ? (
                <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[13px] font-semibold">
                    {t.related.map((r) => termBySlug(r)).filter((x): x is BilliardsTerm => !!x).map((r) =>
                        hasOwnPage(r)
                            ? <Link key={r.slug} href={termPath(r.slug)} className="text-brand">→ {r.term}</Link>
                            : <a key={r.slug} href={`#${encodeURIComponent(r.slug)}`} className="text-brand">→ {r.term}</a>,
                    )}
                </p>
            ) : null}
        </div>
    );
    const cls = cn("flex items-start gap-3 px-4 py-3.5 scroll-mt-24 transition-colors duration-500", flash && "bg-brand/[0.12]");
    return own ? (
        <Link id={t.slug} href={termPath(t.slug)} className={cn(cls, "active:bg-surface-3")}>
            {body}
            <LucideChevronRight className="w-4 h-4 mt-1 shrink-0 text-ink-4" />
        </Link>
    ) : (
        <div id={t.slug} className={cls}>{body}</div>
    );
}
