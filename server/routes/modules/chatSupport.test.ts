import { beforeEach, describe, expect, it, vi } from "vitest";
import chatRouter, { notifyRoom } from "./chat.js";
import { parseRoomKey } from "../../storage/chat.repo.js";
import { msg, render } from "../../lib/i18n.js";

/**
 * 운영자가 회원에게 먼저 말 걸기(2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게") — 라우트가 지키는 것.
 * 서버를 띄우지 않는다(.env 는 운영 DB 다) — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다(handoff.test.ts 와 같은 방식).
 * 저장소·알림 발송은 메모리 가짜다. 진짜 저장소가 만드는 SQL 과 보낸 사람 가리기는 storage/chat.repo.support.test.ts 가 본다.
 *
 *  (가) 회원 찾기 GET /chat/admin/members — 운영자가 아니면 403, 2글자 미만은 DB 를 안 부른다.
 *  (나) 문의 방에 쓰기 — 알림 제목 분기(문의 / 답변 / 운영팀 메시지)와, 회원에게 가는 알림에 운영자 이름이 없다는 것.
 *  (다) 탈퇴회원의 방에는 운영자가 쓸 수 없다. 회원 자신의 문의는 예전 그대로다.
 *  (라) 메시지 읽기 — 저장소에 보는 사람 언어를 넘기고, 읽은 시각은 보는 사람용으로 받는다.
 *  (마) 개인 차단 — 문의 방의 알림은 차단과 무관하게 닿는다(운영팀의 연락이 조용히 사라지지 않는다). 다른 방은 예전 그대로.
 * 아래 id·이름은 시험용으로 지어낸 글자다.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GONE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Sent = { memberId: string; title: unknown; body: unknown; category?: string; type?: string; pref?: string; params?: { url?: string } };

const mem = vi.hoisted(() => {
    const state = {
        admins: new Set<string>(),
        members: new Map<string, { id: string; name: string }>(),
        withdrawn: new Set<string>(),
        messages: [] as { id: string; roomKey: string; senderId: string | null; message: string; type: string }[],
        sent: [] as Sent[],
        searchResult: [] as unknown[],
        /** 개인 차단 — 열쇠(차단당한 사람)를 차단한 사람들. getBlockerIds(보낸 사람)가 돌려주는 것 */
        blockers: new Map<string, Set<string>>(),
        /** 1:1 방의 사람들(문의 방이 아닌 방의 대조 시험용) */
        dmMembers: [] as string[],
        /** 저장소 함수가 받은 것 전부 */
        calls: [] as { fn: string; args: unknown[] }[],
    };
    const note = (fn: string, ...args: unknown[]) => { state.calls.push({ fn, args }); };
    const chat = {
        async isAdmin(id: string) { note("isAdmin", id); return state.admins.has(id); },
        // 진짜와 같은 규칙의 줄임: 문의 방은 주인이거나 운영자(주인이 있을 때)
        async canAccess(ref: { kind: string; id: string }, id: string) {
            note("canAccess", ref, id);
            if (ref.kind !== "support") return false;
            return ref.id === id || (state.admins.has(id) && state.members.has(ref.id));
        },
        async searchMembersForAdmin(term: string, selfId: string) { note("searchMembersForAdmin", term, selfId); return state.searchResult; },
        async recentSendCount() { return 0; },
        async roomInfo() { return { title: "방", subtitle: "", members: [], canManage: false }; },
        async supportOwnerState(id: string) { note("supportOwnerState", id); return !state.members.has(id) ? "missing" : state.withdrawn.has(id) ? "withdrawn" : "ok"; },
        async addMessage(data: { key: string; senderId: string | null; message: string; type?: string }) {
            note("addMessage", data);
            const row = { id: `msg-${state.messages.length + 1}`, roomKey: data.key, senderId: data.senderId, message: data.message, type: data.type ?? "text" };
            state.messages.push(row);
            return row;
        },
        async hasMessageFrom(key: string, senderId: string) { note("hasMessageFrom", key, senderId); return state.messages.some((m) => m.roomKey === key && m.senderId === senderId); },
        async roomMembers(ref: { kind: string; id: string }) { return ref.kind === "dm" ? [...state.dmMembers] : [ref.id, ...state.admins]; },
        async mutedMemberIds() { return new Set<string>(); },
        async messages(ref: unknown, viewerId: string, opts: unknown) { note("messages", ref, viewerId, opts); return [{ id: "m1" }]; },
        async readCursors(key: string) { note("readCursors", key); return [{ id: "raw", at: "x" }]; },
        async readCursorsFor(ref: unknown, viewerId: string) { note("readCursorsFor", ref, viewerId); return [{ id: "for-viewer", at: "x" }]; },
    };
    const storage = {
        chat,
        async getMemberById(id: string) { return state.members.get(id); },
        crews: { async getBlockerIds(id: string) { note("getBlockerIds", id); return new Set<string>(state.blockers.get(id) ?? []); } },
    };
    const notificationService = { async sendAndSaveNotification(p: Sent) { state.sent.push(p); } };
    return { state, storage, notificationService };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../services/notificationService.js", () => ({ notificationService: mem.notificationService }));
vi.mock("../../middleware/terms.js", () => ({ requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next() }));

type FakeRes = { statusCode: number; body: any };
type FakeReq = { userId?: string; params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown; locale?: string };

function callRoute(method: "get" | "post", path: string, req: FakeReq): Promise<FakeRes> {
    const layer = (chatRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`시험에 없는 길: ${method.toUpperCase()} ${path}`);
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
            params: req.params ?? {}, query: req.query ?? {}, body: req.body ?? {},
            // 로그인한 요청은 서명 쿠키로 온다(requireAuth 가 여기서 회원을 읽는다)
            signedCookies: req.userId ? { hiq_user_id: req.userId } : {},
        };
        let i = 0;
        const next = (err?: unknown) => {
            if (err) { fail(err); return; }
            const handle = handlers[i++];
            if (handle) handle(request, res, next);
        };
        next();
    });
}

const search = (userId: string | undefined, q?: unknown) => callRoute("get", "/admin/members", { userId, query: q === undefined ? {} : { q } });
const say = (userId: string, ownerId: string, message: string) => callRoute("post", "/rooms/:key/messages", { userId, params: { key: `support:${ownerId}` }, body: { message } });
const callsOf = (fn: string) => mem.state.calls.filter((c) => c.fn === fn);
const sentTo = (memberId: string) => mem.state.sent.filter((s) => s.memberId === memberId);
/** 받는 사람 언어로 풀린 제목·본문(notificationService 가 하는 일) */
const shown = (s: Sent, locale: "ko" | "en" = "ko") => ({ title: render(locale, s.title as any), body: render(locale, s.body as any) });

beforeEach(() => {
    mem.state.admins = new Set([ADMIN_A, ADMIN_B]);
    mem.state.members = new Map([
        [OWNER, { id: OWNER, name: "김회원" }],
        [ADMIN_A, { id: ADMIN_A, name: "최운영" }],
        [ADMIN_B, { id: ADMIN_B, name: "박관리" }],
        [STRANGER, { id: STRANGER, name: "남의회원" }],
        [GONE, { id: GONE, name: "탈퇴회원" }],
    ]);
    mem.state.withdrawn = new Set([GONE]);
    mem.state.messages = [];
    mem.state.sent = [];
    mem.state.searchResult = [];
    mem.state.blockers = new Map();
    mem.state.dmMembers = [];
    mem.state.calls = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("(가) GET /chat/admin/members — 회원 찾기는 운영자만", () => {
    it("로그인하지 않았으면 401 — 역할을 묻기도 전에 끊는다", async () => {
        const r = await search(undefined, "김회");
        expect(r.statusCode).toBe(401);
        expect(mem.state.calls).toHaveLength(0);
    });

    it("운영자가 아니면 403 — 회원 목록을 찾지 않는다", async () => {
        const r = await search(OWNER, "김회");
        expect(r.statusCode).toBe(403);
        expect(r.body).toMatchObject({ success: false, code: "ADMIN_ONLY" });
        expect(callsOf("isAdmin")).toEqual([{ fn: "isAdmin", args: [OWNER] }]);
        expect(callsOf("searchMembersForAdmin")).toHaveLength(0);
        expect(JSON.stringify(r.body)).not.toContain("data");
    });

    it("운영자면 찾는다 — 다듬은 검색어와 내 id(나 자신을 빼려고)를 저장소에 넘긴다", async () => {
        mem.state.searchResult = [{ id: OWNER, name: "김회원", phoneLast4: "5678" }];
        const r = await search(ADMIN_A, "  김   회원 ");
        expect(r.statusCode).toBe(200);
        expect(r.body).toEqual({ success: true, data: [{ id: OWNER, name: "김회원", phoneLast4: "5678" }] });
        expect(callsOf("searchMembersForAdmin")).toEqual([{ fn: "searchMembersForAdmin", args: ["김 회원", ADMIN_A] }]);
    });

    it("2글자 미만·없는 q·배열 q 는 빈 목록 — 저장소를 부르지 않는다", async () => {
        for (const q of ["김", "", "   ", undefined, ["김철", "수"], { $ne: "" }]) {
            const r = await search(ADMIN_A, q);
            expect(r.statusCode, String(q)).toBe(200);
            expect(r.body.data, String(q)).toEqual([]);
        }
        expect(callsOf("searchMembersForAdmin")).toHaveLength(0);
    });

    it("가드는 회원 쿠키의 역할을 본다 — 파트너 쿠키(어드민 콘솔)만으로는 통과하지 않는다", async () => {
        const layer = (chatRouter as any).stack.find((l: any) => l.route?.path === "/admin/members");
        expect(layer.route.stack).toHaveLength(3); // requireAuth → requireChatAdmin → 처리
        // 회원 쿠키가 없으면(파트너 쿠키만 있는 브라우저) 401 이다 — 위 첫 시험과 같은 길
        const r = await callRoute("get", "/admin/members", { query: { q: "김회" } });
        expect(r.statusCode).toBe(401);
    });
});

describe("(나) 문의 방에 쓰기 — 알림 제목과 운영자 이름", () => {
    it("운영자가 먼저 말을 건다(회원의 글이 없다) → 회원에게 '랭큐 운영팀 메시지', 본문에 운영자 이름이 없다", async () => {
        const r = await say(ADMIN_A, OWNER, "안녕하세요, 랭큐입니다");
        expect(r.statusCode).toBe(200);
        const [toOwner] = sentTo(OWNER);
        expect(sentTo(OWNER)).toHaveLength(1);
        expect(shown(toOwner)).toEqual({ title: "💬 랭큐 운영팀 메시지", body: "안녕하세요, 랭큐입니다" });
        expect(shown(toOwner, "en").title).toBe("💬 Message from the Rankue team");
        // 회원에게 가는 알림에는 운영자 개인 이름·id 가 어디에도 없다(제목·본문·딥링크)
        const json = JSON.stringify(toOwner);
        for (const leak of ["최운영", ADMIN_A]) expect(json, leak).not.toContain(leak);
        // 방으로 가는 링크, '크루' 알림을 꺼 둔 사람에게도 가는 묶음(notice)
        expect(toOwner.params?.url).toBe(`/chat/support/${OWNER}`);
        expect(toOwner.pref).toBe("notice");
        expect(toOwner.type).toBe("CHAT");
    });

    it("같은 글이 다른 운영자에게는 예전 그대로 — '답변' 제목 + 누가 썼는지", async () => {
        await say(ADMIN_A, OWNER, "안녕하세요, 랭큐입니다");
        expect(sentTo(ADMIN_B)).toHaveLength(1);
        expect(shown(sentTo(ADMIN_B)[0])).toEqual({ title: "💬 [랭큐 운영자 답변] 새 메시지", body: "최운영: 안녕하세요, 랭큐입니다" });
        // 보낸 사람 자신에게는 안 간다
        expect(sentTo(ADMIN_A)).toHaveLength(0);
    });

    it("회원이 답하기 전까지는 운영자가 여러 번 써도 계속 '운영팀 메시지'", async () => {
        await say(ADMIN_A, OWNER, "첫 번째");
        await say(ADMIN_B, OWNER, "두 번째");
        expect(sentTo(OWNER).map((s) => shown(s).title)).toEqual(["💬 랭큐 운영팀 메시지", "💬 랭큐 운영팀 메시지"]);
    });

    it("회원이 이 방에 쓴 적이 있으면 → 회원에게 '답변'. 본문에는 여전히 운영자 이름이 없다", async () => {
        await say(OWNER, OWNER, "기록이 안 보여요");
        mem.state.sent = [];
        await say(ADMIN_B, OWNER, "확인해 볼게요");
        const [toOwner] = sentTo(OWNER);
        expect(shown(toOwner)).toEqual({ title: "💬 [랭큐 운영자 답변] 새 메시지", body: "확인해 볼게요" });
        expect(JSON.stringify(toOwner)).not.toContain("박관리");
        expect(callsOf("hasMessageFrom").pop()).toEqual({ fn: "hasMessageFrom", args: [`support:${OWNER}`, OWNER] });
    });

    it("회원이 쓰면 운영자 전원에게 '문의' — 회원 이름이 붙어 간다(예전 그대로)", async () => {
        const r = await say(OWNER, OWNER, "기록이 안 보여요");
        expect(r.statusCode).toBe(200);
        expect(sentTo(OWNER)).toHaveLength(0);
        for (const admin of [ADMIN_A, ADMIN_B]) {
            expect(sentTo(admin)).toHaveLength(1);
            expect(shown(sentTo(admin)[0])).toEqual({ title: "💬 [문의 · 김회원] 새 메시지", body: "김회원: 기록이 안 보여요" });
        }
    });

    it("회원 자신의 문의는 예전과 같은 길이다 — 회원 상태도, 쓴 적이 있는지도 묻지 않는다", async () => {
        await say(OWNER, OWNER, "기록이 안 보여요");
        expect(callsOf("supportOwnerState")).toHaveLength(0);
        expect(callsOf("hasMessageFrom")).toHaveLength(0);
    });

    it("보낸 사람에게 돌아가는 응답은 자기 이름 그대로다", async () => {
        const r = await say(ADMIN_A, OWNER, "안녕하세요");
        expect(r.body.data).toMatchObject({ roomKey: `support:${OWNER}`, senderId: ADMIN_A, message: "안녕하세요", type: "text", sender: { name: "최운영" } });
    });
});

describe("(다) 쓸 수 없는 방", () => {
    it("탈퇴회원의 문의 방에는 운영자가 쓸 수 없다 — 글도 알림도 생기지 않는다", async () => {
        const r = await say(ADMIN_A, GONE, "안녕하세요");
        expect(r.statusCode).toBe(403);
        expect(r.body).toMatchObject({ success: false, code: "MEMBER_GONE", message: "탈퇴한 회원이라 메시지를 보낼 수 없어요" });
        expect(callsOf("addMessage")).toHaveLength(0);
        expect(mem.state.sent).toHaveLength(0);
    });

    it("운영자가 아닌 사람은 남의 문의 방에 쓸 수 없다", async () => {
        const r = await say(STRANGER, OWNER, "끼어들기");
        expect(r.statusCode).toBe(403);
        expect(r.body.code).toBe("NOT_ROOM_MEMBER");
        expect(callsOf("addMessage")).toHaveLength(0);
        expect(mem.state.sent).toHaveLength(0);
    });

    it("없는 회원의 방은 운영자에게도 열리지 않는다", async () => {
        const r = await say(ADMIN_A, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "안녕하세요");
        expect(r.statusCode).toBe(403);
        expect(callsOf("addMessage")).toHaveLength(0);
    });
});

describe("(라) GET /chat/rooms/:key/messages — 보는 사람에 맞춘 답", () => {
    it("저장소에 보는 사람 언어를 넘긴다(운영팀 이름을 그 언어로 만든다)", async () => {
        await callRoute("get", "/rooms/:key/messages", { userId: OWNER, params: { key: `support:${OWNER}` }, locale: "en" });
        const [call] = callsOf("messages");
        expect(call.args[1]).toBe(OWNER);
        expect(call.args[2]).toMatchObject({ locale: "en" });
    });

    it("읽은 시각은 보는 사람용으로 받는다 — 방 전체의 커서를 그대로 내보내지 않는다", async () => {
        const r = await callRoute("get", "/rooms/:key/messages", { userId: OWNER, params: { key: `support:${OWNER}` }, query: { reads: "1" } });
        expect(r.body.data).toEqual({ messages: [{ id: "m1" }], reads: [{ id: "for-viewer", at: "x" }] });
        expect(callsOf("readCursorsFor")).toHaveLength(1);
        expect(callsOf("readCursorsFor")[0].args[1]).toBe(OWNER);
        expect(callsOf("readCursors")).toHaveLength(0);
    });
});

describe("(마) 개인 차단과 알림 — 문의 방은 차단과 무관하게 닿는다", () => {
    it("회원이 운영자의 개인 계정을 차단해 두었어도 운영팀이 먼저 건 연락은 간다", async () => {
        // 예전엔 푸시도 알림함도 없이 사라졌고, 보낸 운영자 화면에는 정상 전송으로 보였다
        mem.state.blockers.set(ADMIN_A, new Set([OWNER]));
        const r = await say(ADMIN_A, OWNER, "안녕하세요, 랭큐입니다");
        expect(r.statusCode).toBe(200);
        expect(sentTo(OWNER)).toHaveLength(1);
        expect(shown(sentTo(OWNER)[0])).toEqual({ title: "💬 랭큐 운영팀 메시지", body: "안녕하세요, 랭큐입니다" });
        // 다른 운영자에게도 그대로 간다(이어받기)
        expect(sentTo(ADMIN_B)).toHaveLength(1);
    });

    it("회원에게 가는 알림이 '누구를 차단했는지'에 따라 달라지지 않는다 — 알림으로도 누가 썼는지 가려낼 수 없다", async () => {
        await say(ADMIN_A, OWNER, "첫 번째");
        mem.state.blockers.set(ADMIN_A, new Set([OWNER]));
        await say(ADMIN_A, OWNER, "두 번째");
        await say(ADMIN_B, OWNER, "세 번째");
        expect(sentTo(OWNER).map((s) => shown(s).body)).toEqual(["첫 번째", "두 번째", "세 번째"]);
    });

    it("운영자가 회원을 개인적으로 차단해 두었어도 그 회원의 문의 알림을 받는다", async () => {
        mem.state.blockers.set(OWNER, new Set([ADMIN_A]));
        await say(OWNER, OWNER, "기록이 안 보여요");
        expect(sentTo(ADMIN_A)).toHaveLength(1);
        expect(sentTo(ADMIN_B)).toHaveLength(1);
        expect(shown(sentTo(ADMIN_A)[0]).title).toBe("💬 [문의 · 김회원] 새 메시지");
    });

    it("문의 방에서는 차단 표를 읽지도 않는다", async () => {
        await say(ADMIN_A, OWNER, "안녕하세요");
        await say(OWNER, OWNER, "네");
        expect(callsOf("getBlockerIds")).toHaveLength(0);
    });

    it("다른 방은 예전 그대로 — 1:1 에서는 보낸 사람을 차단한 사람에게 알리지 않는다", async () => {
        const dm = parseRoomKey("dm:99999999-9999-4999-8999-999999999999")!;
        mem.state.dmMembers = [ADMIN_A, OWNER, STRANGER];
        mem.state.blockers.set(ADMIN_A, new Set([OWNER]));
        await notifyRoom(dm, ADMIN_A, "개인적으로 연락드려요", msg("notif.chat.dm.title", { name: "최운영" }));
        expect(callsOf("getBlockerIds")).toEqual([{ fn: "getBlockerIds", args: [ADMIN_A] }]);
        expect(sentTo(OWNER)).toHaveLength(0);
        expect(sentTo(STRANGER)).toHaveLength(1);
        expect(shown(sentTo(STRANGER)[0])).toEqual({ title: "💬 최운영", body: "개인적으로 연락드려요" });
    });
});
