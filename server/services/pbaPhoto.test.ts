import { describe, it, expect } from "vitest";
import { imageFromHtml, imageFromJson, safeImageUrl } from "./pbaPhoto";

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
});
