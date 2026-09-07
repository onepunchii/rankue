import { describe, it, expect, vi } from "vitest";
import {
    chooseRendererKind, CONTEXT_LOSS_LIMIT, probeWebGL2, readRendererPref, readViewPref, RENDERER_PREF_KEY, selectRendererKind,
    VIEW_PREF_KEY, writeRendererPref, writeViewPref, type StorageLike,
} from "./rendererChoice";

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

describe("readRendererPref / writeRendererPref", () => {
    it("저장값이 three|canvas 일 때만 돌려준다", () => {
        expect(readRendererPref(null)).toBeNull();
        expect(readRendererPref(memStorage())).toBeNull();
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "three" }))).toBe("three");
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "canvas" }))).toBe("canvas");
        expect(readRendererPref(memStorage({ [RENDERER_PREF_KEY]: "webgpu" }))).toBeNull();
    });

    it("접근이 던지는 저장소(프라이빗 모드)는 null / false", () => {
        const throwing: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
        expect(readRendererPref(throwing)).toBeNull();
        expect(writeRendererPref(throwing, "canvas")).toBe(false);
        expect(writeRendererPref(null, "canvas")).toBe(false);
    });

    it("쓰기는 키 하나에 값을 남긴다", () => {
        const s = memStorage();
        expect(writeRendererPref(s, "canvas")).toBe(true);
        expect(s.data).toEqual({ [RENDERER_PREF_KEY]: "canvas" });
        expect(readRendererPref(s)).toBe("canvas");
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
