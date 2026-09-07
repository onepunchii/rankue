/**
 * version.ts — 엔진 버전과 파라미터 해시.
 *
 * ENGINE_VERSION: 물리·해시 규약이 바뀌면 올린다. 서버는 세션에 이 값을 기록해 리플레이가 어느 엔진으로
 * 만들어졌는지 안다(다른 버전의 해시는 비교하지 않는다).
 *   2.1.0 (2026-09-07): 팁 오프셋을 큐 축에 수직한 평면에서 잼(θ>0 물리 변경), 결과 해시의 final 을 id 순으로·NaN 정규화,
 *                       paramsHash 를 물리 필드 화이트리스트로, BallParams.eE 추가, 접촉 대역 재접근 감지.
 * paramsHash: SimParams 중 **물리에 영향을 주는 필드만**(physicsParams) 골라 키 정렬 JSON 으로 직렬화해 FNV-1a 64 로
 * 해시. 테이블 치수·코 높이·공 파라미터·큐·쿠션 모델·컨디션 중 하나라도 다르면 값이 달라져 래더(랭킹) 기간을 가른다.
 * UI 표시명(table.name)처럼 물리와 무관한 필드는 넣지 않는다 — 문구·i18n 이 래더를 가르면 안 된다
 * (41-determinism-review 2.6). 키를 정렬하므로 객체 리터럴의 속성 순서와 무관하고, 숫자는 JSON.stringify 의 최단
 * 왕복 표현이라(ECMAScript 규정) 엔진 간에 같다. 물리 필드를 새로 추가하면 physicsParams 에도 넣어야 한다
 * (version.test.ts 가 BallParams·CueParams·TableSpec 의 모든 키가 포함됐는지 검사한다).
 */
import type { SimParams } from "./params.js";
import { fnv1a64String } from "./hash.js";

export const ENGINE_VERSION = "2.1.0";

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

/** 해시 대상 — SimParams 에서 물리에 영향을 주는 필드만 (table.name 제외). 필드는 명시적으로 나열한다. */
export function physicsParams(params: SimParams): Record<string, unknown> {
    const t = params.table, b = t.ball, c = params.cue;
    return {
        table: {
            id: t.id,
            width: t.width,
            length: t.length,
            cushionHeight: t.cushionHeight,
            ball: {
                m: b.m, R: b.R, muS: b.muS, muR: b.muR, spinDecel: b.spinDecel, eB: b.eB,
                muBB: { a: b.muBB.a, b: b.muBB.b, c: b.muBB.c },
                eC: b.eC, eE: b.eE, fC: b.fC, g: b.g,
            },
        },
        cue: { M: c.M, tipEfficiency: c.tipEfficiency, endmassRatio: c.endmassRatio, maxOffset: c.maxOffset },
        cushionModel: params.cushionModel,
        condition: params.condition,
    };
}

/** 파라미터 해시 (16진 16자리). 같은 물리 파라미터 → 같은 값. 표시명 등 물리 밖 필드는 무시한다. */
export function paramsHash(params: SimParams): string {
    return fnv1a64String(stableStringify(physicsParams(params)));
}
