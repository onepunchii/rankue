import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LucideTrophy, LucideTrendingUp, LucideInfo } from "@/lib/icons";

interface RPGuideModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function RPGuideModal({ open, onOpenChange }: RPGuideModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-ink-1 rounded-card w-[90%] max-w-sm p-6 gap-0">
                <DialogHeader className="mb-4">
                    <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                        <LucideTrophy className="w-5 h-5 text-brand" />
                        What is RP?
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-base font-bold text-ink-1">매치 레이팅 포인트 (Match Rating)</h3>
                        <p className="text-sm text-black/60 leading-relaxed">
                            <span className="text-brand font-bold">RP</span>는 플레이어의 실질적인 실력을 나타내는 점수입니다. 단순한 승률을 넘어 상대의 실력까지 고려하여 계산됩니다.
                        </p>
                    </div>

                    <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 space-y-3">
                        <div className="flex gap-3">
                            <div className="mt-1 w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                                <LucideTrendingUp className="w-3.5 h-3.5 text-brand" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-brand">점수 획득 원리</p>
                                <p className="text-xs text-black/55 mt-1 leading-snug">
                                    나보다 RP가 높은 상대를 이기면 더 많은 점수를 얻고, 낮은 상대에게 지면 더 많은 점수를 잃습니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-2 bg-black/[0.04] p-3 rounded-xl">
                        <LucideInfo className="w-4 h-4 text-black/40 mt-0.5 shrink-0" />
                        <p className="text-xs text-black/55 leading-snug">
                            RP는 공식 매치(Ranked Game) 결과에 따라서만 변동되며, 연습 경기나 친선 경기는 영향을 주지 않습니다.
                        </p>
                    </div>

                    <button
                        onClick={() => onOpenChange(false)}
                        className="w-full py-4 rounded-full bg-brand text-white font-bold text-sm hover:bg-[#00543a] active:scale-95 transition-all"
                    >
                        알겠습니다
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
