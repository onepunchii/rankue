import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideChevronRight, LucideDelete, LucideShieldQuestion } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/contexts/StoreContext";
import { PinResetDialog } from "@/components/hiq/PinResetDialog";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import SocialLogin, { socialLoginAvailable } from "@/components/hiq/SocialLogin";
import { Capacitor } from "@capacitor/core";
import MarketingLanding from "./marketing-landing";

export default function Landing() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { t, locale, setLocale } = useT();
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [memberName, setMemberName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isResetOpen, setIsResetOpen] = useState(false);
    // 로그인 방식 분기 — 한국어는 전화번호, 그 외 언어는 구글·애플이 기본.
    // 소셜 불가 상황(키 미배포·앱 웹뷰 브릿지 전)은 전화로 폴백. PIN 확인 단계는 항상 전화 카드.
    const [phoneMode, setPhoneMode] = useState<boolean | null>(null);
    const showPhone = requiresPassword || (phoneMode ?? (locale === "ko" || !socialLoginAvailable()));

    // 마케팅 랜딩을 먼저 보여줄지. 앱 안이거나, 화이트라벨 매장 진입(?store=)이거나,
    // 한 번 시작을 누른 뒤에는 곧장 로그인 폼으로 간다(랜딩이 매번 끼면 방해만 된다).
    const [showIntro, setShowIntro] = useState(() => {
        try {
            if (Capacitor.isNativePlatform()) return false;
            const p = new URLSearchParams(window.location.search);
            if (p.get("store") || p.get("login")) return false;
            if (window.location.pathname !== "/") return false;
            return localStorage.getItem("rankue-intro-seen") !== "1";
        } catch {
            return false;
        }
    });
    const markIntroSeen = () => {
        try { localStorage.setItem("rankue-intro-seen", "1"); } catch { /* ignore */ }
    };

    // Resolve the tenant slug from the URL exactly as StoreContext does, so a
    // white-label tenant logs into its OWN store rather than a hardcoded "hiq".
    const resolveStoreSlug = () => {
        const searchParams = new URLSearchParams(window.location.search);
        const storeParam = searchParams.get("store");
        if (window.location.pathname.startsWith("/hiq")) return "hiq";
        if (storeParam) return storeParam;
        const host = window.location.hostname;
        if (host.includes(".") && !host.startsWith("www") && host.split(".").length > 2) {
            return host.split(".")[0];
        }
        return "hiq";
    };

    // 이미 로그인했는지 확인. 결과가 나오기 전까지는 로그인 폼을 그리지 않는다 —
    // 예전에는 확인을 기다리지 않고 폼부터 렌더해서, 앱을 열 때마다 "휴대폰 번호 입력"
    // 화면이 깜빡 보였다가 대시보드로 넘어갔다(자동 로그인은 되는데 화면만 스쳤다).
    // "확인 안 됨"이 아니라 "확인 중"을 별도 상태로 둬야 그 깜빡임이 사라진다.
    const [authState, setAuthState] = useState<"checking" | "in" | "out">("checking");
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch("/api/hiq/me");
                if (!alive) return;
                if (res.ok) {
                    setAuthState("in");
                    setLocation("/dashboard", { replace: true });
                    return;
                }
            } catch { /* 네트워크 실패는 미로그인으로 취급 */ }
            if (alive) setAuthState("out");
        })();
        return () => { alive = false; };
    }, [setLocation]);

    const { store: brand, isLoading: isBrandLoading, error: brandError } = useStore();

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
        if (!requiresPassword && phone.length < 10) {
            toast({
                variant: "destructive",
                title: t("login.invalidPhoneTitle"),
                description: t("login.invalidPhone"),
            });
            return;
        }

        if (requiresPassword && password.length < 4) {
            toast({
                variant: "destructive",
                title: "입력 오류",
                description: "비밀번호를 4자리 이상 입력해주세요.",
            });
            return;
        }

        setIsLoading(true);
        try {
            const res = await apiRequest("/api/hiq/login", {
                method: "POST",
                body: { phone, storeSlug: resolveStoreSlug(), password: requiresPassword ? password : undefined },
            });

            if (res.requiresPassword) {
                setRequiresPassword(true);
                setMemberName(res.memberName);
                setIsLoading(false);
                return;
            }

            if (res.isNew) {
                toast({
                    title: t("login.welcomeNewTitle"),
                    description: t("login.welcomeNewDesc"),
                });
            } else {
                toast({
                    title: `${res.member.name}${t("login.welcomeBackTitle")}`,
                    description: t("login.welcomeBackDesc"),
                });
            }
            // Honor a ?redirect= return url (e.g. from the QR invite flow) ONLY for
            // existing members — new members must complete registration (res.redirectTo
            // points at /register). startsWith("/") guards against open-redirect.
            const redirect = new URLSearchParams(window.location.search).get("redirect");
            const dest = !res.isNew && redirect && redirect.startsWith("/") ? redirect : res.redirectTo;
            setTimeout(() => setLocation(dest), 500);

        } catch (error: any) {
            toast({
                variant: "destructive",
                title: t("login.failedTitle"),
                description: error.message || t("login.connectionFailed"),
            });
            if (requiresPassword) setPassword("");
        } finally {
            setIsLoading(false);
        }
    };

    // One predicate drives both the disabled state and the active styling so a
    // valid number can never render as an inert-looking button.
    const canSubmit = requiresPassword ? password.length >= 4 : phone.length >= 10;

    // 검색으로 들어온 방문자에게는 로그인 폼 대신 마케팅 랜딩을 먼저 보여준다.
    // 홈(/)이 곧바로 "휴대폰 번호를 입력하세요"라 랭큐를 모르는 사람이 그대로 이탈했고,
    // 검색엔진 입장에서도 제품 설명이 없는 로그인 폼이라 색인 가치가 낮았다.
    // 앱(Capacitor)·화이트라벨 매장(?store=)·이미 시작을 누른 사람은 기존 흐름 그대로 간다.
    // 로그인 상태면 마케팅 랜딩도 건너뛴다 — 이미 쓰는 사람에게 소개 화면은 방해다.
    if (showIntro && authState === "out") {
        return <MarketingLanding onStart={() => { setShowIntro(false); markIntroSeen(); }} />;
    }

    // 인증 확인 중이거나(=대시보드로 갈 수도 있다) 이미 로그인해 이동하는 중이면
    // 로그인 폼 대신 스플래시를 유지한다. 이게 앱 실행 시 화면이 스쳐 지나가던 원인이었다.
    if (authState !== "out" || isBrandLoading || !brand) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] flex flex-col items-center justify-center gap-4">
                <div className="text-brand font-bold text-4xl animate-pulse">RANKUE</div>
                {brandError ? (
                    <div className="text-red-500 font-semibold bg-black/[0.04] p-4 rounded-tile">
                        오류: {brandError.message}
                    </div>
                ) : (
                    <div className="w-48 h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: "100%" }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="w-1/2 h-full bg-brand"
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 relative overflow-hidden bg-[#f2f0eb] font-sans">
            {/* Main Container */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-full max-w-[400px] rk-card overflow-hidden flex flex-col"
            >
                {/* Header Section */}
                <div className="pt-12 pb-8 text-center bg-black/[0.03]">
                    <motion.div
                        key={brand?.logoText}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <h1 className="text-4xl font-bold text-brand">
                            RANKUE
                        </h1>
                        <div className="flex items-center justify-center gap-2 mt-3">
                            <span className="h-[1px] w-4 bg-black/10" />
                            <p className="text-[12px] font-medium text-black/55">
                                {requiresPassword ? `${memberName} ${t("login.checkingMember")}` : t("common.tagline")}
                            </p>
                            <span className="h-[1px] w-4 bg-black/10" />
                        </div>
                    </motion.div>
                </div>

                {/* Input Area — 한국어(또는 앱): 전화번호 / 그 외 언어: 구글·애플 */}
                {!showPhone ? (
                    <div className="px-8 py-10 flex flex-col items-center gap-6">
                        <SocialLogin />
                        <button
                            onClick={() => setPhoneMode(true)}
                            className="text-[12px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4"
                        >
                            {t("login.phoneLoginLink")}
                        </button>
                    </div>
                ) : (
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="w-full relative group">
                        <input
                            type={requiresPassword ? "password" : "tel"}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete={requiresPassword ? "current-password" : "tel-national"}
                            placeholder={requiresPassword ? t("login.pinPlaceholder") : t("login.phonePlaceholder")}
                            value={requiresPassword ? password : formattedPhone(phone)}
                            onChange={requiresPassword
                                ? (e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))
                                : handlePhoneChange}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isLoading && (requiresPassword ? password.length >= 4 : phone.length >= 10)) {
                                    handleStart();
                                }
                            }}
                            className={`w-full bg-transparent border-b-2 border-black/10 focus:border-brand text-center text-3xl font-bold tabular-nums text-[rgba(0,0,0,0.87)] placeholder:text-black/40 py-4 transition-all outline-none`}
                            autoFocus={requiresPassword}
                        />
                        {/* Tooltip hint */}
                        <p className="text-center text-[12px] text-black/55 mt-4 font-medium">
                            {requiresPassword ? t("login.pinHint") : t("login.phoneHint")}
                        </p>

                        {requiresPassword && (
                            <button
                                onClick={() => setIsResetOpen(true)}
                                className="w-full mt-6 py-4 px-4 bg-black/[0.04] rounded-tile text-[12px] font-medium text-black/55 hover:text-brand hover:border-brand/50 transition-all active:scale-95 text-center flex items-center justify-center gap-2 group"
                            >
                                <LucideShieldQuestion className="w-4 h-4 text-black/40 group-hover:text-brand transition-colors" />
                                <span>{t("login.forgotPin")}</span>
                            </button>
                        )}

                        {/* 비한국어 유저가 전화 모드로 온 경우 — 소셜로 돌아가는 교차 링크 */}
                        {!requiresPassword && locale !== "ko" && socialLoginAvailable() && (
                            <button
                                onClick={() => setPhoneMode(false)}
                                className="w-full mt-6 text-[12px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4 text-center"
                            >
                                {t("login.socialLoginLink")}
                            </button>
                        )}
                    </div>
                </div>
                )}

                {/* Enter Button — 전화 모드에서만 */}
                {showPhone && (
                <div className="px-8 pb-8">
                    <motion.button
                        disabled={!canSubmit || isLoading}
                        onClick={handleStart}
                        title={requiresPassword ? t("login.confirmEnter") : t("login.enter")}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full h-16 rounded-tile font-bold text-xl flex items-center justify-center gap-3 transition-all disabled:opacity-20 relative overflow-hidden group"
                        style={{
                            background: canSubmit ? "rgb(var(--brand))" : "rgba(0,0,0,0.04)",
                            color: canSubmit ? "rgb(var(--brand-fg))" : "rgba(0,0,0,0.40)"
                        }}
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span>{requiresPassword ? t("login.confirmEnter") : t("login.enter")}</span>
                                <LucideChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                    </motion.button>
                </div>
                )}

                {/* Footer — 제공 문구 + 언어 선택 */}
                <div className="text-center pb-6 flex flex-col items-center gap-2">
                    <p className="text-[12px] font-medium text-black/55">{t("common.poweredBy")}</p>
                    <select
                        value={locale}
                        onChange={(e) => { setLocale(e.target.value as Locale); setPhoneMode(null); }}
                        aria-label="Language"
                        className="text-[11px] text-black/40 bg-transparent outline-none cursor-pointer text-center"
                    >
                        {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                </div>
            </motion.div>

            <PinResetDialog
                open={isResetOpen}
                onOpenChange={setIsResetOpen}
                initialPhone={phone}
            />
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
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-light text-black/70 transition-all bg-black/[0.04] hover:bg-black/[0.06] "
            >
                {value}
            </motion.button>
        </div>
    );
}
