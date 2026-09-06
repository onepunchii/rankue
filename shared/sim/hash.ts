/**
 * hash.ts — 결과 해시 (FNV-1a 64비트).
 *
 * 두 기기가 같은 샷을 돌려 같은 이벤트 열·같은 최종 상태를 얻었는지 한 문자열로 비교하기 위한 해시.
 * 부동소수점 값은 십진 문자열이 아니라 Float64 비트 패턴(리틀엔디언 8바이트)을 그대로 넣는다 —
 * 마지막 비트 하나가 달라도 해시가 달라져야 결정론 위반을 잡을 수 있기 때문이다.
 *
 * FNV-1a 64 (Fowler–Noll–Vo, 공개 알고리즘)
 *   h = 0xcbf29ce484222325; 바이트마다 h ^= byte; h *= 0x100000001b3 (mod 2^64)
 * JS 에는 64비트 정수 산술이 없고 BigInt 는 느리므로 h 를 (hi, lo) 두 32비트 레인으로 든다.
 *   소수 P = 2^40 + 0x1b3 이므로
 *   (hi·2^32 + lo)·P mod 2^64 = lo·0x1b3 + [ (lo << 8) + hi·0x1b3 + carry(lo·0x1b3) ]·2^32
 *   lo·0x1b3 은 2^41 미만이라 double 로 정확하고, hi·0x1b3 의 하위 32비트는 Math.imul 이 정확하다.
 * (hash.test.ts 가 BigInt 참조 구현과 비트 단위로 대조한다.)
 *
 * 바이트 스트림 규약 (버전 2.0.0 — 바꾸면 golden 픽스처가 전부 갈리므로 ENGINE_VERSION 을 올릴 것)
 *   u32 이벤트 수, 이벤트마다 [str type][f64 t][u32 ids 수][str id…][str cushion|from|to…]
 *   u32 공 수, 공마다 [str id][f64 r×3][f64 v×3][f64 w×3][str state]
 *   str = u32 길이 + UTF-16 코드 단위(각 2바이트 LE). 길이 접두사가 있어 "ab"+"c" 와 "a"+"bc" 가 구분된다.
 * 초월함수·Node API 없음. 입력 불변.
 */
import type { BallState, SimEvent } from "./types";

const FNV_OFFSET_HI = 0xcbf29ce4;
const FNV_OFFSET_LO = 0x84222325;
/** FNV 64 소수 0x00000100 000001b3 의 하위 워드 하위 비트. 상위 워드는 2^8 (= 0x100) 이라 시프트로 처리. */
const FNV_PRIME_LO = 0x1b3;

/** 64비트 FNV-1a 상태. 두 레인 모두 부호 없는 32비트 정수로 유지한다. */
export interface Fnv64 {
    hi: number;
    lo: number;
}

export function fnv64Init(): Fnv64 {
    return { hi: FNV_OFFSET_HI, lo: FNV_OFFSET_LO };
}

/** 바이트 하나를 흡수한다 (h ^= b; h *= P). 상태 객체를 갱신하고 그대로 돌려준다. */
export function fnv64Byte(h: Fnv64, byte: number): Fnv64 {
    const lo = (h.lo ^ (byte & 0xff)) >>> 0;
    const hi = h.hi;
    // lo · 0x1b3 < 2^41 → double 로 정확. 하위 32비트와 자리올림을 나눈다.
    const p = lo * FNV_PRIME_LO;
    const pLo = p >>> 0;
    const carry = Math.floor(p / 4294967296);
    // 상위 워드: lo·2^8 (2^40 항) + hi·0x1b3 + carry, mod 2^32
    const newHi = (Math.imul(hi, FNV_PRIME_LO) + (lo << 8) + carry) >>> 0;
    h.hi = newHi;
    h.lo = pLo;
    return h;
}

export function fnv64Bytes(h: Fnv64, bytes: Uint8Array): Fnv64 {
    for (let i = 0; i < bytes.length; i++) fnv64Byte(h, bytes[i]);
    return h;
}

/** 16진 16자리 (상위 워드 먼저). */
export function fnv64Hex(h: Fnv64): string {
    return h.hi.toString(16).padStart(8, "0") + h.lo.toString(16).padStart(8, "0");
}

/** 문자열의 UTF-16 코드 단위를 리틀엔디언 2바이트씩 FNV-1a 64 로 해시한다. */
export function fnv1a64String(s: string): string {
    const h = fnv64Init();
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        fnv64Byte(h, c & 0xff);
        fnv64Byte(h, (c >>> 8) & 0xff);
    }
    return fnv64Hex(h);
}

// ---------------------------------------------------------------------------
// 바이트 스트림 작성기 (증가 버퍼)
// ---------------------------------------------------------------------------

/**
 * 결과를 바이트 열로 직렬화하는 작성기. 해시만이 목적이라 버퍼를 만들지 않고 바이트를 바로 FNV 상태에
 * 흘려 넣는다(할당 없음). DataView 로 Float64 비트 패턴을 리틀엔디언으로 읽는다.
 */
export class HashWriter {
    private readonly h = fnv64Init();
    private readonly f64 = new Float64Array(1);
    private readonly bytes = new Uint8Array(this.f64.buffer);
    private readonly view = new DataView(this.f64.buffer);

    u32(x: number): void {
        const v = x >>> 0;
        fnv64Byte(this.h, v & 0xff);
        fnv64Byte(this.h, (v >>> 8) & 0xff);
        fnv64Byte(this.h, (v >>> 16) & 0xff);
        fnv64Byte(this.h, (v >>> 24) & 0xff);
    }

    /** double 의 IEEE-754 비트 패턴 8바이트(LE). −0 과 +0, NaN 페이로드까지 구분한다. */
    f64bits(x: number): void {
        this.view.setFloat64(0, x, true);
        for (let i = 0; i < 8; i++) fnv64Byte(this.h, this.bytes[i]);
    }

    /** u32 길이 + UTF-16 코드 단위(LE 2바이트). */
    str(s: string): void {
        this.u32(s.length);
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            fnv64Byte(this.h, c & 0xff);
            fnv64Byte(this.h, (c >>> 8) & 0xff);
        }
    }

    vec3(v: readonly [number, number, number]): void {
        this.f64bits(v[0]);
        this.f64bits(v[1]);
        this.f64bits(v[2]);
    }

    hex(): string {
        return fnv64Hex(this.h);
    }
}

/** 이벤트 하나를 작성기에 넣는다. type 별 부가 필드(cushion / from·to)까지. */
export function writeEvent(w: HashWriter, e: SimEvent): void {
    w.str(e.type);
    w.f64bits(e.t);
    w.u32(e.ids.length);
    for (let i = 0; i < e.ids.length; i++) w.str(e.ids[i]);
    if (e.type === "ball-cushion") {
        w.str(e.cushion);
    } else if (e.type === "transition") {
        w.str(e.from);
        w.str(e.to);
    }
}

export function writeBall(w: HashWriter, b: BallState): void {
    w.str(b.id);
    w.vec3(b.r);
    w.vec3(b.v);
    w.vec3(b.w);
    w.str(b.state);
}

/**
 * 이벤트 목록 + 최종 상태의 비트 단위 해시 (16진 16자리). 두 기기의 값이 다르면 결정론이 깨진 것이다.
 * 계약: README "hash.ts". 입력은 읽기만 한다.
 */
export function hashResult(events: readonly SimEvent[], final: readonly BallState[]): string {
    const w = new HashWriter();
    w.u32(events.length);
    for (let i = 0; i < events.length; i++) writeEvent(w, events[i]);
    w.u32(final.length);
    for (let i = 0; i < final.length; i++) writeBall(w, final[i]);
    return w.hex();
}
