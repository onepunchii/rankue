import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideGlobe, LucideChevronRight } from "@/lib/icons";
import { UmbPlayerSheet } from "./UmbPlayerSheet";
import { UMB_CATEGORIES, UMB_SOURCE_URL, displayName, regionName, resolveHomeFed, type UmbCategory, type UmbRankingsResponse, type UmbSummary } from "./types";

// 순위 변동 뱃지 — ▲상승(브랜드) ▼하락(레드) NEW(노랑) –유지
export const MoveBadge = ({ move }: { move: number | null }) => {
    const { t } = useT();
    if (move === null) return <span className="text-[10px] font-bold text-[#8a6a0a] bg-[#F5B721]/20 px-1.5 py-0.5 rounded-full leading-none">{t("umb.new")}</span>;
    if (move > 0) return <span className="text-[11px] font-bold text-brand tabular-nums leading-none">▲{move}</span>;
    if (move < 0) return <span className="text-[11px] font-bold text-red-500 tabular-nums leading-none">▼{-move}</span>;
    return <span className="text-[11px] font-medium text-black/25 leading-none">–</span>;
};

// 홈 세계 랭킹 카드 — UMB 공식 랭킹 톱10 + 요약 한 줄. 선수 탭 → 상세 시트.
export const WorldRankingCard = () => {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const [category, setCategory] = useState<UmbCategory>("players");
    const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);

    // 뷰어의 "우리나라" — 프로필 국가 우선, 없으면 언어로 추정 (홈은 로그인 상태라 /me 캐시 재사용)
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"], retry: false });
    const homeFed = resolveHomeFed(me?.countryCode, locale);

    const { data, isLoading } = useQuery<UmbRankingsResponse>({
        queryKey: ["/api/hiq/umb/rankings", category, "top10"],
        queryFn: async () => apiRequest(`/api/hiq/umb/rankings?category=${category}&limit=10`),
        staleTime: 10 * 60 * 1000,
    });
    const { data: summary } = useQuery<UmbSummary>({
        queryKey: ["/api/hiq/umb/summary", category, homeFed],
        queryFn: async () => apiRequest(`/api/hiq/umb/summary?category=${category}&fed=${homeFed}`),
        staleTime: 10 * 60 * 1000,
    });

    const rows = data?.rows || [];

    return (
        <div className="space-y-3">
            {/* 부문 칩 + 회차 */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                    {UMB_CATEGORIES.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setCategory(c.id)}
                            className={cn(
                                "h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors",
                                category === c.id ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            )}
                        >
                            {t(c.labelKey)}
                        </button>
                    ))}
                </div>
                {data?.editionDate && (
                    <span className="text-[11px] font-medium text-black/40 tabular-nums">
                        {new Date(data.editionDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} {t("umb.updated")}
                    </span>
                )}
            </div>

            {/* 요약 한 줄 — 뷰어 국가의 선수 규모·최고 순위 (프로필/언어 기반) */}
            {summary && summary.fedTop && (
                <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-brand/[0.07] text-[12.5px] font-semibold text-brand">
                    <span>{flagEmoji(summary.fed)}</span>
                    <span className="truncate">
                        {t("umb.summaryLine")
                            .replace("{country}", regionName(summary.fed, locale))
                            .replace("{count}", String(summary.fedCount))
                            .replace("{name}", displayName(summary.fedTop as any, locale))
                            .replace("{rank}", String(summary.fedTop.rank))}
                    </span>
                </div>
            )}

            {/* 톱10 */}
            <div className="flex flex-col gap-2">
                {isLoading && (
                    <div className="py-10 text-center text-black/40 text-[13.5px] font-medium">{t("umb.loading")}</div>
                )}
                {!isLoading && rows.length === 0 && (
                    <div className="py-10 text-center text-black/40 text-[13.5px] font-medium">{t("umb.empty")}</div>
                )}
                {rows.map((r) => {
                    const isKr = r.fed === homeFed;
                    return (
                        <button
                            key={r.playerUmbId}
                            onClick={() => setOpenPlayerId(r.playerUmbId)}
                            className={cn(
                                "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors",
                                isKr ? "bg-brand/[0.10]" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-black/[0.015]"
                            )}
                        >
                            <div className="w-8 flex justify-center shrink-0">
                                {r.rank === 1 ? (
                                    <div className="w-8 h-8 rounded-full bg-[#cba258] flex items-center justify-center font-bold text-[15px] tabular-nums text-white shadow-[0_1px_3px_rgba(203,162,88,0.4)]">1</div>
                                ) : (
                                    <span className={cn("font-bold text-[16px] tabular-nums", isKr ? "text-brand" : "text-black/45")}>{r.rank}</span>
                                )}
                            </div>
                            <span className="text-[18px] leading-none shrink-0">{flagEmoji(r.fed)}</span>
                            <div className="flex-1 min-w-0">
                                <span className={cn("block font-semibold text-[14.5px] truncate", isKr ? "text-brand" : "text-ink-1")}>{displayName(r, locale)}</span>
                            </div>
                            <MoveBadge move={r.move} />
                            <div className="flex items-baseline gap-1 shrink-0 w-14 justify-end">
                                <span className="font-bold text-[16px] tabular-nums tracking-tight text-ink-1">{r.points}</span>
                                <span className="text-[11px] font-semibold text-black/35">{t("umb.pointsUnit")}</span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* 전체 보기 + 출처 */}
            {rows.length > 0 && (
                <div className="flex items-center justify-between pt-1">
                    <a href={UMB_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-black/35 hover:text-black/55 transition-colors">
                        {t("umb.source")}
                    </a>
                    <button
                        onClick={() => setLocation("/world-ranking")}
                        className="flex items-center gap-0.5 text-[13px] font-semibold text-brand active:opacity-70"
                    >
                        <LucideGlobe className="w-3.5 h-3.5" />
                        {t("umb.viewAll")}
                        <LucideChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <UmbPlayerSheet category={category} playerUmbId={openPlayerId} onClose={() => setOpenPlayerId(null)} onNavigate={setOpenPlayerId} />
        </div>
    );
};
