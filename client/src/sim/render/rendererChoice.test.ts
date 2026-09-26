import { ZOOM_MAX, ZOOM_MIN } from "./Renderer";
import { describe, it, expect, vi } from "vitest";
import {
    chooseRendererKind, CONTEXT_LOSS_LIMIT, probeWebGL2, readRendererPref, readViewPref, RENDERER_PREF_KEY, RENDERER_FALLBACK_KEY, RENDERER_FALLBACK_MS, selectRendererKind,
    VIEW_PREF_KEY, writeRendererPref, writeViewPref, type StorageLike, readZoomPref, writeZoomPref} from "./rendererChoice";

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

describe("readRendererPref / writeRendererPref", () => {
    it("저장값이 three|canvas 일 때만 돌려준다", () => {
        expect(readRendererPref(null)).toBeNull();
        expect(readRendererPref(memStorage())).toBeNull();
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "three" }))).toBe("three");
        // canvas 는 기한 안에서만(2026-09-26) — 기한이 없거나 지났으면 다시 WebGL 을 시도한다
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "canvas" }))).toBeNull();
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "canvas", [RENDERER_FALLBACK_KEY]: String(Date.now() + 60_000) }))).toBe("canvas");
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "canvas", [RENDERER_FALLBACK_KEY]: String(Date.now() - 1) }))).toBeNull();
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "webgpu" }))).toBeNull();
    });

    it("접근이 던지는 저장소(프라이빗 모드)는 null / false", () => {
        const throwing: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
        expect(readRendererPref(throwing)).toBeNull();
        expect(writeRendererPref(throwing, "canvas")).toBe(false);
        expect(writeRendererPref(null, "canvas")).toBe(false);
    });

    it("canvas 쓰기는 기한도 함께 남긴다(3일) — 그 안에는 canvas, 지나면 다시 WebGL", () => {
        const s = memStorage();
        const now = 1_000_000;
        expect(writeRendererPref(s, "canvas", now)).toBe(true);
        expect(s.data).toEqual({ [RENDERER_PREF_KEY]: "canvas", [RENDERER_FALLBACK_KEY]: String(now + RENDERER_FALLBACK_MS) });
        expect(readRendererPref(s, now + 1000)).toBe("canvas");
        expect(readRendererPref(s, now + RENDERER_FALLBACK_MS + 1)).toBeNull();
        expect(writeRendererPref(s, "three", now)).toBe(true);
        expect(readRendererPref(s, now)).toBe("three");
    });
});

describe("readViewPref / writeViewPref — 카메라 뷰(기본 top)", () => {
    it("저장값이 player 일 때만 player, 그 외·없음·읽기 불가는 top", () => {
        expect(readViewPref(null)).toBe("top");
        expect(readViewPref(memStorage())).toBe("top");
        expect(readViewPref(memStorage({ [VIEW_PREF_KEY]: "player" }))).toBe("player");
        expect(readViewPref(memStorage({ [VIEW_PREF_KEY]: "top" }))).toBe("top");
        expect(readViewPref(memStorage({ [VIEW_PREF_KEY]: "iso" }))).toBe("top");
        const throwing: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
        expect(readViewPref(throwing)).toBe("top");
        expect(writeViewPref(throwing, "player")).toBe(false);
        expect(writeViewPref(null, "player")).toBe(false);
    });

    it("쓰기는 렌더러 키와 다른 키 하나에 남고 다시 읽힌다", () => {
        const s = memStorage();
        expect(writeViewPref(s, "player")).toBe(true);
        expect(s.data).toEqual({ [VIEW_PREF_KEY]: "player" });
        expect(VIEW_PREF_KEY).not.toBe(RENDERER_PREF_KEY);
        expect(readViewPref(s)).toBe("player");
        writeViewPref(s, "top");
        expect(readViewPref(s)).toBe("top");
    });
});

describe("probeWebGL2", () => {
    it("생성자가 없거나 문서가 없으면 false", () => {
        expect(probeWebGL2(null, true)).toBe(false);
        expect(probeWebGL2({ createElement: () => ({ getContext: () => ({}) }) }, false)).toBe(false);
    });

    it("webgl2 컨텍스트를 못 열면 false, 열면 true 이고 탐색 컨텍스트는 바로 잃게 한다", () => {
        expect(probeWebGL2({ createElement: () => ({ getContext: () => null }) }, true)).toBe(false);
        const loseContext = vi.fn();
        const gl = { getExtension: (n: string) => (n === "WEBGL_lose_context" ? { loseContext } : null) };
        const getContext = vi.fn((name: string) => (name === "webgl2" ? gl : null));
        expect(probeWebGL2({ createElement: () => ({ getContext }) }, true)).toBe(true);
        expect(getContext).toHaveBeenCalledWith("webgl2");
        expect(loseContext).toHaveBeenCalledTimes(1);
        // 확장이 없어도 true
        expect(probeWebGL2({ createElement: () => ({ getContext: () => ({ getExtension: () => null }) }) }, true)).toBe(true);
    });

    it("createElement / getContext 가 던지면 false", () => {
        expect(probeWebGL2({ createElement: () => { throw new Error("no canvas"); } }, true)).toBe(false);
        expect(probeWebGL2({ createElement: () => ({ getContext: () => { throw new Error("blocked"); } }) }, true)).toBe(false);
    });
});

describe("chooseRendererKind", () => {
    it("WebGL2 가 안 되면 저장값과 무관하게 canvas", () => {
        expect(chooseRendererKind(null, false)).toBe("canvas");
        expect(chooseRendererKind("three", false)).toBe("canvas");
        expect(chooseRendererKind("canvas", false)).toBe("canvas");
    });

    it("WebGL2 가 되면 저장값 우선, 없으면 three", () => {
        expect(chooseRendererKind(null, true)).toBe("three");
        expect(chooseRendererKind("three", true)).toBe("three");
        expect(chooseRendererKind("canvas", true)).toBe("canvas");
    });

    it("손실 한도는 2회", () => {
        expect(CONTEXT_LOSS_LIMIT).toBe(2);
    });
});

describe("selectRendererKind (브라우저 전역 없음)", () => {
    it("node 환경에서는 canvas", () => {
        expect(selectRendererKind()).toBe("canvas");
    });
});

/** 3D 확대·축소 저장(2026-09-12 오너: 손을 떼도 남고, 다음에 들어와도 그 크기). */
describe("readZoomPref / writeZoomPref", () => {
    const mem = (v?: string) => {
        const store: Record<string, string> = v === undefined ? {} : { "rankue.sim.zoom": v };
        return { getItem: (k: string) => store[k] ?? null, setItem: (k: string, val: string) => { store[k] = val; }, store };
    };
    it("저장된 값을 읽고, 없으면 1", () => {
        expect(readZoomPref(mem("0.6"))).toBeCloseTo(0.6, 10);
        expect(readZoomPref(mem())).toBe(1);
        expect(readZoomPref(null)).toBe(1);
    });
    it("망가진 값·범위 밖은 안전하게 본다", () => {
        expect(readZoomPref(mem("어쩌구"))).toBe(1);
        expect(readZoomPref(mem("0"))).toBe(1);
        expect(readZoomPref(mem("9"))).toBe(ZOOM_MAX);
        expect(readZoomPref(mem("0.01"))).toBe(ZOOM_MIN);
    });
    it("쓸 때도 범위로 자른다. 저장할 수 없으면 false", () => {
        const s = mem();
        expect(writeZoomPref(s, 0.8)).toBe(true);
        expect(s.store["rankue.sim.zoom"]).toBe("0.8");
        writeZoomPref(s, 99);
        expect(Number(s.store["rankue.sim.zoom"])).toBe(ZOOM_MAX);
        expect(writeZoomPref(null, 1)).toBe(false);
        expect(writeZoomPref(mem(), Number.NaN)).toBe(false);
    });
});
