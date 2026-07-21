import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Delete, Star } from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { useT } from "@/lib/i18n";

interface PinCodeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PinCodeModal = ({ open, onOpenChange }: PinCodeModalProps) => {
    const { toast } = useToast();
    const { t } = useT();
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
                title: t("pinCodeModal.joinSuccessTitle"),
                description: t("pinCodeModal.joinSuccessDesc"),
            });
        } catch (e) {
            toast({
                title: t("pinCodeModal.joinFailTitle"),
                description: t("pinCodeModal.joinFailDesc"),
                variant: "destructive"
            });
            setJoinCode(""); // Reset on failure for quick retry
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="w-[90vw] max-w-sm rounded-card bg-white text-ink-1 p-6 flex flex-col items-center justify-center shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none data-[state=open]:!zoom-in-95 data-[state=closed]:!zoom-out-95">
                <div className="w-full flex flex-col items-center">
                    <h2 className="text-xl font-semibold text-ink-1 mb-1.5 tracking-tight">{t("pinCodeModal.title")}</h2>
                    <p className="text-[12px] font-bold text-black/40 tracking-normal mb-8">{t("pinCodeModal.subtitle")}</p>

                    {/* PIN Display */}
                    <div className="flex gap-3 mb-8">
                        {[0, 1, 2, 3, 4, 5].map((idx) => (
                            <div key={idx} className="w-2.5 h-2.5 rounded-full bg-black/10 relative">
                                {joinCode[idx] && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute inset-0 bg-[#cba258] rounded-full"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    {/* Code Preview (Optional, helpful for debugging or trust) */}
                    <div className="text-3xl font-mono font-semibold text-[#cba258] tracking-[0.3em] h-10 mb-6 flex items-center justify-center min-w-[120px]">
                        {joinCode}
                    </div>

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-4 w-full px-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleKeypadPress(num.toString())}
                                className="aspect-square rounded-2xl bg-black/[0.04] hover:bg-black/[0.06] active:scale-95 active:bg-[#cba258]/20 transition-all flex items-center justify-center text-xl font-bold text-ink-1 "
                            >
                                {num}
                            </button>
                        ))}
                        <button onClick={() => onOpenChange(false)} className="aspect-square rounded-2xl flex items-center justify-center text-black/55 hover:text-ink-1 transition-colors group">
                            <span className="text-[12px] font-semibold group-hover:scale-110 transition-transform">{t("pinCodeModal.cancel")}</span>
                        </button>
                        <button
                            onClick={() => handleKeypadPress('0')}
                            className="aspect-square rounded-2xl bg-black/[0.04] hover:bg-black/[0.06] active:scale-95 active:bg-[#cba258]/20 transition-all flex items-center justify-center text-xl font-bold text-ink-1 "
                        >
                            0
                        </button>
                        <button
                            onClick={() => handleKeypadPress('back')}
                            className="aspect-square rounded-2xl flex items-center justify-center text-black/55 hover:text-ink-1 transition-colors group"
                        >
                            <Delete className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
