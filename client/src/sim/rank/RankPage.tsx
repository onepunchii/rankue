/**
 * 온라인 대전 랭킹(2026-09-08 오너: "랭킹제 · 국가별 · 랭커 게임처럼"). `/online-game?rank=1`.
 * 위: 종목·테이블 칩 → 범위(전체 / 내 나라 / 나라 고르기) → 내 카드(티어 배지·레이팅·전역 순위·국가 순위·전적, 배치 전엔 "배치 중 n/3") → 순위 목록.
 * 내 나라가 없으면 기기 언어의 지역으로 한 번 저장하고(PATCH /me), 카드의 "내 나라 바꾸기"로 고친다. 값은 온라인 대전 Elo 뿐 — 실전 RP 와 무관.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { rankStatus, tierFor, TIERS, PLACEMENT_MATCHES, type Tier } from "@shared/sim/rank";
import { RankBoard } from "./RankBoard";
import { GameBalls } from "./GameBalls";
import type { DashGameType, DashTableId } from "../dash/dashApi";
import { gameLabel } from "../match/matchView";
import { COUNTRY_OPTIONS, countryName, guessCountry, isCountryCode } from "./country";
import { rankFlag } from "./flag";
import { rankApi as defaultApi, RANK_QUERY_KEY, type RankApi, type RankRow } from "./rankApi";

export interface RankPageProps {
    onClose: () => void;
    api?: RankApi;
    /** 처음 보여줄 종목·테이블 */
    initial?: { gameType: DashGameType; tableId: DashTableId };
}

const COMBOS: readonly { gameType: DashGameType; tableId: DashTableId }[] = [
    { gameType: "3c", tableId: "DAEDAE" }, { gameType: "3c", tableId: "JUNGDAE_KR" }, { gameType: "4c", tableId: "DAEDAE" }, { gameType: "4c", tableId: "JUNGDAE_KR" },
];
const pill = "h-10 px-3.5 shrink-0 inline-flex items-center rounded-pill border text-[13px] font-bold";
const chipOn = "border-transparent bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)]";
const chipOff = "border-white/15 bg-white/[0.08] text-white/85 active:bg-white/15";

/** 티어 배지: 방패 모양(단색) + 이름. 마스터만 gold, 골드~다이아는 brand, 그 아래는 잉크. */
export function TierBadge({ tier, size = "md" }: { tier: Tier | null; size?: "sm" | "md" }) {
    const { t } = useT();
    const tone = !tier ? "bg-surface-3 text-ink-3" : tier.id === "master" ? "text-gold" : tier.id === "gold" || tier.id === "platinum" || tier.id === "diamond" ? "bg-brand/[0.1] text-brand" : "bg-surface-3 text-ink-2";
    const style = tier?.id === "master" ? { backgroundColor: "var(--gold-soft)" } : undefined;
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-pill font-bold", size === "sm" ? "h-6 px-2 text-[11px]" : "h-8 px-3 text-[13px]", tone)} style={style}>
            <svg width={size === "sm" ? 11 : 14} height={size === "sm" ? 12 : 16} viewBox="0 0 14 16" aria-hidden="true">
                <path d="M7 1 12.5 3v5c0 3.4-2.3 5.9-5.5 7C3.8 13.9 1.5 11.4 1.5 8V3Z" fill="currentColor" opacity={tier ? 1 : 0.35} />
            </svg>
            {tier ? t(tier.nameKey) : t("sim.rank.unrankedShort")}
        </span>
    );
}

function Row({ r, me, locale }: { r: RankRow; me: boolean; locale: string }) {
    const { t } = useT();
    return (
        <li className={cn("rounded-tile border bg-surface-1 px-4 py-3 flex items-center gap-3", me ? "border-brand" : "border-surface-line")} aria-current={me ? "true" : undefined}>
            <span className="rk-num w-8 shrink-0 text-[16px] font-bold text-ink-1 text-center">{r.rank}</span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{r.name}</span>
                    {r.country && <span className="rk-chip bg-surface-3 text-ink-3 text-[10px]" title={countryName(r.country, locale)}>{r.country}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                    <TierBadge tier={tierFor(r.rating)} size="sm" />
                    <span className="rk-num text-[11px] font-medium text-ink-3">{t("sim.entry.record").replace("{w}", String(r.wins)).replace("{l}", String(r.matches - r.wins))}</span>
                </span>
            </span>
            <span className="rk-num text-[18px] font-bold text-ink-1 shrink-0">{r.rating}</span>
        </li>
    );
}

export function RankPage({ onClose, api = defaultApi, initial }: RankPageProps) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const qc = useQueryClient();
    const [combo, setCombo] = useState(initial ?? COMBOS[0]);
    // 첫 화면은 사람이 있는 곳으로: 내가 가장 많이 친 조합 → 없으면 등재자가 가장 많은 조합(2026-09-09 오너).
    // 링크로 조합을 지정해 들어왔거나(initial) 사용자가 한 번이라도 고른 뒤에는 건드리지 않는다.
    const pickedRef = useRef(!!initial);
    const [scope, setScope] = useState<"all" | "mine" | "pick">("all");
    const [picked, setPicked] = useState<string>("");
    const myCountry = member?.country && isCountryCode(member.country) ? member.country : null;
    const country = scope === "all" ? null : scope === "mine" ? myCountry : picked || null;
    const q = useQuery({
        queryKey: [...RANK_QUERY_KEY, combo.gameType, combo.tableId, country ?? "all"],
        queryFn: () => api.getLadder({ gameType: combo.gameType, tableId: combo.tableId, country }),
        staleTime: 15_000,
    });

    // 내 나라가 비어 있으면 기기 언어의 지역으로 한 번 저장한다
    const [guessed, setGuessed] = useState(false);
    useEffect(() => {
        if (!member || myCountry || guessed) return;
        setGuessed(true);
        const g = guessCountry();
        if (!g) return;
        api.setCountry(g).then(() => { void qc.invalidateQueries({ queryKey: ["/api/hiq/me"] }); void qc.invalidateQueries({ queryKey: RANK_QUERY_KEY }); }, () => undefined);
    }, [member, myCountry, guessed, api, qc]);

    const changeCountry = async (code: string) => {
        if (!isCountryCode(code)) return;
        try {
            await api.setCountry(code);
            void qc.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            void qc.invalidateQueries({ queryKey: RANK_QUERY_KEY });
        } catch { /* 다음에 다시 */ }
    };

    const data = q.data;
    useEffect(() => {
        if (pickedRef.current || !data || (data.combos ?? []).length === 0) return;
        const best = [...(data.combos ?? [])].sort((a, b) => b.myMatches - a.myMatches || b.ranked - a.ranked)[0];
        if (!best || (best.myMatches === 0 && best.ranked === 0)) return;
        pickedRef.current = true;
        if (best.gameType !== combo.gameType || best.tableId !== combo.tableId) setCombo({ gameType: best.gameType, tableId: best.tableId });
    }, [data, combo.gameType, combo.tableId]);
    const status = data ? rankStatus(data.me.rating, data.me.matches) : null;
    const options = useMemo(() => {
        const set = new Set<string>(COUNTRY_OPTIONS);
        for (const c of data?.countries ?? []) if (c.country) set.add(c.country);
        return [...set].map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
    }, [data, locale]);
    const n = (v: number) => String(v);

    return (
        <div className="rank-arcade w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-black text-white leading-tight">{t("sim.rank.title")}</h1>
                    <p className="text-[12.5px] font-medium text-white/60 mt-0.5">{t("sim.rank.sub").replace("{n}", n(PLACEMENT_MATCHES))}</p>
                </div>
                <button type="button" onClick={onClose} className="h-11 px-4 shrink-0 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2 active:bg-surface-3">
                    {t("sim.common.close")}
                </button>
            </div>

            <div role="group" aria-label={t("sim.dash.filterAria")} className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 mb-1.5">
                {(["3c", "4c"] as const).map((g) => {
                    const sel = combo.gameType === g;
                    const ranked = (data?.combos ?? []).filter((c) => c.gameType === g).reduce((a, c) => a + c.ranked, 0);
                    return (
                        <button
                            key={g} type="button" aria-pressed={sel} onClick={() => { pickedRef.current = true; setCombo({ ...combo, gameType: g }); }}
                            aria-label={t(g === "3c" ? "sim.setup.type3c" : "sim.setup.type4c")}
                            className={cn(pill, "gap-2", sel ? chipOn : chipOff)}
                        >
                            <GameBalls gameType={g} />
                            {ranked > 0 && <span className="rk-num text-[11px] font-bold opacity-70">{t("sim.rank.rankedCount").replace("{n}", String(ranked))}</span>}
                        </button>
                    );
                })}
                {/* 대대·중대는 작은 토글 하나로(칩 넷은 많다 — 2026-09-09 오너). 점수는 테이블별로 따로 쌓이므로 합치지 않는다. */}
                <div role="group" aria-label={t("sim.rank.tableAria")} className="shrink-0 inline-flex rounded-pill border border-white/15 bg-white/[0.08] p-0.5">
                    {(["DAEDAE", "JUNGDAE_KR"] as const).map((tb) => {
                        const sel = combo.tableId === tb;
                        return (
                            <button
                                key={tb} type="button" aria-pressed={sel} onClick={() => { pickedRef.current = true; setCombo({ ...combo, tableId: tb }); }}
                                className={cn(
                                    "h-9 px-3 rounded-pill text-[12px] font-bold",
                                    sel ? "bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)]" : "text-white/70",
                                )}
                            >
                                {tb === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae")}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div role="group" aria-label={t("sim.rank.scopeAria")} className="flex items-center gap-1.5 flex-wrap mb-3">
                <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")} className={cn(pill, scope === "all" ? chipOn : chipOff)}>{t("sim.rank.scopeAll")}</button>
                <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")} disabled={!myCountry} className={cn(pill, scope === "mine" ? chipOn : chipOff, !myCountry && "opacity-40")}>
                    {myCountry ? t("sim.rank.scopeMine").replace("{c}", myCountry) : t("sim.rank.countryUnset")}
                </button>
                <label className={cn(pill, scope === "pick" ? chipOn : chipOff, "gap-1.5 cursor-pointer")}>
                    <span>{t("sim.rank.scopePick")}</span>
                    <select
                        aria-label={t("sim.rank.scopePick")} value={picked} onChange={(e) => { setPicked(e.target.value); setScope("pick"); }}
                        className="bg-transparent text-inherit text-[13px] font-semibold outline-none max-w-[110px]"
                    >
                        <option value="">–</option>
                        {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                    </select>
                </label>
            </div>

            {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.rank.loading")}</p>}
            {q.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.rank.failed")}</p>
                    <button type="button" onClick={() => { void q.refetch(); }} className={cn(pill, chipOff)}>{t("sim.match.retry")}</button>
                </div>
            )}

            {data && status && (
                <div className={cn("flex flex-col gap-3", q.isFetching && "opacity-80")}>
                    <section className="arc-board rounded-[22px] p-4" aria-label={t("sim.rank.myTitle")} data-testid="rank-me">
                        <div className="flex items-center justify-between gap-2">
                            <TierBadge tier={status.tier} />
                            <span className="rk-num text-[12px] font-bold text-white/80">{t("sim.entry.record").replace("{w}", n(data.me.wins)).replace("{l}", n(data.me.matches - data.me.wins))}</span>
                        </div>
                        <div className="flex items-baseline gap-3 mt-2 flex-wrap">
                            <span className="text-[44px] font-black text-white leading-none tracking-tight" data-rating>{data.me.rating}</span>
                            <span className="rk-num text-[13px] font-bold text-white/85">
                                {status.placed && data.me.rank !== null
                                    ? t("sim.rank.rankOf").replace("{r}", n(data.me.rank)).replace("{n}", n(data.total))
                                    : t("sim.rank.unranked").replace("{n}", n(data.me.matches)).replace("{m}", n(PLACEMENT_MATCHES))}
                            </span>
                        </div>
                        <p className="rk-num text-[12.5px] font-bold text-white/75 mt-2">
                            {!status.placed
                                ? t("sim.rank.placementHint").replace("{n}", n(status.placementLeft))
                                : status.toNext !== null
                                    ? t("sim.rank.nextTier").replace("{tier}", t(tierFor(data.me.rating + status.toNext).nameKey)).replace("{n}", n(status.toNext))
                                    : t("sim.rank.topTier")}
                            {status.placed && myCountry && data.me.countryRank !== null && ` · ${t("sim.rank.countryRankOf").replace("{c}", myCountry).replace("{r}", n(data.me.countryRank))}`}
                        </p>
                        {/* 티어 사다리(2026-09-09 오너: 재미 = 다음 목표가 보이는 것). 지금 티어에 표시, 다음 티어까지 몇 점인지 막대로. */}
                        {status.placed && (
                            <div className="mt-3" aria-label={t("sim.rank.ladder")}>
                                <div className="flex items-center gap-1">
                                    {TIERS.map((tier) => {
                                        const cur = status.tier?.id === tier.id;
                                        const passed = data.me.rating >= tier.min;
                                        return (
                                            <span
                                                key={tier.id} title={t(tier.nameKey)}
                                                className={cn(
                                                    "flex-1 h-1.5 rounded-pill",
                                                    cur ? "bg-[color:var(--arc-frame)]" : passed ? "bg-white/70" : "bg-white/20",
                                                )}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] font-black text-white">{status.tier ? t(status.tier.nameKey) : ""}</span>
                                    {status.toNext !== null && (
                                        <span className="rk-num text-[11px] font-bold text-white/75">
                                            {t("sim.rank.toNext")
                                                .replace("{tier}", t(tierFor(data.me.rating + status.toNext).nameKey))
                                                .replace("{n}", n(status.toNext))}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        <label className="mt-3 flex items-center justify-between gap-2 text-[12px] font-bold text-white/75">
                            <span>{myCountry ? `${rankFlag(myCountry) || ""} ${countryName(myCountry, locale)}` : t("sim.rank.countryChange")}</span>
                            <select
                                aria-label={t("sim.rank.countryChange")} value={myCountry ?? ""} onChange={(e) => { void changeCountry(e.target.value); }}
                                className="h-9 rounded-lg border border-white/25 bg-white/15 px-2 text-[12px] font-bold text-white max-w-[150px]"
                            >
                                <option value="">–</option>
                                {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                            </select>
                        </label>
                    </section>

                    {/* 순위 목록은 게임 리더보드 형태(2026-09-09 오너: 랭킹 페이지만 디자인 규칙 해제) */}
                    {data.rows.length === 0 ? (
                        <section className="rounded-card bg-surface-1 border border-surface-line rk-shadow p-4">
                            <p className="text-[15px] font-bold text-ink-1">{t("sim.rank.empty")}</p>
                            <p className="text-[13px] font-medium text-ink-3 mt-1">{t("sim.rank.emptyDesc").replace("{n}", n(PLACEMENT_MATCHES))}</p>
                        </section>
                    ) : (
                        <RankBoard rows={data.rows} myMemberId={member?.id} locale={locale} />
                    )}
                </div>
            )}
        </div>
    );
}

export default RankPage;
