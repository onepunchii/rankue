import { useState } from "react";
import { useLocation } from "wouter";
import { goLogin } from "@/components/hiq/LoginGate";
import { PlayerCardShareButton } from "@/components/hiq/PlayerCardShareButton";
import { umbCardUrl } from "@/lib/playerCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { pointsByContinent } from "@shared/umbContinent";
import { parseEventLabel } from "@shared/umbEventLabel";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT } from "@/lib/i18n";
import { LucideX } from "@/lib/icons";
import { ageFrom, regionName as regionNameOf, UMB_SOURCE_URL, type UmbCategory, type UmbPlayerDetail } from "./types";
import { PlayerCheers } from "./PlayerCheers";
import { Chip, List, Section, Tile } from "./ui";

/** 대회 수가 많으면 상위 몇 개만 펴 둔다 — 8개 넘게 늘어져 페이지가 길었다(2026-09-13 오너). */
const POINTS_FOLD = 5;
const EVHIST_FOLD = 6;
/** 국내 순위판 1~3위 메달. 그 아래는 숫자 */
const MEDALS = ["🥇", "🥈", "🥉"];
/** 대륙 비중 막대의 단색 램프 — 브랜드 녹색 한 가지의 농도 차이라 알록달록하지 않다 */
const RAMP = ["bg-brand", "bg-brand/70", "bg-brand/50", "bg-brand/35", "bg-brand/25", "bg-brand/15", "bg-black/20", "bg-black/10"];

/** 원 단위 상금 → "9.9억" / "5,015만" 처럼 짧게. 한국어 화면에서만 단위를 붙인다. */
function formatPrize(won: number, locale: string): string {
    if (locale === "ko") {
        if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(won >= 1_000_000_000 ? 0 : 1)}억`;
        if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
        return won.toLocaleString("ko-KR");
    }
    return `₩${Math.round(won / 1_000_000).toLocaleString()}M`;
}

/**
 * 대회 한 줄 표시 — 이모지(국기) · 제목(종류 · 도시) · 부제(주최 · 날짜).
 * "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12" 를 그대로 찍으면 좁은 폰에서 도시부터 잘렸다(2026-09-13 오너).
 * 원문은 title 속성으로 남겨 두어 길게 누르면 그대로 볼 수 있다.
 */
function eventView(label: string, t: (k: string) => string, opts: { short?: boolean } = {}): { emoji: string; title: string; sub: string } {
    const p = parseEventLabel(label);
    const date = p.date ? p.date.replace(/-/g, ".") : "";
    // short: 만료 예고처럼 오른쪽 칸이 넓은 줄 — 주최는 빼고 날짜만(실측: 주최까지 넣으면 "남은 n점"이 잘린다)
    const org = (o: string | null) => (opts.short ? null : o);
    switch (p.kind) {
        case "worldcup":
            return { emoji: flagEmoji(p.country) || "🎱", title: `${t("umb.kindWorldcup")} · ${p.city}`, sub: [org(p.org), date].filter(Boolean).join(" · ") };
        case "worldchamp":
            return { emoji: "🏆", title: p.city ? `${t("umb.kindChampionship")} · ${p.city}` : t("umb.kindChampionship"), sub: [org("UMB"), date].filter(Boolean).join(" · ") };
        case "confederal":
            return { emoji: "🏅", title: t("umb.cont.confederal"), sub: p.season ?? "" };
        case "national":
            return { emoji: "🎖️", title: t("umb.cont.national"), sub: p.season ?? "" };
        default:
            return { emoji: "🎱", title: label, sub: "" };
    }
}

// 디자인 토큰 리터럴 — recharts는 CSS 변수를 못 받는다 (GrowthChart와 동일 팔레트)
const BRAND = "#006241";
const GRID = "rgba(0,0,0,0.06)";
const AXIS = "rgba(0,0,0,0.35)";

// ?v=4 — 응답 형태가 바뀔 때 올린다(v4: 2026-09-14 대회 이력 표 eventHistory. v3: 2026-09-13 국내 순위판·PBA·만료 예고·팔로우 추가. 쿼리 캐시가 localStorage 에
// 남아 있어 키를 올리지 않으면 옛 응답이 10분 동안 그대로 보인다 — 실측). 초기 배포가 브라우저에도 하루짜리
// stale-while-revalidate를 심어놔서(이후 CDN 전용으로 분리) URL로 캐시를 우회해야 한다.
export function usePlayerDetail(category: UmbCategory, playerUmbId: string | null) {
    return useQuery<UmbPlayerDetail>({
        queryKey: [`/api/hiq/umb/players/${category}/${playerUmbId}`, "v4"],
        queryFn: async () => apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}?v=4`),
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

/** 국내 순위판·가까운 순위 한 줄. pos 가 있으면(순위판) 메달·번호 칸을 앞에 둔다 */
function PersonRow({ pos, name, rank, points, me, onClick, t }: {
    pos?: string; name: string; rank: number; points: number; me?: boolean; onClick?: () => void; t: (k: string) => string;
}) {
    return (
        <button
            type="button" onClick={onClick} disabled={!onClick || me}
            className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors", me ? "bg-brand/[0.08]" : "hover:bg-black/[0.03]")}
        >
            {pos !== undefined && (
                <span className={cn("w-7 shrink-0 text-center leading-none", /^\d+$/.test(pos) ? "text-[13px] font-bold text-black/40 tabular-nums" : "text-[17px]")}>{pos}</span>
            )}
            <span className={cn("flex-1 min-w-0 truncate text-[13.5px] font-semibold", me ? "text-brand" : "text-ink-1")}>{name}</span>
            <span className="shrink-0 text-right">
                <span className={cn("block text-[13px] font-bold tabular-nums leading-none", me ? "text-brand" : "text-ink-1")}>{t("umb.sourceWorld")} {rank}{t("umb.rankSuffix")}</span>
                <span className="block text-[10.5px] font-semibold tabular-nums text-black/40 mt-1">{points}{t("umb.pointsUnit")}</span>
            </span>
        </button>
    );
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
    const [showAllEvHist, setShowAllEvHist] = useState(false);
    const [followBusy, setFollowBusy] = useState(false);
    const { data, isLoading } = usePlayerDetail(category, playerUmbId);
    const detailKey = [`/api/hiq/umb/players/${category}/${playerUmbId}`, "v3"];
    const dateLocale = locale === "ko" ? "ko-KR" : locale;

    /** 관심 선수 켜기/끄기 — 낙관적으로 먼저 바꾸고 실패하면 되돌린다. 비로그인은 안내만. */
    const [, setLocation] = useLocation();
    const toggleFollow = async () => {
        if (!data || followBusy) return;
        if (!member) { toast({ title: t("umb.followLogin") }); goLogin(setLocation); return; }
        const next = !data.following;
        setFollowBusy(true);
        qc.setQueryData<UmbPlayerDetail>(detailKey, { ...data, following: next, followers: Math.max(0, (data.followers ?? 0) + (next ? 1 : -1)) });
        try {
            await apiRequest(`/api/hiq/umb/players/${category}/${playerUmbId}/follow`, { method: "PUT", body: { on: next } });
            if (next) toast({ title: t("umb.followOn") });   // 알림이 붙는다는 걸 여기서 한 번 알려 준다(설정의 '관심 선수' 칸으로 끌 수 있다)
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
    const continentTotal = continents.reduce((s, c) => s + c.points, 0) || 1;
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
    // 역대 최고 순위를 처음 찍은 시점 — 타일 라벨에 "25.7" 처럼 짧게
    const bestEntry = data ? history.find(h => h.rank === data.bestRank) : undefined;
    const bestAt = bestEntry ? (() => { const d = new Date(bestEntry.editionDate); return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}`; })() : null;
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

    // 성취 뱃지(금색) — 이름 옆 관심 선수 버튼과 한 줄에
    const badges: string[] = [];
    if (player?.rank === 1) badges.push(`🏆 ${t("umb.badgeWorldNo1")}`);
    else if (player && player.rank <= 10) badges.push(`⭐ TOP 10`);
    if (player?.nationalRank === 1 && player.rank !== 1) badges.push(`${flagEmoji(player.fed)} ${t("umb.badgeNationalNo1")}`);
    if (streak >= 3) badges.push(`🔥 ${t("umb.streakUp").replace("{n}", String(streak))}`);
    // 커리어 하이라이트(회색 칩) — 예전엔 '·' 로 이어 붙인 한 문장이라 답답했다
    const highlights: string[] = [];
    if (no1Weeks > 0) highlights.push(`👑 ${t("umb.no1Weeks").replace("{n}", String(no1Weeks))}`);
    if (showYearAgo && player) highlights.push(`📅 ${t("umb.yearAgo").replace("{from}", String(yearAgo!.rank)).replace("{to}", String(player.rank))}`);

    const TitleTag: any = standalone ? "h1" : DialogTitle;
    const DescTag: any = standalone ? "p" : DialogDescription;

    if (isLoading) {
        return <div className="py-16 text-center text-[13.5px] font-medium text-black/40">{t("umb.loading")}</div>;
    }
    if (!player) {
        return <div className="py-16 text-center text-[14px] font-semibold text-ink-3">{t("umb.empty")}</div>;
    }

    const rankSuffix = t("umb.rankSuffix");
    const visibleBreakdown = showAllPoints ? breakdown : breakdown.slice(0, POINTS_FOLD);
    const maxPts = breakdown[0]?.[1] || 1;

    return (
        // min-w-0·overflow-hidden 필수 — DialogContent(grid) 안에서 recharts가
        // 고유 폭으로 컬럼을 밀어내 시트 전체가 가로 스크롤되는 것을 막는다
        <div className="flex flex-col gap-7 min-w-0 max-w-full overflow-hidden">
            {/* 헤더: 이름 · 부제 · [관심 선수] [성취 뱃지…]. 시트에서는 오른쪽 위 닫기 버튼 자리를 비운다 */}
            <div className={cn(!standalone && "pr-9")}>
                <TitleTag className="text-[24px] font-bold text-ink-1 leading-tight flex items-center gap-2">
                    <span className="text-[26px] leading-none">{flagEmoji(player.fed)}</span>
                    {/* 한국어 화면 + 한글 이름 보유 시 한글 우선, 로마자는 부제로 병기 */}
                    <span className="min-w-0 truncate">{locale === "ko" && player.nativeName ? player.nativeName : player.playerName}</span>
                </TitleTag>
                <DescTag className="text-[12.5px] font-medium text-black/50 mt-1">
                    {locale === "ko" && player.nativeName ? `${player.playerName} · ` : player.nativeName ? `${player.nativeName} · ` : ""}
                    {age !== null ? `${t("umb.age").replace("{n}", String(age))} · ` : ""}
                    {t(`umb.cat${category === "players" ? "Players" : category === "ladies" ? "Ladies" : "Juniors"}`)}
                </DescTag>
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {/* 관심 선수(팔로우, 2026-09-13 오너). 순위 변동 알림이 여기 붙는다. 비로그인은 눌러도 안내만. */}
                    <button
                        type="button" onClick={() => { void toggleFollow(); }} disabled={followBusy} aria-pressed={!!data?.following}
                        className={cn(
                            "inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-bold transition-colors disabled:opacity-60",
                            data?.following ? "bg-brand text-brand-fg" : "bg-black/[0.05] text-ink-1 hover:bg-black/[0.08]",
                        )}
                    >
                        <span className="text-[14px] leading-none">{data?.following ? "♥" : "♡"}</span>
                        {t("umb.follow")}
                        {(data?.followers ?? 0) > 0 && <span className="tabular-nums opacity-70">· {data!.followers}</span>}
                    </button>
                    {/* 카드 공유 — 서버가 그린 정사각형 카드 PNG(/og/player/…)를 OS 공유 시트·다운로드로 */}
                    <PlayerCardShareButton
                        cardUrl={umbCardUrl(category, playerUmbId, locale)}
                        filename={`rankue-${playerUmbId}.png`}
                        title={locale === "ko" && player.nativeName ? player.nativeName : player.playerName}
                        text={`${locale === "ko" && player.nativeName ? player.nativeName : player.playerName} — ${t("umb.subtitle")} ${player.rank}${rankSuffix} · https://www.rankue.co.kr/player/${category}/${playerUmbId}`}
                    />
                    {badges.map(b => <Chip key={b} tone="gold">{b}</Chip>)}
                </div>
            </div>

            {/* 핵심 숫자: 초록 히어로(세계 순위·포인트) + 타일 3칸 + 하이라이트 칩 */}
            <div className="flex flex-col gap-2 -mt-3">
                <div className="rounded-2xl bg-brand text-brand-fg px-4 py-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[11.5px] font-semibold text-white/70 truncate">🌍 {t("umb.subtitle")}</div>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[38px] font-bold leading-none tabular-nums">
                                {player.rank}<span className="text-[17px] font-semibold ml-0.5">{rankSuffix}</span>
                            </span>
                            {weeklyMove !== null && weeklyMove !== 0 && (
                                <span className="h-6 px-2 rounded-full bg-white/20 text-[12px] font-bold tabular-nums inline-flex items-center">
                                    {weeklyMove > 0 ? `▲${weeklyMove}` : `▼${-weeklyMove}`}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-[26px] font-bold leading-none tabular-nums">{player.points}</div>
                        <div className="text-[11px] font-semibold text-white/70 mt-1.5">{t("umb.points")}</div>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <Tile emoji="🥇" value={`${data!.bestRank}${rankSuffix}`} label={bestAt ? `${t("umb.bestRank")} · ${bestAt}` : t("umb.bestRank")} />
                    <Tile emoji={flagEmoji(player.fed) || "🏠"} value={player.nationalRank ? `${player.nationalRank}${rankSuffix}` : "—"} label={t("umb.nationalRank")} />
                    <Tile emoji="🔟" value={t("umb.reignWeeks").replace("{n}", String(top10Weeks))} label={t("umb.top10Tile")} />
                </div>
                {highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {highlights.map(h => <Chip key={h}>{h}</Chip>)}
                    </div>
                )}
            </div>

            {/* 추이 차트 — 순위(기본)/포인트 토글 */}
            {chartData.length >= 2 && (
                <Section
                    emoji="📈" title={t("umb.rankHistory")}
                    meta={(
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
                    )}
                >
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
                                    formatter={(v: any) => [metric === "rank" ? `${v}${rankSuffix}` : `${v}${t("umb.pointsUnit")}`, ""]}
                                    labelFormatter={(l: any, payload: any) => payload?.[0]?.payload?.edition ? `Edition ${payload[0].payload.edition}` : l}
                                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, padding: "6px 10px" }}
                                />
                                <Line type="monotone" dataKey={metric} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BRAND }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Section>
            )}

            {/* 포인트 만료 예고(2026-09-13 오너 제안 1번) — UMB 공식 사이트도 안 보여 주는 정보. 문구는 언제나 '예상·무렵' */}
            {(data?.expiry?.length ?? 0) > 0 && (
                <Section emoji="⏳" title={t("umb.expiryTitle")} desc={t("umb.expiryDesc")}>
                    <List>
                        {data!.expiry!.map((e) => {
                            const d = new Date(e.expiresAround);
                            const ev = eventView(e.label, t, { short: true });
                            const delta = e.projectedRank - player.rank;
                            return (
                                <div key={e.colKey} className="flex items-center gap-3 px-3 py-2.5" title={e.label}>
                                    {/* 왼쪽: 빠지는 달(큰 글씨) + 연도 — 시간축이 한눈에 */}
                                    <div className="w-10 shrink-0 text-center">
                                        <div className="text-[13px] font-bold text-ink-1 leading-none">{d.toLocaleDateString(dateLocale, { month: "short" })}</div>
                                        <div className="text-[10px] font-semibold text-black/40 mt-1 tabular-nums">{d.getFullYear()}</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-ink-1 truncate"><span className="mr-1">{ev.emoji}</span>{ev.title}</div>
                                        <div className="text-[11px] font-medium text-black/45 truncate mt-0.5">
                                            {[ev.sub, t("umb.pointsAfter").replace("{n}", String(e.pointsAfter))].filter(Boolean).join(" · ")}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-[14px] font-bold tabular-nums text-red-500 leading-none">−{e.points}</div>
                                        <div className={cn("text-[11px] font-semibold tabular-nums mt-1", delta > 0 ? "text-red-500" : "text-black/45")}>
                                            {t("umb.expiryProjected").replace("{r}", String(e.projectedRank))}{delta > 0 ? ` ▼${delta}` : ""}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </List>
                </Section>
            )}

            {/* 국내 순위(2026-09-13 오너): "한국 330명 중 3위" 맥락 + 상위 5명(메달) + 가까운 순위. 탭하면 그 선수로 이동 */}
            {national && national.top.length > 0 && (
                <Section
                    emoji={flagEmoji(player.fed) || "🏠"} title={t("umb.national")}
                    meta={player.nationalRank
                        ? t("umb.nationalOf").replace("{fed}", regionNameOf(player.fed, locale)).replace("{n}", String(national.fedCount)).replace("{r}", String(player.nationalRank))
                        : undefined}
                >
                    <List>
                        {national.top.map((r, i) => (
                            <PersonRow
                                key={r.playerUmbId} t={t}
                                pos={MEDALS[i] ?? String(i + 1)}
                                name={locale === "ko" && r.nativeName ? r.nativeName : r.playerName}
                                rank={r.rank} points={r.points}
                                me={r.playerUmbId === player.playerUmbId}
                                onClick={onNavigate ? () => onNavigate(r.playerUmbId) : undefined}
                            />
                        ))}
                    </List>
                    {nearby.length > 0 && (
                        <>
                            <p className="text-[11px] font-semibold text-black/40 mt-3 mb-1.5 px-0.5">↕ {t("umb.nearby")}</p>
                            <List>
                                {nearby.map(r => (
                                    <PersonRow
                                        key={r.playerUmbId} t={t}
                                        name={locale === "ko" && r.nativeName ? r.nativeName : r.playerName}
                                        rank={r.rank} points={r.points}
                                        onClick={onNavigate ? () => onNavigate(r.playerUmbId) : undefined}
                                    />
                                ))}
                            </List>
                        </>
                    )}
                </Section>
            )}

            {/* PBA 통산 기록(2026-09-13 오너): UMB 랭킹에는 없는 진짜 경기 수치 — 교차 매칭된 선수(167명)에게만 */}
            {pba && (
                <Section emoji="🎱" title={t("umb.pbaTitle").replace("{league}", pba.league)} meta={<span className="font-medium text-black/35">{t("umb.pbaSource")}</span>}>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: t("umb.pbaAverage"), value: pba.average !== null ? pba.average.toFixed(3) : "—", accent: true },
                            { label: t("umb.pbaHighRun"), value: pba.highRun !== null ? String(pba.highRun) : "—" },
                            { label: t("umb.pbaBank"), value: pba.bankShotRate !== null ? `${pba.bankShotRate.toFixed(1)}%` : "—" },
                            { label: t("umb.pbaRecord"), value: pba.win !== null && pba.lose !== null ? `${pba.win}-${pba.lose}${pba.draw ? `-${pba.draw}` : ""}` : "—" },
                            { label: t("umb.pbaPrize"), value: pba.careerPrize ? formatPrize(pba.careerPrize, locale) : "—" },
                        ].map((c) => (
                            <div key={c.label} className="rounded-2xl bg-black/[0.03] px-2 py-3 text-center min-w-0">
                                <div className={cn("text-[17px] font-bold tabular-nums leading-none", c.accent ? "text-brand" : "text-ink-1")}>{c.value}</div>
                                <div className="text-[10.5px] font-semibold text-black/45 mt-1.5 truncate">{c.label}</div>
                            </div>
                        ))}
                    </div>
                    {pba.season && (
                        <div className="mt-2">
                            <Chip tone="brand">📅 {t("umb.pbaSeason")
                                .replace("{season}", String(pba.season.season)).replace("{next}", String((pba.season.season + 1) % 100).padStart(2, "0"))
                                .replace("{r}", pba.season.prizeRank ? String(pba.season.prizeRank) : "—")
                                .replace("{p}", pba.season.pointRank ? String(pba.season.pointRank) : "—")}</Chip>
                        </div>
                    )}
                </Section>
            )}

            {/* 포인트 구성 — 대륙 비중 막대 + 대회별 획득 점수(레전드 매핑) */}
            {breakdown.length > 0 && (
                <Section emoji="🌍" title={t("umb.pointsBreakdown")} meta={<span className="tabular-nums">{t("umb.contEvents").replace("{n}", String(breakdown.length))}</span>}>
                    {/* 어디서 점수를 버나 — 대회 이름의 연맹 약자로 대륙을 가른다(2026-09-13 오너 제안). 칩 나열 대신 비중 막대 */}
                    {continents.length > 1 && (
                        <div className="mb-3">
                            <div className="h-2.5 rounded-full overflow-hidden flex gap-[2px] bg-black/[0.04]">
                                {continents.map((c, i) => (
                                    <div key={c.continent} className={cn("h-full", RAMP[i % RAMP.length])} style={{ width: `${(c.points / continentTotal) * 100}%` }} />
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                {continents.map((c, i) => (
                                    <span key={c.continent} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2 min-w-0 truncate">
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", RAMP[i % RAMP.length])} />
                                        {t(`umb.cont.${c.continent}`)}
                                        <span className="font-bold tabular-nums text-ink-1">{c.points}</span>
                                        {/* 대회 수는 2개 이상일 때만 — "1개 대회"는 기본값이라 소음이고, 2열 격자에서 "아프리카·중동" 줄이 잘렸다(실측) */}
                                        {c.events > 1 && <span className="font-medium text-black/40">· {t("umb.contEvents").replace("{n}", String(c.events))}</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <List>
                        {visibleBreakdown.map(([colKey, pts], idx) => {
                            const label = eventLabels.get(colKey) || `${t("umb.event")} ${colKey}`;
                            const ev = eventView(label, t);
                            return (
                                <div key={colKey} className="flex items-center gap-3 px-3 py-2.5" title={label}>
                                    <span className="w-6 shrink-0 text-center text-[18px] leading-none">{ev.emoji}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[13px] font-semibold text-ink-1 truncate">{ev.title}</span>
                                            {idx === 0 && pts > 0 && breakdown.length > 1 && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/10 text-[10px] font-bold text-brand leading-none">{t("umb.mainEvent")}</span>
                                            )}
                                        </div>
                                        {ev.sub && <div className="text-[11px] font-medium text-black/45 truncate mt-0.5">{ev.sub}</div>}
                                        {pts > 0 && (
                                            <div className="mt-1.5 h-1 rounded-full bg-black/[0.06] overflow-hidden">
                                                <div className="h-full rounded-full bg-brand/60" style={{ width: `${Math.max(6, (pts / maxPts) * 100)}%` }} />
                                            </div>
                                        )}
                                    </div>
                                    <span className={cn("shrink-0 text-[14px] font-bold tabular-nums", pts < 0 ? "text-red-500" : "text-brand")}>{pts > 0 ? `+${pts}` : pts}</span>
                                </div>
                            );
                        })}
                        {breakdown.length > POINTS_FOLD && (
                            <button
                                type="button" onClick={() => setShowAllPoints((v) => !v)}
                                className="w-full h-11 text-[12.5px] font-semibold text-brand hover:bg-black/[0.03] transition-colors"
                            >
                                {showAllPoints ? `${t("umb.showLess")} ▲` : `${t("umb.showMore").replace("{n}", String(breakdown.length - POINTS_FOLD))} ▼`}
                            </button>
                        )}
                        {player.penaltyPoints > 0 && (
                            <div className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-[12.5px] font-medium text-ink-2">⚠️ {t("umb.penalty")}</span>
                                <span className="text-[13px] font-bold tabular-nums text-black/45">{player.penaltyPoints}</span>
                            </div>
                        )}
                    </List>
                </Section>
            )}

            {/* 대회 이력 표(2026-09-13 오너 제안 4번, 9/14 구현) — 같은 대회의 연도별 포인트. 열 = 연도, 줄 = 대회.
                "포인트 구성"이 최신 회차 스냅샷이라면 이건 그걸 시간축으로 이어 붙인 것: 방어할 점수와 성장이 한눈에 */}
            {(data?.eventHistory?.rows.length ?? 0) > 0 && (() => {
                const eh = data!.eventHistory!;
                const strongest = eh.rows.find((r) => r.key === eh.strongest);
                const improved = eh.rows.find((r) => r.key === eh.mostImproved);
                const visible = showAllEvHist ? eh.rows : eh.rows.slice(0, EVHIST_FOLD);
                const gridCols = `minmax(0,1fr) repeat(${eh.years.length}, 58px)`;
                return (
                    <Section emoji="📅" title={t("umb.evHist.title")} desc={t("umb.evHist.desc")}
                        meta={<span className="tabular-nums">{t("umb.contEvents").replace("{n}", String(eh.rows.length))}</span>}>
                        {(strongest || improved) && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {strongest && <Chip tone="gold">🏆 {t("umb.evHist.strongest")} · {eventView(strongest.label, t, { short: true }).title} {strongest.latest}</Chip>}
                                {improved && improved.key !== strongest?.key && <Chip tone="brand">📈 {t("umb.evHist.improved")} · {eventView(improved.label, t, { short: true }).title} ▲{improved.delta}</Chip>}
                                {improved && improved.key === strongest?.key && <Chip tone="brand">📈 ▲{improved.delta}</Chip>}
                            </div>
                        )}
                        <div className="rounded-2xl bg-surface-3 overflow-x-auto">
                            <div className="min-w-[280px]">
                                {/* 머리글 — 대회 · 연도 열 */}
                                <div className="grid items-center px-3 h-9 text-[11px] font-bold text-black/40 border-b border-surface-line" style={{ gridTemplateColumns: gridCols }}>
                                    <span>{t("umb.evHist.eventCol")}</span>
                                    {eh.years.map((y) => <span key={y} className="text-right tabular-nums">{y.length > 5 ? y.slice(2) : y}</span>)}
                                </div>
                                <div className="divide-y divide-surface-line">
                                    {visible.map((r) => {
                                        const ev = eventView(r.label, t, { short: true });
                                        const byYear = new Map(r.cells.map((c) => [c.year, c]));
                                        return (
                                            <div key={r.key} className="grid items-center px-3 py-2.5" style={{ gridTemplateColumns: gridCols }} title={r.label}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-5 shrink-0 text-center text-[16px] leading-none">{ev.emoji}</span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="text-[12.5px] font-semibold text-ink-1 truncate">{ev.title}</span>
                                                            {r.key === eh.strongest && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#F5B721]/15 text-[9.5px] font-bold text-[#8a6a0a] leading-none">{t("umb.mainEvent")}</span>}
                                                        </div>
                                                        {r.org && <div className="text-[10.5px] font-medium text-black/40 truncate mt-0.5">{r.org}</div>}
                                                    </div>
                                                </div>
                                                {eh.years.map((y, i) => {
                                                    const c = byYear.get(y);
                                                    const prevC = i > 0 ? byYear.get(eh.years[i - 1]) : undefined;
                                                    const d = c && prevC ? c.points - prevC.points : null;
                                                    return (
                                                        <div key={y} className="text-right tabular-nums leading-none">
                                                            {c ? (
                                                                <>
                                                                    <div className={cn("text-[13.5px] font-bold", i === eh.years.length - 1 ? "text-ink-1" : "text-ink-2")}>{c.points}</div>
                                                                    {d !== null && d !== 0 && (
                                                                        <div className={cn("text-[10px] font-bold mt-1", d > 0 ? "text-brand" : "text-[#c0392b]")}>{d > 0 ? `▲${d}` : `▼${-d}`}</div>
                                                                    )}
                                                                </>
                                                            ) : <div className="text-[13px] font-medium text-black/20">·</div>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                                {eh.rows.length > EVHIST_FOLD && (
                                    <button
                                        type="button" onClick={() => setShowAllEvHist((v) => !v)}
                                        className="w-full h-11 text-[12.5px] font-semibold text-brand hover:bg-black/[0.03] transition-colors border-t border-surface-line"
                                    >
                                        {showAllEvHist ? `${t("umb.showLess")} ▲` : `${t("umb.evHist.rowsMore").replace("{n}", String(eh.rows.length - EVHIST_FOLD))} ▼`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </Section>
                );
            })()}

            {/* 응원글(2026-09-13 오너 제안 11번) — 맨 아래. 커뮤니티 댓글과 같은 안전장치 */}
            <PlayerCheers category={category} playerUmbId={playerUmbId} />

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
