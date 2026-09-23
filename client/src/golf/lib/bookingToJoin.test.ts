import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MAX_SLOTS, normalizeSlots, openSlotCount, type JoinSlot, type SlotGender } from "@shared/golfJoin";

/**
 * 2026-09-23 오너: "부킹매니저가 부킹을 올릴 때 굳이 4자리 3자리 이렇게 올릴 필요가 없지 않을까?
 *   … 내가 올린 부킹 내역에서 조인 돌리기로 버튼이 있고 그때 해당 옵션을 넣고 바로 조인으로 전환시키게."
 * 화면 쪽에서 그 결정이 조용히 뒤집히는 두 가지를 지킨다 — 올리기 시트가 다시 자리를 묻는 것,
 * 그리고 전환 시트가 만드는 자리가 서버 규칙(normalizeSlots)과 어긋나는 것.
 */
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 주석을 뺀 코드만 — 머리말이 옛 결정을 **설명하려고** 그 이름을 적는 것까지 어긋남으로 세면 안 된다. */
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

describe("올리기 시트는 자리를 묻지 않는다", () => {
    const sheet = code("client/src/golf/components/booking/BookingCreateSheet.tsx");

    it("부킹은 늘 부킹으로 올라간다 — 조인으로 바꿔 보내는 길이 없다", () => {
        expect(sheet).toContain('listingType: "BOOKING"');
        expect(sheet).not.toContain('listingType: "JOIN"');
        expect(sheet).not.toContain("SeatsField");
        expect(sheet).not.toContain("joinSlots");
        expect(sheet).not.toContain("joinHeadcount");
    });
});

describe("전환 시트가 만드는 자리", () => {
    /** ToJoinSheet 와 같은 계산 — 첫 칸 HOST + 팔린 자리만큼 GUEST + 남은 자리만큼 OPEN. */
    const build = (open: number, genders: SlotGender[]): JoinSlot[] => {
        const taken = MAX_SLOTS - open;
        return [
            { role: "HOST", gender: "ANY" },
            ...Array.from({ length: taken - 1 }, (): JoinSlot => ({ role: "GUEST", gender: "ANY" })),
            ...genders.slice(0, open).map((g): JoinSlot => ({ role: "OPEN", gender: g })),
        ];
    };

    it("남은 자리 1·2·3 모두 네 자리가 되고 서버 규칙을 통과한다", () => {
        for (const open of [1, 2, 3]) {
            const slots = build(open, ["ANY", "M", "F"]);
            expect(slots).toHaveLength(MAX_SLOTS);
            const ok = normalizeSlots(slots);
            expect(ok, `남은 자리 ${open}`).not.toBeNull();
            expect(openSlotCount(ok!)).toBe(open);
        }
    });

    it("남은 자리가 4면 규칙을 못 지킨다 — 그래서 시트에 4는 없다(한 자리도 안 팔렸으면 그냥 부킹이다)", () => {
        // GUEST 가 -1개가 되어 자리 다섯을 만들 수 없다. 칩이 1~3 뿐인 이유를 못으로 박아 둔다.
        const slots = build(4, ["ANY", "ANY", "ANY", "ANY"]);
        expect(slots.length).toBeGreaterThan(MAX_SLOTS);
        expect(normalizeSlots(slots)).toBeNull();
    });

    it("시트가 실제로 1~3 만 보여 주고 첫 칸을 호스트로 그리지 않는다", () => {
        const sheet = code("client/src/golf/components/booking/ToJoinSheet.tsx");
        expect(sheet).toContain("{[1, 2, 3].map(");
        expect(sheet).toContain("hostLabel={null}");
    });
});
