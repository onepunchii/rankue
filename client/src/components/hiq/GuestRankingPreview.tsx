/**
 * 비로그인 랭킹 화면의 미리 보기(2026-10-21 디자인 리뷰 — 로그인 카드 밑에 글 링크 세 줄뿐이었다).
 * 로그인 없이 볼 수 있는 것을 그 자리에서: 세계 랭킹(UMB) 상위 셋 · PBA 투어 상금 순위 상위 셋 · 전국 당구장 지도.
 * 둘 다 공개 API(/api/hiq/umb/rankings · /api/hiq/pba/rankings)의 첫 줄들을 그대로 — 받지 못하면 그 카드를 그리지 않는다.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { flagEmoji } from "@/lib/flag";
import { LucideChevronRight } from "@/lib/icons";
import { PlayerPhoto } from "@/components/hiq/PlayerPhoto";
import { StoreTableBanner } from "@/components/hiq/stores/StoreTableMap";

type UmbRow = { rank: number; playerName: string; nativeName: string | null; fed: string; points: number; move?: number | null };
type PbaRow = { memCode: string; prizeRank: number; prize: number; nameKo: string; nameEn: string | null; nationCode: string | null };

const MEDAL = ["#E8B923", "#A7B1BC", "#C47B3E"];

/** 상금 — 한국어는 '1억 1,600만원', 그 밖은 '₩116M' */
function prizeText(won: number, locale: string): string {
    if (locale !== "ko") return `₩${Math.round(won / 1e6).toLocaleString()}M`;
    const eok = Math.floor(won / 1e8), man = Math.round((won % 1e8) / 1e4);
    return `${eok ? `${eok}억 ` : ""}${man ? `${man.toLocaleString()}만` : ""}원`.replace(" 원", "원");
}

function Rank({ n }: { n: number }) {
    return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums"
            style={n <= 3 ? { background: MEDAL[n - 1], color: "#FFFFFF", boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.15)" } : { background: "rgba(0,0,0,0.05)" }}>{n}</span>
    );
}

export function GuestRankingPreview() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const umb = useQuery<{ editionDate?: string | null; rows: UmbRow[] }>({ queryKey: ["/api/hiq/umb/rankings?limit=3"], staleTime: 30 * 60_000 });
    const pba = useQuery<{ season?: number | string; rows: PbaRow[] }>({ queryKey: ["/api/hiq/pba/rankings?league=PBA"], staleTime: 30 * 60_000 });
    const umbRows = Array.isArray(umb.data?.rows) ? umb.data!.rows.slice(0, 3) : [];
    const pbaRows = Array.isArray(pba.data?.rows) ? pba.data!.rows.filter((r) => r.prizeRank > 0).sort((a, b) => a.prizeRank - b.prizeRank).slice(0, 3) : [];
    return (
        <div className="space-y-3" data-testid="guest-ranking-preview">
            {umbRows.length > 0 && (
                <Link href="/world-ranking" className="block rk-card p-4 active:scale-[0.99] transition-transform" data-testid="preview-umb">
                    <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <p className="text-[15px] font-bold text-ink-1">🌍 {t("rankingPreview.umbTitle")}</p>
                        {umb.data?.editionDate && <span className="text-[12px] font-medium text-black/45 tabular-nums">{t("rankingPreview.asOf").replace("{d}", String(umb.data.editionDate).slice(0, 10))}</span>}
                    </div>
                    <ol className="space-y-2">
                        {umbRows.map((r) => (
                            <li key={`${r.rank}-${r.playerName}`} className="flex items-center gap-2.5">
                                <Rank n={r.rank} />
                                <span className="text-[16px] leading-none">{flagEmoji(r.fed)}</span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-1">{locale === "ko" ? (r.nativeName || r.playerName) : r.playerName}</span>
                                <span className="shrink-0 text-[13px] font-bold tabular-nums text-brand">{t("rankingPreview.pts").replace("{n}", r.points.toLocaleString())}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-3 flex items-center justify-end gap-0.5 text-[12.5px] font-semibold text-brand">{t("rankingPreview.all")}<LucideChevronRight className="h-3.5 w-3.5" /></p>
                </Link>
            )}
            {pbaRows.length > 0 && (
                <div className="rk-card p-4" data-testid="preview-pba">
                    <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <p className="text-[15px] font-bold text-ink-1">🏆 {t("rankingPreview.pbaTitle").replace("{s}", String(pba.data?.season ?? ""))}</p>
                    </div>
                    <ol className="space-y-2">
                        {pbaRows.map((r) => {
                            const name = locale === "ko" ? r.nameKo : (r.nameEn || r.nameKo);
                            return (
                                <li key={r.memCode}>
                                    <button type="button" onClick={() => setLocation(`/pba-player/${encodeURIComponent(r.memCode)}`)} className="flex w-full items-center gap-2.5 text-left active:opacity-70">
                                        <Rank n={r.prizeRank} />
                                        <PlayerPhoto memCode={r.memCode} name={name} size={30} className="ring-1 ring-black/5" />
                                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-1">{name} <span className="text-[13px]">{flagEmoji(r.nationCode ?? "")}</span></span>
                                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-brand">{prizeText(r.prize, locale)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    <button type="button" onClick={() => setLocation("/pba")} className="mt-3 flex w-full items-center justify-end gap-0.5 text-[12.5px] font-semibold text-brand">{t("rankingPreview.all")}<LucideChevronRight className="h-3.5 w-3.5" /></button>
                </div>
            )}
            <StoreTableBanner onOpen={() => setLocation("/stores")} copy={{ title: t("storeMap.title"), count: (n) => t("storeMap.count").replace("{n}", n.toLocaleString()), sub: t("storeMap.sub"), cta: t("storeMap.cta") }} />
        </div>
    );
}
