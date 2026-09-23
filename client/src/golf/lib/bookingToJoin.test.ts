import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MAX_SLOTS, conversionSlots, convertibleSeats, normalizeSlots, openSlotCount, recruitCondition, seatsTaken } from "@shared/golfJoin";

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

describe("전환이 만드는 자리 — shared/golfJoin.conversionSlots", () => {
    /**
     * 자리 배열은 이제 **서버**가 만든다(2026-09-24). 화면이 보낸 배열을 믿으면 매니저가
     * "두 자리 팔렸는데 네 자리 남았다"고 적어 한 팀에 여섯 명을 받게 된다 — 화면은 '몇 자리 더'만 말한다.
     * 서버와 화면(미리보기)이 같은 함수를 부르므로, 그 함수의 규칙을 여기서 굳힌다.
     *
     * 규칙: [ GUEST × (4-sold-more) ] + [ OPEN × sold ] + [ OPEN × more ]
     *   sold  앱에서 팔린 자리(승인된 신청의 인원 합) — **OPEN 에 앉은 사람**이다(GUEST 로 접지 않는다).
     *   more  이제부터 더 받을 자리
     *   나머지 앱 밖에서 판 자리 = GUEST
     * 그래서 정원(openSlotCount) = sold + more, 찬 자리 = sold, 남은 자리 = more 가 **항등식으로** 맞는다.
     *
     * 2026-09-23 오너("확정 되었다 취소 했는데 조인돌리기시 해당 인원이 포함되어있는거 같음")로 넓힌
     * '호스트 없는 구성'도 그대로다 — 매장 매니저는 자기가 파는 팀에서 치지 않는다(유령 자리 금지).
     */
    it("팔린 자리가 없으면 예전(화면이 만들던 것)과 똑같다 — GUEST×(4-more) + OPEN×more", () => {
        for (const more of [1, 2, 3, 4]) {
            const slots = conversionSlots(0, more, ["ANY", "M", "F", "ANY"]);
            expect(slots, `${more}자리`).not.toBeNull();
            expect(slots).toHaveLength(MAX_SLOTS);
            expect(normalizeSlots(slots!)).not.toBeNull();
            expect(openSlotCount(slots!)).toBe(more);
            expect(slots!.filter((x) => x.role === "GUEST")).toHaveLength(MAX_SLOTS - more);
        }
    });

    it("오너 사례: 2자리 팔린 티타임에서 2자리를 더 받으면 정원 4·찬 자리 2·남은 자리 2", () => {
        // 2026-09-24 오너: "국수맘이 2명 신청했는데 … 2명이니깐 2명을 더 조인으로 전환해도되고 해야되는데"
        const slots = conversionSlots(2, 2, ["M", "F"])!;
        expect(slots).not.toBeNull();
        expect(slots.map((x) => x.role)).toEqual(["OPEN", "OPEN", "OPEN", "OPEN"]);
        expect(slots.map((x) => x.gender)).toEqual(["ANY", "ANY", "M", "F"]);   // 팔린 자리는 성별을 모른다
        expect(openSlotCount(slots)).toBe(4);            // 정원 = 팔린 2 + 받을 2
        expect(openSlotCount(slots) - 2).toBe(2);        // 남은 자리 = 2
        expect(normalizeSlots(slots)).not.toBeNull();
    });

    it("앱 밖에서 판 자리만 GUEST 다 — 2자리 팔린 티타임에서 1자리만 받으면 GUEST 1칸", () => {
        const slots = conversionSlots(2, 1, ["M"])!;
        expect(slots.map((x) => x.role)).toEqual(["GUEST", "OPEN", "OPEN", "OPEN"]);
        expect(openSlotCount(slots)).toBe(3);            // 정원 = 팔린 2 + 받을 1
    });

    it("팔린 자리보다 많이 받겠다고 하면 거부한다 — 한 팀은 넷을 넘지 않는다", () => {
        expect(conversionSlots(2, 3)).toBeNull();
        expect(conversionSlots(3, 2)).toBeNull();
        expect(conversionSlots(4, 1)).toBeNull();        // 네 자리가 다 팔렸으면 돌릴 자리가 없다
        expect(conversionSlots(0, 0)).toBeNull();        // 한 자리는 받아야 조인이다
        expect(conversionSlots(0, 5)).toBeNull();
    });

    it("남은 자리 상한 — convertibleSeats", () => {
        expect(convertibleSeats(0)).toBe(4);
        expect(convertibleSeats(2)).toBe(2);
        expect(convertibleSeats(4)).toBe(0);
        expect(convertibleSeats(9)).toBe(0);
    });

    it("팔린 자리는 **사람 수**로 센다 — 2명짜리 신청 하나는 두 자리다", () => {
        // 이걸 행 수로 세던 것이 오너가 본 버그의 뿌리다.
        expect(seatsTaken([{ headcount: 2 }])).toBe(2);
        expect(seatsTaken([{ headcount: 1 }, { headcount: 1 }])).toBe(2);
        expect(seatsTaken([])).toBe(0);
        // 조인 신청은 늘 1명이라 행 수와 같다 — 갈아끼워도 조인 쪽 숫자는 안 바뀐다.
        expect(seatsTaken([{ headcount: 1 }, { headcount: 1 }, { headcount: 1 }])).toBe(3);
        // 값이 비어 있어도 한 자리로 본다(사람이 0명인 신청은 없다).
        expect(seatsTaken([{ headcount: null }, {}])).toBe(2);
    });

    it("모집 조건은 **이제부터 받을** 자리만 본다 — 팔린 자리의 '무관'이 섞이면 늘 성별무관이 된다", () => {
        expect(recruitCondition(["M", "M"])).toBe("남성");
        expect(recruitCondition(["F"])).toBe("여성");
        expect(recruitCondition(["M", "F"])).toBe("성별무관");
        expect(recruitCondition([])).toBe("성별무관");
    });

    it("자리 설명은 **이미 찬 자리를 빼고** 센다 — '확정 2/4' 옆에 '4명 모집'이 찍히지 않게", () => {
        // 전환 글은 이미 팔린 자리도 OPEN 이다. filled 을 안 넘기면 그 칸까지 '모집'으로 세어진다(2026-09-24).
        const ui = code("client/src/golf/components/join/joinUi.tsx");
        expect(ui).toContain("export function openGenderText(slots: readonly JoinSlot[], filled = 0)");
        expect(ui).toContain('export function slotLegend(slots: readonly JoinSlot[], hostLabel: string | null = "호스트", filled = 0)');
        const card = code("client/src/golf/components/booking/BookingCard.tsx");
        expect(card).toContain("openGenderText(slots, applied)");
        expect(card).toContain("slotLegend(slots, hostLabel, applied)");
        // 정원이 아니라 **남은 자리**를 적는다.
        expect(card).toContain("Math.max(0, capacity - applied)}명 모집");
        const mine = code("client/src/golf/pages/MyBookings.tsx");
        expect(mine).toContain("slotLegend(slots, hostSeatLabel(item), Number(item.joinApplied ?? 0))");
        // 전환 버튼은 **네 자리가 다 찼을 때만** 사라진다(두 군데 다).
        expect(mine).toContain("Number(item.joinApplied ?? 0) < MAX_SLOTS");
        expect(card).toContain("applied < MAX_SLOTS");
        expect(mine).not.toContain("Number(item.joinApplied ?? 0) === 0");
        expect(card).not.toContain("applied === 0");
    });

    it("시트는 상한까지만 보여 주고, 자리 배열이 아니라 숫자 하나를 보낸다", () => {
        const sheet = code("client/src/golf/components/booking/ToJoinSheet.tsx");
        expect(sheet).toContain("convertibleSeats(sold)");
        expect(sheet).toContain("Math.max(1, room) }, (_, i) => i + 1).map(");
        expect(sheet).toContain("body: { more: open, genders: genders.slice(0, open), costMode }");
        expect(sheet).toContain("hostLabel={null}");
        expect(sheet).not.toContain('role: "HOST"');
        // 자리 배열을 손으로 짜지 않는다 — 서버와 같은 함수를 부른다.
        expect(sheet).toContain("conversionSlots(sold, open,");
    });
});
