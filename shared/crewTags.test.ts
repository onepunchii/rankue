import { describe, it, expect } from "vitest";
import { isBettingTag, withoutBettingTags } from "./crewTags";

// 크루 태그의 금전 내기 권유 판정 — 이미 저장된 태그를 화면에서 거를 때 쓴다.
describe("isBettingTag", () => {
    it("내기를 권하는 태그는 걸린다", () => {
        for (const tag of ["#내기환영", "내기환영", "#내기 가능", "#내기OK", "#내기당구", "#소액내기환영", "#빵당구", "#점당", "#돈당구", "##내기"]) {
            expect(isBettingTag(tag), tag).toBe(true);
        }
    });

    it("평범한 분위기 태그와 '내기'가 말끝에 붙는 말은 통과", () => {
        for (const tag of ["#빡겜", "#즐겜", "#매너필수", "#음주가무", "#금연", "#초보환영", "#고수환영", "#2030", "#이겨내기", "#빵빵한크루", "", "#"]) {
            expect(isBettingTag(tag), tag).toBe(false);
        }
    });

    it("'-내기'로 끝나는 평범한 동사 뒤에 권유 말이 붙어도 통과 — '#끝내기가능' 은 내기 태그가 아니다", () => {
        for (const tag of ["#끝내기가능", "#끝내기위주", "#보내기환영", "#이겨내기가능"]) {
            expect(isBettingTag(tag), tag).toBe(false);
        }
        // 명사 뒤에 붙은 진짜 내기는 계속 걸린다
        for (const tag of ["#소액내기환영", "#즐겜내기가능", "#따내기환영"]) {
            expect(isBettingTag(tag), tag).toBe(true);
        }
    });

    it("문자열이 아니면 태그가 아니다", () => {
        for (const v of [null, undefined, 3, {}]) expect(isBettingTag(v)).toBe(false);
    });
});

describe("withoutBettingTags", () => {
    it("내기 태그만 빼고 순서는 그대로", () => {
        expect(withoutBettingTags(["#빡겜", "#내기환영", "#매너필수"])).toEqual(["#빡겜", "#매너필수"]);
    });

    it("비어 있거나 null 이면 빈 배열, 문자열이 아닌 값은 버린다", () => {
        expect(withoutBettingTags(null)).toEqual([]);
        expect(withoutBettingTags(undefined)).toEqual([]);
        expect(withoutBettingTags(["#즐겜", 7, null])).toEqual(["#즐겜"]);
    });
});
