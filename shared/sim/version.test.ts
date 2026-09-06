/**
 * version.ts 검증: ENGINE_VERSION 형식, paramsHash 의 키 순서 독립성·민감도, stableStringify.
 */
import { describe, it, expect } from "vitest";
import { ENGINE_VERSION, paramsHash, physicsParams, stableStringify } from "./version";
import { DEFAULT_PARAMS, TABLES, DEFAULT_CUE, type SimParams } from "./params";

describe("version", () => {
    it("ENGINE_VERSION 은 semver 2.1.0", () => {
        expect(ENGINE_VERSION).toBe("2.1.0");
        expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("stableStringify: 키 정렬, 중첩·배열·undefined·null·문자열 이스케이프", () => {
        expect(stableStringify({ b: 1, a: [3, { z: null, y: "q\"" }], c: undefined })).toBe("{\"a\":[3,{\"y\":\"q\\\"\",\"z\":null}],\"b\":1}");
        expect(stableStringify(1.5)).toBe("1.5");
        expect(stableStringify("x")).toBe("\"x\"");
        expect(stableStringify(null)).toBe("null");
    });

    it("paramsHash: 16진 16자리, 속성 순서와 무관, 같은 값 → 같은 해시", () => {
        const h = paramsHash(DEFAULT_PARAMS);
        expect(h).toMatch(/^[0-9a-f]{16}$/);
        const reordered: SimParams = {
            condition: 1,
            cushionModel: "han2005",
            cue: { maxOffset: 0.5, endmassRatio: 12, tipEfficiency: 0.88, M: 0.52 },
            table: { ...TABLES.DAEDAE, ball: { ...TABLES.DAEDAE.ball } },
        };
        expect(paramsHash(reordered)).toBe(h);
    });

    it("paramsHash: 테이블·공·큐·모델·컨디션 중 하나만 바뀌어도 달라진다", () => {
        const h = paramsHash(DEFAULT_PARAMS);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: TABLES.JUNGDAE_KR })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: { ...TABLES.DAEDAE, ball: { ...TABLES.DAEDAE.ball, muR: 0.0101 } } })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, cue: { ...DEFAULT_CUE, M: 0.53 } })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, cushionModel: "mathavan2010" })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, condition: 1.05 })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: { ...TABLES.DAEDAE, cushionHeight: 0.0371 } })).not.toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: { ...TABLES.DAEDAE, ball: { ...TABLES.DAEDAE.ball, eE: 0.9 } } })).not.toBe(h);
    });

    it("paramsHash: 물리와 무관한 table.name 은 무시한다 (표시명·i18n 이 래더를 가르지 않는다)", () => {
        const h = paramsHash(DEFAULT_PARAMS);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: { ...TABLES.DAEDAE, name: "대대 (구형)" } })).toBe(h);
        expect(paramsHash({ ...DEFAULT_PARAMS, table: { ...TABLES.DAEDAE, name: "" } })).toBe(h);
        // 알 수 없는 추가 속성도 무시
        expect(paramsHash({ ...DEFAULT_PARAMS, extra: 1 } as unknown as SimParams)).toBe(h);
    });

    it("physicsParams 는 BallParams·CueParams·TableSpec(name 제외)의 모든 키를 담는다 — 새 물리 필드를 빠뜨리면 실패", () => {
        const pp = physicsParams(DEFAULT_PARAMS) as { table: Record<string, unknown> & { ball: Record<string, unknown> }; cue: Record<string, unknown> };
        for (const k of Object.keys(TABLES.DAEDAE.ball)) expect(pp.table.ball, `ball.${k}`).toHaveProperty(k);
        for (const k of Object.keys(DEFAULT_CUE)) expect(pp.cue, `cue.${k}`).toHaveProperty(k);
        for (const k of Object.keys(TABLES.DAEDAE)) if (k !== "name") expect(pp.table, `table.${k}`).toHaveProperty(k);
        expect(pp.table).not.toHaveProperty("name");
        expect(pp).toHaveProperty("cushionModel");
        expect(pp).toHaveProperty("condition");
    });
});
