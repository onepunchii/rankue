import { describe, it, expect } from "vitest";
import {
    canonicalCrewPostCategory, crewPostCategoryLabelKey, resolveCrewPostCategory,
    encodeCrewCursor, decodeCrewCursor, parseCrewPageQuery, nextCrewCursor,
    imageUrlList, unreferencedUrls, validateCrewPostImages, CREW_PAGE_MAX,
} from "./crewBoard";

const ID = "3f1c2a4b-1111-4222-8333-944455556666";

describe("게시판 카테고리", () => {
    it("저장 값은 그대로, 옛 이름은 정식 이름으로", () => {
        expect(canonicalCrewPostCategory("가입인사")).toBe("가입인사");
        expect(canonicalCrewPostCategory(" 자유글 ")).toBe("자유글");
        expect(canonicalCrewPostCategory("모임후기")).toBe("크루후기");
        expect(canonicalCrewPostCategory("아무말")).toBeNull();
        expect(canonicalCrewPostCategory(3)).toBeNull();
    });

    it("화면 라벨 키 — 모르는 값은 null", () => {
        expect(crewPostCategoryLabelKey("공지사항")).toBe("crewBoard.categoryNotice");
        expect(crewPostCategoryLabelKey("모임후기")).toBe("crewBoard.categoryReview");
        expect(crewPostCategoryLabelKey("낯선값")).toBeNull();
        expect(crewPostCategoryLabelKey(null)).toBeNull();
    });

    it("쓰기 화이트리스트 — 공지는 운영진만, 빈 값은 자유글", () => {
        expect(resolveCrewPostCategory(undefined, false)).toEqual({ ok: true, value: "자유글" });
        expect(resolveCrewPostCategory("", false)).toEqual({ ok: true, value: "자유글" });
        expect(resolveCrewPostCategory("가입인사", false)).toEqual({ ok: true, value: "가입인사" });
        expect(resolveCrewPostCategory("공지사항", false)).toEqual({ ok: false, reason: "err.crew.postNoticeAdminOnly" });
        expect(resolveCrewPostCategory("공지사항", true)).toEqual({ ok: true, value: "공지사항" });
        expect(resolveCrewPostCategory("<script>", true)).toEqual({ ok: false, reason: "err.crew.postCategoryInvalid" });
    });
});

describe("쪽 나누기 커서", () => {
    it("만들고 되읽는다", () => {
        const c = encodeCrewCursor("2026-09-26T05:02:16.123Z", ID);
        expect(c).toBe(`2026-09-26T05:02:16.123Z_${ID}`);
        expect(decodeCrewCursor(c)).toEqual({ createdAt: "2026-09-26T05:02:16.123Z", id: ID });
        expect(encodeCrewCursor(new Date("2026-09-26T05:02:16.123Z"), ID)).toBe(c);
    });

    it("망가진 커서는 null", () => {
        for (const bad of [undefined, null, 3, "", "_" + ID, "nope_" + ID, "2026-09-26T05:02:16Z_not-a-uuid", "2026-09-26T05:02:16Z"]) {
            expect(decodeCrewCursor(bad), String(bad)).toBeNull();
        }
    });

    it("파라미터가 없으면 예전 모양(첫 쪽)", () => {
        expect(parseCrewPageQuery({}, 30)).toEqual({ ok: true, cursor: null, limit: 30, paged: false });
    });

    it("limit 은 1..최대로 자르고, before 가 망가지면 오류", () => {
        expect(parseCrewPageQuery({ limit: "20" }, 30)).toMatchObject({ ok: true, limit: 20, paged: true });
        expect(parseCrewPageQuery({ limit: "9999" }, 30)).toMatchObject({ ok: true, limit: CREW_PAGE_MAX });
        expect(parseCrewPageQuery({ limit: "0" }, 30)).toMatchObject({ ok: true, limit: 30 });
        expect(parseCrewPageQuery({ limit: "abc" }, 30)).toMatchObject({ ok: true, limit: 30 });
        expect(parseCrewPageQuery({ before: "garbage" }, 30)).toEqual({ ok: false });
        const before = encodeCrewCursor("2026-09-26T05:02:16.123Z", ID);
        expect(parseCrewPageQuery({ before, limit: "20" }, 30)).toEqual({
            ok: true, cursor: { createdAt: "2026-09-26T05:02:16.123Z", id: ID }, limit: 20, paged: true,
        });
    });

    it("다음 커서는 공지를 빼고 마지막 일반 글에서, 쪽이 덜 차면 끝", () => {
        const rows = [
            { id: "n1", createdAt: "2026-09-20T00:00:00.000Z", isNotice: true },
            { id: ID, createdAt: "2026-09-25T00:00:00.000Z", isNotice: false },
            { id: ID.replace("6666", "7777"), createdAt: "2026-09-24T00:00:00.000Z", isNotice: false },
        ];
        expect(nextCrewCursor(rows, 2)).toBe(`2026-09-24T00:00:00.000Z_${ID.replace("6666", "7777")}`);
        expect(nextCrewCursor(rows, 3)).toBeNull();
    });
});

describe("이미지 참조", () => {
    it("문자열 URL 만, 중복 없이", () => {
        expect(imageUrlList(["a", "a", null, 3, "", "b"])).toEqual(["a", "b"]);
        expect(imageUrlList("a")).toEqual(["a"]);
        expect(imageUrlList(null)).toEqual([]);
    });

    it("글 사진 검사 — https 만, 상한 안, 고치기에선 원래 있던 값은 통과", () => {
        expect(validateCrewPostImages(undefined)).toEqual({ ok: true, value: null });
        expect(validateCrewPostImages([])).toEqual({ ok: true, value: null });
        expect(validateCrewPostImages(["https://x/a.webp", "https://x/a.webp"])).toEqual({ ok: true, value: ["https://x/a.webp"] });
        expect(validateCrewPostImages("https://x/a.webp")).toEqual({ ok: false });
        expect(validateCrewPostImages(["data:image/webp;base64,AAAA"])).toEqual({ ok: false });
        expect(validateCrewPostImages(["javascript:alert(1)"])).toEqual({ ok: false });
        expect(validateCrewPostImages(Array.from({ length: 11 }, (_, i) => `https://x/${i}`))).toEqual({ ok: false });
        expect(validateCrewPostImages(["data:old", "https://x/n"], ["data:old"])).toEqual({ ok: true, value: ["data:old", "https://x/n"] });
    });

    it("아직 다른 행이 쓰는 URL 은 지우지 않는다", () => {
        expect(unreferencedUrls(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
        expect(unreferencedUrls("a", new Set(["a"]))).toEqual([]);
        expect(unreferencedUrls(null, [])).toEqual([]);
    });
});
