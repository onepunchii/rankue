/**
 * ThreeRenderer 테스트(node 환경, jsdom 없음).
 *  1) 순수 부분(threeMath): 절두체·투영이 tableGeometry 와 1e-9 안에서 같은지(5 뷰포트 × 2 테이블 × 인셋),
 *     진짜 three OrthographicCamera 로도 같은지, 회전 적분·큐대 배치·다이아몬드 자리.
 *  2) 스모크: WebGL2 컨텍스트를 Proxy 가짜로 대체해 생명주기·좌표·공 풀·큐/링 가시성·컨텍스트 손실·스크린샷·dispose 를 확인한다.
 *     가짜 GL 은 상수를 이름별 고유 숫자로, 함수는 no-op(getParameter/getProgramParameter 등 몇 개만 그럴듯한 값)으로 응답한다.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { OrthographicCamera, Quaternion, Vector3 } from "three";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import type { BallState } from "@shared/sim/types";
import { computeLayout, screenToWorld, worldToScreen } from "./tableGeometry";
import {
    CAMERA_FAR, CAMERA_NEAR, CAMERA_Z, CUE_GAP, CUE_PULLBACK_MAX, cueGap, cueRotationZ, diamondWorld, integrateOrientation,
    orthoFrustum, projectOrtho, unprojectOrtho,
} from "./threeMath";
import { ThreeRenderer, type ThreeRendererOptions } from "./ThreeRenderer";

const VIEWPORTS = [
    { name: "폰 390×844", width: 390, height: 844 },
    { name: "태블릿 768×1024", width: 768, height: 1024 },
    { name: "소형 360×640", width: 360, height: 640 },
    { name: "가로 1024×600", width: 1024, height: 600 },
    { name: "정사각 500×500", width: 500, height: 500 },
];
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };
const T = TABLES.DAEDAE;

/* ------------------------------------------------------------------ 순수 부분 */

describe("orthoFrustum — 투영이 tableGeometry 와 같다", () => {
    const samples = (table: typeof T): [number, number][] => [
        [0, 0], [table.width, table.length], [table.width / 2, table.length / 2], [0.3, 1.7], [table.width, 0], [-0.06, -0.06],
    ];
    for (const table of Object.values(TABLES)) {
        for (const vp of VIEWPORTS) {
            for (const insets of [undefined, INSETS]) {
                it(`${table.name} / ${vp.name} / 인셋 ${insets ? "있음" : "없음"}`, () => {
                    const L = computeLayout(vp, table, insets);
                    const f = orthoFrustum(L);
                    // 마운트 가장자리 = 절두체 가장자리
                    expect(f.right - f.left).toBeCloseTo(vp.width / L.scale, 9);
                    expect(f.top - f.bottom).toBeCloseTo(vp.height / L.scale, 9);
                    for (const [x, y] of samples(table)) {
                        const [ex, ey] = worldToScreen(L, x, y);
                        const [px, py] = projectOrtho(f, vp, x, y);
                        expect(Math.abs(px - ex)).toBeLessThan(1e-9);
                        expect(Math.abs(py - ey)).toBeLessThan(1e-9);
                        const [wx, wy] = unprojectOrtho(f, vp, px, py);
                        const [sx, sy] = screenToWorld(L, px, py);
                        expect(Math.abs(wx - sx)).toBeLessThan(1e-9);
                        expect(Math.abs(wy - sy)).toBeLessThan(1e-9);
                        expect(Math.abs(wx - x)).toBeLessThan(1e-9);
                        expect(Math.abs(wy - y)).toBeLessThan(1e-9);
                    }
                    // 헤드 레일(y=0)이 화면 아래
                    expect(projectOrtho(f, vp, 0, 0)[1]).toBeGreaterThan(projectOrtho(f, vp, 0, table.length)[1]);
                });
            }
        }
    }

    it("진짜 three OrthographicCamera 를 통과해도 같은 px 에 떨어진다", () => {
        for (const table of Object.values(TABLES)) {
            for (const vp of VIEWPORTS) {
                const L = computeLayout(vp, table, INSETS);
                const f = orthoFrustum(L);
                const cam = new OrthographicCamera(f.left, f.right, f.top, f.bottom, CAMERA_NEAR, CAMERA_FAR);
                cam.position.set(0, 0, CAMERA_Z);
                cam.updateMatrixWorld(true);
                cam.updateProjectionMatrix();
                for (const [x, y] of [[0.3, 1.7], [table.width, table.length], [0, 0]] as const) {
                    const v = new Vector3(x, y, table.ball.R).project(cam);
                    const px = (v.x + 1) / 2 * vp.width;
                    const py = (1 - v.y) / 2 * vp.height;
                    const [ex, ey] = worldToScreen(L, x, y);
                    expect(Math.abs(px - ex)).toBeLessThan(1e-9);
                    expect(Math.abs(py - ey)).toBeLessThan(1e-9);
                    // 공 높이(z=R)는 near/far 안
                    expect(v.z).toBeGreaterThan(-1);
                    expect(v.z).toBeLessThan(1);
                }
            }
        }
    });
});

describe("integrateOrientation — ω 축으로 |ω|·dt 만큼 돈다(월드 축)", () => {
    const scratch = () => ({ axis: new Vector3(), dq: new Quaternion() });

    it("+x 로 구르는 공(ω = +y 축)은 꼭대기가 +x 쪽으로 기운다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        integrateOrientation(q, [0, 10, 0], 0.1, axis, dq); // 1 rad
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.x).toBeCloseTo(Math.sin(1), 12);
        expect(top.y).toBeCloseTo(0, 12);
        expect(top.z).toBeCloseTo(Math.cos(1), 12);
        expect(2 * Math.acos(q.w)).toBeCloseTo(1, 12);
        expect(q.length()).toBeCloseTo(1, 12);
    });

    it("이미 z 로 90° 돌아간 공도 ω=(0,w,0) 이면 월드 y 축으로 돈다(premultiply)", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        integrateOrientation(q, [0, 5, 0], 0.2, axis, dq); // 1 rad
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.x).toBeCloseTo(Math.sin(1), 12);
        expect(top.z).toBeCloseTo(Math.cos(1), 12);
        // 몸통 x 축(원래 +x 였던 점은 z 회전으로 +y 에 있음)은 y 축 회전에 안 움직인다
        const side = new Vector3(1, 0, 0).applyQuaternion(q);
        expect(side.y).toBeCloseTo(1, 12);
    });

    it("사이드스핀(ω = z 축)은 꼭대기를 안 움직인다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        integrateOrientation(q, [0, 0, 30], 0.05, axis, dq);
        const top = new Vector3(0, 0, 1).applyQuaternion(q);
        expect(top.z).toBeCloseTo(1, 12);
        const side = new Vector3(1, 0, 0).applyQuaternion(q);
        expect(side.x).toBeCloseTo(Math.cos(1.5), 12);
        expect(side.y).toBeCloseTo(Math.sin(1.5), 12);
    });

    it("ω=0 · dt≤0 · NaN dt 는 그대로", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
        const before = q.clone();
        integrateOrientation(q, [0, 0, 0], 0.1, axis, dq);
        integrateOrientation(q, [1, 2, 3], 0, axis, dq);
        integrateOrientation(q, [1, 2, 3], -1, axis, dq);
        integrateOrientation(q, [1, 2, 3], Number.NaN, axis, dq);
        expect(q.equals(before)).toBe(true);
    });

    it("여러 프레임을 적분해도 단위 쿼터니언이고 각도가 합산된다", () => {
        const { axis, dq } = scratch();
        const q = new Quaternion();
        for (let i = 0; i < 1000; i++) integrateOrientation(q, [3, 0, 4], 0.001, axis, dq); // |ω| = 5, 총 5 rad
        expect(q.length()).toBeCloseTo(1, 12);
        const ang = 2 * Math.acos(Math.abs(q.w));
        expect(Math.min(ang, 2 * Math.PI - ang)).toBeCloseTo(2 * Math.PI - 5, 9);
    });
});

describe("큐대 배치 — Canvas2DRenderer 와 같은 규칙", () => {
    it("간격 = R + 12 mm + pullback·0.25 m, pullback 은 0..1 클램프", () => {
        const R = T.ball.R;
        expect(cueGap(R, 0)).toBeCloseTo(R + CUE_GAP, 12);
        expect(cueGap(R, 1)).toBeCloseTo(R + CUE_GAP + CUE_PULLBACK_MAX, 12);
        expect(cueGap(R, 0.4)).toBeCloseTo(R + 0.012 + 0.1, 12);
        expect(cueGap(R, -3)).toBe(cueGap(R, 0));
        expect(cueGap(R, 7)).toBe(cueGap(R, 1));
    });

    it("그룹 로컬 +y 가 −phi 방향(공 뒤)을 향한다", () => {
        for (const phi of [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.1]) {
            const d = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(0, 0, 1), cueRotationZ(phi));
            expect(d.x).toBeCloseTo(-Math.cos(phi), 12);
            expect(d.y).toBeCloseTo(-Math.sin(phi), 12);
            expect(d.z).toBeCloseTo(0, 12);
        }
    });
});

describe("diamondWorld — tableGeometry 의 다이아몬드 화면 자리와 같다", () => {
    for (const table of Object.values(TABLES)) {
        it(table.name, () => {
            const L = computeLayout({ width: 390, height: 844 }, table, INSETS);
            const marks = diamondWorld(table);
            expect(marks).toHaveLength(20);
            expect(L.diamonds).toHaveLength(20);
            marks.forEach((m, i) => {
                const [sx, sy] = worldToScreen(L, m.x, m.y);
                expect(sx).toBeCloseTo(L.diamonds[i].sx, 9);
                expect(sy).toBeCloseTo(L.diamonds[i].sy, 9);
                expect(m.rail).toBe(L.diamonds[i].rail);
            });
        });
    }
});

/* ------------------------------------------------------------------ 가짜 WebGL2 */

type Call = { name: string; args: unknown[] };

function fakeContext2d(calls: Call[]): CanvasRenderingContext2D {
    const gradient = { addColorStop: () => undefined };
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(_t, prop: string) {
            if (prop in target) return target[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
            if (prop === "getImageData") return () => undefined;
            return (...args: unknown[]) => { calls.push({ name: prop, args }); };
        },
        set(_t, prop: string, value) {
            target[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas2d(calls: Call[]): HTMLCanvasElement {
    const ctx = fakeContext2d(calls);
    return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

/** WebGL2 컨텍스트 흉내. 대문자 속성 = 고유 상수, 나머지 = 기록되는 함수. */
function fakeGL(canvas: unknown, w: number, h: number) {
    const consts = new Map<string, number>();
    let next = 1;
    const id = (name: string): number => {
        let v = consts.get(name);
        if (v === undefined) { v = next++; consts.set(name, v); }
        return v;
    };
    const calls: string[] = [];
    const gl = new Proxy({} as Record<string, unknown>, {
        get(_t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop === "canvas") return canvas;
            if (prop === "drawingBufferWidth") return w;
            if (prop === "drawingBufferHeight") return h;
            if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return id(prop);
            return (...args: unknown[]): unknown => {
                calls.push(prop);
                switch (prop) {
                    case "getParameter": {
                        const p = args[0];
                        if (p === id("VERSION")) return "WebGL 2.0 (fake)";
                        if (p === id("SHADING_LANGUAGE_VERSION")) return "WebGL GLSL ES 3.00 (fake)";
                        if (p === id("VIEWPORT") || p === id("SCISSOR_BOX")) return [0, 0, w, h];
                        if (p === id("COLOR_WRITEMASK")) return [true, true, true, true];
                        if (p === id("MAX_TEXTURE_SIZE") || p === id("MAX_CUBE_MAP_TEXTURE_SIZE") || p === id("MAX_3D_TEXTURE_SIZE")) return 4096;
                        if (p === id("MAX_SAMPLES")) return 4;
                        if (p === id("MAX_VERTEX_UNIFORM_VECTORS") || p === id("MAX_FRAGMENT_UNIFORM_VECTORS")) return 1024;
                        return 16;
                    }
                    case "getShaderPrecisionFormat": return { precision: 23, rangeMin: 127, rangeMax: 127 };
                    case "getExtension": return null;
                    case "getSupportedExtensions": return [];
                    case "getContextAttributes": return { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
                    case "getShaderParameter": return true;
                    case "getProgramParameter": {
                        const p = args[1];
                        return p === id("LINK_STATUS") || p === 0x91b1 ? true : 0;
                    }
                    case "getShaderInfoLog": case "getProgramInfoLog": case "getShaderSource": return "";
                    case "createShader": case "createProgram": case "createBuffer": case "createTexture": case "createVertexArray":
                    case "createFramebuffer": case "createRenderbuffer": case "createQuery": case "createSampler": case "createTransformFeedback":
                        return {};
                    case "isContextLost": return false;
                    case "getError": return 0;
                    case "checkFramebufferStatus": return id("FRAMEBUFFER_COMPLETE");
                    case "getUniformLocation": case "getActiveUniform": case "getActiveAttrib": return null;
                    case "getAttribLocation": return -1;
                    default: return undefined;
                }
            };
        },
    });
    return { gl, calls };
}

type Listener = (e: { preventDefault(): void }) => void;

function fakeGLCanvas(w: number, h: number, withBlob = true) {
    const listeners = new Map<string, Listener[]>();
    const canvas = {
        width: 0,
        height: 0,
        style: {} as Record<string, string>,
        parentNode: null as null | { removeChild(c: unknown): void },
        addEventListener(type: string, fn: Listener) {
            const arr = listeners.get(type) ?? [];
            arr.push(fn);
            listeners.set(type, arr);
        },
        removeEventListener(type: string, fn: Listener) {
            const arr = listeners.get(type);
            if (arr) listeners.set(type, arr.filter((f) => f !== fn));
        },
        setAttribute() { /* noop */ },
        getContext(name: string) { return name === "webgl2" ? gl : null; },
        toBlob: withBlob ? (cb: (b: Blob | null) => void) => cb({ size: 1, type: "image/png" } as Blob) : undefined,
    };
    const { gl, calls } = fakeGL(canvas, w, h);
    const dispatch = (type: string) => {
        let prevented = 0;
        const ev = { preventDefault: () => { prevented++; } };
        for (const fn of [...(listeners.get(type) ?? [])]) fn(ev);
        return prevented;
    };
    const listenerCount = (type: string) => (listeners.get(type) ?? []).length;
    return { canvas: canvas as unknown as HTMLCanvasElement, gl, calls, dispatch, listenerCount };
}

function fakeElement(width: number, height: number) {
    const children: unknown[] = [];
    const el = {
        clientWidth: width,
        clientHeight: height,
        children,
        style: {} as Record<string, string>,
        appendChild(c: { parentNode: unknown }) {
            children.push(c);
            c.parentNode = el;
        },
        removeChild(c: unknown) {
            const i = children.indexOf(c);
            if (i >= 0) children.splice(i, 1);
        },
    };
    return el as unknown as HTMLElement & { children: unknown[]; clientWidth: number; clientHeight: number };
}

function make(width = 390, height = 844, extra: Partial<ThreeRendererOptions> = {}, withBlob = true) {
    const glc = fakeGLCanvas(width, height, withBlob);
    const calls2d: Call[] = [];
    let t = 0;
    const r = new ThreeRenderer({
        dpr: 2,
        insets: INSETS,
        canvas: glc.canvas,
        createCanvas: () => fakeCanvas2d(calls2d),
        now: () => t,
        ...extra,
    });
    const el = fakeElement(width, height);
    return { r, el, glc, calls2d, setTime: (ms: number) => { t = ms; } };
}

const drawCount = (calls: string[]) => calls.filter((c) => c === "drawElements" || c === "drawElementsInstanced" || c === "drawArrays").length;
const clearCount = (calls: string[]) => calls.filter((c) => c === "clear").length;

describe("ThreeRenderer 스모크(가짜 WebGL2)", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let log: ReturnType<typeof vi.spyOn>;
    let selfSet = false;
    beforeAll(() => {
        // three 가 없는 확장을 경고한다 — 테스트 출력만 조용히
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        // three 는 생성 때 self 를 rAF 컨텍스트로 잡고 dispose 때 cancelAnimationFrame 을 부른다(브라우저엔 항상 있음)
        const g = globalThis as unknown as { self?: unknown };
        if (typeof g.self === "undefined") {
            g.self = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined };
            selfSet = true;
        }
    });
    afterAll(() => {
        warn.mockRestore();
        log.mockRestore();
        if (selfSet) delete (globalThis as unknown as { self?: unknown }).self;
    });

    it("mount 는 WebGL 캔버스를 오버레이와 같은 좌표계로 얹고 DPR 배 크기로 만든다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        expect(el.children).toHaveLength(1);
        expect(el.children[0]).toBe(glc.canvas);
        expect(glc.canvas.width).toBe(780);
        expect(glc.canvas.height).toBe(1688);
        const st = glc.canvas.style as unknown as Record<string, string>;
        expect(st.position).toBe("absolute");
        expect(st.inset).toBe("0");
        expect(st.width).toBe("100%");
        expect(st.height).toBe("100%");
        expect(st.touchAction).toBe("none");
        const vp = r.viewport();
        expect(vp?.dpr).toBe(2);
        expect(vp?.width).toBe(390);
        expect(vp?.insets.top).toBe(47);
        expect(r.getLayout()?.scale).toBe(computeLayout({ width: 390, height: 844 }, T, INSETS).scale);
        // 라사 텍스처는 2D 컨텍스트로 만들어졌다
        expect(r.stats().clothTextured).toBe(true);
        // 마운트만으로 한 번 그렸다(정적 층)
        expect(clearCount(glc.calls)).toBeGreaterThanOrEqual(1);
    });

    it("project/unproject 는 tableGeometry 와 같다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const L = computeLayout({ width: 390, height: 844 }, T, INSETS);
        const [ex, ey] = worldToScreen(L, 0.7, 1.9);
        const [px, py] = r.project(0.7, 1.9);
        expect(px).toBeCloseTo(ex, 9);
        expect(py).toBeCloseTo(ey, 9);
        const [wx, wy] = r.unproject(px, py);
        expect(wx).toBeCloseTo(0.7, 9);
        expect(wy).toBeCloseTo(1.9, 9);
        expect(r.project(0, 0)[1]).toBeGreaterThan(r.project(0, T.length)[1]);
    });

    it("draw 는 공을 만들고(풀), 큐·강조 링 가시성을 프레임대로 맞추며 그린다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        glc.calls.length = 0;
        const balls = openingLayout("3c", T, "white");
        r.draw({ balls, cue: { phi: Math.PI / 2, pullback: 0.3, visible: true }, highlightBallId: "white" });
        expect(r.stats()).toMatchObject({ balls: 3, pooled: 0, cueVisible: true, ringVisible: true, lost: false });
        expect(clearCount(glc.calls)).toBe(1);
        // 라사·레일·받침·코·다이아몬드·스팟·공 3·그림자 3·큐 4·링 2 ≥ 18 드로우
        expect(drawCount(glc.calls)).toBeGreaterThanOrEqual(18);

        r.draw({ balls, cue: { phi: 0, pullback: 0, visible: false } });
        expect(r.stats()).toMatchObject({ balls: 3, cueVisible: false, ringVisible: false });
    });

    it("공 id 가 사라지면 풀로 돌아가고 자세가 초기화된다", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const four = openingLayout("4c", T, "white");
        r.draw({ balls: four });
        expect(r.stats()).toMatchObject({ balls: 4, pooled: 0 });
        // red2 를 굴려 자세를 바꾼다
        const spun: BallState[] = four.map((b) => (b.id === "red2" ? { ...b, w: [0, 10, 0], state: "rolling" } : b));
        setTime(100);
        r.draw({ balls: spun });
        const q = new Quaternion();
        expect(r.getOrientation("red2", q)).toBe(true);
        expect(q.equals(new Quaternion())).toBe(false);

        const three = openingLayout("3c", T, "white");
        setTime(200);
        r.draw({ balls: three });
        expect(r.stats()).toMatchObject({ balls: 3, pooled: 1 });
        expect(r.getOrientation("red2", q)).toBe(false);
        // 다시 나타나면 항등에서 시작
        setTime(300);
        r.draw({ balls: four });
        expect(r.stats()).toMatchObject({ balls: 4, pooled: 0 });
        expect(r.getOrientation("red2", q)).toBe(true);
        expect(q.equals(new Quaternion())).toBe(true);
    });

    it("회전은 벽시계 dt 로 적분한다(같은 프레임을 다시 그려도 ω·dt 만큼 더 돈다)", () => {
        const { r, el, setTime } = make();
        r.mount(el, T);
        const balls = openingLayout("3c", T, "white").map((b) => (b.id === "white" ? { ...b, w: [0, 10, 0] as const, state: "rolling" as const } : b));
        setTime(0);
        r.draw({ balls });
        const q0 = new Quaternion();
        r.getOrientation("white", q0);
        expect(q0.equals(new Quaternion())).toBe(true); // 첫 프레임은 dt = 0
        setTime(100);
        r.draw({ balls });
        const q1 = new Quaternion();
        r.getOrientation("white", q1);
        expect(2 * Math.acos(q1.w)).toBeCloseTo(1, 9); // 10 rad/s × 0.1 s
        // 탭이 숨겨졌다 돌아온 큰 dt 는 MAX_DT 로 잘린다
        setTime(5100);
        r.draw({ balls });
        const q2 = new Quaternion();
        r.getOrientation("white", q2);
        expect(2 * Math.acos(q2.w)).toBeCloseTo(2, 9);
    });

    it("resize 는 배치·절두체를 다시 잡고 마지막 프레임을 다시 그린다", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        glc.calls.length = 0;
        el.clientWidth = 768;
        el.clientHeight = 1024;
        r.resize();
        expect(r.viewport()?.width).toBe(768);
        expect(glc.canvas.width).toBe(1536);
        expect(clearCount(glc.calls)).toBe(1);
        const L = computeLayout({ width: 768, height: 1024 }, T, INSETS);
        expect(r.project(0.5, 0.5)).toEqual(worldToScreen(L, 0.5, 0.5));
    });

    it("setTable 은 배치를 바꾼다", () => {
        const { r, el } = make();
        r.mount(el, T);
        const a = r.viewport()!.scale;
        r.setTable(TABLES.JUNGDAE_KR);
        expect(r.viewport()!.scale).toBeGreaterThan(a);
    });

    it("컨텍스트 손실: 횟수를 세고 onContextLost 를 알리며 그리기를 멈춘다 · 복구되면 다시 그린다", () => {
        const onContextLost = vi.fn();
        const onContextRestored = vi.fn();
        const { r, el, glc } = make(390, 844, { onContextLost, onContextRestored });
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        // three 의 리스너 + 우리 리스너
        expect(glc.listenerCount("webglcontextlost")).toBe(2);
        expect(glc.dispatch("webglcontextlost")).toBeGreaterThanOrEqual(1); // preventDefault
        expect(onContextLost).toHaveBeenCalledTimes(1);
        expect(r.stats()).toMatchObject({ lost: true, losses: 1 });
        glc.calls.length = 0;
        r.draw({ balls: openingLayout("3c", T) });
        expect(clearCount(glc.calls)).toBe(0);

        glc.dispatch("webglcontextrestored");
        expect(onContextRestored).toHaveBeenCalledTimes(1);
        expect(r.stats().lost).toBe(false);
        expect(clearCount(glc.calls)).toBe(1); // 마지막 프레임을 다시 그렸다

        glc.dispatch("webglcontextlost");
        expect(onContextLost).toHaveBeenCalledTimes(2);
        expect(r.stats().losses).toBe(2);
    });

    it("screenshot: 그린 직후 toBlob · toBlob 없거나 컨텍스트를 잃었으면 null", async () => {
        const a = make();
        a.r.mount(a.el, T);
        a.glc.calls.length = 0;
        expect(await a.r.screenshot()).not.toBeNull();
        expect(clearCount(a.glc.calls)).toBe(1); // 같은 틱에 새로 그렸다
        a.glc.dispatch("webglcontextlost");
        expect(await a.r.screenshot()).toBeNull();

        const b = make(390, 844, {}, false);
        b.r.mount(b.el, T);
        expect(await b.r.screenshot()).toBeNull();

        const c = make();
        expect(await c.r.screenshot()).toBeNull(); // 마운트 전
    });

    it("dispose 는 캔버스·리스너를 떼고 이후 draw/project 를 무시한다 · 재마운트는 거부", () => {
        const { r, el, glc } = make();
        r.mount(el, T);
        r.draw({ balls: openingLayout("3c", T) });
        r.dispose();
        expect(el.children).toHaveLength(0);
        expect(glc.listenerCount("webglcontextlost")).toBe(0);
        expect(r.viewport()).toBeNull();
        glc.calls.length = 0;
        r.draw({ balls: openingLayout("3c", T) });
        expect(clearCount(glc.calls)).toBe(0);
        expect(r.project(1, 1)).toEqual([0, 0]);
        expect(r.stats().balls).toBe(0);
        expect(() => r.mount(el, T)).toThrow();
        r.dispose(); // 두 번째는 무시
    });

    it("2D 컨텍스트가 없어도(텍스처 불가) 평면 색으로 동작한다", () => {
        const { r, el } = make(390, 844, { createCanvas: () => ({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement) });
        r.mount(el, T);
        expect(r.stats().clothTextured).toBe(false);
        r.draw({ balls: openingLayout("3c", T), cue: { phi: 0, pullback: 0, visible: true } });
        expect(r.stats().balls).toBe(3);
    });
});
