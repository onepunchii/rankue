import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SessionState } from "@shared/sim/rules";
import type { Phase } from "../simReducer";
import { inningRows, totals, type InningLog } from "../inningLog";
import { displayAverage, formatAverage } from "../hudMath";

// 이닝 시트(아래에서 올라오는 시트). 이닝 번호 × 선수 표 + 합계, 위에 선수별 에버리지·하이런.
// 데이터는 페이지가 onOutcome 마다 쌓는 inningLog — 진행 중 이닝(득점만 있고 아직 안 닫힌)도 한 줄로 보인다.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    log: InningLog;
    session: SessionState | null;
    names: readonly string[];
    phase: Phase;
}

export const InningSheet = memo(function InningSheet({ open, onOpenChange, log, session, names, phase }: Props) {
    const { t } = useT();
    const count = session?.players.length ?? 1;
    const rows = useMemo(() => inningRows(log, count), [log, count]);
    const sums = useMemo(() => totals(rows, count), [rows, count]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="rounded-t-card p-0 max-h-[72dvh] flex flex-col gap-0 pb-safe">
                <SheetHeader className="shrink-0 px-6 pt-5 pb-3 text-left">
                    <div className="flex items-center gap-3">
                        <SheetTitle className="flex-1 min-w-0 text-[17px] font-bold text-ink-1">{t("sim.hud.sheetTitle")}</SheetTitle>
                        {/* 기본 16 px X(영문 sr-only) 대신 44 px 닫기 알약 */}
                        <button
                            type="button" onClick={() => onOpenChange(false)}
                            className="h-11 px-4 shrink-0 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3"
                        >
                            {t("sim.common.close")}
                        </button>
                    </div>
                    <SheetDescription className="text-[13px] font-medium text-ink-3">
                        {session
                            ? session.players.map((pl, i) => (
                                `${names[i] ?? pl.id} · ${t("sim.hud.average")} ${formatAverage(displayAverage(pl, phase))} · ${t("sim.hud.highRun")} ${pl.highRun}`
                            )).join("  /  ")
                            : ""}
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6">
                    {rows.length === 0 ? (
                        <p className="py-8 text-center text-[13px] font-medium text-ink-4">{t("sim.hud.sheetEmpty")}</p>
                    ) : (
                        <table className="w-full rk-num text-[14px]">
                            <thead>
                                <tr className="text-[12px] font-semibold text-ink-4">
                                    <th className="text-left py-2 font-semibold">{t("sim.hud.inning")}</th>
                                    {Array.from({ length: count }, (_, i) => (
                                        <th key={i} className="text-right py-2 font-semibold truncate max-w-[40%]">{names[i] ?? ""}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.inning} className="border-t border-surface-line">
                                        <td className="py-2 text-ink-3 font-medium">{r.inning}</td>
                                        {r.cells.map((c, i) => (
                                            <td key={i} className={cn("py-2 text-right font-semibold", c === null ? "text-ink-4" : c > 0 ? "text-ink-1" : "text-ink-3")}>
                                                {c === null ? "–" : c}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-surface-line">
                                    <td className="py-2 text-[12px] font-semibold text-ink-3">{t("sim.hud.sheetTotal")}</td>
                                    {sums.map((v, i) => (
                                        <td key={i} className="py-2 text-right font-bold text-ink-1">{v}</td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
});
