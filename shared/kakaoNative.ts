/**
 * 앱 안 카카오 로그인(네이티브 SDK)의 **계약** — 네이티브 플러그인·화면·서버 셋이 이 파일 하나를 같이 지킨다.
 * (2026-10-06 오너: "카카오 로그인이 되는 앱 빌드를 만들어 구글·애플에 올리고, 승인되면 카카오를 연다")
 *
 * 왜 따로 있나: 앱의 웹뷰는 rankue.co.kr 밖으로 못 나가서(capacitor.config.ts allowNavigation) 웹 방식 카카오 로그인
 * (shared/kakaoLogin.ts — 인가 코드 + Redirect URI)을 못 쓴다. 그래서 새 바이너리(1.3~)는 카카오 네이티브 SDK 를 작은 로컬
 * Capacitor 플러그인으로 감싸 **ID 토큰(OIDC)** 을 받아 오고, 서버가 그 토큰을 검증한다. 웹의 길은 그대로다.
 *
 * ── 플러그인 계약 ──────────────────────────────────────────────────────────────
 *  이름: "RankueKakao" (Capacitor jsName — iOS·안드로이드 둘 다 이 글자 그대로)
 *
 *  login({ nonce: string }): Promise<{ idToken: string; viaTalk: boolean }>
 *    - nonce 는 서버가 내준 값이다(아래 발급 API). 플러그인은 **가공하지 않고 그대로** SDK 의 nonce 인자로 넘긴다
 *      (해시·인코딩·자르기 금지). ID 토큰의 nonce 클레임이 이 글자와 같아야 서버가 받는다.
 *    - 카카오톡이 깔려 있으면 카카오톡으로(viaTalk = true), 없으면 카카오계정 로그인(시스템 브라우저 시트)으로(false).
 *    - idToken 은 SDK 가 준 OAuthToken 의 ID 토큰 원문(JWT)이다. 카카오 콘솔에서 OpenID Connect 가 켜져 있어야 온다 —
 *      없으면 성공으로 돌려주지 말고 거절한다(code "NO_ID_TOKEN").
 *    - **액세스·리프레시 토큰은 화면(JS)으로 넘기지 않는다.** 서버도 받지 않는다.
 *    - 사용자가 취소했으면 code "CANCELED" 로 거절한다(call.reject(메시지, "CANCELED")). 화면은 이 코드만 따로 본다 — 조용히 끝낸다.
 *    - 그 밖의 실패는 다른 code 로 거절한다: "NOT_CONFIGURED"(이 빌드에 네이티브 앱 키가 없다 — 자리표시자) · "NO_ID_TOKEN" ·
 *      "BAD_NONCE"(nonce 가 비었다) · "IN_PROGRESS"(앞의 login 이 끝나기 전에 또 불렀다) · "FAILED"(그 밖).
 *      화면은 CANCELED 가 아니면 전부 같은 실패 문구를 보여 준다 — 플러그인의 메시지(SDK 원문)는 화면에 싣지 않는다.
 *    - 앞의 login 이 끝나지 않은 채 새 login 이 오면 앞의 것은 CANCELED 로 정리된다(화면에는 조용한 종료로 보인다).
 *
 *  logout(): Promise<void>
 *    - SDK 가 기기에 저장한 카카오 토큰만 지운다. 랭큐 로그인(쿠키)과는 무관하다. 실패해도 resolve 한다.
 *    - 화면은 ID 토큰을 받은 직후에 부른다 — 우리는 카카오 API 를 쓰지 않으므로 토큰을 기기에 남길 이유가 없다(애플 5.1.1(v)).
 *
 *  화면은 `registerPlugin`(@capacitor/core)으로만 부른다 — 플러그인 패키지를 import 하지 않는다(웹 번들에 네이티브 패키지가
 *  끌려오지 않게). 플러그인이 있는지는 shared/nativeCaps 의 nativeSupports("nativeKakaoLogin") 으로 본다: 1.2 이하 바이너리에는 없다.
 *
 * ── 서버 계약(server/lib/kakaoAuth.ts · server/routes/modules/auth.ts) ───────────
 *  POST /api/hiq/social/kakao/native/nonce   본문 `{}`(JSON) → 200 { nonce, expiresInSec }
 *    - 난수 32바이트(base64url 43자). 같은 값을 **서명 쿠키**(httpOnly · SameSite=Strict · 이 길에만 실리는 Path · 10분)에도 넣는다 —
 *      nonce 가 이 브라우저(앱의 웹뷰)에 묶인다. 다른 기기에서 받은 ID 토큰은 쿠키가 없어 쓸 수 없다.
 *  POST /api/hiq/social/kakao/native         본문 { idToken, nonce, mode?: "login" | "link", pin? }
 *    - 서버가 ID 토큰을 검증한다: 서명(카카오 JWKS) · iss · aud(허용 목록) · exp · nonce(본문 = 쿠키 = 토큰의 클레임).
 *    - nonce 는 한 번만 쓴다: 검사하는 순간 쿠키를 지우고, 같은 값이 다시 오면 거절한다. 10분이 지나도 거절한다.
 *    - login: 검증된 회원번호(sub)로 웹 카카오와 **같은 계정 규칙**을 탄다 → 로그인 쿠키. 응답은 /social 과 같은 모양.
 *    - link: 로그인 + PIN 재확인 뒤에만(웹과 같다). PIN 은 토큰보다 먼저 본다 — 틀리면 nonce 가 쓰이지 않아 같은 토큰으로 PIN 만 다시 보낸다.
 *    - 스위치(KAKAO_LOGIN_OPEN)가 꺼져 있으면 둘 다 503(웹 카카오와 같은 답).
 *
 * 여기에는 **비밀 값이 없다** — 화면 번들에 실리는 파일이다. 환경변수를 읽지 않는다(키 이름은 서버 쪽 kakaoAuth 에 있다).
 */

/** Capacitor 플러그인 이름(jsName) — 네이티브 쪽 등록 이름과 글자까지 같아야 한다. */
export const KAKAO_NATIVE_PLUGIN = "RankueKakao";

/** 사용자가 취소했을 때 플러그인이 거절하는 code. */
export const KAKAO_NATIVE_CANCELED = "CANCELED";

export type KakaoNativeLoginOptions = {
    /** 서버가 내준 1회용 nonce — 그대로 SDK 에 넘긴다. */
    nonce: string;
};

export type KakaoNativeLoginResult = {
    /** 카카오가 서명한 ID 토큰(JWT) 원문. */
    idToken: string;
    /** 카카오톡 앱으로 로그인했는가(false = 카카오계정 로그인). 통계·문의 대응용이고 서버는 받지 않는다. */
    viaTalk: boolean;
};

/** 플러그인의 JS 모양 — 화면은 registerPlugin<RankueKakaoPlugin>(KAKAO_NATIVE_PLUGIN) 으로 부른다. */
export interface RankueKakaoPlugin {
    login(options: KakaoNativeLoginOptions): Promise<KakaoNativeLoginResult>;
    logout(): Promise<void>;
}

/** 서버의 두 길. */
export const KAKAO_NATIVE_NONCE_API = "/api/hiq/social/kakao/native/nonce";
export const KAKAO_NATIVE_VERIFY_API = "/api/hiq/social/kakao/native";

/** nonce 쿠키의 이름 · 실리는 경로 · 수명(10분 — 카카오톡에 다녀오고, 연결이면 PIN 까지 넣을 시간). */
export const KAKAO_NONCE_COOKIE = "hiq_kakao_nonce";
export const KAKAO_NONCE_COOKIE_PATH = KAKAO_NATIVE_VERIFY_API;
export const KAKAO_NONCE_TTL_SEC = 10 * 60;

/** ID 토큰의 발급자와 공개 키 목록(카카오 OIDC 문서의 값). */
export const KAKAO_ID_TOKEN_ISSUER = "https://kauth.kakao.com";
export const KAKAO_JWKS_URL = "https://kauth.kakao.com/.well-known/jwks.json";

/** 난수 32바이트를 base64url 로 적은 길이(패딩 없음). */
export const KAKAO_NONCE_LENGTH = 43;
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/;

/** nonce 꼴인가 — 서버는 이 검사를 통과한 값만 쿠키와 견주고, 화면은 통과한 값만 플러그인에 넘긴다. */
export function isKakaoNonce(raw: unknown): raw is string {
    return typeof raw === "string" && NONCE_RE.test(raw);
}

/** ID 토큰은 1KB 안팎이다. 터무니없이 긴 값은 검증기에 넣지도 않는다. */
export const KAKAO_ID_TOKEN_MAX = 4096;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** 서명된 JWT 꼴(점 둘로 나뉜 base64url 세 토막)인가 — 내용은 보지 않는다. 진짜인지는 서버의 서명 검증이 정한다. */
export function looksLikeKakaoIdToken(raw: unknown): raw is string {
    return typeof raw === "string" && raw.length <= KAKAO_ID_TOKEN_MAX && JWT_RE.test(raw);
}

/** 플러그인이 '사용자가 취소했다'고 거절한 것인가 — Capacitor 는 call.reject 의 code 를 오류 객체의 code 에 싣는다. */
export function isKakaoNativeCanceled(err: unknown): boolean {
    return !!err && typeof err === "object" && (err as { code?: unknown }).code === KAKAO_NATIVE_CANCELED;
}

/** POST …/native/nonce 의 답. */
export type KakaoNonceIssue = { nonce: string; expiresInSec: number };

/** POST …/native 의 본문. link 일 때만 pin 을 같이 보낸다. */
export type KakaoNativeVerifyBody = { idToken: string; nonce: string; mode?: "login" | "link"; pin?: string };
