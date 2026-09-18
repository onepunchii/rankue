import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { InningRow } from "../inningLog";

/**
 * 오른쪽 세로 이닝 점수판(2026-09-18 오너: 상대 차례에 비는 오른쪽 여백에 "필요한 정보").
 *
 * 왜 이 자리에 이 모양인가: 오른쪽 열은 내 차례엔 조작 버튼 자리인데, 상대 차례엔 버튼이 사라져 세로로 긴 빈 띠가 된다.
 * 당구장 벽에 걸린 점수판이 정확히 그 모양이다 — 이닝마다 한 줄, 선수마다 한 칸. 억지로 끼운 정보가 아니라
 * 원래 세로로 읽는 정보다. 랭큐의 핵심("손안의 당구 점수판")과도 같고, 지금까지는 헤더를 눌러야만 열렸다.
 *
 * 규칙: 득점은 숫자, 0점은 가운데 점(·), 아직 치지 않은 칸은 비운다. 각자의 하이런(이닝 최고 득점)은 강조한다.
 * 칸 나눔도 실제 점수판처럼(2026-09-18 오너): 선수 사이는 **위아래로 끝까지 이어지는 세로선**, 이닝 사이는 가로선.
 * 세로선을 행마다 긋지 않고 한 줄로 따로 둔 이유 — 이닝이 적을 때 위쪽 빈 공간에서 선이 끊겨 보이지 않게.
 * 칸 순서는 헤더와 같다 — 왼쪽이 나, 오른쪽이 상대. 새 이닝은 아래에 붙고, 넘치면 오래된 이닝이 위로 잘린다
 * (실제 점수판처럼 아래로 채워 간다. 높이를 재지 않고 justify-end + overflow-hidden 으로 해결한다).
 *
 * **누를 수 없다(pointer-events-none).** 이 자리는 내 차례엔 조작 버튼이 쓰는 자리라 두 기능이 번갈아 쓴다 —
 * 2026-09-15 사고(안 보이는 버튼이 탭을 가로챈 것)가 바로 이런 자리에서 났다. 자세한 이닝 시트는 헤더가 연다.
 */
export const MatchScoreStrip = memo(function MatchScoreStrip({ rows, order, balls, className, style }: {
    rows: readonly InningRow[];
    /** 화면 칸 순서 [왼쪽, 오른쪽] = [나, 상대] 의 선수 자리 번호 */
    order: readonly [number, number];
    /** 칸 머리의 공 색(헤더와 같은 표시) */
    balls: readonly ["white" | "yellow", "white" | "yellow"];
    className?: string;
    style?: React.CSSProperties;
}) {
    const { t } = useT();
    // 하이런 — 선수마다 이닝 최고 득점(0 은 하이런이 아니다)
    const high = order.map((p) => rows.reduce((m, r) => Math.max(m, r.cells[p] ?? 0), 0));
    const current = rows.length;
    return (
        <div
            aria-label={t("sim.controls.innings")}
            className={cn(
                "pointer-events-none flex flex-col rounded-tile bg-surface-1 border border-surface-line overflow-hidden",
                className,
            )}
            style={style}
        >
            <div className="shrink-0 px-1 pt-1.5 pb-1 flex flex-col items-center gap-1 border-b border-surface-line">
                <span className="text-[9.5px] font-semibold text-ink-3 leading-none">
                    {t("sim.hud.inning")} <span className="rk-num text-ink-2">{current}</span>
                </span>
                <span className="w-full grid grid-cols-2">
                    {balls.map((b, i) => (
                        <span key={i} className={cn("flex justify-center", i === 0 && "border-r border-surface-line")}>
                            <span className={cn("w-[9px] h-[9px] rounded-pill", b === "white" ? "bg-ball-white border border-surface-line-strong" : "bg-ball-yellow")} />
                        </span>
                    ))}
                </span>
            </div>
            <div className="relative flex-1 min-h-0 flex flex-col justify-end overflow-hidden px-1 pb-1">
                {/* 선수 사이 세로선 — 이닝 수와 상관없이 위아래로 끝까지 */}
                <span aria-hidden="true" className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-surface-line" />
                {rows.map((r, i) => (
                    <div
                        key={r.inning}
                        /* 이닝 사이 가로선 — 맨 위 줄에는 긋지 않는다(머리 아래 선이 이미 있다) */
                        className={cn("relative shrink-0 grid grid-cols-2 h-[22px] items-center", i > 0 && "border-t border-surface-line")}
                    >
                        {order.map((p, col) => {
                            const v = r.cells[p];
                            const isHigh = v !== null && v > 0 && v === high[col];
                            return (
                                <span
                                    key={col}
                                    className={cn(
                                        "rk-num text-center text-[13px] leading-none",
                                        v === null ? "text-transparent" : v === 0 ? "text-ink-4" : "font-bold text-ink-1",
                                        isHigh && "text-brand",
                                    )}
                                >
                                    {v === null ? "·" : v === 0 ? "·" : v}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
});
