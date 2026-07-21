import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

// 소셜 로그인(구글·애플) — 글로벌(비한국어) 유저의 기본 진입.
// 구글: GIS(Google Identity Services)로 id_token 발급 → 서버(/api/hiq/social)가 JWKS 재검증.
// 애플(웹): Services ID 발급 후 활성화(VITE_APPLE_SERVICES_ID) — 그 전까진 버튼 미노출.
// ⚠️ Expo 앱 웹뷰에선 구글이 OAuth를 차단하므로 네이티브 브릿지(RQ-4) 완성 전까지 전체 숨김.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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
  }
}

export default function SocialLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);

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
      {busy && <p className="text-[12px] text-black/40">{t("common.loading")}</p>}
    </div>
  );
}
