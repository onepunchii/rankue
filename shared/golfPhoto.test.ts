import { describe, it, expect } from "vitest";
import { isOwnGolfPhotoUrl, photoMonthLabel, photoCredit, GOLF_PHOTO_CATEGORY, GOLF_THUMB_CATEGORY } from "./golfPhoto";

const ME = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const OTHER = "11111111-2222-3333-4444-555555555555";
const HOST = "https://zts7idyjw1ng1uqz.public.blob.vercel-storage.com";

describe("라운드 사진 주소는 우리 업로드 API 가 이 회원에게 만든 것만", () => {
    it("내 golf-photo 주소(webp·jpg·png)는 통과", () => {
        for (const ext of ["webp", "jpg", "png"]) {
            expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-photo/${ME}-mLI6gXo8i4EOvnHXvjKeOHxY0rJNpQ.${ext}`, ME, GOLF_PHOTO_CATEGORY)).toBe(true);
        }
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-thumb/${ME}-abcDEF123456.webp`, ME, GOLF_THUMB_CATEGORY)).toBe(true);
    });
    it("남의 사진·다른 폴더·외부 주소·쿼리 붙은 주소는 막는다", () => {
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-photo/${OTHER}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/crew-photo/${ME}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-thumb/${ME}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`https://evil.example.com/hiq/golf-photo/${ME}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`http://zts7idyjw1ng1uqz.public.blob.vercel-storage.com/hiq/golf-photo/${ME}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-photo/${ME}-abcDEF123456.webp?x=1`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-photo/${ME}-abcDEF123456.svg`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(`${HOST}/hiq/golf-photo/../crew-photo/${ME}-abcDEF123456.webp`, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl(null, ME, GOLF_PHOTO_CATEGORY)).toBe(false);
        expect(isOwnGolfPhotoUrl("not a url", ME, GOLF_PHOTO_CATEGORY)).toBe(false);
    });
});

describe("크레딧", () => {
    it("날짜는 한국 기준 달까지만", () => {
        expect(photoMonthLabel("2026-09-30T16:30:00Z")).toBe("2026년 10월"); // KST 10/1 01:30
        expect(photoMonthLabel(new Date("2026-09-15T03:00:00Z"))).toBe("2026년 9월");
        expect(photoMonthLabel("garbage")).toBe("");
    });
    it("이름이 없거나 탈퇴회원이면 이름을 싣지 않는다", () => {
        expect(photoCredit("홍길동")).toBe("홍길동");
        expect(photoCredit("  ")).toBe("랭큐 회원");
        expect(photoCredit("탈퇴회원")).toBe("랭큐 회원");
        expect(photoCredit(null)).toBe("랭큐 회원");
    });
});
