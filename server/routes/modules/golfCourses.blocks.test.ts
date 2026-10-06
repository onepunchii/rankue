import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * 2026-10-06 — 골프장 공개 페이지(/api/hiq/golf-courses)의 차단 반영을 **실제 응답으로** 확인한다.
 * DB·저장소는 가짜다(운영 DB 를 건드리지 않는다). 서버를 띄우지 않고 라우터의 핸들러를 직접 부른다(handoff.test.ts 와 같은 방식).
 *
 * 지키는 것:
 *  - 비로그인 응답은 차단이 있든 없든 같다 — 차단 질의도 하지 않는다.
 *  - 로그인했지만 차단 관계가 없는 회원의 응답은 비로그인과 **글자까지** 같다.
 *  - 차단 관계인 회원의 글은 티타임 줄·글 목록에서 빠지고, 같이 나가는 숫자(글 수·다음 티타임·가까운 곳·지역 합계)도 같이 준다.
 *  - 공용 캐시는 그대로다: 차단 있는 회원이 먼저 읽어도 다음 사람은 전부 본다. 글 요약은 한 번만 읽는다.
 *  - 글쓴이 id 는 어느 응답에도 실리지 않는다.
 */
const ME = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";   // 나와 차단 관계인 회원
const C = "33333333-3333-4333-8333-333333333333";
const L = {
    bJoin: "aaaaaaaa-0000-4000-8000-000000000001",   // 남서울 · B 의 조인
    cBook: "aaaaaaaa-0000-4000-8000-000000000002",   // 남서울 · C 의 부킹
    bBook: "aaaaaaaa-0000-4000-8000-000000000003",   // 파인 · B 의 부킹
    legacy: "aaaaaaaa-0000-4000-8000-000000000004",  // 남서울 · 주인 모르는 옛 글
};

const h = vi.hoisted(() => ({ execute: vi.fn(), blockPeerIds: vi.fn(), summaryReads: { n: 0 } }));
vi.mock("../../db.js", () => ({ db: { execute: h.execute }, pool: {} }));
vi.mock("../../storage/index.js", () => ({
    storage: { golf: { blockPeerIds: h.blockPeerIds }, countJoinRequests: async () => new Map() },
}));
// 글마다 붙는 날씨는 받아 둔 예보를 읽는 일이라 여기서는 뺀다(못 읽어도 목록은 그대로 나간다)
vi.mock("../../services/golfWeather.js", () => ({ teeWeatherFor: async () => new Map() }));

import golfCoursesRouter from "./golfCourses.js";

const tee = (hours: number) => new Date(Date.now() + hours * 3_600_000);
const page = (slug: string, name: string, courseId: number, lat: number, lng: number) => ({
    slug, name, region: "경기", city: "성남시", address: null, lat, lng, course_ids: [courseId], club_id: null, kind: null, holes: 18,
    parts: null, courses: null, intro: null, info: null, fees: null, tgm_items: [], updated_at: "2026-10-01", logo: null, grass: [], play: [],
    phone: null, website: null, fee_from: null, popularity: 0, aliases: [],
});
const booking = (id: string, courseId: number, type: "JOIN" | "BOOKING", hours: number, owner: string | null) => ({
    id, course_id: String(courseId), listing_type: type, join_type: type === "JOIN" ? "FIELD" : null, datetime: tee(hours), green_fee: 150000,
    cost_mode: "FIXED", slots: null, options: [], seller_type: type === "JOIN" ? null : "PERSONAL", join_headcount: 3, join_condition: null, owner_id: owner,
});
const PAGES = [page("namseoul", "남서울CC", 74, 37.38, 127.1), page("pine", "파인CC", 75, 37.4, 127.12)];
// 티타임순(요약 질의의 order by datetime asc 와 같게)
const BOOKINGS = [
    booking(L.bJoin, 74, "JOIN", 48, B),
    booking(L.cBook, 74, "BOOKING", 60, C),
    booking(L.bBook, 75, "BOOKING", 72, B),
    booking(L.legacy, 74, "BOOKING", 96, null),
];

const dialect = new PgDialect();
const sqlText = (q: unknown) => dialect.sqlToQuery(q as any).sql.replace(/\s+/g, " ");
h.execute.mockImplementation(async (q: unknown) => {
    const s = sqlText(q);
    if (s.includes("from golf_course_pages where slug <> ''")) return { rows: PAGES };
    if (s.includes("from golf_bookings where datetime > now()")) { h.summaryReads.n++; return { rows: BOOKINGS }; }
    if (s.includes("from golf_course_watches w join golf_course_pages p")) return { rows: [{ slug: "namseoul", filters: {}, created_at: null, name: "남서울CC", region: "경기", city: "성남시" }] };
    if (s.includes("from golf_match_sessions")) return { rows: [{ n: 0 }] };
    return { rows: [] };
});

type Out = { status: number; body: any };
function call(path: string, opts: { me?: string; params?: Record<string, string>; query?: Record<string, string> } = {}): Promise<Out> {
    const layer = (golfCoursesRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    if (!layer) throw new Error(`시험에 없는 길: GET ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<Out>((done, fail) => {
        const out: Out = { status: 200, body: undefined };
        const res: any = {
            locals: { locale: "ko" }, headersSent: false,
            set() { return res; },
            status(code: number) { out.status = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
        };
        const req: any = { params: opts.params ?? {}, query: opts.query ?? {}, signedCookies: opts.me ? { hiq_user_id: opts.me } : {}, headers: {} };
        let i = 0;
        const next = (err?: unknown) => {
            if (err) { fail(err); return; }
            const handle = handlers[i++];
            if (!handle) { fail(new Error("응답 없이 끝남")); return; }
            try { handle(req, res, next); } catch (e) { fail(e); }
        };
        next();
    });
}
const ids = (ls: { id: string }[]) => ls.map((l) => l.id);
const detail = (me?: string) => call("/:slug", { me, params: { slug: "namseoul" } });

const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
afterAll(() => errorLog.mockRestore());
beforeEach(() => { h.blockPeerIds.mockReset(); h.blockPeerIds.mockResolvedValue(new Set<string>()); });

describe("골프장 한 곳(GET /:slug) — 티타임 줄", () => {
    it("비로그인: 전부 보이고, 차단을 묻지 않는다", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([B])); // 누군가의 차단이 있어도 비로그인과는 상관없다
        const r = await detail();
        expect(r.status).toBe(200);
        expect(ids(r.body.data.listings)).toEqual([L.bJoin, L.cBook, L.legacy]);
        expect(r.body.data.counts).toEqual({ booking: 2, join: 1, urgent: 0 });
        expect(h.blockPeerIds).not.toHaveBeenCalled();
    });

    it("로그인했고 차단 관계가 없으면 비로그인과 글자까지 같다", async () => {
        const anon = await detail();
        const mine = await detail(ME);
        expect(h.blockPeerIds).toHaveBeenCalledTimes(1);
        expect(h.blockPeerIds).toHaveBeenCalledWith(ME);
        expect(JSON.stringify(mine.body)).toBe(JSON.stringify(anon.body));
    });

    it("차단 관계인 회원의 글은 줄에서 빠지고, 같이 나가는 숫자도 같이 준다", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([B]));
        const r = await detail(ME);
        expect(ids(r.body.data.listings)).toEqual([L.cBook, L.legacy]);
        // 줄 수 = 숫자(조인 1건이 빠졌다)
        expect(r.body.data.counts).toEqual({ booking: 2, join: 0, urgent: 0 });
        // 가까운 골프장(파인)의 B 글도 숫자에서 빠진다 — 눌러 들어가면 글이 없는데 "부킹 1" 이 남지 않게
        const pine = r.body.data.nearby.find((n: any) => n.slug === "pine");
        expect(pine.counts).toEqual({ booking: 0, join: 0, urgent: 0 });
        expect(pine.nextTee).toBeNull();
    });

    it("주인을 모르는 옛 글과 다른 사람(C)의 글은 그대로다", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([B]));
        const r = await detail(ME);
        expect(ids(r.body.data.listings)).toContain(L.legacy);
        expect(ids(r.body.data.listings)).toContain(L.cBook);
    });

    it("차단을 못 읽으면 거르지 않고 내보낸다 — 공개 페이지를 오류로 만들지 않는다", async () => {
        h.blockPeerIds.mockRejectedValue(new Error("db down"));
        const r = await detail(ME);
        expect(r.status).toBe(200);
        expect(ids(r.body.data.listings)).toEqual([L.bJoin, L.cBook, L.legacy]);
    });

    it("없는 골프장은 예전대로 404 — 차단을 묻기 전에 끝난다", async () => {
        const r = await call("/:slug", { me: ME, params: { slug: "no-such" } });
        expect(r.status).toBe(404);
        expect(h.blockPeerIds).not.toHaveBeenCalled();
    });
});

describe("글 목록(GET /listings)과 숫자만 나가는 길", () => {
    it("글 목록: 차단 관계인 회원의 글이 빠진다 — 자르기(limit) 전에", async () => {
        const anon = await call("/listings");
        expect(ids(anon.body.data)).toEqual([L.bJoin, L.cBook, L.bBook, L.legacy]);
        h.blockPeerIds.mockResolvedValue(new Set([B]));
        const mine = await call("/listings", { me: ME });
        expect(ids(mine.body.data)).toEqual([L.cBook, L.legacy]);
        // limit=1: 빠진 글이 자리를 먹으면 빈 목록이 온다
        const one = await call("/listings", { me: ME, query: { limit: "1" } });
        expect(ids(one.body.data)).toEqual([L.cBook]);
        const join = await call("/listings", { me: ME, query: { intent: "join" } });
        expect(join.body.data).toEqual([]);
    });

    it("골프장 목록(GET /)의 글 수·다음 티타임이 그 사람의 골프장 페이지와 같다", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([B]));
        const list = await call("/", { me: ME });
        const page = await detail(ME);
        const row = (slug: string) => list.body.data.find((x: any) => x.slug === slug);
        expect(row("namseoul").counts).toEqual(page.body.data.counts);
        expect(row("namseoul").nextTee).toBe(page.body.data.listings[0].datetime);
        expect(row("pine").counts).toEqual({ booking: 0, join: 0, urgent: 0 });
        // 비로그인은 전부 센다
        const anon = await call("/");
        expect(anon.body.data.find((x: any) => x.slug === "namseoul").counts).toEqual({ booking: 2, join: 1, urgent: 0 });
        expect(anon.body.data.find((x: any) => x.slug === "pine").counts).toEqual({ booking: 1, join: 0, urgent: 0 });
    });

    it("지역 합계(GET /regions)와 내 관심 골프장(GET /watches/mine)도 같은 숫자다", async () => {
        const anon = await call("/regions");
        expect(anon.body.data[0].counts).toEqual({ booking: 3, join: 1, urgent: 0 });
        h.blockPeerIds.mockResolvedValue(new Set([B]));
        const mine = await call("/regions", { me: ME });
        expect(mine.body.data[0].counts).toEqual({ booking: 2, join: 0, urgent: 0 });
        expect(mine.body.data[0].cities[0].counts).toEqual({ booking: 2, join: 0, urgent: 0 });
        const watch = await call("/watches/mine", { me: ME });
        expect(watch.body.data[0].counts).toEqual({ booking: 2, join: 0, urgent: 0 });
    });

    it("차단 관계가 없는 회원은 세 길 모두 비로그인과 글자까지 같은 답", async () => {
        for (const path of ["/", "/regions", "/listings"]) {
            const anon = await call(path);
            const mine = await call(path, { me: ME });
            expect(JSON.stringify(mine.body), path).toBe(JSON.stringify(anon.body));
        }
    });
});

describe("공용 캐시와 글쓴이 id", () => {
    it("차단 있는 회원이 먼저 읽어도 다음 사람은 전부 본다 — 보는 사람별 결과가 캐시에 남지 않는다", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([B, C]));
        const mine = await detail(ME);
        expect(ids(mine.body.data.listings)).toEqual([L.legacy]);
        const anon = await detail();
        expect(ids(anon.body.data.listings)).toEqual([L.bJoin, L.cBook, L.legacy]);
        h.blockPeerIds.mockResolvedValue(new Set<string>());
        const other = await detail(C);
        expect(ids(other.body.data.listings)).toEqual([L.bJoin, L.cBook, L.legacy]);
        // 글 요약(공용 캐시)은 이 파일의 모든 요청을 통틀어 한 번만 읽었다
        expect(h.summaryReads.n).toBe(1);
    });

    it("글쓴이 id 는 어느 응답에도 없다 — 로그인하든 안 하든", async () => {
        h.blockPeerIds.mockResolvedValue(new Set([C]));
        const bodies = [
            await detail(), await detail(ME),
            await call("/listings"), await call("/listings", { me: ME }),
            await call("/"), await call("/", { me: ME }),
            await call("/regions", { me: ME }),
        ].map((r) => JSON.stringify(r.body));
        for (const text of bodies) {
            expect(text).not.toContain(B);
            expect(text).not.toContain(C);
            expect(text).not.toMatch(/owner/i);
        }
    });
});
