/**
 * jsdom 없이 도는 스모크 테스트. 캔버스·컨텍스트를 기록형 가짜로 대체해
 * 생명주기·좌표 변환·draw 호출 순서(큐대 → 공)·할당 규율을 확인한다.
 */
import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { Canvas2DRenderer } from "./Canvas2DRenderer";
import { computeLayout, worldToScreen } from "./tableGeometry";

type Call = { name: string; args: unknown[] };

function fakeContext(calls: Call[]): CanvasRenderingContext2D {
    const gradient = { addColorStop: () => undefined };
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(_t, prop: string) {
            if (prop in target) return target[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
            return (...args: unknown[]) => { calls.push({ name: prop, args }); };
        },
        set(_t, prop: string, value) {
            target[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(calls: Call[], withBlob: boolean) {
    const ctx = fakeContext(calls);
    const canvas = {
        width: 0,
        height: 0,
        style: {} as Record<string, string>,
        parentNode: null as { removeChild: (c: unknown) => void } | null,
        getContext: () => ctx,
        toBlob: withBlob ? (cb: (b: Blob | null) => void) => cb({ size: 1, type: "image/png" } as Blob) : undefined,
    };
    return canvas as unknown as HTMLCanvasElement;
}

function fakeElement(width: number, height: number) {
    const children: unknown[] = [];
    const el = {
        clientWidth: width,
        clientHeight: height,
        children,
        appendChild(c: { parentNode: unknown }) {
            children.push(c);
            c.parentNode = el;
        },
        removeChild(c: unknown) {
            const i = children.indexOf(c);
            if (i >= 0) children.splice(i, 1);
        },
    };
    return el as unknown as HTMLElement & { children: unknown[] };
}

function make(width = 390, height = 844, withBlob = true) {
    const calls: Call[] = [];
    const canvases: HTMLCanvasElement[] = [];
    const r = new Canvas2DRenderer({
        dpr: 2,
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
        createCanvas: () => {
            const c = fakeCanvas(calls, withBlob);
            canvases.push(c);
            return c;
        },
    });
    const el = fakeElement(width, height);
    return { r, el, calls, canvases };
}

const T = TABLES.DAEDAE;

describe("Canvas2DRenderer 스모크", () => {
    it("mount 는 캔버스를 붙이고 DPR 배 크기로 만든다", () => {
        const { r, el, canvases } = make();
        r.mount(el, T);
        expect(el.children).toHaveLength(1);
        const main = canvases[0];
        expect(main.width).toBe(780);
        expect(main.height).toBe(1688);
        // 정적 오프스크린 + 스프라이트 3장
        expect(canvases.length).toBe(5);
        const vp = r.viewport();
        expect(vp?.dpr).toBe(2);
        expect(vp?.width).toBe(390);
        expect(vp?.insets.top).toBe(47);
    });

    it("캔버스는 오버레이와 같은 좌표계(absolute·inset 0)로 마운트에 얹힌다", () => {
        const { r, el, canvases } = make();
        r.mount(el, T);
        const st = canvases[0].style as unknown as Record<string, string>;
        expect(st.position).toBe("absolute");
        expect(st.inset).toBe("0");
        expect(st.width).toBe("100%");
        expect(st.height).toBe("100%");
        expect(st.touchAction).toBe("none");
    });

    it("dpr 옵션이 없으면 resize 마다 devicePixelRatio 를 다시 읽고, 있으면 고정", () => {
        const g = globalThis as unknown as { window?: { devicePixelRatio: number } };
        const saved = g.window;
        g.window = { devicePixelRatio: 1 };
        try {
            const calls: Call[] = [];
            const live = new Canvas2DRenderer({ createCanvas: () => fakeCanvas(calls, false) });
            const el = fakeElement(300, 600);
            live.mount(el, T);
            expect(live.viewport()?.dpr).toBe(1);
            g.window = { devicePixelRatio: 3 }; // 디스플레이 이동 — 상한 2
            live.resize();
            expect(live.viewport()?.dpr).toBe(2);

            const fixed = new Canvas2DRenderer({ dpr: 1.5, createCanvas: () => fakeCanvas(calls, false) });
            fixed.mount(fakeElement(300, 600), T);
            fixed.resize();
            expect(fixed.viewport()?.dpr).toBe(1.5);
        } finally {
            g.window = saved;
        }
    });

    it("강조 링·공 색은 토큰 팔레트(기본값)에서 온다 — 하드코딩 hex 없음", () => {
        const { r, el, calls } = make();
        r.mount(el, T);
        calls.length = 0;
        r.draw({ balls: openingLayout("3c", T), highlightBallId: "white" });
        // 마지막 stroke 두 번 직전에 대입된 strokeStyle 은 rgba() 문자열(토큰 파생)이어야 한다
        const ctxProps = (el.children[0] as unknown as { getContext: () => Record<string, unknown> }).getContext();
        expect(String(ctxProps.strokeStyle)).toMatch(/^rgba\(0,98,65,1\)$/);
    });

    it("project/unproject 는 tableGeometry 와 같다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const L = computeLayout({ width: 390, height: 844 }, T, { top: 47, right: 0, bottom: 34, left: 0 });
        const [ex, ey] = worldToScreen(L, 0.7, 1.9);
        const [px, py] = r.project(0.7, 1.9);
        expect(px).toBeCloseTo(ex, 9);
        expect(py).toBeCloseTo(ey, 9);
        const [wx, wy] = r.unproject(px, py);
        expect(wx).toBeCloseTo(0.7, 9);
        expect(wy).toBeCloseTo(1.9, 9);
        // 헤드 레일이 화면 아래
        expect(r.project(0, 0)[1]).toBeGreaterThan(r.project(0, T.length)[1]);
    });

    it("draw 는 정적 층을 복사한 뒤 큐대(경로) → 공(drawImage) 순으로 그린다", () => {
        const { r, el, calls } = make();
        r.mount(el, T);
        calls.length = 0;
        const balls = openingLayout("3c", T, "white");
        r.draw({ balls, cue: { phi: Math.PI / 2, pullback: 0.3, visible: true }, highlightBallId: "white" });
        const names = calls.map((c) => c.name);
        const blit = names.indexOf("drawImage");
        expect(blit).toBeGreaterThanOrEqual(0);
        const firstFill = names.indexOf("fill", blit); // 큐대 채우기
        const ballImages = names.filter((n, i) => n === "drawImage" && i > blit);
        expect(ballImages).toHaveLength(3);
        const firstBall = names.indexOf("drawImage", blit + 1);
        expect(firstFill).toBeLessThan(firstBall);
        // 강조 링: 마지막에 stroke 두 번(halo + brand)
        const strokes = names.filter((n, i) => n === "stroke" && i > firstBall);
        expect(strokes.length).toBe(2);
    });

    it("cue.visible=false 면 큐대 경로를 만들지 않는다", () => {
        const { r, el, calls } = make();
        r.mount(el, T);
        calls.length = 0;
        r.draw({ balls: openingLayout("4c", T), cue: { phi: 0, pullback: 0, visible: false } });
        const names = calls.map((c) => c.name);
        expect(names.filter((n) => n === "moveTo")).toHaveLength(0);
        expect(names.filter((n) => n === "drawImage")).toHaveLength(5); // 정적 1 + 공 4
    });

    it("draw 는 마지막 프레임을 기억해 resize 후 다시 그린다", () => {
        const { r, el, calls } = make();
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        calls.length = 0;
        (el as unknown as { clientWidth: number }).clientWidth = 768;
        (el as unknown as { clientHeight: number }).clientHeight = 1024;
        r.resize();
        expect(r.viewport()?.width).toBe(768);
        expect(calls.filter((c) => c.name === "drawImage").length).toBe(4);
    });

    it("setTable 은 배치를 바꾼다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const a = r.viewport()!.scale;
        r.setTable(TABLES.JUNGDAE_KR);
        expect(r.viewport()!.scale).toBeGreaterThan(a); // 작은 테이블 → 같은 화면에 더 크게
    });

    it("screenshot: toBlob 있으면 Blob, 없으면 null", async () => {
        const a = make(390, 844, true);
        a.r.mount(a.el, T);
        expect(await a.r.screenshot()).not.toBeNull();
        const b = make(390, 844, false);
        b.r.mount(b.el, T);
        expect(await b.r.screenshot()).toBeNull();
        const c = new Canvas2DRenderer({ dpr: 1, createCanvas: () => fakeCanvas([], true) });
        expect(await c.screenshot()).toBeNull(); // 마운트 전
    });

    it("dispose 는 캔버스를 떼고 이후 draw/project 를 무시한다", () => {
        const { r, el, calls } = make();
        r.mount(el, T);
        r.dispose();
        expect(el.children).toHaveLength(0);
        expect(r.viewport()).toBeNull();
        calls.length = 0;
        r.draw({ balls: openingLayout("3c", T) });
        expect(calls).toHaveLength(0);
        expect(r.project(1, 1)).toEqual([0, 0]);
    });
});
