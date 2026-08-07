import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { LucideTrophy, LucideChevronRight } from "@/lib/icons";
import { seasonLabel, formatPrize } from "@shared/pbaMeta";

// 홈 PBA 카드 — 현재 시즌 상금랭킹 톱10. 행 탭 → 선수 상세 페이지.
// WorldRankingCard 와 같은 레이아웃 문법 (칩 + 요약 한 줄 + 톱10 + 전체 보기).

interface PbaCardRow {
    memCode: string;
    prizeRank: number | null;
    prize: number;
    rankingPoint: number;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
}

export const PBA_CARD_L: Record<Locale, { title: string; subtitle: string; season: string; prizeNo1: string; loading: string; empty: string; viewAll: string; source: string; prizeUnit: string }> = {
    ko: { title: "PBA 투어 랭킹", subtitle: "프로당구 PBA·LPBA 시즌 상금랭킹", season: "시즌", prizeNo1: "상금 1위", loading: "불러오는 중...", empty: "데이터가 없습니다", viewAll: "전체 보기", source: "출처: PBA 투어 공식 기록", prizeUnit: "원" },
    en: { title: "PBA Tour Rankings", subtitle: "Korean pro billiards season prize rankings", season: "season", prizeNo1: "Prize leader", loading: "Loading...", empty: "No data", viewAll: "View all", source: "Source: PBA Tour", prizeUnit: "" },
    vi: { title: "BXH PBA Tour", subtitle: "BXH tiền thưởng bi-a chuyên nghiệp Hàn Quốc", season: "mùa", prizeNo1: "Dẫn đầu tiền thưởng", loading: "Đang tải...", empty: "Chưa có dữ liệu", viewAll: "Xem tất cả", source: "Nguồn: PBA Tour", prizeUnit: "" },
    tr: { title: "PBA Tur Sıralaması", subtitle: "Kore profesyonel bilardo sezon ödül sıralaması", season: "sezon", prizeNo1: "Ödül lideri", loading: "Yükleniyor...", empty: "Veri yok", viewAll: "Tümünü gör", source: "Kaynak: PBA Tour", prizeUnit: "" },
    es: { title: "Ranking PBA Tour", subtitle: "Ranking de premios del billar profesional coreano", season: "temporada", prizeNo1: "Líder en premios", loading: "Cargando...", empty: "Sin datos", viewAll: "Ver todo", source: "Fuente: PBA Tour", prizeUnit: "" },
};

export const PbaRankingCard = () => {
    const { locale } = useT();
    const t = PBA_CARD_L[locale] ?? PBA_CARD_L.ko;
    const [, setLocation] = useLocation();
    const [league, setLeague] = useState<"PBA" | "LPBA">("PBA");

    const { data, isLoading } = useQuery<{ season: number; rows: PbaCardRow[] }>({
        queryKey: ["/api/hiq/pba/rankings", league, "top10"],
        queryFn: async () => apiRequest(`/api/hiq/pba/rankings?league=${league}&by=prize&limit=10`),
        staleTime: 10 * 60 * 1000,
    });
    const rows = data?.rows || [];
    const top = rows[0];

    return (
        <div className="space-y-3">
            {/* 리그 칩 + 시즌 */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                    {(["PBA", "LPBA"] as const).map(lg => (
                        <button
                            key={lg}
                            onClick={() => setLeague(lg)}
                            className={cn(
                                "h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors",
                                league === lg ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            )}
                        >
                            {lg}
                        </button>
                    ))}
                </div>
                {data?.season && (
                    <span className="text-[11px] font-medium text-black/40 tabular-nums">
                        {seasonLabel(data.season)} {t.season}
                    </span>
                )}
            </div>

            {/* 요약 한 줄 — 시즌 상금 1위 */}
            {top && (
                <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-brand/[0.07] text-[12.5px] font-semibold text-brand">
                    <LucideTrophy className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                        {t.prizeNo1} {top.nameKo} · {formatPrize(top.prize, locale)}{locale === "ko" ? t.prizeUnit : ""}
                    </span>
                </div>
            )}

            {/* 톱10 */}
            <div className="flex flex-col gap-2">
                {isLoading && (
                    <div className="py-10 text-center text-black/40 text-[13.5px] font-medium">{t.loading}</div>
                )}
                {!isLoading && rows.length === 0 && (
                    <div className="py-10 text-center text-black/40 text-[13.5px] font-medium">{t.empty}</div>
                )}
                {rows.map((r) => (
                    <button
                        key={r.memCode}
                        onClick={() => setLocation(`/pba-player/${r.memCode}`)}
                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-black/[0.015]"
                    >
                        <div className="w-8 flex justify-center shrink-0">
                            {r.prizeRank === 1 ? (
                                <div className="w-8 h-8 rounded-full bg-[#cba258] flex items-center justify-center font-bold text-[15px] tabular-nums text-white shadow-[0_1px_3px_rgba(203,162,88,0.4)]">1</div>
                            ) : (
                                <span className="font-bold text-[16px] tabular-nums text-black/45">{r.prizeRank}</span>
                            )}
                        </div>
                        <span className="text-[18px] leading-none shrink-0">{flagEmoji(r.nationCode ?? "") || "🏳️"}</span>
                        <div className="flex-1 min-w-0">
                            <span className="block font-semibold text-[14.5px] truncate text-ink-1">{r.nameKo}</span>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 justify-end">
                            <span className="font-bold text-[15px] tabular-nums tracking-tight text-ink-1">{formatPrize(r.prize, locale)}</span>
                            {locale === "ko" && <span className="text-[11px] font-semibold text-black/35">원</span>}
                        </div>
                    </button>
                ))}
            </div>

            {/* 전체 보기 + 출처 */}
            {rows.length > 0 && (
                <div className="flex items-center justify-between pt-1">
                    <a href="https://www.pbatour.org" target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-black/35 hover:text-black/55 transition-colors">
                        {t.source}
                    </a>
                    <button
                        onClick={() => setLocation("/pba")}
                        className="flex items-center gap-0.5 text-[13px] font-semibold text-brand active:opacity-70"
                    >
                        <LucideTrophy className="w-3.5 h-3.5" />
                        {t.viewAll}
                        <LucideChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
};
