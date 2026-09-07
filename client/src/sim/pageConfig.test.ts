import { describe, it, expect } from "vitest";
import { buildConfig } from "./setupPresets";
import { decodePageConfig, encodePageConfig, parsePageConfig, readCfgParam, simulatorPath } from "./pageConfig";

const cfg3c = buildConfig({ gameType: "3c", target: 25, inningCap: 20, rules: { ruleSet: "pba" } });
const cfg4c = buildConfig({ gameType: "4c", target: 80, rules: { threeCushionDouble: true }, condition: 1.15, cushionModel: "mathavan2010" });

describe("pageConfig", () => {
    it("encode → decode 는 설정과 record 를 그대로 돌려준다", () => {
        const enc = encodePageConfig({ config: cfg3c, record: false });
        expect(enc).not.toMatch(/[+/=]/); // base64url
        expect(decodePageConfig(enc)).toEqual({ config: cfg3c, record: false });
        expect(decodePageConfig(encodePageConfig({ config: cfg4c, record: true }))).toEqual({ config: cfg4c, record: true });
    });

    it("record 가 없으면 true, 한글 등 비 ASCII 도 왕복한다", () => {
        const enc = encodePageConfig({ config: cfg3c, record: true });
        expect(decodePageConfig(enc)?.record).toBe(true);
        const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(enc.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - enc.length % 4) % 4)), (c) => c.charCodeAt(0))));
        expect(raw.record).toBe(true);
        expect(parsePageConfig({ ...cfg3c, record: undefined })?.record).toBe(true);
    });

    it("깨진 입력은 null — 빈 값·잘못된 base64·JSON 아님·종목 없음·다마수 범위 밖·규칙 종목 불일치", () => {
        expect(decodePageConfig(null)).toBeNull();
        expect(decodePageConfig("")).toBeNull();
        expect(decodePageConfig("!!!not-base64!!!")).toBeNull();
        expect(decodePageConfig(btoa("not json"))).toBeNull();
        expect(parsePageConfig(null)).toBeNull();
        expect(parsePageConfig([])).toBeNull();
        expect(parsePageConfig({ target: 15 })).toBeNull();
        expect(parsePageConfig({ gameType: "3c", target: 0 })).toBeNull();
        expect(parsePageConfig({ gameType: "3c", target: 1000 })).toBeNull();
        expect(parsePageConfig({ gameType: "3c", target: 15, rules: { gameType: "4c" } })).toBeNull();
    });

    it("모르는 필드·범위 밖 값은 buildConfig 로 정규화된다", () => {
        const pc = parsePageConfig({
            gameType: "4c", target: 50, tableId: "NOPE", cushionModel: "weird", condition: 9, inningCap: 7, extra: 1,
            rules: { gameType: "4c", pointUnit: 999, threeCushionDouble: "yes", passiveOpponentContactIsFoul: true },
        });
        expect(pc).not.toBeNull();
        expect(pc!.config).toEqual(buildConfig({
            gameType: "4c", target: 50, condition: 9, inningCap: 7,
            rules: { threeCushionDouble: false, passiveOpponentContactIsFoul: true },
        }));
        expect(pc!.config.tableId).toBe("JUNGDAE_KR");
        expect(pc!.config.condition).toBe(1.2);
        expect(pc!.config.inningCap).toBe(0);
        expect((pc!.config.rules as { pointUnit: number }).pointUnit).toBe(10);
        expect("extra" in pc!.config).toBe(false);
    });

    it("finishType 은 유효한 값만 살리고 나머지는 none", () => {
        expect(parsePageConfig({ gameType: "3c", target: 15, finishType: "3c" })?.config.finishType).toBe("3c");
        expect(parsePageConfig({ gameType: "3c", target: 15, finishType: "x" })?.config.finishType).toBe("none");
    });

    it("readCfgParam 은 ? 유무와 무관하게 cfg 를 읽고 simulatorPath 는 쿼리를 만든다", () => {
        const path = simulatorPath({ config: cfg3c, record: true });
        expect(path.startsWith("/online-game?cfg=")).toBe(true);
        const search = path.slice(path.indexOf("?"));
        expect(readCfgParam(search)).toBe(encodePageConfig({ config: cfg3c, record: true }));
        expect(readCfgParam(search.slice(1))).toBe(readCfgParam(search));
        expect(readCfgParam("?lang=ko")).toBeNull();
        expect(readCfgParam("")).toBeNull();
        expect(readCfgParam(undefined)).toBeNull();
        expect(decodePageConfig(readCfgParam(search))).toEqual({ config: cfg3c, record: true });
    });
});

describe("플레이 모드 왕복", () => {
    it("reality 는 그대로 살아오고, 모르는 값·없음은 normal", () => {
        const reality = buildConfig({ gameType: "3c", target: 15, mode: "reality" });
        const pc = decodePageConfig(encodePageConfig({ config: reality, record: false }));
        expect(pc!.config.mode).toBe("reality");
        expect(pc!.config.cushionModel).toBe("mathavan2010");
        expect(pc!.config.condition).toBe(1.1);
        expect(parsePageConfig({ gameType: "3c", target: 15, mode: "weird" })!.config.mode).toBe("normal");
        expect(parsePageConfig({ gameType: "3c", target: 15 })!.config.mode).toBe("normal");
    });
});
