import { describe, it, expect } from "vitest";
import { checkContent } from "./contentFilter";

// 공개 커뮤니티 필터의 회귀 사례. 크루 맥락 사례는 crewModeration.test.ts 에 있다.
describe("checkContent — '-내기'로 끝나는 평범한 말은 금전 내기가 아니다", () => {
    it("끝내기·보내기·이겨내기 뒤에 '가능·위주·할' 이 와도 통과한다", () => {
        for (const s of [
            "이 배치에서 끝내기 가능한가요?",
            "끝내기 위주로 연습해요",
            "사진 보내기 가능한가요",
            "이겨내기 가능할까요",
            "끝내기 할 때 두께가 늘 얇아요",
            "끝내기 당구 영상 공유합니다",
        ]) {
            expect(checkContent(s).blocked, s).toBe(false);
        }
    });

    it("진짜 내기 권유·금액 내기는 계속 막는다", () => {
        for (const s of [
            "#소액내기환영",
            "즐겜내기가능 크루",
            "내기 가능한 분만",
            "5만원 내기 한판",
            "내기 당구 치실 분",
            "끝 내기 5만원",       // 띄어 쓴 '내기'는 동사로 보지 않는다
            "5만원 따내기 가능",   // '따내기'는 돈을 딴다는 말이라 일부러 목록에서 뺐다
        ]) {
            expect(checkContent(s).blocked, s).toBe(true);
        }
    });

    it("원래 막던 금액×게임·빵·점당은 그대로", () => {
        for (const s of ["게임당 5000원", "만원빵 콜", "점당 1000"]) {
            expect(checkContent(s).blocked, s).toBe(true);
        }
    });
});
