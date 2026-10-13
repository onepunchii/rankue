import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../db.js", () => ({ db: {} }));
import { openScan, resolveCardWith, signScan } from "./golfScanRound";
import type { ScanRead } from "../../shared/golfScorecardScan";

const ENV = { ...process.env };
beforeEach(() => { process.env.COOKIE_SECRET = "s".repeat(32); });
afterEach(() => { process.env = { ...ENV }; });

const FRONT = [5, 4, 3, 4, 5, 4, 3, 4, 4], BACK = [5, 4, 3, 4, 5, 4, 4, 3, 4];
const index = {
    clubs: [{ id: "a", name: "솔모로컨트리클럽" }, { id: "b", name: "남서울컨트리클럽" }],
    courses: new Map([["a", [{ name: "메이플", pars: FRONT }, { name: "파인", pars: BACK }, { name: "체리", pars: [4, 4, 3, 4, 5, 4, 4, 3, 5] }]]]),
};
const read = (over: Partial<ScanRead> = {}): ScanRead => ({ kind: "app", date: "2026/10/12", club: "SOLMORO COUNTRY CLUB", clubKo: "솔모로 컨트리클럽", courses: ["Maple", "Pine"], coursesKo: ["메이플", "파인"], pars: [...FRONT, ...BACK].map(String), rows: [], ...over });

describe("카드를 명부와 맞추기", () => {
    it("영문 로고의 카드 — 골프장 · 전반 · 후반 · 18홀 파까지", () => {
        const r = resolveCardWith(read(), index);
        expect(r.club?.id).toBe("a");
        expect([r.front?.name, r.back?.name]).toEqual(["메이플", "파인"]);
        expect([r.front?.pars, r.back?.pars]).toEqual([FRONT, BACK]);
    });
    it("코스를 하나만 맞춰도 그쪽은 쓴다(다른 쪽은 카드의 파) · 골프장을 못 맞추면 전부 null", () => {
        const one = resolveCardWith(read({ courses: ["Maple", "Oak"], coursesKo: ["메이플", "오크"], pars: [...FRONT, ...Array(9).fill(4)].map(String) }), index);
        expect([one.club?.id, one.front?.name, one.back]).toEqual(["a", "메이플", null]);
        expect(resolveCardWith(read({ club: "URBAN CC", clubKo: "어반 CC" }), index)).toEqual({ club: null, front: null, back: null });
    });
});

describe("읽은 줄의 서명", () => {
    const rows = [[5, 4, 3], [4, 4, 4]];
    const found = { clubId: "a", front: "메이플", back: "파인" };
    it("그 회원이 · 시간 안에 돌려주면 열린다", () => {
        const t = signScan("me", rows, "2026-10-12", found, 1_000)!;
        expect(openScan(t, "me", 2_000)).toMatchObject({ r: rows, d: "2026-10-12", c: "a", f: "메이플", b: "파인" });
    });
    it("다른 회원 · 고친 내용 · 지난 시간 · 엉뚱한 값은 열리지 않는다", () => {
        const t = signScan("me", rows, null, found, 1_000)!;
        expect(openScan(t, "you", 2_000)).toBeNull();
        expect(openScan(t, "me", 1_000 + 31 * 60_000)).toBeNull();
        const [body, sig] = t.split(".");
        const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), r: [[1, 1, 1]] })).toString("base64url");
        expect(openScan(`${forged}.${sig}`, "me", 2_000)).toBeNull();
        for (const bad of [null, "", "a.b", 3, "x".repeat(5000)]) expect(openScan(bad, "me", 2_000), String(bad).slice(0, 8)).toBeNull();
    });
    it("열쇠가 없으면 서명하지 않는다 — 공식으로 올릴 길이 없다", () => {
        delete process.env.COOKIE_SECRET;
        expect(signScan("me", rows, null, found)).toBeNull();
        expect(openScan("a.b", "me")).toBeNull();
    });
});
