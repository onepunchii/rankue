import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SolveCandidate, SolveProgress } from "./search";
import type { SolverStatus } from "./useSolver";
import { aimText, spinText } from "./SolverSheet";
import { powerPercent } from "../controlsMath";
import { bestCandidate, cushionCount, successPct } from "./bestPath";

/**
 * 길 찾기 화면의 아래 카드(2026-09-08 오너: 두께 독 대신 "가장 성공 확률이 높은 길"을 보여 준다).
 * 후보 중 오차 허용(robustness)이 가장 큰 것을 고른다 — 점수는 안전·쉬움까지 섞은 값이라 "잘 들어가는 길"과 다르다.
 * 상태: 찾기 전(안내 + 길 찾기) · 찾는 중(진행) · 찾음(길 한 줄 + 경로 보기·이대로 쳐 보기·다른 길) · 못 찾음.
 */
export interface BestPathCardProps {
    status: SolverStatus;
    progress: SolveProgress | null;
    candidates: readonly SolveCandidate[];
    /** 미스큐 한계(당점 문구 백분율의 기준) */
    maxOffset: number;
    /** 지금 경로를 보여 주고 있는 후보인지 */
    previewing: boolean;
    onSearch: () => void;
    onPreview: (c: SolveCandidate | null) => void;
    onApply: (c: SolveCandidate) => void;
    onMore: () => void;
    className?: string;
}

const CARD = "rounded-card border border-surface-line bg-surface-1 rk-shadow px-4 py-3";
// 카드 폭이 좁다(오른쪽 큐 슬라이더 자리를 뺀 나머지) — 글자를 줄바꿈 없이 한 줄로
const BTN = "h-10 px-3 shrink-0 rounded-pill text-[12px] font-semibold whitespace-nowrap border border-surface-line text-ink-2 active:bg-surface-3";
const PRIMARY = "h-10 px-3.5 shrink-0 rounded-pill text-[12.5px] font-semibold whitespace-nowrap bg-brand text-brand-fg active:bg-brand-strong";

export const BestPathCard = memo(function BestPathCard(p: BestPathCardProps) {
    const { t } = useT();
    const best = bestCandidate(p.candidates);

    if (p.status === "running") {
        return (
            <div className={cn(CARD, p.className)}>
                <p className="text-[13px] font-semibold text-ink-1">{t("sim.path.searching")}</p>
                <p className="rk-num text-[12px] font-medium text-ink-3 mt-0.5">{String(p.progress?.tried ?? 0)}</p>
            </div>
        );
    }
    if (!best) {
        return (
            <div className={cn(CARD, "flex items-center justify-between gap-3", p.className)}>
                <p className="text-[13px] font-medium text-ink-2 min-w-0">
                    {p.status === "done" ? t("sim.path.none") : t("sim.path.hint")}
                </p>
                <button type="button" onClick={p.onSearch} className={PRIMARY}>
                    {t("sim.path.title")}
                </button>
            </div>
        );
    }

    const pct = successPct(best);
    return (
        <div className={cn(CARD, p.className)}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink-3">{t("sim.path.best")}</p>
                {pct !== null && (
                    <p className="rk-num text-[11px] font-semibold text-ink-3">
                        {t("sim.path.success").replace("{n}", String(pct))}
                    </p>
                )}
            </div>
            <p className="text-[15px] font-bold text-ink-1 truncate mt-0.5">{aimText(best.aim, t)}</p>
            <p className="text-[12px] font-medium text-ink-3 truncate mt-0.5">
{`${powerPercent(best.input.V0)}%`}
                {" · "}{spinText(best.input.a, best.input.b, p.maxOffset, t)}
                {" · "}{t("sim.solver.cushions").replace("{n}", String(cushionCount(best)))}
            </p>
            <div className="flex items-center gap-1.5 mt-2.5">
                <button type="button" onClick={() => p.onPreview(p.previewing ? null : best)} className={cn(BTN, p.previewing && "border-brand text-brand")}>
                    {t("sim.solver.preview")}
                </button>
                <button type="button" onClick={() => p.onApply(best)} className={PRIMARY}>
                    {t("sim.path.apply")}
                </button>
                {p.candidates.length > 1 && (
                    <button type="button" onClick={p.onMore} className={cn(BTN, "ml-auto")}>
                        {t("sim.path.more").replace("{n}", String(p.candidates.length))}
                    </button>
                )}
            </div>
        </div>
    );
});

export default BestPathCard;
