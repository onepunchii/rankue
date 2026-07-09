import { LucideCalendar, LucideClock, LucidePlus, LucideX, LucideCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface TimeSelectionSectionProps {
    date: string;
    setDate: (d: string) => void;
    currentTime: string;
    setCurrentTime: (t: string) => void;
    timeList: string[];
    setTimeList: React.Dispatch<React.SetStateAction<string[]>>;
    listingType: 'BOOKING' | 'JOIN';
}

export function TimeSelectionSection({
    date,
    setDate,
    currentTime,
    setCurrentTime,
    timeList,
    setTimeList,
    listingType
}: TimeSelectionSectionProps) {
    const { toast } = useToast();
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    // Internal state for the picker
    const [tempHour, setTempHour] = useState("07");
    const [tempMinute, setTempMinute] = useState("00");

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    const hourRef = useRef<HTMLDivElement>(null);
    const minuteRef = useRef<HTMLDivElement>(null);

    // Sync temp state when picker opens
    useEffect(() => {
        if (isPickerOpen && currentTime) {
            const [h, m] = currentTime.split(":");
            setTempHour(h || "07");
            setTempMinute(m || "00");
        }
    }, [isPickerOpen, currentTime]);

    // Scroll to active elements when picker opens
    useEffect(() => {
        if (isPickerOpen) {
            setTimeout(() => {
                const hIdx = hours.indexOf(tempHour);
                const mIdx = minutes.indexOf(tempMinute);
                if (hourRef.current) hourRef.current.scrollTop = hIdx * 48;
                if (minuteRef.current) minuteRef.current.scrollTop = mIdx * 48;
            }, 100);
        }
    }, [isPickerOpen]);

    const handleConfirm = () => {
        setCurrentTime(`${tempHour}:${tempMinute}`);
        setIsPickerOpen(false);
    };

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

    const activeColor = listingType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';
    const activeBg = listingType === 'JOIN' ? 'bg-[#FF6B00]/10' : 'bg-[#64DD17]/10';
    const activeBorder = listingType === 'JOIN' ? 'focus:border-[#FF6B00]/50' : 'focus:border-[#64DD17]/50';
    const activeText = listingType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';
    const activeButtonBg = listingType === 'JOIN' ? 'bg-[#FF6B00]' : 'bg-[#64DD17]';
    const activeButtonBorder = listingType === 'JOIN' ? 'border-[#FF6B00]/20' : 'border-[#64DD17]/20';
    const activeButtonHover = listingType === 'JOIN' ? 'hover:bg-[#FF6B00]/90' : 'hover:bg-[#64DD17]/90';
    const activeShadow = listingType === 'JOIN' ? 'shadow-[0_0_20px_rgba(255,107,0,0.3)]' : 'shadow-[0_0_20px_rgba(100,221,23,0.3)]';
    const activeBgLight = listingType === 'JOIN' ? 'bg-[#FF6B00]/20' : 'bg-[#64DD17]/20';
    const activeStaticBorder = listingType === 'JOIN' ? 'border-[#FF6B00]/30' : 'border-[#64DD17]/30';

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activeBg)}>
                    <LucideClock className={cn("w-4 h-4", activeColor)} />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">2. 날짜 및 시간</h3>
            </div>

            <div className="space-y-6">
                {/* Date Field */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] ml-1">날짜 선택</label>
                    <div className="relative">
                        <LucideCalendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            title="날짜 선택"
                            className={cn(
                                "w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none transition-all [color-scheme:dark]",
                                activeBorder
                            )}
                        />
                    </div>
                </div>

                {/* Time Field */}
                <div className="space-y-2">
                    <div className="flex items-end justify-between ml-1 mb-1">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] block">티오프 시간</label>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-tight">요금이 동일한 경우, 여러 타임을 추가하여 일괄 등록하세요</p>
                        </div>
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", activeText)}>
                            총 {timeList.length}개 시간 선택됨
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setIsPickerOpen(true)}
                            className="flex-1 relative flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-sm font-bold text-white hover:bg-white/10 transition-all active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-3">
                                <LucideClock className={cn("w-4 h-4", activeColor)} />
                                <span>{currentTime || "-- : --"}</span>
                            </div>
                            <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">시간 선택</div>
                        </button>
                        <button
                            onClick={addTime}
                            type="button"
                            title="시간 추가"
                            className={cn(
                                "px-6 rounded-2xl text-[#051907] border transition-all active:scale-95",
                                activeButtonBg, activeButtonBorder, activeButtonHover, activeShadow
                            )}
                        >
                            <LucidePlus className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Custom Time Picker Sheet */}
                    <Sheet open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                        <SheetContent side="bottom" className="bg-[#121212] border-t border-white/10 rounded-t-[2.5rem] p-0 h-auto min-h-[50vh] focus:outline-none">
                            <div className="flex flex-col h-full pb-8">
                                <div className="px-8 pt-8 pb-4 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">티오프 시간 설정</h3>
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">드래그하여 시간을 선택하세요</p>
                                    </div>
                                    <button
                                        onClick={handleConfirm}
                                        className={cn(
                                            "min-w-[50px] px-5 py-2.5 rounded-full text-xs font-black active:scale-95 transition-all",
                                            listingType === 'JOIN' ? "bg-[#FF6B00] text-white shadow-[0_0_20px_rgba(255,107,0,0.3)]" : "bg-[#64DD17] text-[#051907] shadow-[0_0_20px_rgba(100,221,23,0.3)]"
                                        )}
                                    >
                                        확인
                                    </button>
                                </div>

                                <div className="flex relative mb-4 h-[240px] w-full px-8">
                                    {/* Selection Overlay */}
                                    <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-12 bg-white/5 border-y border-white/5 pointer-events-none rounded-lg" />

                                    {/* Hour Wheel */}
                                    <div
                                        ref={hourRef}
                                        className="flex-1 overflow-y-auto scroll-smooth scrollbar-hide snap-y snap-mandatory py-[96px]"
                                        onScroll={(e) => {
                                            const scrollTop = (e.target as HTMLDivElement).scrollTop;
                                            const idx = Math.round(scrollTop / 48);
                                            if (hours[idx] && hours[idx] !== tempHour) setTempHour(hours[idx]);
                                        }}
                                    >
                                        {hours.map(h => (
                                            <div
                                                key={h}
                                                className={cn(
                                                    "h-12 flex items-center justify-center text-2xl font-black transition-all snap-center",
                                                    tempHour === h ? cn(activeText, "scale-125") : "text-white/30"
                                                )}
                                            >
                                                {h}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-center text-2xl font-black text-white/20 pb-1">:</div>

                                    {/* Minute Wheel */}
                                    <div
                                        ref={minuteRef}
                                        className="flex-1 overflow-y-auto scroll-smooth scrollbar-hide snap-y snap-mandatory py-[96px]"
                                        onScroll={(e) => {
                                            const scrollTop = (e.target as HTMLDivElement).scrollTop;
                                            const idx = Math.round(scrollTop / 48);
                                            if (minutes[idx] && minutes[idx] !== tempMinute) setTempMinute(minutes[idx]);
                                        }}
                                    >
                                        {minutes.map(m => (
                                            <div
                                                key={m}
                                                className={cn(
                                                    "h-12 flex items-center justify-center text-2xl font-black transition-all snap-center",
                                                    tempMinute === m ? cn(activeText, "scale-125") : "text-white/30"
                                                )}
                                            >
                                                {m}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>

                    {/* Time Chips */}
                    <div className="flex flex-wrap gap-2 mt-3 min-h-[40px]">
                        <AnimatePresence>
                            {timeList.map(t => (
                                <motion.div
                                    key={t}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className={cn("flex items-center gap-2 px-4 py-2 border rounded-xl", activeBgLight, activeStaticBorder)}
                                >
                                    <span className={cn("text-sm font-black", activeText)}>{t}</span>
                                    <button
                                        onClick={() => removeTime(t)}
                                        className={cn("p-1 rounded-full transition-colors", listingType === 'JOIN' ? "hover:bg-[#FF6B00]/20" : "hover:bg-[#64DD17]/20")}
                                        title="삭제"
                                    >
                                        <LucideX className={cn("w-3.5 h-3.5", activeColor)} />
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
        </section >
    );
}
