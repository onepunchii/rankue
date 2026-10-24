/**
 * 홈 '내 실력'(2026-10-24 오너: "내 실전 기록과 온라인 실력 표를 한 카드에" → 시안 ① "좋네 진행") — 당구 홈의 맨 위.
 * 실전(당구장 · 공식 경기)과 온라인(폰 당구대 · 레이팅 대전)을 나란히 두고, 실전 | 온라인을 한 표로 견준다.
 * 예전엔 '내 실전 기록'(RealHandicapCard) · '내 온라인 실력'(LookalikeProCard) 두 장에 닮은 프로가 둘, 점수판 카드에 내 다마가 또 있었다.
 *
 * 2026-10-24 오너: "온라인게임 실전 각각 나와 닮은 프로가 나오면 좋겠고, 프로 전체 실력 그래프에 내가 어디인지가 누락됐다,
 * 실전의 60RP 랑 상위 부분 빼 줘" → 실전 칸에서 RP · 상위 % 를 뺐다. 닮은 프로는 칸마다 하나씩(실전 기준 | 온라인 기준),
 * 그 아래 프로 실력 사다리(재미 등급 다섯 칸 — proTier) 한 줄에 '실전' · '온라인' 두 자리를 같이 찍는다(두 기록이 같은 프로 무리 · 같은 식).
 * 프로 칸이 생겨 비교표의 프로 열은 뺐다(프로 에버 · 하이런은 프로 칸에 있다).
 *
 * 배지 모양은 섞지 않는다: 둥근 메달 = 실전 다마(RealMedal) · 방패 = 온라인 등급(TierEmblem) · 육각 = 온라인 다마(OnlineDamaBadge).
 * 온라인 칸은 고른 종목(3쿠션 · 4구)에 대전이 없으면 '대전 n판이면 등급' — 다른 종목의 등급을 끌어오지 않는다.
 * 닮은 프로 · 사다리는 3쿠션만(프로 기록이 3쿠션뿐).
 * 비로그인은 실전 칸만 예시(shared/guestSample — "예시" 표시). 예시의 닮은 프로는 예시 인물의 에버로 공개 API(/compare/avg)를 그때 부른다
 * (예시 자료에는 실제 선수를 넣지 않는다 — RealHandicapCard 와 같은 규칙 · 같은 캐시). 온라인 칸은 예시 숫자를 만들지 않고 시작을 권한다.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LOOKALIKE_MIN_MATCHES, type CompareAvgResponse, type ComparePro, type LookalikeResponse, type RealCompareResponse } from "@shared/proCompare";
import type { GuestSampleBilliards } from "@shared/guestSample";
import { realTierFor } from "@shared/realTier";
import { RealMedal, REAL_TIER_INK } from "@/components/hiq/RealMedal";
import { BadgeTap } from "@/components/hiq/BadgeGuideSheet";
import { PlayerPhoto } from "@/components/hiq/PlayerPhoto";
import { SampleBadge, useGuestGate } from "@/components/hiq/GuestGate";
import { FormDots, fill, proName } from "@/components/hiq/compare/lookalikeUi";
import { TIER_GLOW, TierEmblem } from "@/sim/rank/TierEmblem";
import { OnlineDamaBadge } from "@/sim/entry/OnlineDamaBadge";
import { useOnlineRecord } from "@/sim/entry/useOnlineRecord";
import { hubStateOf, type HubState } from "@/sim/rank/hubState";
import { HANDICAP_QUERY_KEY } from "@/sim/entry/HandicapCard";
import { matchApi } from "@/sim/matchApi";

type HistoryRow = { sportCategory?: string | null; gameMode?: string | null; isRanked?: boolean | null; gameType?: string | null; isWinner?: boolean | null };
type Tier = 0 | 1 | 2 | 3 | 4;
const ROOMS_URL = "/online-game?rooms=1";
const REAL_INK = "#1F6B47";
const ONLINE_INK = "#2A6E86";

export function HomeSkillCard({ onStartMatch, history, sample }: {
    onStartMatch: () => void;
    history?: HistoryRow[];
    sample?: GuestSampleBilliards | null;
}) {
    const { t } = useT();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const gate = useGuestGate();
    const real = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    const look = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    const hc = useQuery({ queryKey: HANDICAP_QUERY_KEY, queryFn: () => matchApi.getMyHandicap(), enabled: !!member, staleTime: 60_000 });
    // 예시의 닮은 프로 — 선수 페이지 '나와 비교하기' · RealHandicapCard 와 같은 키(캐시를 같이 쓴다). 실패하면 프로 칸이 '판을 쌓으면'으로 남는다
    const sampleAvg3c = sample?.real["3c"].avg ?? null;
    const twin = useQuery<CompareAvgResponse>({
        queryKey: [`/api/hiq/compare/avg?avg=${(sampleAvg3c ?? 0).toFixed(2)}`],
        enabled: !!sample && sampleAvg3c != null,
        staleTime: 10 * 60_000,
        retry: false,
    });
    const { boards, placement } = useOnlineRecord();
    const data = sample ? sample.real : real.data;
    const me = sample ? sample.member : member;
    const games: HistoryRow[] = (sample ? sample.history : history) ?? [];
    // 처음엔 늘 3쿠션(2026-10-24 오너 "3쿠션이 기본") — 예전엔 서버의 preferred(많이 친 종목)를 따라 4구로 열리기도 했다
    const [cur, setTab] = useState<"3c" | "4c">("3c");
    if (!me) return null;

    // ── 실전 칸
    const side = data?.[cur];
    const ready = !!(side?.ready && side.handi);
    const tier = ready ? realTierFor(side!.handi, cur) : null;
    const ink = tier ? REAL_TIER_INK[tier.id] : undefined;
    const mine = (Array.isArray(games) ? games : []).filter((g) => g.sportCategory === "BILLIARDS" && g.gameMode === "match" && g.isRanked && g.gameType === cur);
    const wins = mine.filter((g) => g.isWinner).length;

    // ── 온라인 칸 — 고른 종목에 대전이 있을 때만 그 종목의 등급
    const playedHere = !sample && boards.some((b) => b.gameType === cur && b.matches > 0);
    const s: HubState = playedHere ? hubStateOf(boards, placement, cur) : { kind: "fresh", canSwap: false };
    const handi = (Array.isArray(hc.data?.boards) ? hc.data!.boards : []).find((b) => b.gameType === cur);
    const onlineDama = !sample ? handi?.target ?? null : null;
    const lk = !sample && cur === "3c" ? look.data : undefined;

    // ── 닮은 프로(3쿠션만) — 실전 기준 · 온라인 기준 하나씩, 사다리 위 자리도 각자
    const sampleTwin = sample && cur === "3c" ? twin.data : undefined;
    const realPro: ComparePro | null = cur !== "3c" ? null : sampleTwin ? sampleTwin.pros[0] ?? null : ready ? side?.pro ?? null : null;
    const realSpot = cur !== "3c" ? null : sampleTwin ? spotOf(sampleTwin.tier, sampleTwin.pos) : ready ? spotOf(side?.tier, side?.pos) : null;
    const onlinePro = lk?.ready ? lk.pro : null;
    const onlineSpot = lk?.ready ? spotOf(lk.tier, lk.pos) : null;
    const realNeed = side && !side.ready ? fill(t("home.proNeedReal"), { n: Math.max(1, side.needed - side.games) }) : t("home.proSoon");
    const onlineNeed = fill(t("home.proNeedOnline"), { n: lk && !lk.ready ? Math.max(1, lk.needed - lk.matches) : LOOKALIKE_MIN_MATCHES });

    const goOnline = (to: string) => gate.guard(() => setLocation(to), { title: t("guestHome.gateHubTitle"), desc: t("guestHome.gateHubDesc").replace("{n}", String(placement)), from: to });
    const openPro = (p: ComparePro) => setLocation(`/pba-player/${encodeURIComponent(p.memCode)}`);
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
                {/* 실전 — 당구장 공식 경기. 전적 줄은 온라인 칸의 전적 줄과 높이를 맞춰 맨 아래에 */}
                <div className="flex flex-col rounded-2xl bg-[#F4F7F2] p-3 min-w-0" data-testid="home-skill-real">
                    <p className="text-[11.5px] font-bold tracking-wide truncate" style={{ color: REAL_INK }}>{t("home.skillReal")}</p>
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
                    <button type="button" onClick={openHistory} disabled={!openHistory} className="mt-auto block w-full pt-2 text-left disabled:cursor-default">
                        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-3 rk-num">
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

            {/* 나와 닮은 프로 — 칸마다 하나(실전 기준 | 온라인 기준) + 프로 실력 사다리 위 두 자리. 3쿠션만 */}
            {cur === "3c" && (
                <div className="mt-3.5" data-testid="home-skill-pros">
                    <p className="text-[12.5px] font-bold text-ink-2">{t("lookalike.twin")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2.5">
                        <ProTile basis={t("home.skillProReal")} ink={REAL_INK} pro={realPro} need={realNeed} testId="home-skill-pro-real"
                            onClick={realPro ? () => openPro(realPro) : sample ? undefined : onStartMatch} />
                        <ProTile basis={t("home.skillProOnline")} ink={ONLINE_INK} pro={onlinePro} need={onlineNeed} testId="home-skill-pro-online"
                            onClick={onlinePro ? () => openPro(onlinePro) : () => goOnline(ROOMS_URL)} />
                    </div>
                    {(realSpot || onlineSpot) && <ProLadder real={realSpot} online={onlineSpot} />}
                </div>
            )}

            {/* 실전 | 온라인 — 한 표 */}
            <div className="mt-3.5 overflow-hidden rounded-2xl border border-black/[0.06]" data-testid="home-skill-table">
                <div className="grid grid-cols-3 bg-surface-3/60 text-[11.5px] font-bold text-ink-3">
                    <span className="py-2 pl-3" />
                    <span className="py-2 text-center" style={{ color: REAL_INK }}>{t("home.colReal")}</span>
                    <span className="py-2 text-center" style={{ color: ONLINE_INK }}>{t("home.colOnline")}</span>
                </div>
                {([
                    [t("lookalike.rowAvg"), num(side?.avg), lk ? num(lk.avg) : "—"],
                    [t("lookalike.rowHighRun"), side?.highRun ?? "—", lk?.highRun ?? "—"],
                    [t("lookalike.rowHandi"), ready ? side!.handi : "—", onlineDama ?? "—"],
                ] as const).map(([label, a, b]) => (
                    <div key={String(label)} className="grid grid-cols-3 border-t border-black/[0.05]">
                        <span className="py-2.5 pl-3 text-[12.5px] font-semibold text-ink-3 truncate">{label}</span>
                        <span className={cell}>{a}</span>
                        <span className={cell}>{b}</span>
                    </div>
                ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t(sample ? "guestHome.sampleNote" : "home.skillNote")}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={onStartMatch} data-track-as="홈 내 실력 실전 시작" className="h-11 rounded-full text-[13.5px] font-bold text-white active:opacity-90" style={{ background: REAL_INK }}>{t("home.skillStartReal")}</button>
                <button type="button" onClick={() => goOnline(ROOMS_URL)} data-track-as="홈 내 실력 온라인 한 판" className="h-11 rounded-full bg-[#121722] text-[13.5px] font-bold text-white active:opacity-90">{t("home.skillPlayOnline")}</button>
            </div>
        </section>
    );
}

type Spot = { tier: Tier; pos: number };
/** 사다리 위 자리 — 옛 본문(CDN)에는 tier · pos 가 없을 수 있다. 둘 다 있을 때만 */
function spotOf(tier: Tier | null | undefined, pos: number | null | undefined): Spot | null {
    return tier != null && typeof pos === "number" ? { tier, pos } : null;
}

/** 닮은 프로 한 칸 — 프로가 없으면 몇 판 더 치면 찾아 주는지(누르면 그 판을 치러 간다) */
function ProTile({ basis, ink, pro, need, onClick, testId }: { basis: string; ink: string; pro: ComparePro | null; need: string; onClick?: () => void; testId: string }) {
    const { t, locale } = useT();
    return (
        <button type="button" onClick={onClick} disabled={!onClick} data-testid={testId}
            className="flex min-w-0 flex-col justify-start rounded-2xl border border-black/[0.07] p-2.5 text-left active:bg-black/[0.02] disabled:cursor-default">
            <span className="block text-[11px] font-bold truncate" style={{ color: ink }}>{basis}</span>
            {pro ? (
                <span className="mt-1.5 flex items-center gap-2">
                    <PlayerPhoto memCode={pro.memCode} name={proName(pro, locale)} size={38} className="shrink-0 ring-1 ring-surface-line" />
                    <span className="min-w-0">
                        {/* 이름은 두 줄까지 — 칸이 좁아 '위카르 하…'로 잘렸다(360 폭 화면 확인) */}
                        <span className="block text-[13.5px] font-bold leading-tight break-keep line-clamp-2">{proName(pro, locale)}</span>
                        <span className="block text-[11.5px] font-semibold text-ink-3 rk-num truncate">{pro.league} · {pro.average.toFixed(2)}</span>
                        <span className="block text-[11px] font-medium text-ink-4 rk-num truncate">{pro.highRun ? `${t("lookalike.rowHighRun")} ${pro.highRun}` : " "}</span>
                    </span>
                </span>
            ) : (
                <span className="mt-1.5 flex items-center gap-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-4/60 text-[15px] font-bold text-ink-4" aria-hidden="true">?</span>
                    <span className="min-w-0 text-[12px] font-semibold leading-snug text-ink-3 break-keep line-clamp-3">{need}</span>
                </span>
            )}
        </button>
    );
}

/**
 * 프로 실력 사다리 — 재미 등급 다섯 칸(아마추어 ~ PBA 톱10) 한 줄에 실전(위 깃발) · 온라인(아래 깃발) 자리.
 * 깃발을 위아래로 나눠 두 자리가 붙어 있어도 글자가 겹치지 않는다. 내가 있는 칸 이름은 그 색으로.
 */
function ProLadder({ real, online }: { real: Spot | null; online: Spot | null }) {
    const { t } = useT();
    const at = (p: number) => Math.min(100, Math.max(0, p));
    // 깃발 글자는 카드 밖으로 나가지 않게 가장자리에서 안쪽으로
    const flagAt = (p: number) => Math.min(88, Math.max(12, p));
    const label = [real && `${t("home.colReal")} ${t(`lookalike.tier${real.tier}`)}`, online && `${t("home.colOnline")} ${t(`lookalike.tier${online.tier}`)}`].filter(Boolean).join(" · ");
    const flag = (spot: Spot, text: string, color: string, below: boolean) => (
        <span className="absolute -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-bold leading-none text-white"
            style={{ left: `${flagAt(spot.pos)}%`, background: color, [below ? "top" : "bottom"]: 0 }}>{text}</span>
    );
    const dot = (spot: Spot, color: string) => (
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_3px_rgba(0,0,0,.3)]"
            style={{ left: `${at(spot.pos)}%`, background: color }} />
    );
    return (
        <div className="mt-3 rounded-2xl bg-surface-3/50 px-3 pb-3 pt-2.5" data-testid="home-skill-ladder" role="img" aria-label={`${t("home.proLadder")} — ${label}`}>
            <p className="text-[11.5px] font-bold text-ink-3">{t("home.proLadder")}</p>
            <div className="relative mt-1.5 h-[20px]">{real && flag(real, t("home.colReal"), REAL_INK, false)}</div>
            <div className="relative mt-1 h-2 rounded-full bg-surface-line">
                {[20, 40, 60, 80].map((x) => <span key={x} className="absolute inset-y-0 w-[3px] -ml-[1.5px] bg-surface-3" style={{ left: `${x}%` }} />)}
                {real && dot(real, REAL_INK)}
                {online && dot(online, "#121722")}
            </div>
            <div className="relative mt-1 h-[20px]">{online && flag(online, t("home.colOnline"), "#121722", true)}</div>
            {/* 칸 이름은 첫 띄어쓰기에서 두 줄로(리그 / 단계) — 한 줄이면 옆 칸 이름과 붙어 'LPBA 신인 LPBA 상위'로 읽혔다. 칸 사이 틈 없이 막대 칸과 같은 폭 */}
            <div className="mt-1 grid grid-cols-5">
                {([0, 1, 2, 3, 4] as const).map((i) => {
                    const here = real?.tier === i ? REAL_INK : online?.tier === i ? "#121722" : null;
                    const name = t(`lookalike.tierShort${i}`);
                    const cut = name.indexOf(" ");
                    return (
                        <span key={i} className={cn("px-0.5 text-center text-[11px] leading-tight break-keep", here ? "font-bold" : "font-semibold text-ink-4")} style={here ? { color: here } : undefined}>
                            {cut > 0 ? <>{name.slice(0, cut)}<br />{name.slice(cut + 1)}</> : name}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
