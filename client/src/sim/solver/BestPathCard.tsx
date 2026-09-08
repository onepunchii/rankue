import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SolveCandidate, SolveProgress } from "./search";
import type { SolverStatus } from "./useSolver";
import { aimText } from "./SolverSheet";
import { powerPercent } from "../controlsMath";
import { cushionCount, marginLevel, successPct, tipSpot } from "./bestPath";

/**
 * 길 찾기 화면의 아래 카드(2026-09-08 오너). 지금 고른 길 하나를 크게 보여 준다 — 성공률·조준·당점(그림)·세기(막대)·쿠션.
 * 버튼은 두지 않는다 — 길 고르기는 오른쪽 바(길 1·2·3), 재생은 오른쪽 아래 샷 버튼이 한다(2026-09-08 오너: 카드가 높아 테이블 아래가 잘렸다).
 */
export interface BestPathCardProps {
    status: SolverStatus;
    progress: SolveProgress | null;
    /** 지금 고른 길. 없으면 안내를 보여 준다. */
    candidate: SolveCandidate | null;
    /** 미스큐 한계(당점 그림의 기준) */
    maxOffset: number;
    onSearch: () => void;
    /** 고른 길 그대로 치기(카드 안의 샷 버튼) */
    onShoot: () => void;
    /** 재생 중이면 샷을 막는다 */
    shooting: boolean;
    className?: string;
}

const CARD = "rounded-card border border-surface-line bg-surface-1 rk-shadow px-4 py-3";
const CELL = "flex-1 min-w-0 flex items-center gap-1.5 rounded-tile bg-surface-3 px-2 py-1.5";
const LABEL = "block text-[10px] font-medium text-ink-3 leading-none";
const VALUE = "block rk-num text-[12.5px] font-bold text-ink-1 leading-none mt-1";
const PRIMARY = "h-10 px-3.5 shrink-0 rounded-pill text-[12.5px] font-semibold whitespace-nowrap bg-brand text-brand-fg active:bg-brand-strong";

/** 당점 그림: 공 위의 점 하나(미스큐 한계를 반지름 1로 본다). */
function SpinDot({ a, b, maxOffset }: { a: number; b: number; maxOffset: number }) {
    const r = 11;
    const x = 16 + (a / maxOffset) * r;
    const y = 16 - (b / maxOffset) * r;
    return (
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
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
    const level = marginLevel(c);
    const power = powerPercent(c.input.V0);
    const spot = tipSpot(c.input.a, c.input.b, p.maxOffset);
    const levelText = level === "wide" ? t("sim.path.marginWide") : level === "mid" ? t("sim.path.marginMid") : t("sim.path.marginTight");
    const levelTone = level === "wide" ? "text-brand" : level === "mid" ? "text-ink-2" : "text-ink-3";
    // 당점 한 줄: "중앙" · "우 2팁" · "우 2팁 · 상단"(가운데면 위아래만 붙인다)
    const tipParts: string[] = [];
    if (spot.side !== null) tipParts.push(t("sim.path.tips").replace("{side}", t(spot.side === "right" ? "sim.controls.sideRight" : "sim.controls.sideLeft")).replace("{n}", String(spot.tips)));
    if (spot.vertical !== "mid") tipParts.push(spot.vertical === "high" ? t("sim.path.tipHigh") : t("sim.path.tipLow"));
    const spinLine = tipParts.length ? tipParts.join(" · ") : t("sim.path.tipCenter");
    return (
        <div className={cn(CARD, "py-2.5 flex items-center gap-3", p.className)}>
            <div className="min-w-0 flex-1">
                {/* 1줄: 어디를 겨누나 + 이 길이 얼마나 너그러운가 */}
                <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold text-ink-4 shrink-0">{t("sim.path.aim")}</span>
                    <p className="text-[14px] font-bold text-ink-1 truncate">{aimText(c.aim, t)}</p>
                    {pct !== null && (
                        <p className={cn("rk-num shrink-0 ml-auto text-[11px] font-semibold", levelTone)}>
                            {t("sim.path.margin").replace("{n}", String(pct))} · {levelText}
                        </p>
                    )}
                </div>
                {/* 2줄: 당점 · 세기 · 쿠션 — 값 세 개를 같은 크기로 */}
                <div className="flex items-stretch gap-1.5 mt-2">
                    <span className={cn(CELL, "flex-[1.4]")}>
                        <SpinDot a={c.input.a} b={c.input.b} maxOffset={p.maxOffset} />
                        <span className="min-w-0">
                            <span className={LABEL}>{t("sim.path.spin")}</span>
                            <span className={cn(VALUE, "truncate")}>{spinLine}</span>
                        </span>
                    </span>
                    <span className={CELL}>
                        <span className="min-w-0 flex-1">
                            <span className={LABEL}>{t("sim.path.power")}</span>
                            <span className={VALUE}>{power}%</span>
                            <span className="mt-1 block h-1 rounded-pill bg-surface-line overflow-hidden">
                                <span className="block h-full rounded-pill bg-ink-1" style={{ width: `${Math.max(3, Math.min(100, power))}%` }} />
                            </span>
                        </span>
                    </span>
                    <span className={cn(CELL, "flex-none w-[64px]")}>
                        <span>
                            <span className={LABEL}>{t("sim.path.cushion")}</span>
                            <span className={VALUE}>{cushionCount(c)}</span>
                        </span>
                    </span>
                </div>
            </div>
            {/* 샷은 카드 안(2026-09-08 오너) — 이 길 그대로 친다 */}
            <button
                type="button" onClick={p.onShoot} disabled={p.shooting} aria-label={t("sim.controls.shoot")}
                className="h-14 w-14 shrink-0 rounded-pill bg-brand text-brand-fg text-[14px] font-bold active:bg-brand-strong disabled:opacity-40"
            >
                {t("sim.controls.shoot")}
            </button>
        </div>
    );
});

export default BestPathCard;
