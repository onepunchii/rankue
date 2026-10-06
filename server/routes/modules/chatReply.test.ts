import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chatRouter from "./chat.js";
import { clearTranslateSlots, TRANSLATE_PER_MINUTE } from "../../lib/chatTranslate.js";
import { REPLY_DRAFT_MAX } from "../../lib/chatReply.js";

/**
 * 문의 답변 다듬기 라우트(2026-10-06 오너: "내가 한국어로 적어서 버튼이 있으면 … 해당 언어로 정식적인 내용으로 바꿔주는 형태")
 * — POST /chat/rooms/:key/reply-polish. 서버를 띄우지 않는다: 처리 함수를 가짜 요청·응답으로 부르고, 저장소는 메모리 가짜,
 * 바깥(OpenRouter)으로 나가는 fetch 도 가짜다. 실제 요청은 한 건도 나가지 않는다.
 *
 *  (가) 운영자만 · 문의 방에서만 · 남의 문의 방에서만
 *  (나) 글: 비면·500자를 넘으면 거절(자르지 않는다)
 *  (다) 밖으로 나가는 것: 운영자 글 + 회원이 쓴 최근 글(DB)뿐 — 운영자의 지난 글·카드·id 는 안 나간다
 *  (라) 언어: 회원 앱 언어가 대체 언어, 뜻풀이는 운영자 화면 언어, 이어지는 대화면 인사 없음
 *  (마) 돌려주기만 한다 — 보내지 않고 저장하지 않는다 · 상한·열쇠 없음·바깥 오류·너무 긴 답
 * 아래 id·글은 시험용으로 지어낸 것이다.
 */
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const ROOM = `support:${MEMBER}`;
const FAKE_KEY = "sk-or-v1-test-key-not-real-000000000000";

const mem = vi.hoisted(() => {
    const state = {
        admins: new Set<string>(),
        access: true,
        rows: [] as { id: string; senderId: string | null; message: string; type: string | null }[],
        locale: "es" as string | null,
        writes: [] as string[],
        listed: [] as { key: string; viewer: string; limit?: number }[],
    };
    const chat = {
        async isAdmin(id: string) { return state.admins.has(id); },
        async canAccess() { return state.access; },
        async messages(ref: { key: string }, viewer: string, opts: { limit?: number } = {}) { state.listed.push({ key: ref.key, viewer, limit: opts.limit }); return state.rows; },
        async addMessage() { state.writes.push("addMessage"); return {}; },
        async markRead() { state.writes.push("markRead"); },
    };
    return { state, storage: { chat, async getGolfBooking() { return undefined; }, async getMemberById(id: string) { return { id, locale: state.locale }; } } };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../services/notificationService.js", () => ({ notificationService: { async sendAndSaveNotification() { mem.state.writes.push("notify"); } } }));
vi.mock("../../middleware/terms.js", () => ({ requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next() }));

type FakeRes = { statusCode: number; body: any };
function polish(req: { userId?: string; key?: string; body?: unknown; locale?: string }): Promise<FakeRes> {
    const layer = (chatRouter as any).stack.find((l: any) => l.route?.path === "/rooms/:key/reply-polish" && l.route.methods.post);
    if (!layer) throw new Error("답변 다듬기 라우트가 없다");
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined };
        const res: any = {
            locals: { locale: req.locale ?? "ko" }, headersSent: false,
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
        };
        const request: any = { params: { key: req.key ?? ROOM }, query: {}, body: req.body ?? { text: "어제 고쳤어요. 다시 해보세요" }, signedCookies: req.userId ? { hiq_user_id: req.userId } : {} };
        let i = 0;
        const next = (err?: unknown) => { if (err) { fail(err); return; } const h = handlers[i++]; if (h) h(request, res, next); };
        next();
    });
}

let sent: { body: any; headers: Record<string, string> }[] = [];
let answer: () => { ok: boolean; status: number; json: () => Promise<any> };
const reply = (o: unknown) => () => ({ ok: true, status: 200, json: async () => ({ model: "google/gemini-3.1-flash-lite", choices: [{ message: { content: JSON.stringify(o) } }] }) });
const savedKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
    mem.state.admins = new Set([ADMIN, ADMIN2]);
    mem.state.access = true;
    mem.state.locale = "es";
    mem.state.writes = []; mem.state.listed = [];
    mem.state.rows = [{ id: "m1", senderId: MEMBER, message: "Hola, no puedo terminar la partida", type: "text" }];
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    clearTranslateSlots();
    sent = [];
    answer = reply({ language: "es", reply: "Hola. Se solucionó ayer. Por favor, inténtelo de nuevo.", back: "안녕하세요. 어제 해결됐습니다. 다시 시도해 주세요." });
    vi.stubGlobal("fetch", async (_url: string, init: any) => { sent.push({ body: JSON.parse(init.body), headers: init.headers }); return answer(); });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey;
});

describe("문의 답변 다듬기 라우트", () => {
    describe("(가) 누가·어디서", () => {
        it("비로그인은 401, 회원은 403 — 바깥으로 아무것도 안 나간다", async () => {
            expect((await polish({})).statusCode).toBe(401);
            const r = await polish({ userId: MEMBER });
            expect(r.statusCode).toBe(403);
            expect(r.body?.code).toBe("ADMIN_ONLY");
            expect(sent).toHaveLength(0);
        });
        it("운영자가 남의 문의 방에서 쓰면 바꾼 글·언어·뜻풀이를 받는다", async () => {
            const r = await polish({ userId: ADMIN });
            expect(r.statusCode).toBe(200);
            expect(r.body.data).toEqual({ text: "Hola. Se solucionó ayer. Por favor, inténtelo de nuevo.", language: "es", back: "안녕하세요. 어제 해결됐습니다. 다시 시도해 주세요." });
            expect(sent).toHaveLength(1);
        });
        it("문의 방이 아니면 400 — 크루·1:1 방에서는 쓰지 않는다", async () => {
            for (const key of ["crew:22222222-2222-4222-8222-222222222222", "dm:33333333-3333-4333-8333-333333333333"]) {
                const r = await polish({ userId: ADMIN, key });
                expect(r.statusCode, key).toBe(400);
                expect(r.body?.code, key).toBe("SUPPORT_ONLY");
            }
            expect(sent).toHaveLength(0);
        });
        it("내 문의 방에서는 내가 회원이다 — 400", async () => {
            const r = await polish({ userId: ADMIN, key: `support:${ADMIN}` });
            expect(r.statusCode).toBe(400);
            expect(r.body?.code).toBe("SUPPORT_ONLY");
            expect(sent).toHaveLength(0);
        });
        it("없는 방 열쇠는 404, 들어올 수 없는 방은 403", async () => {
            expect((await polish({ userId: ADMIN, key: "nope" })).statusCode).toBe(404);
            mem.state.access = false;
            expect((await polish({ userId: ADMIN })).statusCode).toBe(403);
            expect(sent).toHaveLength(0);
        });
    });

    describe("(나) 글", () => {
        it("비면 400 EMPTY, 500자를 넘으면 400 TOO_LONG — 자르지 않고 거절한다", async () => {
            for (const text of ["", "   ", undefined, 3]) {
                const r = await polish({ userId: ADMIN, body: { text } });
                expect(r.statusCode).toBe(400);
                expect(r.body?.code).toBe("EMPTY");
            }
            const long = await polish({ userId: ADMIN, body: { text: "가".repeat(REPLY_DRAFT_MAX + 1) } });
            expect(long.statusCode).toBe(400);
            expect(long.body?.code).toBe("TOO_LONG");
            expect((await polish({ userId: ADMIN, body: { text: "가".repeat(REPLY_DRAFT_MAX) } })).statusCode).toBe(200);
            expect(sent).toHaveLength(1);
        });
    });

    describe("(다) 바깥으로 나가는 것", () => {
        it("운영자 글과, 회원이 쓴 글(DB)만 — 운영자의 지난 글·카드·시스템 글은 안 나간다", async () => {
            mem.state.rows = [
                { id: "s", senderId: null, message: "시스템 안내 글", type: "system" },
                { id: "a", senderId: MEMBER, message: "Hola, no puedo terminar la partida", type: "text" },
                { id: "b", senderId: ADMIN2, message: "다른 운영자가 한 답", type: "text" },
                { id: "c", senderId: MEMBER, message: "🎱 카드 제목", type: "card" },
                { id: "d", senderId: MEMBER, message: "¿Me pueden ayudar?", type: "text" },
            ];
            await polish({ userId: ADMIN, body: { text: "확인해 보겠습니다" } });
            const user = sent[0].body.messages[1].content as string;
            expect(user).toBe("<customer>\n<m>Hola, no puedo terminar la partida</m>\n<m>¿Me pueden ayudar?</m>\n</customer>\n<reply>\n확인해 보겠습니다\n</reply>");
            const out = JSON.stringify(sent[0].body);
            for (const no of ["다른 운영자가 한 답", "카드 제목", "시스템 안내 글"]) expect(out).not.toContain(no);
        });
        it("회원·운영자·방 id 는 싣지 않는다, 열쇠는 머리에만", async () => {
            const r = await polish({ userId: ADMIN });
            const out = JSON.stringify(sent[0].body);
            for (const id of [MEMBER, ADMIN, ROOM, FAKE_KEY]) expect(out).not.toContain(id);
            expect(sent[0].headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
            expect(JSON.stringify(r.body)).not.toContain(FAKE_KEY);
        });
        it("요청 본문으로 회원 글·언어를 바꿔 넣을 수 없다 — 읽는 것은 text 하나", async () => {
            await polish({ userId: ADMIN, body: { text: "확인했습니다", customer: ["가짜 회원 글"], fallback: "ja", language: "ja", operator: "en" } });
            const out = JSON.stringify(sent[0].body);
            expect(out).not.toContain("가짜 회원 글");
            expect(sent[0].body.messages[0].content).toContain("Fallback language: Spanish.");
            expect(sent[0].body.messages[0].content).toContain("Korean translation of the rewritten message");
        });
        it("이 방의 글만 읽는다(보는 사람은 나, 최근 40건)", async () => {
            await polish({ userId: ADMIN });
            expect(mem.state.listed).toEqual([{ key: ROOM, viewer: ADMIN, limit: 40 }]);
        });
    });

    describe("(라) 언어·인사", () => {
        it("대체 언어는 회원의 앱 언어 — 없으면 한국어", async () => {
            mem.state.locale = "vi";
            await polish({ userId: ADMIN });
            expect(sent[0].body.messages[0].content).toContain("Fallback language: Vietnamese.");
            mem.state.locale = null;
            await polish({ userId: ADMIN });
            expect(sent[1].body.messages[0].content).toContain("Fallback language: Korean.");
        });
        it("뜻풀이는 운영자의 화면 언어로", async () => {
            await polish({ userId: ADMIN, locale: "en" });
            expect(sent[0].body.messages[0].content).toContain("English translation of the rewritten message");
        });
        it("운영자가 아직 답한 적 없으면 인사를 허락하고, 이미 답한 대화면 붙이지 않게 한다", async () => {
            await polish({ userId: ADMIN });
            expect(sent[0].body.messages[0].content).toContain("you may open with one short greeting");
            mem.state.rows.push({ id: "x", senderId: ADMIN2, message: "확인 중입니다", type: "text" });
            await polish({ userId: ADMIN });
            expect(sent[1].body.messages[0].content).toContain("do not add a greeting or an introduction");
        });
        it("회원이 아직 아무 말도 안 했어도 된다(운영자가 먼저 건 말)", async () => {
            mem.state.rows = [];
            const r = await polish({ userId: ADMIN, body: { text: "안녕하세요, 랭큐 운영팀입니다" } });
            expect(r.statusCode).toBe(200);
            expect(sent[0].body.messages[1].content).toBe("<customer>\n</customer>\n<reply>\n안녕하세요, 랭큐 운영팀입니다\n</reply>");
        });
    });

    describe("(마) 돌려주기만 · 상한 · 오류", () => {
        it("보내지 않고 저장하지 않는다 — 메시지 쓰기·알림이 한 번도 불리지 않는다", async () => {
            await polish({ userId: ADMIN });
            expect(mem.state.writes).toEqual([]);
        });
        it("한 사람 1분 30건을 넘기면 429(번역과 같이 센다) — 바깥으로 안 나간다", async () => {
            for (let i = 0; i < TRANSLATE_PER_MINUTE; i++) expect((await polish({ userId: ADMIN, body: { text: `답 ${i}` } })).statusCode).toBe(200);
            const before = sent.length;
            const r = await polish({ userId: ADMIN, body: { text: "하나 더" } });
            expect(r.statusCode).toBe(429);
            expect(r.body?.code).toBe("TRANSLATE_BUSY");
            expect(sent).toHaveLength(before);
        });
        it("열쇠가 없으면 503(기능이 꺼진 것)", async () => {
            delete process.env.OPENROUTER_API_KEY;
            const r = await polish({ userId: ADMIN });
            expect(r.statusCode).toBe(503);
            expect(r.body?.code).toBe("TRANSLATE_OFF");
            expect(sent).toHaveLength(0);
        });
        it("바깥이 실패하거나 못 읽는 답이면 502", async () => {
            answer = () => ({ ok: false, status: 500, json: async () => ({ error: { message: "down" } }) });
            expect((await polish({ userId: ADMIN })).body?.code).toBe("POLISH_FAILED");
            answer = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "도와드릴 수 없습니다" } }] }) });
            const r = await polish({ userId: ADMIN });
            expect(r.statusCode).toBe(502);
            expect(r.body?.code).toBe("POLISH_FAILED");
        });
        it("바꾼 글이 채팅 한 건(1000자)을 넘으면 422 — 잘린 글을 돌려주지 않는다", async () => {
            answer = reply({ language: "es", reply: "a".repeat(1001), back: "" });
            const r = await polish({ userId: ADMIN });
            expect(r.statusCode).toBe(422);
            expect(r.body?.code).toBe("RESULT_TOO_LONG");
            expect(r.body?.data).toBeUndefined();
        });
    });
});
