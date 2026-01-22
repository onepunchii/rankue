import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideChevronRight, LucideDelete } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/contexts/StoreContext";

export default function Landing() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [phone, setPhone] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [storeSlug, setStoreSlug] = useState("hiq");

    // Check if already logged in
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch("/api/hiq/me");
                if (res.ok) {
                    setLocation("/dashboard", { replace: true });
                }
            } catch (e) {
                // Not logged in, ignore
            }
        };
        checkAuth();
    }, [setLocation]);

    const { store: brand, isLoading: isBrandLoading } = useStore();

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, "");
        if (val.length <= 11) {
            setPhone(val);
        }
    };

    const formattedPhone = (val: string) => {
        if (!val) return "";
        if (val.length <= 3) return val;
        if (val.length <= 7) return `${val.slice(0, 3)}-${val.slice(3)}`;
        return `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
    };

    const handleStart = async () => {
        if (phone.length < 10) {
            toast({
                variant: "destructive",
                title: "입력 오류",
                description: "올바른 전화번호 11자리를 입력해주세요.",
            });
            return;
        }

        setIsLoading(true);
        try {
            const res = await apiRequest("/api/hiq/login", {
                method: "POST",
                body: { phone, storeSlug },
            });

            if (res.isNew) {
                toast({
                    title: "환영합니다!",
                    description: "신규 회원님, 간단한 등록 절차를 진행합니다.",
                });
            } else {
                toast({
                    title: `${res.member.name}님, 안녕하세요!`,
                    description: "오늘도 즐거운 게임 되세요.",
                });
            }
            setTimeout(() => setLocation(res.redirectTo), 500);

        } catch (error) {
            toast({
                variant: "destructive",
                title: "접속 실패",
                description: "서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (isBrandLoading || !brand) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
                <div className="text-white/20 font-black text-4xl animate-pulse tracking-tighter">RANKUE</div>
                <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="w-1/2 h-full bg-indigo-500"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#050505] font-sans">
            {/* Background Layers */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-premium-billiards opacity-20 grayscale brightness-50" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.8)_100%)]" />
            </div>

            {/* Main Glass Container */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-full max-w-[400px] premium-glass rounded-[3rem] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.8)]"
            >
                {/* Header Section */}
                <div className="pt-12 pb-8 text-center bg-white/[0.02]">
                    <motion.div
                        key={brand?.logoText}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <h1 className="text-4xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                            {brand?.logoText || 'RANKUE'}
                        </h1>
                        <div className="flex items-center justify-center gap-2 mt-3">
                            <span className="h-[1px] w-4 bg-white/10" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                                {brand?.subText || 'Premium Lounge'}
                            </p>
                            <span className="h-[1px] w-4 bg-white/10" />
                        </div>
                    </motion.div>
                </div>

                {/* Input Area */}
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="w-full relative group">
                        <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="tel"
                            placeholder="휴대폰 번호 입력"
                            value={formattedPhone(phone)}
                            onChange={handlePhoneChange}
                            className="w-full bg-transparent border-b-2 border-white/10 focus:border-[#10b981] text-center text-3xl font-black tracking-[0.2em] text-white placeholder:text-white/10 py-4 transition-all outline-none"
                        />
                        {/* Tooltip hint */}
                        <p className="text-center text-[10px] text-white/20 mt-4 font-bold tracking-widest uppercase">
                            Enter your phone number to login
                        </p>
                    </div>
                </div>

                {/* Enter Button */}
                <div className="px-8 pb-8">
                    <motion.button
                        disabled={phone.length < 10 || isLoading}
                        onClick={handleStart}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full h-18 py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all disabled:opacity-20 shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden group"
                        style={{
                            background: phone.length === 11 ? "#10b981" : "#1a1a1a",
                            color: phone.length === 11 ? "#000" : "#555"
                        }}
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        ) : (
                            <>
                                <span>입장하기</span>
                                <LucideChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                        {/* Edge Highlight */}
                        <div className="absolute inset-0 border border-white/20 rounded-2xl pointer-events-none" />
                    </motion.button>
                </div>

                {/* Footer */}
                <div className="text-center pb-6 opacity-30">
                    <p className="text-[10px] font-bold tracking-widest text-white">POLISHED BY RANKUE</p>
                </div>
            </motion.div>
        </div>
    );
}

function KeypadButton({ value, onClick, brandColor }: { value: string, onClick: (v: string) => void, brandColor?: string }) {
    return (
        <div className="flex items-center justify-center">
            <motion.button
                whileTap={{ scale: 0.85, shadow: `0 0 20px ${brandColor || '#6366f1'}44` }}
                onClick={() => onClick(value)}
                title={value}
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-light text-white/80 transition-all bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05]"
            >
                {value}
            </motion.button>
        </div>
    );
}
