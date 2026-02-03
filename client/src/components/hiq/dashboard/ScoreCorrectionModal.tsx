import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { X, Check, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScoreCorrectionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: HiqMember;
}

export const ScoreCorrectionModal = ({ open, onOpenChange, member }: ScoreCorrectionModalProps) => {
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
            <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-[#ffd700]" />
                        점수 보정
                    </h2>
                    <button onClick={() => onOpenChange(false)} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Tab Switch */}
                    <div className="flex bg-black/20 p-1 rounded-xl">
                        <button
                            onClick={() => handleTypeChange("4c")}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeEditType === "4c" ? "bg-[#10b981] text-black shadow" : "text-gray-500 hover:text-gray-300"}`}
                        >
                            4구
                        </button>
                        <button
                            onClick={() => handleTypeChange("3c")}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeEditType === "3c" ? "bg-[#10b981] text-black shadow" : "text-gray-500 hover:text-gray-300"}`}
                        >
                            3구
                        </button>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">AVERAGE</label>
                            <input
                                type="number"
                                step="0.001"
                                value={editAverage}
                                onChange={(e) => handleAverageChange(e.target.value)}
                                className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-[#10b981]/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">HANDICAP</label>
                            <div className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-lg font-bold text-[#ffd700]">
                                {activeEditType === "4c" ? editHandi4c : editHandi3c} 점
                            </div>
                            <p className="text-[10px] text-gray-600 mt-1">※ 에버리지에 따라 자동 계산됩니다.</p>
                        </div>
                    </div>

                    <Button onClick={confirmScoreUpdate} className="w-full h-12 bg-[#10b981] hover:bg-[#059669] text-black font-bold rounded-xl text-lg">
                        <Check className="w-5 h-5 mr-2" />
                        저장하기
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
