import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

// 소셜 로그인(구글·애플) — 글로벌(비한국어) 유저의 기본 진입.
// 구글: GIS(Google Identity Services)로 id_token 발급 → 서버(/api/hiq/social)가 JWKS 재검증.
// 애플(웹): Services ID 발급 후 활성화(VITE_APPLE_SERVICES_ID) — 그 전까진 버튼 미노출.
// ⚠️ Expo 앱 웹뷰에선 구글이 OAuth를 차단하므로 네이티브 브릿지(RQ-4) 완성 전까지 전체 숨김.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
// 애플 웹 로그인(SIWA JS) — Services ID(com.rankue.app.web). 미설정이면 애플 버튼 미노출.
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;

const APPLE_LOCALE: Record<string, string> = { ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES" };

/** Expo 래퍼(웹뷰) 안인가 — App.tsx가 주입하는 ReactNativeWebView 존재로 판별 */
export function isInAppWebView(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
}

/** 소셜 로그인 노출 가능 여부 — 키 미배포·앱 웹뷰(브릿지 전)면 false → 전화 UI로 폴백 */
export function socialLoginAvailable(): boolean {
  return !!GOOGLE_CLIENT_ID && !isInAppWebView();
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

export default function SocialLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);

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
    } catch {
      toast({ title: t("login.failedTitle"), description: t("login.socialFailed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [setLocation, toast, t]);

  // GIS 스크립트 로드 + 공식 구글 버튼 렌더(브랜드 가이드 준수 — 커스텀 버튼 금지 정책 회피)
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || isInAppWebView()) return;
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
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) { init(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [locale, submitToken]);

  // 애플 SIWA JS 로드 + init — 팝업 모드(등록된 리턴URL 오리진에서 postMessage 수신)
  useEffect(() => {
    if (!APPLE_SERVICES_ID || isInAppWebView()) return;
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
  }, [locale]);

  const handleApple = useCallback(async () => {
    if (!window.AppleID) return;
    try {
      const res = await window.AppleID.auth.signIn();
      const idToken = res?.authorization?.id_token;
      if (!idToken) return;
      // 애플은 최초 1회만 이름 제공 — 있으면 서버로 전달
      const n = res.user?.name;
      const name = [n?.firstName, n?.lastName].filter(Boolean).join(" ") || undefined;
      await submitToken("apple", idToken, name);
    } catch {
      /* 유저 취소 등 — 조용히 무시 */
    }
  }, [submitToken]);

  // 키 미설정(배포 전) 또는 앱 웹뷰(브릿지 전) → 아무것도 노출하지 않음
  if (!GOOGLE_CLIENT_ID || isInAppWebView()) return null;

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <p className="text-[12px] font-medium text-black/55 text-center">{t("login.socialHint")}</p>
      {/* GIS가 이 컨테이너 내부 DOM을 직접 소유 — React 자식을 절대 넣지 말 것(removeChild 충돌) */}
      <div className="flex justify-center min-h-[44px] relative">
        <div ref={googleBtnRef} />
        {!gisReady && <div className="absolute inset-0 mx-auto h-[44px] w-[320px] rounded-full bg-black/[0.04] animate-pulse pointer-events-none" />}
      </div>

      {/* 애플 로그인 — 브랜드 가이드(검정 배경·공식 로고·시스템 폰트) 준수 커스텀 버튼 */}
      {APPLE_SERVICES_ID && (
        <button
          onClick={handleApple}
          disabled={!appleReady || busy}
          className="w-[320px] h-[44px] rounded-[4px] bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 transition-opacity"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          <svg width="14" height="17" viewBox="0 0 14 17" fill="currentColor" aria-hidden>
            <path d="M13.545 12.87c-.37.855-.547 1.237-1.023 1.993-.665 1.056-1.603 2.37-2.765 2.38-1.033.01-1.298-.672-2.7-.664-1.4.007-1.693.677-2.726.667-1.162-.01-2.05-1.198-2.716-2.253C-.245 12.028-.44 8.583.83 6.75c.902-1.302 2.326-2.064 3.664-2.064 1.362 0 2.219.747 3.345.747 1.093 0 1.759-.748 3.334-.748 1.191 0 2.453.649 3.352 1.77-2.945 1.614-2.467 5.82.02 6.415zM9.905 3.44c.573-.735.999-1.771.847-2.94-.995.068-2.158.702-2.837 1.527-.617.75-1.127 1.795-.928 2.828 1.086.034 2.21-.615 2.918-1.415z"/>
          </svg>
          <span>{t("login.continueApple")}</span>
        </button>
      )}

      {busy && <p className="text-[12px] text-black/40">{t("common.loading")}</p>}
    </div>
  );
}
