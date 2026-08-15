import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip } from "recharts";
import { LucideChevronLeft, LucideGlobe, LucideTrophy } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { PBA_PLAYER_ANCHORS_KO, pbaRelated } from "@shared/pbaMeta";
import { seasonLabel, formatPrize } from "./pba";

// PBA 선수 상세 — 통산 스탯 + 시즌별 궤적. 사진 없이 국기·이름·숫자만(초상권).

interface PbaPlayerData {
    memCode: string;
    league: "PBA" | "LPBA";
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    birthday: string | null;
    average: number | null;
    bankShotRate: number | null;
    highRun: number | null;
    win: number | null;
    lose: number | null;
    draw: number | null;
    careerPrize: number | null;
    umbPlayerId: string | null;
    umbCategory: string | null;
    seasons: { season: number; prizeRank: number | null; pointRank: number | null; prize: number; rankingPoint: number }[];
}

const L: Record<Locale, Record<string, string>> = {
    ko: {
        // 앵커 목차 칩에 쓰이는 4개 라벨(back·career·seasons·umbCard)은 프리렌더 봇 문서와
        // 문자 단위 일치가 필요해 shared/pbaMeta.ts 의 정본을 쓴다.
        back: PBA_PLAYER_ANCHORS_KO.related, career: PBA_PLAYER_ANCHORS_KO.career,
        prize: "통산 상금", record: "승-패", winRate: "승률",
        average: "에버리지", bank: "뱅크샷", hr: "하이런", seasons: PBA_PLAYER_ANCHORS_KO.seasons,
        rank: "순위", point: "포인트", seasonPrize: "시즌 상금",
        umbCard: PBA_PLAYER_ANCHORS_KO.umb, umbCta: "세계랭킹 히스토리 보기",
        notFound: "선수를 찾을 수 없습니다", source: "출처: PBA 투어 공식 기록",
    },
    en: {
        back: "PBA Rankings", career: "Career", prize: "Career prize", record: "W-L", winRate: "Win rate",
        average: "Average", bank: "Bank shot", hr: "High run", seasons: "Season by season",
        rank: "Rank", point: "Points", seasonPrize: "Season prize",
        umbCard: "UMB World Ranking history", umbCta: "View world ranking history",
        notFound: "Player not found", source: "Source: PBA Tour official records",
    },
    vi: {
        back: "BXH PBA", career: "Sự nghiệp", prize: "Tổng tiền thưởng", record: "Thắng-Thua", winRate: "Tỷ lệ thắng",
        average: "Average", bank: "Bank shot", hr: "High run", seasons: "Theo mùa giải",
        rank: "Hạng", point: "Điểm", seasonPrize: "Tiền thưởng mùa",
        umbCard: "Lịch sử BXH thế giới UMB", umbCta: "Xem lịch sử BXH thế giới",
        notFound: "Không tìm thấy cơ thủ", source: "Nguồn: PBA Tour",
    },
    tr: {
        back: "PBA Sıralaması", career: "Kariyer", prize: "Toplam ödül", record: "G-M", winRate: "Kazanma",
        average: "Ortalama", bank: "Bank atışı", hr: "En yüksek seri", seasons: "Sezonlara göre",
        rank: "Sıra", point: "Puan", seasonPrize: "Sezon ödülü",
        umbCard: "UMB Dünya Sıralaması geçmişi", umbCta: "Dünya sıralaması geçmişi",
        notFound: "Oyuncu bulunamadı", source: "Kaynak: PBA Tour",
    },
    es: {
        back: "Ranking PBA", career: "Carrera", prize: "Premios totales", record: "V-D", winRate: "Victorias",
        average: "Promedio", bank: "Bank shot", hr: "Serie máxima", seasons: "Por temporada",
        rank: "Puesto", point: "Puntos", seasonPrize: "Premio de temporada",
        umbCard: "Historial ranking mundial UMB", umbCta: "Ver historial mundial",
        notFound: "Jugador no encontrado", source: "Fuente: PBA Tour",
    },
};

export default function HiqPbaPlayer() {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/pba-player/:memCode");
    const memCode = params?.memCode || "";

    const { data: p, isLoading } = useQuery<PbaPlayerData>({
        queryKey: [`/api/hiq/pba/player/${memCode}`],
        queryFn: async () => apiRequest(`/api/hiq/pba/player/${memCode}`),
        enabled: !!memCode,
        staleTime: 10 * 60 * 1000,
        retry: false,
    });

    // 관련 선수(같은 리그 상금랭킹 인접 5명) — 내부링크 클러스터. 프리렌더와 같은 로직(pbaRelated).
    const { data: rankData } = useQuery<{ rows: { memCode: string; prizeRank: number | null; prize: number; nameKo: string; nameEn: string | null; nationCode: string | null }[] }>({
        queryKey: ["/api/hiq/pba/rankings/related", p?.league],
        queryFn: async () => apiRequest(`/api/hiq/pba/rankings?league=${p!.league}&by=prize&limit=50`),
        enabled: !!p,
        staleTime: 5 * 60 * 1000,
    });
    const related = pbaRelated(rankData?.rows ?? [], memCode, 5);

    // 네이버 "본문 바로가기" 칩으로 유입되면 URL 에 #career 류 해시가 붙는다.
    // SPA 는 데이터 로드 후에야 섹션이 생기므로 브라우저 기본 앵커 점프가 안 먹는다 — 직접 스크롤.
    useEffect(() => {
        if (!p) return;
        const hash = window.location.hash.slice(1);
        if (hash) document.getElementById(hash)?.scrollIntoView();
    }, [p]);

    const games = (p?.win ?? 0) + (p?.lose ?? 0) + (p?.draw ?? 0);
    const winRate = games > 0 ? Math.round(((p?.win ?? 0) / games) * 100) : null;
    const age = p?.birthday ? Math.floor((Date.now() - new Date(p.birthday).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

    const chartData = (p?.seasons ?? []).map((s) => ({
        name: seasonLabel(s.season),
        prize: Math.round(s.prize / 1e6) / 100, // 억 단위
        rank: s.prizeRank,
    }));

    useSeo({
        title: p ? `${p.nameKo} — ${p.league} ${locale === "ko" ? "프로당구 선수" : "pro billiards player"} | 랭큐` : "PBA | 랭큐",
        description: p
            ? `${p.nameKo}${p.nameEn ? ` (${p.nameEn})` : ""} — ${p.league} ${t.prize} ${p.careerPrize != null ? formatPrize(p.careerPrize, locale) : "-"}, ${t.average} ${p.average ?? "-"}, ${t.hr} ${p.highRun ?? "-"}.`
            : "PBA 선수 프로필",
        path: `/pba-player/${memCode}`,
        locale,
        // 선수 상세 패밀리 기본 og:image — server/prerender.ts 의 /pba-player 와 같은 값.
        // 사이트 기본값 og.png 는 "당구 점수판 앱" 홍보컷이라 선수 프로필 공유컷으로 엉뚱했다.
        image: "https://www.rankue.co.kr/og-pba.png",
        jsonLd: p ? {
            "@context": "https://schema.org",
            "@type": "Person",
            name: p.nameKo,
            alternateName: p.nameEn ?? undefined,
            nationality: p.nationCode ?? undefined,
            jobTitle: "Professional billiards player",
            memberOf: { "@type": "SportsOrganization", name: `${p.league} Tour` },
            url: `https://www.rankue.co.kr/pba-player/${p.memCode}`,
        } : null,
    });

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-6">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/pba")}
                    className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={t.back}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <span className="text-[13.5px] font-semibold text-black/50">{t.back}</span>
            </div>

            {isLoading && <div className="h-48 bg-black/[0.04] rounded-3xl animate-pulse" />}
            {!isLoading && !p && <p className="text-center text-black/45 py-16 text-[14px]">{t.notFound}</p>}

            {p && (
                <>
                    <header className="mb-5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-[26px] leading-none">{flagEmoji(p.nationCode ?? "") || "🏳️"}</span>
                            <h1 className="text-[27px] font-bold tracking-tight leading-none">{p.nameKo}</h1>
                            <span className="px-2 py-1 rounded-full bg-ink-1 text-white text-[11px] font-bold leading-none">{p.league}</span>
                        </div>
                        <p className="text-[13px] font-medium text-black/50 mt-1.5">
                            {p.nameEn}{age != null ? ` · ${age}` : ""}
                        </p>
                    </header>

                    {/* 앵커 목차 — 네이버가 이 <nav> 의 앵커 텍스트로 "본문 바로가기" 칩을 만든다.
                        첫 칩에 선수명(핵심 키워드)을 포함시켜 "{선수명} 통산 기록"이 검색결과에 노출되게 한다.
                        칩 스타일은 pba.tsx 시즌 칩과 동일한 디자인 시스템. */}
                    <nav aria-label="목차" className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-5 px-5 scrollbar-hide">
                        {([
                            ["career", `${p.nameKo} ${t.career}`, true],
                            ["seasons", t.seasons, chartData.length > 1],
                            ["umb", t.umbCard, !!(p.umbPlayerId && p.umbCategory)],
                            ["related", t.back, related.length > 0],
                        ] as const).filter(([, , show]) => show).map(([id, label]) => (
                            <a
                                key={id}
                                href={`#${id}`}
                                className="shrink-0 h-8 px-3.5 rounded-full text-[12.5px] font-semibold bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center"
                            >
                                {label}
                            </a>
                        ))}
                    </nav>

                    {/* 통산 스탯 */}
                    <section id="career" className="mb-5 scroll-mt-6">
                        <h2 className="text-[15px] font-bold mb-3">{t.career}</h2>
                        <div className="rounded-3xl bg-brand p-5 text-white mb-2.5 shadow-[0_8px_24px_rgba(0,98,65,0.20)]">
                            <div className="flex items-center gap-2 text-white/75 text-[12px] font-bold">
                                <LucideTrophy className="w-4 h-4" />{t.prize}
                            </div>
                            <div className="mt-1.5 text-[30px] font-bold tabular-nums leading-none">
                                {p.careerPrize != null ? formatPrize(p.careerPrize, locale) : "-"}
                                {locale === "ko" && p.careerPrize != null && <span className="text-[15px] font-semibold text-white/70 ml-1">원</span>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {[
                                [t.record, p.win != null ? `${p.win}-${p.lose ?? 0}${winRate != null ? ` (${winRate}%)` : ""}` : "-"],
                                [t.average, p.average != null ? p.average.toFixed(3) : "-"],
                                [t.bank, p.bankShotRate != null ? `${p.bankShotRate.toFixed(1)}%` : "-"],
                                [t.hr, p.highRun != null ? String(p.highRun) : "-"],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                    <p className="text-[11.5px] font-bold text-black/40">{label}</p>
                                    <p className="text-[19px] font-bold tabular-nums mt-1">{value}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 시즌별 궤적 */}
                    {chartData.length > 1 && (
                        <section id="seasons" className="rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-5 min-w-0 max-w-full overflow-hidden scroll-mt-6">
                            <h2 className="text-[15px] font-bold mb-3">{t.seasons}</h2>
                            <div className="h-[180px] min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                                        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: "rgba(0,0,0,0.4)" }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="prize" tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="rank" orientation="right" reversed domain={[1, "dataMax"]} hide />
                                        <Tooltip
                                            formatter={(v: any, name: any) =>
                                                name === "prize" ? [`${v}억`, t.seasonPrize] : [`${v}${locale === "ko" ? "위" : ""}`, t.rank]}
                                            contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", fontSize: 12 }}
                                        />
                                        <Bar yAxisId="prize" dataKey="prize" fill="#006241" opacity={0.18} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                        <Line yAxisId="rank" dataKey="rank" stroke="#006241" strokeWidth={2.5} dot={{ r: 3, fill: "#006241" }} connectNulls isAnimationActive={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            {/* 시즌 표 */}
                            <div className="mt-3 space-y-1">
                                {[...p.seasons].reverse().map((s) => (
                                    <div key={s.season} className="flex items-center justify-between py-2 border-t border-black/[0.05] text-[13px]">
                                        <span className="font-semibold tabular-nums w-14">{seasonLabel(s.season)}</span>
                                        <span className="text-black/55 tabular-nums">{s.prizeRank != null ? `${s.prizeRank}${locale === "ko" ? "위" : ""}` : "-"}</span>
                                        <span className="text-black/55 tabular-nums">{s.rankingPoint.toLocaleString()}p</span>
                                        <span className="font-semibold tabular-nums">{formatPrize(s.prize, locale)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* UMB 교차 링크 — 세계랭킹 기록이 있는 선수만 */}
                    {p.umbPlayerId && p.umbCategory && (
                        <button
                            id="umb"
                            onClick={() => setLocation(`/player/${p.umbCategory}/${p.umbPlayerId}`)}
                            className="w-full rounded-3xl bg-ink-1 p-5 text-left text-white active:scale-[0.99] transition-transform mb-5 scroll-mt-6"
                        >
                            <div className="flex items-center gap-2 text-white/60 text-[12px] font-bold">
                                <LucideGlobe className="w-4 h-4" />{t.umbCard}
                            </div>
                            <p className="mt-1.5 text-[16px] font-bold">{t.umbCta} →</p>
                        </button>
                    )}

                    {/* 관련 선수 — 같은 리그 상금랭킹 인접 5명 + 랭킹 허브. 도메인 내 클러스터(내부링크)이자
                        네이버 관련문서의 재료. 실제 <a>(wouter Link)로 렌더해 크롤러가 따라갈 수 있게 한다. */}
                    {related.length > 0 && (
                        <section id="related" className="mb-5 scroll-mt-6">
                            <h2 className="text-[15px] font-bold mb-3">{t.back}</h2>
                            <div className="space-y-2">
                                {related.map((r) => (
                                    <Link
                                        key={r.memCode}
                                        href={`/pba-player/${r.memCode}`}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-left active:scale-[0.99] transition-transform"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <span className="w-9 shrink-0 text-center font-semibold text-black/40 text-[15px] tabular-nums">{r.prizeRank ?? "-"}</span>
                                            <span className="text-[16px] leading-none shrink-0">{flagEmoji(r.nationCode ?? "") || "🏳️"}</span>
                                            <div className="min-w-0">
                                                <span className="block text-[15.5px] font-semibold truncate">{r.nameKo}</span>
                                                {r.nameEn && <span className="block text-[11.5px] font-medium text-black/40 truncate">{r.nameEn}</span>}
                                            </div>
                                        </div>
                                        <span className="text-right shrink-0 ml-3 text-[15px] font-bold tabular-nums">{formatPrize(r.prize, locale)}</span>
                                    </Link>
                                ))}
                                <Link
                                    href="/pba"
                                    className="w-full flex items-center justify-center p-3.5 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[13.5px] font-semibold text-ink-3 active:scale-[0.99] transition-transform"
                                >
                                    {t.back} →
                                </Link>
                            </div>
                        </section>
                    )}

                    <p className="text-center text-[11px] text-black/35">{t.source}</p>
                </>
            )}
        </div>
    );
}
