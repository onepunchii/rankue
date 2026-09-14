import { useState } from "react";
import { useLocation } from "wouter";
import { goLogin } from "@/components/hiq/LoginGate";
import { PlayerCardShareButton } from "@/components/hiq/PlayerCardShareButton";
import { golferCardUrl } from "@/lib/playerCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideX } from "@/lib/icons";
import { GOLF_TOUR_META, STAT_HIGHLIGHTS, formatRankValue, formatStatValue } from "@shared/golfTours";
import { ageFrom, regionName } from "@/components/hiq/umb/types";
import { PlayerCheers } from "@/components/hiq/umb/PlayerCheers";
import { GChip, GList, GSection, GTile } from "./ui";
import { golferName, iocToAlpha2, type GolfTour, type GolferDetail } from "./types";

const MEDALS = ["🥇", "🥈", "🥉"];
const STAT_FOLD = 8;
// recharts 는 CSS 변수를 못 받는다 — 골프 토큰 리터럴(라임)
const BRAND = "#64DD17";
const GRID = "rgba(255,255,255,0.08)";
const AXIS = "rgba(255,255,255,0.4)";

export const GOLF_API = "/api/hiq/golf-rank/players";

export function useGolferDetail(tour: GolfTour, playerId: string | null) {
    return useQuery<GolferDetail>({
        queryKey: [`${GOLF_API}/${tour}/${playerId}`],
        queryFn: async () => apiRequest(`${GOLF_API}/${tour}/${playerId}`),
        enabled: !!playerId,
        staleTime: 10 * 60 * 1000,
    });
}

interface GolferBodyProps {
    tour: GolfTour;
    playerId: string;
    onNavigate?: (playerId: string) => void;
    standalone?: boolean;
}

function PersonRow({ pos, name, rank, points, me, onClick, unitLabel, t }: {
    pos?: string; name: string; rank: number; points: string; me?: boolean; onClick?: () => void; unitLabel: string; t: (k: string) => string;
}) {
    return (
        <button
            type="button" onClick={onClick} disabled={!onClick || me}
            className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors", me ? "bg-brand/[0.12]" : "hover:bg-surface-line")}
        >
            {pos !== undefined && (
                <span className={cn("w-7 shrink-0 text-center leading-none", /^\d+$/.test(pos) ? "text-[13px] font-bold text-ink-3 tabular-nums" : "text-[17px]")}>{pos}</span>
            )}
            <span className={cn("flex-1 min-w-0 truncate text-[13.5px] font-semibold", me ? "text-brand" : "text-ink-1")}>{name}</span>
            <span className="shrink-0 text-right">
                <span className={cn("block text-[13px] font-bold tabular-nums leading-none", me ? "text-brand" : "text-ink-1")}>{t("golf.world")} {rank}{t("umb.rankSuffix")}</span>
                <span className="block text-[10.5px] font-semibold tabular-nums text-ink-3 mt-1">{points} {unitLabel}</span>
            </span>
        </button>
    );
}

// 골프 선수 상세 본문 — 시트와 전체 페이지(/golfer/:tour/:id)가 공유. 당구 선수 페이지(UmbPlayerBody)와 같은 골격.
export const GolferBody = ({ tour, playerId, onNavigate, standalone }: GolferBodyProps) => {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [metric, setMetric] = useState<"rank" | "points">("rank");
    const [showAllStats, setShowAllStats] = useState(false);
    const [followBusy, setFollowBusy] = useState(false);
    const { data, isLoading } = useGolferDetail(tour, playerId);
    const detailKey = [`${GOLF_API}/${tour}/${playerId}`];
    const meta = GOLF_TOUR_META[tour];

    const [, setLocation] = useLocation();
    const toggleFollow = async () => {
        if (!data || followBusy) return;
        if (!member) { toast({ title: t("umb.followLogin") }); goLogin(setLocation); return; }
        const next = !data.following;
        setFollowBusy(true);
        qc.setQueryData<GolferDetail>(detailKey, { ...data, following: next, followers: Math.max(0, (data.followers ?? 0) + (next ? 1 : -1)) });
        try {
            await apiRequest(`${GOLF_API}/${tour}/${playerId}/follow`, { method: "PUT", body: { on: next } });
            if (next) toast({ title: t("umb.followOn") });
        } catch {
            qc.setQueryData<GolferDetail>(detailKey, data);
        } finally {
            setFollowBusy(false);
        }
    };

    const TitleTag: any = standalone ? "h1" : DialogTitle;
    const DescTag: any = standalone ? "p" : DialogDescription;

    if (isLoading) return <div className="py-16 text-center text-[13.5px] font-medium text-ink-3">{t("golf.loading")}</div>;
    if (!data?.player) return <div className="py-16 text-center text-[14px] font-semibold text-ink-3">{t("golf.empty")}</div>;

    const p = data.player;
    const history = data.history;
    const chartData = history.map(h => ({
        label: new Date(h.editionDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric" }),
        rank: h.rank, points: h.points, edition: h.edition,
    }));
    const rankSuffix = t("umb.rankSuffix");
    const flag = flagEmoji(iocToAlpha2(p.country));
    const age = ageFrom(p.birthDate);
    const sponsor = typeof p.extra?.sponsor === "string" ? p.extra.sponsor : null;
    const move = p.rank !== null && p.prevRank !== null ? p.prevRank - p.rank : null;
    const national = data.national;
    const valueLabel = t(meta.valueLabelKey);

    const badges: string[] = [];
    if (p.rank === 1) badges.push(`🏆 ${t("golf.no1")}`);
    else if (p.rank !== null && p.rank <= 10) badges.push("⭐ TOP 10");
    if (meta.world && national?.nationalRank === 1 && p.rank !== 1) badges.push(`${flag} ${t("umb.badgeNationalNo1")}`);
    if (p.extra?.isAmateur === true) badges.push(`🎓 ${t("golf.amateur")}`);

    // 대표 기록(비거리·페어웨이·그린·퍼트·타수·상금) + 나머지
    const highlights = meta.world ? [] : STAT_HIGHLIGHTS[tour as "kpga" | "klpga"];
    const statByKey = new Map(data.stats.map(s => [s.statKey, s]));
    const heroStats = highlights.map(h => ({ ...h, s: statByKey.get(h.key) })).filter(x => x.s);
    const heroKeys = new Set(heroStats.map(h => h.key));
    const restStats = data.stats.filter(s => !heroKeys.has(s.statKey)).sort((a, b) => a.rank - b.rank);

    return (
        <div className="flex flex-col gap-7 min-w-0 max-w-full overflow-hidden">
            <div className={cn(!standalone && "pr-9")}>
                <TitleTag className="text-[24px] font-bold text-ink-1 leading-tight flex items-center gap-2">
                    <span className="text-[26px] leading-none">{flag}</span>
                    <span className="min-w-0 truncate">{golferName(p, locale)}</span>
                </TitleTag>
                <DescTag className="text-[12.5px] font-medium text-ink-3 mt-1">
                    {[
                        locale === "ko" && p.nameKo && p.nameKo !== p.playerName ? (p.nameEn || p.playerName) : (p.nameEn && p.nameEn !== p.playerName ? p.nameEn : null),
                        age !== null ? t("umb.age").replace("{n}", String(age)) : null,
                        sponsor,
                        t(meta.labelKey),
                    ].filter(Boolean).join(" · ")}
                </DescTag>
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    <button
                        type="button" onClick={() => { void toggleFollow(); }} disabled={followBusy} aria-pressed={!!data.following}
                        className={cn(
                            "inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-bold transition-colors disabled:opacity-60",
                            data.following ? "bg-brand text-brand-fg" : "bg-surface-3 text-ink-1 hover:bg-surface-line",
                        )}
                    >
                        <span className="text-[14px] leading-none">{data.following ? "♥" : "♡"}</span>
                        {t("umb.follow")}
                        {(data.followers ?? 0) > 0 && <span className="tabular-nums opacity-70">· {data.followers}</span>}
                    </button>
                    <PlayerCardShareButton
                        cardUrl={golferCardUrl(tour, playerId, locale)}
                        filename={`rankue-golf-${playerId}.png`}
                        title={golferName(p, locale)}
                        text={`${golferName(p, locale)} — ${t(meta.labelKey)} ${p.rank ?? "-"}${rankSuffix} · https://www.rankue.co.kr/golfer/${tour}/${playerId}`}
                    />
                    {badges.map(b => <GChip key={b} tone="gold">{b}</GChip>)}
                </div>
            </div>

            {/* 히어로(순위·기준 값) + 타일 3칸 */}
            <div className="flex flex-col gap-2 -mt-3">
                <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[11.5px] font-semibold opacity-75 truncate">{meta.world ? "🌍" : "🏌️"} {t(meta.labelKey)} · {t("golf.asOf").replace("{date}", data.edition)}</div>
                        <div className="flex items-center gap-2 mt-2">
                            {p.inLatest && p.rank !== null ? (
                                <span className="text-[38px] font-bold leading-none tabular-nums">{p.rank}<span className="text-[17px] font-semibold ml-0.5">{rankSuffix}</span></span>
                            ) : (
                                <span className="text-[15px] font-bold leading-tight">{t("golf.notInLatest")}</span>
                            )}
                            {move !== null && move !== 0 && (
                                <span className="h-6 px-2 rounded-full bg-black/15 text-[12px] font-bold tabular-nums inline-flex items-center">{move > 0 ? `▲${move}` : `▼${-move}`}</span>
                            )}
                        </div>
                    </div>
                    {p.points !== null && (
                        <div className="text-right shrink-0">
                            <div className="text-[26px] font-bold leading-none tabular-nums">{formatRankValue(tour, p.points)}</div>
                            <div className="text-[11px] font-semibold opacity-75 mt-1.5">{valueLabel}</div>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <GTile emoji="🥇" value={data.bestRank !== null ? `${data.bestRank}${rankSuffix}` : "—"} label={t("golf.bestRank")} />
                    {meta.world
                        ? <GTile emoji={flag || "🏠"} value={national?.nationalRank ? `${national.nationalRank}${rankSuffix}` : "—"} label={t("golf.nationalRank")} />
                        : <GTile emoji="🏆" value={p.extra?.wins !== undefined && p.extra?.wins !== null ? String(p.extra.wins) : "—"} label={t("golf.wins")} />}
                    {meta.world
                        ? <GTile emoji="📊" value={p.pointsTotal !== null ? p.pointsTotal.toFixed(1) : "—"} label={t("golf.totalPoints")} />
                        : <GTile emoji="⛳" value={p.events !== null ? String(p.events) : "—"} label={t("golf.events")} />}
                </div>
            </div>

            {/* 순위 추이 */}
            {chartData.length >= 2 && (
                <GSection
                    emoji="📈" title={t("golf.rankHistory")}
                    meta={(
                        <div className="flex gap-1">
                            {(["rank", "points"] as const).map(m => (
                                <button
                                    key={m} onClick={() => setMetric(m)}
                                    className={cn("h-7 px-2.5 rounded-full text-[11.5px] font-semibold transition-colors", metric === m ? "bg-brand text-brand-fg" : "bg-surface-3 text-ink-3")}
                                >
                                    {t(m === "rank" ? "umb.metricRank" : "umb.metricPoints")}
                                </button>
                            ))}
                        </div>
                    )}
                >
                    <div className="h-44 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={40} />
                                <YAxis reversed={metric === "rank"} domain={["dataMin", "dataMax"]} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={40} allowDecimals={metric === "points"} />
                                {metric === "rank" && data.bestRank !== null && data.bestRank <= 10 && <ReferenceArea y1={1} y2={10} fill={BRAND} fillOpacity={0.08} />}
                                <Tooltip
                                    formatter={(v: any) => [metric === "rank" ? `${v}${rankSuffix}` : formatRankValue(tour, Number(v)), ""]}
                                    labelFormatter={(l: any, payload: any) => payload?.[0]?.payload?.edition ?? l}
                                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#17181a", color: "#fff", fontSize: 12, padding: "6px 10px" }}
                                />
                                <Line type="monotone" dataKey={metric} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BRAND }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </GSection>
            )}

            {/* 시즌 기록 — 대표 6개 타일 + 나머지 목록 */}
            {data.stats.length > 0 && (
                <GSection emoji="🏌️" title={t("golf.statsTitle")} meta={t("golf.statSeason").replace("{season}", data.season)}>
                    {heroStats.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {heroStats.map(h => (
                                <div key={h.key} className="rounded-2xl bg-surface-3 px-2 py-3 text-center min-w-0">
                                    <div className="text-[16px] leading-none">{h.emoji}</div>
                                    <div className="text-[17px] font-bold tabular-nums text-ink-1 mt-1.5 leading-none">{formatStatValue(h.s!.value, h.s!.unit)}</div>
                                    <div className="text-[10.5px] font-semibold text-ink-3 mt-1.5 truncate">{h.short} · <span className="text-brand">{h.s!.rank}{rankSuffix}</span></div>
                                </div>
                            ))}
                        </div>
                    )}
                    {restStats.length > 0 && (
                        <GList>
                            {(showAllStats ? restStats : restStats.slice(0, STAT_FOLD)).map(s => (
                                <div key={s.statKey} className="flex items-center gap-3 px-3 py-2.5">
                                    <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-ink-1">{s.label}</span>
                                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-1">{formatStatValue(s.value, s.unit)}</span>
                                    <span className={cn("shrink-0 w-14 text-right text-[12px] font-bold tabular-nums", s.rank <= 10 ? "text-brand" : "text-ink-3")}>
                                        {s.rank}{rankSuffix}{s.of ? <span className="text-ink-4 font-medium">/{s.of}</span> : null}
                                    </span>
                                </div>
                            ))}
                            {restStats.length > STAT_FOLD && (
                                <button type="button" onClick={() => setShowAllStats(v => !v)} className="w-full h-11 text-[12.5px] font-semibold text-brand hover:bg-surface-line transition-colors">
                                    {showAllStats ? `${t("umb.showLess")} ▲` : `${t("umb.showMore").replace("{n}", String(restStats.length - STAT_FOLD))} ▼`}
                                </button>
                            )}
                        </GList>
                    )}
                </GSection>
            )}

            {/* 국내 순위판(세계 랭킹) */}
            {meta.world && national && national.top.length > 0 && (
                <GSection
                    emoji={flag || "🏠"} title={t("golf.national")}
                    meta={national.nationalRank ? t("umb.nationalOf").replace("{fed}", regionName(iocToAlpha2(p.country), locale)).replace("{n}", String(national.fedCount)).replace("{r}", String(national.nationalRank)) : undefined}
                >
                    <GList>
                        {national.top.map((r, i) => (
                            <PersonRow
                                key={r.playerId} t={t} pos={MEDALS[i] ?? String(i + 1)}
                                name={golferName(r, locale)} rank={r.rank} points={formatRankValue(tour, r.points)} unitLabel={valueLabel}
                                me={r.playerId === p.playerId}
                                onClick={onNavigate ? () => onNavigate(r.playerId) : undefined}
                            />
                        ))}
                    </GList>
                </GSection>
            )}

            <PlayerCheers category={tour} playerUmbId={playerId} basePath={GOLF_API} />

            <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] font-medium text-ink-4 hover:text-ink-3 transition-colors">
                {t("golf.source").replace("{name}", meta.sourceName)}
            </a>
        </div>
    );
};

interface GolferSheetProps {
    tour: GolfTour;
    playerId: string | null;
    onClose: () => void;
    onNavigate?: (playerId: string) => void;
}

export const GolferSheet = ({ tour, playerId, onClose, onNavigate }: GolferSheetProps) => {
    const { t } = useT();
    return (
        <Dialog open={!!playerId} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent hideClose className="bg-surface-1 text-ink-1 border-surface-line max-w-md w-[92%] max-h-[86vh] overflow-y-auto rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center hover:bg-surface-line transition-colors z-10"
                    aria-label={t("umb.close")}
                >
                    <LucideX className="w-4 h-4 text-ink-3" />
                </button>
                {playerId && <GolferBody tour={tour} playerId={playerId} onNavigate={onNavigate} />}
            </DialogContent>
        </Dialog>
    );
};
