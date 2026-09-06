/**
 * hash.ts 검증: FNV-1a 64 두 레인 구현을 BigInt 참조와 비트 단위 대조, 표준 벡터, 결과 해시의 민감도·결정론·불변.
 */
import { describe, it, expect } from "vitest";
import { fnv64Init, fnv64Byte, fnv64Bytes, fnv64Hex, fnv1a64String, hashResult, HashWriter } from "./hash";
import { mulberry32 } from "./rng";
import type { BallState, SimEvent } from "./types";

function refFnv(bytes: Iterable<number>): string {
    let h = 0xcbf29ce484222325n;
    for (const b of bytes) {
        h ^= BigInt(b & 0xff);
        h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, "0");
}

function ascii(s: string): number[] {
    return Array.from(s, (c) => c.charCodeAt(0));
}

describe("FNV-1a 64", () => {
    it("표준 테스트 벡터 (바이트 입력)", () => {
        expect(fnv64Hex(fnv64Init())).toBe("cbf29ce484222325");
        expect(fnv64Hex(fnv64Bytes(fnv64Init(), Uint8Array.from(ascii("a"))))).toBe("af63dc4c8601ec8c");
        expect(fnv64Hex(fnv64Bytes(fnv64Init(), Uint8Array.from(ascii("foobar"))))).toBe("85944171f73967e8");
    });

    it("무작위 바이트열 2000개에서 BigInt 참조 구현과 비트 단위 일치", () => {
        const rnd = mulberry32(12345);
        for (let n = 0; n < 2000; n++) {
            const len = Math.floor(rnd() * 64);
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = Math.floor(rnd() * 256);
            expect(fnv64Hex(fnv64Bytes(fnv64Init(), bytes))).toBe(refFnv(bytes));
        }
        // 0xff 만 긴 열: 자리올림 경로
        const ff = new Uint8Array(200).fill(0xff);
        expect(fnv64Hex(fnv64Bytes(fnv64Init(), ff))).toBe(refFnv(ff));
    });

    it("문자열 해시 = UTF-16 코드 단위 LE 바이트의 FNV-1a 64 (한글 포함)", () => {
        const samples = ["", "a", "대대", "JUNGDAE_KR", "{\"condition\":1}", "😀"];
        for (const s of samples) {
            const bytes: number[] = [];
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                bytes.push(c & 0xff, (c >>> 8) & 0xff);
            }
            expect(fnv1a64String(s)).toBe(refFnv(bytes));
            expect(fnv1a64String(s)).toMatch(/^[0-9a-f]{16}$/);
        }
    });

    it("fnv64Byte 는 상태를 갱신하고 같은 객체를 돌려준다", () => {
        const h = fnv64Init();
        expect(fnv64Byte(h, 0x61)).toBe(h);
        expect(fnv64Hex(h)).toBe("af63dc4c8601ec8c");
    });
});

describe("HashWriter", () => {
    it("f64bits 는 비트 패턴을 넣는다: +0 과 −0, 1 ulp 차이가 구분된다", () => {
        const a = new HashWriter(); a.f64bits(0);
        const b = new HashWriter(); b.f64bits(-0);
        expect(a.hex()).not.toBe(b.hex());
        const c = new HashWriter(); c.f64bits(1);
        const d = new HashWriter(); d.f64bits(1 + Number.EPSILON);
        expect(c.hex()).not.toBe(d.hex());
        // 리틀엔디언 8바이트 확인: 1.0 = 00 00 00 00 00 00 f0 3f
        const e = new HashWriter(); e.f64bits(1);
        expect(e.hex()).toBe(refFnv([0, 0, 0, 0, 0, 0, 0xf0, 0x3f]));
    });

    it("NaN 은 페이로드·부호와 무관하게 정규 quiet NaN 하나로 쓴다 (엔진별 NaN 비트 차이 방어)", () => {
        const f = new Float64Array(1);
        const u8 = new Uint8Array(f.buffer);
        // 부호 비트가 켜진 NaN 을 비트 조작으로 만든다 (V8 14.9 가 −NaN 에서 보존하는 패턴)
        u8.set([0, 0, 0, 0, 0, 0, 0xf8, 0xff]);
        const negNaN = f[0];
        expect(negNaN !== negNaN).toBe(true);
        const a = new HashWriter(); a.f64bits(NaN);
        const b = new HashWriter(); b.f64bits(negNaN);
        const c = new HashWriter(); c.f64bits(0 / 0);
        expect(a.hex()).toBe(b.hex());
        expect(a.hex()).toBe(c.hex());
        expect(a.hex()).toBe(refFnv([0, 0, 0, 0, 0, 0, 0xf8, 0x7f]));
        // Infinity 는 NaN 이 아니므로 그대로
        const d = new HashWriter(); d.f64bits(Infinity);
        expect(d.hex()).toBe(refFnv([0, 0, 0, 0, 0, 0, 0xf0, 0x7f]));
    });

    it("str 는 길이 접두사를 붙여 경계가 구분된다", () => {
        const a = new HashWriter(); a.str("ab"); a.str("c");
        const b = new HashWriter(); b.str("a"); b.str("bc");
        expect(a.hex()).not.toBe(b.hex());
    });
});

describe("hashResult", () => {
    const R = 0.03075;
    const events: SimEvent[] = [
        { type: "transition", t: 0.1, ids: ["white"], from: "sliding", to: "rolling" },
        { type: "ball-cushion", t: 0.5, ids: ["white"], cushion: "top" },
        { type: "ball-ball", t: 0.9, ids: ["red", "white"] },
    ];
    const final: BallState[] = [
        { id: "white", r: [0.3, 0.4, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" },
        { id: "red", r: [0.7, 1.9, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" },
    ];
    const base = hashResult(events, final);

    it("16진 16자리, 같은 입력(다른 객체) → 같은 값", () => {
        expect(base).toMatch(/^[0-9a-f]{16}$/);
        const copyEvents = JSON.parse(JSON.stringify(events)) as SimEvent[];
        const copyFinal = JSON.parse(JSON.stringify(final)) as BallState[];
        expect(hashResult(copyEvents, copyFinal)).toBe(base);
    });

    it("이벤트의 어떤 필드가 바뀌어도 값이 달라진다", () => {
        const mutate = (i: number, patch: Partial<SimEvent>) => {
            const ev = events.map((e, k) => (k === i ? ({ ...e, ...patch } as SimEvent) : e));
            return hashResult(ev, final);
        };
        expect(mutate(0, { t: 0.1 + Number.EPSILON * 0.1 })).not.toBe(base);     // 1 ulp
        expect(mutate(0, { to: "spinning" } as Partial<SimEvent>)).not.toBe(base);
        expect(mutate(0, { from: "rolling" } as Partial<SimEvent>)).not.toBe(base);
        expect(mutate(1, { cushion: "bottom" } as Partial<SimEvent>)).not.toBe(base);
        expect(mutate(1, { ids: ["red"] } as Partial<SimEvent>)).not.toBe(base);
        expect(mutate(2, { ids: ["white", "red"] } as Partial<SimEvent>)).not.toBe(base);
        expect(mutate(2, { type: "ball-cushion", cushion: "left", ids: ["red"] } as Partial<SimEvent>)).not.toBe(base);
        // 순서·개수
        expect(hashResult([events[1], events[0], events[2]], final)).not.toBe(base);
        expect(hashResult(events.slice(0, 2), final)).not.toBe(base);
        expect(hashResult([], final)).not.toBe(base);
    });

    it("최종 상태의 어떤 필드가 바뀌어도 값이 달라진다", () => {
        const mutate = (i: number, patch: Partial<BallState>) => {
            const f = final.map((b, k) => (k === i ? { ...b, ...patch } : b));
            return hashResult(events, f);
        };
        expect(mutate(0, { r: [0.3 + Number.EPSILON, 0.4, R] })).not.toBe(base);
        expect(mutate(0, { v: [0, -0, 0] })).not.toBe(base);                     // −0
        expect(mutate(1, { w: [0, 0, 1e-300] })).not.toBe(base);
        expect(mutate(1, { state: "rolling" })).not.toBe(base);
        expect(mutate(1, { id: "red1" })).not.toBe(base);
        expect(hashResult(events, final.slice(0, 1))).not.toBe(base);
    });

    it("final 의 배열 순서는 값에 영향이 없다 (id 사전순으로 넣는다)", () => {
        expect(hashResult(events, [final[1], final[0]])).toBe(base);
        const three: BallState[] = [...final, { id: "yellow", r: [0.1, 0.2, R], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" }];
        const h = hashResult(events, three);
        expect(hashResult(events, [three[2], three[0], three[1]])).toBe(h);
        expect(hashResult(events, [three[1], three[2], three[0]])).toBe(h);
        expect(h).not.toBe(base);
    });

    it("입력을 변형하지 않는다 (얼린 입력)", () => {
        const fe = Object.freeze(events.map((e) => Object.freeze({ ...e })));
        const ff = Object.freeze(final.map((b) => Object.freeze({ ...b, r: Object.freeze([...b.r]) as BallState["r"] })));
        expect(hashResult(fe, ff)).toBe(base);
    });
});
