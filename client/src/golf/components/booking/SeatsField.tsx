/**
 * 부킹 올리기의 '자리' 한 칸(2026-09-23 오너: "넘길 자리 라는 말이 너무 이해가 안 돼. 부킹 매니저도 뭔 소리인가 하겠어.
 * 차라리 선택 시 팝업창 띄워서 이미지 들어가게 이해되게 편하게").
 *
 * 묻는 것은 하나다 — **한 팀 네 자리 중 몇 자리를 앱이 채워 주느냐**. 그 답에 따라 결과가 갈린다:
 * 4자리면 팀이 통째로 비어 있으니 예전 그대로의 '부킹', 1~3자리면 나머지는 이미 찼으니 '조인'으로 올라간다.
 * 그래서 숫자만 있는 칩을 버리고 칩마다 결과 한 줄을 붙였고(부킹/조인 꼬리표까지), 말로 안 되는 부분은 그림으로 그린다.
 *
 * 그림은 인라인 SVG 다 — 네 자리를 그려 놓고 고른 수만큼 라임 점선(앱이 채움), 나머지는 사람이 앉은 회색 자리.
 * 고른 값이 바뀌면 그림이 바뀐다. 정적인 한 장은 "그래서 내가 고른 게 뭔데"를 답해 주지 못한다.
 *
 * 색은 라임 하나만 쓴다(예전의 파란 안내 상자는 강조색을 하나 더 늘렸다 — 오너가 싫어한 그 색감).
 */
import { useState } from "react";
import { LucideX, LucideChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SLOTS } from "@shared/golfJoin";

const LIME = "#64DD17";

/** 자리 넷 그림. open = 앱이 채울 자리 수. 찬 자리를 왼쪽, 앱이 채울 자리를 오른쪽에 둔다. */
export function SeatDiagram({ open }: { open: number }) {
    const taken = MAX_SLOTS - open;
    return (
        <svg viewBox="0 0 300 86" className="w-full h-auto" role="img" aria-label={`네 자리 중 ${open}자리를 앱이 채우고 ${taken}자리는 이미 찼어요`}>
            {Array.from({ length: MAX_SLOTS }, (_, i) => {
                const isOpen = i >= taken;
                const x = i * 78;
                const cx = x + 33;
                return (
                    <g key={i}>
                        <rect
                            x={x + 0.75} y={0.75} width={64.5} height={84.5 - 4} rx={14}
                            fill={isOpen ? "rgba(100,221,23,0.10)" : "#242629"}
                            stroke={isOpen ? LIME : "#34373c"}
                            strokeWidth={1.25}
                            strokeDasharray={isOpen ? "5 4" : undefined}
                        />
                        {isOpen ? (
                            <>
                                <circle cx={cx} cy={36} r={15} fill="rgba(100,221,23,0.16)" />
                                <path d={`M ${cx - 7} 36 H ${cx + 7} M ${cx} 29 V 43`} stroke={LIME} strokeWidth={2.4} strokeLinecap="round" />
                            </>
                        ) : (
                            <>
                                <circle cx={cx} cy={28} r={8.5} fill="#8b9099" />
                                <path d={`M ${cx - 13} 54 a 13 13 0 0 1 26 0 z`} fill="#8b9099" />
                            </>
                        )}
                        <text x={cx} y={70} textAnchor="middle" fontSize={10.5} fill="#8b9099">
                            {isOpen ? "앱이 채움" : "찬 자리"}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/** 칩에 붙는 결과 한 줄 — 숫자만 있으면 무엇을 고르는 건지 모른다. */
const SEAT_CHOICES = [4, 3, 2, 1].map((n) => ({
    n,
    desc: n === MAX_SLOTS ? "네 자리 모두 비어요" : `${MAX_SLOTS - n}자리는 이미 찼어요`,
    tag: n === MAX_SLOTS ? "부킹" : "조인",
}));

function headline(n: number): string {
    return n === MAX_SLOTS
        ? "네 자리가 다 비어 있어요 — 통째로 넘겨요"
        : `${MAX_SLOTS - n}자리는 이미 찼고, ${n}자리만 앱이 채워요`;
}

export function SeatsField({ seats, onChange }: { seats: number; onChange: (n: number) => void }) {
    const [guide, setGuide] = useState(false);
    // 오너: "선택 시 팝업". 헷갈리는 쪽(1~3자리 = 조인으로 바뀌는 선택)을 처음 고를 때 한 번만 저절로 연다.
    // 매니저의 기본 동작은 여러 타임 일괄 등록이라, 칩을 누를 때마다 뜨면 그게 곧 마찰이다.
    const [autoShown, setAutoShown] = useState(false);

    const pick = (n: number) => {
        onChange(n);
        if (n < MAX_SLOTS && !autoShown) { setAutoShown(true); setGuide(true); }
    };

    return (
        <>
            <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-white/50">앱에서 채울 자리</span>
                <button
                    type="button" onClick={() => setGuide(true)} aria-label="자리가 무엇인지 보기"
                    className="shrink-0 w-6 h-6 -my-1 inline-flex items-center justify-center text-white/55"
                ><span className="w-[18px] h-[18px] rounded-full border border-white/20 text-[11px] leading-none inline-flex items-center justify-center">?</span></button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                {SEAT_CHOICES.map(({ n, desc, tag }) => {
                    const on = seats === n;
                    return (
                        <button
                            key={n} type="button" onClick={() => pick(n)} aria-pressed={on}
                            className={cn(
                                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                                on ? "bg-[#64DD17] border-[#64DD17]" : "bg-white/[0.04] border-white/10",
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className={cn("text-[15px] font-semibold", on ? "text-[#051907]" : "text-white")}>{n}자리</span>
                                <span
                                    className={cn(
                                        "ml-auto h-[18px] px-1.5 rounded-full text-[10.5px] font-medium inline-flex items-center",
                                        on ? "bg-[#051907]/15 text-[#0b2d0e]" : "bg-white/[0.07] text-white/55",
                                    )}
                                >{tag}</span>
                            </span>
                            <span className={cn("block mt-0.5 text-[11.5px] break-keep", on ? "text-[#0b2d0e]/75" : "text-white/45")}>{desc}</span>
                        </button>
                    );
                })}
            </div>

            {/* 그림을 시트 안에 그대로 둔다 — 눌러야 보이는 설명은 안 누르는 사람에게는 없는 것과 같다. */}
            <button
                type="button" onClick={() => setGuide(true)}
                className="w-full rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 pt-3 pb-2"
            >
                <SeatDiagram open={seats} />
                <span className="mt-1.5 flex items-center justify-center gap-0.5 text-[11.5px] text-white/55">
                    이게 무슨 뜻인가요 <LucideChevronRight className="w-3.5 h-3.5" />
                </span>
            </button>

            {guide && (
                <div className="absolute inset-0 z-40 flex items-end bg-black/65" onClick={() => setGuide(false)}>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-h-full overflow-y-auto rounded-t-2xl bg-[#1E1E1E] border-t border-white/10 px-5 pt-4 pb-5 animate-in slide-in-from-bottom duration-200"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[15.5px] font-semibold text-white">자리, 이렇게 정해요</h3>
                            <button type="button" onClick={() => setGuide(false)} aria-label="닫기" className="p-2 -mr-2 text-white/45"><LucideX className="w-[18px] h-[18px]" /></button>
                        </div>

                        <p className="text-[12px] text-white/45 mb-2">한 팀은 네 자리예요</p>
                        <SeatDiagram open={seats} />

                        <p className="mt-4 text-[14px] text-white leading-relaxed break-keep">{headline(seats)}</p>
                        <p className="mt-1.5 text-[12.5px] text-white/55 leading-relaxed break-keep">
                            {seats === MAX_SLOTS
                                ? "팀 하나를 통째로 넘기는 거예요. 지금까지 올리시던 부킹과 똑같아요."
                                : "이미 찬 자리는 그대로 두고, 빈자리만 앱이 사람을 찾아 줘요. 목록에는 조인으로 올라가요."}
                        </p>
                        <p className="mt-1.5 text-[12.5px] text-white/55 leading-relaxed break-keep">
                            그린피는 적어 주신 1인 가격으로 각자 내고, 카트비·캐디피는 현장에서 네 명이 N빵해요.
                        </p>
                        <p className="mt-1.5 text-[12px] text-white/40 leading-relaxed break-keep">
                            골프장에 따라 2·3인은 조인 의무이거나 4인 요금일 수 있어요.
                        </p>

                        <div className="mt-4 grid grid-cols-4 gap-1.5">
                            {SEAT_CHOICES.map(({ n }) => (
                                <button
                                    key={n} type="button" onClick={() => onChange(n)} aria-pressed={seats === n}
                                    className={cn(
                                        "h-9 rounded-lg text-[13px] font-medium border transition-colors",
                                        seats === n ? "bg-[#64DD17] border-[#64DD17] text-[#051907]" : "bg-white/[0.04] border-white/10 text-white/65",
                                    )}
                                >{n}자리</button>
                            ))}
                        </div>
                        <button
                            type="button" onClick={() => setGuide(false)}
                            className="mt-2.5 w-full h-11 rounded-xl bg-white/[0.11] text-[14px] font-medium text-white/90"
                        >이대로 할게요</button>
                    </div>
                </div>
            )}
        </>
    );
}
