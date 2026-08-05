import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideX } from "@/lib/icons";
import { UMB_SOURCE_URL, type UmbCategory, type UmbPlayerDetail } from "./types";

// 디자인 토큰 리터럴 — recharts는 CSS 변수를 못 받는다 (GrowthChart와 동일 팔레트)
const BRAND = "#006241";
const GRID = "rgba(0,0,0,0.06)";
const AXIS = "rgba(0,0,0,0.35)";

interface UmbPlayerSheetProps {
    category: UmbCategory;
    playerUmbId: string | null; // null이면 닫힘
    onClose: () => void;
}

// 선수 상세 — 순위 히스토리(주간 스냅샷 ~50회차) + 대회별 포인트 분해.
// 데이터 전체를 쓰는 화면의 핵심: 어느 대회에서 몇 점을 땄는지까지 보여준다.
export const UmbPlayerSheet = ({ category, playerUmbId, onClose }: UmbPlayerSheetProps) => {
    const { t } = useT();

    const { data, isLoading } = useQuery<UmbPlayerDetail>({
        queryKey: [`/api/hiq/umb/players/${category}/${playerUmbId}`],
        queryFn: async () => apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}`),
        enabled: !!playerUmbId,
        staleTime: 10 * 60 * 1000,
    });

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

                {isLoading && (
                    <div className="py-16 text-center text-[13.5px] font-medium text-black/40">{t("umb.loading")}</div>
                )}

                {player && (
                    <div className="flex flex-col gap-5">
                        {/* 헤더 */}
                        <div>
                            <DialogTitle className="text-[22px] font-bold text-ink-1 leading-tight flex items-center gap-2">
                                <span className="text-[24px] leading-none">{flagEmoji(player.fed)}</span>
                                {player.playerName}
                            </DialogTitle>
                            <DialogDescription className="text-[12.5px] font-medium text-black/50 mt-1">
                                {t(`umb.cat${category === "players" ? "Players" : category === "ladies" ? "Ladies" : "Juniors"}`)} · {t("umb.subtitle")}
                            </DialogDescription>
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

                        {/* 순위 추이 — y축 반전(1위가 위) */}
                        {chartData.length >= 2 && (
                            <div>
                                <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{t("umb.rankHistory")}</h3>
                                <div className="h-44 -mx-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={40} />
                                            {/* domain을 [1, max]로 고정하면 1000위권 선수의 등락이 바닥 평평한 선이 된다 — 본인 범위로 */}
                                            <YAxis reversed domain={["dataMin", "dataMax"]} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                                            <Tooltip
                                                formatter={(v: any) => [`${v}${t("umb.rankSuffix")}`, ""]}
                                                labelFormatter={(l: any, payload: any) => payload?.[0]?.payload?.edition ? `Edition ${payload[0].payload.edition}` : l}
                                                contentStyle={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, padding: "6px 10px" }}
                                            />
                                            <Line type="monotone" dataKey="rank" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BRAND }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* 포인트 구성 — 대회별 획득 점수 (레전드 매핑) */}
                        {breakdown.length > 0 && (
                            <div>
                                <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{t("umb.pointsBreakdown")}</h3>
                                <div className="flex flex-col gap-1.5">
                                    {breakdown.map(([colKey, pts]) => {
                                        const max = breakdown[0][1] || 1;
                                        return (
                                            <div key={colKey} className="rounded-xl bg-black/[0.03] px-3 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[12px] font-medium text-ink-2 truncate">{eventLabels.get(colKey) || `${t("umb.event")} ${colKey}`}</span>
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
                )}
            </DialogContent>
        </Dialog>
    );
};
