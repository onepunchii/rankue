import { LucideFlag } from 'lucide-react';
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PassportStats } from '@/golf/hooks/usePassportData';

interface Props {
    stats: PassportStats;
}

/**
 * 여권 첫 카드. 예전 값 중 셋이 가짜였다: 제목 '마스터 탐험가'(고정), 분모 '/ 520'(고정),
 * '상위 15%'(정복 수로 지어낸 공식). 유일한 버튼 '기록 동기화' 는 '준비 중' 스캐너로 갔다(2026-09-11).
 */
export const PassportStatsCard = ({ stats }: Props) => {
    const [, setLocation] = useLocation();
    const toNext = stats.nextLevelAt != null ? Math.max(0, stats.nextLevelAt - stats.conquered) : null;

    return (
        <div className="relative group mb-12">
            <div className="absolute top-4 right-4 z-20">
                <Button
                    onClick={() => setLocation('/golf/game/new?mode=match')}
                    className="h-8 rounded-full bg-[#64DD17]/10 hover:bg-[#64DD17]/20 border border-[#64DD17]/30 text-[#64DD17] text-[11px] font-black px-4"
                >
                    <LucideFlag className="w-3 h-3 mr-1.5" />
                    라운드 시작
                </Button>
            </div>

            <div className="relative bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] p-8 border border-white/10 shadow-2xl overflow-hidden">
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-black leading-none">Lv.{stats.levelNum}</span>
                        {toNext != null && toNext > 0 && (
                            <span className="text-[11px] font-bold text-white/50">다음 레벨까지 {toNext}곳</span>
                        )}
                    </div>
                    <h2 className="text-2xl font-black tracking-tighter leading-none text-white">{stats.level}</h2>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-white/50">정복한 골프장</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-[#64DD17] tracking-tighter">{stats.conquered}</span>
                            <span className="text-[10px] font-bold text-white/40">/ {stats.totalCourses.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="space-y-1 border-x border-white/5 px-4">
                        <p className="text-[10px] font-bold text-white/50">라운드</p>
                        <span className="text-xl font-black tracking-tighter text-white">{stats.rounds}회</span>
                    </div>
                    <div className="space-y-1 pl-4">
                        <p className="text-[10px] font-bold text-white/50">85타 미만</p>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xl font-black text-amber-400">★</span>
                            <span className="text-xl font-black tracking-tighter text-white">{stats.starsCollected}</span>
                        </div>
                    </div>
                </div>

                {stats.conquered === 0 && (
                    <p className="mt-6 text-[12px] font-bold text-white/60 break-keep">
                        랭큐매치로 18홀을 끝까지 적고 라운드를 끝내면, 그 골프장 도장이 찍혀요.
                    </p>
                )}
            </div>
        </div>
    );
};
