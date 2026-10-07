// 골프 관리 · 골프장 데이터 · 이름 고치기와 좌표(2026-10-07) — 무엇을 받고, 무엇을 저장 함수에 넘기고, 실패를 어떤 응답으로 돌려주는지 본다. DB 는 가짜.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const m = vi.hoisted(() => ({ rename: vi.fn(), clubCoords: vi.fn(), pageCoords: vi.fn(), log: vi.fn(), list: vi.fn() }));
vi.mock("../../../storage/adminGolfCourses.js", () => ({
    listCourseData: m.list, getCourseData: vi.fn(), saveNinePars: vi.fn(), addNine: vi.fn(), patchCoursePage: vi.fn(),
    setClubCoords: m.clubCoords, setPageCoords: m.pageCoords, renameCourse: m.rename, officialLogoFor: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("../../../utils/blob.js", () => ({ deleteBlobs: vi.fn() }));
vi.mock("../../../lib/remoteImage.js", () => ({ fetchRemoteImage: vi.fn() }));
vi.mock("../../../middleware/adminAuth.js", () => ({ adminLog: m.log }));

import router from "./courses";

const SLUG = "고성컨트리클럽";
const CLUB = "11111111-1111-4111-8111-111111111111";
let base = "";
let server: ReturnType<express.Express["listen"]>;
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/courses", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/courses`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
    vi.clearAllMocks();
    m.rename.mockResolvedValue({ ok: true, before: "고성컨트리클럽", after: "고성노벨컨트리클럽", aliases: ["고성컨트리클럽"], club: null, unchanged: false });
    m.clubCoords.mockResolvedValue({ ok: true, name: "고성컨트리클럽", before: { lat: 34.97, lng: 128.32 }, after: { lat: 34.9712345, lng: 128.3212345 }, page: { slug: SLUG, before: { lat: 35.06986, lng: 128.405289 } } });
    m.pageCoords.mockResolvedValue({ ok: true, name: "짝없는곳", before: { lat: null, lng: null }, after: { lat: 35.5, lng: 127.5 } });
});
const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() as any };
};
const enc = encodeURIComponent;

// 2026-10-07 오너: "200 이상 더 안 내려감 — 200 리밋 걸려 있나?" — 상한이 200 이라 '더 보기 (200 / 490)'에서 멈췄다
describe("GET / — 목록은 끝까지 내려간다", () => {
    const rows = Array.from({ length: 490 }, (_, i) => ({ slug: `g${i}`, name: `골프장 ${String(i).padStart(3, "0")}`, region: "경기", city: null, logo: null, missing: [], nines: 2, ninesWithPars: 2, watchers: 0, listings: 0, rounds90: 0, popularity: 490 - i, bookable: true }));
    beforeEach(() => m.list.mockResolvedValue({ rows, ledger: { nines: 980, ninesWithPars: 980 } }));

    it("'더 보기'가 키운 limit 만큼 준다 — 250 · 450 · 490(전부)", async () => {
        for (const n of [50, 200, 250, 450, 490]) {
            const r = await call("GET", `/?limit=${n}`);
            expect(r.json.data.rows.length, String(n)).toBe(n);
            expect(r.json.data.total).toBe(490);
        }
        const over = await call("GET", "/?limit=540");
        expect(over.json.data.rows.length).toBe(490);
    });

    it("상한은 골프장 페이지 수보다 넉넉하다 — 화면이 50씩 키우며 끝까지 갈 수 있다", async () => {
        const { COURSE_LIST_MAX } = await import("../../../../shared/golfParEdit.js");
        expect(COURSE_LIST_MAX).toBeGreaterThanOrEqual(1000);
        expect(COURSE_LIST_MAX).toBeGreaterThan(rows.length * 2);
        // 터무니없는 값은 상한에서 자른다 · 값이 없으면 50
        m.list.mockResolvedValue({ rows: Array.from({ length: COURSE_LIST_MAX + 30 }, (_, i) => ({ ...rows[0], slug: `x${i}` })), ledger: { nines: 0, ninesWithPars: 0 } });
        expect((await call("GET", "/?limit=999999")).json.data.rows.length).toBe(COURSE_LIST_MAX);
        expect((await call("GET", "/")).json.data.rows.length).toBe(50);
    });
});

describe("PUT /:slug/name — 골프장 이름 고치기", () => {
    it("이름을 다듬어(앞뒤 공백 · 겹친 공백) 넘기고, 고치기 전 이름과 '원장도 같이'를 그대로 전한다", async () => {
        const r = await call("PUT", `/${enc(SLUG)}/name`, { name: "  고성노벨   컨트리클럽 ", expected: "고성컨트리클럽", alsoClub: true });
        expect(r.status).toBe(200);
        expect(m.rename).toHaveBeenCalledWith(SLUG, "고성노벨 컨트리클럽", "고성컨트리클럽", true);
        expect(r.json.data).toMatchObject({ slug: SLUG, name: "고성노벨컨트리클럽", aliases: ["고성컨트리클럽"], unchanged: false });
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf.course.name", expect.objectContaining({ slug: SLUG, before: "고성컨트리클럽", after: "고성노벨컨트리클럽" }));
    });

    it("alsoClub 을 안 보내면 원장 이름은 건드리지 않는다(false 로 넘긴다)", async () => {
        await call("PUT", `/${enc(SLUG)}/name`, { name: "고성노벨컨트리클럽" });
        expect(m.rename).toHaveBeenCalledWith(SLUG, "고성노벨컨트리클럽", undefined, false);
    });

    it("이름 규칙에 안 맞으면 저장 함수를 부르지 않는다", async () => {
        for (const body of [{}, { name: "" }, { name: "   " }, { name: "가" }, { name: 12 }, { name: "가".repeat(41) }, { name: "<b>골프장</b>" }, { name: "골프장\u0000" },
            { name: "고성노벨CC", expected: 3 }, { name: "고성노벨CC", alsoClub: "yes" }]) {
            expect((await call("PUT", `/${enc(SLUG)}/name`, body)).status, JSON.stringify(body).slice(0, 50)).toBe(400);
        }
        expect(m.rename).not.toHaveBeenCalled();
    });

    it("실패 이유마다 다른 응답 — 없음 404, 나머지는 409 와 코드", async () => {
        const cases: [any, number, string | null][] = [
            [{ ok: false, reason: "gone" }, 404, null],
            [{ ok: false, reason: "changed", current: "딴 이름" }, 409, "PAGE_CHANGED"],
            [{ ok: false, reason: "taken" }, 409, "NAME_TAKEN"],
            [{ ok: false, reason: "club-shared" }, 409, "CLUB_SHARED"],
            [{ ok: false, reason: "club-live" }, 409, "CLUB_LIVE"],
        ];
        for (const [out, status, code] of cases) {
            m.rename.mockResolvedValueOnce(out);
            const r = await call("PUT", `/${enc(SLUG)}/name`, { name: "고성노벨컨트리클럽", alsoClub: true });
            expect(r.status, out.reason).toBe(status);
            if (code) expect(JSON.stringify(r.json), out.reason).toContain(code);
        }
        expect(m.log).not.toHaveBeenCalled();
    });

    it("바뀐 것이 없으면 기록을 남기지 않는다", async () => {
        m.rename.mockResolvedValueOnce({ ok: true, before: "고성컨트리클럽", after: "고성컨트리클럽", aliases: [], club: null, unchanged: true });
        expect((await call("PUT", `/${enc(SLUG)}/name`, { name: "고성컨트리클럽" })).status).toBe(200);
        expect(m.log).not.toHaveBeenCalled();
    });
});

describe("PATCH /clubs/:clubId/coords — 원장 좌표(+ 골프장 페이지 좌표)", () => {
    it("slug 를 같이 보내면 그 페이지의 좌표도 맞추게 넘긴다 — 무엇을 맞췄는지 돌려주고 기록한다", async () => {
        const r = await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 34.9712345, lng: 128.3212345, slug: SLUG });
        expect(r.status).toBe(200);
        expect(m.clubCoords).toHaveBeenCalledWith(CLUB, 34.9712345, 128.3212345, SLUG);
        expect(r.json.data).toEqual({ clubId: CLUB, lat: 34.9712345, lng: 128.3212345, pageSynced: SLUG });
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf.club.coords", expect.objectContaining({ clubId: CLUB, page: { slug: SLUG, before: { lat: 35.06986, lng: 128.405289 } } }));
    });

    it("slug 없이 보내면 예전처럼 원장 좌표만", async () => {
        m.clubCoords.mockResolvedValueOnce({ ok: true, name: "x", before: { lat: null, lng: null }, after: { lat: 35, lng: 127 }, page: null });
        const r = await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 35, lng: 127 });
        expect(m.clubCoords).toHaveBeenCalledWith(CLUB, 35, 127, undefined);
        expect(r.json.data.pageSynced).toBeNull();
    });

    it("그 페이지가 이 원장에 붙어 있지 않으면 409 — 화면이 새로 불러오게", async () => {
        m.clubCoords.mockResolvedValueOnce({ ok: false, reason: "page-mismatch" });
        const r = await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 35, lng: 127, slug: "다른-골프장" });
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.json)).toContain("PAGE_CHANGED");
    });

    it("한국 밖 좌표 · 글자 좌표 · 빈 slug · 원장 번호가 아닌 값은 저장 함수를 부르지 않는다", async () => {
        expect((await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 128.3, lng: 34.9, slug: SLUG })).status).toBe(400);
        expect((await call("PATCH", `/clubs/${CLUB}/coords`, { lat: "34.9", lng: "128.3" })).status).toBe(400);
        expect((await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 34.9, lng: 128.3, slug: "  " })).status).toBe(400);
        expect((await call("PATCH", `/clubs/${CLUB}/coords`, { lat: 34.9, lng: 128.3, slug: 5 })).status).toBe(400);
        expect((await call("PATCH", `/clubs/not-a-uuid/coords`, { lat: 34.9, lng: 128.3 })).status).toBe(404);
        expect(m.clubCoords).not.toHaveBeenCalled();
    });
});

describe("PATCH /:slug/coords — 원장에 짝이 없는 페이지의 좌표", () => {
    it("좌표를 넘기고 기록한다", async () => {
        const r = await call("PATCH", `/${enc("짝없는곳")}/coords`, { lat: 35.5, lng: 127.5 });
        expect(r.status).toBe(200);
        expect(m.pageCoords).toHaveBeenCalledWith("짝없는곳", 35.5, 127.5);
        expect(r.json.data).toEqual({ slug: "짝없는곳", lat: 35.5, lng: 127.5 });
        expect(m.log).toHaveBeenCalledWith(expect.anything(), "golf.course.coords", expect.objectContaining({ slug: "짝없는곳" }));
    });

    it("원장에 짝이 있으면 409(원장 좌표를 고쳐야 한다) · 없는 골프장 404 · 한국 밖 400", async () => {
        m.pageCoords.mockResolvedValueOnce({ ok: false, reason: "has-club" });
        const r = await call("PATCH", `/${enc(SLUG)}/coords`, { lat: 35.5, lng: 127.5 });
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.json)).toContain("PAGE_HAS_CLUB");
        m.pageCoords.mockResolvedValueOnce({ ok: false, reason: "gone" });
        expect((await call("PATCH", `/${enc("없는곳")}/coords`, { lat: 35.5, lng: 127.5 })).status).toBe(404);
        expect((await call("PATCH", `/${enc(SLUG)}/coords`, { lat: 50, lng: 127.5 })).status).toBe(400);
    });
});
