/**
 * version.ts 검증: ENGINE_VERSION 형식, paramsHash 의 키 순서 독립성·민감도, stableStringify.
 */
import { describe, it, expect } from "vitest";
import { ENGINE_VERSION, paramsHash, stableStringify } from "./version";
import { DEFAULT_PARAMS, TABLES, DEFAULT_CUE, type SimParams } from "./params";

describe("version", () => {
    it("ENGINE_VERSION 은 semver 2.0.0", () => {
        expect(ENGINE_VERSION).toBe("2.0.0");
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
    });
});
