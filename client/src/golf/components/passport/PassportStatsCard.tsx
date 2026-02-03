import { LucideCamera } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { PassportStats } from '@/golf/hooks/usePassportData';

interface Props {
    stats: PassportStats;
    onScanClick: () => void;
}

export const PassportStatsCard = ({ stats, onScanClick }: Props) => {
    return (
        <div className="relative group mb-12">
            <div className="absolute top-4 right-4 z-20">
                <Button
                    onClick={onScanClick}
                    className="h-8 rounded-full bg-[#64DD17]/10 hover:bg-[#64DD17]/20 border border-[#64DD17]/30 text-[#64DD17] text-[10px] font-black uppercase tracking-widest px-4 group/scan"
                >
                    <LucideCamera className="w-3 h-3 mr-2 group-hover/scan:scale-110 transition-transform" />
                    기록 동기화
                </Button>
            </div>

            <div className="absolute inset-0 bg-[#64DD17]/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] p-8 border border-white/10 shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-black uppercase tracking-widest leading-none">Lv.{stats.levelNum}</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                            <span className="text-[10px] font-bold text-[#64DD17] tracking-tight">{stats.level}</span>
                        </div>
                        <h2 className="text-2xl font-black tracking-tighter italic uppercase leading-none text-white">마스터 탐험가</h2>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                    <div className="space-y-1">
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">획득한 스타</p>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xl font-black text-amber-400">★</span>
                            <span className="text-xl font-black tracking-tighter text-white">{stats.starsCollected}</span>
                        </div>
                    </div>
                    <div className="space-y-1 border-x border-white/5 px-4">
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">정복한 구장</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-[#64DD17] tracking-tighter">{stats.conquered}</span>
                            <span className="text-[10px] font-bold text-white/20">/ {stats.totalCourses}</span>
                        </div>
                    </div>
                    <div className="space-y-1 pl-4">
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">상위 랭킹</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white tracking-tighter"> 상위 {stats.rankPercent}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
