/**
 * 홈의 큐 케이스 허브(2026-10-24 오너: "나는 큐 케이스가 더 중요해서 큐 케이스 안에 등급이랑 랭킹 · 월대회 · 대시보드" → 시안 ③ "좋네 진행").
 * 홈 시안 B(?home=b)에서 '온라인 대전' 배너(OnlineHubBanner)와 큐 케이스 띠(CueCaseEntry)를 이 가죽 케이스 한 장이 대신한다.
 * 위: 마스코트 패치 · 놋쇠 명판 · 대표 큐(벨벳 홈) · 모은 수 → 누르면 큐 케이스.
 * 가운데: 온라인 등급(지금 등급 · 다음 등급까지 막대 / 배치 중 / 처음이면 시작 권유) → 누르면 랭킹(통산) 또는 멀티방.
 * 아래: 케이스 칸 셋 — 랭킹 · 월대회 · 대시보드. 칸의 한 줄은 OnlineHubBanner 와 같은 규칙(같은 사전 키).
 * 비로그인: 대표 큐 자리는 흐린 큐, 등급은 시작 권유, 회원 화면(랭킹 · 대시보드 · 멀티방)은 가입 안내로 잇는다. 예시 숫자를 만들지 않는다.
 * 예전 두 장이 하던 것도 잇는다: 이 기기에서 못 본 것(큐 케이스에 새로 들어온 것 · 달 마감으로 받은 메달)이 있으면 '새로',
 * 회원에게는 아래에 친구 초대 한 줄(큐 케이스 띠에 있던 것 — 오너 "바이럴에 중요").
 */
import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { BALLS, CUES, SHAFTS, caseImage, caseItem } from "@shared/cueCase";
import { useOnlineRecord } from "@/sim/entry/useOnlineRecord";
import { hubStateOf, type HubState } from "@/sim/rank/hubState";
import { RANK_TROPHY_SRC, TIER_GLOW, TierEmblem } from "@/sim/rank/TierEmblem";
import { CUP_ICON_SRC } from "@/sim/cup/CupArt";
import { CUP_PATH, timeLeft } from "@/sim/cup/cupApi";
import { useGuestGate } from "@/components/hiq/GuestGate";
import { BadgeTap } from "@/components/hiq/BadgeGuideSheet";
import { cueCasePath, readCaseSeen, useCaseSummary } from "./cueCaseApi";
import { isShelfNew, readShelfSeen } from "@/sim/rank/shelfApi";

const RANK_URL = "/online-game?rank=1";
const DASH_URL = "/online-game?dash=1";
const ROOMS_URL = "/online-game?rooms=1";
const DASH_ICON = "/sim/rank/icon-stats.webp";
const GHOST = caseItem("cue-najeon-crane") ?? CUES[0];
const INVITE_FACE = caseItem("chalk-invite") ?? CUES[0];
const GOLD = "#e8c46a", INK = "#f4ead6";
const LEATHER: CSSProperties = { background: "radial-gradient(140% 120% at 22% 0%,#62301f 0%,#3d1b12 48%,#23100a 100%)", boxShadow: "0 14px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,220,180,.12)" };
const VELVET: CSSProperties = { background: "radial-gradient(70% 120% at 50% 0%,rgba(255,236,190,.2),rgba(255,236,190,0) 60%),linear-gradient(180deg,#060b14,#0f1b30)", boxShadow: "inset 0 4px 10px rgba(0,0,0,.8), inset 0 0 0 1.5px rgba(232,196,106,.55)" };
const PLATE: CSSProperties = { background: "linear-gradient(180deg,#f6dfa8,#d6a956 42%,#b0823a 58%,#e2bf78)", color: "#3a230f", textShadow: "0 1px 0 rgba(255,244,214,.65)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.7), 0 3px 8px rgba(0,0,0,.55)" };

/** 케이스 칸 — 벨벳 홈의 그림 · 이름 · 한 줄 */
function Compartment({ icon, title, sub, onClick, trackAs, dot = false, testId }: { icon: string; title: string; sub: string; onClick: () => void; trackAs: string; dot?: boolean; testId?: string }) {
    return (
        <button type="button" onClick={onClick} data-track-as={trackAs} data-testid={testId} className="min-w-0 flex flex-col items-center gap-0.5 rounded-[16px] px-1 pb-2 pt-1.5 active:scale-[0.97] transition-transform"
            style={{ background: "linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.25))", boxShadow: "inset 0 0 0 1px rgba(232,196,106,.18)" }}>
            <span className="relative flex h-11 w-full items-center justify-center rounded-[12px]" style={{ background: "radial-gradient(90% 120% at 50% 30%,#142238,#070d18)", boxShadow: "inset 0 3px 7px rgba(0,0,0,.75)" }}>
                <img src={icon} alt="" aria-hidden="true" decoding="async" draggable={false} className="h-8 w-8 object-contain" />
                {dot && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[#9BE15D]" aria-hidden="true" />}
            </span>
            <span className="mt-1 max-w-full truncate text-[13px] font-bold" style={{ color: INK }}>{title}</span>
            <span className="max-w-full truncate rk-num text-[11px] font-semibold" style={{ color: `${INK}80` }}>{sub}</span>
        </button>
    );
}

export function CueCaseHub() {
    const { t } = useT();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const gate = useGuestGate("dark");
    const sum = useCaseSummary(!!member).data;
    const { boards, placement, ready, cup, shelf } = useOnlineRecord();
    const fresh = !!member && ((!!sum?.latest && sum.latest > readCaseSeen()) || isShelfNew(shelf?.latest, readShelfSeen()));
    const hero = sum?.hero ? caseItem(sum.hero) : null;
    const loading = !!member && !ready;
    const s: HubState = member ? hubStateOf(boards, placement) : { kind: "fresh", canSwap: false };
    const game = s.kind === "fresh" ? null : s.gameType;
    const rankUrl = game ? `${RANK_URL}&g=${game}` : RANK_URL;

    // 회원 화면으로 가는 길은 전부 여기로 — 비로그인은 가입 안내(OnlineHubBanner 와 같은 문구)
    const go = (to: string) => gate.guard(() => setLocation(to), { title: t("guestHome.gateHubTitle"), desc: t("guestHome.gateHubDesc").replace("{n}", String(placement)), from: to });
    const record = (w: number, l: number) => t("sim.entry.record").replace("{w}", String(w)).replace("{l}", String(l));
    const rankSub = s.kind === "ranked" && s.rank !== null ? t("sim.rank.rankOf").replace("{r}", String(s.rank)).replace("{n}", String(s.total)) : t("home.hubRankSub");
    const dashSub = s.kind === "ranked" || s.kind === "placing" ? record(s.wins, s.losses) : t("home.hubDashSub");
    const myCup = member ? cup : null;
    const cupLeft = myCup && !myCup.waiting ? timeLeft(myCup.deadlineMs, Date.now()) : null;
    const cupSub = !myCup ? t("home.hubCupSub")
        : myCup.waiting ? t("home.hubCupWait")
            : !cupLeft ? t("home.hubCupOver")
                : cupLeft.days > 0 ? t("home.hubCupDays").replace("{d}", String(cupLeft.days)).replace("{h}", String(cupLeft.hours))
                    : cupLeft.hours > 0 ? t("home.hubCupHours").replace("{h}", String(cupLeft.hours)).replace("{m}", String(cupLeft.minutes))
                        : t("home.hubCupMin").replace("{m}", String(cupLeft.minutes));
    const counts = t("home.caseCounts")
        .replace("{c}", `${sum?.cue ?? 0}/${CUES.length}`).replace("{s}", `${sum?.shaft ?? 0}/${SHAFTS.length}`).replace("{b}", `${sum?.ball ?? 0}/${BALLS.length}`);

    let tier: ReactNode;
    if (loading || s.kind === "waiting") {
        tier = <span className="block h-[54px] rounded-xl bg-white/[0.06] animate-pulse" aria-hidden="true" />;
    } else if (s.kind === "ranked") {
        const glow = TIER_GLOW[s.tier.id];
        tier = (
            <>
                <BadgeTap guide={{ kind: "online", tier: s.tier.id, rating: s.rating }}><TierEmblem tier={s.tier.id} size={54} glow /></BadgeTap>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold tracking-wide" style={{ color: `${GOLD}cc` }}>{t("home.caseTier")}{game ? ` · ${t(game === "3c" ? "real.tab3c" : "real.tab4c")}` : ""}</span>
                    <span className="block text-[15px] font-black truncate" style={{ color: glow }}>{t(s.tier.nameKey)} <span className="rk-num text-[12px] font-semibold" style={{ color: `${INK}99` }}>{s.rating.toLocaleString()}</span></span>
                    {s.next && <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round(s.progress * 100))}%`, background: `linear-gradient(90deg, ${glow}, ${TIER_GLOW[s.next.id]})` }} /></span>}
                    <span className="mt-1 block rk-num text-[11px] font-semibold truncate" style={{ color: `${INK}80` }}>
                        {s.next && s.toNext !== null ? t("sim.rank.nextTier").replace("{tier}", t(s.next.nameKey)).replace("{n}", String(s.toNext)) : t("sim.rank.topTier")}
                    </span>
                </span>
            </>
        );
    } else {
        tier = (
            <>
                <BadgeTap guide={{ kind: "online", tier: null }}><TierEmblem tier="iron" size={54} locked /></BadgeTap>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold tracking-wide" style={{ color: `${GOLD}cc` }}>{t("home.caseTier")}</span>
                    <span className="block text-[14px] font-black leading-snug break-keep" style={{ color: INK }}>
                        {s.kind === "placing" ? t("sim.rank.unranked").replace("{n}", String(s.matches)).replace("{m}", String(placement)) : t("home.hubShowTitle").replace("{n}", String(placement))}
                    </span>
                </span>
                <span className="shrink-0 inline-flex h-8 items-center rounded-full bg-[#9BE15D] px-3 text-[12.5px] font-black text-[#0B1A03]">{gate.isGuest ? t("home.hubJoin") : t("lookalike.playOnline")} ›</span>
            </>
        );
    }

    return (
        <>
        <section className="relative rounded-[26px] px-4 pb-4 pt-5" style={LEATHER} aria-label={t("home.caseTitle")} data-testid="home-case-hub">
            <i className="pointer-events-none absolute inset-[9px] rounded-[20px]" style={{ border: "1.5px dashed rgba(232,196,106,.42)" }} aria-hidden="true" />
            {/* 케이스 — 누르면 큐 케이스 */}
            <button type="button" onClick={() => setLocation(cueCasePath())} className="relative block w-full text-left" data-track-as="홈 큐 케이스 허브" data-testid="home-case-open">
                <span className="flex items-center justify-between gap-2">
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full" style={{ background: "radial-gradient(circle at 40% 32%,#4f2417,#2e130b 70%,#1f0c06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.7)" }}>
                        <img src="/billiards/case/mascot-foil.webp" alt="" aria-hidden="true" decoding="async" draggable={false} className="absolute inset-[4px] h-[calc(100%-8px)] w-[calc(100%-8px)] rounded-full" />
                    </span>
                    <span className="rounded-md px-5 py-1 text-[14px] font-bold truncate" style={PLATE}>{t("home.caseTitle")}</span>
                    {fresh
                        ? <span className="rounded-full bg-[#e8c46a] px-1.5 py-[1px] text-[11.5px] font-bold text-[#2d1a08]" data-testid="home-case-new">{t("case.new")}</span>
                        : <span className="w-11 text-right text-[12px] font-bold" style={{ color: GOLD }}>{t("home.caseOpen")} ›</span>}
                </span>
                <span className="relative mt-3.5 block h-[52px] overflow-hidden rounded-[26px]" style={VELVET}>
                    <img src={caseImage(hero ?? GHOST)} alt="" decoding="async" draggable={false} className={cn("absolute left-3 right-3 top-1/2 w-[calc(100%-24px)] -translate-y-1/2", !hero && "opacity-30 grayscale")}
                        style={{ aspectRatio: "1000/80", filter: hero ? "drop-shadow(0 3px 3px rgba(0,0,0,.7))" : undefined }} />
                </span>
                <span className="mt-1.5 block text-center rk-num text-[11.5px] font-semibold" style={{ color: `${INK}99` }}>{member ? counts : t("case.entryGuest")}</span>
            </button>

            {/* 온라인 등급 — 케이스 안의 배지 칸 */}
            <button type="button" onClick={() => go(s.kind === "ranked" ? `${rankUrl}&s=all` : ROOMS_URL)} data-track-as="홈 큐 케이스 등급" data-testid="home-case-tier"
                className="relative mt-3 flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left" style={{ background: "rgba(0,0,0,.28)", boxShadow: "inset 0 0 0 1px rgba(232,196,106,.15)" }}>
                {tier}
            </button>

            <div className="relative mt-2.5 grid grid-cols-3 gap-2">
                <Compartment icon={RANK_TROPHY_SRC} title={t("sim.rank.title")} sub={loading ? " " : rankSub} onClick={() => go(rankUrl)} trackAs="홈 큐 케이스 랭킹" testId="home-case-rank" />
                <Compartment icon={CUP_ICON_SRC} title={t("home.hubCup")} sub={loading ? " " : cupSub} onClick={() => go(CUP_PATH)} trackAs="홈 큐 케이스 월대회" dot={!!myCup && !myCup.waiting} testId="home-case-cup" />
                <Compartment icon={DASH_ICON} title={t("home.hubDash")} sub={loading ? " " : dashSub} onClick={() => go(DASH_URL)} trackAs="홈 큐 케이스 대시보드" testId="home-case-dash" />
            </div>
        </section>
        {/* 친구 초대(2026-10-16 오너: "바이럴에 중요") — 회원에게만, 큐 케이스의 초대 칸으로 바로(예전 큐 케이스 띠의 것 그대로) */}
        {member && (
            <button type="button" onClick={() => setLocation("/cue-case?invite=1")} data-testid="cue-case-entry-invite" data-track-as="홈 친구 초대"
                className="mt-2 flex w-full items-center gap-3 overflow-hidden rounded-[18px] px-3.5 py-2.5 text-left active:opacity-90"
                style={{ background: "linear-gradient(100deg, #FF4FA3, #FF2E8A)", boxShadow: "inset 0 0 0 1.5px #1A0B1433" }}>
                <img src={caseImage(INVITE_FACE)} alt="" aria-hidden="true" decoding="async" draggable={false} className="h-10 w-10 shrink-0 -rotate-6 object-contain" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-white">{t("inv.homeNudge")}</span>
                    <span className="block truncate text-[12px] font-semibold text-[#1A0B14]/75">{t("inv.homeNudgeSub")}</span>
                </span>
                <span className="shrink-0 text-[18px] font-bold text-white/85" aria-hidden>›</span>
            </button>
        )}
        </>
    );
}
