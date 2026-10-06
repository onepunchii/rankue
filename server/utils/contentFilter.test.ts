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

/**
 * 2026-10-06 — 골프 조인·부킹 글의 자유 입력 칸에 내용 필터를 건다("listing" 맥락).
 *
 * 그 전까지 이 표면은 길이만 잘랐다. 그렇다고 커뮤니티 규칙을 그대로 걸면 **정상 글이 막힌다**:
 * 부킹은 티타임을 팔고 양도하는 글이라 "팝니다·급처·네고 가능"(거래 규칙), "입금 부탁"(정산 규칙),
 * "스크린 2게임 3만원"(금액×게임 규칙)이 본문 그 자체다. 그래서 그 세 규칙은 건너뛰고 내기와 욕설만 막는다.
 */
describe("checkContent — 매물(listing) 맥락: 골프 조인·부킹 글", () => {
    const L = { context: "listing" as const };

    it("통과: 티타임을 팔고 양도하는 평범한 글", () => {
        for (const s of [
            "양도합니다",
            "팝니다 급처",
            "네고 가능",
            "그린피 12만원",
            "카트비 포함 4인",
            "스크린 2게임 3만원",
            "게임당 2만원 스크린 조인",
            "급처합니다 판매합니다 삽니다",
            "선입금 부탁드립니다",
            "현장 정산 해주세요",
            "계좌 번호는 확정 뒤 알려 드려요",
            "캐디피·카트비는 엔빵",
            "우천 시 전액 환불, 2일 전까지 취소 가능",
            "매너 좋으신 분 환영합니다",
            "끝내기 좋은 마지막 홀",
        ]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("통과: '타당'이 금액 없이 낱말로 쓰인 글", () => {
        for (const s of ["타당한 가격에 양도합니다", "가격이 타당하다고 생각해요", "타당성 검토 중", "타당 이유가 있어요"]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("통과: 사람을 가리키는 '-내기' — 새내기 환영은 내기 권유가 아니다", () => {
        for (const s of ["골프 새내기 환영합니다", "초보·새내기 가능한 명랑골프", "동갑내기 가능", "그린피 5만원 새내기 환영"]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("통과: 내기를 안 한다는 말", () => {
        for (const s of ["내기 골프 아닙니다", "내기골프는 안 합니다", "내기 골프 사절", "내기 라운드 없음", "명랑골프(내기X)", "내기 없이 편하게 쳐요"]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("통과: 금액 옆에서 내기를 안 한다는 말 — 가격을 적는 글이라 금액이 늘 곁에 있다", () => {
        // 예전엔 공통 규칙(금액×내기)이 부정을 가리지 않아 아래 글이 전부 '금전 내기'로 막혔다.
        for (const s of [
            "그린피 5만원, 내기 없음",
            "캐디피 15만원 엔빵, 내기 없음",
            "그린피 12만원 / 내기X 명랑골프",
            "그린피 15만원, 내기 없습니다",
            "내기 없음 / 1인 16만원",
            "명랑골프(내기X) 14만원",
            "카트비 포함 18만원 내기 안 합니다",
            "그린피 12만원, 내기 골프 아닙니다",
            "내기 사절. 1인 13만원",
            "내기 없는 명랑골프, 14만원",
            "4인 60만원 양도. 내기 안 하는 팀입니다",
            "내기는 안 해요 그린피 9만원",
            "1인 11만원 내기 금지",
        ]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("통과: 낱말 경계가 붙어야만 욕설처럼 보이는 평범한 안내", () => {
        // 다른 맥락은 공백까지 걷어 내고 보기 때문에 아래 글이 걸린다. 매물 글은 공백을 남긴다.
        for (const s of [
            "용병 신청 받습니다",          // 병신
            "선착순이니 미리 연락 주세요",   // 니미
            "7시 발렛 가능",               // 시발
            "어느 금요일이든 좋아요",        // 느금
            "확정 즉시 발송해 드립니다",     // 시발
        ]) {
            expect(checkContent(s, L).blocked, s).toBe(false);
        }
    });

    it("차단: 내기 권유·금액 내기", () => {
        for (const s of [
            "내기 골프 하실 분",
            "내기 라운드 모집",
            "내기 라운딩 가능하신 분",
            "내기 가능한 분만",
            "#내기환영",
            "5만원 내기 한판",
            "내기 한판 하실 분 5만원",
            "5만원 땄다는 그 코스",
            "내기 골프가 좋으신 분",
        ]) {
            const r = checkContent(s, L);
            expect(r.blocked, s).toBe(true);
            expect(r.reason, s).toContain("금전 내기");
        }
    });

    it("차단: 부정처럼 보여도 안 한다는 말이 아닌 것 — 조건·물음, 그리고 부정 뒤에 다시 꺼낸 내기", () => {
        for (const s of [
            "내기 없으면 심심하니 5만원씩",       // 조건 — 하자는 말이다
            "내기 없으면 심심하니 타당 천원",
            "5만원 내기, 없으면 말고",           // 부정이 '내기'에 붙지 않았다
            "5만원 내기 없나요?",               // 물음
            "내기 안 하나요? 5만원",
            "내기 안 하면 심심 5만원",
            "내기X라더니 5만원 내기 한판",        // 지우는 것은 부정이 붙은 그 '내기'뿐
            "내기 없음. 대신 만원빵",
            "내기 골프 아닙니다. 타당 2천",
        ]) {
            const r = checkContent(s, L);
            expect(r.blocked, s).toBe(true);
            expect(r.reason, s).toContain("금전 내기");
        }
    });

    it("차단: 타당 금액 — 골프 내기의 관용 표현", () => {
        for (const s of [
            "타당 천원",
            "타당 1000원",
            "타당 1,000",
            "타당 2천",
            "타당2천원 스트로크",
            "스트로크 타당 오천원",
            "핸디 주고 타당 만원",
            "타당 천 정도 가볍게",
            "타당 5백",
        ]) {
            const r = checkContent(s, L);
            expect(r.blocked, s).toBe(true);
            expect(r.reason, s).toContain("금전 내기");
        }
    });

    it("차단: 점당·빵 — 다른 맥락과 같은 규칙", () => {
        for (const s of ["점당 1000", "큐당 500", "만원빵 콜", "천원 빵 하실 분", "빵 내기 스크린"]) {
            expect(checkContent(s, L).blocked, s).toBe(true);
        }
    });

    it("차단: 욕설 — 그대로 쓴 것과 숫자·기호를 끼운 것", () => {
        for (const s of ["씨발 진짜", "병신같은 매너", "씨1발", "시.발", "병~신"]) {
            const r = checkContent(s, L);
            expect(r.blocked, s).toBe(true);
            expect(r.reason, s).toBe("부적절한 표현이 포함되어 있습니다.");
        }
    });

    it("빈 글·공백뿐인 글은 통과한다", () => {
        for (const s of ["", "   ", "\n"]) expect(checkContent(s, L).blocked).toBe(false);
    });
});

/**
 * 매물 맥락을 더하면서 **다른 맥락의 결과는 한 글자도 바뀌지 않았다**는 표.
 * 아래 값은 매물 맥락을 넣기 전(2026-10-06 이전)의 판정 그대로다 — 바뀌면 커뮤니티·크루·채팅·응원글의 필터가 달라진 것이다.
 * (오탐으로 보이는 줄도 일부러 적었다: "용병 신청"·"7시 발렛"이 커뮤니티에서 걸리는 것은 예전부터의 동작이고, 이 고침의 범위가 아니다.)
 */
describe("checkContent — 기존 맥락(기본·community·crew)은 그대로", () => {
    // [글, 기본(=community) 차단 여부, crew 차단 여부]
    const TABLE: [string, boolean, boolean][] = [
        ["양도합니다", false, false],
        ["팝니다 급처", true, true],
        ["네고 가능", true, true],
        ["판매합니다", true, true],
        ["큐 30만원에 판매", true, true],
        ["그린피 12만원", false, false],
        ["카트비 포함 4인", false, false],
        ["스크린 2게임 3만원", true, true],
        ["게임당 5000원", true, true],
        ["게임비 1만원씩", true, false],        // 크루는 모임비 안내로 본다
        ["정모비 2만원 게임 포함", true, false],
        ["레슨 1게임 2만원", false, false],      // 레슨비 안내는 면제
        ["선입금 부탁드립니다", true, false],     // 크루는 정산 요청이 정상 기능
        ["정산 부탁드려요", true, false],
        ["타당 천원", false, false],            // '타당'은 매물 맥락에서만 본다
        ["내기 골프 하실 분", false, false],      // '내기 골프'도 매물 맥락에서만 본다
        ["내기 당구 치실 분", true, true],
        ["당구 새내기 환영", true, true],       // '-내기' 낱말은 매물 맥락에서만 풀었다
        ["5만원 내기 한판", true, true],
        ["그린피 5만원, 내기 없음", true, true],  // 금액 옆 부정을 푸는 것은 매물 맥락뿐이다
        ["내기 가능한 분만", true, true],
        ["만원빵 콜", true, true],
        ["점당 1000", true, true],
        ["5만원 땄다", true, true],
        ["30점 땄다!", false, false],
        ["끝내기 가능한가요?", false, false],
        ["씨발", true, true],
        ["씨 발", true, true],
        ["씨1발", true, true],
        ["용병 신청 받습니다", true, true],
        ["7시 발렛 가능", true, true],
        ["선착순이니 미리 연락 주세요", true, true],
        ["어느 금요일이든 좋아요", true, true],
        ["오늘 3쿠션 재밌었어요", false, false],
    ];

    it("기본(맥락 없음)과 community 는 같은 판정이다", () => {
        for (const [s, community] of TABLE) {
            expect(checkContent(s).blocked, `기본: ${s}`).toBe(community);
            expect(checkContent(s, {}).blocked, `빈 옵션: ${s}`).toBe(community);
            expect(checkContent(s, { context: "community" }).blocked, `community: ${s}`).toBe(community);
        }
    });

    it("crew 는 모임비·정산만 풀어 준다", () => {
        for (const [s, , crew] of TABLE) {
            expect(checkContent(s, { context: "crew" }).blocked, `crew: ${s}`).toBe(crew);
        }
    });

    it("차단 사유 문구도 그대로다", () => {
        expect(checkContent("팝니다 급처").reason).toBe("직접적인 판매·거래 글은 게시할 수 없습니다.");
        expect(checkContent("5만원 내기 한판").reason).toBe("금전 내기 관련 표현은 게시할 수 없습니다. 랭큐 커뮤니티는 금전 내기를 금지합니다.");
        expect(checkContent("정산 부탁드려요").reason).toBe("금전 내기 관련 표현은 게시할 수 없습니다. 랭큐 커뮤니티는 금전 내기를 금지합니다.");
        expect(checkContent("씨 발").reason).toBe("부적절한 표현이 포함되어 있습니다.");
    });
});
