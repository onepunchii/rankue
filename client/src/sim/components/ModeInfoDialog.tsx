import { memo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SimMode } from "../setupPresets";

/**
 * 일반 / 리얼리티 모드 설명 팝업(2026-09-07 오너: "메인은 깔끔하게, 버튼을 누르면 그림으로 설명").
 * 두 그림을 나란히 — 큐·큐볼(옆당점 점)·회전 화살표·점선 조준선·실선 실제 경로·적구.
 *  - 일반: 큐가 조준선에서 살짝 비껴 서고(앱이 스쿼트만큼 돌린다) 공은 조준선을 따라 적구에 간다.
 *  - 리얼리티: 큐가 조준선 위에 있고 공은 당점 반대쪽으로 2~4° 틀어져(그림은 과장) 적구를 비껴 간다.
 * 누른 쪽이 강조되고, 아래 초록 버튼 하나로 그 모드를 고른다. 그림 색: 라사 토큰(--cloth)·공 토큰(ball-*)·큐대 나무색 리터럴.
 */
interface Props {
    open: boolean;
    /** 강조해서 보여 줄 모드(누른 버튼). */
    mode: SimMode;
    onOpenChange: (open: boolean) => void;
    /** 그림 카드를 눌러 보는 모드를 바꾼다. */
    onView: (mode: SimMode) => void;
    /** 아래 버튼: 이 모드로 정한다. */
    onPick: (mode: SimMode) => void;
}

const CUE_SHAFT = "#C9955A";
const CUE_EDGE = "rgba(0,0,0,0.35)";
const LINE = "rgba(255,255,255,0.92)";
const LINE_FAINT = "rgba(255,255,255,0.55)";

/** 320 × 150. 큐볼 (84,104) → 적구 (236,52): 조준각 18.9°(화면 위쪽). */
function ModeDiagram({ mode }: { mode: SimMode }) {
    const cx = 84, cy = 104, R = 13;
    const ox = 236, oy = 52;
    const aim = Math.atan2(cy - oy, ox - cx);           // 라디안, 화면 좌표(위가 +)
    const ux = Math.cos(aim), uy = -Math.sin(aim);
    const a0x = cx + ux * R, a0y = cy + uy * R;
    const a1x = ox - ux * R, a1y = oy - uy * R;
    // 큐대: 일반은 조준선보다 7° 낮게(오른쪽으로) 비껴 선다, 리얼리티는 조준선 그대로
    const cueAng = mode === "normal" ? aim - (7 * Math.PI) / 180 : aim;
    const bx = cx - Math.cos(cueAng) * 82, by = cy + Math.sin(cueAng) * 82;
    const tx = cx - Math.cos(cueAng) * (R + 4), ty = cy + Math.sin(cueAng) * (R + 4);
    // 실제 경로: 일반은 조준선, 리얼리티는 왼쪽(위)으로 12° 틀어져 적구를 비껴 간다
    const pathAng = mode === "normal" ? aim : aim + (12 * Math.PI) / 180;
    const pLen = mode === "normal" ? Math.hypot(a1x - a0x, a1y - a0y) : 150;
    const p1x = a0x + Math.cos(pathAng) * pLen, p1y = a0y - Math.sin(pathAng) * pLen;
    const arrow = (x: number, y: number, ang: number) => {
        const s = 7;
        const lx = x - Math.cos(ang - 0.5) * s, ly = y + Math.sin(ang - 0.5) * s;
        const rx = x - Math.cos(ang + 0.5) * s, ry = y + Math.sin(ang + 0.5) * s;
        return `M${x},${y} L${lx},${ly} L${rx},${ry} Z`;
    };
    return (
        <svg viewBox="0 0 320 150" className="w-full h-auto block" aria-hidden="true">
            <rect x="0" y="0" width="320" height="150" rx="14" fill="var(--cloth)" />
            {/* 조준선(점선) */}
            <line x1={a0x} y1={a0y} x2={a1x} y2={a1y} stroke={LINE_FAINT} strokeWidth="2" strokeDasharray="5 5" />
            {/* 실제 경로(실선 + 화살) */}
            <line x1={a0x} y1={a0y} x2={p1x} y2={p1y} stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
            <path d={arrow(p1x, p1y, pathAng)} fill={LINE} />
            {mode === "reality" && (
                <>
                    <path d={`M${a0x + Math.cos(aim) * 40},${a0y - Math.sin(aim) * 40} A40,40 0 0 0 ${a0x + Math.cos(pathAng) * 40},${a0y - Math.sin(pathAng) * 40}`} stroke={LINE} strokeWidth="1.5" fill="none" />
                    <text x={a0x + 52} y={a0y - 22} fill={LINE} fontSize="12" fontWeight="600" className="rk-num">2~4°</text>
                </>
            )}
            {/* 큐대 */}
            <line x1={bx} y1={by} x2={tx} y2={ty} stroke={CUE_EDGE} strokeWidth="8" strokeLinecap="round" />
            <line x1={bx} y1={by} x2={tx} y2={ty} stroke={CUE_SHAFT} strokeWidth="6" strokeLinecap="round" />
            {/* 적구 */}
            <circle cx={ox} cy={oy} r={R} className="fill-ball-red" stroke="rgba(0,0,0,0.25)" />
            {/* 큐볼 + 옆당점 + 회전 화살 */}
            <circle cx={cx} cy={cy} r={R} className="fill-ball-white" stroke="rgba(0,0,0,0.25)" />
            <circle cx={cx + 7} cy={cy} r="3" className="fill-ball-red" />
            <path d={`M${cx - 18},${cy - 10} A21,21 0 0 1 ${cx + 6},${cy - 21}`} stroke={LINE} strokeWidth="1.5" fill="none" />
            <path d={arrow(cx + 6, cy - 21, Math.PI * 0.1)} fill={LINE} />
        </svg>
    );
}

export const ModeInfoDialog = memo(function ModeInfoDialog({ open, mode, onOpenChange, onView, onPick }: Props) {
    const { t } = useT();
    const panels: readonly SimMode[] = ["normal", "reality"];
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[420px] max-h-[88dvh] rounded-card flex flex-col gap-0 p-0">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-2 text-left">
                    <DialogTitle>{t("sim.modeInfo.title")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">{t("sim.modeInfo.desc")}</DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-2 space-y-3">
                    {panels.map((m) => (
                        <button
                            key={m} type="button" onClick={() => onView(m)} aria-pressed={mode === m} data-mode-panel={m}
                            className={cn(
                                "w-full text-left rounded-card border p-3 transition-colors",
                                mode === m ? "border-brand bg-brand/[0.06]" : "border-surface-line",
                            )}
                        >
                            <ModeDiagram mode={m} />
                            <span className="flex items-baseline justify-between gap-2 mt-2.5">
                                <span className="text-[15px] font-bold text-ink-1">{m === "normal" ? t("sim.setup.modeNormal") : t("sim.setup.modeReality")}</span>
                                <span className="text-[12px] font-medium text-ink-4">{m === "normal" ? t("sim.modeInfo.normalExtra") : t("sim.modeInfo.realityExtra")}</span>
                            </span>
                            <span className="block text-[12.5px] font-medium text-ink-3 mt-1 leading-relaxed">
                                {m === "normal" ? t("sim.setup.modeNormalHint") : t("sim.setup.modeRealityHint")}
                            </span>
                        </button>
                    ))}
                    <p className="text-[12px] font-medium text-ink-4 leading-relaxed">{t("sim.modeInfo.legend")}</p>
                </div>
                <DialogFooter className="shrink-0 px-6 pb-6 pt-3 flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-12 px-5 rounded-xl border-surface-line text-ink-2 font-semibold">
                        {t("sim.common.cancel")}
                    </Button>
                    <Button type="button" onClick={() => onPick(mode)} className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl">
                        {mode === "normal" ? t("sim.modeInfo.pickNormal") : t("sim.modeInfo.pickReality")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
