import { useEffect, useRef, useState, type ReactElement } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { HandFist, HandPalm, HandPeace, type LucideIcon } from "../../lib/icons";
import { BREAK_RPS_PICK_MS, BREAK_RPS_RESULT_MS, RPS_HANDS, type BreakRpsView, type RpsHand } from "@shared/sim/breakRps";

/**
 * 선구 정하기 — 가위바위보(2026-11-04 오너: "가위바위보 게임 디자인으로 시안" → "둘 다 위로 보는 이미지로" → "응 이렇게 진행하자").
 * 시안: reports/sim-rps-mockup-1104.png — ① 고르기(상대 손은 가려짐 · 20초) ② 냈어요(바꿀 수 없음) ③ 공개(이긴 손 초록 테두리 · 3초 뒤 초구) ④ 비김(같은 손 · 한 번 더).
 * 졌을 때는 같은 모양에 회색 띠로 "상대가 초구를 쳐요".
 *
 * 판정은 서버가 한다(shared/sim/breakRps · POST /sim/matches/:id/rps) — 이 화면은 서버가 준 모양(보는 사람 기준)만 그린다.
 * 낸 손은 응답이 오기 전에 먼저 켠다(눌렀는데 아무 일도 없어 보이지 않게). 시간은 서버 시각(serverOffsetMs)으로 센다.
 * 대전 화면 전체를 덮는다 — 정해지기 전에는 조준 · 샷 단추를 누를 수 없다(서버도 막는다).
 */

const ICON: Record<RpsHand, LucideIcon> = { rock: HandFist, paper: HandPalm, scissors: HandPeace };
const LIME = "#64dd17";
const AMBER = "#f5b721";

export interface BreakRpsSheetProps {
    rps: BreakRpsView;
    myName: string;
    opponentName: string;
    /** 내가 방장인가 — 내 줄 옆에 '방장' */
    isHost: boolean;
    /** 서버 시각 − 이 기기 시각(ms) */
    serverOffsetMs: number;
    onPick: (hand: RpsHand) => Promise<boolean>;
    /** 결과를 다 보여 줬다(3초) — 부르는 쪽이 판을 닫는다 */
    onDone: () => void;
    /** 시험에서 시계를 고정한다 */
    now?: () => number;
}

function Ring({ sec, total }: { sec: number; total: number }) {
    const r = 20, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, sec / total));
    const color = sec <= 5 ? "#ff8a65" : LIME;
    return (
        <div className="relative h-[46px] w-[46px] shrink-0" data-testid="rps-timer" aria-label={`${sec}`}>
            <svg width="46" height="46" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="23" cy="23" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
                <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
            </svg>
            <b className="rk-num absolute inset-0 grid place-items-center text-[15px] font-bold" style={{ color }}>{sec}</b>
        </div>
    );
}

export function BreakRpsSheet({ rps, myName, opponentName, isHost, serverOffsetMs, onPick, onDone, now: clock }: BreakRpsSheetProps) {
    const { t } = useT();
    const nowOf = clock ?? (() => Date.now() + serverOffsetMs);
    const [now, setNow] = useState(nowOf);
    const [optimistic, setOptimistic] = useState<{ round: number; hand: RpsHand } | null>(null);
    const doneRef = useRef(false);
    useEffect(() => {
        const id = setInterval(() => setNow(nowOf()), 250);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverOffsetMs, clock]);

    const decided = rps.winner !== null;
    const resultLeft = decided && rps.decidedMs !== null ? Math.max(0, Math.ceil((rps.decidedMs + BREAK_RPS_RESULT_MS - now) / 1000)) : null;
    useEffect(() => {
        if (resultLeft === 0 && !doneRef.current) { doneRef.current = true; onDone(); }
    }, [resultLeft, onDone]);

    const handName = (h: RpsHand) => t(`sim.rps.${h}`);
    const myPick = rps.myPick ?? (optimistic && optimistic.round === rps.round ? optimistic.hand : null);
    const remaining = rps.deadlineMs - now;
    // 비긴 손을 보여 주는 동안(다음 판 20초 앞의 1.5초)
    const tieShowing = !decided && !!rps.last && rps.last.mine === rps.last.theirs && remaining > BREAK_RPS_PICK_MS;
    const sec = Math.max(0, Math.ceil(Math.min(BREAK_RPS_PICK_MS, remaining) / 1000));

    const pick = (h: RpsHand) => {
        if (decided || myPick || tieShowing) return;
        setOptimistic({ round: rps.round, hand: h });
        void onPick(h).then((ok) => { if (!ok) setOptimistic(null); });
    };

    /** 대결 칸 하나 — hidden(상대 · 공개 전) · empty(내가 아직) · 손(이김 · 짐 · 비김 · 그냥) */
    const slot = (kind: "hidden" | "empty" | "shown" | "win" | "lose" | "tie", hand?: RpsHand, testId?: string) => {
        if (kind === "hidden") return <div data-testid={testId} className="grid h-[104px] place-items-center rounded-[18px] border border-white/[0.08] bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.05)_0_8px,rgba(255,255,255,.02)_8px_16px)]"><span className="text-[30px] font-bold text-white/30">?</span></div>;
        if (kind === "empty" || !hand) return <div data-testid={testId} className="grid h-[104px] place-items-center rounded-[18px] border-[1.5px] border-dashed border-white/20"><span className="text-[12.5px] font-semibold text-white/55">{t("sim.rps.pickPrompt")}</span></div>;
        const Icon = ICON[hand];
        const color = kind === "win" ? LIME : kind === "tie" ? AMBER : "#f4f4f5";
        return (
            <div data-testid={testId} data-hand={hand} className={cn("relative grid h-[104px] place-items-center rounded-[18px] border",
                kind === "win" ? "border-[1.5px] border-[#64dd17] bg-[#64dd171F] shadow-[0_0_0_4px_rgba(100,221,23,.12)]"
                    : kind === "tie" ? "border-[1.5px] border-[#f5b72199] bg-[#f5b7211A]"
                        : "border-white/[0.12] bg-white/[0.07]",
                kind === "lose" && "opacity-[0.42]")}>
                <Icon size={58} style={{ color }} />
                <span className="absolute bottom-2 text-[12px] font-bold text-white/75">{handName(hand)}</span>
            </div>
        );
    };

    // 위 칸(상대) · 아래 칸(나)
    let oppSlot: ReactElement, mySlot: ReactElement;
    if (decided && rps.by === "rps" && rps.last) {
        const iWon = rps.winner === "me";
        oppSlot = slot(iWon ? "lose" : "win", rps.last.theirs, "rps-opp");
        mySlot = slot(iWon ? "win" : "lose", rps.last.mine, "rps-mine");
    } else if (tieShowing && rps.last) {
        oppSlot = slot("tie", rps.last.theirs, "rps-opp");
        mySlot = slot("tie", rps.last.mine, "rps-mine");
    } else {
        oppSlot = slot("hidden", undefined, "rps-opp");
        mySlot = myPick ? slot("shown", myPick, "rps-mine") : slot("empty", undefined, "rps-mine");
    }

    const oppStatus = decided || tieShowing || rps.opponentPicked
        ? <span className="ml-auto inline-flex h-[26px] items-center rounded-full bg-[#64dd1724] px-2.5 text-[12px] font-bold text-[#64dd17]">{t("sim.rps.picked")}</span>
        : <span className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-[12px] font-bold text-white/75">{t("sim.rps.picking")}<span className="inline-flex gap-[3px]" aria-hidden="true"><i className="h-1 w-1 animate-pulse rounded-full bg-current" /><i className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" /><i className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" /></span></span>;

    const resultSub = (): string => {
        if (rps.by === "rps" && rps.last) {
            const [a, b] = rps.winner === "me" ? [rps.last.mine, rps.last.theirs] : [rps.last.theirs, rps.last.mine];
            return t("sim.rps.beat").replace("{a}", handName(a)).replace("{b}", handName(b));
        }
        if (rps.by === "timeout") return t(rps.winner === "me" ? "sim.rps.byTimeoutMe" : "sim.rps.byTimeoutOpp");
        return t(rps.by === "rounds" ? "sim.rps.byRounds" : "sim.rps.byDefault");
    };

    return (
        <div className="fixed inset-0 z-[8] bg-[#050806A0]" data-testid="break-rps" data-state={decided ? (rps.winner === "me" ? "won" : "lost") : tieShowing ? "tie" : myPick ? "picked" : "picking"} role="dialog" aria-modal="true" aria-label={t("sim.rps.title")}>
            <div className="absolute inset-x-3.5 rounded-[28px] border border-white/10 bg-[#141416] p-[18px] text-white" style={{ bottom: "calc(env(safe-area-inset-bottom) + 18px)" }}>
                <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                        <h2 className="text-[19px] font-bold leading-tight text-white">{t("sim.rps.title")}</h2>
                        <p className="mt-0.5 text-[13px] font-medium text-white/55">{t("sim.rps.sub")}</p>
                    </div>
                    {!decided && !tieShowing && <Ring sec={sec} total={BREAK_RPS_PICK_MS / 1000} />}
                </div>

                <div className="mt-3.5 rounded-[20px] border border-white/[0.06] bg-white/[0.04] p-3">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8c46a] text-[13px] font-bold text-[#0b1a03]" aria-hidden="true">{(opponentName || "?").slice(0, 1).toUpperCase()}</span>
                        <span className="min-w-0 truncate text-[14px] font-bold text-white">{opponentName}</span>
                        {oppStatus}
                    </div>
                    <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        {oppSlot}
                        <span className="text-[13px] font-bold tracking-wide text-white/35">VS</span>
                        {mySlot}
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#64dd17] text-[13px] font-bold text-[#0b1a03]" aria-hidden="true">{t("sim.rps.me")}</span>
                        <span className="min-w-0 truncate text-[14px] font-bold text-white">{myName}</span>
                        {isHost && <span className="ml-auto text-[12px] font-semibold text-white/55">{t("sim.rps.host")}</span>}
                    </div>
                </div>

                {decided ? (
                    <div className={cn("mt-3.5 flex items-center gap-3 rounded-[18px] px-3.5 py-3.5", rps.winner === "me" ? "bg-[#64dd17] text-[#0b1a03]" : "bg-white/[0.10] text-white")} data-testid="rps-result">
                        <div className="min-w-0">
                            <p className="text-[18px] font-bold">{rps.winner === "me" ? t(rps.by === "rps" ? "sim.rps.winTitle" : "sim.rps.meFirst") : t("sim.rps.oppFirst")}</p>
                            <p className="mt-0.5 text-[13px] font-semibold opacity-80">{resultSub()}</p>
                        </div>
                        <span className={cn("rk-num ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full text-[19px] font-bold", rps.winner === "me" ? "bg-black/15" : "bg-white/10")}>{Math.max(1, resultLeft ?? 1)}</span>
                    </div>
                ) : tieShowing && rps.last ? (
                    <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-[#f5b72173] bg-[#f5b72124] px-3.5 py-3.5 text-[#f5b721]" data-testid="rps-tie">
                        <div className="min-w-0">
                            <p className="text-[18px] font-bold">{t("sim.rps.tie")}</p>
                            <p className="mt-0.5 text-[13px] font-semibold opacity-80">{t("sim.rps.tieSub").replace("{a}", handName(rps.last.mine))}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                            {RPS_HANDS.map((h) => {
                                const Icon = ICON[h];
                                const on = myPick === h, off = !!myPick && !on;
                                return (
                                    <button key={h} type="button" onClick={() => pick(h)} disabled={!!myPick} aria-pressed={on}
                                        aria-label={t("sim.rps.pickAria").replace("{hand}", handName(h))} data-testid={`rps-pick-${h}`} data-track-as={`선구 가위바위보 ${h}`}
                                        className={cn("flex h-[104px] flex-col items-center justify-center gap-1.5 rounded-[20px] border text-[14.5px] font-bold transition-transform active:scale-[0.97]",
                                            on ? "border-2 border-[#64dd17] bg-[#64dd1724] text-[#64dd17]" : "border-white/10 bg-[#1f2124] text-white",
                                            off && "opacity-[0.32]")}>
                                        <Icon size={46} />
                                        {handName(h)}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-3 text-center text-[12.5px] font-medium text-white/55">{myPick ? t("sim.rps.noteWait") : t("sim.rps.noteFirst").replace("{n}", String(BREAK_RPS_PICK_MS / 1000))}</p>
                    </>
                )}
            </div>
        </div>
    );
}
