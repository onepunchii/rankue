import { describe, it, expect, vi } from "vitest";

// 순수 규칙만 본다 — DB 는 건드리지 않는다.
vi.mock("../db.js", () => ({ db: {} }));

import { parsePhotoListQuery, likePattern, ownPhotoUrl, toAdminPhoto, PHOTO_PAGE, type AdminGolfPhotoRaw } from "./adminGolfPhotos";

const HOST = "zts7idyjw1ng1uqz.public.blob.vercel-storage.com";
const blob = (path: string, host = HOST) => `https://${host}/hiq/${path}`;

const raw = (over: Partial<AdminGolfPhotoRaw> = {}): AdminGolfPhotoRaw => ({
    id: "ph1", session_id: "round-1", member_id: "m1", hole_no: 7,
    url: blob("golf-photo/m1-abcdef.webp"), thumb_url: blob("golf-thumb/m1-abcdef.webp"),
    width: 1600, height: 900, is_public: true, course_slug: "동강시스타", course_name: "동강시스타 CC",
    uploader_name: "홍길동", appeal_text: null, last_action: null, open_reports: 0, report_count: 0,
    created_at: "2026-09-30T10:27:46.056Z", round_at: "2026-09-28T04:14:25.626Z",
    hidden_at: null, appeal_at: null, last_action_at: null,
    ...over,
});

describe("목록 조건(parsePhotoListQuery)", () => {
    it("기본값: 전체 · 골프장 없음 · 기간 없음 · 첫 쪽 48장", () => {
        expect(parsePhotoListQuery({})).toEqual({ filter: "all", course: null, days: null, offset: 0, limit: PHOTO_PAGE });
    });
    it("모르는 거르기는 전체로, 배열로 온 값은 첫 값만", () => {
        expect(parsePhotoListQuery({ filter: "deleted" }).filter).toBe("all");
        expect(parsePhotoListQuery({ filter: ["appealed", "public"] }).filter).toBe("appealed");
    });
    it("골프장 검색어는 공백을 접고 60자에서 자른다", () => {
        expect(parsePhotoListQuery({ course: "  동강   시스타 " }).course).toBe("동강 시스타");
        expect(parsePhotoListQuery({ course: "가".repeat(80) }).course).toHaveLength(60);
        expect(parsePhotoListQuery({ course: "   " }).course).toBeNull();
    });
    it("기간·쪽 번호·장수는 범위 안으로", () => {
        expect(parsePhotoListQuery({ days: "7" }).days).toBe(7);
        expect(parsePhotoListQuery({ days: "0" }).days).toBeNull();
        expect(parsePhotoListQuery({ days: "9999" }).days).toBe(365);
        expect(parsePhotoListQuery({ days: "abc" }).days).toBeNull();
        expect(parsePhotoListQuery({ offset: "-5" }).offset).toBe(0);
        expect(parsePhotoListQuery({ offset: "96" }).offset).toBe(96);
        expect(parsePhotoListQuery({ limit: "1000" }).limit).toBe(96);
        expect(parsePhotoListQuery({ limit: "0" }).limit).toBe(PHOTO_PAGE);
    });
});

describe("검색 패턴(likePattern)", () => {
    it("운영자가 친 %·_·\\ 는 글자 그대로 찾는다", () => {
        expect(likePattern("동강")).toBe("%동강%");
        expect(likePattern("100%_x\\")).toBe("%100\\%\\_x\\\\%");
    });
});

describe("사진 주소(ownPhotoUrl) — 우리 Blob 저장소 것만", () => {
    it("우리 호스트의 https 주소는 그대로", () => {
        expect(ownPhotoUrl(blob("golf-photo/a.webp"), HOST)).toBe(blob("golf-photo/a.webp"));
        expect(ownPhotoUrl(blob("golf-photo/a.webp"), HOST.toUpperCase())).toBe(blob("golf-photo/a.webp"));
    });
    it("남의 Blob 저장소·외부 주소·http·쿼리 붙은 주소·빈 값은 비운다", () => {
        expect(ownPhotoUrl(blob("golf-photo/a.webp", "otherstore.public.blob.vercel-storage.com"), HOST)).toBeNull();
        expect(ownPhotoUrl("https://evil.example.com/hiq/golf-photo/a.webp", HOST)).toBeNull();
        expect(ownPhotoUrl(`http://${HOST}/hiq/a.webp`, HOST)).toBeNull();
        expect(ownPhotoUrl(`${blob("a.webp")}?track=1`, HOST)).toBeNull();
        expect(ownPhotoUrl(null, HOST)).toBeNull();
        expect(ownPhotoUrl(`https://${HOST}/${"a".repeat(420)}`, HOST)).toBeNull();
    });
    it("토큰이 없어 우리 호스트를 모르면(로컬) Blob 공개 주소 모양만 본다", () => {
        expect(ownPhotoUrl(blob("a.webp", "otherstore.public.blob.vercel-storage.com"), null)).not.toBeNull();
        expect(ownPhotoUrl("https://evil.example.com/a.webp", null)).toBeNull();
    });
});

describe("운영자 화면 한 장(toAdminPhoto)", () => {
    it("보이는 공개 사진: 가리기·지우기만, 골프장 페이지 링크와 경기 id 를 싣는다", () => {
        const p = toAdminPhoto(raw(), HOST);
        expect(p.actions).toEqual(["blind", "delete"]);
        expect(p.course).toEqual({ slug: "동강시스타", name: "동강시스타 CC", path: `/golf/course/${encodeURIComponent("동강시스타")}` });
        expect(p.round).toEqual({ id: "round-1", at: "2026-09-28T04:14:25.626Z" });
        expect(p.uploader).toEqual({ id: "m1", name: "홍길동" });
        expect(p.appeal).toBeNull();
    });
    it("가렸고 처리 기록보다 나중에 낸 이의제기는 열려 있다 — 판정 버튼이 먼저, '보이기'는 없다", () => {
        const p = toAdminPhoto(raw({
            hidden_at: "2026-09-30T11:00:00.000Z", appeal_at: "2026-09-30T12:00:00.000Z", appeal_text: "제 사진입니다",
            last_action: "blind", last_action_at: "2026-09-30T11:00:01.000Z",
        }), HOST);
        expect(p.appeal).toEqual({ text: "제 사진입니다", at: "2026-09-30T12:00:00.000Z", open: true });
        expect(p.actions).toEqual(["appeal_approve", "appeal_reject", "delete"]);
        expect(p.lastAction).toEqual({ action: "blind", label: "블라인드", at: "2026-09-30T11:00:01.000Z" });
    });
    it("반려한 뒤에는 이의제기가 닫히고 '보이기'가 돌아온다", () => {
        const p = toAdminPhoto(raw({
            hidden_at: "2026-09-30T11:00:00.000Z", appeal_at: "2026-09-30T12:00:00.000Z", appeal_text: "제 사진입니다",
            last_action: "appeal_reject", last_action_at: "2026-09-30T13:00:00.000Z",
        }), HOST);
        expect(p.appeal?.open).toBe(false);
        expect(p.actions).toEqual(["unblind", "delete"]);
    });
    it("신고 기각·정지는 이 화면 버튼이 아니다(신고 큐가 맡는다)", () => {
        const p = toAdminPhoto(raw({ hidden_at: "2026-09-30T11:00:00.000Z", open_reports: 2, report_count: 3 }), HOST);
        expect(p.actions).toEqual(["unblind", "delete"]);
        expect(p.openReports).toBe(2);
        expect(p.reportCount).toBe(3);
    });
    it("썸네일 주소가 남의 것이면 원본으로, 둘 다 아니면 비운다. 이름이 없으면 알 수 없는 회원", () => {
        const a = toAdminPhoto(raw({ thumb_url: "https://evil.example.com/t.webp" }), HOST);
        expect(a.thumbUrl).toBe(a.url);
        const b = toAdminPhoto(raw({ url: "https://evil.example.com/a.webp", thumb_url: "https://evil.example.com/t.webp", uploader_name: " " }), HOST);
        expect(b.url).toBeNull();
        expect(b.thumbUrl).toBeNull();
        expect(b.uploader.name).toBe("(알 수 없는 회원)");
    });
    it("골프장 페이지가 없는 사진은 링크가 없다", () => {
        expect(toAdminPhoto(raw({ course_slug: null, is_public: false }), HOST).course.path).toBeNull();
    });
});
