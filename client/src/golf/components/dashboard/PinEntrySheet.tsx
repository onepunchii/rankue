import { motion } from "framer-motion";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { LucideDelete } from "lucide-react";

interface PinEntrySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pinEntry: string[];
    onKeyPress: (num: number) => void;
    onDelete: () => void;
}

export function PinEntrySheet({ open, onOpenChange, pinEntry, onKeyPress, onDelete }: PinEntrySheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-[2rem] bg-[#0A0A0A] border-t border-white/10 p-0 ring-0 outline-none min-h-[60vh]">
                <div className="p-6 relative">
                    <SheetHeader className="mb-10 mt-4 relative z-10">
                        <SheetTitle className="text-center text-3xl font-black text-white tracking-tight uppercase italic">
                            ENTER<br />
                            <span className="text-[#64DD17]">PASSCODE</span>
                        </SheetTitle>
                        <p className="text-center text-white/40 text-sm mt-2 font-medium">매치 핀 번호 4자리를 입력하세요</p>
                    </SheetHeader>

                    {/* PIN Display */}
                    <div className="flex justify-center gap-4 mb-12 relative z-10">
                        {[0, 1, 2, 3].map((idx) => (
                            <motion.div
                                key={idx}
                                initial={false}
                                animate={{
                                    scale: pinEntry[idx] ? 1.1 : 1,
                                    borderColor: pinEntry[idx] ? '#64DD17' : 'rgba(255,255,255,0.1)',
                                    backgroundColor: pinEntry[idx] ? 'rgba(100,221,23,0.1)' : 'transparent'
                                }}
                                className="w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                            >
                                {pinEntry[idx] || ''}
                            </motion.div>
                        ))}
                    </div>

                    {/* Background Effects */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
                        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#64DD17]/5 rounded-full blur-[100px]" />
                    </div>
                </div>

                {/* Numeric Keypad */}
                <div className="bg-[#111] p-6 pb-12 rounded-t-[2.5rem] mt-auto border-t border-white/5 relative z-20">
                    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <motion.button
                                key={num}
                                whileTap={{ scale: 0.95, backgroundColor: 'rgba(255,255,255,0.1)' }}
                                onClick={() => onKeyPress(num)}
                                className="h-20 rounded-2xl bg-[#1a1a1a] text-2xl font-bold text-white shadow-lg hover:bg-[#222] transition-colors"
                            >
                                {num}
                            </motion.button>
                        ))}
                        <div /> {/* Empty slot */}
                        <motion.button
                            whileTap={{ scale: 0.95, backgroundColor: 'rgba(255,255,255,0.1)' }}
                            onClick={() => onKeyPress(0)}
                            className="h-20 rounded-2xl bg-[#1a1a1a] text-2xl font-bold text-white shadow-lg hover:bg-[#222] transition-colors"
                        >
                            0
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={onDelete}
                            className="h-20 rounded-2xl bg-transparent text-white/40 hover:text-white flex items-center justify-center transition-colors"
                        >
                            <LucideDelete className="w-8 h-8" />
                        </motion.button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
