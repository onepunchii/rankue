import { isNativeApp, nativePlatform } from "@/lib/nativeBridge";

// 네이티브 앱(Capacitor) 소셜 로그인 — 웹뷰 OAuth 리다이렉트 차단 우회.
// 플러그인이 구글/애플에서 직접 id_token을 받아오면, 그걸 /api/hiq/social 로 넘겨 세션 발급.
// 웹/PWA에선 isNativeApp()=false라 절대 안 탐 → 기존 GIS/SIWA JS 그대로. (mapix/onp 표준 이식)
let inited = false;

async function ensureInit() {
  if (inited) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const google = {
    iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined,
    webClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined, // Android/서버 검증용 client ID
  };
  // 안드로이드: 애플은 웹 플로우(SocialLogin.tsx 분기)라 플러그인 설정 자체를 뺀다 —
  // apple 설정이 있으면 redirectUrl 없다고 initialize가 throw → 구글 로그인까지 같이 죽던 원인
  await SocialLogin.initialize(
    nativePlatform() === "android"
      ? { google }
      : { google, apple: { clientId: import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined } }
  );
  inited = true;
}

// 네이티브에서 소셜 로그인 → id_token 반환. 실패/취소 시 null.
export async function nativeSocialIdToken(provider: "google" | "apple"): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInit();
  // 안드로이드: scopes를 넘기면 플러그인이 MainActivity 수정을 요구하며 throw — 기본 로그인으로도 email 포함 idToken이 옴
  const options = nativePlatform() === "android"
    ? {}
    : provider === "apple" ? { scopes: ["email"] } : { scopes: ["email", "profile"] };
  const res = await SocialLogin.login({ provider, options });
  // 응답 형태가 버전/플랫폼마다 조금씩 달라 방어적으로 추출
  const r = ((res as unknown as { result?: Record<string, unknown> })?.result ?? (res as unknown as Record<string, unknown>)) ?? {};
  const at = r.accessToken as { token?: string } | undefined;
  const idToken = (r.idToken ?? r.identityToken ?? at?.token) as string | undefined;
  return idToken ?? null;
}
