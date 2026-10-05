import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { isNativeApp, nativePlatform, openStorePage } from "@/lib/nativeBridge";
import { nativeSocialAvailable, nativeSocialIdToken } from "@/lib/nativeSignIn";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { queryClient, refreshAfterLogin } from "@/lib/queryClient";
import { kakaoLoginAvailable, useKakaoStart } from "@/lib/kakaoLogin";
import { isTermsAccepted } from "@shared/terms";
import { safeReturnPath } from "@shared/promoFunnel";

// 소셜 로그인(구글·애플) — 글로벌(비한국어) 유저의 기본 진입.
// 웹:          구글 GIS + 애플 SIWA JS(Services ID) → id_token → 서버(/api/hiq/social) JWKS 재검증.
// 앱(Capacitor): @capgo/capacitor-social-login 네이티브 플러그인으로 id_token 획득 → 같은 /api/hiq/social.
//   (웹뷰에서 구글 OAuth 리다이렉트는 정책상 차단되므로 네이티브 플러그인 사용 — mapix 표준)
// 카카오(2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플"): **한국어 화면 + 웹**에서만, 맨 위.
//   id_token 이 아니라 전체 화면 이동이다 — 카카오에 다녀와 /auth/kakao(pages/hiq/kakao-callback.tsx)가 서버에 인가 코드를 넘긴다.
//   약관 동의·'나' 새로 받기도 그 화면이 한다(이 파일의 submitToken 과 같은 규칙).
// 팝업(2026-10-06 오너: "회원가입은 … 올라오는 간편 회원가입 팝업으로") — 가입·로그인 팝업(LoginSheet)도 이 단추 묶음을 그대로 쓴다.
//   부른 쪽이 redirect·onDone·tone 을 준다. 셋 다 안 주면(로그인 화면) 모양도 동작도 예전 그대로다.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;

const APPLE_LOCALE: Record<string, string> = { ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES" };

/**
 * 소셜 로그인 노출 가능 여부 — 앱(네이티브 플러그인) 또는 웹(키 배포됨).
 * locale 을 넘기면 카카오만 되는 경우(한국어 웹인데 구글 키가 없음)도 센다. 카카오는 한국어 화면에서만 보이므로
 * 다른 언어에서는 예전과 같은 답이다 — 구글 키 없는 영어 화면에 빈 소셜 묶음이 뜨지 않는다.
 */
export function socialLoginAvailable(locale?: string): boolean {
  return isNativeApp() || !!GOOGLE_CLIENT_ID || (locale === "ko" && kakaoLoginAvailable());
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (cfg: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

// 공식 구글 G 로고(멀티컬러) — 네이티브 커스텀 버튼용(브랜드 가이드 준수)
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="14" height="17" viewBox="0 0 14 17" fill="currentColor" aria-hidden>
      <path d="M13.545 12.87c-.37.855-.547 1.237-1.023 1.993-.665 1.056-1.603 2.37-2.765 2.38-1.033.01-1.298-.672-2.7-.664-1.4.007-1.693.677-2.726.667-1.162-.01-2.05-1.198-2.716-2.253C-.245 12.028-.44 8.583.83 6.75c.902-1.302 2.326-2.064 3.664-2.064 1.362 0 2.219.747 3.345.747 1.093 0 1.759-.748 3.334-.748 1.191 0 2.453.649 3.352 1.77-2.945 1.614-2.467 5.82.02 6.415zM9.905 3.44c.573-.735.999-1.771.847-2.94-.995.068-2.158.702-2.837 1.527-.617.75-1.127 1.795-.928 2.828 1.086.034 2.21-.615 2.918-1.415z" />
    </svg>
  );
}

// 카카오 말풍선 심볼 — 카카오 디자인 가이드의 로그인 단추용(바탕 #FEE500 위에 #191919).
function KakaoSymbol() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#191919"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 .6C4.029.6 0 3.713 0 7.552c0 2.388 1.558 4.493 3.932 5.745l-.999 3.648c-.088.323.28.58.563.393l4.376-2.888c.37.036.745.057 1.128.057 4.971 0 9-3.113 9-6.955C18 3.713 13.971.6 9 .6"
      />
    </svg>
  );
}

/** 팝업(LoginSheet)에 넣을 때의 색 — 밝은 시트(당구) / 어두운 시트(골프). */
export type SocialTone = "light" | "dark";

type Look = { stack: string; note: string; hint: string; update: string; google: string; googleFocus: string; apple: string; appleWeb: string; busy: string };

// 로그인 화면(tone 을 안 줬을 때)의 모양 — 예전 그대로다. 여기 글자는 바꾸지 않는다.
const PAGE_LOOK: Look = {
  stack: "w-full flex flex-col items-center gap-3",
  note: "text-[12.5px] font-medium text-black/60 text-center",
  hint: "text-[12px] font-medium text-black/55 text-center",
  update: "w-full max-w-[320px] h-[44px] rounded-full bg-white border border-black/15 flex items-center justify-center text-[15px] font-medium text-black/80 active:scale-[0.98] transition-transform",
  google: "w-full max-w-[320px] h-[44px] rounded-full bg-white border border-black/15 flex items-center justify-center gap-2.5 text-[15px] font-medium text-black/80 disabled:opacity-40 active:scale-[0.98] transition-transform",
  // 로그인 화면의 구글 단추는 공식 GIS 단추가 그대로 보인다 — 초점 테도 GIS 것이 보여 따로 그리지 않는다
  googleFocus: "",
  apple: "w-full max-w-[320px] h-[44px] rounded-full bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 active:scale-[0.98] transition-transform",
  appleWeb: "w-full h-[44px] rounded-full bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 transition-opacity",
  busy: "text-[12px] text-black/40",
};

// 팝업의 모양(2026-10-06) — 단추들이 **같은 폭·같은 높이(48px)·같은 모서리(12px, 카카오 가이드의 값)** 로 세로로 선다.
// 단추 색은 전부 리터럴이다: 구글·애플 가이드의 색이라 테마 토큰을 타면 안 되고, 골프 테마(어두운 화면)는 흰 바탕·검정 글자 유틸을
// 다른 색으로 바꿔 끼운다(index.css). 어두운 시트에서는 애플 단추를 흰색으로 뒤집는다(검정 단추는 어두운 바탕에 묻힌다).
const SHEET_BTN = "w-full h-12 rounded-[12px] flex items-center justify-center gap-2.5 text-[15px] font-medium";
const SHEET_LOOK: Record<SocialTone, Look> = {
  light: {
    stack: "w-full flex flex-col items-stretch gap-2.5",
    note: "text-[13px] font-medium text-ink-2 text-center break-keep",
    hint: "text-[13px] font-medium text-ink-2 text-center break-keep",
    update: `${SHEET_BTN} bg-surface-1 border border-surface-line-strong text-ink-1 active:scale-[0.98] transition-transform`,
    google: `${SHEET_BTN} bg-[#FFFFFF] border border-[#DADCE0] text-[#1F1F1F] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    googleFocus: "outline outline-2 outline-offset-2 outline-[#1A73E8]",
    apple: `${SHEET_BTN} bg-[#000000] text-[#FFFFFF] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    appleWeb: `${SHEET_BTN} bg-[#000000] text-[#FFFFFF] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    busy: "text-[12px] text-ink-3 text-center",
  },
  dark: {
    stack: "w-full flex flex-col items-stretch gap-2.5",
    note: "text-[13px] font-medium text-[#FFFFFFB3] text-center break-keep",
    hint: "text-[13px] font-medium text-[#FFFFFFB3] text-center break-keep",
    update: `${SHEET_BTN} bg-[#FFFFFF14] border border-[#FFFFFF38] text-[#FFFFFF] active:scale-[0.98] transition-transform`,
    google: `${SHEET_BTN} bg-[#FFFFFF] border border-[#FFFFFF] text-[#1F1F1F] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    googleFocus: "outline outline-2 outline-offset-2 outline-[#8AB4F8]",
    apple: `${SHEET_BTN} bg-[#FFFFFF] text-[#000000] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    appleWeb: `${SHEET_BTN} bg-[#FFFFFF] text-[#000000] disabled:opacity-40 active:scale-[0.98] transition-transform`,
    busy: "text-[12px] text-[#FFFFFF99] text-center",
  },
};

/** 구글 공식 단추(GIS, large)의 높이는 40px 로 고정이다. 팝업에서는 이 단추를 투명하게 덮어 쓰는데, 48px 칸을 꼭 덮도록 세로로 늘린다(40 × 1.25 = 50). */
const GIS_STRETCH_Y = 1.25;

interface SocialLoginProps {
  hint?: boolean;
  /**
   * 카카오 단추를 이 자리에 둘 것인가(기본 true). 매장 화이트라벨 진입(?store=·매장 주소)의 로그인 화면은 false 로 부른다 —
   * 카카오 로그인은 매장과 무관하게 글로벌 회원을 만들고, 카카오에 다녀오는 길에 매장 표시(?store=)가 사라져 취소·실패 뒤
   * 기본 로그인 화면으로 떨어진다(거기서 번호를 넣으면 매장 회원이 '미가입'으로 판정된다). 2026-10-05 검토.
   */
  kakao?: boolean;
  /**
   * 로그인 뒤 돌아갈 곳을 부른 쪽이 정한다(팝업). **주면 주소의 ?redirect= 보다 먼저다** — 지금 주소와 같거나 비어 있으면(null)
   * 화면을 옮기지 않고 그 자리에 둔다. 안 주면(로그인 화면) 예전처럼 주소의 ?redirect= 를 읽고, 없으면 홈으로 간다.
   */
  redirect?: string | null;
  /** 로그인이 끝났다 — '나'를 새로 받은 **뒤**, 화면을 옮기기 전에 부른다. 팝업을 닫는 데 쓴다. */
  onDone?: () => void;
  /** 팝업의 색. 주면 단추들이 팝업 모양(같은 폭·48px·같은 모서리)으로 선다. 안 주면 로그인 화면의 예전 모양 그대로. */
  tone?: SocialTone;
}

export default function SocialLogin({ hint = true, kakao = true, redirect, onDone, tone }: SocialLoginProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [gisWidth, setGisWidth] = useState(0);
  // 단추 묶음의 실제 폭 — 팝업에서 투명한 구글 단추를 칸 폭에 맞춰 늘릴 때 쓴다(GIS 는 200~400px 만 그린다)
  const [wrapWidth, setWrapWidth] = useState(0);
  const [gisReady, setGisReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  // 팝업의 구글 단추에 키보드 초점이 와 있는가 — 초점을 받는 것은 투명하게 덮은 GIS 단추라, 테는 우리가 그린 틀에 직접 단다(아래 효과)
  const [gisFocused, setGisFocused] = useState(false);
  // 팝업이 붙을 때 '이미 로그인돼 있는가'를 한 번 확인하는 동안 — 그 사이 단추 묶음이 누름을 받지 않는다(아래 효과 · stackClass).
  // 로그인 화면(redirect 를 안 줬다)은 늘 false
  const [checking, setChecking] = useState(redirect !== undefined);
  const inApp = isNativeApp();
  const nativeSocial = inApp && nativeSocialAvailable();
  const { ask: askTerms } = useTermsGate();
  // 팝업 모양인가(tone 을 줬다) — 아니면 로그인 화면의 예전 모양
  const sheet = tone !== undefined;
  const look = tone ? SHEET_LOOK[tone] : PAGE_LOOK;

  // 부른 쪽이 준 값은 ref 로 읽는다 — submitToken 이 바뀌면 구글 단추(GIS)를 다시 초기화하므로, 부른 쪽이 다시 그려질 때마다 단추가 흔들리지 않게.
  const given = useRef({ redirect, onDone });
  given.current = { redirect, onDone };
  /** 돌아갈 곳 — 부른 쪽이 준 값(redirect prop)이 주소의 ?redirect= 보다 먼저다. */
  const returnTo = useCallback((): string | null => {
    const fromCaller = given.current.redirect;
    return fromCaller !== undefined ? fromCaller : new URLSearchParams(window.location.search).get("redirect");
  }, []);
  /**
   * 부른 쪽이 돌아갈 곳을 정해 준 로그인(팝업)의 마무리 — 닫고(onDone), 가려던 곳이 지금 주소와 다를 때만 옮긴다.
   * 같거나 없으면 **그 자리에 그대로** 둔다(보던 골프장·선수 페이지에 남는다). '나'를 새로 받은 뒤에만 부른다.
   */
  const finishInPlace = useCallback((back: string | null) => {
    given.current.onDone?.();
    const dest = safeReturnPath(back);
    if (!dest || dest === window.location.pathname + window.location.search) return;
    // 같은 화면에 표시만 붙는 주소(?alert=1 처럼 '누르려던 것을 이어서 연다')는 자리를 바꿔 끼운다 — '뒤로'가 한 번 더 필요해지지 않게
    setLocation(dest, { replace: dest.split(/[?#]/)[0] === window.location.pathname });
  }, [setLocation]);

  // 카카오 — 한국어 화면에서만 보인다(앱 안·키 없음·등록 안 된 주소는 kakaoLoginAvailable 이 끈다). 매장 진입은 부른 쪽이 끈다(kakao).
  const showKakao = kakao && locale === "ko" && kakaoLoginAvailable();
  // 카카오로 보냈던 이 화면이 되살아났다(뒤로 가기 · 새 탭에서 끝내고 이 탭으로 돌아옴) — 그 사이 로그인이 끝났는지 서버에 묻고,
  // 끝났으면 로그인 화면이 처음 뜰 때(landing 의 로그인 확인)와 같은 규칙으로 넘긴다: '나'를 새로 받은 **뒤에** 보던 곳이나 홈으로.
  // 안 그러면 로그인된 사람에게 로그인 폼이 그대로 보인다(landing 의 확인은 화면이 붙을 때 한 번만 돈다).
  const onKakaoReturn = useCallback(() => {
    void (async () => {
      try {
        const me = await fetch("/api/hiq/me", { credentials: "include" });
        if (!me.ok) return;
      } catch { return; /* 못 물어봤으면 그대로 둔다 — 로그인 폼은 여전히 쓸 수 있다 */ }
      await refreshAfterLogin();
      // 팝업에서 카카오로 보냈던 화면이면 닫기만 한다 — 로그인 화면이 아니라 보던 화면이라, 홈으로 보내지 않고 그 자리에 둔다
      if (given.current.redirect !== undefined) { finishInPlace(null); return; }
      setLocation(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard", { replace: true });
    })();
  }, [setLocation, finishInPlace]);
  // 누르면 꾸러미를 남기고 카카오로 넘어간다. SDK 는 단추가 보일 때 미리 실린다(index.html 에는 없다) —
  // 중복 누름 방지·'뒤로' 왔을 때 풀기까지 useKakaoStart 가 한다.
  const { busy: kakaoBusy, start: startKakao } = useKakaoStart(showKakao, () => {
    toast({ title: t("login.failedTitle"), description: t("login.kakaoStartFailed"), variant: "destructive" });
  }, onKakaoReturn);
  const handleKakao = useCallback(() => {
    // 돌아갈 곳을 들려 보낸다 — 카카오에 다녀와도 보던 곳으로 돌아가게(돌아온 화면이 다시 거른다).
    // 로그인 화면은 주소에 실려 온 ?redirect=, 팝업은 부른 쪽이 준 주소(returnTo — 화면이 통째로 넘어가므로 '그대로 있기'도 지금 주소가 실려 온다)
    startKakao({ mode: "login", redirect: returnTo() });
  }, [startKakao, returnTo]);

  // 팝업이 붙을 때 한 번: 이미 로그인돼 있는가(2026-10-06 검토). 다른 탭에서 로그인한 뒤 먼저 열어 둔 탭으로 돌아오면 화면은
  // '나 = 없음'을 5분 동안 쥐고 있어 머리에 '로그인'이 보인다. 예전에는 그 단추가 로그인 화면으로 보냈고, 로그인 화면이 서버에 물어
  // 보던 곳으로 되돌려 주었다(landing 의 로그인 확인). 팝업은 묻지 않고 단추부터 보여서, 로그인된 사람이 구글·애플을 다시 눌렀다 —
  // 전화번호로 로그인한 사람이면 새 계정이 만들어지고 세션이 그쪽으로 바뀐다.
  // 로그인돼 있으면 '나'를 새로 받은 **뒤에** 팝업의 마무리(finishInPlace: 닫고, 가려던 곳이 따로 있을 때만 옮긴다)로 끝낸다.
  // 확인이 끝날 때까지 단추 묶음은 누름을 받지 않는다(모양은 그대로 둔다 — 열 때마다 단추가 흐려졌다 돌아오면 어색하다).
  // 로그인 화면(redirect 를 안 줬다)에서는 돌지 않는다 — 그 확인은 landing 이 한다.
  useEffect(() => {
    if (given.current.redirect === undefined) return;
    let alive = true;
    void (async () => {
      try {
        const me = await fetch("/api/hiq/me", { credentials: "include" });
        if (!alive) return;
        if (me.ok) {
          await refreshAfterLogin();
          if (alive) finishInPlace(returnTo());
          return;
        }
      } catch { /* 못 물어봤으면 비로그인으로 본다 — 단추를 풀어 로그인할 수 있게 */ }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, [finishInPlace, returnTo]);

  // 팝업의 구글 단추 초점 테(2026-10-06 검토). 초점을 받는 GIS 단추는 다른 출처의 iframe 이고 투명한 틀 안에 있어, Tab 으로 돌 때
  // 구글 차례에만 화면 어디에도 초점 표시가 없었다. iframe 안의 초점은 CSS(:focus-within)로 잡히지 않는다 — 초점이 iframe 으로 들어가면
  // 이 창에 blur 가 나고 document.activeElement 가 그 iframe 이 되므로, 그때 우리가 그린 틀에 테를 단다. 빠져나오면 focus/focusin 으로 꺼진다.
  useEffect(() => {
    if (!sheet || inApp || !GOOGLE_CLIENT_ID) return;
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      // activeElement 는 이벤트가 끝난 뒤에 바뀐다
      timer = window.setTimeout(() => {
        const box = googleBtnRef.current;
        setGisFocused(!!box && box.contains(document.activeElement));
      }, 0);
    };
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, [sheet, inApp]);

  const submitToken = useCallback(async (provider: "google" | "apple", idToken: string, name?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hiq/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, idToken, name }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) throw new Error(j?.message || "social login failed");
      // 약관 동의(감사 S4 — Apple 1.2·Play UGC). 소셜 첫 로그인은 동의 화면 없이 계정이 만들어진다.
      // 그래서 앱에 들어가기 전에 바로 받는다. 거절하면 로그아웃해 동의 없이 쓰는 상태를 남기지 않는다
      // (계정은 남고, 다음 로그인 때 다시 묻는다). 이미 동의한 계정은 시트 없이 지나간다.
      if (!isTermsAccepted(j.data?.member?.termsVersion)) {
        const agreed = await askTerms("signup");
        if (!agreed) {
          await fetch("/api/hiq/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
          queryClient.removeQueries({ queryKey: ["/api/hiq/me"] });
          toast({ title: t("terms.declinedTitle"), description: t("terms.declinedDesc") });
          return;
        }
      }
      // LoginGate 가 붙여 보낸 ?redirect= 로 돌아간다 — 라이벌을 보려다 로그인한 사람은
      // 라이벌로 되돌아와야 한다. startsWith("/") 로 오픈 리다이렉트를 막는다(전화 로그인과 동일).
      // 팝업에서는 주소에 ?redirect= 가 없다 — 부른 쪽이 준 값이 먼저다(returnTo).
      const back = returnTo();
      // '나'를 새로 받은 뒤에 옮긴다 — 안 그러면 돌아간 화면이 비로그인으로 그려진다(queryClient.refreshAfterLogin)
      await refreshAfterLogin();
      // 팝업(부른 쪽이 돌아갈 곳을 정했다): 닫고, 가려던 곳이 따로 있을 때만 옮긴다. 새 회원도 같다
      if (given.current.redirect !== undefined) { finishInPlace(back); return; }
      given.current.onDone?.();
      setLocation(back?.startsWith("/") ? back : (j.data?.redirectTo || "/dashboard"));
    } catch (err) {
      // 서버가 알려준 실패 사유(레이트리밋·검증 실패 등)를 그대로 보여준다 — 일반 문구만으로는 원인 추적 불가
      const detail = err instanceof Error && err.message !== "social login failed" ? err.message : t("login.socialFailed");
      console.error("[social] login failed:", err);
      toast({ title: t("login.failedTitle"), description: detail, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [setLocation, toast, t, askTerms, returnTo, finishInPlace]);

  // 앱(Capacitor): 네이티브 플러그인 → id_token → 서버. 취소 시 조용히 종료.
  const nativeSignIn = useCallback(async (provider: "google" | "apple") => {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await nativeSocialIdToken(provider);
      if (!idToken) { setBusy(false); return; } // 사용자 취소
      await submitToken(provider, idToken); // 성공/실패 토스트·busy 해제는 submitToken이 처리
    } catch (err) {
      // 플러그인 미탑재(구 앱 빌드)·설정 오류가 전부 여기로 떨어진다 — 원인 문구를 남겨야 추적 가능
      console.error("[social] native sign-in failed:", err);
      setBusy(false);
      const msg = err instanceof Error && err.message ? err.message : t("login.socialFailed");
      toast({ title: t("login.failedTitle"), description: msg, variant: "destructive" });
    }
  }, [busy, submitToken, toast, t]);

  // GIS 버튼은 폭을 **픽셀 숫자로만** 받는다(% 불가). 고정 320 으로 두면 좁은 화면에서
  // 전화 입력·애플 버튼(부모 폭)보다 넓어져 혼자 튀어나온다 — 실제로 그랬다(2026-08-16).
  // 그래서 부모 폭을 재서 넘긴다. GIS 허용 범위는 200~400.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || inApp) return;
    const measure = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      setWrapWidth(width);
      setGisWidth(Math.max(200, Math.min(400, width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inApp]);

  // 웹 전용: GIS 스크립트 로드 + 공식 구글 버튼(브랜드 가이드 준수)
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || inApp || !gisWidth) return;
    const id = "google-gsi";
    const init = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => { if (r.credential) void submitToken("google", r.credential); },
      });
      // shape:"pill" — 애플 버튼과 한 쌍으로 읽히게 맞춘 것. GIS 는 높이를 지정할 수 없어
      // large(40px) 가 고정이라, 감싸는 행을 44px 로 잡아 애플 버튼과 리듬을 맞춘다.
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", shape: "pill", width: gisWidth, text: "continue_with", locale,
      });
      setGisReady(true);
    };
    if (document.getElementById(id)) { init(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [locale, submitToken, inApp, gisWidth]);

  // 웹 전용: 애플 SIWA JS(팝업)
  useEffect(() => {
    if (!APPLE_SERVICES_ID || inApp) return;
    const id = "apple-siwa";
    const init = () => {
      window.AppleID?.auth.init({
        clientId: APPLE_SERVICES_ID,
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });
      setAppleReady(true);
    };
    if (document.getElementById(id)) { init(); return; }
    const s = document.createElement("script");
    s.id = id;
    s.src = `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/${APPLE_LOCALE[locale] ?? "en_US"}/appleid.auth.js`;
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [locale, inApp]);

  const handleAppleWeb = useCallback(async () => {
    if (!window.AppleID) return;
    try {
      const res = await window.AppleID.auth.signIn();
      const idToken = res?.authorization?.id_token;
      if (!idToken) return;
      const n = res.user?.name;
      const name = [n?.firstName, n?.lastName].filter(Boolean).join(" ") || undefined;
      await submitToken("apple", idToken, name);
    } catch { /* 유저 취소 등 무시 */ }
  }, [submitToken]);

  // 단추 묶음의 틀 — '이미 로그인돼 있는가'를 확인하는 동안(팝업이 붙은 직후 잠깐)은 누름을 받지 않는다.
  // 투명하게 덮은 구글 단추(다른 출처의 iframe)도 이 틀의 pointer-events 를 물려받아 같이 잠긴다.
  const stackClass = checking ? `${look.stack} pointer-events-none` : look.stack;

  // ── 옛 앱(네이티브 소셜 로그인 플러그인 없음 — iOS 1.0.x): 누르면 Unimplemented 로 깨지는 버튼 대신 업데이트 안내.
  //    웹 구글·애플 로그인도 대신 쓸 수 없다(구글은 앱 웹뷰 안의 OAuth 를 정책상 막는다). 웹뷰에서도 되는
  //    전화번호 로그인은 랜딩에 그대로 남는다. (감사 C1)
  if (inApp && !nativeSocial) {
    return (
      <div className={stackClass}>
        <p className={look.note}>{t("login.updateForSocial")}</p>
        <button
          onClick={openStorePage}
          className={look.update}
        >
          {t("login.updateApp")}
        </button>
      </div>
    );
  }

  // ── 앱(Capacitor): 네이티브 플러그인 버튼 ──
  if (inApp) {
    return (
      <div className={stackClass}>
        {hint && <p className={look.hint}>{t("login.socialHint")}</p>}
        <button
          onClick={() => nativeSignIn("google")}
          disabled={busy}
          className={look.google}
        >
          <GoogleG />
          <span>{t("login.continueGoogle")}</span>
        </button>
        {/* 안드로이드 앱은 애플 버튼 미노출 — 네이티브 initialize에서 apple 설정을 뺐고(웹뷰 제약,
            nativeSignIn.ts 참고) 누르면 "Provider was not initialized"만 난다. 애플 정책상
            안드로이드 앱에 애플 로그인 의무도 없다. iOS 앱·웹(안드로이드 브라우저 포함)은 유지. */}
        {nativePlatform() !== "android" && (
          <button
            onClick={() => nativeSignIn("apple")}
            disabled={busy}
            className={look.apple}
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
          >
            <AppleLogo />
            <span>{t("login.continueApple")}</span>
          </button>
        )}
        {busy && <p className={look.busy}>{t("common.loading")}</p>}
      </div>
    );
  }

  // ── 웹: 카카오(한국어만) + GIS + SIWA JS ──
  if (!GOOGLE_CLIENT_ID && !showKakao) return null;
  return (
    <div ref={wrapRef} className={stackClass}>
      {hint && <p className={look.hint}>{t("login.socialHint")}</p>}
      {/* 카카오 — 맨 위. 카카오 디자인 가이드: 바탕 #FEE500 · 글자와 심볼 #191919 · 모서리 12px · 말풍선 심볼.
          높이·폭은 아래 구글·애플 단추와 같다(로그인 화면 44px · 팝업 48px). 색은 리터럴로 둔다(테마 토큰을 타면 가이드 색이 바뀐다). */}
      {showKakao && (
        <button
          type="button"
          onClick={handleKakao}
          disabled={kakaoBusy || busy}
          aria-busy={kakaoBusy}
          className={`w-full ${sheet ? "h-12" : "h-[44px]"} rounded-[12px] bg-[#FEE500] text-[#191919] flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-60 active:scale-[0.98] transition-transform`}
        >
          <KakaoSymbol />
          <span>{t("login.kakao")}</span>
        </button>
      )}

      {/* 팝업의 구글 단추 — **보이는 것**은 우리가 그린 단추(높이 48px·모서리 12px, 다른 단추와 한 벌 · 구글 G 와 가이드 색),
          **눌리는 것**은 그 위에 투명하게 덮은 공식 GIS 단추다. GIS 는 높이(40px)와 모서리를 바꿀 수 없어 그대로 두면 혼자 작고 둥글다.
          같은 폭으로 그린 뒤 세로로 늘려(GIS_STRETCH_Y) 칸을 꼭 덮는다 — 어디를 눌러도 GIS 가 받아 구글 창을 연다.
          우리 단추는 그림일 뿐이다(aria-hidden · 눌림 없음): 화면 낭독기와 키보드는 GIS 단추를 읽는다. 준비 전에는 흐리게 둔다.
          키보드 초점이 GIS 단추에 오면 이 틀에 테를 단다(gisFocused). */}
      {GOOGLE_CLIENT_ID && sheet && (
        <div className={`relative overflow-hidden ${look.google}${gisReady ? "" : " opacity-60"}${gisFocused ? ` ${look.googleFocus}` : ""}`}>
          <span aria-hidden className="pointer-events-none flex items-center gap-2.5">
            <GoogleG />
            <span>{t("login.continueGoogle")}</span>
          </span>
          <div className="absolute inset-0 opacity-0">
            {/* GIS가 이 컨테이너 내부 DOM을 직접 소유 — React 자식을 절대 넣지 말 것(removeChild 충돌) */}
            <div
              ref={googleBtnRef}
              style={{ transformOrigin: "0 0", transform: `scale(${gisWidth ? Math.max(1, wrapWidth / gisWidth) : 1}, ${GIS_STRETCH_Y})` }}
            />
          </div>
        </div>
      )}
      {/* GIS가 이 컨테이너 내부 DOM을 직접 소유 — React 자식을 절대 넣지 말 것(removeChild 충돌) */}
      {GOOGLE_CLIENT_ID && !sheet && (
        <div className="w-full flex justify-center items-center h-[44px] relative">
          <div ref={googleBtnRef} />
          {!gisReady && <div className="absolute inset-0 rounded-full bg-black/[0.04] animate-pulse pointer-events-none" />}
        </div>
      )}

      {APPLE_SERVICES_ID && (
        <button
          onClick={handleAppleWeb}
          disabled={!appleReady || busy}
          className={look.appleWeb}
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          <AppleLogo />
          <span>{t("login.continueApple")}</span>
        </button>
      )}

      {busy && <p className={look.busy}>{t("common.loading")}</p>}
    </div>
  );
}
