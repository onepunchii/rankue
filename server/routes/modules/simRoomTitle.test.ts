import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import router, { roomTitleFor } from "./simMatch.js";
import { checkContent } from "../../utils/contentFilter.js";
import { ROOM_TITLE_MAX, ROOM_TITLE_PRESETS, checkRoomTitle, roomTitleLength } from "../../../shared/sim/roomTitle.js";

/**
 * 멀티방 방제(2026-10-06 오너: "당구 멀티방에서 방제를 만들 수 있게") — 서버 쪽.
 * 서버를 띄우지 않는다: 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부르고, 저장소는 메모리 가짜다.
 *
 *  (가) 검사(roomTitleFor): 멀티방만 · 정리 · 20자 · 금칙어(내기·욕설) · 연락처 가림
 *  (나) 만들기: 검사를 거친 글만 저장된다 — 걸리면 방을 만들지 않는다
 *  (다) 목록: 방제와 방장 id(신고·차단용)가 실리고 코드는 숨긴다
 *  (라) 신고: 방 id 로 받는다 — 서버가 방장을 찾아 회원 신고로 넣고 그때의 방제를 남긴다
 *  (마) 차단 관계인 방장의 방은 목록 질의에서 빠진다(소스 고정)
 *  (바) 문구 칩 다섯 개는 다섯 언어 모두 20자 안이고 금칙어에 걸리지 않는다
 * 아래 id·이름은 시험용으로 지어낸 것이다.
 */
const HOST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROOM = "11111111-1111-4111-8111-111111111111";

const mem = vi.hoisted(() => {
    const state = {
        created: [] as any[],
        rows: new Map<string, any>(),
        waiting: [] as any[],
        reports: [] as any[],
        notified: [] as any[],
    };
    const base = (over: Record<string, unknown>) => ({
        code: "123456", guestId: null, gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        aimAssist: true, fullPreview: false, isPublic: true, handicap: true, passwordHash: null, invitedId: null, title: null,
        rules: { gameType: "3c" }, finishType: "none", hostTarget: 20, guestTarget: null, inningCap: 0, status: "waiting",
        state: null, balls: null, turn: 0, shots: 0, version: 0, winnerId: null, endReason: null, engineVersion: "v", paramsHash: "h", mismatches: 0,
        createdAt: new Date("2026-10-06T10:00:00.000Z"), startedAt: null, lastShotAt: null, finishedAt: null, turnSeenAt: null,
        hostSeenAt: null, guestSeenAt: null, aimPhi: null, aimAt: null, chatSeq: 0, watchers: null, hostTimeouts: 0, guestTimeouts: 0,
        rematchBy: null, rematchId: null, hostName: "가람", guestName: null, hostCountry: null, guestCountry: null,
        ...over,
    });
    const simMatch = {
        async create(data: any) { const row = base({ id: "22222222-2222-4222-8222-222222222222", ...data }); state.created.push(data); state.rows.set(row.id, row); return row; },
        async cancelOtherWaiting() { return []; },
        async get(id: string) { return state.rows.get(id); },
        async recentPublicRoomsByHost() { return 1; }, // 방송은 건너뛴다(같은 방장이 방금 열었다)
        async listPublicWaiting() { return state.waiting; },
    };
    const community = { async report(o: any) { state.reports.push(o); return { autoBlinded: false, authorId: null }; } };
    const notifs = { async listPushableMembers() { return []; } };
    return { state, base, storage: { simMatch, community, notifs } };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../services/notificationService.js", () => ({ notificationService: { async sendAndSaveNotification() { /* 안 쓴다 */ } } }));
vi.mock("../../services/moderation.js", () => ({ async notifyAdminsOfReport(p: unknown) { mem.state.notified.push(p); } }));

type FakeRes = { statusCode: number; body: any };
function call(method: "get" | "post", path: string, req: { userId?: string; params?: Record<string, string>; body?: unknown } = {}): Promise<FakeRes> {
    const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`라우트가 없다: ${method} ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined };
        const res: any = {
            locals: { locale: "ko" }, headersSent: false,
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
        };
        const request: any = { params: req.params ?? {}, query: {}, body: req.body ?? {}, signedCookies: req.userId ? { hiq_user_id: req.userId } : {} };
        let i = 0;
        const next = (err?: unknown) => { if (err) { fail(err); return; } const h = handlers[i++]; if (h) h(request, res, next); };
        next();
    });
}
const createBody = (over: Record<string, unknown> = {}) => ({ gameType: "3c", tableId: "DAEDAE", target: 20, isPublic: true, ...over });

beforeEach(() => {
    mem.state.created = []; mem.state.rows = new Map(); mem.state.waiting = []; mem.state.reports = []; mem.state.notified = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("(가) 방제 검사 — roomTitleFor", () => {
    it("멀티방이 아니면 받지 않는다(무엇이 와도 null)", () => {
        expect(roomTitleFor({ isPublic: false, title: "초보 환영" })).toEqual({ ok: true, title: null });
        expect(roomTitleFor({ isPublic: false, title: "가".repeat(100) })).toEqual({ ok: true, title: null });
    });
    it("정리해서 저장한다 — 줄바꿈·연속 공백, 빈 글은 방제 없음", () => {
        expect(roomTitleFor({ isPublic: true, title: "  초보\n환영  " })).toEqual({ ok: true, title: "초보 환영" });
        expect(roomTitleFor({ isPublic: true, title: "   " })).toEqual({ ok: true, title: null });
        expect(roomTitleFor({ isPublic: true })).toEqual({ ok: true, title: null });
    });
    it("20자를 넘으면 거부한다(자르지 않는다)", () => {
        expect(roomTitleFor({ isPublic: true, title: "가".repeat(20) })).toEqual({ ok: true, title: "가".repeat(20) });
        const r = roomTitleFor({ isPublic: true, title: "가".repeat(21) });
        expect(r.ok).toBe(false);
        expect(r).toMatchObject({ code: "TITLE_TOO_LONG" });
    });
    it("내기는 막는다 — 방제는 사람을 부르는 한 줄이라 '내기'라는 말 자체를 막는다(띄어쓰기로 못 빠져나간다)", () => {
        for (const bad of ["내기 한 판 하실 분", "내기 한판", "내기방", "내기 3쿠션", "점당 500 치실 분", "만원빵 3쿠션", "판돈 걸고", "5만원 게임"]) {
            expect(checkContent(bad, { context: "room" }).blocked, bad).toBe(true);
            expect(roomTitleFor({ isPublic: true, title: bad }), bad).toMatchObject({ ok: false, code: "TITLE_FILTERED" });
        }
    });
    it("다른 언어의 내기 낱말도 막는다", () => {
        for (const bad of ["Bet 10 dollars", "betting room", "apuesta 5", "Vamos a apostar", "cá cược nhé", "bahis var", "kumar"]) {
            expect(roomTitleFor({ isPublic: true, title: bad }), bad).toMatchObject({ ok: false, code: "TITLE_FILTERED" });
        }
    });
    it("욕설은 막는다(끼워넣기 우회 포함)", () => {
        for (const bad of ["씨발 한 판", "씨 1 발"]) expect(roomTitleFor({ isPublic: true, title: bad }), bad).toMatchObject({ ok: false, code: "TITLE_FILTERED" });
    });
    it("평범한 방제는 통과한다 — 새내기·끝내기·'내기 없음'·better 같은 말에 걸리지 않는다", () => {
        for (const fine of ["새내기 환영", "끝내기 연습", "내기 없이 매너겜", "내기X 편하게", "3쿠션 20점", "Better luck today", "Alphabet club", "초보만 오세요", "대대 한 판 하실 분"]) {
            expect(roomTitleFor({ isPublic: true, title: fine }), fine).toEqual({ ok: true, title: fine });
        }
    });
    it("방제 맥락은 다른 표면의 판정을 바꾸지 않는다 — 채팅·커뮤니티는 예전 그대로", () => {
        // 공통 규칙이 원래 잡던 것은 그대로 잡고, 방제에서만 더 잡는 말은 다른 맥락에서는 그대로 통과한다
        expect(checkContent("내기 한판").blocked).toBe(true);
        expect(checkContent("내기 한 판 하실 분").blocked).toBe(false);
        expect(checkContent("Bet 10 dollars").blocked).toBe(false);
        expect(checkContent("내기 한 판 하실 분", { context: "room" }).blocked).toBe(true);
    });
    it("연락처는 가린다 — 가린 뒤에도 20자를 넘지 않는다", () => {
        const r = roomTitleFor({ isPublic: true, title: "연락 010-1234-5678" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.title).not.toContain("1234");
            expect(r.title).not.toContain("5678");
            expect(roomTitleLength(r.title ?? "")).toBeLessThanOrEqual(ROOM_TITLE_MAX);
        }
    });
});

describe("(나) 방 만들기 — POST /sim/matches", () => {
    it("방제를 정리해 저장하고 응답에 싣는다", async () => {
        const r = await call("post", "/sim/matches", { userId: HOST, body: createBody({ title: "  초보   환영 " }) });
        expect(r.statusCode).toBe(201);
        expect(mem.state.created).toHaveLength(1);
        expect(mem.state.created[0].title).toBe("초보 환영");
        expect(r.body.data.title).toBe("초보 환영");
    });
    it("방제 없이도 예전처럼 만든다(null)", async () => {
        const r = await call("post", "/sim/matches", { userId: HOST, body: createBody() });
        expect(r.statusCode).toBe(201);
        expect(mem.state.created[0].title).toBeNull();
        expect(r.body.data.title).toBeNull();
    });
    it("비공개 방은 방제를 저장하지 않는다", async () => {
        const r = await call("post", "/sim/matches", { userId: HOST, body: createBody({ isPublic: false, title: "초보 환영" }) });
        expect(r.statusCode).toBe(201);
        expect(mem.state.created[0].title).toBeNull();
    });
    it("금칙어·길이에 걸리면 400 — 방을 만들지 않는다", async () => {
        const bad = await call("post", "/sim/matches", { userId: HOST, body: createBody({ title: "내기 한 판 하실 분" }) });
        expect(bad.statusCode).toBe(400);
        expect(bad.body.code).toBe("TITLE_FILTERED");
        const long = await call("post", "/sim/matches", { userId: HOST, body: createBody({ title: "가".repeat(21) }) });
        expect(long.statusCode).toBe(400);
        expect(long.body.code).toBe("TITLE_TOO_LONG");
        expect(mem.state.created).toHaveLength(0);
    });
    it("비로그인은 401", async () => {
        expect((await call("post", "/sim/matches", { body: createBody({ title: "초보 환영" }) })).statusCode).toBe(401);
    });
});

describe("(다) 방 목록 — GET /sim/rooms", () => {
    it("방제와 방장 id 가 실리고 코드는 숨긴다", async () => {
        mem.state.waiting = [mem.base({ id: ROOM, hostId: HOST, title: "초보 환영" }), mem.base({ id: "33333333-3333-4333-8333-333333333333", hostId: GUEST, hostName: "나루" })];
        const r = await call("get", "/sim/rooms", { userId: VIEWER });
        expect(r.statusCode).toBe(200);
        expect(r.body.data.map((m: any) => [m.title, m.hostId, m.code])).toEqual([["초보 환영", HOST, ""], [null, GUEST, ""]]);
    });
});

describe("(라) 신고 — POST /sim/matches/:id/report", () => {
    beforeEach(() => { mem.state.rows.set(ROOM, mem.base({ id: ROOM, hostId: HOST, title: "초보 환영" })); });

    it("방 id 로 신고하면 방장에 대한 회원 신고가 되고, 그때의 방제가 상세에 남는다 · 운영자에게 알린다", async () => {
        const r = await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: { reason: "abuse" } });
        expect(r.statusCode).toBe(200);
        expect(r.body.data).toEqual({ reported: true });
        expect(mem.state.reports).toEqual([{ targetType: "member", targetId: HOST, reporterId: VIEWER, reason: "abuse", detail: "[멀티방 방제] 초보 환영" }]);
        expect(mem.state.notified).toEqual([{ targetType: "member", targetId: HOST, reason: "abuse", reporterId: VIEWER }]);
    });
    it("방제가 없는 방도 신고할 수 있다(방장 이름도 누구에게나 보이는 글이다)", async () => {
        mem.state.rows.set(ROOM, mem.base({ id: ROOM, hostId: HOST }));
        const r = await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: { reason: "spam" } });
        expect(r.statusCode).toBe(200);
        expect(mem.state.reports[0].detail).toBe("[멀티방] 방제 없음");
    });
    it("요청 본문의 대상·상세는 읽지 않는다 — 대상은 서버가 방에서 찾는다", async () => {
        await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: { reason: "abuse", targetId: GUEST, detail: "남이 쓴 말" } });
        expect(mem.state.reports[0].targetId).toBe(HOST);
        expect(mem.state.reports[0].detail).toBe("[멀티방 방제] 초보 환영");
    });
    it("사유가 없거나 모르는 사유면 400", async () => {
        expect((await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: {} })).statusCode).toBe(400);
        expect((await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: { reason: "nope" } })).statusCode).toBe(400);
        expect(mem.state.reports).toHaveLength(0);
    });
    it("없는 방·id 모양이 아닌 값은 404", async () => {
        expect((await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: "not-a-uuid" }, body: { reason: "abuse" } })).statusCode).toBe(404);
        expect((await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: "99999999-9999-4999-8999-999999999999" }, body: { reason: "abuse" } })).statusCode).toBe(404);
    });
    it("볼 수 없었던 방(남의 비공개 방)은 404 — 내가 들어간 방이면 된다", async () => {
        mem.state.rows.set(ROOM, mem.base({ id: ROOM, hostId: HOST, isPublic: false, guestId: GUEST, status: "playing" }));
        expect((await call("post", "/sim/matches/:id/report", { userId: VIEWER, params: { id: ROOM }, body: { reason: "abuse" } })).statusCode).toBe(404);
        expect((await call("post", "/sim/matches/:id/report", { userId: GUEST, params: { id: ROOM }, body: { reason: "abuse" } })).statusCode).toBe(200);
    });
    it("내 방은 신고하지 못한다 · 비로그인은 401", async () => {
        expect((await call("post", "/sim/matches/:id/report", { userId: HOST, params: { id: ROOM }, body: { reason: "abuse" } })).statusCode).toBe(400);
        expect((await call("post", "/sim/matches/:id/report", { params: { id: ROOM }, body: { reason: "abuse" } })).statusCode).toBe(401);
        expect(mem.state.reports).toHaveLength(0);
    });
});

describe("(마) 소스 고정 — 차단·검사 경로", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
    it("방 목록 질의는 차단 관계(어느 쪽이 했든)인 방장의 방을 뺀다", () => {
        const repo = root("server/storage/simMatch.repo.ts");
        const fn = repo.slice(repo.indexOf("async listPublicWaiting("), repo.indexOf("async recentMatchRecords("));
        expect(fn).toContain("NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE (${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${hiqSimMatches.hostId}) OR (${hiqBlocks.blockerId} = ${hiqSimMatches.hostId} AND ${hiqBlocks.blockedId} = ${viewerId}))");
    });
    it("방 만들기 본체는 본문의 title 을 읽지 않는다 — 검사를 거친 글(셋째 인자)만 저장한다", () => {
        const src = root("server/routes/modules/simMatch.ts");
        const fn = src.slice(src.indexOf("export async function createHostMatch("), src.indexOf('router.post("/sim/matches",'));
        expect(fn).toContain("title: b.isPublic ? title : null,");
        expect(fn).not.toContain("b.title");
        // 재경기 방에는 방제를 옮기지 않는다(바로 시작하는 방이라 목록에 뜨지 않는다)
        const rematch = src.slice(src.indexOf('router.post("/sim/matches/:id/rematch"'));
        expect(rematch).not.toContain("title:");
    });
    it("DB 칸은 더하기만 한다", () => {
        expect(root("migrations/sim_match_title.sql")).toContain("alter table hiq_sim_matches add column if not exists title text;");
        expect(root("shared/schema.ts")).toContain('title: text("title"),');
    });
});

describe("(바) 문구 칩 — 다섯 언어", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
    for (const loc of ["ko", "en", "es", "vi", "tr"]) {
        it(`${loc}: 다섯 개 모두 20자 안이고, 그대로 방제로 쓸 수 있다(정리해도 같고 금칙어에 안 걸린다)`, () => {
            const dict = root(`client/src/lib/i18n/${loc}.ts`);
            for (const p of ROOM_TITLE_PRESETS) {
                const text = new RegExp(`"sim\\.match\\.titlePreset\\.${p}": "([^"]+)"`).exec(dict)?.[1];
                expect(text, `${loc} ${p}`).toBeTruthy();
                expect(roomTitleLength(text!), `${loc} ${p}`).toBeLessThanOrEqual(ROOM_TITLE_MAX);
                expect(checkRoomTitle(text), `${loc} ${p}`).toEqual({ ok: true, title: text });
                expect(roomTitleFor({ isPublic: true, title: text }), `${loc} ${p}`).toEqual({ ok: true, title: text });
            }
            for (const k of ["sim.match.titleLabel", "sim.match.titlePlaceholder", "sim.match.titleHint", "sim.match.titlePresets"]) {
                expect(dict, `${loc} ${k}`).toMatch(new RegExp(`"${k.replace(/\./g, "\\.")}": "[^"]+"`));
            }
            const server = root(`shared/i18n/${loc}.ts`);
            for (const k of ["err.sim.titleTooLong", "err.sim.titleFiltered"]) expect(server, `${loc} ${k}`).toMatch(new RegExp(`"${k.replace(/\./g, "\\.")}": "[^"]+"`));
        });
    }
});
