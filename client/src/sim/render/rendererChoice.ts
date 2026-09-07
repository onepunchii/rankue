/**
 * 렌더러 선택(기기별로 저장). localStorage "rankue.sim.renderer" = "three" | "canvas".
 *
 *  - 저장값이 없으면 WebGL2 를 탐색해 되면 three, 아니면 canvas. 저장값이 three 여도 WebGL2 가 안 되면 canvas.
 *  - 컨텍스트 손실이 CONTEXT_LOSS_LIMIT 회 쌓이면 페이지가 세션 동안 canvas 로 바꾸고 "canvas" 를 저장한다
 *    (SimulatorPage). 사용자 토글은 아직 없다 — 설정 화면이 생기면 writeRendererPref 를 그대로 쓴다.
 *  - 순수 함수는 저장소·문서를 인자로 받아 테스트한다. selectRendererKind() 는 브라우저 전역을 쓰는 편의 함수.
 */

export type RendererKind = "three" | "canvas";

export const RENDERER_PREF_KEY = "rankue.sim.renderer";
/** 이 횟수만큼 WebGL 컨텍스트를 잃으면 Canvas2D 로 내려간다. */
export const CONTEXT_LOSS_LIMIT = 2;

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function readRendererPref(storage: StorageLike | null | undefined): RendererKind | null {
    if (!storage) return null;
    try {
        const v = storage.getItem(RENDERER_PREF_KEY);
        return v === "three" || v === "canvas" ? v : null;
    } catch {
        return null;
    }
}

/** 저장 성공 여부. 사파리 프라이빗 모드 등 쓰기 불가 환경에서는 false. */
export function writeRendererPref(storage: StorageLike | null | undefined, kind: RendererKind): boolean {
    if (!storage) return false;
    try {
        storage.setItem(RENDERER_PREF_KEY, kind);
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
