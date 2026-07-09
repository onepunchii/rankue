import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Delete, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PinCodeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PinCodeModal = ({ open, onOpenChange }: PinCodeModalProps) => {
    const { toast } = useToast();
    const [joinCode, setJoinCode] = useState("");

    const handleKeypadPress = (val: string) => {
        if (val === 'back') {
            setJoinCode(prev => prev.slice(0, -1));
        } else if (val === 'clear') {
            setJoinCode("");
        } else {
            if (joinCode.length < 6) {
                const newCode = joinCode + val;
                setJoinCode(newCode);
                if (newCode.length === 6) {
                    handleJoinGame(newCode);
                }
            }
        }
    };

    const handleJoinGame = async (code: string) => {
        try {
            await apiRequest(`/api/hiq/invite/${code}/join`, { method: "POST" });
            onOpenChange(false);
            setJoinCode("");
            toast({
                title: "참여 완료",
                description: "호스트가 상대를 확인 중입니다.",
            });
        } catch (e) {
            toast({
                title: "참여 실패",
                description: "코드를 확인해주세요.",
                variant: "destructive"
            });
            setJoinCode(""); // Reset on failure for quick retry
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="w-[90vw] max-w-sm rounded-card border border-white/10 bg-[#121212] text-white p-6 flex flex-col items-center justify-center shadow-2xl focus:outline-none data-[state=open]:!zoom-in-95 data-[state=closed]:!zoom-out-95">
                <div className="w-full flex flex-col items-center">
                    <h2 className="text-xl font-semibold text-white mb-1.5 tracking-tight">게임 참여하기</h2>
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-normal mb-8">핀 코드 입력</p>

                    {/* PIN Display */}
                    <div className="flex gap-3 mb-8">
                        {[0, 1, 2, 3, 4, 5].map((idx) => (
                            <div key={idx} className="w-2.5 h-2.5 rounded-full bg-white/10 relative">
                                {joinCode[idx] && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute inset-0 bg-[#ffd700] rounded-full"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    {/* Code Preview (Optional, helpful for debugging or trust) */}
                    <div className="text-3xl font-mono font-semibold text-[#ffd700] tracking-[0.3em] h-10 mb-6 flex items-center justify-center min-w-[120px]">
                        {joinCode}
                    </div>

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-4 w-full px-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleKeypadPress(num.toString())}
                                className="aspect-square rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 active:bg-[#ffd700]/20 transition-all flex items-center justify-center text-xl font-bold text-white border border-white/5 shadow-sm"
                            >
                                {num}
                            </button>
                        ))}
                        <button onClick={() => onOpenChange(false)} className="aspect-square rounded-2xl flex items-center justify-center text-gray-500 hover:text-white transition-colors group">
                            <span className="text-[12px] font-semibold group-hover:scale-110 transition-transform">취소</span>
                        </button>
                        <button
                            onClick={() => handleKeypadPress('0')}
                            className="aspect-square rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 active:bg-[#ffd700]/20 transition-all flex items-center justify-center text-xl font-bold text-white border border-white/5 shadow-sm"
                        >
                            0
                        </button>
                        <button
                            onClick={() => handleKeypadPress('back')}
                            className="aspect-square rounded-2xl flex items-center justify-center text-gray-500 hover:text-white transition-colors group"
                        >
                            <Delete className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
