import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { pointsByContinent } from "@shared/umbContinent";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideX } from "@/lib/icons";
import { ageFrom, regionName as regionNameOf, UMB_SOURCE_URL, type UmbCategory, type UmbPlayerDetail } from "./types";

/** 대회 수가 많으면 상위 몇 개만 펴 둔다 — 8개 넘게 늘어져 페이지가 길었다(2026-09-13 오너). */
const POINTS_FOLD = 5;

/** 원 단위 상금 → "9.9억" / "5,015만" 처럼 짧게. 한국어 화면에서만 단위를 붙인다. */
function formatPrize(won: number, locale: string): string {
    if (locale === "ko") {
        if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(won >= 1_000_000_000 ? 0 : 1)}억`;
        if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
        return won.toLocaleString("ko-KR");
    }
    return `₩${Math.round(won / 1_000_000).toLocaleString()}M`;
}

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
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [metric, setMetric] = useState<"rank" | "points">("rank");
    const [showAllPoints, setShowAllPoints] = useState(false);
    const [followBusy, setFollowBusy] = useState(false);
    const { data, isLoading } = usePlayerDetail(category, playerUmbId);
    const detailKey = [`/api/hiq/umb/players/${category}/${playerUmbId}`, "v2"];

    /** 관심 선수 켜기/끄기 — 낙관적으로 먼저 바꾸고 실패하면 되돌린다. 비로그인은 안내만. */
    const toggleFollow = async () => {
        if (!data || followBusy) return;
        if (!member) { toast({ title: t("umb.followLogin") }); return; }
        const next = !data.following;
        setFollowBusy(true);
        qc.setQueryData<UmbPlayerDetail>(detailKey, { ...data, following: next, followers: Math.max(0, (data.followers ?? 0) + (next ? 1 : -1)) });
        try {
            await apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}/follow`, { method: "PUT", body: { on: next } });
        } catch {
            qc.setQueryData<UmbPlayerDetail>(detailKey, data);
        } finally {
            setFollowBusy(false);
        }
    };

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

    // 대륙별 강세 · 나이(PBA 생일) · 국내 리더보드(2026-09-13 오너 제안)
    const continents = pointsByContinent(player?.eventPoints, eventLabels);
    const age = ageFrom(data?.pba?.birthday);
    const national = data?.national;
    const nationalTopIds = new Set((national?.top ?? []).map(r => r.playerUmbId));
    const nearby = (data?.rivals ?? []).filter(r => !nationalTopIds.has(r.playerUmbId));
    const pba = data?.pba ?? null;

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
                    {age !== null ? `${t("umb.age").replace("{n}", String(age))} · ` : ""}
                    {t(`umb.cat${category === "players" ? "Players" : category === "ladies" ? "Ladies" : "Juniors"}`)} · {t("umb.subtitle")}
                </DescTag>
                {/* 관심 선수(팔로우, 2026-09-13 오너). 순위 변동 알림이 여기 붙는다. 비로그인은 눌러도 안내만. */}
                <div className="flex items-center gap-2 mt-2.5">
                    <button
                        type="button" onClick={() => { void toggleFollow(); }} disabled={followBusy} aria-pressed={!!data?.following}
                        className={cn(
                            "h-9 px-3.5 rounded-full text-[12.5px] font-bold transition-colors disabled:opacity-60",
                            data?.following ? "bg-brand text-brand-fg" : "bg-black/[0.05] text-ink-1 hover:bg-black/[0.08]",
                        )}
                    >
                        {data?.following ? t("umb.following") : `♡ ${t("umb.follow")}`}
                    </button>
                    {(data?.followers ?? 0) > 0 && (
                        <span className="text-[12px] font-medium text-black/45">{t("umb.followers").replace("{n}", String(data!.followers))}</span>
                    )}
                </div>
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

            {/* 추이 차트 — 순위(기본)/포인트 토글 */}
            {chartData.length >= 2 && (
                <div className="min-w-0">
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

            {/* 포인트 만료 예고(2026-09-13 오너 제안 1번) — UMB 공식 사이트도 안 보여 주는 정보. 문구는 언제나 '예상·무렵' */}
            {(data?.expiry?.length ?? 0) > 0 && (
                <div>
                    <h3 className="text-[13.5px] font-bold text-ink-1 mb-0.5">{t("umb.expiryTitle")}</h3>
                    <p className="text-[11px] font-medium text-black/40 mb-2">{t("umb.expiryDesc")}</p>
                    <div className="flex flex-col gap-1.5">
                        {data!.expiry!.map((e) => {
                            const ym = new Date(e.expiresAround).toLocaleDateString(locale === "ko" ? "ko-KR" : locale, { year: "numeric", month: "long" });
                            const delta = e.projectedRank - player.rank;
                            return (
                                <div key={e.colKey} className="rounded-xl bg-black/[0.03] px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 text-[12px] font-medium text-ink-2 truncate">{e.label}</span>
                                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-500">−{e.points}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                        <span className="text-[11px] font-medium text-black/45">{t("umb.expiryAround").replace("{ym}", ym)} · {e.pointsAfter}{t("umb.pointsUnit")}</span>
                                        <span className={cn("text-[11.5px] font-bold tabular-nums", delta > 0 ? "text-red-500" : "text-black/55")}>
                                            {t("umb.expiryProjected").replace("{r}", String(e.projectedRank))}{delta > 0 ? ` (▼${delta})` : ""}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 국내 순위(2026-09-13 오너): "한국 12명 중 3위" 맥락 + 상위 5명 + 가까운 순위. 탭하면 그 선수로 이동 */}
            {national && national.top.length > 0 && (
                <div>
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                        <h3 className="text-[13.5px] font-bold text-ink-1">{flagEmoji(player.fed)} {t("umb.national")}</h3>
                        {player.nationalRank && (
                            <span className="text-[12px] font-semibold text-black/50">
                                {t("umb.nationalOf").replace("{fed}", regionNameOf(player.fed, locale)).replace("{n}", String(national.fedCount)).replace("{r}", String(player.nationalRank))}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {national.top.map(r => {
                            const me = r.playerUmbId === player.playerUmbId;
                            return (
                                <button
                                    key={r.playerUmbId}
                                    onClick={() => onNavigate?.(r.playerUmbId)}
                                    disabled={!onNavigate || me}
                                    className={cn(
                                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                                        me ? "bg-brand/10 ring-1 ring-brand/30" : "bg-black/[0.03] hover:bg-black/[0.06]",
                                    )}
                                >
                                    <span className="w-9 shrink-0 text-center font-bold text-[13.5px] tabular-nums text-black/45">{r.rank}</span>
                                    <span className={cn("flex-1 min-w-0 truncate text-[13.5px] font-semibold", me ? "text-brand" : "text-ink-1")}>{locale === "ko" && r.nativeName ? r.nativeName : r.playerName}</span>
                                    <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-black/45">{r.points}{t("umb.pointsUnit")}</span>
                                </button>
                            );
                        })}
                        {nearby.length > 0 && (
                            <>
                                <p className="text-[11px] font-semibold text-black/40 mt-1 px-0.5">{t("umb.nearby")}</p>
                                {nearby.map(r => (
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
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* PBA 통산 기록(2026-09-13 오너): UMB 랭킹에는 없는 진짜 경기 수치 — 교차 매칭된 선수(167명)에게만 */}
            {pba && (
                <div>
                    <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{t("umb.pbaTitle").replace("{league}", pba.league)}</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: t("umb.pbaAverage"), value: pba.average !== null ? pba.average.toFixed(3) : "—", accent: true },
                            { label: t("umb.pbaHighRun"), value: pba.highRun !== null ? String(pba.highRun) : "—" },
                            { label: t("umb.pbaBank"), value: pba.bankShotRate !== null ? `${pba.bankShotRate.toFixed(1)}%` : "—" },
                            { label: t("umb.pbaRecord"), value: pba.win !== null && pba.lose !== null ? `${pba.win}-${pba.lose}${pba.draw ? `-${pba.draw}` : ""}` : "—" },
                            { label: t("umb.pbaPrize"), value: pba.careerPrize ? formatPrize(pba.careerPrize, locale) : "—" },
                        ].map((c) => (
                            <div key={c.label} className="rounded-2xl bg-black/[0.03] p-3 text-center">
                                <div className={cn("text-[17px] font-bold tabular-nums", c.accent ? "text-brand" : "text-ink-1")}>{c.value}</div>
                                <div className="text-[10.5px] font-semibold text-black/45 mt-0.5">{c.label}</div>
                            </div>
                        ))}
                    </div>
                    {pba.season && (
                        <p className="text-[12px] font-medium text-black/50 mt-2 px-0.5">
                            {t("umb.pbaSeason")
                                .replace("{season}", String(pba.season.season)).replace("{next}", String((pba.season.season + 1) % 100).padStart(2, "0"))
                                .replace("{r}", pba.season.prizeRank ? String(pba.season.prizeRank) : "—")
                                .replace("{p}", pba.season.pointRank ? String(pba.season.pointRank) : "—")}
                        </p>
                    )}
                    <p className="text-[11px] font-medium text-black/35 mt-1 px-0.5">{t("umb.pbaSource")}</p>
                </div>
            )}

            {/* 포인트 구성 — 대회별 획득 점수 (레전드 매핑) */}
            {breakdown.length > 0 && (
                <div>
                    <h3 className="text-[13.5px] font-bold text-ink-1 mb-2">{t("umb.pointsBreakdown")}</h3>
                    {/* 어디서 점수를 버나 — 대회 이름의 연맹 약자로 대륙을 가른다(2026-09-13 오너 제안) */}
                    {continents.length > 1 && (
                        <div className="flex gap-1.5 flex-wrap mb-2.5">
                            {continents.map((c) => (
                                <span key={c.continent} className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-full bg-black/[0.04] text-[11.5px] font-semibold text-ink-2">
                                    {t(`umb.cont.${c.continent}`)}
                                    <span className="font-bold text-brand tabular-nums">{c.points}</span>
                                    <span className="text-black/40">· {t("umb.contEvents").replace("{n}", String(c.events))}</span>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                        {(showAllPoints ? breakdown : breakdown.slice(0, POINTS_FOLD)).map(([colKey, pts], idx) => {
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
                        {breakdown.length > POINTS_FOLD && (
                            <button
                                type="button" onClick={() => setShowAllPoints((v) => !v)}
                                className="h-10 rounded-xl bg-black/[0.03] text-[12.5px] font-semibold text-ink-2 hover:bg-black/[0.06] transition-colors"
                            >
                                {showAllPoints ? t("umb.showLess") : t("umb.showMore").replace("{n}", String(breakdown.length - POINTS_FOLD))}
                            </button>
                        )}
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
