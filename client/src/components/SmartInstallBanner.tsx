import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWA } from '@/contexts/PWAContext';
import { X, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const SmartInstallBanner = () => {
    const { isStandalone, deferredPrompt, installApp } = usePWA();
    const [isVisible, setIsVisible] = useState(false);
    const [isKakao, setIsKakao] = useState(false);

    useEffect(() => {
        // Detect KakaoTalk In-App Browser
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('kakaotalk')) {
            setIsKakao(true);
            // Show banner immediately for Kakao users to guide them
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }

        // Standard PWA Logic
        if (!isStandalone && deferredPrompt) {
            const hasDismissed = localStorage.getItem('pwa-banner-dismissed');
            if (!hasDismissed) {
                const timer = setTimeout(() => setIsVisible(true), 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [isStandalone, deferredPrompt]);

    const handleDismiss = () => {
        setIsVisible(false);
        if (!isKakao) {
            localStorage.setItem('pwa-banner-dismissed', 'true');
        }
    };

    const handleInstall = async () => {
        if (isKakao) {
            // Copy URL to clipboard for convenience
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('주소가 복사되었습니다. 크롬/사파리에서 붙여넣기 해주세요!');
            } catch (err) {
                // Fallback
            }
            return;
        }
        await installApp();
        setIsVisible(false);
    };

    if (isStandalone || (!deferredPrompt && !isKakao)) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-20 left-4 right-4 z-[100] md:max-w-md md:mx-auto"
                >
                    <div className="glass-card-strong p-4 rounded-[24px] border border-white/10 bg-black/80 backdrop-blur-2xl shadow-2xl overflow-hidden relative">
                        {/* Background Glow */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/20 rounded-full blur-[40px] -z-10" />

                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center p-0.5 shadow-lg shadow-violet-500/20">
                                    <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                                        <img src="/icon.svg" alt="Polli" className="w-8 h-8 rounded-lg" />
                                    </div>
                                </div>
                                <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1 shadow-md">
                                    <Star className="w-2.5 h-2.5 text-black fill-current" />
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-white font-black text-sm italic tracking-tight">POLLI 앱 설치</h3>
                                <p className="text-white/60 text-[10px] font-medium leading-tight mt-0.5">
                                    {isKakao ? (
                                        <span className="text-yellow-400">
                                            ⚠️ 카카오톡에선 설치가 안돼요!<br />
                                            우측 하단 메뉴(···) &gt; 다른 브라우저로 열기
                                        </span>
                                    ) : (
                                        <>앱으로 더 쾌적하게 투표하고<br />실시간 분석 알림을 받으세요!</>
                                    )}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                {isKakao ? (
                                    <Button
                                        onClick={handleInstall}
                                        className="h-9 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-bold border border-white/20"
                                    >
                                        주소 복사
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleInstall}
                                        className="h-9 px-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-[11px] font-black border-0 shadow-lg shadow-violet-500/30"
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                        앱 설치하기
                                    </Button>
                                )}
                                <button
                                    onClick={handleDismiss}
                                    className="text-[10px] text-white/30 font-bold hover:text-white/60 flex items-center justify-center"
                                >
                                    <X className="w-3 h-3 mr-1" />
                                    {isKakao ? '닫기' : '나중에 하기'}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
