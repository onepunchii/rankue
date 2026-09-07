import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import type { BallState } from "@shared/sim/types";
import { Overlay, parseColor, rgba, type OverlayState } from "./Overlay";
import { createNumbersCache, overlayDiamond } from "./diamondSystem";

const T = TABLES.DAEDAE;
const R = T.ball.R;
const ball = (id: string, x: number, y: number): BallState => ({ id, r: [x, y, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" });

describe("parseColor", () => {
    it("hex", () => {
        expect(parseColor("#006241")).toEqual([0, 98, 65, 1]);
        expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
        expect(parseColor("#00000080")![3]).toBeCloseTo(0.5, 1);
        expect(parseColor("#zz")).toBeNull();
    });
    it("rgb/rgba, 채널 토큰", () => {
        expect(parseColor("rgba(0, 0, 0, 0.87)")).toEqual([0, 0, 0, 0.87]);
        expect(parseColor("rgb(1 2 3 / 0.5)")).toEqual([1, 2, 3, 0.5]);
        expect(parseColor(" 0 98 65 ")).toEqual([0, 98, 65, 1]);
        expect(parseColor("")).toBeNull();
        expect(parseColor("var(--x)")).toBeNull();
    });
    it("rgba 문자열은 알파 배수를 곱한다", () => {
        expect(rgba([0, 98, 65, 1], 0.3)).toBe("rgba(0,98,65,0.3)");
        expect(rgba([0, 0, 0, 0.87])).toBe("rgba(0,0,0,0.87)");
    });
});

/** jsdom 없이 쓰는 가짜 캔버스. 호출된 메서드 이름과 대입된 속성을 기록한다. */
function fakeMount() {
    const calls: string[] = [];
    const props: Record<string, unknown> = {};
    const ctx = new Proxy({}, {
        get(_t, name: string) {
            if (name === "measureText") return () => ({ width: 12 });
            if (name in props) return props[name];
            return (..._args: unknown[]) => { calls.push(name); };
        },
        set(_t, name: string, v) { props[name] = v; if (typeof v === "string") calls.push(`${name}=${v}`); return true; },
    }) as unknown as CanvasRenderingContext2D;
    const canvas = { width: 0, height: 0, style: {} as Record<string, string>, parentNode: null as unknown, getContext: () => ctx };
    const children: unknown[] = [];
    const mount = {
        clientWidth: 300, clientHeight: 600, style: {} as Record<string, string>,
        ownerDocument: { createElement: () => canvas, documentElement: {} },
        appendChild(el: unknown) { children.push(el); (el as { parentNode: unknown }).parentNode = mount; },
        removeChild(el: unknown) { children.splice(children.indexOf(el), 1); },
    };
    return { mount: mount as unknown as HTMLElement, canvas, calls, props, children };
}

/** 세로 화면: x → 가로, y 는 위로 증가(헤드 레일이 아래). */
const scale = 200;
const project = (x: number, y: number): readonly [number, number] => [x * scale, 600 - y * scale];

const balls = [ball("white", 0.5, 0.5), ball("red", 0.5, 1.5), ball("yellow", 1.0, 2.0)];
const base: Omit<OverlayState, "guide"> = { balls, phi: Math.PI / 2, cueBallId: "white", table: T, project };

describe("Overlay (가짜 캔버스)", () => {
    it("마운트에 캔버스를 붙이고 DPR 크기로 리사이즈한다", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        expect(f.children.length).toBe(1);
        expect(f.canvas.style.pointerEvents).toBe("none");
        expect(f.canvas.style.position).toBe("absolute");
        expect(f.canvas.width).toBe(300);
        expect(f.canvas.height).toBe(600);
        ov.dispose();
        expect(f.children.length).toBe(0);
    });

    it("직선 안내: 선·고스트 공(채움 + 테두리)·라벨을 그린다", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        f.calls.length = 0;
        ov.draw({ ...base, guide: "straight" });
        expect(f.calls).toContain("clearRect");
        expect(f.calls).toContain("lineTo");
        expect(f.calls).toContain("arc");
        expect(f.calls).toContain("fill");
        expect(f.calls).toContain("fillText");
        expect(f.calls).toContain("setLineDash");
        expect(f.props.font).toMatch(/^12px /);
        expect(String(f.props.strokeStyle)).toMatch(/^rgba\(/);
    });

    it("색 규약: 조준선·고스트는 큐볼 색(흰 92 % / 채움 35 %), 테두리는 surface-1 — brand 초록은 선에 쓰지 않는다", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        f.calls.length = 0;
        ov.draw({ ...base, guide: "straight" });
        expect(f.calls).toContain("strokeStyle=rgba(247,244,237,0.92)");   // 흰 큐볼 조준선
        expect(f.calls).toContain("fillStyle=rgba(247,244,237,0.35)");     // 고스트 채움
        expect(f.calls).toContain("strokeStyle=rgba(255,255,255,0.85)");   // 고스트 테두리
        expect(f.calls.filter((c) => c === "strokeStyle=rgba(0,98,65,1)")).toEqual([]);
        // 노란 큐볼이면 노란 선·노란 고스트
        f.calls.length = 0;
        ov.draw({ ...base, cueBallId: "yellow", phi: -Math.PI / 2, guide: "straight" });
        expect(f.calls).toContain("strokeStyle=rgba(232,179,37,0.92)");
        expect(f.calls).toContain("fillStyle=rgba(232,179,37,0.35)");
    });

    it("두께 알약: 공 조준이면 겹침 그림(적구 원 + 큐볼 원) 뒤에 글자, 쿠션 조준이면 글자만", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        f.calls.length = 0;
        ov.draw({ ...base, guide: "straight", thickness: { value: 0.5, side: "left" } });
        const arcs = f.calls.filter((c) => c === "arc").length;
        expect(f.calls).toContain("fillStyle=rgba(200,68,46,1)");          // 적구(빨간 공) 원
        expect(f.calls).toContain("fillStyle=rgba(247,244,237,0.85)");     // 큐볼 원
        // 쿠션 조준(공을 안 맞히는 방향): 고스트 원만, 겹침 그림 없음
        f.calls.length = 0;
        ov.draw({ ...base, phi: Math.PI, guide: "straight" });
        expect(f.calls.filter((c) => c === "arc").length).toBeLessThan(arcs);
        expect(f.calls).not.toContain("fillStyle=rgba(200,68,46,1)");
    });

    it("예측 모드: 경로와 쿠션 번호를 그린다", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        f.calls.length = 0;
        ov.draw({
            ...base,
            guide: "preview",
            preview: {
                paths: [
                    { id: "white", points: [{ x: 0.5, y: 0.5, t: 0 }, { x: 0.5, y: 1.4, t: 0.5 }, { x: 1.39, y: 1.8, t: 0.9 }] },
                    { id: "red", points: [{ x: 0.5, y: 1.5, t: 0.5 }, { x: 0.5, y: 2.8, t: 1.1 }] },
                ],
                cushions: [{ index: 1, t: 0.9, x: 1.39, y: 1.8, cushion: "right" }],
                cushionCount: 1,
                contactIds: ["red"],
            },
            thickness: { value: 0.5, side: "left" },
        });
        const n = (name: string) => f.calls.filter((c) => c === name).length;
        expect(n("stroke")).toBeGreaterThanOrEqual(4);
        expect(n("fillText")).toBe(2); // 쿠션 번호 + 두께 라벨
        expect(n("arc")).toBeGreaterThanOrEqual(3); // 쿠션 표식, 고스트 원, 접촉 원호
    });

    it("예측 모드에 preview 가 없으면 직선 안내로 대체, 큐볼이 없으면 지우기만", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        f.calls.length = 0;
        ov.draw({ ...base, guide: "preview", preview: null });
        expect(f.calls).toContain("lineTo");
        f.calls.length = 0;
        ov.draw({ ...base, guide: "straight", cueBallId: "none" });
        expect(f.calls).toEqual(["setTransform", "clearRect"]);
        ov.clear();
        ov.dispose();
        ov.draw({ ...base, guide: "straight" }); // dispose 후엔 아무것도 안 함
    });

    it("labels.fullBall 이 있으면 정면 두께 라벨에 그 문구를 쓴다", () => {
        const f = fakeMount();
        const texts: string[] = [];
        // fillText 의 첫 인자만 따로 기록
        const ctx = f.canvas.getContext() as unknown as Record<string, unknown>;
        ctx.fillText = (text: string) => { texts.push(text); f.calls.push("fillText"); };
        const ov = new Overlay(f.mount, { labels: { fullBall: "정면" } });
        ov.draw({ ...base, guide: "straight", thickness: { value: 1, side: "center" } });
        expect(texts).toContain("정면");
        ov.dispose();
    });

    it("diamond: 레일 숫자 알약 19개 + 조준 강조 3개, 없으면 기존 그리기 그대로", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        const n = (name: string) => f.calls.filter((c) => c === name).length;
        // 흰 공(0.5, 0.5) 에서 왼쪽 레일 (R, 2.0) 을 겨눈다 — 공을 안 만나므로 두께 라벨 없음
        const phi = Math.atan2(1.5, R - 0.5);
        f.calls.length = 0;
        ov.draw({ ...base, phi, guide: "straight" });
        expect(n("fillText")).toBe(0);
        const plain = f.calls.slice();

        const diamond = overlayDiamond(balls, "white", phi, T, createNumbersCache())!;
        expect(diamond.aim).not.toBeNull();
        f.calls.length = 0;
        ov.draw({ ...base, phi, guide: "straight", diamond });
        expect(n("fillText")).toBe(19 + 3);
        expect(f.calls.length).toBeGreaterThan(plain.length);
        expect(f.props.font).toMatch(/^12px /);

        // 조준이 무효(aim=null)여도 라벨은 그린다
        f.calls.length = 0;
        ov.draw({ ...base, phi, guide: "straight", diamond: { numbers: diamond.numbers, aim: null } });
        expect(n("fillText")).toBe(19);

        // diamond 없음(undefined/null) → 이전과 같은 호출 순서
        f.calls.length = 0;
        ov.draw({ ...base, phi, guide: "straight", diamond: null });
        expect(f.calls).toEqual(plain);
        ov.dispose();
    });

    it("리사이즈하면 마지막 상태를 다시 그린다", () => {
        const f = fakeMount();
        const ov = new Overlay(f.mount);
        ov.draw({ ...base, guide: "straight" });
        f.calls.length = 0;
        (f.mount as unknown as { clientWidth: number }).clientWidth = 400;
        ov.resize();
        expect(f.canvas.width).toBe(400);
        expect(f.calls).toContain("arc");
    });
});
