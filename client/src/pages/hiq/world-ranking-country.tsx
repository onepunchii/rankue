import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideChevronRight } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ShareButton } from "@/components/hiq/ShareButton";
import { Section, Tile, Chip, List } from "@/components/hiq/umb/ui";
import { UMB_SOURCE_URL, regionName } from "@/components/hiq/umb/types";
import { EXTRA_TEXT, PlayerLinkRow, editionDate } from "@/components/hiq/umb/rankingExtraParts";
import {
    COUNTRY_INDEX_MIN, MOVER_RANK_CUTOFF, MOVERS_PATH, countryDescription, countryPath, countryTitle, fedNameKo,
    normalizeFed, sectionOf, type UmbCat, type UmbCountryReport,
} from "@shared/umbCountryMeta";

const PAGE = 50;
const CAT_KEY: Record<UmbCat, string> = { players: "umb.catPlayers", ladies: "umb.catLadies", juniors: "umb.catJuniors" };

// 국가별 세계랭킹(2026-09-24) — /world-ranking/country/:fed. 공개 페이지(검색 유입 대상, 봇에게는 server/seo/rankingExtra.ts 가 같은 내용을 준다).
// 그 나라 선수 전원 + 직전 회차 대비 변동, 국가 순위(앱 '국가' 탭과 같은 표), 톱 100·300 인원, 이번 회차 상승·하락.
export default function HiqWorldRankingCountry() {
    const { t, locale } = useT();
    const L = EXTRA_TEXT[locale] ?? EXTRA_TEXT.en;
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/world-ranking/country/:fed");
    const raw = params?.fed ?? "";
    const fed = normalizeFed(raw);

    // 소문자 주소(/country/kr)는 대문자 정본으로 바꿔 둔다 — 프리렌더의 301 과 같은 규칙
    useEffect(() => {
        if (fed && raw !== fed) setLocation(countryPath(fed), { replace: true });
    }, [fed, raw, setLocation]);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<UmbCountryReport>({
        queryKey: ["/api/hiq/umb/country", fed],
        queryFn: async () => apiRequest(`/api/hiq/umb/country/${fed}`),
        enabled: !!fed,
        staleTime: 10 * 60 * 1000,
        retry: false, // 없는 나라는 404 — 다시 물어도 같다
    });

    const [cat, setCat] = useState<UmbCat>("players");
    const [shown, setShown] = useState(PAGE);
    useEffect(() => { setCat("players"); setShown(PAGE); }, [fed]);
    const section = data ? (sectionOf(data.sections, cat) ?? data.sections[0]) : undefined;

    // 제목·설명은 프리렌더와 같은 함수(shared/umbCountryMeta) — 화면 언어와 상관없이 한국어 정본 주소의 메타
    // jsonLd 는 useSeo 의 effect 의존값이라 매 렌더 새 객체면 '더 보기'를 누를 때마다 <head> 스크립트를 지웠다 다시 단다 — 묶어 둔다
    const seo = useMemo(() => data ? {
        title: countryTitle(data.fed),
        description: countryDescription(data),
        path: countryPath(data.fed),
        jsonLd: {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "당구 세계랭킹", item: "https://www.rankue.co.kr/world-ranking" },
                { "@type": "ListItem", position: 2, name: `${fedNameKo(data.fed)} 선수`, item: `https://www.rankue.co.kr${countryPath(data.fed)}` },
            ],
        },
    } : null, [data]);
    useSeo(seo);

    const nameOf = (code: string) => (locale === "ko" ? fedNameKo(code) : regionName(code, locale));
    const title = fed ? nameOf(fed) : "";
    const hasPrev = !!section?.prevEdition;
    const best = section?.rows[0];
    const others = (data?.nations ?? []).filter((n) => n.fed !== data?.fed && n.players >= COUNTRY_INDEX_MIN);
    // 404(없는 나라)만 '찾을 수 없음' — 네트워크·서버 오류까지 그렇게 적으면 있는 나라가 없는 것처럼 읽힌다
    const notFound = !fed || (isError && !data && error instanceof ApiError && error.status === 404);
    const failed = !!fed && isError && !data && !notFound;

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/world-ranking")}
                    className="w-11 h-11 shrink-0 rounded-full bg-white flex items-center justify-center transition-transform text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t("umb.back")}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold tracking-tight text-ink-1 leading-tight flex items-center gap-2 min-w-0">
                        {fed && <span className="text-[24px] leading-none shrink-0">{flagEmoji(fed)}</span>}
                        <span className="truncate">{title || L.notFound}</span>
                    </h1>
                    <p className="text-[13px] font-medium text-ink-3 mt-1 truncate">
                        {L.countrySub}{section ? ` · ${L.asOf(section.edition, editionDate(section.date, locale))}` : ""}
                    </p>
                </div>
                {data && <ShareButton className="ml-auto shrink-0" url={`https://www.rankue.co.kr${countryPath(data.fed)}`} title={countryTitle(data.fed)} />}
            </div>

            {notFound && (
                <div className="rk-card p-8 text-center">
                    <p className="text-[15px] font-bold text-ink-1">{L.notFound}</p>
                    <p className="text-[13px] font-medium text-ink-3 mt-1.5">{L.notFoundDesc}</p>
                    <Link href="/world-ranking" className="inline-flex mt-5 h-11 px-5 items-center rounded-full bg-brand text-brand-fg text-[14px] font-bold">
                        {L.allRanking}
                    </Link>
                </div>
            )}

            {failed && (
                <div className="rk-card p-8 text-center">
                    <p className="text-[14px] font-semibold text-ink-2">{L.loadError}</p>
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="inline-flex mt-4 h-11 px-5 items-center rounded-full bg-surface-3 text-[13.5px] font-semibold text-ink-1 disabled:opacity-50"
                    >
                        {L.retry}
                    </button>
                </div>
            )}

            {!notFound && isLoading && (
                <div className="rk-card p-8 text-center text-[13.5px] font-medium text-ink-3">{t("umb.loading")}</div>
            )}

            {data && section && (
                <div className="flex flex-col gap-4 relative z-10">
                    {/* 요약 문장 — 한국어는 검색 설명과 같은 문장(프리렌더 본문 첫 문단) */}
                    {locale === "ko" && (
                        <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{countryDescription(data)}</p>
                    )}

                    {/* 부문 탭 — 이 나라 선수가 있는 부문만 */}
                    {data.sections.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {data.sections.map((s) => (
                                <button
                                    key={s.category}
                                    onClick={() => { setCat(s.category); setShown(PAGE); }}
                                    className={cn(
                                        "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                        section.category === s.category ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                                    )}
                                >
                                    {t(CAT_KEY[s.category])} <span className="tabular-nums opacity-70">{s.total}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="rk-card p-5 flex flex-col gap-6">
                        {/* 핵심 숫자: 초록 히어로(국가 순위) + 타일 3칸 */}
                        <div className="flex flex-col gap-2">
                            <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4 flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[12px] font-semibold text-white/70 truncate">🌍 {L.nationRank} · {t(CAT_KEY[section.category])}</div>
                                    <div className="flex items-baseline gap-1.5 mt-2">
                                        <span className="text-[38px] font-bold leading-none tabular-nums">{section.nationRank ?? "–"}</span>
                                        <span className="text-[14px] font-semibold text-white/75 tabular-nums">{L.ofNations(section.nationCount)}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[26px] font-bold leading-none tabular-nums">{(section.top5Points ?? 0).toLocaleString()}</div>
                                    <div className="text-[12px] font-semibold text-white/70 mt-1.5">{L.top5}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Tile emoji={flagEmoji(data.fed) || "🏳️"} value={L.people(section.total)} label={L.listed} />
                                <Tile emoji="💯" value={L.people(section.top100)} label={L.top100} />
                                <Tile emoji="🎯" value={L.people(section.top300)} label={L.top300} />
                            </div>
                            <p className="text-[12px] font-medium text-ink-3 px-1 mt-1">
                                {hasPrev ? L.vsPrev(section.prevEdition!, editionDate(section.prevDate, locale)) : L.asOf(section.edition, editionDate(section.date, locale))}
                            </p>
                        </div>

                        {best && (
                            <Section emoji="🥇" title={L.best}>
                                <List>
                                    <PlayerLinkRow cat={section.category} row={best} hasPrev={hasPrev} locale={locale} />
                                </List>
                            </Section>
                        )}

                        {section.risers.length > 0 && (
                            <Section emoji="📈" title={L.risers} meta={L.cutNow(MOVER_RANK_CUTOFF)}>
                                <List>
                                    {section.risers.map((r) => (
                                        <PlayerLinkRow key={r.playerUmbId} cat={section.category} row={r} hasPrev={hasPrev} locale={locale} showPrev />
                                    ))}
                                </List>
                            </Section>
                        )}

                        {section.fallers.length > 0 && (
                            <Section emoji="📉" title={L.fallers} meta={L.cutPrev(MOVER_RANK_CUTOFF)}>
                                <List>
                                    {section.fallers.map((r) => (
                                        <PlayerLinkRow key={r.playerUmbId} cat={section.category} row={r} hasPrev={hasPrev} locale={locale} showPrev />
                                    ))}
                                </List>
                            </Section>
                        )}

                        <Section emoji="🏅" title={L.all} meta={<span className="tabular-nums">{L.people(section.total)}</span>}>
                            <List>
                                {section.rows.slice(0, shown).map((r) => (
                                    <PlayerLinkRow key={r.playerUmbId} cat={section.category} row={r} hasPrev={hasPrev} locale={locale} />
                                ))}
                            </List>
                            {section.rows.length > shown && (
                                <button
                                    onClick={() => setShown((n) => n + PAGE)}
                                    className="w-full h-11 mt-2 rounded-2xl bg-surface-3 text-[13.5px] font-semibold text-ink-2 hover:bg-black/[0.08] transition-colors"
                                >
                                    {L.loadMore(Math.min(PAGE, section.rows.length - shown))}
                                </button>
                            )}
                        </Section>
                    </div>

                    {/* 다른 나라 — 색인 대상(남자 10명 이상)만, 국가표 순서 그대로 */}
                    {others.length > 0 && (
                        <div className="rk-card p-5">
                            <Section emoji="🌐" title={L.others}>
                                <div className="flex flex-wrap gap-1.5">
                                    {others.map((n) => (
                                        <Link key={n.fed} href={countryPath(n.fed)}>
                                            <Chip className="cursor-pointer hover:bg-black/[0.08]">
                                                <span className="text-[14px] leading-none">{flagEmoji(n.fed)}</span>
                                                {nameOf(n.fed)}
                                                <span className="tabular-nums text-ink-3">{L.rank(n.pos)}</span>
                                            </Chip>
                                        </Link>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Link href={MOVERS_PATH} className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between active:scale-[0.99] transition-transform">
                            {L.moversLink} <LucideChevronRight className="w-4 h-4" />
                        </Link>
                        <Link href="/world-ranking" className="h-12 px-5 rounded-2xl bg-white text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            {L.allRanking} <LucideChevronRight className="w-4 h-4 text-ink-3" />
                        </Link>
                    </div>

                    <a href={UMB_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-center text-[12px] font-medium text-ink-3 py-2">
                        {t("umb.source")}
                    </a>
                </div>
            )}

            <HiqNavigation />
        </div>
    );
}
