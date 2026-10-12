import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_PHOTO_CATEGORIES, HIKING_PHOTO_CATEGORY, HIKING_PHOTO_LABEL, HIKING_THUMB_CATEGORY, isHikingPhotoPath, validPhotoSize } from "./hikingPhotos";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");

describe("산행 사진 — 내 사진첩", () => {
    it("우리 저장소의 등산 사진 폴더에 올린 주소만", () => {
        const ok = "https://abc.public.blob.vercel-storage.com/hiq/hiking-photo/u1-x9.webp";
        expect(isHikingPhotoPath(ok, HIKING_PHOTO_CATEGORY)).toBe(true);
        expect(isHikingPhotoPath(ok, HIKING_THUMB_CATEGORY)).toBe(false);
        expect(isHikingPhotoPath("https://abc.public.blob.vercel-storage.com/hiq/golf-photo/u1.webp", HIKING_PHOTO_CATEGORY)).toBe(false);
        expect(isHikingPhotoPath("http://abc.public.blob.vercel-storage.com/hiq/hiking-photo/u1.webp", HIKING_PHOTO_CATEGORY)).toBe(false);
        expect(isHikingPhotoPath("javascript:alert(1)", HIKING_PHOTO_CATEGORY)).toBe(false);
        expect(isHikingPhotoPath(null, HIKING_PHOTO_CATEGORY)).toBe(false);
        expect(isHikingPhotoPath(`https://a.b/hiq/hiking-photo/${"x".repeat(700)}`, HIKING_PHOTO_CATEGORY)).toBe(false);
        expect(Array.from(HIKING_PHOTO_CATEGORIES)).toEqual(["hiking-photo", "hiking-thumb"]);
    });
    it("크기 — 정수이고 말이 되는 값만", () => {
        expect(validPhotoSize(1600, 1200)).toBe(true);
        expect(validPhotoSize(1600.5, 1200)).toBe(false);
        expect(validPhotoSize(0, 1200)).toBe(false);
        expect(validPhotoSize(9000, 1200)).toBe(false);
        expect(validPhotoSize("1600", 1200)).toBe(false);
    });
    it("어디서 찍었는지는 저장하지 않는다 — 표 · 저장 · 길에 위치 칸이 없다", () => {
        const sql = code(read("migrations/hiking_photos.sql"));
        expect(sql).toContain("create table if not exists hiking_photos");
        expect(sql).not.toMatch(/\blat\b|\blng\b|latitude|longitude|geom|exif/i);
        expect(code(read("server/storage/hikingPhotos.ts"))).not.toMatch(/\blat\b|\blng\b/);
        const route = code(read("server/routes/modules/hiking.ts"));
        const photos = route.slice(route.indexOf('router.get("/me/photos"'), route.indexOf("export default router"));
        expect(photos).not.toMatch(/\.lat\b|\.lng\b|accuracy/);
        // 남의 주소를 적어 넣지 못한다 · 올릴 수 있는 수에 끝이 있다
        expect(photos).toContain("isOnOwnBlobHost(b.url)");
        expect(photos).toContain("HIKING_PHOTO_PER_MOUNTAIN_MAX");
        expect(photos).toContain("HIKING_PHOTO_DAILY_MAX");
    });
    it("올린 사람의 것만 읽고 지운다 — 남에게 보이는 목록이 없다", () => {
        const repo = code(read("server/storage/hikingPhotos.ts"));
        expect((repo.match(/from hiking_photos/g) ?? []).length).toBeGreaterThanOrEqual(4);
        for (const m of repo.match(/(select|delete)[^;`]*from hiking_photos[^`]*/g) ?? []) expect(m, m.slice(0, 60)).toContain("member_id = ${memberId}::uuid");
        const route = code(read("server/routes/modules/hiking.ts"));
        for (const line of route.split("\n").filter((l) => /router\.(get|post|delete)\("\/(me\/)?photos/.test(l))) expect(line).toContain("...requireHikingAccess");
    });
    it("올릴 때 사진 정보를 걷는다 — 알아볼 수 없는 파일은 받지 않는다", () => {
        expect(read("server/routes/modules/member.ts")).toContain("(GOLF_PHOTO_CATEGORIES.has(safeCat) || HIKING_PHOTO_CATEGORIES.has(safeCat)) && !clean.type");
        const api = read("client/src/hiking/photos/photoApi.ts");
        expect(api).toContain("canvas.toDataURL(");
        // 골프의 사진 코드를 빌려 쓰지 않는다(머리 주석은 그 사실을 적은 것이라 뺀다)
        expect(code(api)).not.toMatch(/golf\/lib|golfPhoto/);
    });
    it("화면의 글 — 약속한 것만 적는다", () => {
        expect(HIKING_PHOTO_LABEL.note).toContain("위치 정보는 올릴 때 지워요");
        expect(JSON.stringify(HIKING_PHOTO_LABEL)).not.toMatch(/공개|모두가|다른 사람/);
    });
});
