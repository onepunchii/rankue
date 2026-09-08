import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SolveCandidate, SolveProgress } from "./search";
import type { SolverStatus } from "./useSolver";
import { aimText } from "./SolverSheet";
import { powerPercent } from "../controlsMath";
import { cushionCount, successPct } from "./bestPath";

/**
 * 길 찾기 화면의 아래 카드(2026-09-08 오너). 지금 고른 길 하나를 크게 보여 준다 — 성공률·조준·당점(그림)·세기(막대)·쿠션.
 * 조작(당점·세기·샷)은 이 화면에 없다. "이대로 쳐 보기" 가 적용과 재생을 한 번에 하고, 직접 치고 싶으면 "이 배치로 연습" 으로 넘어간다.
 * 길 고르기는 오른쪽 바(길 1·2·3)가 한다.
 */
export interface BestPathCardProps {
    status: SolverStatus;
    progress: SolveProgress | null;
    /** 지금 고른 길. 없으면 안내를 보여 준다. */
    candidate: SolveCandidate | null;
    /** 찾은 길 수(오른쪽 바와 같은 수) */
    count: number;
    /** 미스큐 한계(당점 그림의 기준) */
    maxOffset: number;
    onSearch: () => void;
    onPlay: (c: SolveCandidate) => void;
    onPractice: () => void;
    className?: string;
}

const CARD = "rounded-card border border-surface-line bg-surface-1 rk-shadow px-4 py-3";
const BTN = "h-10 px-3 shrink-0 rounded-pill text-[12px] font-semibold whitespace-nowrap border border-surface-line text-ink-2 active:bg-surface-3";
const PRIMARY = "h-10 px-3.5 shrink-0 rounded-pill text-[12.5px] font-semibold whitespace-nowrap bg-brand text-brand-fg active:bg-brand-strong";

/** 당점 그림: 공 위의 점 하나(미스큐 한계를 반지름 1로 본다). */
function SpinDot({ a, b, maxOffset }: { a: number; b: number; maxOffset: number }) {
    const r = 13;
    const x = 16 + (a / maxOffset) * r;
    const y = 16 - (b / maxOffset) * r;
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
            <circle cx="16" cy="16" r={r} className="fill-ball-white" stroke="var(--surface-line-strong)" strokeWidth="1" />
            <circle cx={x} cy={y} r="3.2" className="fill-brand" />
        </svg>
    );
}

export const BestPathCard = memo(function BestPathCard(p: BestPathCardProps) {
    const { t } = useT();
    const c = p.candidate;

    if (p.status === "running") {
        return (
            <div className={cn(CARD, p.className)}>
                <p className="text-[13px] font-semibold text-ink-1">{t("sim.path.searching")}</p>
                <p className="rk-num text-[12px] font-medium text-ink-3 mt-0.5">{String(p.progress?.tried ?? 0)}</p>
            </div>
        );
    }
    if (!c) {
        return (
            <div className={cn(CARD, "flex items-center justify-between gap-3", p.className)}>
                <p className="text-[13px] font-medium text-ink-2 min-w-0">
                    {p.status === "done" ? t("sim.path.none") : t("sim.path.hint")}
                </p>
                <button type="button" onClick={p.onSearch} className={PRIMARY}>{t("sim.path.title")}</button>
            </div>
        );
    }

    const pct = successPct(c);
    const power = powerPercent(c.input.V0);
    return (
        <div className={cn(CARD, p.className)}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[15px] font-bold text-ink-1 truncate">{aimText(c.aim, t)}</p>
                {pct !== null && (
                    <p className="rk-num shrink-0 text-[12px] font-semibold text-brand">{t("sim.path.success").replace("{n}", String(pct))}</p>
                )}
            </div>
            <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1.5">
                    <SpinDot a={c.input.a} b={c.input.b} maxOffset={p.maxOffset} />
                    <span className="text-[11px] font-medium text-ink-3">{t("sim.path.spin")}</span>
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between">
                        <span className="text-[11px] font-medium text-ink-3">{t("sim.path.power")}</span>
                        <span className="rk-num text-[12px] font-semibold text-ink-1">{power}%</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-pill bg-surface-3 overflow-hidden">
                        <span className="block h-full rounded-pill bg-ink-1" style={{ width: `${Math.max(2, Math.min(100, power))}%` }} />
                    </span>
                    <span className="mt-1 block rk-num text-[11px] font-medium text-ink-3">
                        {t("sim.solver.cushions").replace("{n}", String(cushionCount(c)))}
                    </span>
                </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
                <button type="button" onClick={() => p.onPlay(c)} className={PRIMARY}>{t("sim.path.apply")}</button>
                <button type="button" onClick={p.onPractice} className={cn(BTN, "ml-auto")}>{t("sim.path.practice")}</button>
            </div>
        </div>
    );
});

export default BestPathCard;
