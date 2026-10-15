import { memo } from "react";
import { useT } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function SpinFigure() {
    return (
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="shrink-0">
            <circle cx="36" cy="36" r="30" fill="#FFFFFF" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
            <circle cx="36" cy="36" r="15" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="36" cy="22" r="4" fill="var(--ball-red)" />
        </svg>
    );
}

function ElevationFigure() {
    return (
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="shrink-0">
            <line x1="6" y1="60" x2="66" y2="60" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
            <line x1="16" y1="58" x2="56" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M 34 59 A 20 20 0 0 0 26 40" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" />
            <circle cx="16" cy="58" r="4" fill="var(--ball-white)" stroke="currentColor" strokeOpacity="0.5" />
        </svg>
    );
}

function PowerFigure() {
    return (
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="shrink-0">
            <rect x="30" y="4" width="12" height="64" rx="6" fill="currentColor" fillOpacity="0.15" />
            <rect x="30" y="28" width="12" height="40" rx="6" fill="var(--brand)" />
            <circle cx="36" cy="28" r="5" fill="#FFFFFF" stroke="currentColor" strokeOpacity="0.4" />
        </svg>
    );
}

export const ControlsGuide = memo(function ControlsGuide({ open, onOpenChange }: Props) {
    const { t } = useT();
    const sections = [
        { Figure: SpinFigure, title: t("sim.guide.spinTitle"), body: t("sim.guide.spinBody") },
        { Figure: ElevationFigure, title: t("sim.guide.elevTitle"), body: t("sim.guide.elevBody") },
        { Figure: PowerFigure, title: t("sim.guide.powerTitle"), body: t("sim.guide.powerBody") },
    ];
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom" hideClose
                className="sim-dark sim-table bg-[var(--surface-1)] rounded-t-card p-0 max-h-[80dvh] flex flex-col gap-0 pb-safe"
            >
                <SheetTitle className="sr-only">{t("sim.guide.title")}</SheetTitle>
                <SheetDescription className="sr-only">{t("sim.guide.title")}</SheetDescription>
                <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                    <p className="text-[16px] font-semibold text-ink-1">{t("sim.guide.title")}</p>
                    <button
                        type="button" onClick={() => onOpenChange(false)}
                        className="h-11 px-4 shrink-0 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3"
                    >
                        {t("sim.common.close")}
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-6 flex flex-col gap-3">
                    {sections.map(({ Figure, title, body }) => (
                        <section key={title} className="flex gap-4 items-start rounded-card bg-surface-2 p-3.5 text-ink-1">
                            <Figure />
                            <div className="min-w-0">
                                <p className="text-[15px] font-semibold">{title}</p>
                                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2 break-keep">{body}</p>
                            </div>
                        </section>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
});
