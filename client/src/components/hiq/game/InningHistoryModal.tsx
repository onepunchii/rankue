import { LucideLayoutGrid, LucideBarChart3 } from "@/lib/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
    player: number | null;
    innings: number;
    onClose: () => void;
}

export function InningHistoryModal({ player, innings, onClose }: Props) {
    return (
        <Dialog open={!!player} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-card max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <LucideLayoutGrid className="w-5 h-5 text-brand" />
                        이닝별 기록
                    </DialogTitle>
                    <DialogDescription className="text-black/55">
                        이번 경기의 이닝당 득점 분포입니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-black/[0.04] rounded-2xl p-4 ">
                        <div className="flex justify-between text-[12px] font-semibold text-black/55 mb-4">
                            <span>이닝별 점수 추이</span>
                            <span className="text-black/40 tabular-nums">총 {innings}이닝</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                            <LucideBarChart3 className="w-8 h-8 text-black/40" strokeWidth={1.5} />
                            <p className="text-[13px] font-medium text-black/55">이닝별 상세 기록은 경기 종료 후</p>
                            <p className="text-[13px] font-medium text-black/55">결과 화면에서 확인할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={onClose}
                        className="rk-btn-secondary w-full h-12"
                    >
                        닫기
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
