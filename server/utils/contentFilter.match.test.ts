/**
 * 대전 채팅 금칙어(2026-10-26) — 멀티방 대전에서 아홉 낱말을 다 비켜 간 실제 문장들과, 걸리면 안 되는 평범한 말.
 * 모든 곳에 넣은 것은 평범한 글에 안 들어가는 꼴뿐이고, 패드립 · 죽으라는 말 · 손가락 욕은 "match"(와 방제 "room")에서만 본다.
 */
import { describe, expect, it } from "vitest";
import { checkContent } from "./contentFilter";

const blocked = (t: string, context?: "match" | "room") => checkContent(t, context ? { context } : {}).blocked;

describe("대전 채팅(match)", () => {
    it("그날 실제로 오간 말(성적인 욕 · 패드립 · 죽으라는 말 · 자모 · 숫자 · 기호 · 로마자 끼우기)은 막힌다", () => {
        for (const t of ["개창1녀", "개보223지", "니어매", "니엄머", "니앰미 하마", "ㅗㅗㅗㅗ", "같은년아", "붕1111신같은", "ㅆ발련아 뒤@져 걍", "뒤질ㄹ", "씨ㅃ씨까아", "ㅆ바롬아", "씨a발", "니엄마"]) {
            expect(blocked(t, "match"), t).toBe(true);
        }
    });
    it("가벼운 놀림 · 평범한 말은 지나간다", () => {
        for (const t of ["개못하네", "접어라", "ㅃㄹ좀 해라", "보지 마 그거", "미친 샷이네", "나이스샷", "시바견 귀엽다"]) expect(blocked(t, "match"), t).toBe(false);
    });
});

describe("커뮤니티 · 크루(기본)", () => {
    it("모든 곳에 넣은 꼴 — 성적인 욕 · 자모 줄임은 어디서나 막힌다", () => {
        for (const t of ["창녀", "개보지", "ㅅㅂ 진짜", "씨ㅂ", "엠창", "니애미"]) expect(blocked(t), t).toBe(true);
    });
    it("대전 채팅에서만 보는 말은 글에서 지나간다(평범한 문장이라)", () => {
        for (const t of ["가방 뒤져 봐", "5개년 계획", "불 꺼져 있네", "애미야 밥 먹자", "보지 마세요", "강아지 새끼 낳았어요"]) expect(blocked(t), t).toBe(false);
    });
});
