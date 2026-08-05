import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { useState } from "react";
import { X, Calculator } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface ScoreCorrectionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: HiqMember;
}

// 예전엔 여기서 average/handi3c/handi4c를 PATCH /api/hiq/me로 보냈다. 그런데 서버는 이 필드들을
// 받지 않는다 — 자기 신고 다마수를 그대로 저장하면 랭킹이 오염되므로 안 받는 게 맞다. 결과적으로
// "저장하기"는 아무것도 바꾸지 않으면서 저장된 것처럼 보이고, 새로고침 뒤 값이 그대로라 사용자는
// 버그로 받아들였다. 그래서 쓰기를 없애고, 현재 값과 산정 방식을 보여주는 읽기 전용 안내로 바꿨다.
export const ScoreCorrectionModal = ({ open, onOpenChange, member }: ScoreCorrectionModalProps) => {
    const { t } = useT();
    const [activeType, setActiveType] = useState<"3c" | "4c">("4c");

    const average = activeType === "4c" ? member?.avg4c : member?.avg3c;
    const handicap = activeType === "4c" ? member?.handi4c : member?.handi3c;

    // 아직 해당 종목 랭킹전 기록이 없으면 0이 온다 — 0.000/0점보다 "-"가 덜 오해를 부른다.
    const averageText = typeof average === "number" && average > 0 ? average.toFixed(3) : "-";
    const handicapText = handicap && handicap > 0 ? `${handicap} ${t("scoreCorrectionModal.pointSuffix")}` : "-";

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
                            onClick={() => setActiveType("4c")}
                            className={`flex-1 py-2 rounded-tile text-sm font-semibold transition-all ${activeType === "4c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-ink-1"}`}
                        >
                            {t("scoreCorrectionModal.tab4c")}
                        </button>
                        <button
                            onClick={() => setActiveType("3c")}
                            className={`flex-1 py-2 rounded-tile text-sm font-semibold transition-all ${activeType === "3c" ? "bg-brand text-brand-fg" : "text-black/55 hover:text-ink-1"}`}
                        >
                            {t("scoreCorrectionModal.tab3c")}
                        </button>
                    </div>

                    {/* Read-only current values */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-black/55 mb-1 block">{t("scoreCorrectionModal.average")}</label>
                            <div className="w-full bg-black/[0.04] rounded-tile px-4 py-3 text-lg font-bold tabular-nums text-ink-1">
                                {averageText}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-black/55 mb-1 block">{t("scoreCorrectionModal.handicap")}</label>
                            <div className="w-full bg-black/[0.04] rounded-tile px-4 py-3 text-lg font-bold tabular-nums text-brand">
                                {handicapText}
                            </div>
                            <p className="text-[12px] text-black/55 mt-1">{t("scoreCorrectionModal.autoCalcNote")}</p>
                        </div>
                    </div>

                    <p className="text-[12px] leading-relaxed text-black/55 bg-black/[0.03] rounded-tile px-4 py-3">
                        {t("gameCreationModal.pinAutoRecord")}
                    </p>

                    <Button onClick={() => onOpenChange(false)} className="rk-btn-primary w-full h-12 text-lg">
                        {t("quickActions.close")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
