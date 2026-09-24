import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronDown, LucideChevronRight, LucideExternalLink } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { Section, Chip, List } from "@/components/hiq/umb/ui";
import {
    TOUR_TEXT, PageHeader, LoadState, StatusChip, cityLabel, countryLabel, daysUntil, leagueLabel, rangeLabel, seasonChip,
} from "@/components/hiq/tournaments/parts";
import {
    HUB_TITLE, TOURNAMENTS_PATH, hubDescription, hubJsonLd, pbaSeasonPath, pbaTourPath, tourStatus, umbEventPath,
    type TournamentHub, type UpcomingEvent,
} from "@shared/tournamentMeta";

const UPCOMING_FOLD = 8; // 다가오는 대회는 1년 치라 길다 — 먼저 8줄
const UMB_YEARS_OPEN = 2; // UMB 대회는 최근 두 해만 먼저 — 주니어 표까지 합치면 40개 가까이 된다

// 당구 대회 허브(2026-09-24) — /tournaments. 다가오는 대회(PBA 일정 + UMB 공식 달력)와 지난 대회(PBA 시즌별 우승자 · UMB 해별).
// 봇에게는 server/seo/tournaments.ts 가 같은 저장소 함수로 같은 목록을 낸다(접기·펼치기만 화면 전용).
export default function HiqTournaments() {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const [, setLocation] = useLocation();
    const [allUpcoming, setAllUpcoming] = useState(false);
    const [openSeason, setOpenSeason] = useState<Record<number, boolean>>({});
    const [allUmb, setAllUmb] = useState(false);

    const { data, isLoading, isError, refetch, isFetching } = useQuery<TournamentHub>({
        queryKey: ["/api/hiq/tournaments"],
        queryFn: async () => apiRequest("/api/hiq/tournaments"),
        staleTime: 10 * 60 * 1000,
    });

    // 제목·설명·JSON-LD 는 프리렌더와 같은 함수(shared/tournamentMeta) — 화면 언어와 상관없이 한국어 정본 주소의 메타
    const seo = useMemo(() => data ? {
        title: HUB_TITLE, description: hubDescription(data), path: TOURNAMENTS_PATH, jsonLd: hubJsonLd(data),
    } : null, [data]);
    useSeo(seo);

    const upcoming = data ? (allUpcoming ? data.upcoming : data.upcoming.slice(0, UPCOMING_FOLD)) : [];
    // 우승자를 펼쳐 둘 시즌 — 우승자가 있는 가장 최근 시즌 하나(막 시작한 시즌은 비어 있다)
    const firstWon = data?.pbaSeasons.find((s) => s.winners.length)?.season;
    const umbYears = data ? (allUmb ? data.umbYears : data.umbYears.slice(0, UMB_YEARS_OPEN)) : [];
    const umbHidden = data ? data.umbYears.slice(UMB_YEARS_OPEN).reduce((n, y) => n + y.events.length, 0) : 0;

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            <PageHeader
                title={L.hubTitle} sub={L.hubSub} onBack={() => setLocation("/dashboard")} backLabel={L.back}
                shareUrl={TOURNAMENTS_PATH} shareTitle={HUB_TITLE}
            />

            <LoadState
                isLoading={isLoading} notFound={false} failed={isError && !data} onRetry={() => refetch()} retrying={isFetching}
                L={L} backHref={TOURNAMENTS_PATH} onNavigate={setLocation}
            />

            {data && (
                <div className="flex flex-col gap-4 relative z-10">
                    {/* 요약 문장 — 한국어는 검색 설명과 같은 문장(프리렌더 본문 첫 문단) */}
                    {locale === "ko" && <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{hubDescription(data)}</p>}

                    <div className="rk-card p-5">
                        <Section emoji="📅" title={L.upcoming} meta={data.upcoming.length ? `${data.upcoming.length}` : undefined}>
                            {!data.umbCalendarOk && (
                                <p className="text-[12px] font-medium text-ink-3 -mt-1 mb-3">{L.umbCalFail}</p>
                            )}
                            {data.upcoming.length === 0 ? (
                                <p className="text-[13.5px] font-medium text-ink-3 py-4 text-center">{L.upcomingEmpty}</p>
                            ) : (
                                <List>
                                    {/* PBA·LPBA 가 같은 이름·같은 날 시작하는 대회도 있어 리그와 순번까지 키에 넣는다 */}
                                    {upcoming.map((e, i) => <UpcomingRow key={`${e.source}:${e.league ?? ""}:${e.startDate}:${e.title}:${i}`} e={e} today={data.today} />)}
                                </List>
                            )}
                            {data.upcoming.length > UPCOMING_FOLD && !allUpcoming && (
                                <button
                                    onClick={() => setAllUpcoming(true)}
                                    className="w-full h-11 mt-2 rounded-2xl bg-surface-3 text-[13.5px] font-semibold text-ink-2 transition-colors"
                                >
                                    {L.showMore(data.upcoming.length - UPCOMING_FOLD)}
                                </button>
                            )}
                        </Section>
                    </div>

                    {data.pbaSeasons.length > 0 && (
                        <div className="rk-card p-5">
                            <Section emoji="🏆" title={L.pbaSeasons}>
                                <div className="flex flex-col gap-3">
                                    {data.pbaSeasons.map((s) => {
                                        const open = openSeason[s.season] ?? s.season === firstWon;
                                        return (
                                            <div key={s.season} className="rounded-2xl bg-surface-3 overflow-hidden">
                                                <Link href={pbaSeasonPath(s.season)} className="flex items-center justify-between gap-3 px-4 h-14">
                                                    <span className="shrink-0 text-[15px] font-bold text-ink-1 tabular-nums">{L.season(seasonChip(s.season))}</span>
                                                    {/* 영어·스페인어는 "32 events · 20 finished" 가 길어 375 폭에서 넘친다 — 숫자 쪽을 줄임표로 */}
                                                    <span className="flex items-center gap-1.5 min-w-0 text-[12px] font-semibold text-ink-3 tabular-nums">
                                                        <span className="truncate">{L.seasonCounts(s.tours, s.finished)}</span>
                                                        <LucideChevronRight className="w-4 h-4 shrink-0" />
                                                    </span>
                                                </Link>
                                                {s.winners.length > 0 && (open ? (
                                                    <div className="border-t border-surface-line divide-y divide-surface-line">
                                                        {s.winners.map((w) => (
                                                            <Link
                                                                key={`${w.season}:${w.tourCode}`}
                                                                href={pbaTourPath(w.season, w.tourCode!)}
                                                                className="flex items-center gap-3 px-4 py-3"
                                                            >
                                                                <Chip tone={w.league === "LPBA" ? "gold" : "brand"} className="shrink-0">{w.league}</Chip>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block text-[13.5px] font-semibold text-ink-1 truncate">
                                                                        {locale === "ko" ? w.title : (w.titleEn ?? w.title)}
                                                                    </span>
                                                                    <span className="block text-[12px] font-medium text-ink-3 truncate">🏆 {w.winnerName}</span>
                                                                </span>
                                                                <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                                                            </Link>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setOpenSeason((o) => ({ ...o, [s.season]: true }))}
                                                        className="w-full h-11 border-t border-surface-line flex items-center justify-center gap-1 text-[13px] font-semibold text-ink-2"
                                                    >
                                                        {L.openWinners(s.winners.length)} <LucideChevronDown className="w-4 h-4" />
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </Section>
                        </div>
                    )}

                    {data.umbYears.length > 0 && (
                        <div className="rk-card p-5">
                            <Section emoji="🌍" title={L.umbEvents} desc={L.umbEventsDesc}>
                                <div className="flex flex-col gap-4">
                                    {umbYears.map((y) => (
                                        <div key={y.year}>
                                            <p className="text-[12px] font-bold text-ink-3 mb-2 px-1 tabular-nums">{L.year(y.year)}</p>
                                            <List>
                                                {y.events.map((e) => (
                                                    <Link key={e.slug} href={umbEventPath(e.slug)} className="flex items-center gap-3 px-4 py-3">
                                                        <span className="text-[18px] leading-none shrink-0">{flagEmoji(e.country)}</span>
                                                        <span className="min-w-0 flex-1">
                                                            {/* 해 묶음 안이라 이름에서 연도를 뺀다 — 넣으면 좁은 폰에서 '월드컵'이 잘린다 */}
                                                            <span className="block text-[14px] font-semibold text-ink-1 truncate">{L.umbShort(e)}</span>
                                                            <span className="block text-[12px] font-medium text-ink-3 truncate tabular-nums">
                                                                {rangeLabel(e.date, e.date, locale, y.year)}{e.org ? ` · ${e.org}` : ""} · {L.playersWithPoints(e.players)}
                                                            </span>
                                                        </span>
                                                        <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                                                    </Link>
                                                ))}
                                            </List>
                                        </div>
                                    ))}
                                </div>
                                {umbHidden > 0 && !allUmb && (
                                    <button
                                        onClick={() => setAllUmb(true)}
                                        className="w-full h-11 mt-3 rounded-2xl bg-surface-3 text-[13.5px] font-semibold text-ink-2 transition-colors"
                                    >
                                        {L.showMore(umbHidden)}
                                    </button>
                                )}
                            </Section>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Link href="/pba" className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between active:scale-[0.99] transition-transform">
                            {L.pbaRanking} <LucideChevronRight className="w-4 h-4" />
                        </Link>
                        <Link href="/world-ranking" className="h-12 px-5 rounded-2xl bg-white text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            {L.worldRanking} <LucideChevronRight className="w-4 h-4 text-ink-3" />
                        </Link>
                    </div>
                    <p className="text-center text-[12px] font-medium text-ink-3 py-2">{L.source}</p>
                </div>
            )}

            <HiqNavigation />
        </div>
    );
}

/** 다가오는 대회 한 줄 — PBA 는 우리 대회 페이지(있으면), UMB 는 공식 달력(바깥 링크) */
function UpcomingRow({ e, today }: { e: UpcomingEvent; today: string }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const status = tourStatus(e, today);
    const title = locale === "ko" ? e.title : (e.titleEn ?? e.title);
    const where = e.source === "PBA"
        ? e.place
        : [e.place ? cityLabel(e.place, locale) : "", countryLabel(e.countryCode, e.country, locale)].filter(Boolean).join(", ");
    const inner = (
        <>
            {/* 칩은 줄바꿈하지 않는다 — 베트남어·터키어 '진행 중'이 w-14 를 넘으면 옆 글자와 겹치므로 최소 폭만 준다 */}
            <div className="min-w-14 shrink-0 pt-0.5">
                <StatusChip status={status} days={daysUntil(today, e.startDate)} L={L} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn(
                        "text-[12px] font-bold leading-none",
                        e.source === "UMB" ? "text-ink-2" : e.league === "LPBA" ? "text-[#8a6a0a]" : "text-brand",
                    )}>
                        {e.source === "UMB" ? `UMB${e.org && e.org !== "UMB" ? ` · ${e.org.replace(/^UMB\s*\/\s*/, "")}` : ""}` : leagueLabel(e.league ?? "PBA", locale)}
                    </span>
                    {e.postponed && <span className="text-[12px] font-bold leading-none text-[#b45309]">{L.postponed}</span>}
                </div>
                <p className="text-[14px] font-semibold text-ink-1 leading-snug line-clamp-2">{title}</p>
                <p className="text-[12px] font-medium text-ink-3 mt-0.5 line-clamp-2 tabular-nums">
                    {rangeLabel(e.startDate, e.endDate, locale, today.slice(0, 4))}{where ? ` · ${where}` : ""}
                </p>
            </div>
            {e.href
                ? <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0 mt-1" />
                : <LucideExternalLink className="w-4 h-4 text-ink-3 shrink-0 mt-1" />}
        </>
    );
    const cls = "flex items-start gap-3 px-4 py-3";
    return e.href
        ? <Link href={e.href} className={cls}>{inner}</Link>
        : <a href={e.officialUrl} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
}
