import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LucideTrophy, LucideTrendingUp, LucideInfo } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface RPGuideModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function RPGuideModal({ open, onOpenChange }: RPGuideModalProps) {
    const { t } = useT();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-ink-1 rounded-card w-[90%] max-w-sm p-6 gap-0">
                <DialogHeader className="mb-4">
                    <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                        <LucideTrophy className="w-5 h-5 text-brand" />
                        {t("rpGuideModal.title")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-base font-bold text-ink-1">{t("rpGuideModal.sectionTitle")}</h3>
                        <p className="text-sm text-black/60 leading-relaxed">
                            <span className="text-brand font-bold">RP</span>{t("rpGuideModal.desc")}
                        </p>
                    </div>

                    <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 space-y-3">
                        <div className="flex gap-3">
                            <div className="mt-1 w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                                <LucideTrendingUp className="w-3.5 h-3.5 text-brand" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-brand">{t("rpGuideModal.howTitle")}</p>
                                <p className="text-xs text-black/55 mt-1 leading-snug">
                                    {t("rpGuideModal.howDesc")}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-2 bg-black/[0.04] p-3 rounded-xl">
                        <LucideInfo className="w-4 h-4 text-black/40 mt-0.5 shrink-0" />
                        <p className="text-xs text-black/55 leading-snug">
                            {t("rpGuideModal.note")}
                        </p>
                    </div>

                    <button
                        onClick={() => onOpenChange(false)}
                        className="w-full py-4 rounded-full bg-brand text-white font-bold text-sm hover:bg-[#00543a] active:scale-95 transition-all"
                    >
                        {t("rpGuideModal.gotIt")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
