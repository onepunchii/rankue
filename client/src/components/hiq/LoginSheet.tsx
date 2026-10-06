/* eslint-disable react-refresh/only-export-components */
/**
 * 가입·로그인 팝업 — 아래에서 올라오는 시트 하나.
 * 2026-10-06 오너: "회원가입은 실제로 하려고 할 때 저 화면보다는 올라오는 간편 회원가입 팝업으로" · "회원가입이 어색하지 않고 자연스럽게 디자인".
 *
 * 예전에는 '로그인'을 누르면 보던 화면을 떠나 로그인 화면(/?login=1&redirect=…)으로 갔다. 이제는 그 자리에서 시트가 올라오고,
 * 로그인이 끝나면 닫히기만 한다 — 보던 골프장·선수 페이지에 그대로 남는다(가려던 곳이 따로 있을 때만 옮긴다).
 *
 * 쓰는 법
 *   openLoginSheet({ from?, title?, desc? })  열었으면 true. 못 열면 false(호스트가 아직 없다 · 지금 화면이 곧 로그인 화면이다) —
 *                                             그때는 부른 쪽이 로그인 화면으로 보낸다(goLogin 이 그렇게 한다).
 *   isLoginSheetOpen() · subscribeLoginSheet(fn) · useLoginSheetOpen()   다른 팝업이 겹치지 않게 물어보는 작은 저장소.
 *   closeLoginSheet()
 *   <LoginSheetHost />  App 의 TermsConsentProvider **안쪽**에 한 번. 바깥에 두면 약관 동의(useTermsGate)가 기본값(항상 통과)으로 떨어져
 *                       소셜 첫 가입이 약관 동의 없이 지나간다.
 * 화면 코드는 보통 직접 부르지 않는다 — goLogin(LoginGate)과 useGuestGate().guard(GuestGate)가 이 팝업을 연다.
 *
 * 색: 지금 종목이 골프(어두운 화면)면 어두운 시트 — **리터럴 색만**(골프 테마가 흰 바탕·검정 글자 유틸을 다른 색으로 바꿔 끼운다, index.css).
 *     아니면 밝은 시트 — 디자인 토큰. shared/loginSheet.test.ts 가 소스를 읽어 지킨다.
 *
 * 순서(2026-10-06 검토): 한국어 화면은 로그인 화면(pages/hiq/landing 의 showPhone)과 같은 규칙이다 — 카카오가 되는 곳은 소셜 묶음이 먼저,
 *     카카오가 안 되는 곳(스위치 꺼짐 · 앱 안 · 매장 진입)은 **전화번호가 먼저**. 전화번호로 가입한 기존 회원이 큰 구글 단추를 먼저 눌러
 *     빈 새 계정이 생기는 일을 줄인다. 다른 언어는 구글·애플이 먼저다. 계정이 갈리기 전에 알리는 두 안내(기존 전화번호 회원 · 앱 안의
 *     카카오 가입자)도 로그인 화면과 같은 조건으로 붙는다.
 * 주·보조(2026-10-07 오너: "한국은 카카오 구글이 주 가입버튼, 애플이나 핸드폰번호는 서브"): 한국어 · 카카오가 되는 곳의 큰 단추는
 *     카카오·구글 둘이다. 전화번호와 애플(웹)은 '또는' 아래 작은 줄로 내려간다. iOS 앱에서는 애플 단추가 큰 묶음에 남는다(App Store 4.8).
 *     전화번호로 쓰던 사람이 큰 단추를 눌러 새 계정이 생겨도, 바로 "전에 전화번호로 쓰셨나요?"(AttachPhoneSheet)가 기존 계정에 이어 준다.
 * 뒤로: 기기의 '뒤로'는 보던 화면이 아니라 이 팝업을 닫는다(hooks/useBackToClose).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import SocialLogin, { AppleLogo, socialLoginAvailable } from "@/components/hiq/SocialLogin";
import { useSport } from "@/contexts/SportContext";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useT } from "@/lib/i18n";
import { X } from "@/lib/icons";
import { kakaoLoginAvailable, kakaoLoginOpen, kakaoNativeAvailable } from "@/lib/kakaoLogin";
import { isNativeApp } from "@/lib/nativeBridge";
import { rebindAuthWatchers } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { safeReturnPath } from "@shared/promoFunnel";

export interface LoginSheetOptions {
    /** 로그인 뒤 갈 곳. 없거나 지금 주소와 같으면 그 자리에 그대로 둔다 */
    from?: string;
    /** 제목 — 부르는 쪽이 이미 번역한 문장. 없으면 "랭큐 시작하기" */
    title?: string;
    /** 한 줄 설명 — 없으면 기본 문구 */
    desc?: string;
}

/* ── 작은 저장소 — 훅이 아닌 곳(goLogin)에서도 열 수 있게 모듈에 둔다(AppDialog 와 같은 방식) ── */
interface SheetState { open: boolean; opts: LoginSheetOptions }
let state: SheetState = { open: false, opts: {} };
const listeners = new Set<() => void>();
let hostMounted = 0;
const getState = () => state;
function setState(next: SheetState) {
    state = next;
    listeners.forEach((l) => l());
}

/** 열림·닫힘이 바뀔 때마다 부른다. 돌려주는 함수로 끊는다. */
export function subscribeLoginSheet(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** 가입·로그인 팝업이 지금 열려 있는가 — 다른 팝업(설치 권유 등)이 그 위에 겹치지 않게 물어본다. */
export function isLoginSheetOpen(): boolean {
    return state.open;
}

/** isLoginSheetOpen 의 훅 꼴 — 열리고 닫힐 때 다시 그린다. */
export function useLoginSheetOpen(): boolean {
    return useSyncExternalStore(subscribeLoginSheet, isLoginSheetOpen, isLoginSheetOpen);
}

/**
 * 그 화면이 곧 로그인인 주소: '/' · '/hiq'(로그인 화면) · '/register'(가입) · '/auth/…'(카카오에서 돌아오는 화면). 앱(Capacitor)도 같은 주소를 쓴다.
 * 여기서는 팝업을 열지 않는다 — 구글 단추(GIS)는 전역 하나라, 로그인 화면의 단추와 팝업의 단추가 같이 뜨면 한쪽 콜백이 죽는다.
 */
const LOGIN_SCREEN = /^\/(?:$|hiq$|register$|auth\/)/;

/** 로그인 화면 주소 — 끝나면 back 으로 돌아온다(landing 이 ?redirect= 를 safeReturnPath 로 거른다). phone: 전화번호 카드부터 연다 */
export function loginPagePath(back: string, phone = false): string {
    // login=1 은 '로그인하러 온 사람'이라는 신호다 — 이게 없는 맨 '/' 는 비로그인을 예시 홈으로 보낸다(landing.tsx)
    return `/?login=1${phone ? "&phone=1" : ""}&redirect=${encodeURIComponent(back)}`;
}

/**
 * 팝업을 연다. 열었으면 true.
 * false 인 경우 — 호스트가 아직 붙지 않았다(아주 이른 시점) · 지금 화면이 로그인 화면이다. 부른 쪽이 예전처럼 로그인 화면으로 보낸다.
 */
export function openLoginSheet(opts: LoginSheetOptions = {}): boolean {
    if (!hostMounted || typeof window === "undefined") return false;
    if (LOGIN_SCREEN.test(window.location.pathname)) return false;
    setState({ open: true, opts });
    return true;
}

/** 닫는다. 문구(opts)는 남긴다 — 같이 비우면 내려가는 시트의 글자가 바뀐다. */
export function closeLoginSheet(): void {
    if (state.open) setState({ open: false, opts: state.opts });
}

type SheetTone = "light" | "dark";

// 클래스는 통째로 적는다 — Tailwind 는 조각을 이어 붙인 이름을 못 찾는다.
const TONE: Record<SheetTone, {
    panel: string; grip: string; close: string; icon: string; title: string; desc: string;
    rule: string; or: string; link: string; phone: string; legal: string; legalLink: string;
}> = {
    light: {
        panel: "bg-surface-1 border-surface-line text-ink-1",
        grip: "bg-surface-line-strong",
        close: "text-ink-3 active:bg-surface-3",
        icon: "border-surface-line",
        title: "text-ink-1",
        desc: "text-ink-2",
        rule: "bg-surface-line",
        or: "text-ink-3",
        link: "text-ink-2 active:text-ink-1",
        phone: "bg-brand text-brand-fg",
        legal: "text-ink-3",
        legalLink: "text-ink-2",
    },
    dark: {
        panel: "bg-[#141414] border-[#FFFFFF1F] text-[#FFFFFF]",
        grip: "bg-[#FFFFFF38]",
        close: "text-[#FFFFFF99] active:bg-[#FFFFFF14]",
        icon: "border-[#FFFFFF1F]",
        title: "text-[#FFFFFF]",
        desc: "text-[#FFFFFFB3]",
        rule: "bg-[#FFFFFF1F]",
        or: "text-[#FFFFFF99]",
        link: "text-[#FFFFFFCC] active:text-[#FFFFFF]",
        phone: "bg-[#64DD17] text-[#0A0A0A]",
        legal: "text-[#FFFFFF99]",
        legalLink: "text-[#FFFFFFCC]",
    },
};

/** 이만큼 끌어내리고 놓으면 닫는다(px) */
const DRAG_CLOSE_PX = 96;
/** 빠르게 튕겨 내린 것으로 치는 최소 거리(px)와 속도(px/ms) */
const DRAG_FLICK_PX = 24;
const DRAG_FLICK_SPEED = 0.6;

/** 시트 안쪽 — 열릴 때마다 새로 붙는다(끌어내린 거리 같은 상태가 다음 열림에 남지 않는다). */
function LoginSheetPanel({ tone: liveTone, opts, back, go }: {
    tone: SheetTone; opts: LoginSheetOptions; back: string; go: (to: string) => void;
}) {
    const { t, locale } = useT();
    // 열릴 때의 색을 들고 내려간다(2026-10-06 검토) — '전화번호로 계속하기'·약관 링크·'뒤로'로 밝은 화면(/ · /terms · /privacy)에 옮겨 가며
    // 닫힐 때 종목이 당구로 바뀌어도, 내려가는 0.3초 동안 어두운 시트가 밝은 색으로 뒤집히지 않는다. 패널은 열릴 때마다 새로 붙는다.
    const [tone] = useState(liveTone);
    const c = TONE[tone];

    // 아래로 끌어 닫기 — 손잡이와 머리(아이콘·제목 줄)를 잡고 내린다. 충분히 내렸거나 빠르게 내렸으면 닫고, 아니면 제자리로 돌아온다.
    const [dragY, setDragY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const grip = useRef<{ id: number; y0: number; t0: number } | null>(null);
    const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        grip.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 못 잡아도 손가락이 머리 위에 있는 동안은 끌린다 */ }
        setDragging(true);
    };
    const onGripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const g = grip.current;
        if (!g || g.id !== e.pointerId) return;
        setDragY(Math.max(0, e.clientY - g.y0));
    };
    const endGrip = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
        const g = grip.current;
        if (!g || g.id !== e.pointerId) return;
        grip.current = null;
        setDragging(false);
        const dy = Math.max(0, e.clientY - g.y0);
        const flick = dy > DRAG_FLICK_PX && dy / Math.max(1, e.timeStamp - g.t0) > DRAG_FLICK_SPEED;
        // 닫을 때는 끌린 자리를 그대로 둔다 — 닫히는 움직임이 그 자리에서 이어진다
        if (!cancelled && (dy > DRAG_CLOSE_PX || flick)) closeLoginSheet();
        else setDragY(0);
    };

    // 로그인이 끝났다('나'를 새로 받은 뒤 SocialLogin 이 부른다) — 떠 있는 화면들이 새 '나'를 읽게 하고(lib/queryClient rebindAuthWatchers:
    // 화면을 옮기지 않는 로그인이라 그대로 두면 머리의 '로그인' 단추·예시 숫자가 남는다) 닫는다.
    // 가려던 곳이 따로 있으면 SocialLogin 이 이어서 옮긴다(redirect).
    const done = useCallback(() => {
        rebindAuthWatchers();
        closeLoginSheet();
    }, []);

    // 매장 표시(?store=)를 달고 보던 화면에서는 카카오를 두지 않는다 — 로그인 화면(landing)과 같은 규칙:
    // 카카오 로그인은 매장과 무관한 글로벌 회원을 만들고, 다녀오는 길에 매장 표시가 사라진다.
    const storeEntry = (() => { try { return !!new URLSearchParams(window.location.search).get("store"); } catch { return false; } })();
    // 이 기기에서 쓸 소셜 로그인이 하나도 없으면(키 미배포 등) 단추 묶음·'또는' 줄 없이 전화번호 단추 하나만 둔다
    const social = socialLoginAvailable(storeEntry ? undefined : locale);
    // 카카오 단추가 이 팝업에 실제로 그려지는가 — SocialLogin 의 판정과 같은 식이다(kakao={!storeEntry} · 한국어 · 쓸 수 있음).
    // 스위치가 꺼져 있으면 늘 false 라, 닫혀 있는 동안 '카카오'라는 말이 어디에도 나오지 않는다.
    const kakaoShown = !storeEntry && locale === "ko" && kakaoLoginAvailable();
    // 무엇을 먼저 보일까 — 로그인 화면(landing 의 showPhone)과 같은 규칙(2026-10-06 검토): 한국어는 카카오가 되는 곳만 소셜이 먼저,
    // 아니면(스위치 꺼짐 · 카카오 플러그인이 없는 앱 · 매장 진입) 전화번호가 먼저다. 다른 언어는 소셜이 먼저(소셜이 없으면 아래에서 전화번호 단추 하나만).
    const phoneFirst = locale === "ko" ? !kakaoShown : !social;
    // 스토어 앱 안의 한국어 화면인데 **이 바이너리에 카카오 단추가 없다**(플러그인이 없는 1.2 이하) — 웹에서 카카오로 가입한 사람이 여기서
    // 다른 방법으로 들어오면 새 계정이 생긴다. 로그인 화면과 같은 조건으로 누르기 전에 알린다(2026-10-05 검토의 안내가 팝업에는 빠져 있었다).
    // 새 바이너리(1.3~)는 위 단추 묶음에 카카오가 있어 이 안내를 띄우지 않는다(2026-10-06 — kakaoNativeAvailable).
    const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();
    const toPhone = () => go(loginPagePath(back, true));
    // "계속하면 {terms}과 {privacy}에 동의하게 됩니다" — 두 낱말 자리를 링크로 바꿔 끼운다(언어마다 어순이 달라 문장을 통째로 사전에 둔다)
    const legal = t("loginSheet.legal").split(/(\{terms\}|\{privacy\})/);
    const legalLink = (to: string, label: string) => (
        <a
            key={to}
            href={to}
            // 같은 창에서 연다(앱 안에서도 화면 안에 남는다) — 화면이 바뀌면 팝업은 닫히고, '뒤로'를 누르면 보던 화면으로 돌아온다
            onClick={(e) => { e.preventDefault(); go(to); }}
            className={cn("underline underline-offset-2", c.legalLink)}
        >
            {label}
        </a>
    );
    const orRule = (
        <div className="my-4 flex items-center gap-3">
            <span className={cn("h-px flex-1", c.rule)} />
            <span className={cn("text-[12px] font-medium", c.or)}>{t("login.or")}</span>
            <span className={cn("h-px flex-1", c.rule)} />
        </div>
    );
    // 보조 줄(한국어 · 카카오가 되는 곳) — 큰 단추(카카오·구글) 아래 '또는' 밑에 전화번호와 애플(웹)을 작은 링크로 나란히 둔다.
    // 애플은 SocialLogin 이 넘겨준다(웹에서만 · 애플 키가 있을 때). iOS 앱에서는 null 이다 — 애플 단추가 위 큰 묶음에 있다.
    const secondaryRow = (apple: { onClick: () => void; disabled: boolean } | null) => (
        <div>
            {orRule}
            <p className={cn("mb-1 text-center text-[12px] font-medium leading-relaxed break-keep", c.legal)}>{t("login.phoneExistingHint")}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-2">
                <button
                    type="button"
                    onClick={toPhone}
                    className={cn("h-11 px-2 text-[14px] font-semibold underline underline-offset-4 transition-colors", c.link)}
                >
                    {t("loginSheet.phone")}
                </button>
                {apple && (
                    <>
                        <span aria-hidden className={cn("text-[12px]", c.or)}>·</span>
                        <button
                            type="button"
                            onClick={apple.onClick}
                            disabled={apple.disabled}
                            className={cn("flex h-11 items-center gap-1.5 px-2 text-[14px] font-semibold underline underline-offset-4 transition-colors disabled:opacity-50", c.link)}
                        >
                            <AppleLogo />
                            <span>{t("login.continueApple")}</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
    // 단추 묶음은 한 번만 만든다 — 순서가 어느 쪽이든 한 팝업에 하나만 붙는다(구글 단추 GIS 는 전역 하나다)
    const socialButtons = <SocialLogin hint={false} kakao={!storeEntry} tone={tone} redirect={back} onDone={done} secondaryRow={kakaoShown ? secondaryRow : undefined} />;
    // 전화번호 큰 단추 — 전화번호가 먼저일 때 · 쓸 소셜 로그인이 하나도 없을 때
    const phoneButton = (
        <button
            type="button"
            onClick={toPhone}
            className={cn("h-12 w-full rounded-[12px] text-[15px] font-bold transition-transform active:scale-[0.98]", c.phone)}
        >
            {t("loginSheet.phone")}
        </button>
    );

    return (
        <div
            className={cn("relative max-h-[92dvh] overflow-y-auto rounded-t-[24px] border border-b-0 shadow-[0_-12px_48px_rgba(0,0,0,0.22)]", c.panel)}
            style={{
                transform: dragY ? `translateY(${dragY}px)` : undefined,
                transition: dragging ? "none" : "transform 180ms ease-out",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)",
            }}
        >
            <button
                type="button"
                onClick={closeLoginSheet}
                aria-label={t("loginSheet.close")}
                className={cn("absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors", c.close)}
            >
                <X className="h-[18px] w-[18px]" />
            </button>

            {/* 손잡이 + 머리 — 여기를 잡고 내리면 닫힌다. touch-none: 끄는 동안 브라우저가 화면을 굴리지 않게 */}
            <div
                onPointerDown={onGripDown}
                onPointerMove={onGripMove}
                onPointerUp={(e) => endGrip(e, false)}
                onPointerCancel={(e) => endGrip(e, true)}
                className="touch-none select-none px-6 pb-1 pt-2.5"
            >
                <div className="flex justify-center pb-4">
                    <span aria-hidden className={cn("h-1 w-10 rounded-full", c.grip)} />
                </div>
                <div className="flex items-center gap-3 pr-9">
                    <img
                        src="/icon-192.png"
                        alt=""
                        width={44}
                        height={44}
                        draggable={false}
                        className={cn("h-11 w-11 shrink-0 rounded-[12px] border", c.icon)}
                    />
                    <div className="min-w-0 text-left">
                        <SheetTitle className={cn("text-[18px] font-bold leading-snug break-keep", c.title)}>{opts.title ?? t("loginSheet.title")}</SheetTitle>
                        {/* 설명은 꼭 SheetDescription 으로 — 없으면 Radix Dialog 가 콘솔에 경고를 낸다 */}
                        <SheetDescription className={cn("mt-0.5 text-[13.5px] leading-relaxed break-keep", c.desc)}>{opts.desc ?? t("loginSheet.desc")}</SheetDescription>
                    </div>
                </div>
            </div>

            <div className="px-6 pt-4">
                {!social ? (
                    phoneButton
                ) : phoneFirst ? (
                    <>
                        {/* 한국어 · 카카오가 안 되는 곳 — 전화번호가 먼저(로그인 화면과 같은 순서). 소셜 묶음은 같은 무게(48px)로 바로 아래 */}
                        {phoneButton}
                        {orRule}
                        {socialButtons}
                    </>
                ) : kakaoShown ? (
                    // 한국어 · 카카오가 되는 곳 — 큰 단추는 카카오·구글(iOS 앱은 애플도 · 4.8). '또는'·안내·전화번호·애플(웹)은 보조 줄이 그린다(secondaryRow)
                    socialButtons
                ) : (
                    <>
                        {/* 다른 언어 — 구글 · 애플이 같은 폭·같은 높이(48px)·같은 모서리. 모양은 SocialLogin 이 tone 으로 맞춘다 */}
                        {socialButtons}
                        {orRule}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={toPhone}
                                className={cn("h-11 px-3 text-[14px] font-semibold underline underline-offset-4 transition-colors", c.link)}
                            >
                                {t("loginSheet.phone")}
                            </button>
                        </div>
                    </>
                )}
                {kakaoWebOnlyHint && (
                    <p className={cn("mt-3 text-center text-[12px] font-medium leading-relaxed break-keep", c.legal)}>{t("login.kakaoWebOnly")}</p>
                )}
                {/* 전화번호가 먼저일 때는 바로 위가 큰 단추(소셜 묶음)라 한 칸 더 띈다 */}
                <p className={cn("text-center text-[12px] font-medium leading-relaxed break-keep", social && phoneFirst ? "mt-4" : "mt-2", c.legal)}>
                    {legal.map((part, i) =>
                        part === "{terms}" ? legalLink("/terms", t("loginSheet.terms"))
                            : part === "{privacy}" ? legalLink("/privacy", t("loginSheet.privacy"))
                                : <span key={`text-${i}`}>{part}</span>,
                    )}
                </p>
            </div>
        </div>
    );
}

/** 전역 가입·로그인 팝업 — App 에 한 번(TermsConsentProvider 안쪽). */
export function LoginSheetHost() {
    const s = useSyncExternalStore(subscribeLoginSheet, getState, getState);
    const [location, setLocation] = useLocation();
    // 질의(?…)만 바뀌어도 다시 그린다 — 아래 '지금 주소'가 낡지 않게
    useSearch();
    const { currentSport } = useSport();
    const tone: SheetTone = currentSport === "GOLF" ? "dark" : "light";

    useEffect(() => {
        hostMounted++;
        return () => {
            hostMounted--;
            if (!hostMounted) closeLoginSheet();
        };
    }, []);

    // 기기의 '뒤로'는 보던 화면이 아니라 이 팝업을 닫는다(2026-10-06 검토) — 앱은 뒤로가기 핸들러, 웹은 CloseWatcher
    useBackToClose(s.open, closeLoginSheet);

    // 화면(경로)이 바뀌면 닫는다 — 뒤로 가기 · 로그인 뒤 이동 · '전화번호로 계속하기'. 로그인 화면으로 옮겨 갔을 때도 여기서 닫힌다
    useEffect(() => { closeLoginSheet(); }, [location]);

    const go = useCallback((to: string) => {
        closeLoginSheet();
        setLocation(to);
    }, [setLocation]);

    // 로그인 뒤 갈 곳: 부른 쪽이 준 주소(우리 사이트 안의 경로만 — safeReturnPath), 없으면 지금 주소(= 그 자리에 그대로).
    // 전화번호·카카오는 화면이 통째로 넘어가므로 '그대로 있기'도 지금 주소를 실어 보내야 돌아온다.
    const here = window.location.pathname + window.location.search;
    const back = safeReturnPath(s.opts.from) ?? here;

    return (
        <Sheet open={s.open} onOpenChange={(open) => { if (!open) closeLoginSheet(); }}>
            {/* 바깥 틀은 자리만 잡는다(투명) — 넓은 화면에서는 앱 폭(448px)으로 가운데. 보이는 판·끌어내리는 움직임은 안쪽이 맡는다 */}
            <SheetContent side="bottom" hideClose className="mx-auto max-w-[448px] border-0 bg-transparent p-0 shadow-none outline-none">
                <LoginSheetPanel tone={tone} opts={s.opts} back={back} go={go} />
            </SheetContent>
        </Sheet>
    );
}
