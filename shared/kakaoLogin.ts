/**
 * 카카오 로그인(웹 전용)의 공용 규칙 — 화면과 서버가 같은 값을 쓴다.
 * (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
 *
 * 흐름: 화면이 Kakao JS SDK 의 `Kakao.Auth.authorize({ redirectUri, state })` 로 카카오에 보낸다 →
 *       카카오가 `/auth/kakao?code=…&state=…` 로 돌려보낸다 → 그 화면이 서버(POST /api/hiq/social/kakao)에 code 를 넘긴다 →
 *       서버가 토큰을 받아 회원번호를 확인하고 쿠키를 준다(카카오 토큰은 저장하지 않는다).
 *
 * 여기에는 **비밀 값이 없다** — 화면 번들에 실리는 파일이다. 키는 환경변수(서버 KAKAO_LOGIN_REST_KEY·KAKAO_LOGIN_CLIENT_SECRET,
 * 화면 VITE_KAKAO_JS_KEY)로만 부른다.
 */
import { safeReturnPath } from "./promoFunnel.js";

/** 카카오가 돌려보내는 우리 화면 경로 — 카카오 개발자 콘솔에 등록한 Redirect URI 의 경로와 글자 하나까지 같아야 한다. */
export const KAKAO_REDIRECT_PATH = "/auth/kakao";

/** 카카오에 등록된 운영 원본은 이것 하나다(apex 는 서버가 www 로 넘긴다). */
export const KAKAO_PROD_ORIGIN = "https://www.rankue.co.kr";

/** SDK — 로그인 화면이 **필요할 때만** 스크립트로 넣는다(index.html 에 넣지 않는다). 버전을 올리면 integrity 도 같이 바꾼다. */
export const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";
export const KAKAO_SDK_INTEGRITY = "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy";
export const KAKAO_SDK_CROSSORIGIN = "anonymous";

/**
 * 카카오에 다녀오는 동안 sessionStorage 에 남기는 꾸러미의 키와 수명(10분).
 * 주의: sessionStorage 는 탭마다 따로다. 휴대폰에서 카카오톡 앱을 거쳐 돌아올 때 **새 탭**으로 열리면 꾸러미가 없다(no-pending).
 * 실기기(iOS 사파리·안드로이드 크롬)에서 꼭 확인할 것 — 그렇다면 저장소만 localStorage 로 바꾸면 된다(아래 규칙은 저장소를 가리지 않는다).
 */
export const KAKAO_PENDING_KEY = "rankue_kakao_pending";
export const KAKAO_PENDING_TTL_MS = 10 * 60 * 1000;

/** 닉네임 길이 상한 — 기존 소셜 로그인(POST /social)이 이름을 40자로 자르는 것과 같다. */
export const KAKAO_NICKNAME_MAX = 40;
/** 닉네임 제공에 동의하지 않은 사람의 기본 이름(카카오는 한국어 서비스라 "Player" 대신). */
export const KAKAO_DEFAULT_NAME = "랭큐회원";

// 개발용: http://localhost:<포트> 만. 127.0.0.1·https·포트 없는 꼴은 받지 않는다(카카오 콘솔에 등록하는 꼴과 맞춘다).
const LOCAL_ORIGIN_RE = /^http:\/\/localhost:[1-9][0-9]{1,4}$/;

/**
 * 카카오 로그인을 시작할 수 있는 원본인가 — 운영 원본 하나. 개발용 localhost 는 **부르는 쪽이 켰을 때만**(allowLocal).
 *
 * 기본이 닫힌 쪽이다(2026-10-05 검토): 키가 한 벌이라 로컬 시험을 하려면 같은 카카오 앱에 localhost 주소를 등록하게 되는데,
 * 운영 서버까지 localhost 를 받아 주면 그 포트를 듣는 다른 프로그램이 받은 인가 코드를 운영 서버에서 쿠키로 바꿀 수 있다.
 * 이 파일은 화면 번들에 실려 환경변수를 읽지 않는다 — 개발인지는 서버(lib/kakaoAuth kakaoLocalAllowed)와
 * 화면(client lib/kakaoLogin — vite 의 개발 서버 표시)이 각자 판단해 넘긴다.
 */
export function isAllowedKakaoOrigin(origin: unknown, allowLocal: boolean = false): boolean {
    if (typeof origin !== "string") return false;
    return origin === KAKAO_PROD_ORIGIN || (allowLocal === true && LOCAL_ORIGIN_RE.test(origin));
}

/** 이 원본의 Redirect URI. 화면은 `kakaoRedirectUri(window.location.origin)` 을 인가 요청과 서버 요청에 **같은 글자로** 쓴다. */
export function kakaoRedirectUri(origin: string): string {
    return `${String(origin).replace(/\/+$/, "")}${KAKAO_REDIRECT_PATH}`;
}

/**
 * 서버가 받아 줄 Redirect URI 인가.
 * 서버는 화면이 보낸 값을 카카오 토큰 요청에 **그대로** 다시 보내야 한다(인가 때와 다르면 KOE006) — 그래서 이 검사가 유일한 방어다.
 * URL 을 해석하지 않고 글자 그대로 본다: 쿼리·해시·끝 슬래시·사용자 정보(@)·대문자 호스트가 붙은 값은 전부 떨어진다.
 * allowLocal 을 켜지 않으면 운영 원본만 받는다(위 isAllowedKakaoOrigin) — 서버는 이 함수를 직접 부르지 말고
 * lib/kakaoAuth 의 kakaoRedirectAllowed 를 쓴다(개발인지 판단이 한 곳에 있다).
 */
export function isAllowedKakaoRedirect(uri: unknown, allowLocal: boolean = false): boolean {
    if (typeof uri !== "string" || !uri.endsWith(KAKAO_REDIRECT_PATH)) return false;
    return isAllowedKakaoOrigin(uri.slice(0, -KAKAO_REDIRECT_PATH.length), allowLocal);
}

/**
 * 들어올 길이 카카오뿐인 계정인가(GET /me 의 connections 로 본다).
 * 스토어 앱 안에는 카카오 단추가 없다 — 이런 회원에게 앱 설치를 권하면 앱에서 자기 계정으로 들어갈 길이 없어
 * 전화번호나 구글로 새 계정을 만들게 된다(계정이 둘로 갈린다). 그래서 설치 권유를 이 회원에게는 끈다.
 * 기기에 저장된 옛 /me 답에는 kakao 칸이 없으므로 `=== true` 로만 본다(없으면 예전처럼 권유한다).
 */
export function isKakaoOnlyAccount(conn: { phone?: unknown; google?: unknown; apple?: unknown; kakao?: unknown } | null | undefined): boolean {
    return !!conn && conn.kakao === true && !conn.phone && !conn.google && !conn.apple;
}

/** login = 로그인·가입, link = 로그인한 회원이 설정에서 내 계정에 카카오를 붙인다. */
export type KakaoMode = "login" | "link";

/** 카카오에 다녀오는 동안 화면이 기억하는 것. state 는 난수(CSRF), redirect 는 끝나고 돌아갈 우리 경로. */
export type KakaoPending = { state: string; mode: KakaoMode; redirect: string | null; at: number };

export type KakaoReturnFail = "no-pending" | "no-state" | "state-mismatch" | "expired";
export type KakaoReturnCheck =
    | { ok: true; mode: KakaoMode; redirect: string | null }
    | { ok: false; reason: KakaoReturnFail };

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** 추측할 수 없는 state(32자 16진수). 브라우저·Node 둘 다 전역 crypto 를 쓴다. */
export function newKakaoState(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 카카오로 보내기 직전에 만드는 꾸러미. 돌아갈 주소는 여기서 한 번 거른다(우리 사이트 안의 경로만). */
export function makeKakaoPending(mode: KakaoMode, redirect: unknown, nowMs: number, state: string = newKakaoState()): KakaoPending {
    return { state, mode, redirect: safeReturnPath(redirect), at: nowMs };
}

/**
 * sessionStorage 에서 꺼낸 글자를 꾸러미로 되돌린다. 모양이 조금이라도 다르면 null(없던 것으로 친다).
 * 돌아갈 주소는 꺼낼 때도 다시 거른다 — 저장소의 값은 믿지 않는다(열린 리다이렉트 방지).
 */
export function parseKakaoPending(raw: unknown): KakaoPending | null {
    if (typeof raw !== "string" || !raw) return null;
    let v: unknown;
    try { v = JSON.parse(raw); } catch { return null; }
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.state !== "string" || !STATE_RE.test(o.state)) return null;
    if (o.mode !== "login" && o.mode !== "link") return null;
    if (typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
    return { state: o.state, mode: o.mode, redirect: safeReturnPath(o.redirect), at: o.at };
}

/**
 * 카카오에서 돌아왔을 때 서버를 불러도 되는가.
 * 내가 보낸 state 와 주소의 state 가 같고, 보낸 지 10분 안일 때만 ok. 화면은 결과와 무관하게 꾸러미를 **지운다**(한 번만 쓴다).
 * 시계가 뒤로 간 경우(at 이 지금보다 1분 넘게 미래)도 만료로 본다.
 */
export function checkKakaoReturn(pending: KakaoPending | null | undefined, stateFromUrl: unknown, nowMs: number): KakaoReturnCheck {
    if (!pending) return { ok: false, reason: "no-pending" };
    if (typeof stateFromUrl !== "string" || !stateFromUrl) return { ok: false, reason: "no-state" };
    if (pending.state !== stateFromUrl) return { ok: false, reason: "state-mismatch" };
    const age = nowMs - pending.at;
    if (!(age >= -60_000 && age <= KAKAO_PENDING_TTL_MS)) return { ok: false, reason: "expired" };
    return { ok: true, mode: pending.mode, redirect: safeReturnPath(pending.redirect) };
}

/**
 * 이름에서 지울 글자인가(코드포인트) — 제어 문자·줄바꿈·방향 뒤집기(RLO 등)·폭 없는 공백.
 * 이름에 섞이면 목록이 깨지거나 남의 이름처럼 보이게 만들 수 있다.
 * 폭 없는 결합자(0x200D)는 지우지 않는다: 가족·직업 이모지가 그걸로 묶여 있다.
 * 정규식에 글자를 직접 적지 않고 번호로 본다 — 보이지 않는 글자가 소스에 박히면 고칠 때 아무도 못 본다.
 */
function isNicknameJunk(cp: number): boolean {
    return cp <= 0x1f                         // C0 제어 문자(줄바꿈·탭 포함 — 아래에서 공백으로 바뀐다)
        || (cp >= 0x7f && cp <= 0x9f)         // DEL·C1 제어 문자
        || cp === 0x200b                      // 폭 없는 공백
        || cp === 0x2028 || cp === 0x2029     // 줄·문단 구분자
        || (cp >= 0x202a && cp <= 0x202e)     // 방향 끼워 넣기·뒤집기
        || (cp >= 0x2066 && cp <= 0x2069)     // 방향 격리
        || cp === 0xfeff;                     // BOM
}

/**
 * 카카오 닉네임 정리 — 공백을 한 칸으로 모으고, 앞뒤를 자르고, 40자(코드포인트 기준 — 이모지를 반으로 자르지 않는다)로 줄인다.
 * 닉네임 제공에 동의하지 않았거나(값 없음) 정리하고 나니 비면 null.
 */
export function cleanKakaoNickname(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const flat = Array.from(raw, (ch) => (isNicknameJunk(ch.codePointAt(0)!) ? " " : ch)).join("").replace(/\s+/g, " ").trim();
    if (!flat) return null;
    const cut = Array.from(flat).slice(0, KAKAO_NICKNAME_MAX).join("").trim();
    return cut || null;
}
