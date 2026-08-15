import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideX } from "@/lib/icons";
import { UMB_SOURCE_URL, type UmbCategory, type UmbPlayerDetail } from "./types";

// 디자인 토큰 리터럴 — recharts는 CSS 변수를 못 받는다 (GrowthChart와 동일 팔레트)
const BRAND = "#006241";
const GRID = "rgba(0,0,0,0.06)";
const AXIS = "rgba(0,0,0,0.35)";

// ?v=2 — 응답 형태가 바뀔 때 올린다. 초기 배포가 브라우저에도 하루짜리
// stale-while-revalidate를 심어놔서(이후 CDN 전용으로 분리) URL로 캐시를 우회해야 한다.
export function usePlayerDetail(category: UmbCategory, playerUmbId: string | null) {
    return useQuery<UmbPlayerDetail>({
        queryKey: [`/api/hiq/umb/players/${category}/${playerUmbId}`, "v2"],
        queryFn: async () => apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}?v=2`),
        enabled: !!playerUmbId,
        staleTime: 10 * 60 * 1000,
    });
}

interface UmbPlayerBodyProps {
    category: UmbCategory;
    playerUmbId: string;
    onNavigate?: (playerUmbId: string) => void;
    // 전체 페이지(/player/...)에서는 Radix Dialog 컨텍스트가 없어 일반 태그로 그린다
    standalone?: boolean;
}

// 선수 상세 본문 — 시트(다이얼로그)와 전체 페이지(/player, SEO·공유용)가 공유한다.
// 순위 히스토리 + 대회별 포인트 분해 + 성취 뱃지 + 1년 전 대비 + 국내 라이벌.
export const UmbPlayerBody = ({ category, playerUmbId, onNavigate, standalone }: UmbPlayerBodyProps) => {
    const { t, locale } = useT();
    const [metric, setMetric] = useState<"rank" | "points">("rank");
    const { data, isLoading } = usePlayerDetail(category, playerUmbId);

    const player = data?.player;
    const history = data?.history || [];
    const eventLabels = new Map((data?.events || []).map(e => [e.colKey, e.label]));
    const chartData = history.map(h => ({
        label: new Date(h.editionDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric" }),
        rank: h.rank,
        points: h.points,
        edition: h.edition,
    }));
    const breakdown = player?.eventPoints
        ? Object.entries(player.eventPoints)
            .filter(([, v]) => v !== 0)
            .sort((a, b) => b[1] - a[1])
        : [];

    // --- 히스토리 파생 지표 (전부 이미 받은 데이터로 계산) ---
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const weeklyMove = last && prev ? prev.rank - last.rank : null;
    // 연속 상승 스트릭 — 직전 회차보다 순위가 오른 주가 몇 번 이어졌나
    let streak = 0;
    for (let i = history.length - 1; i >= 1; i--) {
        if (history[i - 1].rank > history[i].rank) streak++;
        else break;
    }
    // 역대 최고 순위를 처음 찍은 시점
    const bestEntry = data ? history.find(h => h.rank === data.bestRank) : undefined;
    const bestAt = bestEntry ? new Date(bestEntry.editionDate).toLocaleDateString("ko-KR", { year: "numeric", month: "short" }) : null;
    // 1년 전과 비교 — 365일에 가장 가까운 과거 회차
    const yearAgoTarget = last ? new Date(last.editionDate).getTime() - 365 * 24 * 3600 * 1000 : 0;
    const yearAgo = history.length > 5
        ? [...history].sort((a, b) =>
            Math.abs(new Date(a.editionDate).getTime() - yearAgoTarget) - Math.abs(new Date(b.editionDate).getTime() - yearAgoTarget))[0]
        : undefined;
    const showYearAgo = yearAgo && last && yearAgo.edition !== last.edition
        && Math.abs(new Date(yearAgo.editionDate).getTime() - yearAgoTarget) < 90 * 24 * 3600 * 1000;
    const top10Weeks = history.filter(h => h.rank <= 10).length;
    const no1Weeks = history.filter(h => h.rank === 1).length;

    // 성취 뱃지
    const badges: string[] = [];
    if (player?.rank === 1) badges.push(`🏆 ${t("umb.badgeWorldNo1")}`);
    else if (player && player.rank <= 10) badges.push(`⭐ TOP 10`);
    if (player?.nationalRank === 1 && player.rank !== 1) badges.push(`${flagEmoji(player.fed)} ${t("umb.badgeNationalNo1")}`);
    if (streak >= 3) badges.push(`🔥 ${t("umb.streakUp").replace("{n}", String(streak))}`);

    const TitleTag: any = standalone ? "h1" : DialogTitle;
    const DescTag: any = standalone ? "p" : DialogDescription;

    if (isLoading) {
        return <div className="py-16 text-center text-[13.5px] font-medium text-black/40">{t("umb.loading")}</div>;
    }
    if (!player) {
        return <div className="py-16 text-center text-[14px] font-semibold text-ink-3">{t("umb.empty")}</div>;
    }

    return (
        // min-w-0·overflow-hidden 필수 — DialogContent(grid) 안에서 recharts가
        // 고유 폭으로 컬럼을 밀어내 시트 전체가 가로 스크롤되는 것을 막는다
        <div className="flex flex-col gap-5 min-w-0 max-w-full overflow-hidden">
            {/* 헤더 + 주간 변동 + 성취 뱃지 */}
            <div>
                <TitleTag className="text-[22px] font-bold text-ink-1 leading-tight flex items-center gap-2">
                    <span className="text-[24px] leading-none">{flagEmoji(player.fed)}</span>
                    {/* 한국어 화면 + 한글 이름 보유 시 한글 우선, 로마자는 부제로 병기 */}
                    <span className="min-w-0 truncate">{locale === "ko" && player.nativeName ? player.nativeName : player.playerName}</span>
                    {weeklyMove !== null && weeklyMove !== 0 && (
                        <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", weeklyMove > 0 ? "text-brand" : "text-red-500")}>
                            {weeklyMove > 0 ? `▲${weeklyMove}` : `▼${-weeklyMove}`}
                        </span>
                    )}
                </TitleTag>
                <DescTag className="text-[12.5px] font-medium text-black/50 mt-1">
                    {locale === "ko" && player.nativeName ? `${player.playerName} · ` : player.nativeName ? `${player.nativeName} · ` : ""}
                    {t(`umb.cat${category === "players" ? "Players" : category === "ladies" ? "Ladies" : "Juniors"}`)} · {t("umb.subtitle")}
                </DescTag>
                {badges.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-2.5">
                        {badges.map(b => (
                            <span key={b} className="px-2 py-1 rounded-full bg-[#F5B721]/15 text-[11.5px] font-bold text-[#8a6a0a] leading-none">{b}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* 핵심 지표 4칸 */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: t("umb.currentRank"), value: `${player.rank}`, accent: true },
                    { label: t("umb.bestRank"), value: `${data!.bestRank}` },
                    { label: t("umb.points"), value: `${player.points}` },
                    { label: t("umb.nationalRank"), value: player.nationalRank ? `${player.nationalRank}` : "—" },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl bg-black/[0.03] p-3 text-center">
                        <div className={`text-[19px] font-bold tabular-nums ${s.accent ? "text-brand" : "text-ink-1"}`}>{s.value}</div>
                        <div className="text-[10.5px] font-semibold text-black/45 mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* 커리어 하이라이트 한 줄 */}
            {(bestAt || top10Weeks > 0 || showYearAgo) && (
                <p className="text-[12px] font-medium text-black/50 leading-relaxed -mt-2 px-0.5">
                    {[
                        bestAt ? t("umb.bestAt").replace("{rank}", String(data!.bestRank)).replace("{date}", bestAt) : null,
                        no1Weeks > 0 ? t("umb.no1Weeks").replace("{n}", String(no1Weeks)) : null,
                        top10Weeks > 0 ? t("umb.top10Weeks").replace("{n}", String(top10Weeks)) : null,
                        showYearAgo ? t("umb.yearAgo").replace("{from}", String(yearAgo!.rank)).replace("{to}", String(player.rank)) : null,
                    ].filter(Boolean).join(" · ")}
                </p>
            )}

            {/* 추이 차트 — 순위(기본)/포인트 토글.
                id 는 프리렌더 봇 문서의 앵커(#history)와 짝 — 네이버 "본문 바로가기" 칩 착지점 */}
            {chartData.length >= 2 && (
                <div id="history" className="min-w-0 scroll-mt-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[13.5px] font-bold text-ink-1">{t("umb.rankHistory")}</h3>
                        <div className="flex gap-1">
                            {(["rank", "points"] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMetric(m)}
                                    className={cn(
                                        "h-7 px-2.5 rounded-full text-[11.5px] font-semibold transition-colors",
                                        metric === m ? "bg-ink-1 text-white" : "bg-black/[0.04] text-black/50"
                                    )}
                                >
                                    {t(m === "rank" ? "umb.metricRank" : "umb.metricPoints")}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-44 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={40} />
                                {/* domain을 [1, max]로 고정하면 1000위권 선수의 등락이 바닥 평평한 선이 된다 — 본인 범위로 */}
                                <YAxis reversed={metric === "rank"} domain={["dataMin", "dataMax"]} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                                {metric === "rank" && data!.bestRank <= 10 && (
                                    <ReferenceArea y1={1} y2={10} fill={BRAND} fillOpacity={0.06} />
                                )}
                                <Tooltip
                                    formatter={(v: any) => [metric === "rank" ? `${v}${t("umb.rankSuffix")}` : `${v}${t("umb.pointsUnit")}`, ""]}
                                    labelFormatter={(l: any, payload: any) => payload?.[0]?.payload?.edition ? `Edition ${payload[0].payload.edition}` : l}
                                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, padding: "6px 10px" }}
                                />
                                <Line type="monotone" dataKey={metric} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BRAND }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* 국내 라이벌 — 같은 국가에서 순위가 가장 가까운 선수. 탭하면 이동.
                id 는 프리렌더 봇 문서의 앵커(#rivals)와 짝 */}
            {(data?.rivals?.length ?? 0) > 0 && (
                <div id="rivals" className="scroll-mt-6">
                    <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{flagEmoji(player.fed)} {t("umb.rivals")}</h3>
                    <div className="flex flex-col gap-1.5">
                        {data!.rivals.map(r => (
                            <button
                                key={r.playerUmbId}
                                onClick={() => onNavigate?.(r.playerUmbId)}
                                disabled={!onNavigate}
                                className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5 text-left hover:bg-black/[0.06] transition-colors"
                            >
                                <span className="w-9 shrink-0 text-center font-bold text-[13.5px] tabular-nums text-black/45">{r.rank}</span>
                                <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-ink-1">{locale === "ko" && r.nativeName ? r.nativeName : r.playerName}</span>
                                <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-black/45">{r.points}{t("umb.pointsUnit")}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 포인트 구성 — 대회별 획득 점수 (레전드 매핑) */}
            {breakdown.length > 0 && (
                <div>
                    <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{t("umb.pointsBreakdown")}</h3>
                    <div className="flex flex-col gap-1.5">
                        {breakdown.map(([colKey, pts], idx) => {
                            const max = breakdown[0][1] || 1;
                            return (
                                <div key={colKey} className="rounded-xl bg-black/[0.03] px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 flex items-center gap-1.5">
                                            <span className="text-[12px] font-medium text-ink-2 truncate">{eventLabels.get(colKey) || `${t("umb.event")} ${colKey}`}</span>
                                            {idx === 0 && pts > 0 && breakdown.length > 1 && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/10 text-[10px] font-bold text-brand leading-none">{t("umb.mainEvent")}</span>
                                            )}
                                        </span>
                                        <span className={`text-[13px] font-bold tabular-nums shrink-0 ${pts < 0 ? "text-red-500" : "text-brand"}`}>{pts > 0 ? `+${pts}` : pts}</span>
                                    </div>
                                    {pts > 0 && (
                                        <div className="mt-1.5 h-1 rounded-full bg-black/[0.05] overflow-hidden">
                                            <div className="h-full rounded-full bg-brand/60" style={{ width: `${Math.max(6, (pts / max) * 100)}%` }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {player.penaltyPoints > 0 && (
                            <div className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2">
                                <span className="text-[12px] font-medium text-ink-2">{t("umb.penalty")}</span>
                                <span className="text-[13px] font-bold tabular-nums text-black/45">{player.penaltyPoints}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <a href={UMB_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] font-medium text-black/35 hover:text-black/55 transition-colors">
                {t("umb.source")}
            </a>
        </div>
    );
};

interface UmbPlayerSheetProps {
    category: UmbCategory;
    playerUmbId: string | null; // null이면 닫힘
    onClose: () => void;
    onNavigate?: (playerUmbId: string) => void;
}

// 시트(다이얼로그) 래퍼 — 목록에서 선수를 탭했을 때
export const UmbPlayerSheet = ({ category, playerUmbId, onClose, onNavigate }: UmbPlayerSheetProps) => {
    const { t } = useT();
    return (
        <Dialog open={!!playerUmbId} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent hideClose className="bg-white text-ink-1 max-w-md w-[92%] max-h-[86vh] overflow-y-auto rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-colors z-10"
                    aria-label={t("umb.close")}
                >
                    <LucideX className="w-4 h-4 text-black/45" />
                </button>
                {playerUmbId && (
                    <UmbPlayerBody category={category} playerUmbId={playerUmbId} onNavigate={onNavigate} />
                )}
            </DialogContent>
        </Dialog>
    );
};
