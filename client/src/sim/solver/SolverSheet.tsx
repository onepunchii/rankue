import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CushionId } from "@shared/sim/types";
import { DEFAULT_CUE } from "@shared/sim/params";
import { thicknessLabel } from "../overlay/paths";
import { formatSpeed } from "../controlsMath";
import type { AimLabel, SolveCandidate, SolveProgress } from "./search";
import type { SolverStatus } from "./useSolver";

/**
 * 해법 시트(아래에서 올라오는 시트, InningSheet 와 같은 틀). 상태 한 줄 + 상위 3개 후보.
 * 후보 줄: 조준(첫 접촉 공·두께·좌/우 또는 뱅크) / 세기 / 당점 / 쿠션 수 / 오차 허용 — [경로 보기] [적용].
 *  - onPreview(candidate | null): "경로 보기" 토글. 페이지가 candidate.result 를 buildPreviewPaths 에 넣어 오버레이에 그린다.
 *    한 번에 하나만 켜지고, 시트를 닫거나 후보 목록이 바뀌면 null 로 되돌린다.
 *  - onApply(candidate): 페이지가 actions.setInput({ phi, V0, a, b, theta: 0 }) 하고 시트를 닫는다.
 *  - onCancel/onRetry 는 선택: 있으면 찾는 중 "중단", 끝난 뒤 "다시 찾기"(idle 이면 "찾기") 버튼을 그린다.
 * 시트 높이는 테이블 위쪽이 보이게 낮게 잡았다(경로를 보면서 고를 수 있게). 토큰만, 텍스트 12 px 이상, 탭 대상 44 px.
 */
export interface SolverSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    status: SolverStatus;
    progress: SolveProgress | null;
    candidates: readonly SolveCandidate[];
    onApply: (candidate: SolveCandidate) => void;
    onPreview: (candidate: SolveCandidate | null) => void;
    onCancel?: () => void;
    onRetry?: () => void;
}

/** 화면에 내는 후보 수. */
export const SHEET_TOP_N = 3;

const BALL_KEYS: Readonly<Record<string, string>> = {
    white: "sim.solver.ball.white",
    yellow: "sim.solver.ball.yellow",
    red: "sim.solver.ball.red",
    red1: "sim.solver.ball.red1",
    red2: "sim.solver.ball.red2",
};
const CUSHION_KEYS: Readonly<Record<CushionId, string>> = {
    left: "sim.solver.cushion.left",
    right: "sim.solver.cushion.right",
    bottom: "sim.solver.cushion.bottom",
    top: "sim.solver.cushion.top",
};

type T = (key: string) => string;

/** 조준 문구: "빨간 공 · ½ · 우" / "뱅크 먼저 · 오른쪽 쿠션" / "직접 조준". */
export function aimText(aim: AimLabel, t: T): string {
    if (aim.kind === "ball") {
        const name = BALL_KEYS[aim.id] ? t(BALL_KEYS[aim.id]) : aim.id;
        const th = thicknessLabel(aim.thickness, 0.035, t("sim.aim.fullBall"));
        const side = aim.side === "left" ? t("sim.controls.sideLeft") : aim.side === "right" ? t("sim.controls.sideRight") : "";
        return side ? `${name} · ${th} · ${side}` : `${name} · ${th}`;
    }
    if (aim.kind === "bank") return `${t("sim.solver.bankFirst")} · ${t(CUSHION_KEYS[aim.cushion])}`;
    return t("sim.solver.aimNone");
}

/** 당점 문구: "우 60% · 상 50%" / "당점 중앙". 100 % = 미스큐 한계(maxOffset·R). */
export function spinText(a: number, b: number, maxOffset: number, t: T): string {
    const pct = (v: number) => String(Math.round((Math.abs(v) / maxOffset) * 100));
    const parts: string[] = [];
    if (Math.abs(a) >= 0.01) parts.push(t(a > 0 ? "sim.solver.spinRight" : "sim.solver.spinLeft").replace("{n}", pct(a)));
    if (Math.abs(b) >= 0.01) parts.push(t(b > 0 ? "sim.solver.spinTop" : "sim.solver.spinBottom").replace("{n}", pct(b)));
    return parts.length ? parts.join(" · ") : t("sim.solver.spinCenter");
}

export function statusText(status: SolverStatus, progress: SolveProgress | null, found: number, t: T): string {
    const tried = String(progress?.tried ?? 0);
    switch (status) {
        case "running":
            return t("sim.solver.searching").replace("{n}", tried);
        case "done":
            return found > 0
                ? t("sim.solver.done").replace("{n}", tried).replace("{m}", String(found))
                : t("sim.solver.none");
        case "error":
            return t("sim.solver.error");
        default:
            return t("sim.solver.idle");
    }
}

const BTN_SECONDARY = "h-11 rounded-tile border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none";

export const SolverSheet = memo(function SolverSheet(p: SolverSheetProps) {
    const { t } = useT();
    const { open, onOpenChange, status, progress, candidates, onApply, onPreview, onCancel, onRetry } = p;
    const [previewIdx, setPreviewIdx] = useState<number | null>(null);
    const previewRef = useRef<number | null>(null);
    previewRef.current = previewIdx;
    const onPreviewRef = useRef(onPreview);
    onPreviewRef.current = onPreview;

    // 후보 목록이 바뀌면(새 탐색) 켜져 있던 경로를 끈다. 배열 참조가 아니라 내용(시도 번호·해시)으로 비교해
    // 페이지가 렌더마다 새 배열을 넘겨도 토글이 풀리지 않는다.
    const signature = candidates.slice(0, SHEET_TOP_N).map((c) => `${c.tried}:${c.result.hash}`).join(",");
    useEffect(() => {
        if (previewRef.current !== null) {
            setPreviewIdx(null);
            onPreviewRef.current(null);
        }
    }, [signature]);

    const handleOpenChange = useCallback((o: boolean) => {
        if (!o && previewRef.current !== null) {
            setPreviewIdx(null);
            onPreviewRef.current(null);
        }
        onOpenChange(o);
    }, [onOpenChange]);

    const togglePreview = useCallback((i: number) => {
        const next = previewRef.current === i ? null : i;
        setPreviewIdx(next);
        onPreview(next === null ? null : candidates[next]);
    }, [candidates, onPreview]);

    const rows = candidates.slice(0, SHEET_TOP_N);
    const running = status === "running";
    const showRetry = !!onRetry && !running;

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent side="bottom" hideClose className="rounded-t-card p-0 max-h-[56dvh] flex flex-col gap-0 pb-safe">
                <SheetHeader className="shrink-0 px-6 pt-5 pb-2 text-left">
                    <div className="flex items-center gap-3">
                        <SheetTitle className="flex-1 min-w-0 text-[17px] font-bold text-ink-1">{t("sim.solver.title")}</SheetTitle>
                        {/* 기본 16 px X(영문 sr-only) 대신 44 px 닫기 알약 */}
                        <button
                            type="button" onClick={() => handleOpenChange(false)}
                            className="h-11 px-4 shrink-0 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3"
                        >
                            {t("sim.common.close")}
                        </button>
                    </div>
                    <SheetDescription className="text-[13px] font-medium text-ink-3">{t("sim.solver.desc")}</SheetDescription>
                </SheetHeader>

                <div className="shrink-0 px-6 pb-2 flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-[13px] font-semibold text-ink-2 rk-num" aria-live="polite">
                        {statusText(status, progress, candidates.length, t)}
                    </p>
                    {running && onCancel && (
                        <button type="button" onClick={onCancel} className={cn(BTN_SECONDARY, "px-4 shrink-0")}>
                            {t("sim.solver.cancel")}
                        </button>
                    )}
                    {showRetry && (
                        <button type="button" onClick={onRetry} className={cn(BTN_SECONDARY, "px-4 shrink-0")}>
                            {t(status === "idle" ? "sim.solver.start" : "sim.solver.retry")}
                        </button>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6">
                    {rows.length === 0 ? (
                        status === "done" ? (
                            <p className="py-6 text-center text-[13px] font-medium text-ink-4">{t("sim.solver.noneHint")}</p>
                        ) : null
                    ) : (
                        <ol className="flex flex-col">
                            {rows.map((c, i) => {
                                const on = previewIdx === i;
                                const details = [
                                    `${formatSpeed(c.input.V0)} m/s`,
                                    spinText(c.input.a, c.input.b, DEFAULT_CUE.maxOffset, t),
                                    t("sim.solver.cushions").replace("{n}", String(c.outcome.cushionsBeforeSecond)),
                                ];
                                if (c.robustness !== null) details.push(t("sim.solver.margin").replace("{n}", String(Math.round(c.robustness * 100))));
                                return (
                                    <li key={`${c.tried}-${i}`} className={cn("py-3", i > 0 && "border-t border-surface-line")}>
                                        <div className="flex items-start gap-3">
                                            <span className="rk-num w-6 shrink-0 pt-0.5 text-[13px] font-bold text-ink-3">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-semibold text-ink-1 truncate">{aimText(c.aim, t)}</p>
                                                <p className="mt-0.5 text-[12px] font-medium text-ink-3 rk-num">{details.join(" · ")}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex gap-2 pl-9">
                                            <button
                                                type="button" aria-pressed={on} onClick={() => togglePreview(i)}
                                                className={cn(
                                                    "h-11 flex-1 rounded-tile border text-[13px] font-semibold",
                                                    on ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-2",
                                                )}
                                            >
                                                {t(on ? "sim.solver.previewOn" : "sim.solver.preview")}
                                            </button>
                                            <button
                                                type="button" onClick={() => onApply(c)}
                                                className="h-11 flex-1 rounded-tile bg-brand text-brand-fg text-[13px] font-semibold active:bg-brand-strong"
                                            >
                                                {t("sim.solver.apply")}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
});
