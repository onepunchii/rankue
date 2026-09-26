/**
 * 렌더러 선택(기기별로 저장). localStorage "rankue.sim.renderer" = "three" | "canvas".
 *
 *  - 저장값이 없으면 WebGL2 를 탐색해 되면 three, 아니면 canvas. 저장값이 three 여도 WebGL2 가 안 되면 canvas.
 *  - 컨텍스트 손실이 CONTEXT_LOSS_LIMIT 회 쌓이면 페이지가 세션 동안 canvas 로 바꾸고 "canvas" 를 저장한다
 *    (SimulatorPage). 사용자 토글은 아직 없다 — 설정 화면이 생기면 writeRendererPref 를 그대로 쓴다.
 *  - 순수 함수는 저장소·문서를 인자로 받아 테스트한다. selectRendererKind() 는 브라우저 전역을 쓰는 편의 함수.
 */

import type { RendererView } from "./Renderer";

export type RendererKind = "three" | "canvas";

export const RENDERER_PREF_KEY = "rankue.sim.renderer";
/** 카메라 뷰 저장 키("top" | "player", 기본 top). ThreeRenderer 에서만 뜻이 있고 HUD "3D 보기" 토글이 쓴다. */
export const VIEW_PREF_KEY = "rankue.sim.view";
/** 이 횟수만큼 WebGL 컨텍스트를 잃으면 Canvas2D 로 내려간다. */
export const CONTEXT_LOSS_LIMIT = 2;
/**
 * 컨텍스트 손실로 내려간 canvas 선택은 이 기간만 유효하다(2026-09-26 검토). 예전엔 영구 저장이라, 앱을 두어 번 오가며 생긴
 * (복구되는) 손실만으로도 3D 가 다시는 안 켜졌고 되돌릴 설정도 없었다.
 */
export const RENDERER_FALLBACK_KEY = "rankue.sim.renderer.fallbackUntil";
export const RENDERER_FALLBACK_MS = 3 * 24 * 60 * 60 * 1000;

import { ZOOM_MAX, ZOOM_MIN } from "./Renderer";

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function readRendererPref(storage: StorageLike | null | undefined, now = Date.now()): RendererKind | null {
    if (!storage) return null;
    try {
        const v = storage.getItem(RENDERER_PREF_KEY);
        if (v === "canvas") {
            // 손실로 내려간 canvas 는 기한이 있다 — 지나면 다시 WebGL 을 시도한다(기한 없는 canvas 는 예전 저장값 → 한 번 다시 시도)
            const until = Number(storage.getItem(RENDERER_FALLBACK_KEY) ?? "0");
            if (!Number.isFinite(until) || until < now) return null;
        }
        return v === "three" || v === "canvas" ? v : null;
    } catch {
        return null;
    }
}

/** 저장 성공 여부. 사파리 프라이빗 모드 등 쓰기 불가 환경에서는 false. */
export function writeRendererPref(storage: StorageLike | null | undefined, kind: RendererKind, now = Date.now()): boolean {
    if (!storage) return false;
    try {
        storage.setItem(RENDERER_PREF_KEY, kind);
        if (kind === "canvas") storage.setItem(RENDERER_FALLBACK_KEY, String(now + RENDERER_FALLBACK_MS));
        return true;
    } catch {
        return false;
    }
}

/** 저장값이 "player" 일 때만 선수 시점. 없거나 읽을 수 없으면 top(기본). */
export function readViewPref(storage: StorageLike | null | undefined): RendererView {
    if (!storage) return "top";
    try {
        return storage.getItem(VIEW_PREF_KEY) === "player" ? "player" : "top";
    } catch {
        return "top";
    }
}

/** 저장 성공 여부. 쓰기 불가 환경에서는 false. */
export function writeViewPref(storage: StorageLike | null | undefined, view: RendererView): boolean {
    if (!storage) return false;
    try {
        storage.setItem(VIEW_PREF_KEY, view);
        return true;
    } catch {
        return false;
    }
}

/** 탐색용 최소 캔버스 계약(테스트 대체용). */
export interface ProbeCanvas {
    getContext(name: string): unknown;
}
export interface ProbeDocument {
    createElement(tag: "canvas"): ProbeCanvas;
}

/**
 * WebGL2 를 실제로 열 수 있는지. WebGL2RenderingContext 가 있고 탐색 캔버스가 "webgl2" 컨텍스트를 돌려주면 true.
 * 탐색 컨텍스트는 바로 잃게 해(WEBGL_lose_context) 모바일 WebView 의 컨텍스트 상한을 먹지 않는다.
 */
export function probeWebGL2(
    doc: ProbeDocument | null | undefined,
    hasCtor: boolean = typeof WebGL2RenderingContext !== "undefined",
): boolean {
    if (!hasCtor || !doc) return false;
    let gl: unknown;
    try {
        gl = doc.createElement("canvas").getContext("webgl2");
    } catch {
        return false;
    }
    if (!gl) return false;
    try {
        const ext = (gl as { getExtension(name: string): { loseContext(): void } | null }).getExtension("WEBGL_lose_context");
        ext?.loseContext();
    } catch { /* 확장 없음 — 무시 */ }
    return true;
}

/** 저장값 + WebGL2 가능 여부 → 렌더러. WebGL2 가 안 되면 저장값과 무관하게 canvas. */
export function chooseRendererKind(pref: RendererKind | null, webgl2: boolean): RendererKind {
    if (!webgl2) return "canvas";
    return pref ?? "three";
}

/**
 * 3D 확대·축소 저장(2026-09-12 오너: "손가락 놓더라도 내가 축소한 사이즈와 확대한 사이즈가 고정으로").
 * 기기에 남겨 다음에 들어와도 그 크기로 시작한다. 범위 밖·망가진 값은 1(기본)로 본다.
 */
export const ZOOM_PREF_KEY = "rankue.sim.zoom";

export function readZoomPref(storage: StorageLike | null | undefined): number {
    if (!storage) return 1;
    try {
        const v = Number(storage.getItem(ZOOM_PREF_KEY));
        if (!Number.isFinite(v) || v <= 0) return 1;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
    } catch {
        return 1;
    }
}

export function writeZoomPref(storage: StorageLike | null | undefined, zoom: number): boolean {
    if (!storage || !Number.isFinite(zoom)) return false;
    try {
        storage.setItem(ZOOM_PREF_KEY, String(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))));
        return true;
    } catch {
        return false;
    }
}

/** window.localStorage — 접근 자체가 던지는 환경(프라이빗 모드·about:blank)에서는 null. */
export function safeLocalStorage(): StorageLike | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** 페이지용: 저장값·탐색을 브라우저 전역으로 수행. */
export function selectRendererKind(): RendererKind {
    const doc = typeof document !== "undefined" ? (document as unknown as ProbeDocument) : null;
    return chooseRendererKind(readRendererPref(safeLocalStorage()), probeWebGL2(doc));
}
