/**
 * 앱 설치 팝업 — 웹으로 들어온 사람에게, 그 기기에 맞는 길 하나를 아래에서 올라오는 카드로 권한다.
 * 2026-10-06 오너: "지금 웹 가입 사람이 많은데 웹으로 진입 시 기기에 따른 앱 설치 팝업창 잘 디자인해서 만들어줘. 지금 팝업보다 잘." · "앱에서 열기도."
 *
 * 예전의 떠 있는 띠(HiqInstallBanner)와 다른 점
 *   · 들어오자마자 뜨지 않는다 — 화면을 2번 이상 보았거나 20초 넘게 머문 뒤, 한 방문에 한 번.
 *   · 닫으면 기억한다 — 7일(세 번 닫으면 30일), 스토어 단추를 눌렀으면 14일 쉰다.
 *   · 경기 중 · 게임 · 로그인/가입 화면, 다른 창이 떠 있을 때, 글자를 넣는 중에는 뜨지 않는다. 가입 팝업(LoginSheet)과도 겹치지 않는다.
 *     PC 에서는 옆 패널(DesktopFrame)의 QR · 스토어 단추가 보이는 동안 스스로 뜨지 않는다 — 한 화면에 설치 권유 둘은 소음이다.
 *   · 기기의 '뒤로'는 보던 화면이 아니라 이 팝업을 닫는다(hooks/useBackToClose). 닫은 것으로 센다.
 *   · 기기마다 다르다 — 아이폰은 App Store, 안드로이드는 Google Play, PC 는 QR(깔 수 없는 스토어로 보내지 않는다).
 *   · 로그인한 사람(휴대폰)에게는 "이미 깔았어요 · 앱에서 열기" — 웹의 로그인을 앱으로 넘겨준다(shared/loginHandoff).
 *   · 방금 로그인한 사람에게는 1분 쉰다(약관 동의 · 주 종목 묻기가 이어 뜨는 때다). 뜬 직후 0.6초는 누름을 받지 않는다
 *     (스스로 올라오는 팝업에 다른 것을 누르려던 손가락이 닿아 '닫음'으로 세어지지 않게).
 * 언제 · 어디서 · 누구에게는 전부 shared/installPrompt 의 순수 함수가 정한다(shouldPrompt · isPromptBlockedPath · installSheetPlan).
 * 이 파일은 세고(본 화면 · 머문 시간), 그리고, 누른 것을 적는다. 시험은 shared/installPrompt.test.ts(소스를 읽어 검사한다).
 *
 * 좋은 점 줄은 **코드에서 확인된 것만** 적는다:
 *   · 푸시는 앱에서만 — 웹 푸시는 걷어냈다(main.tsx, 2026-09-11).
 *   · 홈 화면 아이콘 — 깔린 앱이면 당연한 것.
 *   · 화면 켜 두기는 **적지 않는다**(2026-10-06 검토) — 웹도 브라우저의 Screen Wake Lock 으로 된다(hooks/useKeepAwake 의 웹 갈래).
 *     "앱에서만 되는 것"이 아니다.
 *
 * 색: 지금 종목이 골프(어두운 화면)면 어두운 시트 — **리터럴 색만**(골프 테마가 흰 바탕 · 검정 글자 유틸을 다른 색으로 바꿔 끼운다, index.css).
 *     아니면 밝은 시트 — 디자인 토큰. LoginSheet 와 같은 규칙.
 *
 * 사람이 눌러서 여는 길: 주소에 ?install=1 을 달면 기다림 · 쉬는 기간 없이 바로 뜬다(PC 의 QR 이 이 주소를 쓴다 — shared/installPrompt INSTALL_QR_PATH).
 */
import {
    useCallback, useEffect, useMemo, useRef, useState,
    type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { useSearch } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { isLoginSheetOpen, useLoginSheetOpen } from "@/components/hiq/LoginSheet";
import { useSport } from "@/contexts/SportContext";
import { useAuth } from "@/hooks/useAuth";
import { joinStoreSlug } from "@/lib/joinStore";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useT } from "@/lib/i18n";
import { LucideBellRing, LucideDownload, LucideExternalLink, LucideLoader2, LucideSmartphone, X } from "@/lib/icons";
import { isNativeApp } from "@/lib/nativeBridge";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { androidStoreUrl, iosStoreUrl, type AppLinkSource } from "@shared/appLinks";
import { isKakaoOnlyAccount } from "@shared/kakaoLogin";
import type { HandoffIssue } from "@shared/loginHandoff";
import {
    EMPTY_RECORD, EMPTY_VISIT, OPEN_CHECK_MS,
    handoffLaunchUrl, installDevice, installQrUrl, installSheetPlan, isInAppBrowser, isLoginScreenPath,
    parsePromptRecord, parseVisit, recordAfterDismiss, recordAfterStoreClick, serializePromptRecord,
    shouldPrompt, takeInstallFlag, visitAfterPath, visitAfterSecond,
    type InstallDevice, type InstallVisit, type PromptRecord, type SheetPlan,
} from "@shared/installPrompt";

// 스토어 콘솔에서 이 팝업의 유입을 가르는 값(ct · referrer). 예전 띠의 "install_banner" 와 섞이지 않게 새 값을 쓴다.
const IOS_STORE = iosStoreUrl("install_sheet");
const ANDROID_STORE = androidStoreUrl("install_sheet");
/** 본문 끝의 설치 카드(AppInstallCard)가 스토어 링크에 다는 값 — 그 카드가 화면에 보이는 동안은 팝업이 기다린다 */
const PAGE_CARD_SOURCE: AppLinkSource = "page_banner";
/** PC 옆 패널(DesktopFrame)의 설치 구역(QR · 스토어 단추)에 달린 표식(data-install-surface) — 스토어 링크의 추적 값과 같은 낱말이다 */
const SIDE_PANEL_SURFACE: AppLinkSource = "desktop_side_panel";
/**
 * 이 팝업의 층(z-70) 아래로 치는 높이. 이보다 높은 층으로 떠 있는 것이 팝업 자리를 덮고 있으면 띄우지 않는다(coveredByOverlay).
 * 공용 시트 · 약관 창 · 하단 탭이 z-50 이다.
 */
const BASE_LAYER_Z = 50;

/* ── 기기에 적어 두는 것 ─────────────────────────────────────────────────
 * 닫은 때 · 닫은 횟수 · 스토어를 누른 때는 localStorage(다음 방문에도 쉰다), 이 방문에서 본 화면 · 머문 시간은 sessionStorage(탭 하나).
 * 저장소를 못 쓰는 환경(시크릿 창 · 일부 인앱 브라우저)에서는 이 화면이 떠 있는 동안만 기억한다 — 적어도 화면을 옮길 때마다 다시 뜨지는 않는다.
 */
const RECORD_KEY = "rankue_install_prompt";
const VISIT_KEY = "rankue_install_visit";
let memoryRecord: PromptRecord | null = null;
let visitCache: InstallVisit | null = null;

function getRecord(): PromptRecord {
    try {
        const raw = localStorage.getItem(RECORD_KEY);
        if (raw) return parsePromptRecord(raw);
    } catch { /* 저장소를 못 쓰는 환경 */ }
    return memoryRecord ?? EMPTY_RECORD;
}

function setRecord(r: PromptRecord): void {
    memoryRecord = r;
    try { localStorage.setItem(RECORD_KEY, serializePromptRecord(r)); } catch { /* 저장소를 못 쓰는 환경 */ }
}

function getVisit(): InstallVisit {
    if (!visitCache) {
        try { visitCache = parseVisit(sessionStorage.getItem(VISIT_KEY)); } catch { visitCache = EMPTY_VISIT; }
    }
    return visitCache;
}

function setVisit(v: InstallVisit, save = true): void {
    visitCache = v;
    if (!save) return;
    try { sessionStorage.setItem(VISIT_KEY, JSON.stringify(v)); } catch { /* 저장소를 못 쓰는 환경 */ }
}

/** 이 브라우저가 무엇인가 — 한 번만 본다. */
function readEnv(): { native: boolean; standalone: boolean; inert: boolean; device: InstallDevice; inApp: boolean } {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || "";
    const native = isNativeApp();
    let standalone = nav.standalone === true;
    try { standalone = standalone || window.matchMedia("(display-mode: standalone)").matches; } catch { /* matchMedia 가 없는 환경 */ }
    return {
        native,
        standalone,
        // ★ 랭큐 앱(Capacitor) 안 · 홈 화면에 추가한 웹앱에서는 아무것도 하지 않는다(세지도 않는다) — 이미 앱을 쓰는 사람에게
        //   "앱을 받으세요"가 뜨는 사고를 막는다. display-mode 만으로는 안 걸러진다(안드로이드 Capacitor 웹뷰가 standalone 으로
        //   보고되지 않는 경우가 있다). shouldPrompt 도 같은 두 값을 한 번 더 본다.
        inert: native || standalone,
        device: installDevice(ua, { maxTouchPoints: nav.maxTouchPoints, standalone: nav.standalone }),
        inApp: isInAppBrowser(ua),
    };
}

/**
 * 화면이 바쁜가 — 이럴 때는 띄우지 않고 다음 초에 다시 본다.
 *   · 다른 창이 떠 있다(약관 동의 · 주 종목 묻기 · 안내창 · 화면의 시트) — '열린 창'을 알려 주는 전역 신호가 없어 화면에서 직접 찾는다.
 *   · 글자를 넣는 중이다 — 팝업이 뜨면 자판이 내려가고 쓰던 글에서 손이 떨어진다.
 *   · 본문 끝의 설치 카드가 보인다 — 한 화면에 설치 권유가 둘이면 소음이다(2026-09-09 오너 결정). 팝업이 뜬 뒤에는 화면이 굴러가지 않아
 *     둘이 같이 보이는 일이 없다. PC 에는 이 카드가 없고 옆 패널이 그 자리다 — 그쪽은 sidePanelInstallVisible 이 따로 본다.
 *   · 팝업이 올라올 자리를 더 높은 층이 덮고 있다(coveredByOverlay) — role 표식이 없는 오버레이도 잡는다.
 */
function screenBusy(): boolean {
    try {
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
        const el = document.activeElement as HTMLElement | null;
        if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return true;
        const card = document.querySelector<HTMLElement>(`a[href*="${PAGE_CARD_SOURCE}"]`);
        if (card) {
            const r = card.getBoundingClientRect();
            if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return true;
        }
        if (coveredByOverlay()) return true;
    } catch { /* 못 찾으면 바쁘지 않은 것으로 본다 */ }
    return false;
}

/**
 * 팝업이 올라올 자리(화면 가운데 아래 · 정중앙)를 더 높은 층이 덮고 있는가(2026-10-06 검토).
 * role 표식만 믿으면 표식 없는 오버레이(알림함 · 스코어카드 스캐너가 그랬다, z-100)에서 팝업이 **그 밑에** 안 보이게 열린다 —
 * 모달이라 화면 전체의 누름을 가져가, 보이지도 않는 팝업의 단추가 눌리고 '닫음'으로 세어졌다. 그래서 자리를 직접 찍어 본다:
 * 맨 위 요소에서 조상으로 올라가며 position: fixed 이고 z-index 가 BASE_LAYER_Z 를 넘는 것이 있으면 덮인 것이다.
 * 하단 탭(z-50)처럼 늘 떠 있는 줄은 문턱에 걸리지 않는다.
 */
function coveredByOverlay(): boolean {
    const spots: Array<[number, number]> = [
        [window.innerWidth / 2, window.innerHeight - 80],
        [window.innerWidth / 2, window.innerHeight / 2],
    ];
    for (const [x, y] of spots) {
        for (let el = document.elementFromPoint(x, y); el && el !== document.documentElement; el = el.parentElement) {
            const style = window.getComputedStyle(el);
            if (style.position !== "fixed") continue;
            const z = Number.parseInt(style.zIndex, 10);
            if (Number.isFinite(z) && z > BASE_LAYER_Z) return true;
        }
    }
    return false;
}

/**
 * PC 옆 패널의 설치 구역(QR · 스토어 단추)이 화면에 보이는가 — 보이는 동안은 QR 팝업을 스스로 띄우지 않는다(2026-09-09 오너:
 * "한 화면에 설치 권유 둘은 소음"). 1280px 미만(패널이 접힌다)·패널 안에서 아래로 굴러 내려간 경우는 '안 보임'이라 팝업이 뜬다.
 * screenBusy 에 넣지 않는다 — 바쁨은 ?install=1(받으러 온 사람)까지 막는데, 옆 패널은 늘 붙어 있어 그 주소가 PC 에서 영영 안 뜨게 된다.
 */
function sidePanelInstallVisible(): boolean {
    try {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-install-surface="${SIDE_PANEL_SURFACE}"]`))) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return true;
        }
    } catch { /* 못 찾으면 안 보이는 것으로 본다 */ }
    return false;
}

type SheetTone = "light" | "dark";

// 클래스는 통째로 적는다 — Tailwind 는 조각을 이어 붙인 이름을 못 찾는다.
const TONE: Record<SheetTone, {
    panel: string; grip: string; close: string; icon: string; title: string; desc: string;
    perks: string; perkRule: string; perkIcon: string; perkText: string;
    primary: string; secondary: string; note: string; hint: string; error: string; stay: string;
    qrTile: string; qrTitle: string; qrDesc: string;
}> = {
    light: {
        panel: "bg-surface-1 border-surface-line text-ink-1",
        grip: "bg-surface-line-strong",
        close: "text-ink-3 active:bg-surface-3",
        icon: "border-surface-line",
        title: "text-ink-1",
        desc: "text-ink-2",
        perks: "bg-surface-3",
        perkRule: "border-surface-line",
        perkIcon: "text-brand",
        perkText: "text-ink-1",
        primary: "bg-brand text-brand-fg",
        secondary: "border-surface-line-strong text-ink-1 active:bg-surface-3",
        note: "text-ink-2",
        hint: "text-ink-1",
        error: "text-destructive",
        stay: "text-ink-3 active:text-ink-1",
        qrTile: "bg-[#FFFFFF] border-surface-line",
        qrTitle: "text-ink-1",
        qrDesc: "text-ink-2",
    },
    dark: {
        panel: "bg-[#141414] border-[#FFFFFF1F] text-[#FFFFFF]",
        grip: "bg-[#FFFFFF38]",
        close: "text-[#FFFFFF99] active:bg-[#FFFFFF14]",
        icon: "border-[#FFFFFF1F]",
        title: "text-[#FFFFFF]",
        desc: "text-[#FFFFFFB3]",
        perks: "bg-[#FFFFFF0F]",
        perkRule: "border-[#FFFFFF14]",
        perkIcon: "text-[#64DD17]",
        perkText: "text-[#FFFFFFE6]",
        primary: "bg-[#64DD17] text-[#0A0A0A]",
        secondary: "border-[#FFFFFF38] text-[#FFFFFF] active:bg-[#FFFFFF14]",
        note: "text-[#FFFFFFB3]",
        hint: "text-[#FFFFFFE6]",
        error: "text-[#FF8A80]",
        stay: "text-[#FFFFFF99] active:text-[#FFFFFF]",
        qrTile: "bg-[#FFFFFF] border-[#FFFFFF1F]",
        qrTitle: "text-[#FFFFFF]",
        qrDesc: "text-[#FFFFFFB3]",
    },
};

/** 큰 단추 — 가입 팝업의 단추와 같은 높이(48px) · 같은 모서리(12px) */
const BTN = "flex h-12 w-full items-center justify-center gap-2 rounded-[12px] px-4 text-[15px] font-bold transition-transform active:scale-[0.98]";

/** 이만큼 끌어내리고 놓으면 닫는다(px) — 가입 팝업과 같은 손맛 */
const DRAG_CLOSE_PX = 96;
/** 빠르게 튕겨 내린 것으로 치는 최소 거리(px)와 속도(px/ms) */
const DRAG_FLICK_PX = 24;
const DRAG_FLICK_SPEED = 0.6;

/**
 * 뜬 직후 이만큼은 누름을 받지 않는다(ms). 스스로 올라오는 팝업이라, 화면의 다른 것을 누르려던 손가락이 그 순간 팝업에 닿는다 —
 * 그 한 번이 '닫음'(7일 쉼)이나 스토어 이동으로 세어지면 안 된다. 올라오는 움직임(0.5초)이 끝날 즈음까지다.
 */
const OPEN_GUARD_MS = 600;

/** '앱에서 열기'의 지금 상태 — idle 평소 · issuing 주소를 받는 중 · waiting 열어 보고 기다리는 중 · stuck 화면이 그대로다 · error 못 받았다 */
type OpenPhase = "idle" | "issuing" | "waiting" | "stuck" | "error";

/** 시트 안쪽 — 열릴 때마다 새로 붙는다(끌어내린 거리 · '앱에서 열기' 상태가 다음 열림에 남지 않는다). */
function InstallPanel({ tone, device, inApp, plan, tooSoon, onDismiss, onStore }: {
    tone: SheetTone; device: InstallDevice; inApp: boolean; plan: SheetPlan;
    /** 방금 떴다 — 이 누름은 팝업을 보고 누른 것이 아니다 */
    tooSoon: () => boolean;
    onDismiss: () => void; onStore: () => void;
}) {
    const { t } = useT();
    const c = TONE[tone];

    // 아래로 끌어 닫기 — 손잡이와 머리(아이콘 · 제목 줄)를 잡고 내린다. 충분히 내렸거나 빠르게 내렸으면 닫고, 아니면 제자리로 돌아온다.
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
        if (!cancelled && (dy > DRAG_CLOSE_PX || flick)) onDismiss();
        else setDragY(0);
    };

    /* ── 앱에서 열기 ─────────────────────────────────────────────────────
     * 주소(한 번만 쓰는 토큰이 실린다 · 120초)는 **눌렀을 때** 받는다. 팝업이 뜰 때 미리 받으면 화면을 몇 번 넘기는 것만으로
     * 발급 한도(회원당 10분 5번)에 걸리고, 누를 때쯤이면 죽은 주소다. 받은 주소는 저장하지 않는다(이 화면의 ref 에만).
     *   누름 → 받는다 → 바로 연다. 브라우저가 '사람이 누른 것'으로 쳐 주지 않아 막으면 화면이 그대로 남는다 —
     *   1.5초 뒤에도 보이고 있으면 단추가 "한 번 더 눌러 주세요"로 바뀌고, 그 탭은 받아 둔 주소를 **기다림 없이** 연다.
     *   앱이 없어서 안 열린 것일 수도 있으니 "앱이 아직 없다면 먼저 받아 주세요"를 같이 보여 준다(스토어 단추는 바로 위아래에 있다).
     */
    const [phase, setPhase] = useState<OpenPhase>("idle");
    const [openError, setOpenError] = useState<string | null>(null);
    const ready = useRef<{ url: string; until: number } | null>(null);
    const launched = useRef(false);
    const checkTimer = useRef<number | undefined>(undefined);
    /** 주소를 받는 중 — 다시 그려지기 전의 연타가 발급을 두 번 부르지 않게(상태가 아니라 ref 로 막는다) */
    const issuing = useRef(false);
    /** 팝업이 아직 떠 있는가 — 받는 사이에 닫았으면 앱을 열지 않는다 */
    const alive = useRef(true);

    const launch = useCallback((url: string) => {
        launched.current = true;
        setOpenError(null);
        setPhase("waiting");
        window.clearTimeout(checkTimer.current);
        try { window.location.href = url; } catch { /* 이 주소를 못 여는 브라우저 — 아래 확인이 '그대로다'로 받는다 */ }
        checkTimer.current = window.setTimeout(() => {
            // 앱이 떴으면 이 탭은 가려져 있다. 아직 보이면 안 열린 것이다
            if (document.visibilityState === "visible") setPhase("stuck");
        }, OPEN_CHECK_MS);
    }, []);

    useEffect(() => {
        const onVisibility = () => {
            if (!launched.current || document.visibilityState !== "hidden") return;
            // 앱(앱이 없는 안드로이드는 Play)이 떴다 — '안 열렸다' 안내를 띄우지 않는다. 팝업은 그대로 둔다:
            // 앱을 깔고 이 탭으로 돌아온 사람이 다시 누를 수 있어야 한다(Play 를 거쳐 처음 연 앱에는 로그인이 넘어가지 않는다).
            window.clearTimeout(checkTimer.current);
            launched.current = false;
            setPhase("idle");
        };
        document.addEventListener("visibilitychange", onVisibility);
        alive.current = true;
        return () => {
            alive.current = false;
            document.removeEventListener("visibilitychange", onVisibility);
            window.clearTimeout(checkTimer.current);
        };
    }, []);

    const openInApp = async () => {
        if (tooSoon() || issuing.current || phase === "waiting") return;
        // 두 번째 탭 — 받아 둔 주소가 살아 있으면 그대로 연다(이 탭 안에서 바로: 브라우저가 막을 이유가 없다)
        const kept = ready.current;
        if (kept && Date.now() < kept.until) { launch(kept.url); return; }
        issuing.current = true;
        setOpenError(null);
        setPhase("issuing");
        try {
            // 본문 {} 를 꼭 싣는다 — 서버는 JSON 본문이 아니면 400 이다(server/routes/modules/handoff.ts)
            const issued = await apiRequest("/api/hiq/handoff", { method: "POST", body: {} }) as HandoffIssue;
            if (!alive.current) return;
            const url = handoffLaunchUrl(device, issued);
            if (!url) throw new Error("handoff url");
            // 만료(120초)보다 조금 일찍 버린다 — 죽은 주소로 앱만 열리는 일이 없게
            ready.current = { url, until: Date.now() + Math.max(0, (Number(issued.expiresInSec) || 0) - 10) * 1000 };
            launch(url);
        } catch (e: any) {
            if (!alive.current) return;
            ready.current = null;
            // 너무 자주 눌렀을 때(429)는 서버가 만든 문구(남은 초)를 그대로 보여 준다
            const fromServer = e?.status === 429 && e?.data?.success === false && typeof e.data.message === "string" ? e.data.message as string : null;
            setOpenError(fromServer ?? t(e?.status === 401 ? "installSheet.openNeedsLogin" : "installSheet.openFailed"));
            setPhase("error");
        } finally {
            issuing.current = false;
        }
    };

    /** 스토어 링크를 눌렀다 — 방금 뜬 팝업에 손가락이 닿은 것이면 가지 않는다 */
    const onStoreClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
        if (tooSoon()) { e.preventDefault(); return; }
        onStore();
    };

    const storeHref = device === "ios" ? IOS_STORE : ANDROID_STORE;
    const storeLabel = t(device === "ios" ? "installSheet.storeIos" : "installSheet.storeAndroid");
    // 인앱 브라우저(카카오톡 · 네이버 · 인스타그램…)는 새 창을 막거나 버린다 — 그 자리에서 연다. OS 가 스토어 주소를 스토어 앱으로 넘긴다
    const storeTarget = inApp ? undefined : "_blank";

    const storeButton = (primary: boolean) => (
        <a
            href={storeHref}
            target={storeTarget}
            rel="noopener noreferrer"
            onClick={onStoreClick}
            className={cn(BTN, primary ? c.primary : cn("border", c.secondary))}
        >
            <LucideDownload weight="bold" className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{storeLabel}</span>
        </a>
    );

    const busy = phase === "issuing" || phase === "waiting";
    const openButton = (primary: boolean) => (
        <button
            type="button"
            onClick={() => { void openInApp(); }}
            aria-busy={busy}
            className={cn(BTN, primary ? c.primary : cn("border", c.secondary), busy && "opacity-70")}
        >
            {busy
                ? <LucideLoader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
                : <LucideExternalLink weight="bold" className="h-[18px] w-[18px] shrink-0" />}
            <span className="truncate">
                {busy ? t("installSheet.opening")
                    : phase === "stuck" ? t("installSheet.openAgain")
                        : t(primary ? "installSheet.openPrimary" : "installSheet.open")}
            </span>
        </button>
    );

    // 안 열렸을 때 · 못 받았을 때의 한 줄 — 단추 바로 아래
    const openHint = phase === "stuck" ? (
        <p role="status" className={cn("px-1 text-center text-[13px] font-semibold leading-relaxed break-keep", c.hint)}>{t("installSheet.openStuck")}</p>
    ) : phase === "error" && openError ? (
        <p role="alert" className={cn("px-1 text-center text-[13px] font-semibold leading-relaxed break-keep", c.error)}>{openError}</p>
    ) : null;

    // 앱에서만 되는 것 두 줄. 화면 켜 두기는 웹도 되므로 적지 않는다(머리말)
    const perks = [
        { key: "installSheet.perkPush", Icon: LucideBellRing },
        { key: "installSheet.perkHome", Icon: LucideSmartphone },
    ];
    const perkList = (
        <ul className={cn("rounded-[14px] px-4", c.perks)}>
            {perks.map(({ key, Icon }, i) => (
                <li key={key} className={cn("flex items-center gap-3 py-3", i > 0 && cn("border-t", c.perkRule))}>
                    <Icon className={cn("h-5 w-5 shrink-0", c.perkIcon)} />
                    <span className={cn("text-[14px] font-medium leading-snug break-keep", c.perkText)}>{t(key)}</span>
                </li>
            ))}
        </ul>
    );

    return (
        <div
            className={cn("relative max-h-[92dvh] overflow-y-auto rounded-t-[24px] border border-b-0 shadow-[0_-12px_48px_rgba(0,0,0,0.22)]", c.panel)}
            style={{
                transform: dragY ? `translateY(${dragY}px)` : undefined,
                transition: dragging ? "none" : "transform 180ms ease-out",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
            }}
        >
            <button
                type="button"
                onClick={onDismiss}
                aria-label={t("installSheet.close")}
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
                <div className="flex items-center gap-3.5 pr-9">
                    <img
                        src="/icon-192.png"
                        alt=""
                        width={56}
                        height={56}
                        draggable={false}
                        className={cn("h-14 w-14 shrink-0 rounded-[14px] border", c.icon)}
                    />
                    <div className="min-w-0 text-left">
                        <SheetTitle className={cn("text-[20px] font-bold leading-snug break-keep", c.title)}>{t("installSheet.title")}</SheetTitle>
                        {/* 설명은 꼭 SheetDescription 으로 — 없으면 Radix Dialog 가 콘솔에 경고를 낸다 */}
                        <SheetDescription className={cn("mt-0.5 text-[13.5px] leading-relaxed break-keep", c.desc)}>
                            {t(plan.qr ? "installSheet.descDesktop" : "installSheet.desc")}
                        </SheetDescription>
                    </div>
                </div>
            </div>

            <div className="px-6 pt-4">
                {plan.qr ? (
                    <>
                        {/* PC — 스토어로 보내도 깔 수 없다. 휴대폰 카메라로 찍으면 그 휴대폰에서 이 팝업이 스토어 단추와 함께 바로 뜬다 */}
                        <div className="flex items-center gap-4">
                            {/* QR 은 어느 시트에서든 흰 바탕에 짙은 무늬 — 뒤집으면 못 읽는 카메라가 있다 */}
                            <span className={cn("shrink-0 rounded-[14px] border p-2.5", c.qrTile)}>
                                <QRCodeSVG value={installQrUrl()} size={112} level="M" bgColor="#FFFFFF" fgColor="#0A0A0A" title={t("installSheet.qrAlt")} />
                            </span>
                            <div className="min-w-0 text-left">
                                <p className={cn("text-[15px] font-bold leading-snug break-keep", c.qrTitle)}>{t("installSheet.qrTitle")}</p>
                                <p className={cn("mt-1 text-[13px] font-medium leading-relaxed break-keep", c.qrDesc)}>{t("installSheet.qrDesc")}</p>
                            </div>
                        </div>
                        <div className="mt-4">{perkList}</div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <a href={IOS_STORE} target="_blank" rel="noopener noreferrer" onClick={onStoreClick} className={cn(BTN, "border px-2 text-[13.5px]", c.secondary)}>
                                <span className="truncate">{t("installSheet.storeIos")}</span>
                            </a>
                            <a href={ANDROID_STORE} target="_blank" rel="noopener noreferrer" onClick={onStoreClick} className={cn(BTN, "border px-2 text-[13.5px]", c.secondary)}>
                                <span className="truncate">{t("installSheet.storeAndroid")}</span>
                            </a>
                        </div>
                    </>
                ) : (
                    <>
                        {perkList}
                        <div className="mt-4 flex flex-col gap-2">
                            {plan.actions[0] === "open" ? (
                                <>
                                    {/* 카카오로만 가입한 회원 — 스토어 앱에는 카카오 단추가 없다. 깔기보다 '앱에서 열기'가 먼저다 */}
                                    {openButton(true)}
                                    {plan.kakaoNote && (
                                        <p className={cn("px-1 text-center text-[13px] font-medium leading-relaxed break-keep", c.note)}>{t("installSheet.kakaoNote")}</p>
                                    )}
                                    {openHint}
                                    {storeButton(false)}
                                </>
                            ) : (
                                <>
                                    {storeButton(true)}
                                    {/* 비로그인에게는 이 단추가 없다 — 넘겨줄 로그인이 없다(installSheetPlan) */}
                                    {plan.actions.includes("open") && openButton(false)}
                                    {openHint}
                                </>
                            )}
                        </div>
                    </>
                )}
                <button
                    type="button"
                    onClick={onDismiss}
                    className={cn("mt-1 h-11 w-full text-[13.5px] font-semibold underline underline-offset-4 transition-colors", c.stay)}
                >
                    {t("installSheet.stay")}
                </button>
            </div>
        </div>
    );
}

/**
 * 앱 설치 팝업 — App 에 한 번(SportProvider 안쪽). path 는 지금 경로(App.tsx 의 InstallBannerGate 가 건넨다).
 * 어느 주소에서 막는지는 여기가 아니라 shared/installPrompt 가 안다.
 */
export function AppInstallSheet({ path }: { path: string }) {
    const { member, isLoading, isLoggedIn } = useAuth();
    // 들어올 길이 카카오뿐인 회원(2026-10-05 까지는 설치를 권하지 않았다) — 이제 휴대폰에서는 '앱에서 열기'를 첫째 단추로 준다.
    // PC 에서는 여전히 띄우지 않는다(installSheetPlan).
    const kakaoOnly = isKakaoOnlyAccount(member?.connections);
    const { currentSport } = useSport();
    const golf = currentSport === "GOLF";
    const tone: SheetTone = golf ? "dark" : "light";
    const loginOpen = useLoginSheetOpen();
    // 질의(?…)만 바뀌어도 다시 본다 — ?install=1 을 달고 같은 화면으로 온 경우
    const search = useSearch();

    const env = useMemo(readEnv, []);
    const plan = useMemo(
        () => installSheetPlan({ device: env.device, loggedIn: isLoggedIn, kakaoOnly }),
        [env.device, isLoggedIn, kakaoOnly],
    );

    const [open, setOpen] = useState(false);
    const openRef = useRef(false);
    /** 뜬 때 — 직후의 누름을 거른다(OPEN_GUARD_MS) */
    const openedAt = useRef(0);
    const tooSoon = useCallback(() => Date.now() - openedAt.current < OPEN_GUARD_MS, []);
    /** 이때부터 잠깐은 띄우지 않는다 — 가입 팝업이 닫힌 때 · 방금 로그인한 때(QUIET_AFTER_LOGIN_SECONDS) */
    const quietSince = useRef<number | null>(null);
    const wasLoginOpen = useRef(false);
    const wasGuest = useRef(false);
    /** 로그인 · 가입 화면에서 막 넘어온 때 — 그 사람이 회원이면 방금 로그인한 것이다(카카오처럼 화면이 통째로 다녀오는 로그인은 이것으로만 안다) */
    const fromLoginScreenAt = useRef<number | null>(null);
    const prevPath = useRef<string | null>(null);
    /** 지금 화면에 머문 시간(초) */
    const pageSeconds = useRef(0);
    /** ?install=1 로 들어왔다 — 띄울 수 있게 되는 대로 바로 띄운다 */
    const forced = useRef(false);
    // 1초마다 도는 확인이 늘 지금 값을 읽게 한다
    const live = useRef({ path, authLoading: isLoading, loggedIn: isLoggedIn, show: plan.show });
    live.current = { path, authLoading: isLoading, loggedIn: isLoggedIn, show: plan.show };

    const tryOpen = useCallback(() => {
        if (env.inert || openRef.current || !live.current.show) return;
        const visit = getVisit();
        const quiet = Math.max(quietSince.current ?? 0, live.current.loggedIn ? fromLoginScreenAt.current ?? 0 : 0);
        const ok = shouldPrompt({
            path: live.current.path,
            isNative: env.native,
            standalone: env.standalone,
            // 가입 · 로그인 팝업이 열려 있으면 뜨지 않는다. 닫힌 직후 · 방금 로그인한 직후에도 잠깐 쉰다
            loginSheetOpen: isLoginSheetOpen(),
            quietSince: quiet || null,
            // 로그인 확인이 끝나야 단추 구성('앱에서 열기'가 있는가)이 정해진다 — 그 전에 띄우면 뜬 뒤에 모양이 바뀐다
            // 매장 QR 로 온 비로그인(가입 매장 표시가 남아 있다 — lib/joinStore)에게는 가입이 끝날 때까지 띄우지 않는다(2026-10-07):
            // 표시는 이 브라우저의 저장소에 있어, 여기서 앱부터 깔고 앱에서 가입하면 '어느 매장에서 왔는지'가 사라진다.
            // 가입이 끝나면 표시가 지워지고, 그때부터는 로그인한 사람용 팝업('앱에서 열기' — 로그인을 그대로 넘겨준다)이 뜬다.
            busy: live.current.authLoading || screenBusy() || (!live.current.loggedIn && !!joinStoreSlug()),
            // PC(QR 판)만: 옆 패널의 설치 구역이 보이면 스스로 띄우지 않는다. 가로로 든 아이패드(스토어 단추 판)는 해당 없다
            otherInstallVisible: env.device === "desktop" && sidePanelInstallVisible(),
            ...getRecord(),
            now: Date.now(),
            secondsOnSite: visit.seconds,
            pagesSeen: visit.pages,
            secondsOnPage: pageSeconds.current,
            shownThisVisit: visit.shown,
            forced: forced.current,
        });
        if (!ok) return;
        forced.current = false;
        setVisit({ ...visit, shown: true });
        openRef.current = true;
        openedAt.current = Date.now();
        setOpen(true);
    }, [env]);

    /** 닫았다 — 바깥 탭 · X · 끌어내림 · '웹으로 계속 볼게요' · 화면을 떠남. 쉬는 기간이 시작된다 */
    const dismiss = useCallback(() => {
        if (!openRef.current) return;
        openRef.current = false;
        setRecord(recordAfterDismiss(getRecord(), Date.now()));
        setOpen(false);
    }, []);
    /** 사람이 닫았다 — 방금 뜬 팝업에 손가락이 닿은 것이면 닫지 않는다(화면을 떠나서 닫히는 쪽은 dismiss 를 바로 부른다) */
    const userDismiss = useCallback(() => {
        if (!tooSoon()) dismiss();
    }, [tooSoon, dismiss]);
    // 기기의 '뒤로'는 보던 화면이 아니라 이 팝업을 닫는다(2026-10-06 검토) — 스스로 올라온 팝업 때문에 '뒤로' 한 번에 보던 화면에서
    // 쫓겨나지 않게. 닫은 것으로 센다(본 것이다). 앱 안에서는 이 팝업이 그려지지 않는다.
    useBackToClose(open, dismiss);

    /** 스토어 단추를 눌렀다. 닫은 횟수에는 넣지 않는다 */
    const keepAfterStore = plan.actions.includes("open");
    const storeClicked = useCallback(() => {
        setRecord(recordAfterStoreClick(getRecord(), Date.now()));
        // 회원은 닫지 않는다 — 앱을 깔고 이 탭으로 돌아오면 '앱에서 열기'가 그대로 있어야 한다. 비로그인 · PC 는 더 할 일이 없어 닫는다
        if (keepAfterStore) return;
        openRef.current = false;
        setOpen(false);
    }, [keepAfterStore]);

    // 이 방문에서 본 화면을 센다. 떠 있는 채로 화면이 바뀌면(뒤로 가기 등) 닫는다 — 본 것이니 닫은 것으로 센다
    useEffect(() => {
        if (env.inert) return;
        setVisit(visitAfterPath(getVisit(), path));
        pageSeconds.current = 0;
        dismiss();
        const prev = prevPath.current;
        prevPath.current = path;
        if (prev !== null && prev !== path && isLoginScreenPath(prev)) fromLoginScreenAt.current = Date.now();
    }, [path, env, dismiss]);

    // 1초마다: 머문 시간을 세고(탭이 보일 때만), 띄울 때가 됐는지 본다
    useEffect(() => {
        if (env.inert) return;
        const id = window.setInterval(() => {
            const visible = document.visibilityState === "visible";
            const before = getVisit();
            const next = visitAfterSecond(before, live.current.path, visible);
            // 저장은 5초에 한 번이면 된다(새로고침해도 그만큼만 잃는다)
            if (next !== before) setVisit(next, next.seconds % 5 === 0);
            if (!visible) return;
            pageSeconds.current += 1;
            tryOpen();
        }, 1000);
        return () => window.clearInterval(id);
    }, [env, tryOpen]);

    // 가입 팝업이 올라오면 물러난다(사람이 닫은 게 아니라 세지 않는다). 닫힌 때를 적어 둔다
    useEffect(() => {
        if (loginOpen && openRef.current) {
            openRef.current = false;
            setOpen(false);
        }
        if (wasLoginOpen.current && !loginOpen) quietSince.current = Date.now();
        wasLoginOpen.current = loginOpen;
    }, [loginOpen]);

    // 방금 로그인했다(가입 팝업 · 로그인 화면 어느 쪽이든) — 약관 동의 · 주 종목 묻기가 이어 뜨는 때라 잠깐 쉰다
    useEffect(() => {
        if (isLoading) return;
        if (wasGuest.current && isLoggedIn) quietSince.current = Date.now();
        wasGuest.current = !isLoggedIn;
    }, [isLoading, isLoggedIn]);

    // 브라우저가 스스로 띄우는 '홈 화면에 추가'(PWA) 띠를 막는다 — 예전 띠가 이 이벤트를 붙잡으면서 같이 하던 일이다.
    // 스토어 앱 권유와 나란히 뜨면 무엇을 깔라는 건지 흐려진다. 브라우저 메뉴의 '홈 화면에 추가'는 그대로 된다.
    useEffect(() => {
        if (env.inert) return;
        const hold = (e: Event) => e.preventDefault();
        window.addEventListener("beforeinstallprompt", hold);
        return () => window.removeEventListener("beforeinstallprompt", hold);
    }, [env]);

    // ?install=1 — 주소에서 지우고(새로고침 · 공유로 또 뜨지 않게) 바로 띄운다. 앱 안에서도 지우기는 한다
    useEffect(() => {
        const taken = takeInstallFlag(window.location.href);
        if (!taken.present) return;
        try {
            window.history.replaceState(window.history.state, "", taken.cleaned);
        } catch { /* 주소를 못 바꾸는 환경 */ }
        if (!taken.forced) return;
        forced.current = true;
        tryOpen();
    }, [search, tryOpen]);

    if (env.inert) return null;

    return (
        <Sheet open={open} onOpenChange={(next) => { if (!next) userDismiss(); }}>
            {/* 바깥 틀은 자리만 잡는다(투명) — 넓은 화면에서는 앱 폭(448px)으로 가운데. 보이는 판 · 끌어내리는 움직임은 안쪽이 맡는다.
                층은 z-70(어두운 막도 같이): 화면에 떠 있는 단추(골프 조인 목록의 '조인 만들기' FAB, z-60)가 막과 팝업 위로 올라와
                팝업 단추를 가리지 않게(2026-10-06 검토). 막만 두고 내용만 올리면 FAB 가 막 위에 뜬다 — 둘을 같이 올린다 */}
            <SheetContent side="bottom" hideClose overlayClassName="z-[70]" className="z-[70] mx-auto max-w-[448px] border-0 bg-transparent p-0 shadow-none outline-none">
                <InstallPanel
                    tone={tone}
                    device={env.device}
                    inApp={env.inApp}
                    plan={plan}
                    tooSoon={tooSoon}
                    onDismiss={userDismiss}
                    onStore={storeClicked}
                />
            </SheetContent>
        </Sheet>
    );
}

export default AppInstallSheet;
