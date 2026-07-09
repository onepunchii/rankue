import { LucideLayoutGrid } from "lucide-react";
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
            <DialogContent className="bg-[#141416] border-white/10 text-white rounded-card max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <LucideLayoutGrid className="w-5 h-5 text-brand" />
                        이닝별 기록
                    </DialogTitle>
                    <DialogDescription className="text-white/55">
                        이번 경기의 이닝당 득점 분포입니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5 max-h-[40vh] overflow-y-auto">
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-[12px] font-semibold text-white/55">
                                    <span>이닝별 점수 추이</span>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {Array.from({ length: innings }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex flex-col items-center gap-1"
                                        >
                                            <span className="text-[12px] text-white/45 tabular-nums">{i + 1}</span>
                                            <div
                                                className="w-full h-10 flex items-center justify-center rounded-tile text-xs font-semibold bg-white/5 text-white/55"
                                            >
                                                -
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
