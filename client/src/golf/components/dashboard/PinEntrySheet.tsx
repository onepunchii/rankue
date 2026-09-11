import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LucideDelete, LucideLoader2 } from "lucide-react";

interface PinEntrySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pinEntry: string[];
    onKeyPress: (num: number) => void;
    onDelete: () => void;
    /** 붙여넣기·키보드로 한 번에 넣은 숫자 */
    onSetDigits?: (text: string) => void;
    error?: string | null;
    isLoading?: boolean;
}

export function PinEntrySheet({ open, onOpenChange, pinEntry, onKeyPress, onDelete, onSetDigits, error, isLoading }: PinEntrySheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="rounded-t-[2rem] bg-[#0A0A0A] border-t border-white/10 p-0 ring-0 outline-none min-h-[60vh]"
                // 카톡에서 번호를 복사해 왔을 때, 또는 키보드가 있는 기기에서 그냥 치면 들어가게.
                onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t && onSetDigits) { e.preventDefault(); onSetDigits(t); } }}
                onKeyDown={(e) => {
                    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); onKeyPress(Number(e.key)); }
                    else if (e.key === "Backspace") { e.preventDefault(); onDelete(); }
                }}
            >
                <div className="p-6 relative">
                    <SheetHeader className="mb-8 mt-4 relative z-10">
                        <SheetTitle className="text-center text-2xl font-black text-white tracking-tight">핀번호로 입장</SheetTitle>
                        <p className="text-center text-white/60 text-sm mt-2 font-medium">방장 화면에 보이는 4자리를 입력하세요</p>
                    </SheetHeader>

                    <div className="flex justify-center gap-4 mb-4 relative z-10" aria-live="polite">
                        {[0, 1, 2, 3].map((idx) => (
                            <motion.div
                                key={idx}
                                initial={false}
                                animate={{
                                    scale: pinEntry[idx] ? 1.1 : 1,
                                    borderColor: error ? "#FF5252" : pinEntry[idx] ? "#64DD17" : "rgba(255,255,255,0.15)",
                                    backgroundColor: pinEntry[idx] ? "rgba(100,221,23,0.1)" : "transparent",
                                }}
                                className="w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                            >
                                {pinEntry[idx] || ""}
                            </motion.div>
                        ))}
                    </div>

                    <div className="h-10 flex items-center justify-center text-center relative z-10">
                        {isLoading ? (
                            <span className="flex items-center gap-2 text-sm font-bold text-[#64DD17]">
                                <LucideLoader2 className="w-4 h-4 animate-spin" />방을 찾는 중…
                            </span>
                        ) : error ? (
                            <span role="alert" className="text-sm font-bold text-[#FF6E6E] px-4 break-keep">{error}</span>
                        ) : null}
                    </div>
                </div>

                <div className="bg-[#111] p-6 pb-12 rounded-t-[2.5rem] mt-auto border-t border-white/5 relative z-20">
                    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <motion.button
                                key={num}
                                whileTap={{ scale: 0.95, backgroundColor: "rgba(255,255,255,0.1)" }}
                                onClick={() => onKeyPress(num)}
                                disabled={isLoading}
                                className="h-20 rounded-2xl bg-[#1a1a1a] text-2xl font-bold text-white shadow-lg hover:bg-[#222] transition-colors disabled:opacity-40"
                            >
                                {num}
                            </motion.button>
                        ))}
                        <div />
                        <motion.button
                            whileTap={{ scale: 0.95, backgroundColor: "rgba(255,255,255,0.1)" }}
                            onClick={() => onKeyPress(0)}
                            disabled={isLoading}
                            className="h-20 rounded-2xl bg-[#1a1a1a] text-2xl font-bold text-white shadow-lg hover:bg-[#222] transition-colors disabled:opacity-40"
                        >
                            0
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={onDelete}
                            disabled={isLoading}
                            aria-label="한 자리 지우기"
                            className="h-20 rounded-2xl bg-transparent text-white/60 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40"
                        >
                            <LucideDelete className="w-8 h-8" />
                        </motion.button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
