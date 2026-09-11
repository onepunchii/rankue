import { describe, it, expect } from "vitest";
import { checkContent } from "./contentFilter";
import { screenCrewText, screenCrewFields, screenCrewProfile, screenCrewBody, screenMemberProfile, changedCrewProfileFields, isCrewReportTarget, isReportReason } from "./crewModeration";

// 크루 UGC 필터 — 커뮤니티와 같은 차단(내기·빵·점당·욕설·거래)을 걸되,
// 모임비·정산 이야기만 오탐에서 뺀다. 공개 커뮤니티 동작은 바뀌면 안 된다.

describe("screenCrewText — 크루 채팅·댓글", () => {
    it("금전 내기·빵·점당·욕설·거래는 커뮤니티처럼 막는다", () => {
        for (const s of ["5만원 내기 한판 콜?", "오늘 만원빵 치실 분", "점당 1000 어때요", "씨 발 진짜", "큐 팝니다", "#내기환영", "내기 가능한 분만"]) {
            expect(screenCrewText(s).ok, s).toBe(false);
        }
    });

    it("모임비·게임비·정산 요청은 크루 안에서 통과한다", () => {
        for (const s of ["정모 정산 부탁드려요", "게임비 1만원씩 입금 부탁해요", "오늘 당구비 2만원 엔빵할게요", "30점 땄다!", "레슨비 5만원입니다"]) {
            expect(screenCrewText(s).ok, s).toBe(true);
        }
    });

    it("통과한 문장의 전화번호·오픈채팅 링크는 가린다", () => {
        const r = screenCrewText("연락은 010-1234-5678 또는 open.kakao.com/o/abc");
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).not.toContain("1234-5678");
            expect(r.value).not.toContain("open.kakao.com");
        }
    });

    it("크루 맥락 면제는 커뮤니티에 새지 않는다 — 공개 글의 정산 요청·게임비 금액은 그대로 막힌다", () => {
        expect(checkContent("정산 부탁드려요").blocked).toBe(true);
        expect(checkContent("게임비 1만원 걸고 한판").blocked).toBe(true);
    });

    it("모임비 단어가 있어도 내기 문구 자체는 막는다", () => {
        expect(screenCrewText("게임비 내기 5만원").ok).toBe(false);
        expect(screenCrewText("당구비 걸고 내기 한판").ok).toBe(false);
    });
});

describe("screenCrewFields — 글 제목+본문", () => {
    it("필드 하나만 걸려도 거부하고, 통과하면 필드별로 가린다", () => {
        expect(screenCrewFields({ title: "공지", content: "5만원 내기 합니다" }).ok).toBe(false);
        const r = screenCrewFields({ title: "문의 010 1234 5678", content: "정모 안내", category: null });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.title).not.toContain("5678");
            expect(r.value.content).toBe("정모 안내");
            expect(r.value.category).toBeNull();
        }
    });
});

describe("screenCrewProfile — 크루 이름·소개·태그", () => {
    it("내기 권유 태그를 막는다", () => {
        const r = screenCrewProfile({ name: "광진 3쿠션", tags: ["#초보환영", "#내기환영"] });
        expect(r.ok).toBe(false);
    });

    it("이름·지역·태그에 연락처가 있으면 가리지 않고 거부한다", () => {
        expect(screenCrewProfile({ name: "문의 01012345678" }).ok).toBe(false);
        expect(screenCrewProfile({ tags: ["#open.kakao.com/o/x"] }).ok).toBe(false);
    });

    it("소개·가입 질문의 연락처는 가리고, 보낸 필드만 돌려준다", () => {
        const r = screenCrewProfile({
            description: "가입 문의 010-9876-5432",
            introQuestions: [{ id: "q1", text: "카톡 아이디 알려주세요", required: true }, "구력은?"],
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.description).not.toContain("5432");
            expect(Object.keys(r.value).sort()).toEqual(["description", "introQuestions"]);
            const qs = r.value.introQuestions as any[];
            expect(qs[0]).toMatchObject({ id: "q1", required: true });
            expect(qs[0].text).not.toContain("카톡 아이디");
            expect(qs[1]).toBe("구력은?");
        }
    });

    it("평범한 크루 소개는 그대로 통과한다", () => {
        const r = screenCrewProfile({ name: "성수 당구 모임", shortIntro: "매주 토요일 정모, 게임비 엔빵", tags: ["#초보환영", "#3쿠션"], region: "성동구" });
        expect(r).toEqual({ ok: true, value: { shortIntro: "매주 토요일 정모, 게임비 엔빵" } });
    });
});

describe("신고 대상·사유 화이트리스트", () => {
    it("크루 대상만 받고, 커뮤니티·골프 대상은 거절한다", () => {
        expect(isCrewReportTarget("crew_photo_comment")).toBe(true);
        expect(isCrewReportTarget("crew_chat")).toBe(true);
        expect(isCrewReportTarget("community_post")).toBe(false);
        expect(isCrewReportTarget("golf_booking")).toBe(false);
        expect(isCrewReportTarget(undefined)).toBe(false);
    });
    it("사유는 커뮤니티와 같은 6가지", () => {
        expect(isReportReason("gambling")).toBe(true);
        expect(isReportReason("hate")).toBe(false);
    });
});

describe("screenCrewBody — 정모·투표·대회·정산 본문", () => {
    it("정모 제목·비용: 모임비는 통과, 내기 모집은 거부", () => {
        const ok = screenCrewBody({ title: "토요 정모", cost: "게임비 1만원 엔빵", maxParticipants: 8 }, ["title", "description", "locationName", "cost"] as const);
        expect(ok).toEqual({ ok: true, value: { fields: { title: "토요 정모", cost: "게임비 1만원 엔빵" }, extra: [] } });
        expect(screenCrewBody({ title: "판당 1만원 내기 참가자?" }, ["title"] as const).ok).toBe(false);
    });

    it("투표 선택지·정산 항목 이름(extra)도 같이 검사하고 같은 순서로 가려서 돌려준다", () => {
        expect(screenCrewBody({ title: "뒷풀이 장소" }, ["title"] as const, ["고기집", "만원빵 한판"]).ok).toBe(false);
        const r = screenCrewBody({ title: "정모 정산" }, ["title"] as const, ["1차 당구비", 7, "문의 010-1234-5678"]);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.extra[0]).toBe("1차 당구비");
            expect(r.value.extra[1]).toBe(7);
            expect(r.value.extra[2]).not.toContain("5678");
        }
    });

    it("문자열이 아닌 칸·빠진 칸은 돌려주지 않는다 — 본문에 덮어써도 다른 칸이 사라지지 않게", () => {
        const r = screenCrewBody({ title: 3, description: null }, ["title", "description"] as const);
        expect(r).toEqual({ ok: true, value: { fields: {}, extra: [] } });
        expect(screenCrewBody(undefined, ["title"] as const)).toEqual({ ok: true, value: { fields: {}, extra: [] } });
    });
});

describe("screenMemberProfile — 회원 이름·소개", () => {
    it("이름·소개의 욕설·내기는 거부, 이름의 연락처는 거부, 소개의 연락처는 가린다", () => {
        expect(screenMemberProfile({ name: "씨발맨" }).ok).toBe(false);
        expect(screenMemberProfile({ introduction: "5만원 내기 환영" }).ok).toBe(false);
        expect(screenMemberProfile({ name: "open.kakao.com/o/abc" }).ok).toBe(false);
        const r = screenMemberProfile({ name: "3쿠션러", introduction: "레슨 문의 010-2222-3333" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.name).toBe("3쿠션러");
            expect(r.value.introduction).not.toContain("3333");
        }
    });

    it("공개 표면이라 크루 모임비 면제를 쓰지 않는다", () => {
        expect(screenMemberProfile({ introduction: "정산 부탁드려요" }).ok).toBe(false);
    });

    it("보낸 칸만 돌려준다", () => {
        expect(screenMemberProfile({ introduction: "안녕하세요" })).toEqual({ ok: true, value: { introduction: "안녕하세요" } });
        expect(screenMemberProfile({})).toEqual({ ok: true, value: {} });
    });
});

describe("changedCrewProfileFields — 크루 설정 저장은 바뀐 칸만 검사", () => {
    const stored = { name: "성수 모임", description: "끝내기 위주로 쳐요", tags: ["#즐겜"], introQuestions: [{ id: "q1", text: "구력?" }], region: null };

    it("그대로 다시 보낸 칸은 빼고, 바뀐 칸만 고른다", () => {
        const update = { name: "성수 모임", description: "끝내기 위주로 쳐요", tags: ["#즐겜", "#매너"], introQuestions: [{ id: "q1", text: "구력?" }], joinType: "auto" };
        expect(changedCrewProfileFields(update, stored)).toEqual({ tags: ["#즐겜", "#매너"] });
    });

    it("null 과 빠진 값은 같은 것으로 본다", () => {
        expect(changedCrewProfileFields({ region: undefined, shortIntro: null }, stored)).toEqual({});
    });

    it("저장된 크루가 없으면(생성과 같은 상황) 들어온 칸을 모두 검사한다", () => {
        expect(changedCrewProfileFields({ name: "새 크루", joinType: "auto" }, null)).toEqual({ name: "새 크루" });
    });
});
