/**
 * 코리아둘레길 코스 도장의 길(2026-10-21) — POST /trails/:route/:key/check · GET /trails/me.
 * 저장소 · DB · 축제 · 날씨는 가짜다(운영 DB 를 건드리지 않는다). 서버를 띄우지 않고 라우터의 핸들러를 직접 부른다(memberWithdrawNotice.test 와 같은 방식).
 * 코스 자료는 진짜 파일(server/assets/trails/korea-trails.json) — 해파랑길 1코스의 두 끝으로 걷는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const m = vi.hoisted(() => {
    const checks: { member: string; courseId: string; end: "start" | "end"; atMs: number }[] = [];
    const stamps: { member: string; courseId: string; route: string; key: string; firstEnd: "start" | "end"; startedMs: number; doneMs: number }[] = [];
    return { checks, stamps };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../middleware/hikingAccess.js", () => ({ requireHikingAccess: [(req: any, _res: unknown, next: () => void) => { req.userId = ME; next(); }] }));
vi.mock("../../services/tourFestivals.js", () => ({ tourFestivals: async () => [], kstYmd: () => "20261021" }));
vi.mock("../../services/golfWeather.js", () => ({ getCourseWeather: async () => null }));
vi.mock("../../storage/trailStamps.js", () => ({
    addTrailCheck: async (member: string, c: { id: string }, end: "start" | "end", atMs: number) => { m.checks.push({ member, courseId: c.id, end, atMs }); },
    trailChecksToday: async (member: string, since: number) => m.checks.filter((x) => x.member === member && x.atMs >= since).length,
    recentTrailChecks: async (member: string, courseId: string, now: number) => m.checks.filter((x) => x.member === member && x.courseId === courseId && x.atMs >= now - 36 * 3_600_000).map((x) => ({ courseId, route: "", key: "", end: x.end, atMs: x.atMs })),
    addTrailStamp: async (member: string, c: { id: string; route: string; key: string }, from: { end: "start" | "end"; atMs: number }, doneMs: number) => {
        if (m.stamps.some((s) => s.member === member && s.courseId === c.id)) return false;
        m.stamps.push({ member, courseId: c.id, route: c.route, key: c.key, firstEnd: from.end, startedMs: from.atMs, doneMs });
        return true;
    },
    myTrailStamps: async (member: string) => m.stamps.filter((s) => s.member === member),
    myOpenTrailChecks: async () => [],
}));

import trailsRouter from "./trails";
import { trailCourse } from "../../storage/koreaTrails";

type Out = { status: number; body: any };
function call(method: "get" | "post", path: string, opts: { params?: Record<string, string>; body?: unknown } = {}): Promise<Out> {
    const layer = (trailsRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`시험에 없는 길: ${method.toUpperCase()} ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<Out>((done, fail) => {
        const out: Out = { status: 200, body: undefined };
        const res: any = { locals: { locale: "ko" }, headersSent: false, set() { return res; }, status(code: number) { out.status = code; return res; }, json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; } };
        const req: any = { params: opts.params ?? {}, query: {}, body: opts.body ?? {}, headers: {} };
        let i = 0;
        const next = (err?: unknown) => { if (err) { fail(err); return; } const h = handlers[i++]; if (!h) { fail(new Error("응답 없이 끝남")); return; } try { h(req, res, next); } catch (e) { fail(e); } };
        next();
    });
}
const one = trailCourse("haeparang", "1")!.course;
const at = (p: readonly [number, number], dLat = 0) => ({ lat: p[0] + dLat, lng: p[1], accuracy: 15 });
const check = (body: unknown) => call("post", "/:route/:key/check", { params: { route: "haeparang", key: "1" }, body });

beforeEach(() => { m.checks.length = 0; m.stamps.length = 0; vi.useRealTimers(); });

describe("코스 도장 — 길", () => {
    it("멀면 아무것도 남기지 않고 까닭만", async () => {
        const r = await check(at(one.start, 0.02));
        expect(r.body.data).toMatchObject({ state: "far", stamped: false });
        expect(m.checks).toHaveLength(0);
    });
    it("시작에서 출발 확인 → 끝에서 한 번 더 = 도장(출발한 끝 · 때가 남는다) · 같은 코스는 한 번만", async () => {
        vi.useFakeTimers({ now: Date.parse("2026-10-21T00:00:00Z"), toFake: ["Date"] });
        expect((await check(at(one.start))).body.data).toMatchObject({ state: "half", end: "start", stamped: false });
        vi.setSystemTime(Date.parse("2026-10-21T06:30:00Z"));
        expect((await check(at(one.end))).body.data).toMatchObject({ state: "done", end: "end", stamped: true, startedAt: "2026-10-21T00:00:00.000Z" });
        expect(m.stamps).toEqual([expect.objectContaining({ courseId: one.id, firstEnd: "start", route: "haeparang", key: "1" })]);
        // 다시 걸어도 처음 받은 도장이 남는다
        vi.setSystemTime(Date.parse("2026-10-21T08:00:00Z"));
        expect((await check(at(one.start))).body.data).toMatchObject({ state: "done", stamped: false });
        expect(m.stamps).toHaveLength(1);
        const me = await call("get", "/me");
        expect(me.body.data.stamps).toEqual([expect.objectContaining({ courseId: one.id, doneAt: "2026-10-21T06:30:00.000Z" })]);
    });
    it("같은 끝에서 두 번은 도장이 아니다 · 36시간이 지나면 출발 확인부터 다시", async () => {
        vi.useFakeTimers({ now: Date.parse("2026-10-21T00:00:00Z"), toFake: ["Date"] });
        await check(at(one.start));
        expect((await check(at(one.start))).body.data.state).toBe("half");
        vi.setSystemTime(Date.parse("2026-10-22T13:00:00Z")); // 37시간 뒤
        expect((await check(at(one.end))).body.data.state).toBe("half");
        expect(m.stamps).toHaveLength(0);
    });
    it("하루 30번 넘게 누르면 429", async () => {
        for (let i = 0; i < 30; i++) await check(at(one.start));
        expect((await check(at(one.start))).status).toBe(429);
    });
    it("없는 코스는 404", async () => {
        const r = await call("post", "/:route/:key/check", { params: { route: "haeparang", key: "999" }, body: at(one.start) });
        expect(r.status).toBe(404);
    });
});
