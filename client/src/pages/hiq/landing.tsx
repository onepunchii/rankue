import type React from "react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { safeReturnPath } from "@shared/promoFunnel";
import { apiRequest, refreshAfterLogin } from "@/lib/queryClient";
import { LucideChevronRight, LucideDelete, LucideShieldQuestion } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/contexts/StoreContext";
import { PinResetDialog } from "@/components/hiq/PinResetDialog";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import SocialLogin, { AppleLogo, socialLoginAvailable } from "@/components/hiq/SocialLogin";
import { loginPagePath } from "@/components/hiq/LoginSheet";
import { kakaoLoginAvailable, kakaoLoginOpen, kakaoNativeAvailable } from "@/lib/kakaoLogin";
import { isNativeApp } from "@/lib/nativeBridge";

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
    // 로그인 방식 분기 — 사용자가 직접 고르면(phoneMode) 그쪽, 아니면 아래 kakaoFirst·showPhone 이 기본을 정한다.
    // 가입·로그인 팝업의 '전화번호로 계속하기'로 온 사람(?phone=1, LoginSheet loginPagePath)은 이미 골랐다 — 전화번호 카드부터 연다(2026-10-06).
    const [phoneMode, setPhoneMode] = useState<boolean | null>(() => {
        try { return new URLSearchParams(window.location.search).has("phone") ? true : null; } catch { return null; }
    });

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

    // 랭큐 첫 주소(/)를 **그냥** 연 사람인가 — 그렇다면 비로그인도 로그인 폼·소개 화면 대신 예시 홈(/dashboard)으로 보낸다.
    // 2026-10-06 오너: "랭큐 직접 들어가면 로그인 페이지인데 이것도 샘플로. … 누구나 어떠한 플랫폼인지 알아가기 쉽게." 웹·앱 모두.
    // 로그인 화면을 남기는 경우(= 맨 '/' 가 아니다):
    //   ?login   로그인하러 온 사람 — 골프 전용 문·크루 만들기(goLoginPage), 팝업의 '전화번호로 계속하기'. 전화번호 가입·기존 회원의 길이다
    //   ?redirect 끝나면 돌아갈 곳이 실린 옛 링크
    //   ?store · 매장 주소(서브도메인)  자기 매장으로 로그인해야 한다 — 예시 홈으로 넘기면 매장 로그인 입구가 사라진다
    //   /hiq     호환 주소
    // 화면이 붙을 때 **한 번만** 판단한다 — 그릴 때마다 보면 PIN 확인 단계 같은 폼 상태가 날아간다.
    // 예전의 소개 화면(MarketingLanding)은 여기서 더는 띄우지 않는다(컴포넌트와 /about 은 그대로 있다) — 소개는 예시 홈이 맡는다.
    const [bareRoot] = useState(() => {
        try {
            if (window.location.pathname !== "/") return false;
            const p = new URLSearchParams(window.location.search);
            if (p.has("login") || p.has("redirect") || p.has("store")) return false;
            return resolveStoreSlug() === "hiq";
        } catch {
            return false;
        }
    });

    // 팝업이 기본이다(2026-10-07 오너: "전체 로그인화면을 팝업이 기본이 되게"). 로그인하러 이 주소로 온 사람(?login · ?redirect · /hiq)도
    // 전화번호 길을 고른 것(?phone)이나 매장 전용 주소가 아니면 이 화면을 그리지 않고 **예시 홈 위의 가입·로그인 팝업**으로 넘긴다
    // (loginPagePath — 옛 링크·북마크·카카오 콘솔에 적힌 주소가 여기로 온다). 이 화면이 남는 곳: 전화번호 입력·PIN·PIN 찾기, 매장 로그인.
    // 화면이 붙을 때 한 번만 판단한다(bareRoot 와 같은 이유).
    const [popupFirst] = useState(() => {
        try {
            const p = new URLSearchParams(window.location.search);
            if (p.has("phone") || p.has("store")) return false;
            return resolveStoreSlug() === "hiq";
        } catch {
            return false;
        }
    });

    // 첫 화면에 무엇을 먼저 보여 줄까(2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플").
    //  - 한국어 + 카카오 가능(kakaoFirst — 웹, 그리고 네이티브 카카오 플러그인이 든 새 앱 1.3~): 소셜 묶음(카카오·구글·애플)이 먼저,
    //    그 아래 작은 글씨 "전화번호로 로그인". 전화번호 길은 기존 회원·매장에서 등록한 회원이 쓰므로 없애지 않는다.
    //  - 한국어인데 카카오가 안 되는 곳(플러그인 없는 앱 1.2 이하·키 없음)과 매장 화이트라벨(?store=·매장 주소) 진입: 예전 그대로 전화번호가 먼저.
    //  - 그 외 언어: 예전 그대로 구글·애플이 먼저, 소셜을 못 쓰면(키 미배포) 전화로.
    //  PIN 확인 단계는 항상 전화 카드.
    // 매장 진입에서는 카카오 단추 자체를 두지 않는다(2026-10-05 검토): 카카오에 다녀오면 매장 표시(?store=)가 사라져
    // 취소·실패 뒤 기본 로그인 화면으로 떨어지고, 거기서 번호를 넣은 매장 회원이 '미가입'으로 판정돼 기본 매장에 또 가입하게 된다.
    const storeEntry = resolveStoreSlug() !== "hiq";
    const kakaoFirst = locale === "ko" && kakaoLoginAvailable() && !storeEntry;
    const showPhone = requiresPassword || (phoneMode ?? (locale === "ko" ? !kakaoFirst : !socialLoginAvailable(locale)));
    // 전화 카드 아래에 소셜 묶음을 둘 수 있는가 — 매장 진입은 카카오를 세지 않는다(구글 키 없이 카카오만 있는 배포에서
    // '또는' 줄만 그려지고 아래가 비는 것을 막는다).
    const socialBelowPhone = socialLoginAvailable(storeEntry ? undefined : locale);
    // 스토어 앱 안의 한국어 화면인데 **이 바이너리에 카카오 단추가 없다**(플러그인이 없는 1.2 이하 — 웹뷰가 카카오로 못 넘어간다).
    // 웹에서 카카오로 가입한 사람이 여기서 전화번호나 구글을 누르면 **새 계정**이 만들어져 기록이 갈린다 — 누르기 전에 한 줄로 알린다(2026-10-05 검토).
    // 새 바이너리(1.3~)는 네이티브 카카오 단추가 있어 이 안내를 띄우지 않는다(2026-10-06 — kakaoNativeAvailable).
    const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();
    // 보조 줄(2026-10-07 오너: "한국은 카카오 구글이 주 가입버튼, 애플이나 핸드폰번호는 서브") — 한국어 · 카카오가 되는 곳에서 큰 단추(카카오·구글) 아래에
    // 전화번호와 애플(웹)을 작은 글씨로 나란히 둔다. 애플은 SocialLogin 이 넘겨준다(웹에서만) — iOS 앱에서는 큰 묶음에 남는다(App Store 4.8).
    // 안내는 전화번호로 쓰던 사람에게 길을 알려 준다: 큰 단추로 시작해도 번호와 PIN 으로 기존 계정에 이어진다(AttachPhoneSheet).
    const kakaoSecondaryRow = (apple: { onClick: () => void; disabled: boolean } | null) => (
        <div className="w-full mt-3 flex flex-col items-center gap-1">
            <p className="text-[12px] font-medium text-black/45 text-center leading-relaxed break-keep">{t("login.phoneExistingHint")}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-2">
                <button
                    type="button"
                    onClick={() => setPhoneMode(true)}
                    className="h-11 px-2 text-[13px] font-semibold text-black/60 hover:text-brand transition-colors underline underline-offset-4"
                >
                    {t("login.phoneLogin")}
                </button>
                {apple && (
                    <>
                        <span aria-hidden className="text-[12px] text-black/30">·</span>
                        <button
                            type="button"
                            onClick={apple.onClick}
                            disabled={apple.disabled}
                            className="h-11 px-2 flex items-center gap-1.5 text-[13px] font-semibold text-black/60 hover:text-brand transition-colors underline underline-offset-4 disabled:opacity-50"
                        >
                            <AppleLogo />
                            <span>{t("login.continueApple")}</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );

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
                    // 이미 로그인돼 있다 — 화면이 '비로그인'으로 기억하고 있어 여기로 보낸 것일 수 있으니 '나'를 새로 받고,
                    // 보던 곳(?redirect=)이 있으면 홈이 아니라 거기로 돌려보낸다(2026-10-05)
                    await refreshAfterLogin();
                    if (!alive) return;
                    setLocation(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard", { replace: true });
                    return;
                }
            } catch { /* 네트워크 실패는 미로그인으로 취급 */ }
            if (!alive) return;
            // 비로그인이 맨 '/' 를 열었다 — 예시 홈으로. 로그인 폼을 그리지 않고(확인 중 화면을 유지한 채) 자리를 바꿔 끼운다:
            // '뒤로'를 눌러 이 주소로 돌아와 다시 튕기지 않게, 그리고 앱의 '뒤로 = 종료' 판단이 그대로 통하게.
            if (bareRoot) { setLocation("/dashboard", { replace: true }); return; }
            // 로그인하러 왔지만 전화번호 길도 매장 주소도 아니다 — 전체 화면 대신 예시 홈 위의 팝업으로(끝나면 ?redirect= 로 돌아간다)
            if (popupFirst) {
                setLocation(loginPagePath(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard"), { replace: true });
                return;
            }
            setAuthState("out");
        })();
        return () => { alive = false; };
    }, [setLocation, bareRoot, popupFirst]);

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
                title: t("landing.inputError"),
                description: t("landing.pinTooShort"),
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
            const redirect = safeReturnPath(new URLSearchParams(window.location.search).get("redirect"));
            // 새 회원은 가입(/register)을 마친 뒤 돌아가도록 redirect 를 이어 준다(2026-09-27 — 길 찾기 가입 안내에서 온 사람이
            // 가입 뒤 대시보드로 떨어져 하던 걸 잃었다). register 가 같은 검사(safeReturnPath)로 다시 거른다.
            const dest = !redirect ? res.redirectTo
                : !res.isNew ? redirect
                : res.redirectTo?.startsWith("/register") ? `${res.redirectTo}${res.redirectTo.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(redirect)}`
                : res.redirectTo;
            // 로그인된 사람(기존 회원)은 '나'를 새로 받은 뒤에 옮긴다 — 안 그러면 돌아간 화면이 비로그인으로 그려진다(queryClient.refreshAfterLogin)
            if (!res.isNew) await refreshAfterLogin();
            setTimeout(() => setLocation(dest), res.isNew ? 500 : 200);

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

    // 인증 확인 중이거나(=대시보드로 갈 수도 있다) 이미 로그인해 이동하는 중이면
    // 로그인 폼 대신 스플래시를 유지한다. 이게 앱 실행 시 화면이 스쳐 지나가던 원인이었다.
    // 맨 '/' 를 연 비로그인도 여기 머문다 — 예시 홈으로 넘어가는 중이다(위 bareRoot).
    if (authState !== "out" || isBrandLoading || !brand) {
        return (
            <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center gap-4">
                <div className="text-brand font-bold text-4xl animate-pulse">RANKUE</div>
                {brandError ? (
                    <div className="text-red-500 font-semibold bg-black/[0.04] p-4 rounded-tile">
                        {t("landing.errorPrefix")} {brandError.message}
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

    // 골프 페이지(골프 선수·랭킹·골프장)에서 로그인으로 온 사람 — 밝은 화면은 그대로 두고 강조색만 골프 초록(2026-10-01 오너:
    // "골프로 들어오면 로그인 화면 색이 이상하다"). 예전엔 골프 테마가 통째로 덮여 입력칸·입장하기가 어둡게 묻히고 구글 단추만 튀었다.
    // 라임(#64DD17)은 흰 바탕 글자로 너무 옅어서 한 단계 짙은 잔디색을 쓴다.
    const golfEntry = (() => { try { return localStorage.getItem("rankue_current_sport") === "GOLF"; } catch { return false; } })();
    const accentStyle = golfEntry ? ({ "--brand": "63 160 16", "--brand-strong": "52 138 12", "--brand-fg": "255 255 255" } as React.CSSProperties) : undefined;

    return (
        <div style={accentStyle} className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 relative overflow-hidden bg-surface-0 font-sans">
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

                {/* Input Area — 한국어 웹·새 앱(카카오 플러그인 있음): 카카오·구글·애플 / 카카오가 안 되는 앱·매장 진입: 전화번호 / 그 외 언어: 구글·애플 */}
                {!showPhone ? (
                    <div className="px-7 py-10 flex flex-col items-center gap-6">
                        <div className="w-full max-w-[320px] flex flex-col">
                            {/* 한국어 화면은 단추만 — 안내 문구("전 세계 랭킹에 도전")는 다른 언어 방문자에게 쓰던 말이다 */}
                            {/* 한국어 · 카카오가 되는 곳(2026-10-07 오너: "카카오 구글이 주 가입버튼, 애플이나 핸드폰번호는 서브") — 큰 단추는 카카오·구글,
                                전화번호와 애플(웹)은 아래 작은 줄. iOS 앱에서는 애플 단추가 큰 묶음에 남는다(App Store 4.8 — SocialLogin 이 정한다) */}
                            <SocialLogin hint={!kakaoFirst} kakao={!storeEntry} secondaryRow={kakaoFirst ? kakaoSecondaryRow : undefined} />
                        </div>
                        {!kakaoFirst && (
                            <div className="w-full max-w-[320px] flex flex-col items-center gap-2">
                                <button
                                    onClick={() => setPhoneMode(true)}
                                    className="text-[12px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4"
                                >
                                    {t("login.phoneLoginLink")}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                /* 로그인 수단 3종(전화·구글·애플)을 **하나의 320px 열**에 담는다.
                   예전에는 전화 영역(폭 271, x=52)과 소셜 영역(폭 320, x=28)이 서로 다른 열이었고
                   높이도 70/64/44/40 으로 제각각이라 "정리 안 된" 화면이 됐다(2026-08-16 실측). */
                <div className="px-7 pt-9 pb-8 flex flex-col items-center">
                    <div className="w-full max-w-[320px] flex flex-col">
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
                            /* 입력칸처럼 보여야 한다 — 예전 스타일(밑줄 + 3xl 볼드 플레이스홀더)은
                               제목으로 읽혀서 어디에 입력하는지 알 수 없었다. */
                            className="w-full h-[54px] rounded-tile bg-black/[0.03] border border-black/[0.09] focus:border-brand focus:bg-white text-center text-[19px] font-semibold tabular-nums text-[rgba(0,0,0,0.87)] placeholder:text-black/35 placeholder:font-medium transition-colors outline-none"
                            autoFocus={requiresPassword}
                        />
                        <p className="text-center text-[12px] text-black/45 mt-2.5 font-medium">
                            {requiresPassword ? t("login.pinHint") : t("login.phoneHint")}
                        </p>

                        <motion.button
                            disabled={!canSubmit || isLoading}
                            onClick={handleStart}
                            title={requiresPassword ? t("login.confirmEnter") : t("login.enter")}
                            whileTap={canSubmit ? { scale: 0.98 } : undefined}
                            /* 비활성일 때 opacity-20 은 '고장난 버튼'으로 읽혔다 — 형태는 유지하고 색만 낮춘다 */
                            className="w-full h-[54px] mt-4 rounded-tile font-bold text-[16px] flex items-center justify-center gap-2 transition-colors"
                            style={{
                                background: canSubmit ? "rgb(var(--brand))" : "rgba(0,0,0,0.05)",
                                color: canSubmit ? "rgb(var(--brand-fg))" : "rgba(0,0,0,0.32)",
                            }}
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>{requiresPassword ? t("login.confirmEnter") : t("login.enter")}</span>
                                    <LucideChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </motion.button>

                        {requiresPassword && (
                            <button
                                onClick={() => setIsResetOpen(true)}
                                className="w-full mt-3 h-[44px] bg-black/[0.03] rounded-tile text-[12.5px] font-medium text-black/55 hover:text-brand transition-colors active:scale-[0.98] flex items-center justify-center gap-2 group"
                            >
                                <LucideShieldQuestion className="w-4 h-4 text-black/40 group-hover:text-brand transition-colors" />
                                <span>{t("login.forgotPin")}</span>
                            </button>
                        )}

                        {/* 구글·애플(한국어 화면은 카카오도) — 같은 열, 같은 폭. PIN 확인 단계는 본인 확인 중이라 제외
                            (오너 결정 2026-08-12: 한국어 포함 전 로케일 3종 노출).
                            한국어 웹(kakaoFirst)은 소셜 묶음이 첫 화면이라 여기서 또 늘어놓지 않고 돌아가는 길만 둔다(2026-10-05). */}
                        {!requiresPassword && (kakaoFirst ? (
                            <button
                                // 카카오·구글은 팝업에 있다(2026-10-07) — 예시 홈 위의 가입·로그인 팝업으로 돌아간다(끝나면 ?redirect= 로)
                                onClick={() => setLocation(loginPagePath(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard"))}
                                className="mt-5 self-center text-[12px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4"
                            >
                                {t("login.socialBackLink")}
                            </button>
                        ) : socialBelowPhone && (
                            <>
                                <div className="flex items-center gap-3 my-5">
                                    <span className="flex-1 h-[1px] bg-black/[0.08]" />
                                    <span className="text-[11.5px] font-medium text-black/35">{t("login.or")}</span>
                                    <span className="flex-1 h-[1px] bg-black/[0.08]" />
                                </div>
                                <SocialLogin hint={false} kakao={!storeEntry} />
                            </>
                        ))}
                        {!requiresPassword && kakaoWebOnlyHint && (
                            <p className="mt-5 text-[12px] font-medium text-black/45 text-center leading-relaxed break-keep">{t("login.kakaoWebOnly")}</p>
                        )}
                    </div>
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
