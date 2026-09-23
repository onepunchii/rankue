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
    /**
     * ToJoinSheet 와 같은 계산 — 이미 팔린 자리만큼 GUEST + 남은 자리만큼 OPEN. **HOST 는 없다.**
     *
     * 2026-09-23 오너("확정 되었다 취소 했는데 조인돌리기시 해당 인원이 포함되어있는거 같음"):
     * 예전에는 첫 칸이 HOST 였다. 자리 규칙(normalizeSlots)이 첫 칸을 HOST 로 못 박았기 때문인데,
     * 매장 매니저는 자기가 파는 팀에서 치지 않으니 아무도 안 앉는 **유령 자리**였다 — 그래서 OPEN 은
     * 최대 3이었고, 한 자리도 안 팔린 티타임조차 "1자리는 이미 팔렸다"고 적어야 했다.
     * 규칙을 넓혀 호스트 없는 구성을 허용했고(shared/golfJoin.ts), 여기서 그 결과를 굳힌다.
     */
    const build = (open: number, genders: SlotGender[]): JoinSlot[] => {
        const taken = MAX_SLOTS - open;
        return [
            ...Array.from({ length: taken }, (): JoinSlot => ({ role: "GUEST", gender: "ANY" })),
            ...genders.slice(0, open).map((g): JoinSlot => ({ role: "OPEN", gender: g })),
        ];
    };

    it("남은 자리 1·2·3·4 모두 네 자리가 되고 서버 규칙을 통과한다", () => {
        for (const open of [1, 2, 3, 4]) {
            const slots = build(open, ["ANY", "M", "F", "ANY"]);
            expect(slots).toHaveLength(MAX_SLOTS);
            const ok = normalizeSlots(slots);
            expect(ok, `남은 자리 ${open}`).not.toBeNull();
            expect(openSlotCount(ok!)).toBe(open);
        }
    });

    it("유령 자리를 안 만든다 — 자리 목록에 HOST 가 없고, 4자리면 넷 다 모집이다", () => {
        expect(build(2, ["ANY", "ANY"]).some((s) => s.role === "HOST")).toBe(false);
        expect(build(4, ["ANY", "ANY", "ANY", "ANY"]).every((s) => s.role === "OPEN")).toBe(true);
        // 'GUEST' 로 적은 찬 자리도 전부 팔린 것으로 세어진다(정원 = 모집 자리 수)
        expect(openSlotCount(build(1, ["M"]))).toBe(1);
    });

    it("시트가 1~4 를 보여 주고 첫 칸을 호스트로 그리지 않는다", () => {
        const sheet = code("client/src/golf/components/booking/ToJoinSheet.tsx");
        expect(sheet).toContain("{[1, 2, 3, 4].map(");
        expect(sheet).toContain("hostLabel={null}");
        expect(sheet).not.toContain('role: "HOST"');
    });
});
