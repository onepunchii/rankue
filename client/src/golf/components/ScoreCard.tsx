/**
 * 랭큐매치 스코어 입력(2026-09-24 둘째 판 — 오너: "게임 화면도 … 디자인 전면 수정").
 *
 * 무엇을 바꿨나:
 *  - 선수 카드 한 장이 화면 반을 차지하던 것(👑 아이콘·STROKES·기울인 굵은 글씨) → **한 사람 한 줄**. 4명이 한 화면에 든다.
 *  - 타수는 기본이 파다(0 = 아직 안 적음 = 파로 보인다, 다음 홀로 가면 파로 채운다). 그래서 버디는 −, 보기는 + **한 번**.
 *    더 크게 벌어진 점수(더블·트리플·이글)는 숫자를 누르면 펼쳐지는 칩으로 한 번에.
 *  - 18홀 기록표는 실제 스코어카드 표기 — 파보다 적으면 **동그라미**(버디 하나·이글 두 겹), 많으면 **네모**.
 *  - 카드 전체를 누르면 펼쳐지던 것(± 누르다 실수로 접히던 것)을 이름 줄의 '기록표' 단추로.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { HiqMember } from "@shared/schema";
import { calculateGolfScore } from "../hooks/useGolfScore";

interface ScoreCardProps {
    players: Array<{ id: string; name: string }>;
    playerScores: Record<string, number[]>;
    playerPenalties?: Record<string, Array<{ ob: boolean; hazard: boolean }>>;
    currentHole: number;
    pars: number[];
    onScoreChange: (playerId: string, diff: number) => void;
    onPenaltyChange?: (playerId: string, type: 'ob' | 'hazard') => void;
    isSolo?: boolean;
    isHost?: boolean;
}

/** 파 대비 이름 — 화면 말 */
export function scoreName(diff: number): string {
    if (diff <= -3) return "앨버트로스";
    if (diff === -2) return "이글";
    if (diff === -1) return "버디";
    if (diff === 0) return "파";
    if (diff === 1) return "보기";
    if (diff === 2) return "더블 보기";
    return "트리플 이상";
}
/** 합계(파 대비) 글자·색 — 한국 스코어 관례: 언더 파랑·오버 빨강 대신, 골프 화면 톤에 맞춰 하늘·주황 */
export function toParText(n: number): string { return n === 0 ? "E" : n > 0 ? `+${n}` : String(n); }
const toParColor = (n: number) => (n < 0 ? "text-[#7DD3FC]" : n > 0 ? "text-[#FFB27A]" : "text-[#FFFFFFB3]");

/**
 * 18홀 기록표 한 판(전반·후반 두 줄). 혼자 기록 화면과 선수 줄의 '기록표'가 같이 쓴다.
 * 동그라미 = 파보다 적게(버디 하나, 이글 이상 두 겹), 네모 = 파보다 많게(보기 한 겹, 더블 이상 채움). 파는 숫자만.
 */
export function HoleGrid({ scores, pars, currentHole }: { scores: number[]; pars: number[]; currentHole: number }) {
    const half = (from: number) => {
        const idx = Array.from({ length: 9 }, (_, i) => from + i);
        const sum = idx.reduce((a, i) => a + (scores[i] || 0), 0);
        const parSum = idx.reduce((a, i) => a + (pars[i] || 0), 0);
        return (
            <div className="grid grid-cols-[34px_repeat(9,minmax(0,1fr))_36px] gap-y-1 items-center text-center">
                <span className="text-[11px] text-[#FFFFFF59] text-left">홀</span>
                {idx.map((i) => (
                    <span key={i} className={cn("text-[11px] tabular-nums", i === currentHole ? "text-[#9BEF5C] font-semibold" : "text-[#FFFFFF73]")}>{i + 1}</span>
                ))}
                <span className="text-[11px] text-[#FFFFFF59]">{from === 0 ? "전반" : "후반"}</span>

                <span className="text-[11px] text-[#FFFFFF59] text-left">파</span>
                {idx.map((i) => <span key={i} className="text-[11px] text-[#FFFFFF8C] tabular-nums">{pars[i]}</span>)}
                <span className="text-[11px] text-[#FFFFFF8C] tabular-nums">{parSum}</span>

                <span className="text-[11px] text-[#FFFFFF59] text-left">타수</span>
                {idx.map((i) => {
                    const s = scores[i] || 0;
                    const d = s > 0 ? s - pars[i] : null;
                    return (
                        <span key={i} className="flex items-center justify-center h-7">
                            <span className={cn(
                                "w-6 h-6 flex items-center justify-center text-[12px] font-semibold tabular-nums",
                                d === null ? "text-[#FFFFFF33]"
                                    : d <= -2 ? "rounded-full ring-1 ring-[#9BEF5C] outline outline-1 outline-offset-2 outline-[#9BEF5C] text-[#9BEF5C]"
                                        : d === -1 ? "rounded-full ring-1 ring-[#7DD3FC] text-[#7DD3FC]"
                                            : d === 0 ? "text-[#ffffff]"
                                                : d === 1 ? "rounded-[4px] ring-1 ring-[#FFB27A] text-[#FFB27A]"
                                                    : "rounded-[4px] bg-[#FF8A3333] ring-1 ring-[#FF8A33] text-[#FFC9A3]",
                                i === currentHole && d === null && "rounded-full ring-1 ring-[#64DD1780]",
                            )}>{s > 0 ? s : "·"}</span>
                        </span>
                    );
                })}
                <span className="text-[12px] font-semibold text-[#ffffff] tabular-nums">{sum || "–"}</span>
            </div>
        );
    };
    return (
        <div className="space-y-3">
            {half(0)}
            <div className="h-px bg-[#FFFFFF0F]" />
            {half(9)}
        </div>
    );
}

export function ScoreCard({ players, playerScores, currentHole, pars, onScoreChange, isSolo = false, isHost = true }: ScoreCardProps) {
    const [gridFor, setGridFor] = useState<string | null>(null);
    const [jumpFor, setJumpFor] = useState<string | null>(null);
    const { data: member } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    const par = pars[currentHole];

    return (
        <div className={cn("px-4 space-y-2", isSolo ? "pb-4" : "pb-40")}>
            {players.map((p) => {
                const scores = playerScores[p.id] || Array(18).fill(0);
                const { totalStrokes, currentOverPar } = calculateGolfScore(scores, pars, 18, currentHole);
                const hole = scores[currentHole] || par;
                const diff = hole - par;
                const me = p.id === member?.id;
                const set = (target: number) => { if (target >= 1 && target !== hole) onScoreChange(p.id, target - hole); };

                return (
                    <section key={p.id} className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F]">
                        <div className="px-4 pt-3 flex items-center gap-2">
                            <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="text-[15px] font-semibold text-[#ffffff] truncate">{p.name}</span>
                                {me && <span className="shrink-0 h-5 px-1.5 rounded bg-[#FFFFFF14] text-[11px] text-[#FFFFFFB3] leading-5">나</span>}
                            </span>
                            <span className="shrink-0 text-[13px] tabular-nums">
                                <span className={cn("font-semibold", toParColor(currentOverPar))}>{toParText(currentOverPar)}</span>
                                <span className="text-[#FFFFFF59]"> · {totalStrokes}타</span>
                            </span>
                            <button
                                type="button" onClick={() => setGridFor(gridFor === p.id ? null : p.id)} aria-expanded={gridFor === p.id}
                                className="shrink-0 h-7 px-2.5 -mr-1 rounded-full text-[12px] text-[#FFFFFF99] active:bg-[#FFFFFF14]"
                            >{gridFor === p.id ? "접기" : "기록표"}</button>
                        </div>

                        {/* 이번 홀 타수 — [−] 숫자 [+]. 숫자를 누르면 크게 벌어진 점수로 바로 가는 칩 */}
                        <div className="px-3 pt-2.5 pb-3 flex items-center gap-2">
                            {isHost && (
                                <button
                                    type="button" onClick={() => set(hole - 1)} disabled={hole <= 1} aria-label={`${p.name} 한 타 줄이기`}
                                    className="w-14 h-14 rounded-2xl bg-[#FFFFFF0F] text-[26px] font-medium text-[#ffffff] active:bg-[#FFFFFF24] disabled:opacity-30 flex items-center justify-center"
                                >−</button>
                            )}
                            <button
                                type="button" disabled={!isHost} onClick={() => setJumpFor(jumpFor === p.id ? null : p.id)} aria-label={`${p.name} ${hole}타 — 점수 고르기`}
                                className="flex-1 h-14 rounded-2xl bg-[#00000059] flex items-center justify-center gap-2 active:bg-[#0000008C]"
                            >
                                <span className="text-[30px] leading-none font-bold text-[#ffffff] tabular-nums">{hole}</span>
                                <span className={cn(
                                    "text-[13px] font-medium",
                                    diff <= -2 ? "text-[#9BEF5C]" : diff === -1 ? "text-[#7DD3FC]" : diff === 0 ? "text-[#FFFFFF8C]" : diff === 1 ? "text-[#FFB27A]" : "text-[#FF8A8C]",
                                )}>{scoreName(diff)}</span>
                            </button>
                            {isHost && (
                                <button
                                    type="button" onClick={() => set(hole + 1)} aria-label={`${p.name} 한 타 늘리기`}
                                    className="w-14 h-14 rounded-2xl bg-[#64DD17] text-[26px] font-medium text-[#051907] active:bg-[#58C414] flex items-center justify-center"
                                >+</button>
                            )}
                        </div>

                        {isHost && jumpFor === p.id && (
                            <div className="px-3 pb-3 -mt-1 flex gap-1.5 overflow-x-auto scrollbar-hide">
                                {[-2, -1, 0, 1, 2, 3].map((d) => {
                                    const v = par + d;
                                    if (v < 1) return null;
                                    return (
                                        <button
                                            key={d} type="button" onClick={() => { set(v); setJumpFor(null); }} aria-pressed={v === hole}
                                            className={cn(
                                                "shrink-0 h-9 px-3 rounded-full text-[13px] whitespace-nowrap tabular-nums",
                                                v === hole ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "bg-[#FFFFFF0D] text-[#FFFFFFCC] font-medium active:bg-[#FFFFFF1A]",
                                            )}
                                        >{scoreName(d)} {v}</button>
                                    );
                                })}
                            </div>
                        )}

                        {gridFor === p.id && (
                            <div className="px-4 pb-4 pt-1 border-t border-[#FFFFFF0F]">
                                <div className="pt-3"><HoleGrid scores={scores} pars={pars} currentHole={currentHole} /></div>
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
