import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { isNativeApp, nativePlatform } from "@/lib/nativeBridge";
import { nativeSocialIdToken } from "@/lib/nativeSignIn";

// 소셜 로그인(구글·애플) — 글로벌(비한국어) 유저의 기본 진입.
// 웹:          구글 GIS + 애플 SIWA JS(Services ID) → id_token → 서버(/api/hiq/social) JWKS 재검증.
// 앱(Capacitor): @capgo/capacitor-social-login 네이티브 플러그인으로 id_token 획득 → 같은 /api/hiq/social.
//   (웹뷰에서 구글 OAuth 리다이렉트는 정책상 차단되므로 네이티브 플러그인 사용 — mapix 표준)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;

const APPLE_LOCALE: Record<string, string> = { ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES" };

/** 소셜 로그인 노출 가능 여부 — 앱(네이티브 플러그인) 또는 웹(키 배포됨) */
export function socialLoginAvailable(): boolean {
  return isNativeApp() || !!GOOGLE_CLIENT_ID;
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

export default function SocialLogin({ hint = true }: { hint?: boolean }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const inApp = isNativeApp();

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
      setLocation(j.data?.redirectTo || "/dashboard");
    } catch (err) {
      // 서버가 알려준 실패 사유(레이트리밋·검증 실패 등)를 그대로 보여준다 — 일반 문구만으로는 원인 추적 불가
      const detail = err instanceof Error && err.message !== "social login failed" ? err.message : t("login.socialFailed");
      console.error("[social] login failed:", err);
      toast({ title: t("login.failedTitle"), description: detail, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [setLocation, toast, t]);

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

  // 웹 전용: GIS 스크립트 로드 + 공식 구글 버튼(브랜드 가이드 준수)
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || inApp) return;
    const id = "google-gsi";
    const init = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => { if (r.credential) void submitToken("google", r.credential); },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", width: 320, text: "continue_with", locale,
      });
      setGisReady(true);
    };
    if (document.getElementById(id)) { init(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [locale, submitToken, inApp]);

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

  // ── 앱(Capacitor): 네이티브 플러그인 버튼 ──
  if (inApp) {
    return (
      <div className="w-full flex flex-col items-center gap-3">
        {hint && <p className="text-[12px] font-medium text-black/55 text-center">{t("login.socialHint")}</p>}
        <button
          onClick={() => nativeSignIn("google")}
          disabled={busy}
          className="w-[320px] h-[44px] rounded-full bg-white border border-black/15 flex items-center justify-center gap-2.5 text-[15px] font-medium text-black/80 disabled:opacity-40 active:scale-[0.98] transition-transform"
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
            className="w-[320px] h-[44px] rounded-[8px] bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 active:scale-[0.98] transition-transform"
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
          >
            <AppleLogo />
            <span>{t("login.continueApple")}</span>
          </button>
        )}
        {busy && <p className="text-[12px] text-black/40">{t("common.loading")}</p>}
      </div>
    );
  }

  // ── 웹: GIS + SIWA JS ──
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="w-full flex flex-col items-center gap-3">
      {hint && <p className="text-[12px] font-medium text-black/55 text-center">{t("login.socialHint")}</p>}
      {/* GIS가 이 컨테이너 내부 DOM을 직접 소유 — React 자식을 절대 넣지 말 것(removeChild 충돌) */}
      <div className="flex justify-center min-h-[44px] relative">
        <div ref={googleBtnRef} />
        {!gisReady && <div className="absolute inset-0 mx-auto h-[44px] w-[320px] rounded-full bg-black/[0.04] animate-pulse pointer-events-none" />}
      </div>

      {APPLE_SERVICES_ID && (
        <button
          onClick={handleAppleWeb}
          disabled={!appleReady || busy}
          className="w-[320px] h-[44px] rounded-[8px] bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 transition-opacity"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          <AppleLogo />
          <span>{t("login.continueApple")}</span>
        </button>
      )}

      {busy && <p className="text-[12px] text-black/40">{t("common.loading")}</p>}
    </div>
  );
}
