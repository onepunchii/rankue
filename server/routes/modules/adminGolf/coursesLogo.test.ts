// 골프 관리 · 골프장 데이터 · 로고 올리기(2026-10-07) — 무엇을 받고, 저장소·페이지에 무엇을 쓰고, 실패하면 무엇을 치우는지 본다.
// DB·저장소(Blob)·다른 사이트 요청은 전부 가짜.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const m = vi.hoisted(() => ({
    get: vi.fn(), patch: vi.fn(), official: vi.fn(), put: vi.fn(), del: vi.fn(), fetchRemote: vi.fn(), log: vi.fn(),
}));
vi.mock("../../../storage/adminGolfCourses.js", () => ({
    listCourseData: vi.fn(), getCourseData: m.get, saveNinePars: vi.fn(), addNine: vi.fn(), patchCoursePage: m.patch, setClubCoords: vi.fn(), officialLogoFor: m.official,
}));
vi.mock("@vercel/blob", () => ({ put: m.put }));
vi.mock("../../../utils/blob.js", () => ({ deleteBlobs: m.del }));
vi.mock("../../../lib/remoteImage.js", () => ({ fetchRemoteImage: m.fetchRemote }));
vi.mock("../../../middleware/adminAuth.js", () => ({ adminLog: m.log }));

import router from "./courses";

const SLUG = "킹즈락CC";
const HOST = "https://abc123store.public.blob.vercel-storage.com";
const OLD_UPLOAD = `${HOST}/hiq/golf-logo/g-0000000000-aaaaaaaaaaaa.png`;
const STATIC = "/img/golf-logos/347.png";

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const chunk = (type: string, data: Buffer) => Buffer.concat([u32(data.length), Buffer.from(type, "ascii"), data, u32(0)]);
/** 머리(IHDR)에 크기가 적힌 PNG 꼴 — 픽셀은 시험에 필요 없다 */
function png(width: number, height: number, extra: Buffer[] = []): Buffer {
    const ihdr = Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])]);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...extra, chunk("IDAT", Buffer.alloc(24, 7)), chunk("IEND", Buffer.alloc(0))]);
}
const b64 = (b: Buffer) => b.toString("base64");

let base = "";
let server: ReturnType<express.Express["listen"]>;
beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use("/courses", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/courses`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

let page: { logo: string | null };
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-blob-token");
    page = { logo: null };
    m.get.mockImplementation(async (slug: string) => (slug === SLUG ? { slug, name: "킹즈락CC", logo: page.logo } : null));
    m.put.mockImplementation(async (path: string) => ({ url: `${HOST}/${path}` }));
    m.patch.mockImplementation(async (_slug: string, changes: any, expected: any) => {
        if (expected && "logo" in expected && expected.logo !== page.logo) return { ok: false, reason: "changed", current: { website: null, phone: null, logo: page.logo } };
        const before = { website: null, phone: null, logo: page.logo };
        page.logo = changes.logo;
        return { ok: true, before, after: { website: null, phone: null, logo: page.logo }, changed: ["logo"] };
    });
    m.official.mockReturnValue({ checked: true, entry: null });
});

const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() as any, cache: res.headers.get("cache-control") };
};
const upload = (body: unknown) => call("POST", `/${encodeURIComponent(SLUG)}/logo`, body);

describe("POST /:slug/logo — 로고 올리기", () => {
    it("PNG 를 우리 저장소의 golf-logo 폴더에 넣고 페이지의 로고 칸에 그 주소를 적는다", async () => {
        const r = await upload({ png: `data:image/png;base64,${b64(png(247, 77))}`, expected: { logo: null } });
        expect(r.status).toBe(201);
        expect(m.put).toHaveBeenCalledTimes(1);
        const [path, body, opts] = m.put.mock.calls[0];
        expect(path).toMatch(/^hiq\/golf-logo\/g-[0-9a-f]{10}-[0-9a-f]{12}\.png$/);
        expect(opts).toEqual({ access: "public", contentType: "image/png", addRandomSuffix: false, token: "test-blob-token" });
        expect(Buffer.isBuffer(body)).toBe(true);
        expect(m.patch).toHaveBeenCalledWith(SLUG, { logo: `${HOST}/${path}` }, { logo: null });
        expect(r.json.data).toMatchObject({ slug: SLUG, logo: `${HOST}/${path}`, logoOrigin: "upload", changed: ["logo"] });
        expect(m.del).not.toHaveBeenCalled();
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf.course.logo.upload", expect.objectContaining({ slug: SLUG, before: null, after: `${HOST}/${path}`, width: 247, height: 77, light: false }));
    });

    it("같은 골프장은 늘 같은 해시(슬러그) + 매번 다른 난수 — 흰 로고는 이름이 -light.png 로 끝난다", async () => {
        await upload({ png: b64(png(100, 40)) });
        page.logo = null;
        await upload({ png: b64(png(100, 40)), light: true });
        const [a, b] = m.put.mock.calls.map((c) => String(c[0]));
        expect(a.slice(0, 27)).toBe(b.slice(0, 27));
        expect(a).not.toBe(b.replace("-light", ""));
        expect(b).toMatch(/-light\.png$/);
        expect(a).not.toMatch(/-light\.png$/);
    });

    it("메타 정보 조각(글 조각·EXIF)은 걷고 저장한다", async () => {
        const secret = Buffer.from("Comment\0made on my laptop /Users/someone");
        await upload({ png: b64(png(64, 64, [chunk("tEXt", secret)])) });
        expect((m.put.mock.calls[0][1] as Buffer).includes(Buffer.from("/Users/someone"))).toBe(false);
    });

    it("올린 로고를 바꿔 올리면 앞의 파일을 지운다 — 정적 파일 로고는 건드리지 않는다", async () => {
        page.logo = OLD_UPLOAD;
        expect((await upload({ png: b64(png(64, 64)), expected: { logo: OLD_UPLOAD } })).status).toBe(201);
        expect(m.del).toHaveBeenCalledTimes(1);
        expect(m.del).toHaveBeenCalledWith(OLD_UPLOAD);

        vi.clearAllMocks();
        page.logo = STATIC;
        expect((await upload({ png: b64(png(64, 64)), expected: { logo: STATIC } })).status).toBe(201);
        expect(m.del).not.toHaveBeenCalled();
    });

    it("그 사이 로고가 바뀌었으면(expected 불일치) 저장소에 올리기 전에 409", async () => {
        page.logo = STATIC;
        const r = await upload({ png: b64(png(64, 64)), expected: { logo: null } });
        expect(r.status).toBe(409);
        expect(r.json.code ?? r.json.data?.code).toBe("PAGE_CHANGED");
        expect(m.put).not.toHaveBeenCalled();
    });

    it("올린 뒤 페이지에 적지 못했으면(경합) 방금 올린 파일을 지운다 — 주인 없는 파일을 남기지 않는다", async () => {
        m.patch.mockResolvedValueOnce({ ok: false, reason: "changed", current: { website: null, phone: null, logo: STATIC } });
        const r = await upload({ png: b64(png(64, 64)) });
        expect(r.status).toBe(409);
        expect(m.del).toHaveBeenCalledTimes(1);
        expect(m.del).toHaveBeenCalledWith(`${HOST}/${m.put.mock.calls[0][0]}`);
    });

    it("저장소가 준 주소가 '올린 로고' 꼴이 아니면 쓰지 않고 지운다", async () => {
        m.put.mockResolvedValueOnce({ url: "https://abc123store.public.blob.vercel-storage.com/somewhere/else.png" });
        const r = await upload({ png: b64(png(64, 64)) });
        expect(r.status).toBe(500);
        expect(m.patch).not.toHaveBeenCalled();
        expect(m.del).toHaveBeenCalledWith("https://abc123store.public.blob.vercel-storage.com/somewhere/else.png");
    });

    it("PNG 가 아닌 것 · 크기가 안 맞는 것 · 너무 큰 것 · 모양이 틀린 요청은 저장소에 닿기 전에 거절한다", async () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xd9]);
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
        const cases: [unknown, number][] = [
            [{}, 400],
            [{ png: "" }, 400],
            [{ png: 12 }, 400],
            [{ png: b64(jpeg) }, 400],
            [{ png: b64(svg) }, 400],
            [{ png: b64(Buffer.from("그림이 아님")) }, 400],
            [{ png: b64(png(8, 64)) }, 400],
            [{ png: b64(png(513, 64)) }, 400],
            [{ png: b64(png(64, 2000)) }, 400],
            [{ png: b64(png(64, 64)), light: "yes" }, 400],
            [{ png: b64(png(64, 64)), expected: "x" }, 400],
            [{ png: b64(png(64, 64)), expected: { logo: 3 } }, 400],
            [{ png: b64(png(64, 64, [chunk("IDAT", Buffer.alloc(620 * 1024, 5))])) }, 413],
        ];
        for (const [body, status] of cases) expect((await upload(body)).status, JSON.stringify(body).slice(0, 60)).toBe(status);
        expect(m.put).not.toHaveBeenCalled();
        expect(m.patch).not.toHaveBeenCalled();
    });

    it("없는 골프장은 404 · 저장소 키가 없으면 503 — 둘 다 아무것도 쓰지 않는다", async () => {
        expect((await call("POST", `/${encodeURIComponent("없는곳")}/logo`, { png: b64(png(64, 64)) })).status).toBe(404);
        vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
        expect((await upload({ png: b64(png(64, 64)) })).status).toBe(503);
        expect(m.put).not.toHaveBeenCalled();
    });
});

describe("POST /logo/fetch — 다른 사이트의 그림을 대신 받아 화면에 넘긴다", () => {
    it("받은 그림을 base64 로 넘긴다 — 저장하지 않고, 캐시하지 않는다", async () => {
        const body = png(120, 40);
        m.fetchRemote.mockResolvedValue({ ok: true, type: "png", mime: "image/png", buffer: body, url: "https://club.example/logo.png" });
        const r = await call("POST", "/logo/fetch", { url: " https://club.example/logo.png#top " });
        expect(r.status).toBe(200);
        expect(m.fetchRemote).toHaveBeenCalledWith("https://club.example/logo.png");
        expect(r.json.data).toEqual({ type: "png", mime: "image/png", bytes: body.length, base64: b64(body) });
        expect(r.cache).toBe("no-store");
        expect(m.put).not.toHaveBeenCalled();
        expect(m.patch).not.toHaveBeenCalled();
    });

    it("받을 수 없는 주소 꼴은 요청을 보내기 전에 400", async () => {
        for (const url of [undefined, "", 12, "javascript:alert(1)", "file:///etc/passwd", "http://localhost/a.png", "https://user:pw@club.example/a.png"]) {
            expect((await call("POST", "/logo/fetch", { url })).status, String(url)).toBe(400);
        }
        expect(m.fetchRemote).not.toHaveBeenCalled();
    });

    it("받지 못한 이유를 사람 말로 — 사설 주소는 400, 나머지는 422", async () => {
        const reasons: [string, number, string][] = [
            ["private", 400, "LOGO_FETCH_PRIVATE"], ["dns", 422, "LOGO_FETCH_DNS"], ["http", 422, "LOGO_FETCH_HTTP"], ["too-big", 422, "LOGO_FETCH_TOO_BIG"],
            ["not-image", 422, "LOGO_FETCH_NOT_IMAGE"], ["timeout", 422, "LOGO_FETCH_TIMEOUT"], ["redirects", 422, "LOGO_FETCH_REDIRECTS"], ["network", 422, "LOGO_FETCH_NETWORK"],
        ];
        for (const [reason, status, code] of reasons) {
            m.fetchRemote.mockResolvedValueOnce({ ok: false, reason });
            const r = await call("POST", "/logo/fetch", { url: "https://club.example/logo.png" });
            expect(r.status, reason).toBe(status);
            expect(JSON.stringify(r.json), reason).toContain(code);
            expect(String(r.json.message ?? r.json.error ?? "").length, reason).toBeGreaterThan(4);
        }
    });
});

describe("PATCH /:slug — 로고 내리기", () => {
    it("올린 로고를 내리면 저장소의 파일도 지운다", async () => {
        page.logo = OLD_UPLOAD;
        const r = await call("PATCH", `/${encodeURIComponent(SLUG)}`, { logo: null, expected: { logo: OLD_UPLOAD } });
        expect(r.status).toBe(200);
        expect(m.del).toHaveBeenCalledWith(OLD_UPLOAD);
        expect(r.json.data.removedLogo).toEqual({ path: OLD_UPLOAD, origin: "upload" });
    });

    it("정적 파일 로고를 내릴 때는 아무 파일도 지우지 않는다 · 주소를 적어 넣는 길은 여전히 없다", async () => {
        page.logo = STATIC;
        expect((await call("PATCH", `/${encodeURIComponent(SLUG)}`, { logo: null })).status).toBe(200);
        expect(m.del).not.toHaveBeenCalled();
        expect((await call("PATCH", `/${encodeURIComponent(SLUG)}`, { logo: "https://evil.example/x.png" })).status).toBe(400);
        expect((await call("PATCH", `/${encodeURIComponent(SLUG)}`, { logo: OLD_UPLOAD })).status).toBe(400);
    });
});
