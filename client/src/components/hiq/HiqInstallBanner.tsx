import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideDownload, X, Share } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/nativeBridge";

// ── 스토어 링크 ────────────────────────────────────────────────
// 네이티브 앱이 출시된 플랫폼은 PWA 대신 스토어로 보낸다. 특히 iOS 는 PWA 설치가
// "공유 → 스크롤 → 홈 화면에 추가" 4단계라 대부분 이탈하고, 카카오톡 등 인앱브라우저에선
// 아예 불가능하다. 반면 스토어 링크는 어떤 웹뷰에서 눌러도 OS 가 가로채 스토어 앱을 띄운다.
//
// ★ 미출시 플랫폼은 null 로 둔다 → 그 플랫폼은 기존 PWA 경로를 그대로 쓴다.
//   (출시되면 URL 만 채우면 된다. 죽은 스토어 링크로 보내지 않기 위한 장치다.)
// referrer/ct 는 유입 측정용 — 없으면 이 배너가 효과가 있는지 영영 알 수 없다.
const IOS_APP_STORE_URL: string | null =
    "https://apps.apple.com/app/id6760333313?ct=web_install_banner";
const ANDROID_PLAY_URL: string | null =
    "https://play.google.com/store/apps/details?id=com.rankue.app&referrer=utm_source%3Dweb%26utm_medium%3Dinstall_banner";

export function HiqInstallBanner() {
    const { t } = useT();
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        // Only run on client
        if (typeof window === "undefined") return;

        // ★ 네이티브 앱(Capacitor) 안에서는 절대 띄우지 않는다 — 이미 앱을 쓰는 사람에게
        //   "앱을 받으세요"가 뜨는 사고가 난다. display-mode:standalone 만으로는 안 걸러진다
        //   (안드로이드 Capacitor 웹뷰가 standalone 으로 보고되지 않는 경우가 있다).
        if (isNativeApp()) return;

        // Check if already installed
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        const isAndroidDevice = /android/.test(userAgent);
        setIsIOS(isIosDevice);
        setIsAndroid(isAndroidDevice);

        if (isIosDevice) {
            // Always show for iOS web (if not standalone)
            setIsVisible(true);
        } else {
            // 안드로이드에 Play 앱이 있으면 beforeinstallprompt 를 기다리지 않고 바로 띄운다.
            // 그 이벤트는 크롬에서 PWA 조건을 만족할 때만 발생해서, 인앱브라우저 사용자에게는
            // 지금까지 배너가 **아예 안 보였다**. 스토어 경로는 그 사용자들까지 커버한다.
            if (isAndroidDevice && ANDROID_PLAY_URL) setIsVisible(true);

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

    // iOS 스토어 출시됨 → 홈화면 추가 가이드 대신 App Store 로. 미출시면 기존 가이드 유지.
    const iosGoesToStore = isIOS && !!IOS_APP_STORE_URL;
    // 안드로이드: Play 가 있으면 스토어 우선. PWA 프롬프트가 잡혀 있으면 보조 링크로 남긴다.
    const androidGoesToStore = isAndroid && !!ANDROID_PLAY_URL;
    const storeUrl = iosGoesToStore ? IOS_APP_STORE_URL : androidGoesToStore ? ANDROID_PLAY_URL : null;

    const handleInstallClick = async () => {
        if (storeUrl) {
            setIsVisible(false);
            window.open(storeUrl, "_blank", "noopener,noreferrer");
            return;
        }
        if (isIOS) {
            setShowIOSGuide(true);
        } else {
            if (!deferredPrompt) return;
            setIsVisible(false);
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
        }
    };

    // 안드로이드에서 스토어를 주 버튼으로 쓰되, PWA 프롬프트가 살아 있으면 보조 경로로 남긴다
    // (수십 MB 다운로드를 원치 않는 사용자의 선택지를 없애지 않는다).
    const showPwaFallbackLink = androidGoesToStore && !!deferredPrompt;
    const usePwaFallback = async () => {
        if (!deferredPrompt) return;
        setIsVisible(false);
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
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
                                <span className="text-[rgba(0,0,0,0.87)] font-semibold text-sm">{t("hiqInstallBanner.title")}</span>
                                <span className="text-black/60 text-xs text-left">
                                    {storeUrl
                                        ? t("hiqInstallBanner.subtitleStore")
                                        : isIOS ? t("hiqInstallBanner.subtitleIos") : t("hiqInstallBanner.subtitle")}
                                </span>
                                {showPwaFallbackLink && (
                                    <button
                                        onClick={usePwaFallback}
                                        className="text-black/45 text-[11px] underline underline-offset-2 text-left mt-0.5"
                                    >
                                        {t("hiqInstallBanner.pwaInstead")}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleInstallClick}
                                className="bg-brand text-white hover:bg-brand/90 active:scale-95 font-bold text-xs h-9 rounded-full px-5 transition-all shrink-0"
                            >
                                {storeUrl
                                    ? t("hiqInstallBanner.getApp")
                                    : isIOS ? t("hiqInstallBanner.howTo") : t("hiqInstallBanner.install")}
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
                            {t("hiqInstallBanner.iosGuideTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-black/60 text-center">
                            {t("hiqInstallBanner.iosGuideLine1")}<br />
                            <Share className="w-5 h-5 inline-block mx-1 mb-1" />
                            <span className="text-[rgba(0,0,0,0.87)] font-bold">{t("hiqInstallBanner.iosGuideShareButton")}</span>{t("hiqInstallBanner.iosGuideLine2")}<br />
                            <span className="text-[rgba(0,0,0,0.87)] font-bold">{t("hiqInstallBanner.iosGuideAddHome")}</span>{t("hiqInstallBanner.iosGuideLine3")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center py-4">
                        <div className="flex flex-col items-center gap-2 text-xs text-black/55">
                            <div className="px-3 py-2 bg-black/[0.04] rounded-lg ">
                                {t("hiqInstallBanner.step1Prefix")} <span className="text-[#007AFF] font-bold">{t("hiqInstallBanner.step1ShareIcon")}</span> {t("hiqInstallBanner.step1Suffix")}
                            </div>
                            <div className="px-3 py-2 bg-black/[0.04] rounded-lg ">
                                {t("hiqInstallBanner.step2Prefix")} <span className="text-[rgba(0,0,0,0.87)] font-bold">{t("hiqInstallBanner.step2AddHome")}</span> {t("hiqInstallBanner.step2Suffix")}
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowIOSGuide(false)}
                        className="w-full bg-brand hover:bg-brand/90 active:scale-95 text-white font-bold rounded-full transition-all"
                    >
                        {t("hiqInstallBanner.confirm")}
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}
