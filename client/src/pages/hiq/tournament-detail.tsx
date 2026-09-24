import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideChevronRight, LucideExternalLink } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { Section, Tile, Chip, List } from "@/components/hiq/umb/ui";
import {
    TOUR_TEXT, PageHeader, LoadState, StatusChip, cityLabel, countryLabel, daysUntil, leagueLabel, prizeLabel, rangeLabel, seasonChip,
} from "@/components/hiq/tournaments/parts";
import {
    PBA_OFFICIAL_SCHEDULE, PBA_TOUR_LEAGUES, TOURNAMENTS_PATH, UMB_OFFICIAL,
    hasTourPage, parseSeasonSeg, parseTourCodeSeg, pbaOfficialUrl, pbaSeasonPath, pbaTourPath, primarySection,
    seasonDescription, seasonJsonLd, seasonTitle, tourDescription, tourJsonLd, tourNameWithSeason, tourStatus, tourTitle,
    umbEventDescription, umbEventJsonLd, umbEventPath, umbEventTitle, UMB_SLUG_RE, umbRowNameKo,
    type PbaSeasonPage, type PbaTourLeague, type PbaTourPage, type PbaTourRow, type UmbEventDetail, type UmbEventRow,
} from "@shared/tournamentMeta";

// 대회 페이지(2026-09-24) — 한 파일에서 세 주소를 받는다(App.tsx 라우트 셋이 모두 이 컴포넌트).
//   /tournaments/pba/:season              PBA 시즌 — 리그 칩으로 거르는 일정·우승자 목록
//   /tournaments/pba/:season/:tourCode    PBA 대회 — 정보·우승자(우리 pba_players 통산 기록)·같은 대회 역대 우승자
//   /tournaments/umb/:slug                UMB 대회 — 부문별 '획득 랭킹 포인트'(대회 순위 아님)·한국 선수
// 봇에게는 server/seo/tournaments.ts 가 같은 저장소 함수로 같은 내용을 낸다. 선수 사진은 쓰지 않는다(국기 + 이름).
export default function HiqTournamentDetail() {
    const [isTour, tourParams] = useRoute("/tournaments/pba/:season/:tourCode");
    const [isSeason, seasonParams] = useRoute("/tournaments/pba/:season");
    const [isUmb, umbParams] = useRoute("/tournaments/umb/:slug");
    if (isTour) return <TourView seasonSeg={tourParams?.season ?? ""} codeSeg={tourParams?.tourCode ?? ""} />;
    if (isSeason) return <SeasonView seasonSeg={seasonParams?.season ?? ""} />;
    if (isUmb) return <UmbView slugSeg={umbParams?.slug ?? ""} />;
    return null;
}

const is404 = (e: unknown) => e instanceof ApiError && e.status === 404;
const tourTitleOf = (r: Pick<PbaTourRow, "title" | "titleEn">, locale: Locale) => (locale === "ko" ? r.title : (r.titleEn ?? r.title));

function Shell({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            {children}
            <HiqNavigation />
        </div>
    );
}

/* ── PBA 시즌 ── */

function SeasonView({ seasonSeg }: { seasonSeg: string }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const [, setLocation] = useLocation();
    const season = parseSeasonSeg(seasonSeg);
    const [league, setLeague] = useState<PbaTourLeague | "ALL">("ALL");
    useEffect(() => { setLeague("ALL"); window.scrollTo(0, 0); }, [season]);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PbaSeasonPage>({
        queryKey: ["/api/hiq/tournaments/pba", season],
        queryFn: async () => apiRequest(`/api/hiq/tournaments/pba/${season}`),
        enabled: !!season,
        staleTime: 10 * 60 * 1000,
        retry: false, // 없는 시즌은 404 — 다시 물어도 같다
    });
    const seo = useMemo(() => data ? {
        title: seasonTitle(data.season), description: seasonDescription(data), path: pbaSeasonPath(data.season), jsonLd: seasonJsonLd(data),
    } : null, [data]);
    useSeo(seo);

    const notFound = !season || (isError && !data && is404(error));
    const leagues = data ? PBA_TOUR_LEAGUES.filter((lg) => data.tours.some((t) => t.league === lg)) : [];
    const shown = data ? data.tours.filter((t) => league === "ALL" || t.league === league) : [];
    // 타일은 공식 일정 줄 전부로 센다(허브의 시즌 칸과 같은 셈) — 종료 + 남은 대회 = 대회
    const total = data?.tours.length ?? 0;
    const finished = data ? data.tours.filter((t) => tourStatus(t, data.today) === "finished").length : 0;
    const remaining = total - finished;

    return (
        <Shell>
            <PageHeader
                title={season ? `${seasonChip(season)} PBA` : L.notFound} sub={L.seasonSub}
                onBack={() => setLocation(TOURNAMENTS_PATH)} backLabel={L.back}
                shareUrl={data ? pbaSeasonPath(data.season) : undefined} shareTitle={data ? seasonTitle(data.season) : undefined}
            />
            <LoadState
                isLoading={!notFound && isLoading} notFound={notFound} failed={!notFound && isError && !data}
                onRetry={() => refetch()} retrying={isFetching} L={L} backHref={TOURNAMENTS_PATH} onNavigate={setLocation}
            />
            {data && (
                <div className="flex flex-col gap-4 relative z-10">
                    {locale === "ko" && <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{seasonDescription(data)}</p>}

                    {data.seasons.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-hide">
                            {data.seasons.map((s) => (
                                <Link
                                    key={s}
                                    href={pbaSeasonPath(s)}
                                    className={cn(
                                        "shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold tabular-nums flex items-center transition-colors",
                                        s === data.season ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                                    )}
                                >
                                    {seasonChip(s)}
                                </Link>
                            ))}
                        </div>
                    )}

                    <div className="rk-card p-5 flex flex-col gap-5">
                        <div className="grid grid-cols-3 gap-2">
                            <Tile emoji="🎱" value={String(total)} label={L.toursTile} accent />
                            <Tile emoji="✅" value={String(finished)} label={L.finishedTile} />
                            <Tile emoji="📅" value={String(remaining)} label={L.upcomingTile} />
                        </div>

                        {leagues.length > 1 && (
                            <div className="flex flex-wrap gap-1.5">
                                {(["ALL", ...leagues] as const).map((lg) => (
                                    <button
                                        key={lg}
                                        onClick={() => setLeague(lg)}
                                        className={cn(
                                            "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                            league === lg ? "bg-ink-1 text-white" : "bg-surface-3 text-ink-3",
                                        )}
                                    >
                                        {lg === "ALL" ? L.all : leagueLabel(lg, locale)}
                                    </button>
                                ))}
                            </div>
                        )}

                        <List>
                            {shown.map((t) => <SeasonRow key={`${t.league}:${t.startDate}:${t.tourCode ?? t.title}`} t={t} today={data.today} />)}
                        </List>
                    </div>

                    <a href={PBA_OFFICIAL_SCHEDULE} target="_blank" rel="noopener noreferrer" className="h-12 px-5 rounded-2xl bg-white text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        {L.officialPage} <LucideExternalLink className="w-4 h-4 text-ink-3" />
                    </a>
                    <Link href={TOURNAMENTS_PATH} className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between">
                        {L.allTournaments} <LucideChevronRight className="w-4 h-4" />
                    </Link>
                    <p className="text-center text-[12px] font-medium text-ink-3 py-2">{L.source}</p>
                </div>
            )}
        </Shell>
    );
}

function SeasonRow({ t, today }: { t: PbaTourRow; today: string }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const status = tourStatus(t, today);
    const inner = (
        <>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn("text-[12px] font-bold leading-none", t.league === "LPBA" ? "text-[#8a6a0a]" : t.league === "TEAM" ? "text-ink-2" : "text-brand")}>
                        {leagueLabel(t.league, locale)}
                    </span>
                    {status !== "finished" && <StatusChip status={status} days={daysUntil(today, t.startDate)} L={L} />}
                </div>
                <p className="text-[14px] font-semibold text-ink-1 leading-snug line-clamp-2">{tourTitleOf(t, locale)}</p>
                <p className="text-[12px] font-medium text-ink-3 mt-0.5 truncate tabular-nums">
                    {rangeLabel(t.startDate, t.endDate, locale)}{t.place ? ` · ${t.place}` : ""}
                </p>
                {(t.winnerName || t.totalPrize) && (
                    <p className="text-[12.5px] font-semibold text-ink-2 mt-1 truncate tabular-nums">
                        {t.winnerName ? `🏆 ${t.winnerName}` : ""}{t.winnerName && t.totalPrize ? " · " : ""}{t.totalPrize ? `${L.totalPrize} ${prizeLabel(t.totalPrize, locale)}` : ""}
                    </p>
                )}
            </div>
            {hasTourPage(t) && <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0 mt-1" />}
        </>
    );
    const cls = "flex items-start gap-3 px-4 py-3";
    // 팀리그·코드 없는 예정 대회는 자기 페이지가 없다 — 눌리지 않는 줄
    return hasTourPage(t) ? <Link href={pbaTourPath(t.season, t.tourCode)} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/* ── PBA 대회 ── */

function TourView({ seasonSeg, codeSeg }: { seasonSeg: string; codeSeg: string }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const [, setLocation] = useLocation();
    const code = parseTourCodeSeg(codeSeg);
    const validSeason = !!parseSeasonSeg(seasonSeg);
    useEffect(() => { window.scrollTo(0, 0); }, [code]);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PbaTourPage>({
        queryKey: ["/api/hiq/tournaments/pba/tour", code],
        queryFn: async () => apiRequest(`/api/hiq/tournaments/pba/${seasonSeg}/${code}`),
        enabled: !!code && validSeason,
        staleTime: 10 * 60 * 1000,
        retry: false,
    });
    // 시즌 조각이 틀렸거나 코드에 앞자리 0 이 붙은 주소는 정본으로 — 프리렌더의 301 과 같은 규칙
    useEffect(() => {
        if (data && (String(data.tour.season) !== seasonSeg || String(data.tour.tourCode) !== codeSeg)) {
            setLocation(pbaTourPath(data.tour.season, data.tour.tourCode!), { replace: true });
        }
    }, [data, seasonSeg, codeSeg, setLocation]);
    const seo = useMemo(() => data ? {
        title: tourTitle(data.tour), description: tourDescription(data), path: pbaTourPath(data.tour.season, data.tour.tourCode!), jsonLd: tourJsonLd(data),
    } : null, [data]);
    useSeo(seo);

    const notFound = !code || !validSeason || (isError && !data && is404(error));
    const r = data?.tour;
    const status = r && data ? tourStatus(r, data.today) : "upcoming";
    const w = data?.winner ?? null;

    return (
        <Shell>
            <PageHeader
                title={r ? (locale === "ko" ? tourNameWithSeason(r) : tourTitleOf(r, locale)) : L.notFound}
                sub={r ? `${seasonChip(r.season)} · ${leagueLabel(r.league, locale)}` : undefined}
                onBack={() => setLocation(r ? pbaSeasonPath(r.season) : TOURNAMENTS_PATH)} backLabel={L.back}
                shareUrl={r ? pbaTourPath(r.season, r.tourCode!) : undefined} shareTitle={r ? tourTitle(r) : undefined}
            />
            <LoadState
                isLoading={!notFound && isLoading} notFound={notFound} failed={!notFound && isError && !data}
                onRetry={() => refetch()} retrying={isFetching} L={L} backHref={TOURNAMENTS_PATH} onNavigate={setLocation}
            />
            {data && r && (
                <div className="flex flex-col gap-4 relative z-10">
                    {locale === "ko" && <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{tourDescription(data)}</p>}

                    <div className="rk-card p-5 flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[12px] font-semibold text-white/70">{leagueLabel(r.league, locale)} · {L.season(seasonChip(r.season))}</span>
                                    <span className="text-[12px] font-bold bg-white/15 rounded-full px-2 h-6 inline-flex items-center tabular-nums">
                                        {status === "upcoming" ? `D-${daysUntil(data.today, r.startDate)}` : L.status[status]}
                                    </span>
                                </div>
                                <div className="mt-2 text-[17px] font-bold leading-snug tabular-nums">{rangeLabel(r.startDate, r.endDate, locale)}</div>
                                {r.place && <div className="mt-1 text-[13px] font-medium text-white/80 leading-snug">{r.place}</div>}
                            </div>
                            {/* 상금은 "2억 5,000만원"처럼 길어 타일 3칸에 안 들어간다 — 칩으로 쪼갠다 */}
                            {(r.totalPrize || r.winnerPrize || r.participants) ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {r.totalPrize ? <Chip tone="brand">💰 {L.totalPrize} <span className="tabular-nums">{prizeLabel(r.totalPrize, locale)}</span></Chip> : null}
                                    {r.winnerPrize ? <Chip tone="gold">🥇 {L.winnerPrize} <span className="tabular-nums">{prizeLabel(r.winnerPrize, locale)}</span></Chip> : null}
                                    {r.participants ? <Chip>👥 {L.participants} <span className="tabular-nums">{L.people(r.participants)}</span></Chip> : null}
                                </div>
                            ) : null}
                        </div>

                        <Section emoji="🏆" title={L.winnerH}>
                            {r.winnerName ? (
                                <div className="rounded-2xl bg-surface-3 p-4">
                                    {w ? (
                                        <Link href={`/pba-player/${encodeURIComponent(w.memCode)}`} className="flex items-center gap-3">
                                            <span className="text-[22px] leading-none shrink-0">{flagEmoji(w.nationCode ?? "") || "🏳️"}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[17px] font-bold text-ink-1 truncate">{w.nameKo}</span>
                                                {w.nameEn && <span className="block text-[12px] font-medium text-ink-3 truncate">{w.nameEn}</span>}
                                            </span>
                                            <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                                        </Link>
                                    ) : (
                                        <p className="text-[17px] font-bold text-ink-1">{r.winnerName}</p>
                                    )}
                                    {w && (
                                        <>
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                {w.average != null && <Chip tone="brand">{L.average} <span className="tabular-nums">{w.average}</span></Chip>}
                                                {w.highRun != null && <Chip>{L.highRun} <span className="tabular-nums">{w.highRun}</span></Chip>}
                                                {w.bankShotRate != null && <Chip>{L.bankShot} <span className="tabular-nums">{w.bankShotRate}%</span></Chip>}
                                                {w.win != null && w.lose != null && <Chip>{L.recordLabel} <span className="tabular-nums">{L.record(w.win, w.lose, w.draw ?? 0)}</span></Chip>}
                                                {w.careerPrize != null && <Chip tone="gold">{L.careerPrize} <span className="tabular-nums">{prizeLabel(w.careerPrize, locale)}</span></Chip>}
                                            </div>
                                            <p className="text-[12px] font-medium text-ink-3 mt-2.5">{L.careerNote}</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[13.5px] font-medium text-ink-3">{status === "finished" ? L.noWinner : L.winnerPending}</p>
                            )}
                        </Section>

                        {data.history.length > 0 && (
                            <Section emoji="📜" title={L.history} desc={L.historyDesc}>
                                <List>
                                    {data.history.map((h) => {
                                        const self = h.tourCode === r.tourCode;
                                        const row = (
                                            <>
                                                <span className="w-16 shrink-0 text-[12.5px] font-bold text-ink-3 tabular-nums">{seasonChip(h.season)}</span>
                                                <span className="min-w-0 flex-1">
                                                    <span className={cn("block text-[14px] font-semibold truncate", self ? "text-brand" : "text-ink-1")}>
                                                        {h.winnerName ? `🏆 ${h.winnerName}` : L.status[tourStatus(h, data.today)]}
                                                    </span>
                                                    <span className="block text-[12px] font-medium text-ink-3 truncate">{tourTitleOf(h, locale)}</span>
                                                </span>
                                                {!self && <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0" />}
                                            </>
                                        );
                                        const cls = cn("flex items-center gap-3 px-4 py-3", self && "bg-brand/5");
                                        return self
                                            ? <div key={h.tourCode} className={cls}>{row}</div>
                                            : <Link key={h.tourCode} href={pbaTourPath(h.season, h.tourCode!)} className={cls}>{row}</Link>;
                                    })}
                                </List>
                            </Section>
                        )}
                    </div>

                    {(data.prev || data.next) && (
                        <div className="grid grid-cols-2 gap-2">
                            {[data.prev, data.next].map((n, i) => n ? (
                                <Link key={i} href={pbaTourPath(n.season, n.tourCode!)} className="rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] min-w-0">
                                    <span className="flex items-center gap-1 text-[12px] font-bold text-ink-3">
                                        {i === 0 && <LucideChevronLeft className="w-3.5 h-3.5" />}{i === 0 ? L.prev : L.next}{i === 1 && <LucideChevronRight className="w-3.5 h-3.5" />}
                                    </span>
                                    <span className="block mt-1 text-[13px] font-semibold text-ink-1 leading-snug line-clamp-2">{tourTitleOf(n, locale)}</span>
                                </Link>
                            ) : <div key={i} />)}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <a href={pbaOfficialUrl(r.officialSeq)} target="_blank" rel="noopener noreferrer" className="h-12 px-5 rounded-2xl bg-white text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            {L.officialPage} <LucideExternalLink className="w-4 h-4 text-ink-3" />
                        </a>
                        <Link href={pbaSeasonPath(r.season)} className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between">
                            {L.seasonAll} <LucideChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <p className="text-center text-[12px] font-medium text-ink-3 py-2">{L.source}</p>
                </div>
            )}
        </Shell>
    );
}

/* ── UMB 대회 ── */

const UMB_FOLD = 30; // 월드컵은 150명 가까이 — 먼저 30줄

function UmbView({ slugSeg }: { slugSeg: string }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const [, setLocation] = useLocation();
    const slug = slugSeg.toLowerCase();
    const valid = slug.length <= 80 && UMB_SLUG_RE.test(slug);
    const [cat, setCat] = useState<string | null>(null);
    const [all, setAll] = useState(false);
    useEffect(() => { setCat(null); setAll(false); window.scrollTo(0, 0); }, [slug]);
    // 대문자 주소는 소문자 정본으로 — 프리렌더의 301 과 같은 규칙
    useEffect(() => { if (valid && slugSeg !== slug) setLocation(umbEventPath(slug), { replace: true }); }, [valid, slugSeg, slug, setLocation]);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<UmbEventDetail>({
        queryKey: ["/api/hiq/tournaments/umb", slug],
        queryFn: async () => apiRequest(`/api/hiq/tournaments/umb/${slug}`),
        enabled: valid,
        staleTime: 10 * 60 * 1000,
        retry: false,
    });
    const seo = useMemo(() => data ? {
        title: umbEventTitle(data), description: umbEventDescription(data), path: umbEventPath(data.slug), jsonLd: umbEventJsonLd(data),
    } : null, [data]);
    useSeo(seo);

    const section = data ? (data.sections.find((s) => s.category === cat) ?? primarySection(data)) : undefined;
    const notFound = !valid || (!!data && !section) || (isError && !data && is404(error));
    const primary = data ? primarySection(data) : undefined;
    const kr = (primary?.rows ?? []).filter((x) => x.fed === "KR");
    const rows = section ? (all ? section.rows : section.rows.slice(0, UMB_FOLD)) : [];

    return (
        <Shell>
            <PageHeader
                title={data ? L.umbName(data) : L.notFound}
                sub={data ? (data.org ? `${L.org} ${data.org} · ${L.kind[data.kind]}` : L.kind[data.kind]) : undefined}
                onBack={() => setLocation(TOURNAMENTS_PATH)} backLabel={L.back}
                shareUrl={data ? umbEventPath(data.slug) : undefined} shareTitle={data ? umbEventTitle(data) : undefined}
            />
            <LoadState
                isLoading={!notFound && isLoading} notFound={notFound} failed={!notFound && isError && !data}
                onRetry={() => refetch()} retrying={isFetching} L={L} backHref={TOURNAMENTS_PATH} onNavigate={setLocation}
            />
            {data && section && (
                <div className="flex flex-col gap-4 relative z-10">
                    {locale === "ko" && <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{umbEventDescription(data)}</p>}

                    <div className="rk-card p-5 flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4">
                                <div className="text-[12px] font-semibold text-white/70">{L.dateLabel}</div>
                                <div className="mt-1.5 text-[17px] font-bold leading-snug tabular-nums">{rangeLabel(data.date, data.date, locale)}</div>
                                <div className="mt-1.5 text-[14px] font-semibold text-white/85 flex items-center gap-1.5 min-w-0">
                                    <span className="text-[18px] leading-none shrink-0">{flagEmoji(data.country)}</span>
                                    <span className="truncate">{cityLabel(data.city, locale)}, {countryLabel(data.country, null, locale)}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Tile emoji="📊" value={String(primary?.rows.length ?? 0)} label={L.playersTile} accent />
                                <Tile emoji="🇰🇷" value={String(kr.length)} label={L.krTile} />
                                <Tile emoji="⭐" value={String(primary?.rows[0]?.points ?? 0)} label={L.topTile} />
                            </div>
                        </div>

                        {kr.length > 0 && primary && (
                            <Section emoji="🇰🇷" title={L.krH} meta={L.people(kr.length)}>
                                <List>
                                    {kr.map((x) => <UmbPlayerRow key={x.playerUmbId} x={x} category={primary.category} plain />)}
                                </List>
                            </Section>
                        )}

                        <Section emoji="📊" title={L.pointsH} meta={L.people(section.rows.length)} desc={L.pointsDesc(section.edition)}>
                            {data.sections.length > 1 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {data.sections.map((s) => (
                                        <button
                                            key={s.category}
                                            onClick={() => { setCat(s.category); setAll(false); }}
                                            className={cn(
                                                "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                                section.category === s.category ? "bg-ink-1 text-white" : "bg-surface-3 text-ink-3",
                                            )}
                                        >
                                            {L.cat[s.category] ?? s.category}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <List>
                                {rows.map((x) => <UmbPlayerRow key={x.playerUmbId} x={x} category={section.category} />)}
                            </List>
                            {section.rows.length > UMB_FOLD && !all && (
                                <button
                                    onClick={() => setAll(true)}
                                    className="w-full h-11 mt-2 rounded-2xl bg-surface-3 text-[13.5px] font-semibold text-ink-2 transition-colors"
                                >
                                    {L.showMore(section.rows.length - UMB_FOLD)}
                                </button>
                            )}
                        </Section>

                        {data.others.length > 0 && (
                            <Section emoji="🗓️" title={L.others}>
                                <List>
                                    {data.others.map((o) => (
                                        <Link key={o.slug} href={umbEventPath(o.slug)} className="flex items-center gap-3 px-4 py-3">
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[14px] font-semibold text-ink-1 truncate">{L.umbName(o)}</span>
                                                <span className="block text-[12px] font-medium text-ink-3 truncate tabular-nums">{rangeLabel(o.date, o.date, locale)}</span>
                                            </span>
                                            <span className="text-[12px] font-semibold text-ink-3 tabular-nums shrink-0">{L.playersWithPoints(o.players)}</span>
                                            <LucideChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                                        </Link>
                                    ))}
                                </List>
                            </Section>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <Link href="/world-ranking" className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between">
                            {L.worldRanking} <LucideChevronRight className="w-4 h-4" />
                        </Link>
                        <Link href={TOURNAMENTS_PATH} className="h-12 px-5 rounded-2xl bg-white text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            {L.allTournaments} <LucideChevronRight className="w-4 h-4 text-ink-3" />
                        </Link>
                    </div>
                    <a href={UMB_OFFICIAL} target="_blank" rel="noopener noreferrer" className="text-center text-[12px] font-medium text-ink-3 py-2">
                        {L.umbSite} · umb-carom.org
                    </a>
                </div>
            )}
        </Shell>
    );
}

/** 선수 한 줄 — 한국 선수는 옅은 초록 바탕으로 짚는다. 순번은 달지 않는다(포인트 순일 뿐 대회 순위가 아니다) */
function UmbPlayerRow({ x, category, plain }: { x: UmbEventRow; category: string; plain?: boolean }) {
    const { locale } = useT();
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    // 한국 선수 묶음 안에서는 전부 한국 선수라 짚을 필요가 없다
    const kr = x.fed === "KR" && !plain;
    const name = locale === "ko" ? umbRowNameKo(x) : x.playerName;
    return (
        <Link
            href={`/player/${category}/${encodeURIComponent(x.playerUmbId)}`}
            className={cn("flex items-center gap-3 px-4 py-3", kr && "bg-brand/5")}
        >
            <span className="text-[18px] leading-none shrink-0">{flagEmoji(x.fed) || "🏳️"}</span>
            <span className={cn("min-w-0 flex-1 text-[14px] truncate", kr ? "font-bold text-ink-1" : "font-semibold text-ink-1")}>{name}</span>
            <span className={cn("text-[14px] font-bold tabular-nums shrink-0", kr ? "text-brand" : "text-ink-2")}>{L.pts(x.points)}</span>
        </Link>
    );
}
