import { describe, it, expect } from "vitest";
import { parseItunesLookup } from "./appMeta";

describe("parseItunesLookup", () => {
    it("첫 결과의 버전을 읽는다", () => {
        expect(parseItunesLookup({ resultCount: 1, results: [{ version: "1.2" }] })).toBe("1.2");
        expect(parseItunesLookup({ results: [{ version: " 1.10.3 " }] })).toBe("1.10.3");
    });
    it("결과가 없거나 모양이 다르면 null", () => {
        expect(parseItunesLookup({ resultCount: 0, results: [] })).toBeNull();
        expect(parseItunesLookup({ results: [{ version: "beta" }] })).toBeNull();
        expect(parseItunesLookup({ results: [{}] })).toBeNull();
        expect(parseItunesLookup(null)).toBeNull();
        expect(parseItunesLookup("x")).toBeNull();
    });
});
