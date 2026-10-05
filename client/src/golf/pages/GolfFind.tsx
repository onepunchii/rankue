/**
 * /golf/find/:key[/:region] — 조건으로 찾는 골프장 목록: 2인 플레이 · 노캐디 · 3인 플레이
 * (2026-10-05 오너: "우리만의 콘텐츠" → 제안 → "순서대로"의 3번).
 *
 * 허브(GolfCourseHub)의 특징 칩은 화면 안 상태라 자기 주소가 없었다 — 검색으로는 올 수 없었다.
 * 여기는 조건 하나에 주소 하나. 글·제목·설명은 shared/golfFind(검색엔진용 화면과 같은 글), 목록은 허브와 같은 응답·같은 줄(CourseRow).
 * 표시가 있는 곳만 싣는다 — 없는 곳을 "안 된다"고 말하지 않는다(아래 안내 문구).
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/hooks/useAuth";
import { LucideChevronRight, LucideSteeringWheel, LucideUsers, LucideUsers2 } from "@/lib/icons";
import { ORIGIN, REGION_LABEL, listPath } from "@shared/golfCourse";
import {
    FIND_FEATURES, FIND_JOIN_LABEL, FIND_NOTE, findDescription, findFaq, findFeature, findHeading, findPath, findRegionCounts, findTitle,
    hasFindTag, isFindKey, isFindRegion, type FindKey,
} from "@shared/golfFind";
import { PACK_NAV_LABEL, PACK_PATH } from "@shared/golfPack";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { CourseRow, CourseRowSkeleton } from "@/golf/components/course/list/CourseRow";
import { useCourseList, useMyWatches, type WatchFilters } from "@/golf/lib/courseApi";

const PAGE = 30;
const ICON: Record<FindKey, typeof LucideUsers> = { "2people": LucideUsers, nocaddie: LucideSteeringWheel, "3people": LucideUsers2 };

function parse(path: string): { key: string | null; region: string | null } {
    const seg = path.split("?")[0].split("/").filter(Boolean); // ["golf", "find", key, region?]
    let region: string | null = null;
    try { region = seg[3] ? decodeURIComponent(seg[3]).normalize("NFC") : null; } catch { region = seg[3] ?? null; }
    return { key: seg[2] ?? null, region };
}

const chip = (on: boolean, small = false) => cn(
    "shrink-0 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap transition-colors",
    small ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[14px]",
    on ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "bg-[#FFFFFF0A] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF14]",
);

export default function GolfFind() {
    const [path] = useLocation();
    const { key: rawKey, region: rawRegion } = useMemo(() => parse(path), [path]);
    const key = isFindKey(rawKey) ? rawKey : null;
    const region = isFindRegion(rawRegion) ? rawRegion : null;
    const badPath = !key || (rawRegion != null && !region);
    const f = key ? findFeature(key) : null;
    const { member } = useAuth();

    const all = useCourseList({});
    const mine = useMyWatches(!!member);
    const watchOf = useMemo(() => new Map((mine.data ?? []).map((w) => [w.slug, { filters: w.filters as WatchFilters }])), [mine.data]);

    // 조건별 개수(칩) · 이 조건의 지역별 개수 · 지금 범위의 목록 — 전부 같은 전국 응답에서 센다
    const perFeature = useMemo(() => FIND_FEATURES.map((x) => ({ f: x, n: (all.data ?? []).filter((c) => hasFindTag(c, x)).length })), [all.data]);
    const matched = useMemo(() => (f ? (all.data ?? []).filter((c) => hasFindTag(c, f)) : []), [all.data, f]);
    const byRegion = useMemo(() => findRegionCounts(matched), [matched]);
    const shown = useMemo(() => (region ? matched.filter((c) => c.region === region) : matched), [matched, region]);
    const live = useMemo(() => shown.reduce((n, c) => n + c.counts.booking + c.counts.join, 0), [shown]);
    const [limit, setLimit] = useState(PAGE);

    const count = shown.length;
    const faq = useMemo(() => (key ? findFaq({ key, count: matched.length, byRegion }) : []), [key, matched.length, byRegion]);
    const crumbs = useMemo(() => (key ? [
        { name: "전국 골프장", path: listPath() },
        { name: findFeature(key).noun, path: findPath(key) },
        ...(region ? [{ name: REGION_LABEL[region] ?? region, path: findPath(key, region) }] : []),
    ] : []), [key, region]);
    const jsonLd = useMemo(() => (key ? {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: ORIGIN + c.path })),
    } : null), [key, crumbs]);
    useSeo(key && all.isSuccess ? { title: findTitle({ key, region, count }), description: findDescription({ key, region, count }), path: findPath(key, region), jsonLd } : null);

    if (badPath || !key || !f) {
        return (
            <CourseShell backTo="/golf/courses">
                <div className="px-5 pt-16 text-center">
                    <p className="text-[16px] font-semibold text-white">찾는 목록이 없어요</p>
                    <Link href="/golf/courses" className="mt-4 inline-flex h-11 px-5 rounded-xl bg-[#FFFFFF14] text-[14px] font-medium text-white items-center">전국 골프장 보기</Link>
                </div>
            </CourseShell>
        );
    }

    const where = region ? (REGION_LABEL[region] ?? region) : "전국";
    return (
        <CourseShell backTo={region ? findPath(key) : "/golf/courses"}>
            <div className="px-5 pt-5">
                <nav aria-label="위치" className="mb-1.5 flex items-center gap-1 text-[13px] text-[#FFFFFF66] min-w-0">
                    {crumbs.map((c, i) => (
                        <span key={c.path} className="flex items-center gap-1 min-w-0">
                            {i > 0 && <LucideChevronRight weight="bold" className="w-3.5 h-3.5 shrink-0 text-[#FFFFFF33]" />}
                            {i < crumbs.length - 1
                                ? <Link href={c.path} className="truncate active:text-[#FFFFFF]">{c.name}</Link>
                                : <span className="truncate text-[#FFFFFFA6]">{c.name}</span>}
                        </span>
                    ))}
                </nav>
                <h1 className="text-[27px] leading-[1.2] font-bold tracking-tight text-[#FFFFFF] break-keep">{findHeading(key, region)}</h1>
                <p className="mt-1.5 h-[20px] text-[14px] text-[#FFFFFF73] tabular-nums">
                    {all.isSuccess && (
                        <>{count.toLocaleString()}곳{live > 0 && <> · 지금 티타임 <span className="text-[#8BE84A] font-medium">{live.toLocaleString()}건</span></>}</>
                    )}
                </p>
                <p className="mt-3 text-[15px] leading-[1.7] text-[#FFFFFFB3] break-keep">{f.lead}</p>
            </div>

            {/* 조건 — 링크라서 검색엔진이 세 목록 사이를 따라간다 */}
            <nav aria-label="조건" className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide px-5">
                {perFeature.map(({ f: x, n }) => {
                    const I = ICON[x.key];
                    const on = x.key === key;
                    return (
                        <Link key={x.key} href={findPath(x.key, region)} aria-current={on ? "page" : undefined} className={chip(on)}>
                            <I weight="fill" className="w-4 h-4" aria-hidden />
                            {x.label}
                            {all.isSuccess && <span className={cn("tabular-nums", on ? "text-[#0A0A0A73]" : "text-[#FFFFFF59]")}>{n}</span>}
                        </Link>
                    );
                })}
            </nav>
            {/* 지역 — 0곳인 지역은 누를 수 없게 흐리게 */}
            <nav aria-label="지역" className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide px-5">
                <Link href={findPath(key)} aria-current={!region ? "page" : undefined} className={chip(!region, true)}>
                    전국{all.isSuccess && <span className={cn("tabular-nums", !region ? "text-[#0A0A0A73]" : "text-[#FFFFFF59]")}>{matched.length}</span>}
                </Link>
                {byRegion.map((r) => {
                    const on = r.region === region;
                    if (all.isSuccess && r.count === 0) return <span key={r.region} className={cn(chip(false, true), "opacity-35")} aria-disabled>{r.region}<span className="tabular-nums text-[#FFFFFF59]">0</span></span>;
                    return (
                        <Link key={r.region} href={findPath(key, r.region)} aria-current={on ? "page" : undefined} className={chip(on, true)}>
                            {r.region}{all.isSuccess && <span className={cn("tabular-nums", on ? "text-[#0A0A0A73]" : "text-[#FFFFFF59]")}>{r.count}</span>}
                        </Link>
                    );
                })}
            </nav>

            <section className="mt-6" aria-label={`${where} ${f.noun}`}>
                <ul className="border-t border-[#FFFFFF0F]">
                    {all.isPending ? (
                        Array.from({ length: 6 }, (_, i) => <CourseRowSkeleton key={i} />)
                    ) : all.isError ? (
                        <li className="px-5 py-6 text-[14px] text-[#FFFFFF8C]">불러오지 못했어요.</li>
                    ) : shown.length === 0 ? (
                        <li className="px-5 py-6 text-[14px] text-[#FFFFFF8C] break-keep">{where}에는 확인된 {f.noun}이 아직 없어요.</li>
                    ) : (
                        shown.slice(0, limit).map((c) => <CourseRow key={c.slug} c={c} km={null} myWatch={watchOf.get(c.slug) ?? null} />)
                    )}
                </ul>
                {shown.length > limit && (
                    <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-3 mx-5 w-[calc(100%-2.5rem)] h-12 rounded-2xl bg-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFB3] active:bg-[#FFFFFF14]">
                        더 보기 <span className="text-[#FFFFFF66] tabular-nums">{(shown.length - limit).toLocaleString()}곳</span>
                    </button>
                )}
                <p className="mt-3 px-5 text-[13px] leading-relaxed text-[#FFFFFF73] break-keep">{FIND_NOTE}</p>
            </section>

            {f.join && (
                <Link href={listPath({ intent: "join", region })} className="mx-5 mt-6 px-4 py-3.5 rounded-2xl bg-[#FF6B0014] flex items-center gap-3 active:bg-[#FF6B0024] transition-colors">
                    <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold text-white break-keep">{f.join}</span>
                        <span className="block mt-0.5 text-[13px] text-[#FF9A52]">{where} {FIND_JOIN_LABEL}</span>
                    </span>
                    <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FF9A52]" aria-hidden />
                </Link>
            )}

            <section className="px-5 pt-9">
                <h2 className="mb-3 text-[19px] font-bold tracking-tight text-white">알아 둘 것</h2>
                <ul className="rounded-2xl bg-[#FFFFFF08] px-4 py-1.5 divide-y divide-[#FFFFFF0A]">
                    {f.points.map((t) => <li key={t} className="py-3 text-[14.5px] leading-[1.65] text-[#FFFFFFCC] break-keep">{t}</li>)}
                </ul>
            </section>

            <section className="px-5 pt-9">
                <h2 className="mb-3 text-[19px] font-bold tracking-tight text-white">자주 묻는 것</h2>
                <dl className="rounded-2xl bg-[#FFFFFF08] px-4 py-1.5 divide-y divide-[#FFFFFF0A]">
                    {faq.map((x) => (
                        <div key={x.q} className="py-3.5">
                            <dt className="text-[15px] font-semibold text-white break-keep">{x.q}</dt>
                            <dd className="mt-1.5 text-[14px] leading-[1.65] text-[#FFFFFFB3] break-keep">{x.a}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <nav className="px-5 pt-8 pb-4 flex flex-wrap gap-2" aria-label="더 보기">
                <Link href={listPath({ region })} className="h-10 px-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center active:bg-[#FFFFFF1A]">{where} 골프장 전체</Link>
                <Link href={PACK_PATH} className="h-10 px-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center active:bg-[#FFFFFF1A]">{PACK_NAV_LABEL}</Link>
            </nav>
        </CourseShell>
    );
}
