import { describe, expect, it } from "vitest";
import { ROOM_TITLE_MAX, ROOM_TITLE_PRESETS, checkRoomTitle, clampRoomTitle, normalizeRoomTitle, roomTitleLength } from "./roomTitle";

describe("멀티방 방제 — 모양(길이·정리)", () => {
    it("20자, 문구 칩은 다섯", () => {
        expect(ROOM_TITLE_MAX).toBe(20);
        expect(ROOM_TITLE_PRESETS).toEqual(["beginner", "casual", "serious", "quick", "practice"]);
    });

    it("길이는 코드포인트로 센다 — 이모지 하나는 한 글자", () => {
        expect(roomTitleLength("초보 환영")).toBe(5);
        expect(roomTitleLength("🎱🎱")).toBe(2);
    });

    it("정리: 줄바꿈·제어문자는 공백으로, 연속 공백은 한 칸, 양끝은 턴다", () => {
        expect(normalizeRoomTitle("  초보\n환영\t\t해요  ")).toBe("초보 환영 해요");
        expect(normalizeRoomTitle("a\u0000b c")).toBe("a b c");
    });

    it("정리: 보이지 않는 글자(폭 없는 공백·방향 표시)를 없앤다 — 빈 방제·글자 방향 뒤집기 방지", () => {
        expect(normalizeRoomTitle("​​﻿")).toBe("");
        expect(normalizeRoomTitle("‮abc‬")).toBe("abc");
        // 이음 글자(ZWJ)는 이모지 묶음에 쓰여 남긴다 — 그것뿐이면 빈 글
        expect(normalizeRoomTitle("👨‍👩‍👧 가족전")).toBe("👨‍👩‍👧 가족전");
        expect(normalizeRoomTitle("‍‌")).toBe("");
    });

    it("글자가 아니면 빈 글", () => {
        for (const v of [undefined, null, 3, {}, []]) expect(normalizeRoomTitle(v)).toBe("");
    });

    it("입력칸은 20자에서 자른다(치는 중의 끝 공백은 살린다)", () => {
        expect(clampRoomTitle("가".repeat(25))).toBe("가".repeat(20));
        expect(clampRoomTitle("🎱".repeat(21))).toBe("🎱".repeat(20));
        expect(clampRoomTitle("편하게 ")).toBe("편하게 ");
    });

    it("판정: 비면 방제 없음(null), 20자까지 통과, 넘으면 거부(자르지 않는다)", () => {
        expect(checkRoomTitle("")).toEqual({ ok: true, title: null });
        expect(checkRoomTitle("   \n ")).toEqual({ ok: true, title: null });
        expect(checkRoomTitle(undefined)).toEqual({ ok: true, title: null });
        expect(checkRoomTitle("  초보 환영  ")).toEqual({ ok: true, title: "초보 환영" });
        expect(checkRoomTitle("가".repeat(20))).toEqual({ ok: true, title: "가".repeat(20) });
        expect(checkRoomTitle("가".repeat(21))).toEqual({ ok: false, reason: "too-long" });
    });

    it("판정은 정리한 뒤의 길이로 한다 — 공백을 덕지덕지 붙여도 20자면 통과", () => {
        expect(checkRoomTitle(`  ${"가".repeat(10)}     ${"나".repeat(9)}  `)).toEqual({ ok: true, title: `${"가".repeat(10)} ${"나".repeat(9)}` });
    });
});
