/**
 * 홈 '내 실력'(2026-10-24 오너: "내 실전 기록과 온라인 실력 표를 한 카드에" → 시안 ① "좋네 진행") — 홈 시안 B(?home=b)의 맨 위.
 * 실전(당구장 · 공식 경기)과 온라인(폰 당구대 · 레이팅 대전)을 나란히 두고, 닮은 프로 한 명과 실전 | 온라인 | 프로를 한 표로 견준다.
 * 예전엔 '내 실전 기록'(RealHandicapCard) · '내 온라인 실력'(LookalikeProCard) 두 장에 닮은 프로가 둘, 점수판 카드에 내 다마가 또 있었다.
 *
 * 배지 모양은 섞지 않는다: 둥근 메달 = 실전 다마(RealMedal) · 방패 = 온라인 등급(TierEmblem) · 육각 = 온라인 다마(OnlineDamaBadge).
 * 온라인 칸은 고른 종목(3쿠션 · 4구)에 대전이 없으면 '대전 n판이면 등급' — 다른 종목의 등급을 끌어오지 않는다.
 * 닮은 프로는 3쿠션만(프로 기록이 3쿠션뿐) — 실전이 준비됐으면 실전 기준, 아니면 온라인 기준.
 * 비로그인은 실전 칸만 예시(shared/guestSample — "예시" 표시), 온라인 칸은 예시 숫자를 만들지 않고 시작을 권한다.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LookalikeResponse, RealCompareResponse } from "@shared/proCompare";
import type { GuestSampleBilliards } from "@shared/guestSample";
import { realTierFor } from "@shared/realTier";
import { RealMedal, REAL_TIER_INK } from "@/components/hiq/RealMedal";
import { BadgeTap } from "@/components/hiq/BadgeGuideSheet";
import { SampleBadge, useGuestGate } from "@/components/hiq/GuestGate";
import { FormDots, ProAvatar, fill, proName } from "@/components/hiq/compare/lookalikeUi";
import { TIER_GLOW, TierEmblem } from "@/sim/rank/TierEmblem";
import { OnlineDamaBadge } from "@/sim/entry/OnlineDamaBadge";
import { useOnlineRecord } from "@/sim/entry/useOnlineRecord";
import { hubStateOf, type HubState } from "@/sim/rank/hubState";
import { HANDICAP_QUERY_KEY } from "@/sim/entry/HandicapCard";
import { matchApi } from "@/sim/matchApi";

type HistoryRow = { sportCategory?: string | null; gameMode?: string | null; isRanked?: boolean | null; gameType?: string | null; isWinner?: boolean | null };
const ROOMS_URL = "/online-game?rooms=1";

export function HomeSkillCard({ onStartMatch, history, sample, getPercentile, onOpenRpGuide }: {
    onStartMatch: () => void;
    history?: HistoryRow[];
    sample?: GuestSampleBilliards | null;
    /** 상위 % (홈이 랭킹 목록으로 계산 — 모집단을 모르면 null) */
    getPercentile?: (type: "3c" | "4c") => number | null;
    /** RP 옆 ⓘ — 랭킹 점수 안내 창 */
    onOpenRpGuide?: () => void;
}) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const gate = useGuestGate();
    const real = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    const look = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    const hc = useQuery({ queryKey: HANDICAP_QUERY_KEY, queryFn: () => matchApi.getMyHandicap(), enabled: !!member, staleTime: 60_000 });
    const { boards, placement } = useOnlineRecord();
    const data = sample ? sample.real : real.data;
    const me = sample ? sample.member : member;
    const games: HistoryRow[] = (sample ? sample.history : history) ?? [];
    const [tab, setTab] = useState<"3c" | "4c" | null>(null);
    useEffect(() => { if (data && tab === null) setTab(data.preferred); }, [data, tab]);
    if (!me) return null;
    const cur: "3c" | "4c" = tab ?? data?.preferred ?? "3c";

    // ── 실전 칸
    const side = data?.[cur];
    const ready = !!(side?.ready && side.handi);
    const tier = ready ? realTierFor(side!.handi, cur) : null;
    const ink = tier ? REAL_TIER_INK[tier.id] : undefined;
    const rating = (cur === "3c" ? (me as { rating3c?: number | null }).rating3c : (me as { rating4c?: number | null }).rating4c) ?? 0;
    const mine = (Array.isArray(games) ? games : []).filter((g) => g.sportCategory === "BILLIARDS" && g.gameMode === "match" && g.isRanked && g.gameType === cur);
    const wins = mine.filter((g) => g.isWinner).length;
    // 예시의 상위 % 는 예시 랭킹 다섯 줄 안에서 센 값이다(카드의 "예시" 표시 아래에서만 쓴다)
    const pct = sample ? sample.percentile[cur] : getPercentile?.(cur) ?? null;

    // ── 온라인 칸 — 고른 종목에 대전이 있을 때만 그 종목의 등급
    const playedHere = !sample && boards.some((b) => b.gameType === cur && b.matches > 0);
    const s: HubState = playedHere ? hubStateOf(boards, placement, cur) : { kind: "fresh", canSwap: false };
    const handi = (Array.isArray(hc.data?.boards) ? hc.data!.boards : []).find((b) => b.gameType === cur);
    const onlineDama = !sample ? handi?.target ?? null : null;
    const lk = !sample && cur === "3c" ? look.data : undefined;

    // ── 닮은 프로(3쿠션만) — 실전이 준비됐으면 실전 기준, 아니면 온라인 기준
    const realPro = cur === "3c" && ready ? side?.pro ?? null : null;
    const onlinePro = cur === "3c" && lk?.ready ? lk.pro : null;
    const pro = realPro ?? onlinePro;
    const proSrc = realPro ? "real" : "online";

    const goOnline = (to: string) => gate.guard(() => setLocation(to), { title: t("guestHome.gateHubTitle"), desc: t("guestHome.gateHubDesc").replace("{n}", String(placement)), from: to });
    const openHistory = sample ? undefined : () => setLocation("/history");
    const rankUrl = `/online-game?rank=1&g=${cur}&s=all`;
    const num = (v: number | null | undefined, d = 2) => (typeof v === "number" ? v.toFixed(d) : "—");
    const cell = "py-2.5 text-center text-[15px] font-bold rk-num";

    const tabs = (
        <div className="inline-flex p-[3px] rounded-full bg-surface-3 shrink-0" role="tablist">
            {(["3c", "4c"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={cur === k} onClick={() => setTab(k)}
                    className={cn("h-7 px-3 rounded-full text-[12.5px] font-bold transition-colors", cur === k ? "bg-surface-1 text-ink-1 shadow-sm" : "text-ink-3")}>
                    {k === "3c" ? t("real.tab3c") : t("real.tab4c")}
                </button>
            ))}
        </div>
    );

    return (
        <section className="rk-card rounded-3xl p-4" data-testid="home-skill">
            <div className={cn("flex items-center justify-between gap-2", sample && "flex-wrap")}>
                <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="text-[15px] font-bold text-ink-1 truncate">🎱 {t("home.skillTitle")}</h3>
                    {sample && <SampleBadge />}
                </div>
                {tabs}
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                {/* 실전 — 당구장 공식 경기 */}
                <div className="rounded-2xl bg-[#F4F7F2] p-3 min-w-0" data-testid="home-skill-real">
                    <p className="text-[11.5px] font-bold tracking-wide text-[#1F6B47] truncate">{t("home.skillReal")}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                        <BadgeTap guide={{ kind: "real", game: cur, handi: ready ? side!.handi : null }}>
                            <RealMedal game={cur} handi={ready ? side!.handi : null} size={50} />
                        </BadgeTap>
                        <div className="min-w-0">
                            <p className="text-[15px] font-black leading-tight truncate" style={ink ? { color: ink } : undefined}>{tier ? t(tier.nameKey) : t("real.tierNone")}</p>
                            <p className="text-[12px] font-semibold text-ink-3 rk-num truncate">
                                {ready ? fill(t("home.skillDama"), { n: side!.handi! }) : side ? fill(t("home.damaNeed"), { n: Math.max(1, side.needed - side.games) }) : " "}
                            </p>
                        </div>
                    </div>
                    <span className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-[20px] font-black rk-num leading-none">{rating}<span className="ml-0.5 text-[11px] font-bold text-brand">RP</span></span>
                        {onOpenRpGuide && <button type="button" onClick={onOpenRpGuide} aria-label={t("real.stripRp")} data-testid="home-skill-rp-guide" className="h-5 w-5 rounded-full border border-ink-4/50 text-[11px] font-bold leading-none text-ink-3">?</button>}
                        {pct ? <span className="ml-auto text-[11.5px] font-bold text-brand rk-num">{fill(t("real.stripTop"), { n: pct })}</span> : null}
                    </span>
                    <button type="button" onClick={openHistory} disabled={!openHistory} className="block w-full text-left disabled:cursor-default">
                        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-3 rk-num">
                            {t("sim.entry.record").replace("{w}", String(wins)).replace("{l}", String(mine.length - wins))}
                            <FormDots results={mine.slice(0, 5).map((g) => (g.isWinner ? "W" : "L"))} />
                        </span>
                    </button>
                </div>

                {/* 온라인 — 폰 당구대 레이팅 대전 */}
                <button type="button" onClick={() => goOnline(s.kind === "ranked" ? rankUrl : ROOMS_URL)} className="rounded-2xl bg-[#121722] p-3 text-left text-white min-w-0" data-testid="home-skill-online" data-track-as="홈 내 실력 온라인">
                    <span className="block text-[11.5px] font-bold tracking-wide text-[#7FD8E8] truncate">{t("home.skillOnline")}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                        {/* 배지를 누르면 배지 안내(겉의 단추와 따로 — BadgeTap 이 눌림을 막는다) */}
                        <BadgeTap guide={s.kind === "ranked" ? { kind: "online", tier: s.tier.id, rating: s.rating } : { kind: "online", tier: null }}>
                            {s.kind === "ranked" ? <TierEmblem tier={s.tier.id} size={50} glow /> : <TierEmblem tier="iron" size={50} locked />}
                        </BadgeTap>
                        <span className="min-w-0">
                            {/* 등급 이름은 한 줄, 배치 중 · 시작 권유 글은 길어서 두 줄까지(잘리면 뜻이 안 보였다 — 시안 화면 확인) */}
                            <span className={cn("block font-black", s.kind === "ranked" ? "text-[15px] leading-tight truncate" : "text-[13.5px] leading-snug break-keep line-clamp-2")} style={s.kind === "ranked" ? { color: TIER_GLOW[s.tier.id] } : undefined}>
                                {s.kind === "ranked" ? t(s.tier.nameKey) : s.kind === "placing" ? t("sim.rank.unranked").replace("{n}", String(s.matches)).replace("{m}", String(placement)) : t("home.skillOnlineFresh").replace("{n}", String(placement))}
                            </span>
                            <span className="flex items-center gap-1 text-[12px] font-semibold text-white/60 rk-num">
                                {onlineDama ? <><BadgeTap guide={{ kind: "online", dama: onlineDama }}><OnlineDamaBadge target={onlineDama} size={18} /></BadgeTap> {fill(t("home.skillDama"), { n: onlineDama })}</> : t("home.skillOnlinePlay")}
                            </span>
                        </span>
                    </span>
                    {s.kind === "ranked" || s.kind === "placing" ? (
                        <>
                            <span className="mt-2 block text-[20px] font-black rk-num leading-none">{s.kind === "ranked" ? s.rating.toLocaleString() : "—"}<span className="ml-0.5 text-[11px] font-bold text-[#7FD8E8]">{t("home.skillPoints")}</span></span>
                            <span className="mt-1.5 block text-[12px] font-semibold text-white/60 rk-num">{t("sim.entry.record").replace("{w}", String(s.wins)).replace("{l}", String(s.losses))}</span>
                        </>
                    ) : (
                        <span className="mt-2 inline-flex h-8 items-center rounded-full bg-[color:var(--hall-lime,#9BE15D)] px-3 text-[12.5px] font-black text-[#0B1A03]">{gate.isGuest ? t("home.hubJoin") : t("lookalike.playOnline")} ›</span>
                    )}
                </button>
            </div>

            {/* 닮은 프로 한 명 */}
            {pro && (
                <button type="button" onClick={() => setLocation(`/pba-player/${encodeURIComponent(pro.memCode)}`)} className="mt-3.5 flex w-full items-center gap-2.5 text-left" data-testid="home-skill-pro">
                    <ProAvatar pro={pro} />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-ink-3 truncate">{t(proSrc === "real" ? "home.skillProReal" : "home.skillProOnline")}</span>
                        <span className="block text-[15px] font-bold truncate">{proName(pro, locale)} <span className="text-[12px] font-semibold text-ink-3">{pro.league} · {num(pro.average)}</span></span>
                    </span>
                    <span className="text-ink-4" aria-hidden="true">›</span>
                </button>
            )}

            {/* 실전 | 온라인 | 프로 — 한 표 */}
            <div className={cn("overflow-hidden rounded-2xl border border-black/[0.06]", pro ? "mt-2" : "mt-3.5")} data-testid="home-skill-table">
                <div className={cn("grid bg-surface-3/60 text-[11.5px] font-bold text-ink-3", pro ? "grid-cols-4" : "grid-cols-3")}>
                    <span className="py-2 pl-3" />
                    <span className="py-2 text-center text-[#1F6B47]">{t("home.colReal")}</span>
                    <span className="py-2 text-center text-[#2A6E86]">{t("home.colOnline")}</span>
                    {pro && <span className="py-2 text-center truncate px-1">{proName(pro, locale)}</span>}
                </div>
                {([
                    [t("lookalike.rowAvg"), num(side?.avg), lk ? num(lk.avg) : "—", pro ? num(pro.average) : null],
                    [t("lookalike.rowHighRun"), side?.highRun ?? "—", lk?.highRun ?? "—", pro ? pro.highRun ?? "—" : null],
                    [t("lookalike.rowHandi"), ready ? side!.handi : "—", onlineDama ?? "—", pro ? "—" : null],
                ] as const).map(([label, a, b, c]) => (
                    <div key={String(label)} className={cn("grid border-t border-black/[0.05]", pro ? "grid-cols-4" : "grid-cols-3")}>
                        <span className="py-2.5 pl-3 text-[12.5px] font-semibold text-ink-3 truncate">{label}</span>
                        <span className={cell}>{a}</span>
                        <span className={cell}>{b}</span>
                        {pro && <span className={cn(cell, "text-ink-3")}>{c}</span>}
                    </div>
                ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t(sample ? "guestHome.sampleNote" : "home.skillNote")}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={onStartMatch} data-track-as="홈 내 실력 실전 시작" className="h-11 rounded-full bg-[#1F6B47] text-[13.5px] font-bold text-white active:opacity-90">{t("home.skillStartReal")}</button>
                <button type="button" onClick={() => goOnline(ROOMS_URL)} data-track-as="홈 내 실력 온라인 한 판" className="h-11 rounded-full bg-[#121722] text-[13.5px] font-bold text-white active:opacity-90">{t("home.skillPlayOnline")}</button>
            </div>
        </section>
    );
}
