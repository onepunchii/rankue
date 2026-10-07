/**
 * 매장 QR 로 온 기기의 '가입 매장' 표시 — 규칙은 shared/joinStore.ts 에 있고, 여기는 기기 저장소를 읽고 쓰는 일만 한다.
 * 2026-10-07 오너: "QR 은 … 유저가 가입하면 해당 매장 고객으로 인식되는 부분".
 *
 *  rememberJoinStore(slug, code)  매장 QR 주소(/store/<slug>)로 들어왔을 때 남긴다
 *  joinStoreSlug()                가입 요청에 실어 보낼 값(없으면 undefined) — 구글·애플 · 카카오(웹·앱) · 전화번호 가입이 쓴다
 *  joinStoreFor(code)             이 매장 페이지가 '이 매장 회원으로 시작하기'를 띄워도 되는가
 *  clearJoinStore()               로그인이 끝나면 지운다(queryClient.refreshAfterLogin)
 * 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 아무 일도 없다 — 예전처럼 기본 매장으로 가입된다.
 */
import { JOIN_STORE_KEY, packJoinStore, readJoinStore, type JoinStore } from "@shared/joinStore";

function read(): JoinStore | null {
    try {
        return readJoinStore(window.localStorage.getItem(JOIN_STORE_KEY), Date.now());
    } catch {
        return null;
    }
}

export function rememberJoinStore(slug: string, code?: string | null): void {
    try {
        const packed = packJoinStore(slug, code ?? null, Date.now());
        if (packed) window.localStorage.setItem(JOIN_STORE_KEY, packed);
    } catch { /* 저장소를 못 쓰는 환경 */ }
}

export function joinStoreSlug(): string | undefined {
    return read()?.slug;
}

export function joinStoreFor(code: string | null | undefined): boolean {
    const j = read();
    return !!j && !!code && j.code === code;
}

export function clearJoinStore(): void {
    try {
        window.localStorage.removeItem(JOIN_STORE_KEY);
    } catch { /* 저장소를 못 쓰는 환경 */ }
}
