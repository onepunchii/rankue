import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideDownload, X, Share } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function HiqInstallBanner() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        // Only run on client
        if (typeof window === "undefined") return;

        // Check if already installed
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        if (isIosDevice) {
            // Always show for iOS web (if not standalone)
            setIsVisible(true);
        } else {
            // Android / Desktop PWA
            const handleBeforeInstallPrompt = (e: Event) => {
                e.preventDefault();
                setDeferredPrompt(e);
                setIsVisible(true);
            };

            window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

            return () => {
                window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
            };
        }
    }, []);

    const handleInstallClick = async () => {
        if (isIOS) {
            setShowIOSGuide(true);
        } else {
            if (!deferredPrompt) return;
            setIsVisible(false);
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            setDeferredPrompt(null);
        }
    };

    if (!isVisible) return null;

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-4 left-4 right-4 z-50"
                >
                    <div className="bg-white p-4 rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.10)] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shrink-0">
                                <LucideDownload className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[rgba(0,0,0,0.87)] font-semibold text-sm">랭큐 앱 설치하기</span>
                                <span className="text-black/60 text-xs text-left">
                                    {isIOS ? "홈 화면에 추가하고 편하게 쓰세요!" : "홈 화면에 추가하고 더 편하게 접속하세요!"}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleInstallClick}
                                className="bg-brand text-white hover:bg-brand/90 active:scale-95 font-bold text-xs h-9 rounded-full px-5 transition-all"
                            >
                                {isIOS ? "방법보기" : "설치"}
                            </Button>
                            <button
                                onClick={() => setIsVisible(false)}
                                className="p-1.5 hover:bg-black/[0.06] rounded-full transition-colors"
                            >
                                <X className="w-4 h-4 text-black/40" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* iOS Install Guide Modal */}
            <Dialog open={showIOSGuide} onOpenChange={setShowIOSGuide}>
                <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-3xl max-w-xs">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold text-center mb-2">
                            아이폰 홈 화면 추가
                        </DialogTitle>
                        <DialogDescription className="text-black/60 text-center">
                            사파리(Safari) 브라우저 하단의<br />
                            <Share className="w-5 h-5 inline-block mx-1 mb-1" />
                            <span className="text-[rgba(0,0,0,0.87)] font-bold">공유 버튼</span>을 누른 뒤<br />
                            <span className="text-[rgba(0,0,0,0.87)] font-bold">'홈 화면에 추가'</span>를 선택해주세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center py-4">
                        <div className="flex flex-col items-center gap-2 text-xs text-black/55">
                            <div className="px-3 py-2 bg-black/[0.04] rounded-lg ">
                                1. 하단 <span className="text-[#007AFF] font-bold">공유 아이콘</span> 클릭
                            </div>
                            <div className="px-3 py-2 bg-black/[0.04] rounded-lg ">
                                2. 메뉴에서 <span className="text-[rgba(0,0,0,0.87)] font-bold">홈 화면에 추가</span> 선택
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowIOSGuide(false)}
                        className="w-full bg-brand hover:bg-brand/90 active:scale-95 text-white font-bold rounded-full transition-all"
                    >
                        확인했습니다
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}
