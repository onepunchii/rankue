import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../db.js", () => ({ db: {} }));
const { publicPlaceName } = await import("./fishingPlaces.js");

/** 등록 이름이 사람 이름인 낚시터를 공개 화면에서 가린다(2026-10-21). 이름은 코드에 두지 않고 해시로만 — 시험도 실제 이름을 적지 않는다 */
describe("낚시터 공개 이름", () => {
    it("보통 이름은 그대로", () => {
        expect(publicPlaceName("자유로레저낚시터", "파주시", "기타")).toBe("자유로레저낚시터");
        expect(publicPlaceName("오형제", "안성시", "저수지")).toBe("오형제");
    });
    it("가린 이름은 '시군 · 종류 낚시터' 꼴 — 모든 공개 화면이 allPlaces 하나로 읽는다", () => {
        const src = readFileSync(resolve(__dirname, "fishingPlaces.ts"), "utf8");
        expect(src).toContain("name: publicPlaceName(String(x.name).trim(), x.sigungu ?? null, x.kind ?? null)");
        // 해시 목록에 든 이름이면 이 꼴이 된다(목록 밖 이름으로 꼴만 확인할 수 없으니, 시군 · 종류를 붙이는 셈을 따로 본다)
        expect(src).toContain("return `${area ? `${area} ` : \"\"}${kind ? `${kind} ` : \"\"}낚시터`;");
        expect(src).not.toMatch(/PERSON_NAME_HASHES = new Set\(\[[^\]]*[가-힣]/);   // 한글 이름을 그대로 두지 않는다
    });
});
