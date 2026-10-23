import { useEffect, useRef } from "react";
import { LucideX } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** 득점표 한 줄 — 치는 순서(초구부터)로 넘긴다 */
export interface InningRow {
    slot: 1 | 2 | 3 | 4;
    name: string;
    /** 공 색(카드와 같은 값) */
    color: string;
    /** 끝난 이닝의 득점 */
    innings: number[];
    /** 지금 치는 중이면 그 이닝의 득점(아니면 null) */
    live: number | null;
    score: number;
    avg: string;
    highRun: number;
    isBreaker: boolean;
}

interface Props {
    open: boolean;
    rows: InningRow[];
    /** 지금 이닝 */
    inning: number;
    onClose: () => void;
}

/**
 * 이닝별 득점표(2026-10-23 오너: "이닝별 득점표"). 이닝 공(하단 바)을 누르면 뜬다 — 관전 화면도 같다.
 * 예전 창(Radix Dialog)은 빈 안내뿐이었고 여는 길도 없었다. 게다가 body 에 뜨는 창은 세로로 든 폰에서 점수판 상자(LandscapeGuard — zIndex 9999)
 * 밑에 깔린다 — 그래서 점수판 상자 **안**에 그린다(종료 확인창과 같은 자리 · 같은 층).
 *
 * 줄 = 선수(치는 순서), 칸 = 이닝. 지금 치는 칸은 초록 테두리, 끝난 0 은 흐리게, 파울로 내려간 칸은 빨강. 오른쪽에 합계 · 에버 · 하이런.
 * 이닝이 많으면 옆으로 밀린다 — 열 때 마지막 이닝이 보이게 끝으로 민다.
 */
export function InningHistoryModal({ open, rows, inning, onClose }: Props) {
    const { t } = useT();
    const scroller = useRef<HTMLDivElement | null>(null);
    const cols = Math.max(inning, ...rows.map((r) => r.innings.length + (r.live !== null ? 1 : 0)), 1);

    useEffect(() => {
        if (!open) return;
        const el = scroller.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [open, cols]);

    if (!open) return null;
    const nums = Array.from({ length: cols }, (_, i) => i + 1);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("inningHistoryModal.title")}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            onClick={onClose}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 py-3"
            data-testid="board-innings"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[920px] max-h-full flex flex-col rounded-[22px] bg-surface-1 border border-surface-line shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden"
            >
                <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
                    <h2 className="text-[17px] font-bold text-ink-1">{t("inningHistoryModal.title")}</h2>
                    <span className="text-[13px] font-semibold text-ink-3 tabular-nums">
                        {t("inningHistoryModal.totalInningsPrefix")}{inning}{t("inningHistoryModal.totalInningsSuffix")}
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        autoFocus
                        onClick={onClose}
                        aria-label={t("inningHistoryModal.close")}
                        className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-3"
                    >
                        <LucideX className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex min-h-0 border-t border-surface-line">
                    {/* 왼쪽: 이름(고정) */}
                    <div className="shrink-0 border-r border-surface-line">
                        <div className="h-9 px-4 flex items-center text-[12px] font-medium text-ink-4">{t("scoreboardBottomBar.inning")}</div>
                        {rows.map((r) => (
                            <div key={r.slot} className="h-12 px-4 flex items-center gap-2 border-t border-surface-line max-w-[180px]">
                                <span className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/15" style={{ backgroundColor: r.color }} />
                                <span className="text-[14px] font-semibold text-ink-1 truncate">{r.name}</span>
                                {r.isBreaker && <span className="shrink-0 text-[11px] font-bold text-ink-4">{t("playerCard.breakShot")}</span>}
                            </div>
                        ))}
                    </div>

                    {/* 가운데: 이닝 칸(옆으로 밀린다) */}
                    <div ref={scroller} className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:thin]">
                        <div className="inline-block min-w-full">
                            <div className="h-9 flex">
                                {nums.map((n) => (
                                    <div key={n} className={cn("w-11 shrink-0 flex items-center justify-center text-[12px] tabular-nums", n === inning ? "font-bold text-brand" : "font-medium text-ink-4")}>{n}</div>
                                ))}
                            </div>
                            {rows.map((r) => (
                                <div key={r.slot} className="h-12 flex border-t border-surface-line">
                                    {nums.map((n) => {
                                        const i = n - 1;
                                        const done = i < r.innings.length;
                                        const isLive = !done && i === r.innings.length && r.live !== null;
                                        const v = done ? r.innings[i] : isLive ? r.live! : null;
                                        return (
                                            <div key={n} className="w-11 shrink-0 flex items-center justify-center">
                                                {v !== null && (
                                                    <span
                                                        className={cn(
                                                            "min-w-8 h-8 px-1 rounded-lg flex items-center justify-center text-[15px] tabular-nums",
                                                            isLive && "ring-2 ring-brand font-bold text-ink-1",
                                                            !isLive && v > 0 && "font-bold text-ink-1",
                                                            !isLive && v === 0 && "font-medium text-ink-4",
                                                            v < 0 && "font-bold text-red-500",
                                                        )}
                                                        data-live={isLive || undefined}
                                                    >{v}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 오른쪽: 합계 · 에버 · 하이런(고정) */}
                    <div className="shrink-0 border-l border-surface-line">
                        <div className="h-9 flex text-[12px] font-medium text-ink-4">
                            <span className="w-14 flex items-center justify-center">{t("inningHistoryModal.total")}</span>
                            <span className="w-14 flex items-center justify-center">{t("playerCard.average")}</span>
                            <span className="w-14 flex items-center justify-center">{t("playerCard.highRun")}</span>
                        </div>
                        {rows.map((r) => (
                            <div key={r.slot} className="h-12 flex border-t border-surface-line text-[15px] tabular-nums">
                                <span className="w-14 flex items-center justify-center font-bold text-ink-1">{r.score}</span>
                                <span className="w-14 flex items-center justify-center font-semibold text-ink-2">{r.avg}</span>
                                <span className="w-14 flex items-center justify-center font-semibold text-ink-2">{r.highRun}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="px-5 py-2.5 border-t border-surface-line text-[12px] text-ink-4 shrink-0">{t("inningHistoryModal.liveHint")}</p>
            </div>
        </div>
    );
}
