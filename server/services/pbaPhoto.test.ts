import { describe, it, expect } from "vitest";
import { imageFromHtml, imageFromJson, joinPrefix, prefixesFromCode, safeImageUrl, sniffImage } from "./pbaPhoto";

describe("pbaPhoto", () => {
    it("safeImageUrl — 상대 경로는 기준에 붙이고 https 로, 내부 주소·이상한 스킴은 막는다", () => {
        expect(safeImageUrl("/a/b.jpg", "https://www.pbatour.org")).toBe("https://www.pbatour.org/a/b.jpg");
        expect(safeImageUrl("http://cdn.x.com/p.png", "https://www.pbatour.org")).toBe("https://cdn.x.com/p.png");
        expect(safeImageUrl("javascript:alert(1)", "https://www.pbatour.org")).toBeNull();
        expect(safeImageUrl("http://127.0.0.1/p.jpg", "https://www.pbatour.org")).toBeNull();
        expect(safeImageUrl("http://localhost/p.jpg", "https://www.pbatour.org")).toBeNull();
        expect(safeImageUrl("", "https://www.pbatour.org")).toBeNull();
    });
    it("imageFromJson — 칸 이름과 모양으로 고르고, 로고·빈 값은 뺀다", () => {
        expect(imageFromJson({ Average: "1.2", ImgPath: "/upload/player/M1" })).toBe("/upload/player/M1");
        expect(imageFromJson({ a: { b: "x/y/profile.JPG?v=2" } })).toBe("x/y/profile.JPG?v=2");
        expect(imageFromJson({ Logo: "/img/logo.png", Name: "홍길동" })).toBeNull();
        expect(imageFromJson({ Average: "1.2" })).toBeNull();
        expect(imageFromJson(null)).toBeNull();
    });
    it("imageFromHtml — memCode 든 주소 > player 경로, 장식 이미지는 무시", () => {
        const html = `<meta property="og:image" content="/img/og_logo.png">
            <img src="/img/icon_flag_kr.png"><img data-src="/upload/player/M0022424.jpg" src="data:image/gif;base64,xx">
            <img src="/upload/player/other.jpg">`;
        expect(imageFromHtml(html, "M0022424")).toBe("/upload/player/M0022424.jpg");
        expect(imageFromHtml(`<div style="background-image:url('/files/profile/M9.png')"></div>`, "M9")).toBe("/files/profile/M9.png");
        expect(imageFromHtml(`<img src="/img/logo.png"><img src="/img/banner.jpg">`, "M1")).toBeNull();
    });
    it("sniffImage — 파일 머리로 종류, HTML 은 null", () => {
        expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe("image/jpeg");
        expect(sniffImage(Buffer.from("89504e470d0a1a0a0000", "hex"))).toBe("image/png");
        expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
        expect(sniffImage(Buffer.from("<!DOCTYPE html>"))).toBeNull();
    });
    it("prefixesFromCode — ImgURL 앞에 붙는 문자열(더하기·템플릿)", () => {
        expect(prefixesFromCode(`src="' + '/upload' + data.ImgURL + '"`)).toEqual(["/upload"]);
        expect(prefixesFromCode("x = `https://img.pbatour.org${item['ImgURL']}`")).toEqual(["https://img.pbatour.org"]);
        expect(prefixesFromCode("var a = data.ImgURL;")).toEqual([]);
    });
    it("joinPrefix — 앞머리와 경로(절대 주소면 경로만)를 한 번의 / 로 잇는다", () => {
        const o = "https://www.pbatour.org";
        expect(joinPrefix("/upload/", "/players/a.jpg", o)).toBe("https://www.pbatour.org/upload/players/a.jpg");
        expect(joinPrefix("https://img.pbatour.org", "players/a.jpg", o)).toBe("https://img.pbatour.org/players/a.jpg");
        expect(joinPrefix("/files", "https://www.pbatour.org/players/a.jpg", o)).toBe("https://www.pbatour.org/files/players/a.jpg");
    });
});
