import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideChevronRight } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ShareButton } from "@/components/hiq/ShareButton";
import { Section, Tile, Chip, List } from "@/components/hiq/umb/ui";
import { UMB_SOURCE_URL } from "@/components/hiq/umb/types";
import { EXTRA_TEXT, PlayerLinkRow, editionDate } from "@/components/hiq/umb/rankingExtraParts";
import {
    MOVER_RANK_CUTOFF, MOVERS_PATH, MOVERS_TITLE, countryPath, fedNameKo, moversDescription, sectionOf,
    type UmbCat, type UmbMoveRow, type UmbMoversReport,
} from "@shared/umbCountryMeta";

const CAT_KEY: Record<UmbCat, string> = { players: "umb.catPlayers", ladies: "umb.catLadies", juniors: "umb.catJuniors" };
const FOLD = 10; // 긴 목록은 10줄만 먼저 — 한 화면에 절이 여러 개라 전부 펼치면 아래 절이 안 보인다

// 순위 변동(2026-09-24) — /world-ranking/movers. 최신 UMB 회차 vs 직전 회차 한 장(회차별 보관 없음).
// 가장 많이 오른·내린 선수(상위 300위 안), 신규 등재, 랭킹 이탈, 한국 선수 변동. 봇에게는 server/seo/rankingExtra.ts.
export default function HiqWorldRankingMovers() {
    const { t, locale } = useT();
    const L = EXTRA_TEXT[locale] ?? EXTRA_TEXT.en;
    const [, setLocation] = useLocation();
    const [cat, setCat] = useState<UmbCat>("players");
    const [open, setOpen] = useState<Record<string, boolean>>({});

    const { data, isLoading, isError, refetch, isFetching } = useQuery<UmbMoversReport>({
        queryKey: ["/api/hiq/umb/weekly-movers"],
        queryFn: async () => apiRequest("/api/hiq/umb/weekly-movers"),
        staleTime: 10 * 60 * 1000,
    });
    const section = data ? (sectionOf(data.sections, cat) ?? data.sections[0]) : undefined;

    // 제목·설명은 프리렌더와 같은 함수(shared/umbCountryMeta)
    useSeo(data ? { title: MOVERS_TITLE, description: moversDescription(data), path: MOVERS_PATH } : null);

    const block = (key: string, emoji: string, title: string, rows: UmbMoveRow[], meta?: string, withFed = true) => {
        if (!section || !rows.length) return null;
        const all = open[`${section.category}:${key}`];
        const list = all ? rows : rows.slice(0, FOLD);
        return (
            <Section emoji={emoji} title={title} meta={meta}>
                <List>
                    {list.map((r) => (
                        <PlayerLinkRow
                            key={r.playerUmbId} cat={section.category} row={r} hasPrev locale={locale} showPrev
                            sub={withFed ? `${flagEmoji(r.fed)} ${locale === "ko" ? fedNameKo(r.fed) : r.fed}` : undefined}
                        />
                    ))}
                </List>
                {rows.length > FOLD && !all && (
                    <button
                        onClick={() => setOpen((o) => ({ ...o, [`${section.category}:${key}`]: true }))}
                        className="w-full h-11 mt-2 rounded-2xl bg-surface-3 text-[13.5px] font-semibold text-ink-2 hover:bg-black/[0.08] transition-colors"
                    >
                        {L.loadMore(rows.length - FOLD)}
                    </button>
                )}
            </Section>
        );
    };

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
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
                    <h1 className="text-[24px] font-bold tracking-tight text-ink-1 leading-tight truncate">{L.moversTitle}</h1>
                    <p className="text-[13px] font-medium text-ink-3 mt-1 truncate">{L.moversSub}</p>
                </div>
                <ShareButton className="ml-auto shrink-0" url={`https://www.rankue.co.kr${MOVERS_PATH}`} title={MOVERS_TITLE} />
            </div>

            {isLoading && <div className="rk-card p-8 text-center text-[13.5px] font-medium text-ink-3">{t("umb.loading")}</div>}
            {/* 불러오기 실패는 '두 회차가 없다'와 다르다 — 같은 문구로 뭉개면 데이터가 없는 것처럼 읽힌다 */}
            {!isLoading && isError && !data && (
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
            {!isLoading && !isError && !section && <div className="rk-card p-8 text-center text-[14px] font-semibold text-ink-3">{L.noMovers}</div>}

            {data && section && (
                <div className="flex flex-col gap-4 relative z-10">
                    {locale === "ko" && (
                        <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{moversDescription(data)}</p>
                    )}

                    {data.sections.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {data.sections.map((s) => (
                                <button
                                    key={s.category}
                                    onClick={() => setCat(s.category)}
                                    className={cn(
                                        "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                        section.category === s.category ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                                    )}
                                >
                                    {t(CAT_KEY[s.category])}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="rk-card p-5 flex flex-col gap-6">
                        {/* 두 회차 날짜 + 요약 숫자 */}
                        <div className="flex flex-col gap-2">
                            <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4">
                                <div className="text-[12px] font-semibold text-white/70 truncate">
                                    🔁 {section.prevEdition} → {section.edition}
                                </div>
                                <div className="mt-2 flex items-baseline justify-between gap-3">
                                    <span className="text-[17px] font-bold leading-snug tabular-nums">
                                        {editionDate(section.prevDate, locale)} → {editionDate(section.date, locale)}
                                    </span>
                                    <span className="text-right shrink-0">
                                        <span className="block text-[26px] font-bold leading-none tabular-nums">{section.changed.toLocaleString()}</span>
                                        <span className="block text-[12px] font-semibold text-white/70 mt-1.5">{L.changed}</span>
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Tile emoji="📈" value={section.up.toLocaleString()} label={L.up} accent />
                                <Tile emoji="📉" value={section.down.toLocaleString()} label={L.down} />
                                <Tile emoji="✨" value={section.newCount.toLocaleString()} label={L.entries} />
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                <Chip>{L.same} <span className="tabular-nums">{section.same.toLocaleString()}</span></Chip>
                                <Chip>{L.dropouts} <span className="tabular-nums">{section.outCount.toLocaleString()}</span></Chip>
                                <Chip>{L.listed} <span className="tabular-nums">{section.total.toLocaleString()}</span></Chip>
                            </div>
                        </div>

                        {block("up", "🚀", L.risersAll, section.risers, L.cutNow(MOVER_RANK_CUTOFF))}
                        {block("down", "🔻", L.fallersAll, section.fallers, L.cutPrev(MOVER_RANK_CUTOFF))}
                        {/* 신규·이탈은 저장소가 30명까지만 준다 — 잘렸으면 '전체 중 몇 명'을 적는다 */}
                        {block("new", "✨", L.entriesList, section.entries,
                            section.newCount > section.entries.length ? L.shownOf(section.entries.length, section.newCount) : undefined)}
                        {block("out", "🚪", L.dropoutsList, section.dropouts,
                            section.outCount > section.dropouts.length ? L.shownOf(section.dropouts.length, section.outCount) : undefined)}
                        {block("kr", "🇰🇷", L.kr, section.kr.rows, L.krDesc(section.kr.total, MOVER_RANK_CUTOFF), false)}
                        {section.kr.total > 0 && (
                            <div className="flex flex-wrap gap-1.5 -mt-3">
                                <Chip tone="brand">▲ {L.up} <span className="tabular-nums">{section.kr.up}</span></Chip>
                                <Chip>▼ {L.down} <span className="tabular-nums">{section.kr.down}</span></Chip>
                                <Chip>{L.same} <span className="tabular-nums">{section.kr.same}</span></Chip>
                                {section.kr.newCount > 0 && <Chip tone="gold">{L.entries} <span className="tabular-nums">{section.kr.newCount}</span></Chip>}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <Link href={countryPath("KR")} className="h-12 px-5 rounded-2xl bg-ink-1 text-white text-[14px] font-bold flex items-center justify-between active:scale-[0.99] transition-transform">
                            {flagEmoji("KR")} {L.krCountry} <LucideChevronRight className="w-4 h-4" />
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
