/**
 * /golf/terms · /golf/terms/:slug — 골프 용어 사전(2026-10-05 오너: "이모지 및 아이콘을 활용하자 … 우리만의 콘텐츠" → "순서대로"의 4번).
 *
 * 글은 shared/golfTerms(본문)·shared/golfTermsMeta(주소·제목) — 검색엔진용 화면(server/seo/golfTerms.ts)과 같은 글이다.
 * 틀은 당구 용어 사전과 같다: 자주 찾는 말만 자기 페이지를 갖고, 짧은 항목은 허브의 그 줄(#앵커)에 산다.
 * 용어마다 이모지 하나 — 사진 없이 말의 느낌을 준다(버디 🐦 · 양파 🧅 · 라베 🏆).
 * 로그인 없이 열린다(검색으로 들어온 사람이 본다).
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import { GOLF_TERMS, GOLF_TERMS_INTRO, GOLF_TERM_CATEGORIES, golfTermBySlug, golfTermsInCategory, type GolfTerm } from "@shared/golfTerms";
import {
    GOLF_TERMS_H1, GOLF_TERMS_NAV_LABEL, GOLF_TERMS_PATH, GOLF_TERMS_TITLE, GOLF_TERM_NOT_FOUND, GOLF_TERM_SECTIONS,
    golfCategoryAnchorId, golfTermAnchorPath, golfTermDescription, golfTermHref, golfTermJsonLd, golfTermPath, golfTermTitle, golfTermsDesc, golfTermsJsonLd,
    hasGolfTermPage,
} from "@shared/golfTermsMeta";
import { PACK_NAV_LABEL, PACK_PATH } from "@shared/golfPack";
import { CourseShell } from "@/golf/components/course/CourseShell";

const PLATE = "shrink-0 rounded-full bg-[#FFFFFF0F] flex items-center justify-center leading-none";
/** 상단 바(56) 밑에 가리지 않게 */
const ANCHOR = { scrollMarginTop: "calc(72px + env(safe-area-inset-top))" } as const;
const PILL = "h-10 px-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center active:bg-[#FFFFFF1A]";

function slugOf(path: string): string | null {
    const seg = path.split("?")[0].split("#")[0].split("/").filter(Boolean); // ["golf", "terms", slug?]
    if (!seg[2]) return null;
    try { return decodeURIComponent(seg[2]).normalize("NFC"); } catch { return seg[2]; }
}

export default function GolfTerms() {
    const [path, setLocation] = useLocation();
    const slug = useMemo(() => slugOf(path), [path]);
    const term = slug ? golfTermBySlug(slug) : undefined;
    // 짧은 항목은 자기 주소가 없다 — 허브의 그 줄로 보낸다(검색엔진용 화면의 301 과 같은 곳)
    useEffect(() => {
        if (term && !hasGolfTermPage(term)) setLocation(golfTermAnchorPath(term.slug), { replace: true });
    }, [term, setLocation]);

    if (!slug) return <Hub />;
    if (!term) return <NotFound />;
    if (!hasGolfTermPage(term)) return <Hub />;
    return <TermPage t={term} />;
}

// ── 허브 ──────────────────────────────────────────────────────────
function Hub() {
    const pages = useMemo(() => GOLF_TERMS.filter(hasGolfTermPage).length, []);
    const jsonLd = useMemo(() => golfTermsJsonLd(GOLF_TERMS), []);
    useSeo({ title: GOLF_TERMS_TITLE, description: golfTermsDesc(GOLF_TERMS.length, pages), path: GOLF_TERMS_PATH, jsonLd });

    // #용어 로 들어왔으면 그 줄로 — 처음 한 번과 주소의 # 이 바뀔 때
    useEffect(() => {
        const go = () => {
            let id = "";
            try { id = decodeURIComponent(window.location.hash.slice(1)).normalize("NFC"); } catch { /* 잘못된 % — 맨 위에 둔다 */ }
            if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
        };
        const t = window.setTimeout(go, 60);
        window.addEventListener("hashchange", go);
        return () => { window.clearTimeout(t); window.removeEventListener("hashchange", go); };
    }, []);

    return (
        <CourseShell title={GOLF_TERMS_NAV_LABEL} backTo="/golf/courses">
            <div className="px-5 pt-7">
                <h1 className="text-[25px] font-bold tracking-tight leading-tight text-white">{GOLF_TERMS_H1}</h1>
                <p className="mt-3 text-[15px] leading-[1.7] text-[#FFFFFFB3] break-keep">{GOLF_TERMS_INTRO}</p>
                <p className="mt-2 text-[13px] text-[#FFFFFF73] tabular-nums">용어 {GOLF_TERMS.length}개 · 자세한 풀이 {pages}개</p>
            </div>
            <nav aria-label="갈래" className="mt-4 flex gap-1.5 overflow-x-auto scrollbar-hide px-5">
                {GOLF_TERM_CATEGORIES.map((c) => (
                    <a key={c.id} href={`#${golfCategoryAnchorId(c.id)}`} className="shrink-0 h-9 pl-3 pr-3.5 rounded-full bg-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFB3] inline-flex items-center gap-1.5 whitespace-nowrap active:bg-[#FFFFFF14]">
                        <span className="text-[15px] leading-none" aria-hidden>{c.emoji}</span>{c.label}
                    </a>
                ))}
            </nav>

            {GOLF_TERM_CATEGORIES.map((c) => (
                <section key={c.id} id={golfCategoryAnchorId(c.id)} className="px-5 pt-9" style={ANCHOR}>
                    <h2 className="mb-3 text-[19px] font-bold tracking-tight text-white"><span className="mr-2" aria-hidden>{c.emoji}</span>{c.label}</h2>
                    <ul className="rounded-2xl bg-[#FFFFFF08] overflow-hidden divide-y divide-[#FFFFFF0A]">
                        {golfTermsInCategory(c.id).map((t) => <HubRow key={t.slug} t={t} />)}
                    </ul>
                </section>
            ))}

            <nav className="px-5 pt-8 pb-4 flex flex-wrap gap-2" aria-label="더 보기">
                <Link href={PACK_PATH} className={PILL}>{PACK_NAV_LABEL}</Link>
                <Link href="/golf/courses" className={PILL}>전국 골프장 · 날씨</Link>
                <Link href="/golf/join" className={PILL}>조인 찾기</Link>
            </nav>
        </CourseShell>
    );
}

function HubRow({ t }: { t: GolfTerm }) {
    const own = hasGolfTermPage(t);
    const body = (
        <>
            <span className={`${PLATE} w-10 h-10 text-[19px]`} aria-hidden>{t.emoji}</span>
            <span className="flex-1 min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 text-[15.5px] font-semibold text-white">
                    {t.term}
                    {t.aliases?.length ? <span className="text-[12.5px] font-normal text-[#FFFFFF66]">{t.aliases.join(" · ")}</span> : null}
                </span>
                <span className="block mt-1 text-[14px] leading-[1.6] text-[#FFFFFFA6] break-keep">{t.short}</span>
            </span>
            {own && <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF59]" aria-hidden />}
        </>
    );
    return (
        <li id={t.slug} style={ANCHOR}>
            {own
                ? <Link href={golfTermPath(t.slug)} className="flex items-center gap-3 px-4 py-3.5 active:bg-[#FFFFFF0A] transition-colors">{body}</Link>
                : <div className="flex items-center gap-3 px-4 py-3.5">{body}</div>}
        </li>
    );
}

// ── 용어 한 개 ────────────────────────────────────────────────────
function TermPage({ t }: { t: GolfTerm }) {
    const jsonLd = useMemo(() => golfTermJsonLd(t), [t]);
    useSeo({ title: golfTermTitle(t.term), description: golfTermDescription(t), path: golfTermPath(t.slug), jsonLd });
    useEffect(() => { window.scrollTo(0, 0); }, [t.slug]);
    const related = (t.related ?? []).map((s) => golfTermBySlug(s)).filter((x): x is GolfTerm => !!x);

    return (
        <CourseShell title={GOLF_TERMS_NAV_LABEL} backTo={GOLF_TERMS_PATH}>
            <article className="px-5 pt-5">
                <nav aria-label="위치" className="mb-4 flex items-center gap-1 text-[13px] text-[#FFFFFF66] min-w-0">
                    <Link href={GOLF_TERMS_PATH} className="shrink-0 active:text-white">{GOLF_TERMS_H1}</Link>
                    <LucideChevronRight weight="bold" className="w-3.5 h-3.5 shrink-0 text-[#FFFFFF33]" />
                    <span className="truncate text-[#FFFFFFA6]">{t.term}</span>
                </nav>
                <div className="flex items-center gap-4">
                    <span className={`${PLATE} w-16 h-16 text-[32px]`} aria-hidden>{t.emoji}</span>
                    <div className="min-w-0">
                        <h1 className="text-[28px] font-bold tracking-tight leading-tight text-white break-keep">{t.term}</h1>
                        {t.aliases?.length ? <p className="mt-1 text-[13.5px] text-[#FFFFFF73]">{t.aliases.join(" · ")}</p> : null}
                    </div>
                </div>
                <p className="mt-5 text-[16px] leading-[1.7] font-medium text-[#FFFFFFE6] break-keep">{t.short}</p>

                {GOLF_TERM_SECTIONS.map((s) => {
                    const text = t.page?.[s.key];
                    if (!text) return null;
                    return (
                        <section key={s.key} className="pt-8">
                            <h2 className="mb-2.5 text-[18px] font-bold tracking-tight text-white">{s.label}</h2>
                            <p className="text-[15px] leading-[1.75] text-[#FFFFFFCC] break-keep">{text}</p>
                        </section>
                    );
                })}

                {t.links?.length ? (
                    <ul className="mt-8 rounded-2xl bg-[#FFFFFF08] overflow-hidden divide-y divide-[#FFFFFF0A]">
                        {t.links.map((l) => (
                            <li key={l.href}>
                                <Link href={l.href} className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-[#FFFFFFE6] active:bg-[#FFFFFF0A]">
                                    <span className="flex-1 min-w-0 truncate">{l.label}</span>
                                    <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF59]" aria-hidden />
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : null}

                {related.length > 0 && (
                    <section className="pt-8">
                        <h2 className="mb-3 text-[18px] font-bold tracking-tight text-white">같이 보면 좋은 말</h2>
                        <div className="flex flex-wrap gap-2">
                            {related.map((r) => (
                                <Link key={r.slug} href={golfTermHref(r)} className="h-10 pl-3 pr-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center gap-1.5 active:bg-[#FFFFFF1A]">
                                    <span className="text-[16px] leading-none" aria-hidden>{r.emoji}</span>{r.term}
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <Link href={GOLF_TERMS_PATH} className="mt-9 mb-4 w-full h-12 rounded-2xl bg-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFB3] flex items-center justify-center active:bg-[#FFFFFF14]">
                    골프 용어 전체 보기
                </Link>
            </article>
        </CourseShell>
    );
}

function NotFound() {
    useSeo({ title: GOLF_TERM_NOT_FOUND.title, description: GOLF_TERM_NOT_FOUND.desc, path: GOLF_TERMS_PATH });
    return (
        <CourseShell title={GOLF_TERMS_NAV_LABEL} backTo={GOLF_TERMS_PATH}>
            <div className="px-5 pt-16 text-center">
                <p className="text-[16px] font-semibold text-white">{GOLF_TERM_NOT_FOUND.heading}</p>
                <p className="mt-2 text-[14px] text-[#FFFFFF99] break-keep">{GOLF_TERM_NOT_FOUND.desc}</p>
                <Link href={GOLF_TERMS_PATH} className="mt-5 inline-flex h-11 px-5 rounded-xl bg-[#FFFFFF14] text-[14px] font-medium text-white items-center">골프 용어 전체 보기</Link>
            </div>
        </CourseShell>
    );
}
