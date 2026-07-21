import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { X, Check, Calculator } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface ScoreCorrectionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: HiqMember;
}

export const ScoreCorrectionModal = ({ open, onOpenChange, member }: ScoreCorrectionModalProps) => {
    const { t } = useT();
    const [editAverage, setEditAverage] = useState<string>("");
    const [editHandi3c, setEditHandi3c] = useState<number>(0);
    const [editHandi4c, setEditHandi4c] = useState<number>(0);
    const [activeEditType, setActiveEditType] = useState<"3c" | "4c">("4c");

    useEffect(() => {
        if (open && member) {
            setEditAverage(member.average || "0");
            setEditHandi3c(member.handi3c || 15);
            setEditHandi4c(member.handi4c || 150);
        }
    }, [open, member]);

    const handleAverageChange = (newAvg: string) => {
        setEditAverage(newAvg);
        const avg = parseFloat(newAvg);
        if (!isNaN(avg)) {
            if (activeEditType === "4c") {
                setEditHandi4c(Math.floor(avg) * 10);
            } else {
                setEditHandi3c(Math.floor(avg * 20 + 5));
            }
        }
    };

    const handleTypeChange = (type: "3c" | "4c") => {
        setActiveEditType(type);
        const avg = parseFloat(editAverage);
        if (!isNaN(avg)) {
            if (type === "4c") {
                setEditHandi4c(Math.floor(avg) * 10);
            } else {
                setEditHandi3c(Math.floor(avg * 20 + 5));
            }
        }
    };

    const confirmScoreUpdate = async () => {
        try {
            await apiRequest("/api/hiq/me", {
                method: "PATCH",
                body: {
                    average: editAverage,
                    handi3c: editHandi3c,
                    handi4c: editHandi4c
                }
            });
            onOpenChange(false);
            window.location.reload(); // Simple reload to reflect changes
        } catch (error) {
            console.error("Failed to update scores:", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-ink-1 max-w-sm rounded-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-brand" />
                        {t("scoreCorrectionModal.title")}
                    </h2>
                    <button onClick={() => onOpenChange(false)} className="text-black/55 hover:text-ink-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Tab Switch */}
                    <div className="flex bg-black/[0.04] p-1 rounded-tile">
                        <button
                            onClick={() => handleTypeChange("4c")}
                            className={`flex-1 py-2 rounded-tile text-sm font-semibold transition-all ${activeEditType === "4c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-ink-1"}`}
                        >
                            {t("scoreCorrectionModal.tab4c")}
                        </button>
                        <button
                            onClick={() => handleTypeChange("3c")}
                            className={`flex-1 py-2 rounded-tile text-sm font-semibold transition-all ${activeEditType === "3c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-ink-1"}`}
                        >
                            {t("scoreCorrectionModal.tab3c")}
                        </button>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-black/55 mb-1 block">{t("scoreCorrectionModal.average")}</label>
                            <input
                                type="number"
                                step="0.001"
                                value={editAverage}
                                onChange={(e) => handleAverageChange(e.target.value)}
                                className="w-full bg-black/[0.04] rounded-tile px-4 py-3 text-lg font-bold tabular-nums text-ink-1 focus:outline-none focus:border-brand/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-black/55 mb-1 block">{t("scoreCorrectionModal.handicap")}</label>
                            <div className="w-full bg-black/[0.04] rounded-tile px-4 py-3 text-lg font-bold tabular-nums text-brand">
                                {activeEditType === "4c" ? editHandi4c : editHandi3c} {t("scoreCorrectionModal.pointSuffix")}
                            </div>
                            <p className="text-[12px] text-black/55 mt-1">{t("scoreCorrectionModal.autoCalcNote")}</p>
                        </div>
                    </div>

                    <Button onClick={confirmScoreUpdate} className="rk-btn-primary w-full h-12 text-lg">
                        <Check className="w-5 h-5 mr-2" />
                        {t("scoreCorrectionModal.save")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
