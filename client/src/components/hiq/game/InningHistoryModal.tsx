import { LucideLayoutGrid, LucideBarChart3 } from "@/lib/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface Props {
    player: number | null;
    innings: number;
    onClose: () => void;
}

export function InningHistoryModal({ player, innings, onClose }: Props) {
    const { t } = useT();
    return (
        <Dialog open={!!player} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-card max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <LucideLayoutGrid className="w-5 h-5 text-brand" />
                        {t("inningHistoryModal.title")}
                    </DialogTitle>
                    <DialogDescription className="text-black/55">
                        {t("inningHistoryModal.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-black/[0.04] rounded-2xl p-4 ">
                        <div className="flex justify-between text-[12px] font-semibold text-black/55 mb-4">
                            <span>{t("inningHistoryModal.scoreTrend")}</span>
                            <span className="text-black/40 tabular-nums">{t("inningHistoryModal.totalInningsPrefix")}{innings}{t("inningHistoryModal.totalInningsSuffix")}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                            <LucideBarChart3 className="w-8 h-8 text-black/40" strokeWidth={1.5} />
                            <p className="text-[13px] font-medium text-black/55">{t("inningHistoryModal.emptyLine1")}</p>
                            <p className="text-[13px] font-medium text-black/55">{t("inningHistoryModal.emptyLine2")}</p>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={onClose}
                        className="rk-btn-secondary w-full h-12"
                    >
                        {t("inningHistoryModal.close")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
