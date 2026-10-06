/**
 * 카카오 로그인의 화면 쪽 일.
 * (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
 *
 * 길이 둘이다.
 *  - 웹: SDK 를 필요할 때만 싣고, 카카오로 보내기 전에 '다녀오는 중' 꾸러미를 남긴다(전체 화면 이동 → /auth/kakao).
 *    규칙(허용 원본·Redirect URI·state 검사·꾸러미 모양)은 shared/kakaoLogin.ts 에 있고 서버와 같이 쓴다.
 *  - 앱 안(2026-10-06 — 새 바이너리 1.3~): 네이티브 플러그인 "RankueKakao" 가 카카오 SDK 로 ID 토큰을 받아 오고 서버가 검증한다.
 *    화면을 떠나지 않는다. 계약은 shared/kakaoNative.ts, 이 파일 맨 아래에 있다. 플러그인이 없는 바이너리(1.2 이하)에서는 어디에도 안 뜬다.
 *
 * 여기에는 브라우저에서만 되는 것만 둔다. 키는 환경변수 이름(VITE_KAKAO_JS_KEY)으로만 부른다 — 값을 적지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/lib/nativeBridge";
import { ApiError, apiRequest } from "@/lib/queryClient";
import {
    KAKAO_PENDING_KEY, KAKAO_PREVIEW_FLAG, KAKAO_SDK_CROSSORIGIN, KAKAO_SDK_INTEGRITY, KAKAO_SDK_URL, KAKAO_STATUS_API,
    isAllowedKakaoOrigin, kakaoRedirectUri, makeKakaoPending, newKakaoState, parseKakaoPending,
    type KakaoMode, type KakaoPending,
} from "@shared/kakaoLogin";
import {
    KAKAO_NATIVE_NONCE_API, KAKAO_NATIVE_PLUGIN, KAKAO_NATIVE_VERIFY_API,
    isKakaoNativeCanceled, isKakaoNonce, looksLikeKakaoIdToken, type RankueKakaoPlugin,
} from "@shared/kakaoNative";
import { nativeSupports } from "@shared/nativeCaps";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
// 여는 스위치(2026-10-06 오너: "앱 빌드해서 승인받고 그때 카카오 오픈") — 키가 있어도 이 값이 "1" 이 아니면 단추가 어디에도 안 뜬다.
// 서버의 KAKAO_LOGIN_OPEN 과 짝이다(server/lib/kakaoAuth kakaoOpen). 열 때는 Vercel 에 둘 다 1 로 넣고 다시 배포한다.
// (예외는 미리보기 하나다 — 열쇠를 넣은 기기에서만 이 값과 무관하게 열린다. 바로 아래)
const KAKAO_OPEN = (import.meta.env.VITE_KAKAO_LOGIN_OPEN as string | undefined) === "1";

// ─────────────────────────────────────────────────────────────────────────────
// 미리보기(2026-10-06) — 공개 스위치(KAKAO_OPEN)는 꺼 둔 채, **열쇠를 넣은 기기**에서만 카카오 단추가 보인다.
// 새 앱 빌드(1.3)를 스토어 승인 전에 실기기로 시험하려는 것이다. 계약은 shared/kakaoLogin.ts, 서버는 server/lib/kakaoAuth.
//  - 깃발: 기기 저장소(localStorage)의 한 칸. 미리보기 페이지(/kakao-preview)가 서버에서 열쇠를 확인받은 뒤에만 세운다.
//    서버가 심은 쿠키는 httpOnly 라 화면이 못 읽는다 — 깃발은 그 쿠키가 있다는 것을 화면이 기억하는 표시일 뿐이다.
//  - **깃발이 없는 기기는 예전과 한 글자도 다르지 않다**: 아래 kakaoSwitchOn 이 KAKAO_OPEN 과 같은 값이고, 서버에 묻는 요청도 없다.
//  - 깃발은 단추를 보여 줄지만 정한다. 손으로 세워도 서버의 쿠키가 없으면 카카오 길은 전부 닫힌 답(503)을 준다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 기기에 미리보기 깃발이 서 있는가. 저장소를 못 읽는 환경(사생활 보호 모드 등)에서는 없는 것으로 친다. */
export function kakaoPreviewOn(): boolean {
    try {
        return window.localStorage.getItem(KAKAO_PREVIEW_FLAG) === "1";
    } catch {
        return false;
    }
}

// 깃발을 세우거나 내릴 때마다 오른다 — 앱이 뜰 때 보낸 확인(syncKakaoPreview)의 답이 그 뒤에 새로 세운 깃발을 지우지 못하게 한다.
let previewEpoch = 0;

/** 깃발을 세우거나 내린다 — 세우는 것은 미리보기 페이지가 서버의 확인을 받은 뒤에만 한다. */
export function setKakaoPreview(on: boolean): void {
    previewEpoch += 1;
    try {
        if (on) window.localStorage.setItem(KAKAO_PREVIEW_FLAG, "1");
        else window.localStorage.removeItem(KAKAO_PREVIEW_FLAG);
    } catch { /* 저장소를 못 쓰는 환경 — 깃발 없이 예전처럼 동작한다 */ }
}

/**
 * 카카오의 스위치가 켜져 있는가 — 공개 스위치(빌드 때 박힌 값)가 켜졌거나, 이 기기에 미리보기 깃발이 서 있다.
 * 아래 세 판정(kakaoLoginOpen · kakaoNativeAvailable · kakaoLoginAvailable)이 전부 이 함수 하나로 스위치를 본다.
 */
function kakaoSwitchOn(): boolean {
    return KAKAO_OPEN || kakaoPreviewOn();
}

/**
 * 깃발이 아직 유효한지 서버에 한 번 묻는다 — **깃발이 선 기기만**(없으면 요청을 보내지 않는다).
 * 서버가 닫혀 있다고 답하면(열쇠를 바꿨다 · 쿠키가 만료됐다 · 공개 스위치도 꺼져 있다) 조용히 깃발을 내린다.
 * 못 물어봤으면(오프라인 · 서버 오류 · 서비스 워커가 지어낸 가짜 404) 그대로 둔다 — '닫힘'이라는 답을 받았을 때만 내린다.
 */
export async function syncKakaoPreview(): Promise<void> {
    if (!kakaoPreviewOn()) return;
    const epoch = previewEpoch;
    try {
        const status = await apiRequest(KAKAO_STATUS_API);
        if (status?.open === false && epoch === previewEpoch) setKakaoPreview(false);
    } catch { /* 못 물어봤다 — 다음에 앱이 뜰 때 다시 묻는다 */ }
}

// 앱이 뜰 때 한 번(이 파일은 가입·로그인 팝업이 늘 싣는다 — App.tsx 의 LoginSheetHost). 깃발이 없는 기기에서는 아무 일도 없다.
void syncKakaoPreview();

/** Kakao JavaScript SDK 2.x 에서 우리가 쓰는 것만 적는다(전체 타입을 들이지 않는다). */
type KakaoSdk = {
    init: (jsKey: string) => void;
    isInitialized: () => boolean;
    Auth: { authorize: (opts: { redirectUri: string; state?: string }) => void };
};

declare global {
    interface Window {
        Kakao?: KakaoSdk;
    }
}

/**
 * 카카오 단추를 보여도 되는가(= 이 기기에서 카카오 단추를 눌러 끝까지 갈 수 있는가).
 *  - 키가 없으면(로컬·시험·미배포) 꺼진다 — 단추가 안 보일 뿐 아무것도 깨지지 않는다.
 *  - 스토어 앱 안에서는 **네이티브 카카오 플러그인이 든 바이너리에서만** 보인다(kakaoNativeAvailable — 1.3~).
 *    앱의 웹뷰는 rankue.co.kr 밖으로 못 넘어가게 바이너리에 고정돼 있어(capacitor.config.ts allowNavigation) 웹 방식으로는
 *    카카오로 넘어가면 바깥 브라우저가 열리고 로그인이 앱으로 돌아오지 않는다 — 플러그인이 없는 앱(1.2 이하)에서는 계속 숨긴다.
 *  - 카카오에 등록된 주소(운영 www)에서만: 미리보기 배포 주소에서는 카카오가 Redirect URI 불일치로 막고
 *    서버도 400 으로 거절한다. 못 끝낼 길은 처음부터 열지 않는다.
 *    개발용 localhost 는 개발 서버(vite dev — import.meta.env.DEV)에서만 연다: 운영 빌드를 localhost 에서 띄워도 단추가 안 뜨고,
 *    서버도 개발일 때만 localhost Redirect URI 를 받는다(server/lib/kakaoAuth kakaoLocalAllowed).
 */
/**
 * 카카오 로그인이 **열려 있는가**(스위치 + 키) — 이 기기에서 단추를 누를 수 있는지(kakaoLoginAvailable)와 다르다.
 * 앱 안처럼 단추는 못 쓰지만 "카카오는 웹에서" 같은 안내를 보여 줄 자리에서 쓴다. 닫혀 있는 동안에는 카카오라는 말이 어디에도 나오면 안 된다.
 * 스위치는 kakaoSwitchOn(공개 스위치 || 미리보기 깃발)이다 — 깃발이 없는 기기에서는 공개 스위치와 같은 값이다.
 */
export function kakaoLoginOpen(): boolean {
    return kakaoSwitchOn() && !!KAKAO_JS_KEY;
}

/**
 * 앱 안에서 카카오 단추를 쓸 수 있는가(2026-10-06) — **여는 스위치가 켜져 있고, 이 바이너리에 플러그인 "RankueKakao" 가 있을 때만.**
 * 웹에서는 늘 false 다(nativeSupports 가 네이티브 여부부터 본다). 지금 스토어 앱(1.2)에는 플러그인이 없어 스위치를 켜도 false —
 * 없는 플러그인을 부르는 단추가 뜨지 않는다. 웹용 JS 키는 이 길에 쓰이지 않는다.
 */
export function kakaoNativeAvailable(): boolean {
    return kakaoSwitchOn() && nativeSupports("nativeKakaoLogin");
}

export function kakaoLoginAvailable(): boolean {
    if (!kakaoSwitchOn()) return false;
    // 앱 안: 네이티브 플러그인이 있으면 그 길로 된다. 없으면 아래에서 예전처럼 숨는다
    if (kakaoNativeAvailable()) return true;
    if (!KAKAO_JS_KEY || isNativeApp()) return false;
    try {
        return isAllowedKakaoOrigin(window.location.origin, import.meta.env.DEV);
    } catch {
        return false;
    }
}

const SCRIPT_ID = "kakao-js-sdk";
/** 스크립트가 받아지지도 실패하지도 않고 매달릴 때 — 단추가 '여는 중'으로 굳지 않게 끊는다. */
const SDK_LOAD_TIMEOUT_MS = 10_000;

let readySdk: KakaoSdk | null = null;
let sdkLoading: Promise<KakaoSdk> | null = null;

/**
 * SDK 를 싣고 초기화한다. 스크립트 태그는 **한 번만** 넣는다(index.html 에는 없다 — 로그인·설정 화면이 필요할 때만 부른다).
 * 주소·integrity·crossorigin 은 shared 상수 그대로: 내용이 한 글자라도 다르면 브라우저가 실행하지 않는다.
 * 실패는 기억하지 않는다 — 다음에 누르면 다시 받는다.
 */
export function loadKakaoSdk(): Promise<KakaoSdk> {
    if (readySdk) return Promise.resolve(readySdk);
    if (sdkLoading) return sdkLoading;
    // 앱 안에서는 웹 SDK 를 싣지 않는다 — 앱의 카카오 로그인은 네이티브 플러그인이 한다(아래 kakaoNativeToken).
    // 단추가 보이는 화면이 미리 싣기(useKakaoStart 의 shown)를 걸어도 여기서 끝난다.
    if (isNativeApp()) return Promise.reject(new Error("kakao: web sdk is not used in the app"));
    const jsKey = KAKAO_JS_KEY;
    if (!jsKey) return Promise.reject(new Error("kakao: not configured"));

    const loading = new Promise<KakaoSdk>((resolve, reject) => {
        const ready = () => {
            const sdk = window.Kakao;
            if (!sdk) { reject(new Error("kakao: sdk missing")); return; }
            try {
                // 이미 초기화돼 있으면 건너뛴다(두 번 부르면 SDK 가 오류를 던진다)
                if (!sdk.isInitialized()) sdk.init(jsKey);
                readySdk = sdk;
                resolve(sdk);
            } catch (err) {
                reject(err instanceof Error ? err : new Error("kakao: init failed"));
            }
        };
        if (window.Kakao) { ready(); return; }

        // 앞선 시도가 남긴 태그는 치우고 새로 넣는다(실패한 태그는 다시 받지 않는다)
        document.getElementById(SCRIPT_ID)?.remove();
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.src = KAKAO_SDK_URL;
        s.integrity = KAKAO_SDK_INTEGRITY;
        s.crossOrigin = KAKAO_SDK_CROSSORIGIN;
        s.async = true;
        const timer = window.setTimeout(() => { s.remove(); reject(new Error("kakao: sdk load timeout")); }, SDK_LOAD_TIMEOUT_MS);
        s.onload = () => { window.clearTimeout(timer); ready(); };
        s.onerror = () => { window.clearTimeout(timer); s.remove(); reject(new Error("kakao: sdk load failed")); };
        document.head.appendChild(s);
    });
    sdkLoading = loading.catch((err) => { sdkLoading = null; throw err; });
    return sdkLoading;
}

// 꾸러미를 두는 곳. 기본은 sessionStorage(이 탭 것)다. 그런데 휴대폰에서 카카오톡 앱을 거쳐 돌아오면 브라우저가 **새 탭**으로
// 열 수 있고, 새 탭에는 sessionStorage 가 없다(shared/kakaoLogin.ts 의 주의). 그래서 같은 값을 localStorage 에도 남기고,
// 이 탭 것이 없을 때만 그걸 읽는다. 둘 다 우리 원본만 읽고 쓸 수 있어 state 검사의 세기는 같다
// (추측 못 하는 난수 · 10분 · 한 번 쓰면 둘 다 지운다). 앞이 먼저다 — 탭 두 개에서 동시에 시작해도 각자 제 것을 쓴다.
const PENDING_STORES: (() => Storage)[] = [() => window.sessionStorage, () => window.localStorage];

function savePending(pending: KakaoPending): boolean {
    const raw = JSON.stringify(pending);
    let saved = false;
    for (const pick of PENDING_STORES) {
        try {
            pick().setItem(KAKAO_PENDING_KEY, raw);
            saved = true;
        } catch { /* 저장소를 못 쓰는 환경(사생활 보호 모드·용량 초과) */ }
    }
    return saved;
}

/**
 * 카카오에서 돌아온 화면이 꾸러미를 꺼낸다 — **읽고 바로 지운다**(한 번만 쓴다). 없거나 모양이 다르면 null.
 * 돌아온 주소의 state 와 맞는지는 꺼낸 쪽이 shared 의 checkKakaoReturn 으로 본다.
 */
export function takeKakaoPending(): KakaoPending | null {
    let found: KakaoPending | null = null;
    for (const pick of PENDING_STORES) {
        try {
            const store = pick();
            const raw = store.getItem(KAKAO_PENDING_KEY);
            store.removeItem(KAKAO_PENDING_KEY);
            found = found ?? parseKakaoPending(raw);
        } catch { /* 저장소를 못 쓰는 환경 */ }
    }
    return found;
}

/**
 * 카카오로 보낸다(전체 화면 이동 — 팝업을 쓰지 않아 카카오톡·네이버 앱 안 브라우저에서도 같은 길이다).
 * 보내기 직전에 난수 state(crypto.getRandomValues)와 모드·돌아갈 주소를 꾸러미로 남긴다. 돌아갈 주소는 꾸러미를 만들 때
 * safeReturnPath 로 걸러진다(우리 사이트 안의 경로만).
 *
 * SDK 가 이미 떠 있으면 **await 없이** 바로 authorize 까지 간다 — 카카오톡 앱 열기(간편로그인)는 사용자가 누른 그 순간 안에서
 * 불러야 브라우저가 막지 않는다. 그래서 단추를 그리는 화면은 그릴 때 SDK 를 미리 실어 둔다(아래 useKakaoStart 의 shown).
 */
export async function startKakao(opts: { mode: KakaoMode; redirect?: string | null }): Promise<void> {
    const sdk = readySdk ?? await loadKakaoSdk();
    const pending = makeKakaoPending(opts.mode, opts.redirect ?? null, Date.now(), newKakaoState());
    // 꾸러미를 못 남기면 돌아와서 확인할 길이 없다 — 카카오까지 갔다가 실패하느니 여기서 멈춘다
    if (!savePending(pending)) throw new Error("kakao: storage unavailable");
    sdk.Auth.authorize({ redirectUri: kakaoRedirectUri(window.location.origin), state: pending.state });
}

/**
 * 카카오 단추 하나의 상태 — 로그인 화면과 설정의 '연결'이 같이 쓴다.
 *  - shown: 단추가 지금 화면에 보이는가. 보이면 SDK 를 미리 실어 둔다 — 눌렀을 때 기다림 없이 카카오(카카오톡 앱)로 넘어가게.
 *    못 받았으면 조용히 넘어간다: 누를 때 다시 받아 보고, 그래도 안 되면 그때 알린다. 안 보이는 화면에서는 아무것도 받지 않는다.
 *  - 두 번 누름을 막는다(ref 로 — 상태는 다음 그림에야 바뀌어 연달아 누르면 샌다).
 *  - 성공하면 화면이 카카오로 넘어가므로 '여는 중'을 풀지 않는다. 대신 카카오에서 '뒤로'로 돌아와 화면이 누른 채 되살아나거나(bfcache),
 *    카카오톡 앱에서 그냥 돌아온 경우에 다시 누를 수 있게 푼다.
 *  - 실패(SDK 를 못 받음·저장소 못 씀)는 onFail 로 알린다 — 문구는 부른 화면이 정한다.
 *  - onReturn: **이 화면이 카카오로 보냈다가** 되살아났을 때(뒤로 가기의 bfcache · 다른 탭에 있다가 다시 보임) 한 번 부른다.
 *    카카오는 문서를 떠나는 로그인이라, 새 탭이나 새 문서에서 로그인·연결이 끝난 뒤 이 화면으로 돌아오면 여기는 아직
 *    '비로그인'·'미연결'로 알고 있다(2026-10-05 검토 — "로그인했는데 로그인이 안 됐다고 나온다"가 이 길로 다시 나왔다).
 *    부른 화면이 '나'를 다시 묻는다. 카카오를 누르지 않은 평소의 탭 전환에는 부르지 않는다 — 다른 로그인(구글·애플)의
 *    약관 동의 시트가 떠 있는 동안 앱을 잠깐 바꿨다 돌아와도 아무 일도 일어나지 않아야 한다.
 */
export function useKakaoStart(shown: boolean, onFail: () => void, onReturn?: () => void): { busy: boolean; start: (opts: { mode: KakaoMode; redirect?: string | null }) => void } {
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const onFailRef = useRef(onFail);
    onFailRef.current = onFail;
    const onReturnRef = useRef(onReturn);
    onReturnRef.current = onReturn;

    useEffect(() => {
        if (shown) void loadKakaoSdk().catch(() => undefined);
    }, [shown]);

    useEffect(() => {
        const release = () => {
            // 잠금이 걸려 있었다 = 이 문서가 카카오로 보냈었다. 풀면서 부른 화면에 알린다.
            const wasAway = lock.current;
            lock.current = false;
            setBusy(false);
            if (wasAway) onReturnRef.current?.();
        };
        const onVisible = () => { if (document.visibilityState === "visible") release(); };
        window.addEventListener("pageshow", release);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("pageshow", release);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    const start = useCallback((opts: { mode: KakaoMode; redirect?: string | null }) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        startKakao(opts).catch((err) => {
            console.error("[kakao] start failed:", err);
            lock.current = false;
            setBusy(false);
            onFailRef.current();
        });
    }, []);

    return { busy, start };
}

// ─────────────────────────────────────────────────────────────────────────────
// 앱 안(네이티브 SDK) — 2026-10-06. 계약 전문은 shared/kakaoNative.ts.
//   nonce 받기(서버) → RankueKakao.login({ nonce })(카카오톡 또는 카카오계정) → ID 토큰을 서버가 검증 → 쿠키.
// 화면을 떠나지 않는 로그인이다(웹처럼 /auth/kakao 로 돌아오지 않는다). 그래서 약관 동의·'나' 새로 받기·화면 옮기기는
// 부른 화면이 구글·애플과 같은 순서로 한다(components/hiq/SocialLogin · pages/hiq/settings).
// ─────────────────────────────────────────────────────────────────────────────

let nativePlugin: RankueKakaoPlugin | null = null;

/**
 * 플러그인 대리 객체 — **쓸 때** 한 번만 등록한다(패키지를 import 하지 않는다: 웹 번들에 네이티브 패키지가 끌려오지 않게).
 * 같은 이름을 두 번 등록하면 Capacitor 가 경고를 내므로 기억해 둔다.
 * ★ 이 객체를 async 함수의 반환값으로 쓰거나 await 하지 말 것: Capacitor 의 대리 객체는 모르는 속성을 전부 네이티브 메서드로
 *   만들어 주어서, Promise 가 then 을 찾는 순간 네이티브의 "then" 을 부르고 끝나지 않는다.
 */
function kakaoPlugin(): RankueKakaoPlugin {
    nativePlugin ??= registerPlugin<RankueKakaoPlugin>(KAKAO_NATIVE_PLUGIN);
    return nativePlugin;
}

/** 카카오에서 받아 온 것 — 화면 메모리에만 둔다(저장소·주소에 남기지 않는다). 서버가 한 번 쓰면 끝난다. */
export type KakaoNativeToken = { idToken: string; nonce: string };

/**
 * 서버가 **만든** 오류 문구만 꺼낸다 — 우리 서버의 오류는 전부 { success:false, message } 꼴이다.
 * 플랫폼의 시간 초과 원문·"HTTP 500" 같은 대체 글자는 문구로 믿지 않는다(pages/hiq/kakao-callback 의 serverMessageOf 와 같은 규칙).
 */
export function kakaoServerMessage(err: unknown): string | null {
    const data = err instanceof ApiError ? err.data : null;
    return data?.success === false && typeof data.message === "string" && data.message ? data.message : null;
}

/**
 * 카카오에 다녀와 ID 토큰을 받는다. 사용자가 취소했으면 **null**(조용히 끝낸다), 그 밖의 실패는 던진다.
 *  1) 서버에서 1회용 nonce 를 받는다 — 같은 값이 서명 쿠키로도 이 웹뷰에 심긴다(서버가 둘을 견준다).
 *  2) 플러그인에 nonce 를 그대로 넘긴다. 카카오톡이 있으면 카카오톡으로, 없으면 카카오계정 로그인으로 간다(플러그인이 고른다).
 *  3) 받은 직후 SDK 가 기기에 남긴 카카오 토큰을 지운다 — 우리는 카카오 API 를 쓰지 않는다. ID 토큰은 이미 손에 있다.
 * 플러그인이 없는 바이너리에서는 부르지 않는다(화면이 단추를 안 그린다) — 그래도 여기서 한 번 더 막는다.
 */
export async function kakaoNativeToken(): Promise<KakaoNativeToken | null> {
    if (!kakaoNativeAvailable()) throw new Error("kakao: native login unavailable");
    const issued = await apiRequest(KAKAO_NATIVE_NONCE_API, { method: "POST", body: {} });
    const nonce: unknown = issued?.nonce;
    if (!isKakaoNonce(nonce)) throw new Error("kakao: bad nonce");

    let idToken: unknown;
    try {
        idToken = (await kakaoPlugin().login({ nonce }))?.idToken;
    } catch (err) {
        if (isKakaoNativeCanceled(err)) return null;
        throw err;
    }
    void kakaoPlugin().logout().catch(() => undefined);
    if (!looksLikeKakaoIdToken(idToken)) throw new Error("kakao: no id token");
    return { idToken, nonce };
}

/** POST …/native(login)의 답 — /social 과 같은 모양이다. */
export type KakaoNativeSignedIn = { member?: { termsVersion?: unknown } | null; isNew?: boolean; redirectTo?: unknown };

/**
 * 앱 안 카카오 로그인 한 번: 카카오에 다녀와 서버 검증까지. 취소면 null, 성공이면 서버의 답(쿠키는 이미 심겼다).
 * **이 함수는 '나'를 새로 받지 않는다** — 부른 화면이 약관 동의를 받은 뒤 refreshAfterLogin 을 부르고 나서 화면을 옮긴다.
 */
export async function kakaoNativeLogin(): Promise<KakaoNativeSignedIn | null> {
    const token = await kakaoNativeToken();
    if (!token) return null;
    return await apiRequest(KAKAO_NATIVE_VERIFY_API, { method: "POST", body: { idToken: token.idToken, nonce: token.nonce, mode: "login" } });
}

/** 연결 요청 한 번의 결과. wrong-pin 만 같은 토큰으로 다시 보낼 수 있다(서버가 nonce 를 쓰기 전에 거절했다). */
export type KakaoNativeLinkResult =
    | { kind: "linked" }
    | { kind: "wrong-pin"; message: string | null }
    | { kind: "failed"; message: string | null };

/**
 * 내 계정에 카카오를 붙인다(설정 '연결된 로그인') — 받아 둔 ID 토큰과 로그인 PIN 을 같이 보낸다. 쿠키는 바뀌지 않는다.
 * PIN 은 이 요청에만 쓰고 어디에도 남기지 않는다. PIN 만 틀렸으면 토큰이 아직 살아 있다 — 화면이 PIN 만 다시 받는다.
 */
export async function kakaoNativeLink(token: KakaoNativeToken, pin: string): Promise<KakaoNativeLinkResult> {
    try {
        await apiRequest(KAKAO_NATIVE_VERIFY_API, { method: "POST", body: { idToken: token.idToken, nonce: token.nonce, mode: "link", pin } });
        return { kind: "linked" };
    } catch (err) {
        console.error("[kakao] native link failed:", err);
        const message = kakaoServerMessage(err);
        if (err instanceof ApiError && err.status === 401 && err.data?.code === "KAKAO_PIN_WRONG") return { kind: "wrong-pin", message };
        return { kind: "failed", message };
    }
}
