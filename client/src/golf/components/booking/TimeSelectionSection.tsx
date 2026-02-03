import { LucideCalendar, LucideClock, LucidePlus, LucideX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface TimeSelectionSectionProps {
    date: string;
    setDate: (d: string) => void;
    currentTime: string;
    setCurrentTime: (t: string) => void;
    timeList: string[];
    setTimeList: React.Dispatch<React.SetStateAction<string[]>>;
}

export function TimeSelectionSection({
    date,
    setDate,
    currentTime,
    setCurrentTime,
    timeList,
    setTimeList
}: TimeSelectionSectionProps) {
    const { toast } = useToast();

    const addTime = () => {
        if (!currentTime) return;
        if (timeList.includes(currentTime)) {
            toast({ variant: "destructive", title: "중복된 시간", description: "이미 추가된 시간입니다." });
            return;
        }
        setTimeList(prev => [...prev, currentTime].sort());
        setCurrentTime("");
    };

    const removeTime = (t: string) => {
        setTimeList(prev => prev.filter(item => item !== t));
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                    <LucideClock className="w-4 h-4 text-[#64DD17]" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">2. 날짜 및 시간</h3>
            </div>

            <div className="space-y-6">
                {/* Date Field */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">날짜 선택</label>
                    <div className="relative">
                        <LucideCalendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            title="날짜 선택"
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 transition-all [color-scheme:dark]"
                        />
                    </div>
                </div>

                {/* Time Field */}
                <div className="space-y-2">
                    <div className="flex items-end justify-between ml-1 mb-1">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] block">티오프 시간</label>
                            <p className="text-[9px] font-bold text-white/10 uppercase tracking-tight">요금이 동일한 경우, 여러 타임을 추가하여 일괄 등록하세요</p>
                        </div>
                        <span className="text-[10px] font-black text-[#64DD17] uppercase tracking-widest">
                            총 {timeList.length}개 시간 선택됨
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <LucideClock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input
                                type="time"
                                value={currentTime}
                                onChange={(e) => setCurrentTime(e.target.value)}
                                title="티오프 시간"
                                className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 transition-all [color-scheme:dark]"
                            />
                        </div>
                        <button
                            onClick={addTime}
                            type="button"
                            title="시간 추가"
                            className="px-6 rounded-2xl bg-[#64DD17]/10 text-[#64DD17] border border-[#64DD17]/20 hover:bg-[#64DD17]/20 transition-all active:scale-95"
                        >
                            <LucidePlus className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Time Chips */}
                    <div className="flex flex-wrap gap-2 mt-3 min-h-[40px]">
                        <AnimatePresence>
                            {timeList.map(t => (
                                <motion.div
                                    key={t}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="flex items-center gap-2 px-4 py-2 bg-[#64DD17]/10 border border-[#64DD17]/20 rounded-xl"
                                >
                                    <span className="text-sm font-black text-[#64DD17]">{t}</span>
                                    <button
                                        onClick={() => removeTime(t)}
                                        className="p-1 hover:bg-[#64DD17]/20 rounded-full transition-colors"
                                        title="삭제"
                                    >
                                        <LucideX className="w-3.5 h-3.5 text-[#64DD17]" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {timeList.length === 0 && (
                            <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest mt-2 ml-1">아직 추가된 시간이 없습니다</p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
