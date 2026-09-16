import { memo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

// 대전 기권 확인. 기권하면 상대 승리로 기록된다(서버 simMatch resign).
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    busy: boolean;
    onConfirm: () => void;
}

export const ResignConfirm = memo(function ResignConfirm(p: Props) {
    const { t } = useT();
    return (
        <Dialog open={p.open} onOpenChange={(o) => { if (!p.busy) p.onOpenChange(o); }}>
            <DialogContent hideClose className="sim-dark sim-table bg-[var(--surface-1)] max-w-[360px] rounded-card p-0 gap-0 flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-2 text-left">
                    <DialogTitle>{t("sim.match.resignTitle")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">{t("sim.match.resignDesc")}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="px-6 pb-6 pt-4 flex-row gap-2">
                    <Button
                        type="button" variant="outline" onClick={() => p.onOpenChange(false)} disabled={p.busy}
                        className="flex-1 h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                    >
                        {t("sim.common.cancel")}
                    </Button>
                    <Button
                        type="button" onClick={p.onConfirm} disabled={p.busy}
                        className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {t("sim.match.resignConfirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
