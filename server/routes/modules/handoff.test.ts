import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import handoffRouter, { hashHandoffToken } from "./handoff.js";
import { deepLinkToPath } from "../../../shared/deepLink.js";
import { HANDOFF_ISSUE_MAX, HANDOFF_ISSUE_WINDOW_SEC, HANDOFF_TTL_SEC, handoffAppUrl, handoffIntentUrl, isHandoffToken, takeHandoffFromUrl } from "../../../shared/loginHandoff.js";

/**
 * '앱에서 열기' 라우트(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고 그대로 이어 쓰게").
 * 서버를 띄우지 않는다(.env 는 운영 DB 다) — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다(lib/kakaoAuth.test.ts 와 같은 방식).
 * 저장소는 메모리 가짜다. 가짜의 시계(state.now)는 시험이 직접 돌린다 — 진짜는 DB 의 now() 다.
 * 진짜 저장소가 만드는 SQL(한 문장으로 한 번만 쓰이게)은 storage/loginHandoff.repo.test.ts 가 본다.
 * 시도 횟수 제한은 모듈 메모리에 남으므로 시험마다 다른 IP 를 쓴다.
 */
type Row = { tokenHash: string; memberId: string; createdAt: number; expiresAt: number; usedAt: number | null };

const mem = vi.hoisted(() => {
    const state = {
        /** 가짜 DB 시계(ms) */
        now: 1_800_000_000_000,
        rows: [] as Row[],
        members: [] as { id: string; phone: string; name: string }[],
        suspended: new Set<string>(),
        /** 저장소 함수가 받은 것 전부 — 토큰 원문이 넘어오지 않았는지 볼 때 쓴다 */
        calls: [] as { fn: string; args: unknown[] }[],
        /** 풀어 줄 때까지 '바꾸기'가 DB 에서 기다린다(두 요청을 겹치게 할 때) */
        redeemGate: null as Promise<void> | null,
        sweepFails: false,
    };
    const DAY_MS = 24 * 60 * 60 * 1000;
    const repo = {
        async sweepLoginHandoffs(memberId: string, keepSec: number) {
            state.calls.push({ fn: "sweep", args: [memberId, keepSec] });
            if (state.sweepFails) throw new Error("connection terminated");
            state.rows = state.rows.filter((r) => !((r.memberId === memberId && r.createdAt < state.now - keepSec * 1000) || r.expiresAt < state.now - DAY_MS));
        },
        async recentLoginHandoffs(memberId: string, windowSec: number) {
            state.calls.push({ fn: "recent", args: [memberId, windowSec] });
            const mine = state.rows.filter((r) => r.memberId === memberId && r.createdAt > state.now - windowSec * 1000);
            const oldest = mine.length ? Math.min(...mine.map((r) => r.createdAt)) : state.now;
            return { count: mine.length, oldestAgeSec: Math.floor((state.now - oldest) / 1000) };
        },
        async insertLoginHandoff(memberId: string, tokenHash: string, ttlSec: number) {
            state.calls.push({ fn: "insert", args: [memberId, tokenHash, ttlSec] });
            // 진짜와 같은 규칙: token_hash 유니크
            if (state.rows.some((r) => r.tokenHash === tokenHash)) throw Object.assign(new Error("duplicate key"), { code: "23505" });
            state.rows.push({ tokenHash, memberId, createdAt: state.now, expiresAt: state.now + ttlSec * 1000, usedAt: null });
        },
        // 진짜는 UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING 한 문장이다 —
        // 가짜도 찾기와 '썼음' 표시 사이에 await 를 두지 않는다(기다림은 DB 에 닿기 전의 지연일 뿐이다).
        async redeemLoginHandoff(tokenHash: string) {
            state.calls.push({ fn: "redeem", args: [tokenHash] });
            await state.redeemGate;
            const row = state.rows.find((r) => r.tokenHash === tokenHash && r.usedAt === null && r.expiresAt > state.now);
            if (!row) return null;
            row.usedAt = state.now;
            return row.memberId;
        },
    };
    const storage = {
        async getMemberById(id: string) {
            state.calls.push({ fn: "getMemberById", args: [id] });
            return state.members.find((m) => m.id === id);
        },
    };
    return { state, repo, storage };
});
vi.mock("../../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("../../storage/loginHandoff.repo.js", () => mem.repo);
vi.mock("../../lib/handle.js", () => ({ generateHandle: async () => "player_0001" }));
// 정지 계정 확인은 DB 를 직접 읽는다 — 가짜 목록으로 바꾼다
vi.mock("../../middleware/terms.js", () => ({
    isMemberSuspended: async (id: string) => mem.state.suspended.has(id),
    recordTermsAcceptance: async () => undefined,
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    SUSPENDED_TEXT: "정지된 계정",
}));

type FakeRes = { statusCode: number; body: any; headers: Record<string, string>; cookies: Record<string, { value: unknown; options: any }>; cleared: string[] };
type FakeReq = { body?: unknown; ip?: string; userId?: string; json?: boolean };

function callRoute(path: "/" | "/redeem", req: FakeReq): Promise<FakeRes> {
    const layer = (handoffRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    if (!layer) throw new Error(`시험에 없는 길: POST ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined, headers: {}, cookies: {}, cleared: [] };
        const res: any = {
            locals: { locale: "ko" },
            headersSent: false,
            set(name: string, value: string) { out.headers[name.toLowerCase()] = value; return res; },
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
            cookie(name: string, value: unknown, options: unknown) { out.cookies[name] = { value, options }; return res; },
            clearCookie(name: string) { out.cleared.push(name); return res; },
        };
        const request: any = {
            body: req.body ?? {},
            ip: req.ip,
            headers: req.ip ? { "x-forwarded-for": `${req.ip}, 10.0.0.1` } : {},
            // 로그인한 요청은 서명 쿠키로 온다(requireAuth 가 여기서 회원을 읽는다)
            signedCookies: req.userId ? { hiq_user_id: req.userId } : {},
            is: (type: string) => (req.json === false ? false : type === "application/json"),
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

const issue = (userId?: string, extra: Partial<FakeReq> = {}) => callRoute("/", { userId, body: {}, ...extra });
const redeem = (token: unknown, ip: string, extra: Partial<FakeReq> = {}) => callRoute("/redeem", { body: { token }, ip, ...extra });
/** 발급 응답 → 토큰. 앱이 실제로 타는 길 그대로 꺼낸다: 앱 주소 → deepLinkToPath → 받는 쪽의 takeHandoffFromUrl */
const tokenOf = (r: FakeRes): string => {
    const taken = takeHandoffFromUrl(deepLinkToPath(r.body.data.appUrl)!);
    if (!taken.token) throw new Error("응답에서 토큰을 꺼내지 못했다");
    return taken.token;
};
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const callsOf = (fn: string) => mem.state.calls.filter((c) => c.fn === fn);
const tick = (sec: number) => { mem.state.now += sec * 1000; };

let logs: ReturnType<typeof vi.spyOn>[] = [];
/** 서버 로그 전체를 한 줄로 — 토큰이 새지 않았는지 볼 때 쓴다 */
const logged = () => logs.flatMap((s) => s.mock.calls).map((c: unknown[]) => c.map((x) => (typeof x === "string" ? x : JSON.stringify(x) ?? String(x))).join(" ")).join("\n");

beforeEach(() => {
    mem.state.now = 1_800_000_000_000;
    mem.state.rows = [];
    mem.state.members = [
        { id: "m-web", phone: "01000000001", name: "웹에서 온 회원" },
        { id: "m-other", phone: "social:kakao:abcdef", name: "다른 회원" },
        { id: "m-gone", phone: "del-0b0e6f0e-8a3", name: "탈퇴회원" },
    ];
    mem.state.suspended = new Set();
    mem.state.calls = [];
    mem.state.redeemGate = null;
    mem.state.sweepFails = false;
    logs = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    // 쿠키의 secure 는 운영(NODE_ENV=production 또는 VERCEL)에서만 켜진다 — 시험은 개발 서버로 둔다
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "");
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("POST /handoff — 발급", () => {
    it("로그인 없이는 받을 수 없다(401) — 저장소를 건드리지 않는다", async () => {
        const r = await issue(undefined);
        expect(r.statusCode).toBe(401);
        expect(r.body).toMatchObject({ success: false, message: "로그인이 필요합니다" });
        expect(JSON.stringify(r.body)).not.toMatch(/appUrl|intentUrl|rankue:\/\//);
        expect(mem.state.calls).toEqual([]);
        expect(mem.state.rows).toEqual([]);
        // 그래도 캐시하지 않는다
        expect(r.headers["cache-control"]).toBe("no-store");
    });

    it("로그인한 회원은 앱 주소 둘과 남은 시간(120초)을 받는다 — 캐시하지 않고, 쿠키는 건드리지 않는다", async () => {
        const r = await issue("m-web");
        expect(r.statusCode).toBe(200);
        expect(r.headers["cache-control"]).toBe("no-store");
        expect(Object.keys(r.body.data).sort()).toEqual(["appUrl", "expiresInSec", "intentUrl"]);
        expect(r.body.data.expiresInSec).toBe(HANDOFF_TTL_SEC);
        const token = tokenOf(r);
        expect(isHandoffToken(token)).toBe(true);
        expect(r.body.data.appUrl).toBe(handoffAppUrl(token));
        expect(r.body.data.intentUrl).toBe(handoffIntentUrl(token));
        expect(r.cookies).toEqual({});
        expect(r.cleared).toEqual([]);
        // 120초 뒤에 끝나는 행 하나
        expect(mem.state.rows).toHaveLength(1);
        expect(mem.state.rows[0]).toMatchObject({ memberId: "m-web", usedAt: null, expiresAt: mem.state.now + 120_000 });
    });

    it("토큰 원문은 저장소에 들어가지 않는다 — 가는 것은 sha256 뿐이고, 로그에도 남지 않는다", async () => {
        const r = await issue("m-web");
        const token = tokenOf(r);
        expect(mem.state.rows[0].tokenHash).toBe(sha256(token));
        expect(mem.state.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(hashHandoffToken(token)).toBe(sha256(token));
        // 저장소 함수가 받은 인자 어디에도 원문이 없다
        expect(JSON.stringify(mem.state.calls)).not.toContain(token);
        expect(JSON.stringify(mem.state.rows)).not.toContain(token);
        expect(callsOf("insert")).toEqual([{ fn: "insert", args: ["m-web", sha256(token), HANDOFF_TTL_SEC] }]);
        // 바꿀 때도 마찬가지다
        const ok = await redeem(token, "192.0.2.1");
        expect(ok.statusCode).toBe(200);
        expect(JSON.stringify(mem.state.calls)).not.toContain(token);
        expect(callsOf("redeem")).toEqual([{ fn: "redeem", args: [sha256(token)] }]);
        // 로그: 발급·바꾸기 어느 쪽도 토큰(과 그 해시)을 찍지 않는다
        expect(logged()).not.toContain(token);
        expect(logged()).not.toContain(sha256(token));
        // 토큰이 실린 곳은 발급 응답뿐이다 — 바꾸기 응답에는 없다
        expect(JSON.stringify(ok.body)).not.toContain(token);
    });

    it("부를 때마다 다른 토큰이다", async () => {
        const a = tokenOf(await issue("m-web"));
        const b = tokenOf(await issue("m-web"));
        const c = tokenOf(await issue("m-other"));
        expect(new Set([a, b, c]).size).toBe(3);
    });

    it("JSON 본문이 아니면 400 — 숨긴 폼으로는 만들 수 없다", async () => {
        const r = await issue("m-web", { json: false });
        expect(r.statusCode).toBe(400);
        expect(r.body.code).toBe("HANDOFF_BAD_REQUEST");
        expect(mem.state.rows).toEqual([]);
        expect(mem.state.calls).toEqual([]);
    });

    it("탈퇴했거나 없는 회원의 쿠키로는 만들지 않는다(401)", async () => {
        for (const id of ["m-gone", "m-nobody"]) {
            const r = await issue(id);
            expect(r.statusCode, id).toBe(401);
            expect(JSON.stringify(r.body), id).not.toMatch(/appUrl|rankue:\/\//);
        }
        expect(mem.state.rows).toEqual([]);
        expect(callsOf("insert")).toEqual([]);
    });

    it("회원당 10분에 5번까지 — 여섯 번째는 429, 다른 회원은 영향이 없고, 창이 지나면 다시 된다", async () => {
        for (let n = 0; n < HANDOFF_ISSUE_MAX; n++) {
            expect((await issue("m-web")).statusCode, String(n)).toBe(200);
            tick(10);
        }
        const blocked = await issue("m-web");
        expect(blocked.statusCode).toBe(429);
        expect(blocked.body.code).toBe("HANDOFF_TOO_MANY");
        // 가장 오래된 것이 50초 전 → 550초 뒤에 자리가 난다
        expect(blocked.body.message).toBe("요청이 너무 많습니다. 550초 후 다시 시도해주세요.");
        expect(JSON.stringify(blocked.body)).not.toMatch(/appUrl|rankue:\/\//);
        expect(mem.state.rows).toHaveLength(HANDOFF_ISSUE_MAX);
        // 다른 회원은 그대로 받는다
        expect((await issue("m-other")).statusCode).toBe(200);
        // 첫 번째가 창 밖으로 나가면 하나가 다시 된다
        tick(HANDOFF_ISSUE_WINDOW_SEC - 50 + 1);
        expect((await issue("m-web")).statusCode).toBe(200);
        expect((await issue("m-web")).statusCode).toBe(429);
    });

    it("쌓이지 않게 치운다 — 발급 때마다 그 회원의 10분 넘은 행과 만료된 지 하루 넘은 행을 지운다", async () => {
        const old = (memberId: string, agoSec: number): Row => ({ tokenHash: `h-${memberId}-${agoSec}`, memberId, createdAt: mem.state.now - agoSec * 1000, expiresAt: mem.state.now - agoSec * 1000 + 120_000, usedAt: null });
        mem.state.rows = [
            old("m-web", 601),          // 내 것, 10분 넘음 → 지운다
            old("m-web", 300),          // 내 것, 창 안(만료됐지만 횟수를 세야 한다) → 남긴다
            old("m-other", 3600),       // 남의 것, 만료된 지 하루가 안 됨 → 남긴다
            old("m-other", 90_000),     // 남의 것, 만료된 지 하루 넘음 → 지운다
        ];
        const r = await issue("m-web");
        expect(r.statusCode).toBe(200);
        expect(callsOf("sweep")).toEqual([{ fn: "sweep", args: ["m-web", HANDOFF_ISSUE_WINDOW_SEC] }]);
        expect(mem.state.rows.map((x) => x.tokenHash).filter((h) => h.startsWith("h-")).sort()).toEqual(["h-m-other-3600", "h-m-web-300"]);
        // 치운 뒤에 센다(창 안의 것 1 + 새것 1)
        expect(mem.state.calls.map((c) => c.fn)).toEqual(["getMemberById", "sweep", "recent", "insert"]);
    });

    it("청소가 실패해도 발급은 된다 — 실패를 적는 로그에도 토큰은 없다", async () => {
        mem.state.sweepFails = true;
        const r = await issue("m-web");
        expect(r.statusCode).toBe(200);
        expect(logged()).toContain("[Handoff] sweep failed: connection terminated");
        expect(logged()).not.toContain(tokenOf(r));
    });
});

describe("POST /handoff/redeem — 토큰을 쿠키와 바꾼다", () => {
    it("로그인 없이 부른다 — 맞는 토큰이면 그 회원의 쿠키가 나가고, 응답은 /social 과 같은 모양이다", async () => {
        const token = tokenOf(await issue("m-web"));
        const r = await redeem(token, "192.0.2.10");
        expect(r.statusCode).toBe(200);
        expect(r.headers["cache-control"]).toBe("no-store");
        expect(r.body).toEqual({ success: true, data: { member: { id: "m-web", phone: "01000000001", name: "웹에서 온 회원" }, isNew: false, redirectTo: "/dashboard" } });
        expect(r.cookies.hiq_user_id.value).toBe("m-web");
        expect(r.cookies.hiq_user_id.options).toEqual({
            maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, signed: true, sameSite: "lax", secure: false, path: "/",
        });
        expect(r.cleared).toEqual([]);
        expect(mem.state.rows[0].usedAt).toBe(mem.state.now);
    });

    it("운영 서버에서는 secure 쿠키다", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const r = await redeem(tokenOf(await issue("m-web")), "192.0.2.11");
        expect(r.cookies.hiq_user_id.options.secure).toBe(true);
    });

    it("한 번 쓰면 두 번째는 401 — 쿠키를 주지 않는다", async () => {
        const token = tokenOf(await issue("m-web"));
        expect((await redeem(token, "192.0.2.12")).statusCode).toBe(200);
        const again = await redeem(token, "192.0.2.12");
        expect(again.statusCode).toBe(401);
        expect(again.body).toEqual({ success: false, message: "앱으로 넘어오는 링크가 만료됐거나 이미 사용됐어요. 로그인해 주세요.", code: "HANDOFF_INVALID" });
        expect(again.cookies).toEqual({});
        expect(again.headers["cache-control"]).toBe("no-store");
    });

    it("만료되면 401 — 119초까지는 되고 120초부터는 안 된다", async () => {
        const early = tokenOf(await issue("m-web"));
        tick(HANDOFF_TTL_SEC - 1);
        expect((await redeem(early, "192.0.2.13")).statusCode).toBe(200);

        const late = tokenOf(await issue("m-web"));
        tick(HANDOFF_TTL_SEC);
        const r = await redeem(late, "192.0.2.13");
        expect(r.statusCode).toBe(401);
        expect(r.cookies).toEqual({});
        // 만료된 것은 '썼음'으로 바뀌지도 않는다
        expect(mem.state.rows.find((x) => x.tokenHash === sha256(late))?.usedAt).toBeNull();
    });

    it("없는 토큰·만료·이미 쓴 토큰·꼴이 틀린 값 — 답이 글자까지 같다(무엇이 틀렸는지 알려 주지 않는다)", async () => {
        const used = tokenOf(await issue("m-web"));
        await redeem(used, "192.0.2.14");
        const expired = tokenOf(await issue("m-web"));
        tick(HANDOFF_TTL_SEC + 5);
        const unknown = "A".repeat(43);
        const answers = [];
        for (const t of [used, expired, unknown, "short", "", undefined, null, 42, [used], { token: used }, `${used}\n`]) {
            const r = await redeem(t, "192.0.2.14");
            answers.push(JSON.stringify({ s: r.statusCode, b: r.body, c: r.cookies, h: r.headers }));
        }
        expect(new Set(answers).size).toBe(1);
        expect(JSON.parse(answers[0])).toMatchObject({ s: 401, b: { success: false, code: "HANDOFF_INVALID" }, c: {} });
    });

    it("꼴이 틀린 값은 저장소를 보지 않고 끊는다", async () => {
        mem.state.calls = [];
        for (const t of ["short", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}+`, undefined, { $ne: "" }]) {
            expect((await redeem(t, "192.0.2.15")).statusCode).toBe(401);
        }
        expect(mem.state.calls).toEqual([]);
    });

    it("폼 본문은 400 으로 거절한다(로그인 CSRF) — 맞는 토큰이어도 쓰이지 않고 남는다", async () => {
        const token = tokenOf(await issue("m-web"));
        mem.state.calls = [];
        const form = await redeem(token, "192.0.2.16", { json: false });
        expect(form.statusCode).toBe(400);
        expect(form.body.code).toBe("HANDOFF_BAD_REQUEST");
        expect(form.cookies).toEqual({});
        expect(mem.state.calls).toEqual([]);
        expect(mem.state.rows[0].usedAt).toBeNull();
        // 진짜 화면(JSON)이 뒤이어 부르면 된다
        expect((await redeem(token, "192.0.2.16")).statusCode).toBe(200);
    });

    it("정지된 계정은 들여보내지 않는다 — 쿠키 없이 403, 토큰은 소모된다", async () => {
        const token = tokenOf(await issue("m-web"));
        mem.state.suspended.add("m-web");
        const r = await redeem(token, "192.0.2.17");
        expect(r.statusCode).toBe(403);
        expect(r.body).toEqual({ success: false, message: "정지된 계정", code: "ACCOUNT_SUSPENDED" });
        expect(r.cookies).toEqual({});
        expect(r.cleared).toEqual(["hiq_user_id"]);
        expect(JSON.stringify(r.body)).not.toContain("m-web");
        // 정지가 풀려도 같은 토큰은 다시 못 쓴다
        mem.state.suspended.clear();
        expect((await redeem(token, "192.0.2.17")).statusCode).toBe(401);
    });

    it("토큰을 받은 뒤 탈퇴했거나 지워진 회원이면 401 — 다른 실패와 같은 답", async () => {
        const token = tokenOf(await issue("m-web"));
        mem.state.members.find((m) => m.id === "m-web")!.phone = "del-0b0e6f0e-8a3";
        const gone = await redeem(token, "192.0.2.18");
        expect(gone.statusCode).toBe(401);
        expect(gone.body.code).toBe("HANDOFF_INVALID");
        expect(gone.cookies).toEqual({});

        const other = tokenOf(await issue("m-other"));
        mem.state.members = mem.state.members.filter((m) => m.id !== "m-other");
        const missing = await redeem(other, "192.0.2.18");
        expect(missing.statusCode).toBe(401);
        expect(missing.body).toEqual(gone.body);
    });

    it("동시에 온 두 요청 중 하나만 성공한다", async () => {
        const token = tokenOf(await issue("m-web"));
        let open!: () => void;
        mem.state.redeemGate = new Promise<void>((r) => { open = r; });
        const a = redeem(token, "192.0.2.19");
        const b = redeem(token, "192.0.2.20");
        // 둘 다 DB 앞에서 기다리는 중이다(둘 다 꼴 검사·횟수 제한은 통과했다)
        await Promise.resolve();
        expect(callsOf("redeem")).toHaveLength(2);
        open();
        const done = await Promise.all([a, b]);
        expect(done.map((r) => r.statusCode).sort()).toEqual([200, 401]);
        expect(done.filter((r) => r.cookies.hiq_user_id)).toHaveLength(1);
        expect(done.find((r) => r.statusCode === 401)!.cookies).toEqual({});
        // 열 번을 한꺼번에 보내도 마찬가지다
        const token2 = tokenOf(await issue("m-web"));
        mem.state.redeemGate = null;
        const burst = await Promise.all(Array.from({ length: 10 }, (_, n) => redeem(token2, `192.0.2.${30 + n}`)));
        expect(burst.filter((r) => r.statusCode === 200)).toHaveLength(1);
        expect(burst.filter((r) => r.statusCode === 401)).toHaveLength(9);
    });

    it("웹에서 받아 앱에서 바꾸는 한 바퀴 — 다른 회원의 토큰과 섞이지 않는다", async () => {
        const mine = tokenOf(await issue("m-web"));
        const theirs = tokenOf(await issue("m-other"));
        const b = await redeem(theirs, "192.0.2.50");
        const a = await redeem(mine, "192.0.2.50");
        expect(a.cookies.hiq_user_id.value).toBe("m-web");
        expect(b.cookies.hiq_user_id.value).toBe("m-other");
        expect(b.body.data.member.id).toBe("m-other");
    });

    it("실패는 IP 로 센다 — 스무 번 틀리면 429, 그동안은 맞는 토큰도 쓰이지 않고, 다른 IP 는 영향이 없다", async () => {
        const ip = "192.0.2.60";
        for (let n = 0; n < 20; n++) {
            expect((await redeem("B".repeat(43), ip)).statusCode, String(n)).toBe(401);
        }
        const token = tokenOf(await issue("m-web"));
        mem.state.calls = [];
        const blocked = await redeem(token, ip);
        expect(blocked.statusCode).toBe(429);
        expect(blocked.body.message).toMatch(/^시도가 너무 많습니다\. \d+초 후 다시 시도해주세요\.$/);
        expect(blocked.cookies).toEqual({});
        // 막힌 요청은 저장소에 닿지 않는다 — 토큰이 그대로 남아 다른 주소에서는 쓸 수 있다
        expect(mem.state.calls).toEqual([]);
        expect((await redeem(token, "192.0.2.61")).statusCode).toBe(200);
    });

    // 2026-10-06 검토: "앱에서 쓰던 계정을 말없이 바꾸지 않는다"가 화면에만 있었다. 화면의 로그인 확인이 오류(순간 끊김 · 5xx)로 끝나면
    // 비로그인으로 보여 그대로 바꾸러 왔고, 서버는 요청에 실린 쿠키를 보지 않고 토큰의 계정으로 덮어썼다.
    it("이미 로그인된 요청은 바꿔 주지 않는다(409) — 쿠키를 주지 않고, 토큰은 쓰이지 않은 채 남고, 실패로 세지도 않는다", async () => {
        const token = tokenOf(await issue("m-web"));
        mem.state.calls = [];
        const ip = "192.0.2.80";
        // 다른 계정으로 로그인돼 있다
        const other = await redeem(token, ip, { userId: "m-other" });
        expect(other.statusCode).toBe(409);
        expect(other.body).toEqual({ success: false, message: "이미 로그인돼 있어요. 다른 계정으로 바꾸려면 먼저 로그아웃해 주세요.", code: "HANDOFF_SIGNED_IN" });
        expect(other.cookies).toEqual({});
        expect(other.cleared).toEqual([]);
        expect(other.headers["cache-control"]).toBe("no-store");
        // 토큰을 읽지도 쓰지도 않았다 — 저장소에 닿은 것은 쿠키의 회원을 확인한 것뿐이다
        expect(callsOf("redeem")).toEqual([]);
        expect(mem.state.calls).toEqual([{ fn: "getMemberById", args: ["m-other"] }]);
        expect(mem.state.rows[0].usedAt).toBeNull();
        // 토큰의 주인과 같은 계정이어도 같은 답이다(견주지 않는다 — 견주려면 토큰을 먼저 읽어야 한다)
        const same = await redeem(token, ip, { userId: "m-web" });
        expect(same.statusCode).toBe(409);
        expect(same.body).toEqual(other.body);
        expect(mem.state.rows[0].usedAt).toBeNull();
        // 없는 토큰이어도 답이 같다 — 로그인된 요청으로는 토큰이 살아 있는지 알아낼 수 없다
        const unknown = await redeem("D".repeat(43), ip, { userId: "m-other" });
        expect({ s: unknown.statusCode, b: unknown.body }).toEqual({ s: 409, b: other.body });
        expect(callsOf("redeem")).toEqual([]);
        // 실패로 세지 않는다: 스무 번을 넘겨도 이 IP 가 막히지 않는다
        for (let n = 0; n < 25; n++) expect((await redeem(token, ip, { userId: "m-other" })).statusCode, String(n)).toBe(409);
        // 로그아웃한 뒤(쿠키 없음) 같은 토큰은 그대로 쓸 수 있다
        const ok = await redeem(token, ip);
        expect(ok.statusCode).toBe(200);
        expect(ok.cookies.hiq_user_id.value).toBe("m-web");
    });

    it("쿠키의 회원이 없거나 탈퇴 · 정지면 죽은 쿠키다 — 막지 않고 토큰의 계정으로 바꿔 준다", async () => {
        // 탈퇴한 회원의 쿠키 · 지워진 회원의 쿠키
        for (const [n, dead] of ["m-gone", "m-nobody"].entries()) {
            const r = await redeem(tokenOf(await issue("m-web")), `192.0.2.${90 + n}`, { userId: dead });
            expect(r.statusCode, dead).toBe(200);
            expect(r.cookies.hiq_user_id.value, dead).toBe("m-web");
        }
        // 정지된 회원의 쿠키
        mem.state.suspended.add("m-other");
        const r = await redeem(tokenOf(await issue("m-web")), "192.0.2.92", { userId: "m-other" });
        expect(r.statusCode).toBe(200);
        expect(r.cookies.hiq_user_id.value).toBe("m-web");
    });

    it("꼴이 틀린 값은 로그인돼 있어도 401 이다 — 쿠키의 회원을 보기 전에 끊는다", async () => {
        mem.state.calls = [];
        const r = await redeem("short", "192.0.2.93", { userId: "m-other" });
        expect(r.statusCode).toBe(401);
        expect(r.body.code).toBe("HANDOFF_INVALID");
        expect(mem.state.calls).toEqual([]);
    });

    it("성공해도 실패 횟수를 지우지 않는다 — 맞는 토큰 하나로 세던 것을 되돌리지 못한다", async () => {
        const ip = "192.0.2.70";
        for (let n = 0; n < 19; n++) await redeem("C".repeat(43), ip);
        expect((await redeem(tokenOf(await issue("m-web")), ip)).statusCode).toBe(200);
        expect((await redeem("C".repeat(43), ip)).statusCode).toBe(401); // 스무 번째 실패
        expect((await redeem(tokenOf(await issue("m-web")), ip)).statusCode).toBe(429);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 소스 규칙 — 동작 시험이 보지 못하는 것(등록 자리 · 기존 로그인과 같은 쿠키 · 옮겨 적은 함수 두 벌 · 사전)
// ─────────────────────────────────────────────────────────────────────────────
const root = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
/** 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게) */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("라우트 규칙(server/routes/modules/handoff.ts)", () => {
    const src = root("server/routes/modules/handoff.ts");
    const auth = root("server/routes/modules/auth.ts");
    const issueAt = src.indexOf('router.post("/", noStore, requireAuth,');
    const redeemAt = src.indexOf('router.post("/redeem", noStore,');
    const issueBlock = src.slice(issueAt, src.indexOf("function sendRedeemInvalid"));
    const redeemBlock = src.slice(redeemAt);

    it("/api/hiq/handoff 로 등록돼 있다 — 루트(/)에 거는 모듈들보다 먼저", () => {
        const index = root("server/routes/index.ts");
        expect(index).toContain('import handoffRouter from "./modules/handoff.js";');
        const at = index.indexOf('router.use("/handoff", handoffRouter);');
        expect(at).toBeGreaterThan(0);
        expect(at).toBeLessThan(index.indexOf('router.use("/", authRouter);'));
        expect(root("server/routes.ts")).toContain('app.use("/api/hiq", hiqRouter);');
    });

    it("길은 둘뿐이다 — 발급은 로그인 필수, 바꾸기는 로그인 없이. 둘 다 캐시하지 않는다", () => {
        expect(issueAt).toBeGreaterThan(0);
        expect(redeemAt).toBeGreaterThan(issueAt);
        expect(code(src).match(/router\.(get|post|put|patch|delete)\(/g)).toHaveLength(2);
        expect(redeemBlock.slice(0, redeemBlock.indexOf("\n"))).not.toContain("requireAuth");
        expect(src).toContain('res.set("Cache-Control", "no-store");');
    });

    it("둘 다 JSON 본문 검사가 맨 앞이다 — 저장소·횟수 제한보다 먼저", () => {
        for (const block of [issueBlock, redeemBlock]) {
            const guard = block.indexOf("if (!isJsonBody(req)) return sendError(res, 400,");
            expect(guard).toBeGreaterThan(0);
            expect(guard).toBeLessThan(block.search(/await /));
        }
    });

    it("바꾸기: 꼴 검사 → 한 번만 쓰는 저장소 호출 → 정지 확인 → 쿠키 순서다", () => {
        const shape = redeemBlock.indexOf("if (!isHandoffToken(token)) return sendRedeemInvalid(res, key);");
        const take = redeemBlock.indexOf("await redeemLoginHandoff(hashHandoffToken(token))");
        // 이미 로그인된 요청의 거절(409)은 꼴 검사 뒤 · 토큰을 쓰기 전이다(2026-10-06 검토) — 토큰을 건드리지 않고, 실패로 세지 않는다
        const signedIn = redeemBlock.indexOf("const currentId = req.signedCookies?.hiq_user_id;");
        const refuse = redeemBlock.indexOf('return sendError(res, 409, "err.auth.handoffSignedIn", "HANDOFF_SIGNED_IN");');
        expect(signedIn).toBeGreaterThan(shape);
        expect(refuse).toBeGreaterThan(signedIn);
        expect(refuse).toBeLessThan(take);
        expect(redeemBlock.slice(signedIn, take)).toContain("if (current && !isDeletedMember(current) && !(await isMemberSuspended(current.id))) {");
        expect(redeemBlock.slice(signedIn, take)).not.toMatch(/registerFailure|sendRedeemInvalid|res\.cookie|clearCookie/);
        const banned = redeemBlock.indexOf("if (await isMemberSuspended(member.id)) {");
        const cookie = redeemBlock.indexOf("res.cookie('hiq_user_id'");
        expect(shape).toBeGreaterThan(0);
        expect(take).toBeGreaterThan(shape);
        expect(banned).toBeGreaterThan(take);
        expect(cookie).toBeGreaterThan(banned);
        // 저장소에는 해시만 넘긴다 — 라우트 어디에서도 원문을 저장소 함수에 넘기지 않는다
        const repoCalls = code(src).match(/(?:insertLoginHandoff|redeemLoginHandoff)\(.*\)/g) ?? [];
        expect(repoCalls).toHaveLength(2);
        for (const call of repoCalls) {
            expect(call).toContain("hashHandoffToken(token)");
            expect(call.replace("hashHandoffToken(token)", ""), call).not.toMatch(/\btoken\b/);
        }
        expect(src).toContain("await insertLoginHandoff(memberId, hashHandoffToken(token), HANDOFF_TTL_SEC);");
        // 실패는 한 함수로만 나간다(401 한 가지)
        expect(code(redeemBlock).match(/sendError\(res, 401/g)).toBeNull();
        expect(code(redeemBlock).match(/return sendRedeemInvalid\(res, key\);/g)).toHaveLength(3);
    });

    it("쿠키 옵션은 /social 과 글자까지 같다", () => {
        const options = (s: string) => {
            const at = s.indexOf("res.cookie('hiq_user_id'");
            return s.slice(s.indexOf("{", at), s.indexOf("});", at));
        };
        const social = auth.slice(auth.indexOf('router.post("/social",'), auth.indexOf("// --- 카카오 로그인"));
        expect(options(social)).toContain("httpOnly: true");
        expect(options(redeemBlock)).toBe(options(social));
        // 쿠키를 주는 곳은 바꾸기 하나뿐이다
        expect(code(src).match(/res\.cookie\(/g)).toHaveLength(1);
        expect(issueBlock).not.toContain("res.cookie(");
    });

    it("로그에 토큰을 적지 않는다 — 로그를 남기는 곳은 청소 실패 한 줄뿐이다", () => {
        const logsInCode = code(src).match(/console\.[a-z]+\([^\n]*/g) ?? [];
        expect(logsInCode).toEqual(['console.error("[Handoff] sweep failed:", (e as Error)?.message);']);
    });

    // auth.ts 가 내보내지 않아 옮겨 적은 두 함수 — 한쪽만 고치면 횟수 제한의 키·폼 거절 규칙이 갈린다
    it("clientIp·isJsonBody 는 auth.ts 의 것과 글자까지 같다", () => {
        const fn = (s: string, name: string) => {
            const at = s.indexOf(`function ${name}(`);
            expect(at, name).toBeGreaterThan(0);
            return s.slice(at, s.indexOf("\n}\n", at));
        };
        expect(fn(src, "clientIp")).toBe(fn(auth, "clientIp"));
        expect(fn(src, "isJsonBody")).toBe(fn(auth, "isJsonBody"));
    });

    it("서버 사전 다섯 언어에 문구가 있다", async () => {
        const dicts: Record<string, Record<string, string>> = {
            ko: (await import("../../../shared/i18n/ko.js")).ko,
            en: (await import("../../../shared/i18n/en.js")).en,
            es: (await import("../../../shared/i18n/es.js")).es,
            tr: (await import("../../../shared/i18n/tr.js")).tr,
            vi: (await import("../../../shared/i18n/vi.js")).vi,
        };
        const used = Array.from(new Set(src.match(/err\.auth\.handoff[A-Za-z]+/g) ?? [])).sort();
        // handoffSignedIn — 이미 로그인된 요청의 409(2026-10-06 검토)
        expect(used).toEqual(["err.auth.handoffBadRequest", "err.auth.handoffInvalid", "err.auth.handoffSignedIn"]);
        for (const [locale, dict] of Object.entries(dicts)) {
            for (const key of [...used, "err.auth.requestTooMany", "err.auth.tooManyAttempts", "err.common.loginRequired"]) {
                expect(dict[key], `${locale} ${key}`).toBeTruthy();
            }
            // 429 두 문구는 '몇 초 뒤'를 채워 보낸다
            expect(dict["err.auth.requestTooMany"], locale).toContain("{sec}");
            expect(dict["err.auth.tooManyAttempts"], locale).toContain("{sec}");
        }
    });
});
