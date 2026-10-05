/**
 * 카카오 로그인(웹 전용)의 화면 쪽 일 — SDK 를 필요할 때만 싣고, 카카오로 보내기 전에 '다녀오는 중' 꾸러미를 남긴다.
 * (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
 *
 * 규칙(허용 원본·Redirect URI·state 검사·꾸러미 모양)은 shared/kakaoLogin.ts 에 있고 서버와 같이 쓴다.
 * 여기에는 브라우저에서만 되는 것만 둔다. 키는 환경변수 이름(VITE_KAKAO_JS_KEY)으로만 부른다 — 값을 적지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/nativeBridge";
import {
    KAKAO_PENDING_KEY, KAKAO_SDK_CROSSORIGIN, KAKAO_SDK_INTEGRITY, KAKAO_SDK_URL,
    isAllowedKakaoOrigin, kakaoRedirectUri, makeKakaoPending, newKakaoState, parseKakaoPending,
    type KakaoMode, type KakaoPending,
} from "@shared/kakaoLogin";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
// 여는 스위치(2026-10-06 오너: "앱 빌드해서 승인받고 그때 카카오 오픈") — 키가 있어도 이 값이 "1" 이 아니면 단추가 어디에도 안 뜬다.
// 서버의 KAKAO_LOGIN_OPEN 과 짝이다(server/lib/kakaoAuth kakaoOpen). 열 때는 Vercel 에 둘 다 1 로 넣고 다시 배포한다.
const KAKAO_OPEN = (import.meta.env.VITE_KAKAO_LOGIN_OPEN as string | undefined) === "1";

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
 * 카카오 단추를 보여도 되는가.
 *  - 키가 없으면(로컬·시험·미배포) 꺼진다 — 단추가 안 보일 뿐 아무것도 깨지지 않는다.
 *  - 스토어 앱 안에서는 숨긴다: 앱의 웹뷰는 rankue.co.kr 밖으로 못 넘어가게 바이너리에 고정돼 있어(capacitor.config.ts allowNavigation)
 *    카카오로 넘어가면 바깥 브라우저가 열리고 로그인이 앱으로 돌아오지 않는다.
 *  - 카카오에 등록된 주소(운영 www)에서만: 미리보기 배포 주소에서는 카카오가 Redirect URI 불일치로 막고
 *    서버도 400 으로 거절한다. 못 끝낼 길은 처음부터 열지 않는다.
 *    개발용 localhost 는 개발 서버(vite dev — import.meta.env.DEV)에서만 연다: 운영 빌드를 localhost 에서 띄워도 단추가 안 뜨고,
 *    서버도 개발일 때만 localhost Redirect URI 를 받는다(server/lib/kakaoAuth kakaoLocalAllowed).
 */
/**
 * 카카오 로그인이 **열려 있는가**(스위치 + 키) — 이 기기에서 단추를 누를 수 있는지(kakaoLoginAvailable)와 다르다.
 * 앱 안처럼 단추는 못 쓰지만 "카카오는 웹에서" 같은 안내를 보여 줄 자리에서 쓴다. 닫혀 있는 동안에는 카카오라는 말이 어디에도 나오면 안 된다.
 */
export function kakaoLoginOpen(): boolean {
    return KAKAO_OPEN && !!KAKAO_JS_KEY;
}

export function kakaoLoginAvailable(): boolean {
    if (!KAKAO_OPEN) return false;
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
