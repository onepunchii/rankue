import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    GOLF_LOGO_FOLDER, GOLF_LOGO_MAX_BYTES, GOLF_LOGO_MAX_PX, LOGO_FETCH_MAX_BYTES, UPLOADED_LOGO_SQL_RE,
    absoluteLogoUrl, cleanRemoteImageUrl, fitLogoSize, golfLogoBlobPath, imageUrlFromDrop, isUploadedLogo, looksLightLogo, opaqueBounds,
} from "./golfLogo";
import { logoOrigin } from "./golfParEdit";

/**
 * 골프장 로고 올리기(2026-10-07 오너: "해당 로고 바로 끌고 와서 로고 업로드 기능 할 수 있나? 지금 로고 업로드 기능은 없지?").
 * 규칙(올린 로고의 판정 · 끌어온 자료에서 그림 주소 찾기 · 여백 자르기 · 흰 로고)과, 그 규칙이 화면·서버·적재 스크립트에 이어져 있는지를 본다.
 * 서버가 다른 사이트의 그림을 받아 오는 쪽은 server/lib/remoteImage.test.ts, 라우트는 server/routes/modules/adminGolf/coursesLogo.test.ts.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*|--)/.test(l)).join("\n");
const OURS = "https://abc123store.public.blob.vercel-storage.com/hiq/golf-logo/g-0123456789-a1b2c3d4e5f6.png";

describe("올린 로고의 판정", () => {
    it("우리 저장소의 golf-logo 폴더에 있는 PNG 만 '올린 로고'다", () => {
        expect(isUploadedLogo(OURS)).toBe(true);
        expect(isUploadedLogo(OURS.replace(".png", "-light.png"))).toBe(true);
        for (const no of [
            null, undefined, "", "/img/golf-logos/347.png", "/img/golf-logos/g-815f3bc50e.png",
            "https://abc123store.public.blob.vercel-storage.com/hiq/avatar/x.png",
            "https://abc123store.public.blob.vercel-storage.com/hiq/golf-logo/x.svg",
            "https://abc123store.public.blob.vercel-storage.com/hiq/golf-logo/../avatar/x.png",
            "https://evil.example/hiq/golf-logo/x.png",
            "https://public.blob.vercel-storage.com.evil.example/hiq/golf-logo/x.png",
            "http://abc123store.public.blob.vercel-storage.com/hiq/golf-logo/x.png",
        ]) expect(isUploadedLogo(no as any), String(no)).toBe(false);
    });

    it("출처 표시 — upload. 옛 출처들은 그대로", () => {
        expect(logoOrigin(OURS)).toBe("upload");
        expect(logoOrigin("/img/golf-logos/g-815f3bc50e.png")).toBe("official");
        expect(logoOrigin("/img/golf-logos/347.png")).toBe("dbegl");
        expect(logoOrigin("https://cdn.example.com/logo.png")).toBe("other");
        expect(logoOrigin(null)).toBeNull();
    });

    it("적재 스크립트의 SQL 판정이 같은 주소를 같은 답으로 본다 — 어긋나면 다시 적재할 때 올린 로고가 지워진다", () => {
        const sqlRe = new RegExp(UPLOADED_LOGO_SQL_RE);
        const samples = [
            OURS, OURS.replace(".png", "-light.png"), "/img/golf-logos/347.png", "/img/golf-logos/g-815f3bc50e-light.png",
            "https://abc123store.public.blob.vercel-storage.com/hiq/avatar/x.png", "https://evil.example/hiq/golf-logo/x.png",
            "https://abc123store.public.blob.vercel-storage.com/hiq/golf-logo/x.svg", "",
        ];
        for (const s of samples) expect(sqlRe.test(s), s).toBe(isUploadedLogo(s));
    });

    it("저장소 경로 — 슬러그 해시 10자 + 난수, 흰 로고는 이름이 -light.png 로 끝난다(화면이 파일 이름으로 어두운 판을 고른다)", () => {
        const sha = "0123456789abcdef0123456789abcdef01234567";
        expect(golfLogoBlobPath(sha, "a1b2c3d4e5f6", false)).toBe("hiq/golf-logo/g-0123456789-a1b2c3d4e5f6.png");
        expect(golfLogoBlobPath(sha, "a1b2c3d4e5f6", true)).toBe("hiq/golf-logo/g-0123456789-a1b2c3d4e5f6-light.png");
        expect(golfLogoBlobPath(sha, "a1b2c3d4e5f6", true)).toMatch(/-light\.png$/);
        expect(isUploadedLogo(`https://abc123store.public.blob.vercel-storage.com/${golfLogoBlobPath(sha, "a1b2c3d4e5f6", true)}`)).toBe(true);
        expect(GOLF_LOGO_FOLDER).toBe("hiq/golf-logo");
        // 경로에 쓸 수 없는 글자는 빠진다 · 재료가 모자라면 만들지 않는다
        expect(golfLogoBlobPath(sha, "A1/B2..C3d4", false)).toBe("hiq/golf-logo/g-0123456789-a1b2c3d4.png");
        expect(() => golfLogoBlobPath("xyz", "a1b2c3d4e5f6", false)).toThrow();
        expect(() => golfLogoBlobPath(sha, "../..", false)).toThrow();
    });

    it("밖에서 여는 주소 — 정적 파일은 사이트 원본을 붙이고, 올린 로고는 그대로", () => {
        expect(absoluteLogoUrl("https://www.rankue.co.kr", "/img/golf-logos/347.png")).toBe("https://www.rankue.co.kr/img/golf-logos/347.png");
        expect(absoluteLogoUrl("https://www.rankue.co.kr/", "/img/golf-logos/347.png")).toBe("https://www.rankue.co.kr/img/golf-logos/347.png");
        expect(absoluteLogoUrl("https://www.rankue.co.kr", OURS)).toBe(OURS);
        for (const no of [null, undefined, "", "  ", "img/x.png"]) expect(absoluteLogoUrl("https://www.rankue.co.kr", no as any)).toBeNull();
    });
});

describe("끌어다 놓은 자료에서 그림 주소 찾기", () => {
    it("다른 사이트의 그림을 끌어오면 text/html 에 <img src> 가 온다 — 그 주소", () => {
        const html = `<meta charset="utf-8"><a href="https://club.example/"><img alt="logo" class="x" src="https://club.example/images/logo.png?v=2&amp;w=300" srcset="a.png 2x"></a>`;
        expect(imageUrlFromDrop(html, "https://club.example/", "")).toBe("https://club.example/images/logo.png?v=2&w=300");
        expect(imageUrlFromDrop(`<img src='//cdn.club.example/l.svg'>`, "", "")).toBe("https://cdn.club.example/l.svg");
        expect(imageUrlFromDrop(`<IMG SRC=https://club.example/l.gif>`, "", "")).toBe("https://club.example/l.gif");
    });

    it("그림 표시가 없으면 주소 목록·글자의 첫 http(s) 주소 — 주석 줄(#)은 건너뛴다", () => {
        expect(imageUrlFromDrop("", "# comment\r\nhttps://club.example/logo.png\r\nhttps://other.example/", "")).toBe("https://club.example/logo.png");
        expect(imageUrlFromDrop(null, null, "https://club.example/logo.png")).toBe("https://club.example/logo.png");
        expect(imageUrlFromDrop("<p>글자만</p>", "", "그냥 글자")).toBeNull();
        expect(imageUrlFromDrop("", "", "")).toBeNull();
    });

    it("data: · blob: · javascript: · 계정 정보가 붙은 주소 · 한 낱말 호스트는 받지 않는다", () => {
        for (const src of ["data:image/png;base64,AAAA", "blob:https://club.example/1", "javascript:alert(1)", "file:///etc/passwd", "https://user:pw@club.example/l.png", "http://localhost/l.png", "ftp://club.example/l.png"]) {
            expect(imageUrlFromDrop(`<img src="${src}">`, "", ""), src).toBeNull();
            expect(cleanRemoteImageUrl(src), src).toBeNull();
        }
        expect(cleanRemoteImageUrl("  http://club.example/l.png#frag ")).toBe("http://club.example/l.png");
        expect(cleanRemoteImageUrl(`https://club.example/${"a".repeat(2100)}`)).toBeNull();
        for (const v of [null, undefined, 12, {}, ""]) expect(cleanRemoteImageUrl(v)).toBeNull();
    });
});

describe("다시 그릴 때의 계산", () => {
    const px = (list: [number, number, number, number][]) => Uint8ClampedArray.from(list.flat());
    const CLEAR: [number, number, number, number] = [0, 0, 0, 0];
    const INK: [number, number, number, number] = [20, 60, 40, 255];
    const WHITE: [number, number, number, number] = [255, 255, 255, 255];

    it("투명 여백을 뺀 테두리 — 전부 투명이면 null", () => {
        // 4×3 — 가운데 2×1 만 잉크
        const img = px([CLEAR, CLEAR, CLEAR, CLEAR, CLEAR, INK, INK, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR]);
        expect(opaqueBounds(img, 4, 3)).toEqual({ x: 1, y: 1, w: 2, h: 1 });
        expect(opaqueBounds(px([INK, INK, INK, INK]), 2, 2)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
        expect(opaqueBounds(px([CLEAR, CLEAR, CLEAR, CLEAR]), 2, 2)).toBeNull();
        // 거의 안 보이는 얼룩(알파 3)은 여백으로 본다
        expect(opaqueBounds(px([[0, 0, 0, 3], INK, CLEAR, CLEAR]), 2, 2)).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    });

    it("흰색뿐인 로고 — 투명 바탕에 밝은 글자뿐이면 어두운 판. 짙은 로고·흰 바탕 그림은 아니다", () => {
        expect(looksLightLogo(px([CLEAR, WHITE, WHITE, CLEAR, WHITE, CLEAR, CLEAR, WHITE, [250, 250, 245, 255], CLEAR]))).toBe(true);
        expect(looksLightLogo(px([CLEAR, INK, INK, CLEAR, WHITE, CLEAR]))).toBe(false);
        // 흰 바탕이 꽉 찬 그림(JPEG 로고)은 흰 판에 그대로 얹으면 된다
        expect(looksLightLogo(px([WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, INK]))).toBe(false);
        expect(looksLightLogo(px([CLEAR, CLEAR]))).toBe(false);
    });

    it("크기 — 긴 변 512, 작은 그림은 키우지 않는다. 벡터(크기 없음)는 512 로", () => {
        expect(fitLogoSize(1024, 256)).toEqual({ w: 512, h: 128 });
        expect(fitLogoSize(300, 900)).toEqual({ w: 171, h: 512 });
        expect(fitLogoSize(247, 77)).toEqual({ w: 247, h: 77 });
        expect(fitLogoSize(100, 50, 512, true)).toEqual({ w: 512, h: 256 });
        expect(fitLogoSize(0, 0)).toEqual({ w: 512, h: 512 });
        expect(GOLF_LOGO_MAX_PX).toBe(512);
        expect(GOLF_LOGO_MAX_BYTES).toBe(600 * 1024);
        // 서버가 대신 받아 화면에 넘길 때 base64 로 부풀어도 서버리스 응답 한도(4.5MB) 안이어야 한다
        expect(Math.ceil(LOGO_FETCH_MAX_BYTES / 3) * 4).toBeLessThan(4 * 1024 * 1024);
    });
});

describe("규칙이 끝까지 이어져 있는가(소스)", () => {
    it("적재 스크립트: 올린 로고는 다시 적재해도 남긴다 — 그 밖의 로고는 예전처럼 자료 값으로", () => {
        const load = root("server/scripts/golf-course-pages.ts");
        expect(load).toContain("logo = case when golf_course_pages.logo ~ ${UPLOADED_LOGO_SQL_RE} then golf_course_pages.logo else excluded.logo end,");
        expect(code(load)).not.toContain("logo = excluded.logo");
        // 공식 로고 자료를 따로 얹는 스크립트는 빈 칸에만 쓴다 — 올린 로고를 덮지 않는다
        expect(root("server/scripts/golf-logos-official.ts")).toContain("set logo = case when coalesce(logo, '') = '' then");
    });

    it("서버: 올리기는 화면이 다시 그린 PNG 만 · 올린 주소 꼴일 때만 페이지에 적는다 · 실패하면 올린 파일을 지운다", () => {
        const route = code(root("server/routes/modules/adminGolf/courses.ts"));
        const up = route.slice(route.indexOf('router.post("/:slug/logo"'), route.indexOf("export default router;"));
        expect(up).toContain('if (clean.type !== "png" || clean.buffer.length < 33) return sendError(res, 400, "PNG 그림만 올릴 수 있습니다");');
        expect(up).toContain("if (width < 16 || height < 16 || width > GOLF_LOGO_MAX_PX || height > GOLF_LOGO_MAX_PX) {");
        expect(up).toContain("if (!isUploadedLogo(saved.url)) {");
        expect(up).toContain("const r = await patchCoursePage(slug, { logo: saved.url }, { logo: before });");
        expect(up.match(/await deleteBlobs\(saved\.url\);/g)).toHaveLength(2);
        expect(up).toContain("if (isUploadedLogo(before)) await deleteBlobs(before);");
        expect(up).toContain('adminLog(req, "golf.course.logo.upload", {');
        // 내리기 — 올린 로고면 저장소의 파일도 지운다. 정적 파일 로고는 건드리지 않는다
        expect(route).toContain("if (logoCleared && isUploadedLogo(r.before.logo)) await deleteBlobs(r.before.logo);");
        // 전부 관리자 가드 뒤
        const index = code(root("server/routes/modules/adminGolf/index.ts"));
        expect(index.indexOf("router.use(checkSuperAdmin);")).toBeGreaterThan(0);
        expect(index.indexOf('router.use("/courses", courses);')).toBeGreaterThan(index.indexOf("router.use(checkSuperAdmin);"));
    });

    it("서버: 대신 받아 온 그림은 저장하지 않고 화면에 넘기기만 한다", () => {
        const route = code(root("server/routes/modules/adminGolf/courses.ts"));
        const fetchRoute = route.slice(route.indexOf('router.post("/logo/fetch"'), route.indexOf('router.post("/:slug/logo"'));
        expect(fetchRoute).toContain("const r = await fetchRemoteImage(url);");
        expect(fetchRoute).toContain('res.set("Cache-Control", "no-store");');
        expect(fetchRoute).not.toContain("put(");
        expect(fetchRoute).not.toContain("patchCoursePage");
    });

    it("공유 카드·구조화 데이터: 올린 로고의 주소를 그대로 쓴다(사이트 원본을 앞에 붙이지 않는다)", () => {
        const og = code(root("server/ogImage.ts"));
        expect(og).toContain("const uploaded = isUploadedLogo(path);");
        expect(og).toContain("const r = await fetch(uploaded ? path : `${ORIGIN}${path}`, { signal: AbortSignal.timeout(3000) });");
        const pre = code(root("server/prerender.ts"));
        expect(pre).toContain("...(absoluteLogoUrl(ORIGIN, p.logo) ? { logo: absoluteLogoUrl(ORIGIN, p.logo) } : {}),");
        expect(pre).not.toContain("logo: `${ORIGIN}${p.logo}`");
    });

    it("화면: 끌어다 놓기(파일 먼저, 없으면 주소) · 붙여넣기(글자 칸은 건드리지 않는다) · 파일 고르기 → 미리 보기 → 올리기", () => {
        const view = code(root("client/src/pages/admin/golf/GolfCoursesView.tsx"));
        const ed = view.slice(view.indexOf("function LogoEditor("), view.indexOf("function CoordsEditor("));
        expect(ed).toContain('const file = Array.from(e.dataTransfer.files ?? []).find((f) => f.type.startsWith("image/"));');
        expect(ed).toContain('const url = imageUrlFromDrop(e.dataTransfer.getData("text/html"), e.dataTransfer.getData("text/uri-list"), e.dataTransfer.getData("text/plain"));');
        expect(ed.indexOf("if (file) return void takeBlob(file);")).toBeLessThan(ed.indexOf("if (url) return void takeUrl(url);"));
        expect(ed).toContain('if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;');
        expect(ed).toContain('document.addEventListener("paste", onPaste);');
        expect(ed).toContain('return () => document.removeEventListener("paste", onPaste);');
        expect(ed).toContain('<input ref={fileRef} type="file" accept="image/*" className="hidden"');
        // 올리는 것은 다시 그린 PNG 와 흰 로고 표시 — 고치기 전 로고가 그대로일 때만
        expect(ed).toContain("body: { png: x.png, light: x.light, expected: { logo: d.logo } }");
        // 있는 로고를 바꿀 때는 묻는다 — 브라우저의 confirm 이 아니라 앱의 확인 창으로
        expect(ed).toContain("if (d.logo && !(await appConfirm({");
        expect(ed).not.toMatch(/window\.confirm|[^p]confirm\(/);
        expect(view).not.toContain("로고 올리기는 아직 없습니다");
        // 다시 그리기 — 원본 파일을 올리지 않는다
        const lib = code(root("client/src/pages/admin/golf/logoUpload.ts"));
        expect(lib).toContain('const png = out.toDataURL("image/png");');
        expect(lib).toContain("const box = opaqueBounds(full.data, size.w, size.h);");
        expect(lib).toContain("light: looksLightLogo(cut.data)");
    });
});
