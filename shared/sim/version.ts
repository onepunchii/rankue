/**
 * version.ts — 엔진 버전과 파라미터 해시.
 *
 * ENGINE_VERSION: 물리·해시 규약이 바뀌면 올린다. 서버는 세션에 이 값을 기록해 리플레이가 어느 엔진으로
 * 만들어졌는지 안다(다른 버전의 해시는 비교하지 않는다).
 * paramsHash: SimParams 를 키 정렬 JSON 으로 직렬화해 FNV-1a 64 로 해시. 테이블 치수·공 파라미터·큐·
 * 쿠션 모델·컨디션 중 하나라도 다르면 값이 달라져 래더(랭킹) 기간을 가른다. 키를 정렬하므로 객체 리터럴의
 * 속성 순서와 무관하고, 숫자는 JSON.stringify 의 최단 왕복 표현이라(ECMAScript 규정) 엔진 간에 같다.
 */
import type { SimParams } from "./params";
import { fnv1a64String } from "./hash";

export const ENGINE_VERSION = "2.0.0";

/** 키를 정렬한 결정론적 JSON. 배열은 순서 유지, undefined 속성은 JSON.stringify 처럼 생략. */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
        let s = "[";
        for (let i = 0; i < value.length; i++) {
            if (i > 0) s += ",";
            s += stableStringify(value[i]);
        }
        return s + "]";
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    let s = "{";
    let first = true;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = obj[k];
        if (v === undefined) continue;
        if (!first) s += ",";
        first = false;
        s += JSON.stringify(k) + ":" + stableStringify(v);
    }
    return s + "}";
}

/** 파라미터 해시 (16진 16자리). 같은 물리 파라미터 → 같은 값. */
export function paramsHash(params: SimParams): string {
    return fnv1a64String(stableStringify(params));
}
