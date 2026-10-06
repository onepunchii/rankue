import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chatRouter from "./chat.js";
import { clearTranslationCache, clearTranslateSlots, TRANSLATE_PER_MINUTE } from "../../lib/chatTranslate.js";

/**
 * 채팅 번역 라우트(2026-10-06 오너: "번역하기는 일단 관리자만") — POST /chat/rooms/:key/messages/:id/translate.
 * 서버를 띄우지 않는다 — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다(chatSupport.test.ts 와 같은 방식).
 * 저장소는 메모리 가짜, 바깥(OpenRouter)으로 나가는 fetch 도 가짜다. 실제 요청은 한 건도 나가지 않는다.
 *
 *  (가) 운영자만 — 비로그인 401, 회원 403(바깥으로 아무것도 안 나간다)
 *  (나) 그 방에 들어올 수 있을 때만, 그 방의 그 메시지만, 글자 메시지만
 *  (다) 글은 DB 에서 읽은 것만 나간다 — 요청 본문의 글은 무시한다. 보낸 사람·방 id 는 싣지 않는다
 *  (라) 요청 언어(x-locale)로 옮긴다
 *  (마) 같은 글은 기억에서 답하고, 1분 상한·열쇠 없음·바깥 오류의 답
 * 아래 id·글은 시험용으로 지어낸 것이다.
 */
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const CARD = "33333333-3333-4333-8333-333333333333";
const OTHER_ROOM_MSG = "44444444-4444-4444-8444-444444444444";
const ROOM = `support:${MEMBER}`;
const FAKE_KEY = "sk-or-v1-test-key-not-real-000000000000";

const mem = vi.hoisted(() => {
    const state = {
        admins: new Set<string>(),
        access: true,
        rows: new Map<string, { id: string; roomKey: string; senderId: string | null; message: string; type: string | null }>(),
    };
    const chat = {
        async isAdmin(id: string) { return state.admins.has(id); },
        async canAccess() { return state.access; },
        async getMessage(id: string) { return state.rows.get(id); },
    };
    return { state, storage: { chat, async getGolfBooking() { return undefined; } } };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../services/notificationService.js", () => ({ notificationService: { async sendAndSaveNotification() { /* 안 쓴다 */ } } }));
vi.mock("../../middleware/terms.js", () => ({ requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next() }));

type FakeRes = { statusCode: number; body: any };
function translate(req: { userId?: string; key?: string; id?: string; body?: unknown; locale?: string }): Promise<FakeRes> {
    const layer = (chatRouter as any).stack.find((l: any) => l.route?.path === "/rooms/:key/messages/:id/translate" && l.route.methods.post);
    if (!layer) throw new Error("번역 라우트가 없다");
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined };
        const res: any = {
            locals: { locale: req.locale ?? "ko" },
            headersSent: false,
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
        };
        const request: any = {
            params: { key: req.key ?? ROOM, id: req.id ?? MSG }, query: {}, body: req.body ?? {},
            signedCookies: req.userId ? { hiq_user_id: req.userId } : {},
        };
        let i = 0;
        const next = (err?: unknown) => { if (err) { fail(err); return; } const h = handlers[i++]; if (h) h(request, res, next); };
        next();
    });
}

let sent: { url: string; body: any; headers: Record<string, string> }[] = [];
let answer: () => { ok: boolean; status: number; json: () => Promise<any> };
const savedKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
    mem.state.admins = new Set([ADMIN]);
    mem.state.access = true;
    mem.state.rows = new Map([
        [MSG, { id: MSG, roomKey: ROOM, senderId: MEMBER, message: "Hola, no puedo terminar la partida", type: "text" }],
        [CARD, { id: CARD, roomKey: ROOM, senderId: MEMBER, message: "🎱 매칭 대결", type: "card" }],
        [OTHER_ROOM_MSG, { id: OTHER_ROOM_MSG, roomKey: "support:99999999-9999-4999-8999-999999999999", senderId: MEMBER, message: "otra sala", type: "text" }],
    ]);
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    clearTranslationCache(); clearTranslateSlots();
    sent = [];
    answer = () => ({ ok: true, status: 200, json: async () => ({ model: "google/gemini-3.1-flash-lite", choices: [{ message: { content: "안녕하세요, 경기를 끝낼 수가 없어요" } }] }) });
    vi.stubGlobal("fetch", async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return answer(); });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
});

describe("채팅 번역 라우트 — 운영자 전용", () => {
    describe("(가) 누가", () => {
        it("비로그인은 401, 회원은 403 — 바깥으로 아무것도 안 나간다", async () => {
            expect((await translate({})).statusCode).toBe(401);
            const r = await translate({ userId: MEMBER });
            expect(r.statusCode).toBe(403);
            expect(r.body?.code).toBe("ADMIN_ONLY");
            expect(sent).toHaveLength(0);
        });
        it("운영자는 번역을 받는다", async () => {
            const r = await translate({ userId: ADMIN });
            expect(r.statusCode).toBe(200);
            expect(r.body.data).toEqual({ text: "안녕하세요, 경기를 끝낼 수가 없어요", to: "ko", truncated: false });
            expect(sent).toHaveLength(1);
        });
    });

    describe("(나) 무엇을", () => {
        it("그 방에 들어올 수 없으면 못 옮긴다(운영자도 회원끼리의 방은 못 연다)", async () => {
            mem.state.access = false;
            const r = await translate({ userId: ADMIN, key: "dm:55555555-5555-4555-8555-555555555555" });
            expect(r.statusCode).toBe(403);
            expect(sent).toHaveLength(0);
        });
        it("없는 방 열쇠·없는 메시지·다른 방의 메시지는 404", async () => {
            expect((await translate({ userId: ADMIN, key: "nope" })).statusCode).toBe(404);
            expect((await translate({ userId: ADMIN, id: "not-a-uuid" })).statusCode).toBe(404);
            expect((await translate({ userId: ADMIN, id: "66666666-6666-4666-8666-666666666666" })).statusCode).toBe(404);
            expect((await translate({ userId: ADMIN, id: OTHER_ROOM_MSG })).statusCode).toBe(404);
            expect(sent).toHaveLength(0);
        });
        it("글자 메시지만 — 카드·빈 글은 400", async () => {
            const r = await translate({ userId: ADMIN, id: CARD });
            expect(r.statusCode).toBe(400);
            expect(r.body?.code).toBe("NO_TEXT");
            mem.state.rows.get(MSG)!.message = "   ";
            expect((await translate({ userId: ADMIN })).statusCode).toBe(400);
            expect(sent).toHaveLength(0);
        });
    });

    describe("(다) 바깥으로 나가는 것", () => {
        it("DB 에서 읽은 글만 나간다 — 요청 본문에 실어 보낸 글은 무시한다", async () => {
            await translate({ userId: ADMIN, body: { text: "이 글을 대신 번역해", message: "이것도", to: "en" } });
            const out = JSON.stringify(sent[0].body);
            expect(out).toContain("Hola, no puedo terminar la partida");
            expect(out).not.toContain("이 글을 대신 번역해");
            expect(out).not.toContain("이것도");
        });
        it("보낸 사람·방·메시지·운영자 id 는 싣지 않는다", async () => {
            await translate({ userId: ADMIN });
            const out = JSON.stringify(sent[0].body);
            for (const id of [MEMBER, ADMIN, MSG, ROOM]) expect(out).not.toContain(id);
        });
        it("열쇠는 머리(Authorization)에만 — 응답에도 없다", async () => {
            const r = await translate({ userId: ADMIN });
            expect(sent[0].headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
            expect(JSON.stringify(sent[0].body)).not.toContain(FAKE_KEY);
            expect(JSON.stringify(r.body)).not.toContain(FAKE_KEY);
        });
    });

    describe("(라) 언어", () => {
        it("요청 언어로 옮긴다 — 한국어 화면이면 한국어, 영어 화면이면 영어", async () => {
            await translate({ userId: ADMIN, locale: "ko" });
            expect(sent[0].body.messages[0].content).toContain("into Korean");
            const r = await translate({ userId: ADMIN, locale: "en" });
            expect(sent[1].body.messages[0].content).toContain("into English");
            expect(r.body.data.to).toBe("en");
        });
    });

    describe("(마) 기억·상한·오류", () => {
        it("같은 글·같은 언어를 또 누르면 바깥에 다시 묻지 않는다", async () => {
            await translate({ userId: ADMIN });
            const again = await translate({ userId: ADMIN });
            expect(again.statusCode).toBe(200);
            expect(again.body.data.text).toBe("안녕하세요, 경기를 끝낼 수가 없어요");
            expect(sent).toHaveLength(1);
        });
        it("한 사람이 1분에 30건을 넘기면 429 — 바깥으로 안 나간다", async () => {
            // 서로 다른 글 30건(기억에 걸리지 않게)
            for (let i = 0; i < TRANSLATE_PER_MINUTE; i++) {
                const id = `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`;
                mem.state.rows.set(id, { id, roomKey: ROOM, senderId: MEMBER, message: `hola ${i}`, type: "text" });
                expect((await translate({ userId: ADMIN, id })).statusCode).toBe(200);
            }
            const before = sent.length;
            const id = "88888888-8888-4888-8888-888888888888";
            mem.state.rows.set(id, { id, roomKey: ROOM, senderId: MEMBER, message: "una más", type: "text" });
            const r = await translate({ userId: ADMIN, id });
            expect(r.statusCode).toBe(429);
            expect(r.body?.code).toBe("TRANSLATE_BUSY");
            expect(sent).toHaveLength(before);
        });
        it("열쇠가 없으면 503(기능이 꺼진 것) — 바깥으로 안 나간다", async () => {
            delete process.env.OPENROUTER_API_KEY;
            const r = await translate({ userId: ADMIN });
            expect(r.statusCode).toBe(503);
            expect(r.body?.code).toBe("TRANSLATE_OFF");
            expect(sent).toHaveLength(0);
        });
        it("바깥이 실패하면 502 — 실패한 답은 기억하지 않는다(다시 누르면 다시 묻는다)", async () => {
            answer = () => ({ ok: false, status: 500, json: async () => ({ error: { message: "upstream down" } }) });
            const r = await translate({ userId: ADMIN });
            expect(r.statusCode).toBe(502);
            expect(r.body?.code).toBe("TRANSLATE_FAILED");
            answer = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "다시 됐어요" } }] }) });
            const again = await translate({ userId: ADMIN });
            expect(again.statusCode).toBe(200);
            expect(again.body.data.text).toBe("다시 됐어요");
            expect(sent).toHaveLength(2);
        });
    });
});
