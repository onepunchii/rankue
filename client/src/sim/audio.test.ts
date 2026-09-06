import { describe, it, expect } from "vitest";
import { renderSound, SimAudio } from "./audio";
import type { SoundKind } from "./audioMapping";

describe("절차적 합성", () => {
    it.each<SoundKind>(["strike", "ball", "cushion"])("%s: 피크 1 로 정규화, 유한, 끝은 0, 결정론", kind => {
        const a = renderSound(kind, 48000);
        const b = renderSound(kind, 48000);
        expect(a.length).toBeGreaterThan(100);
        let peak = 0;
        for (const s of a) { expect(Number.isFinite(s)).toBe(true); peak = Math.max(peak, Math.abs(s)); }
        expect(peak).toBeCloseTo(1, 6);
        expect(Math.abs(a[a.length - 1])).toBe(0);
        expect(Array.from(a)).toEqual(Array.from(b));
    });
    it("쿠션이 공–공보다 길고, 공–공이 가장 짧다", () => {
        expect(renderSound("cushion", 44100).length).toBeGreaterThan(renderSound("strike", 44100).length);
        expect(renderSound("strike", 44100).length).toBeGreaterThan(renderSound("ball", 44100).length);
    });
});

/** 최소한의 가짜 Web Audio 그래프: 노드 생성·연결·start 를 기록만 한다. */
function fakeContext() {
    const started: { at: number; rate: number; gain: number }[] = [];
    const stopped: number[] = [];
    const makeParam = (v: number) => ({ value: v });
    const ctx = {
        currentTime: 10,
        sampleRate: 44100,
        state: "running",
        destination: {},
        resume: () => Promise.resolve(),
        createGain: () => ({ gain: makeParam(1), connect() {}, disconnect() {} }),
        createBuffer: (_ch: number, len: number, rate: number) => ({ length: len, sampleRate: rate, copyToChannel() {} }),
        createBufferSource() {
            const node = {
                buffer: null as unknown,
                playbackRate: makeParam(1),
                onended: null as null | (() => void),
                gainNode: null as { gain: { value: number } } | null,
                connect(g: { gain: { value: number } }) { node.gainNode = g; },
                disconnect() {},
                start(at: number) { started.push({ at, rate: node.playbackRate.value, gain: node.gainNode?.gain.value ?? -1 }); },
                stop() { stopped.push(1); },
            };
            return node;
        },
    };
    return { ctx: ctx as unknown as AudioContext, started, stopped };
}

describe("SimAudio", () => {
    it("컨텍스트가 없으면 조용히 no-op", () => {
        const a = new SimAudio(() => null);
        expect(() => { a.schedule([{ t: 0, kind: "strike", impulse: 3 }], 0); a.cancel(); a.setMuted(true); a.dispose(); }).not.toThrow();
    });
    it("이벤트 시각에 예약하고, 무음 이벤트는 건너뛰며, cancel 은 모두 멈춘다", () => {
        const { ctx, started, stopped } = fakeContext();
        const a = new SimAudio(() => ctx);
        a.schedule([
            { t: 0, kind: "strike", impulse: 3 },
            { t: 0.42, kind: "ball", impulse: 2 },
            { t: 0.9, kind: "cushion", impulse: 0.001 },
        ], 10.5);
        expect(started).toHaveLength(2);
        expect(started[0].at).toBeCloseTo(10.5, 12);
        expect(started[1].at).toBeCloseTo(10.92, 12);
        expect(started[0].gain).toBeGreaterThan(started[1].gain);
        expect(started[1].rate).toBeGreaterThan(0.85);
        expect(started[1].rate).toBeLessThan(1.15);
        a.cancel();
        expect(stopped).toHaveLength(2);
    });
    it("과거 시각은 지금으로 당겨 재생, 음소거는 마스터 게인만 바꾼다", () => {
        const { ctx, started } = fakeContext();
        const a = new SimAudio(() => ctx);
        a.setMuted(true);
        a.schedule([{ t: 0, kind: "strike", impulse: 3 }], 5);
        expect(started[0].at).toBe(10);
        expect(started[0].gain).toBeGreaterThan(0);
        expect(a.isMuted()).toBe(true);
    });
});
