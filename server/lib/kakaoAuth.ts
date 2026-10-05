/**
 * 카카오 로그인 — 인가 코드를 서버에서 신원으로 바꾼다.
 * (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
 *
 * 구글·애플(socialAuth.ts)은 화면이 받은 id_token 을 JWKS 로 검증하지만, 카카오는 화면이 **인가 코드**만 받아 온다.
 * 서버가 그 코드를 REST API 로 토큰과 바꾸고(client_secret 은 서버만 안다), 그 토큰으로 회원번호를 한 번 읽는다.
 *
 *  - 카카오 토큰은 **저장하지 않는다** — 회원번호를 읽는 데 한 번 쓰고 버린다. 응답·로그에도 싣지 않는다.
 *  - redirectUri 는 화면이 인가 때 쓴 값을 그대로 다시 보내야 한다(글자 하나라도 다르면 KOE006) — 허용 목록 검사가 유일한 방어다.
 *    운영 서버는 운영 원본만 받는다. 개발용 localhost 는 `npm run dev`(NODE_ENV=development, Vercel 밖)에서만 — kakaoLocalAllowed.
 *  - 카카오가 준 오류 본문(error·error_code·error_description)은 **서버 로그에만** 남기고, 부른 쪽에는 종류만 돌려준다.
 *    KOE320 = 인가 코드 만료·재사용, KOE006 = redirect 불일치, KOE010 = client_secret 불일치.
 *  - 키: KAKAO_LOGIN_REST_KEY · KAKAO_LOGIN_CLIENT_SECRET (없으면 not-configured — 기능이 꺼진다).
 *  - 새 패키지 없이 fetch 만 쓴다(서버리스 규칙).
 */
import type { SocialIdentity } from "./socialAuth.js";
import { isAllowedKakaoRedirect, cleanKakaoNickname } from "../../shared/kakaoLogin.js";

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_URL = "https://kapi.kakao.com/v2/user/me";
const FORM_TYPE = "application/x-www-form-urlencoded;charset=utf-8";

/**
 * 카카오에 쓰는 시간의 상한 — 토큰 요청과 사용자 조회 **둘을 합쳐서** 6초다(2026-10-05 검토).
 * 예전에는 호출마다 6초라 카카오가 느린 날 12초 가까이 갈 수 있었고, 뒤에 DB 왕복이 붙으면 서버리스 함수 제한에 걸려
 * 플랫폼이 낸 오류 원문이 화면에 나왔다(이 저장소는 그 제한을 10초로 보고 다른 곳도 6~7초만 쓴다 — services/naverLocal).
 * 두 번째 호출은 남은 시간만 쓰고, 남은 시간이 거의 없으면 부르지 않고 timeout 으로 끝낸다.
 */
export const KAKAO_TIMEOUT_MS = 6000;
/** 남은 시간이 이보다 적으면 사용자 조회를 시작하지 않는다 — 어차피 못 끝낸다. */
const KAKAO_MIN_CALL_MS = 250;
/** 인가 코드는 80자 남짓이다. 터무니없이 긴 값은 카카오에 보내지도 않는다. */
const CODE_MAX = 512;

export type KakaoFailReason =
    | "not-configured"   // 서버에 키가 없다
    | "bad-redirect"     // 허용 목록 밖의 redirectUri
    | "bad-code"         // code 가 없거나 꼴이 이상하다
    | "token-failed"     // 카카오가 토큰을 주지 않았다(코드 만료·재사용, redirect·secret 불일치 …)
    | "user-failed"      // 토큰은 받았는데 회원번호를 읽지 못했다
    | "timeout"          // 카카오가 6초 안에 답하지 않았다
    | "network"          // 카카오에 닿지 못했다
    | "upstream";        // 카카오가 5xx 로 답했다(카카오 쪽 장애)

/**
 * 보낸 쪽 잘못으로 볼 실패인가 — 라우트가 시도 횟수 제한(registerFailure)에 셀지 정할 때 쓴다.
 * 카카오가 느리거나 죽은 것(timeout·network·upstream)까지 세면 카카오 장애 때 멀쩡한 사람들이 15분씩 잠긴다.
 */
export function kakaoRejected(reason: KakaoFailReason): boolean {
    return reason === "token-failed" || reason === "user-failed";
}

export type KakaoExchange =
    | { ok: true; identity: SocialIdentity }
    | { ok: false; reason: KakaoFailReason };

function readKeys(): { restKey: string; secret: string } | null {
    const restKey = (process.env.KAKAO_LOGIN_REST_KEY ?? "").trim();
    const secret = (process.env.KAKAO_LOGIN_CLIENT_SECRET ?? "").trim();
    return restKey && secret ? { restKey, secret } : null;
}

/**
 * 카카오 로그인을 **열었는가**(2026-10-06 오너 결정: "앱 빌드해서 승인받고 그때 카카오 오픈") — 키와 별개의 스위치.
 * 지금 스토어 앱(1.2)은 웹뷰가 카카오로 못 넘어가서 앱 안에서는 카카오 로그인이 안 된다. 웹에만 먼저 열면 카카오로 가입한 사람이
 * 앱에서 자기 계정에 들어갈 길이 없다 — 그래서 앱 안 카카오 로그인이 들어간 새 빌드가 승인되는 날 웹·앱을 같이 연다.
 * 여는 법: Vercel 운영 환경에 KAKAO_LOGIN_OPEN=1 과 VITE_KAKAO_LOGIN_OPEN=1(화면 빌드용) 을 넣고 다시 배포한다. 키는 이미 들어 있다.
 */
export function kakaoOpen(): boolean {
    return (process.env.KAKAO_LOGIN_OPEN ?? "").trim() === "1";
}

/** 카카오 로그인을 받을 수 있는가 — 스위치가 켜져 있고 서버에 키가 둘 다 있다. 아니면 두 API 는 503 을 준다. */
export function kakaoConfigured(): boolean {
    return kakaoOpen() && readKeys() !== null;
}

/**
 * 개발용 localhost Redirect URI 를 받아도 되는 서버인가 — **개발일 때만** 참이다(닫힌 쪽이 기본).
 * "운영이면 거절"로 쓰면 NODE_ENV·VERCEL 이 둘 다 없는 환경에서 열린 채 남는다. `npm run dev` 는 NODE_ENV=development 를 명시한다.
 */
export function kakaoLocalAllowed(): boolean {
    return process.env.NODE_ENV === "development" && !process.env.VERCEL;
}

/** 이 서버가 받아 줄 Redirect URI 인가 — 라우트와 교환이 모두 이 함수 하나로 본다(shared 의 규칙 + 위의 개발 판단). */
export function kakaoRedirectAllowed(uri: unknown): boolean {
    return isAllowedKakaoRedirect(uri, kakaoLocalAllowed());
}

/** 로그에 남길 글자 — 비밀 값·코드·토큰이 섞여 있으면 가리고 200자로 자른다(KOE320 설명에는 code 가 그대로 실려 온다). */
function scrub(v: unknown, hide: readonly string[]): string | null {
    if (typeof v !== "string" && typeof v !== "number") return null;
    let s = String(v);
    for (const h of hide) if (h) s = s.split(h).join("[가림]");
    return s.slice(0, 200);
}

type Called = { status: number; body: any } | "timeout" | "network";

/** 시간 제한(timeoutMs)을 건 JSON 호출. 본문을 다 읽을 때까지가 제한 시간 안이다. JSON 이 아니면 body 는 null. */
async function callJson(url: string, init: RequestInit, timeoutMs: number): Promise<Called> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        const text = await res.text();
        let body: any = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        return { status: res.status, body };
    } catch {
        return ctrl.signal.aborted ? "timeout" : "network";
    } finally {
        clearTimeout(timer);
    }
}

/** 카카오 회원번호 — 숫자로 온다. 정밀도를 잃을 만큼 큰 수는 받지 않는다(다른 사람과 같은 번호로 뭉개지면 계정이 섞인다). */
function kakaoId(raw: unknown): string | null {
    if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null;
    if (typeof raw === "string") return /^[1-9]\d{0,19}$/.test(raw) ? raw : null;
    return null;
}

/**
 * 인가 코드 → 신원({ sub: 회원번호, name: 닉네임 | null }).
 * redirectUri 는 화면이 인가 때 쓴 값 그대로. 허용 목록 밖이면 카카오를 부르지도 않는다.
 */
export async function exchangeKakaoCode(code: unknown, redirectUri: unknown): Promise<KakaoExchange> {
    const keys = readKeys();
    if (!keys) {
        console.warn("[kakao] KAKAO_LOGIN_REST_KEY·KAKAO_LOGIN_CLIENT_SECRET 미설정 — 카카오 로그인 불가");
        return { ok: false, reason: "not-configured" };
    }
    if (typeof redirectUri !== "string" || !kakaoRedirectAllowed(redirectUri)) return { ok: false, reason: "bad-redirect" };
    if (typeof code !== "string" || !code || code.length > CODE_MAX) return { ok: false, reason: "bad-code" };

    // 로그에서 가릴 값 — 아래 어디에서도 이 값들을 그대로 찍지 않는다
    const hide = [code, keys.secret, keys.restKey];
    // 두 호출이 나눠 쓰는 마감 시각(합쳐서 KAKAO_TIMEOUT_MS)
    const deadline = Date.now() + KAKAO_TIMEOUT_MS;

    // 1) 코드 → 토큰
    const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: keys.restKey,
        client_secret: keys.secret,
        redirect_uri: redirectUri,
        code,
    });
    const token = await callJson(TOKEN_URL, { method: "POST", headers: { "Content-Type": FORM_TYPE }, body: form.toString() }, KAKAO_TIMEOUT_MS);
    if (typeof token === "string") {
        console.warn(`[kakao] 토큰 요청 ${token === "timeout" ? "시간 초과" : "연결 실패"}`);
        return { ok: false, reason: token };
    }
    const accessToken: unknown = token.body?.access_token;
    if (token.status !== 200 || typeof accessToken !== "string" || !accessToken) {
        console.warn("[kakao] 토큰 교환 실패:", JSON.stringify({
            status: token.status,
            error: scrub(token.body?.error, hide),
            error_code: scrub(token.body?.error_code, hide),
            error_description: scrub(token.body?.error_description, hide),
            redirect_uri: redirectUri, // 비밀이 아니다(허용 목록을 통과한 우리 주소) — KOE006 진단용
        }));
        return { ok: false, reason: token.status >= 500 ? "upstream" : "token-failed" };
    }

    // 2) 토큰 → 회원번호·닉네임. 토큰은 이 호출에만 쓰고 버린다. 토큰 요청이 쓰고 남은 시간만 쓴다.
    const left = deadline - Date.now();
    if (left < KAKAO_MIN_CALL_MS) {
        console.warn("[kakao] 사용자 조회 시간 초과(토큰 요청이 시간을 다 썼다)");
        return { ok: false, reason: "timeout" };
    }
    const me = await callJson(USER_URL, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": FORM_TYPE } }, Math.min(KAKAO_TIMEOUT_MS, left));
    if (typeof me === "string") {
        console.warn(`[kakao] 사용자 조회 ${me === "timeout" ? "시간 초과" : "연결 실패"}`);
        return { ok: false, reason: me };
    }
    const sub = me.status === 200 ? kakaoId(me.body?.id) : null;
    if (!sub) {
        const hideMore = [...hide, accessToken];
        console.warn("[kakao] 사용자 조회 실패:", JSON.stringify({
            status: me.status,
            code: scrub(me.body?.code, hideMore),
            msg: scrub(me.body?.msg, hideMore),
            hasId: me.body?.id !== undefined && me.body?.id !== null,
        }));
        return { ok: false, reason: me.status >= 500 ? "upstream" : "user-failed" };
    }

    // 닉네임은 동의 항목이다 — 동의하지 않았으면 없다(null). 이메일은 받지 않는다.
    const name = cleanKakaoNickname(me.body?.kakao_account?.profile?.nickname) ?? cleanKakaoNickname(me.body?.properties?.nickname);
    return { ok: true, identity: { sub, email: null, name } };
}
