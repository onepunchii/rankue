/**
 * 멀티방 정리 · 채팅 관리(2026-10-26 오너 "응 a~d 진행하고 · 왜 둘 다 나가면 초시계가 안 흘러?"):
 *   A. 진행 중인 판이 있는데 새 방 · 다른 방 → 묻고 기권 / 둘 다 떠난 판은 서버가 시계를 대신 센다
 *   B. 대전 채팅 금칙어("match" 맥락)  C. 대전 채팅 한 줄 신고 · 차단 · 상대 채팅 끄기  D. 채팅 금지(운영자 · 자동)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHAT_AUTO_BAN_HITS, CHAT_AUTO_BAN_HOURS, CHAT_BAN_CHOICES, CHAT_HIT_WINDOW_MIN, chatBanHoursLeft, isChatBanHours } from "./chatBan";
import { nextTurnSeenAt } from "../server/storage/simMatch.repo";
import { ABSENT_GRACE_MS, PRESENCE_MS, REPEAT_ABSENT_GRACE_MS, SHOT_CLOCK_S, SHOT_CLOCK_STRIKES } from "./sim/rules/session";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const route = read("server/routes/modules/simMatch.ts");
const repo = read("server/storage/simMatch.repo.ts");
const section = (src: string, from: string, to: string) => { const a = src.indexOf(from); expect(a, from).toBeGreaterThan(-1); return src.slice(a, src.indexOf(to, a + from.length)); };

describe("A. 진행 중인 판이 있으면 묻고 기권", () => {
    it("만들기 — 묻기(409 HAS_PLAYING)는 만들기 전, 기권은 새 방이 생긴 뒤", () => {
        const create = section(route, 'router.post("/sim/matches", requireAuth', "// GET /sim/matches — 내 대전 목록");
        expect(create.indexOf('if (playing === "ask") return sendError(res, 409, "err.sim.hasPlaying", "HAS_PLAYING");')).toBeLessThan(create.indexOf("await createHostMatch("));
        expect(create.indexOf("await createHostMatch(")).toBeLessThan(create.indexOf("await forfeitPlaying(req.userId!, playing, full.id);"));
    });
    it("참가 — 기권은 새 판이 시작된 뒤(먼저 기권하고 방을 뺏기면 둘 다 잃는다)", () => {
        const join = section(route, "async function joinAndStart(", "/** 4구는 1캐롬");
        expect(join.indexOf('if (playing === "ask")')).toBeLessThan(join.indexOf("await storage.simMatch.start("));
        expect(join.indexOf("await storage.simMatch.start(")).toBeLessThan(join.indexOf("await forfeitPlaying(req.userId!, playing, m.id);"));
    });
    it("무효가 아니라 기권(상대 승) — 기권 단추와 같은 길", () => {
        const f = section(route, "async function forfeitPlaying(", "export async function createHostMatch(");
        expect(f).toContain('storage.simMatch.finish(old.id, winnerId ?? null, "resign")');
        expect(f).toContain("if (old.id === keepId) continue;");
    });
});

describe("A. 둘 다 떠난 판의 시계 — 서버가 대신 센다", () => {
    it("두 선수 다 자리를 비운 판만 · 시계가 끝난 판만 · 그때 났어야 할 시각으로 · 횟수 알림 없이", () => {
        const sweep = section(route, "export async function sweepAbandonedClocks(", "let lastSweepAt = 0;");
        expect(sweep).toContain("if (nowMs - lastSeen < SWEEP_ABSENT_MS) break;");
        expect(sweep).toContain("if (nowMs - due < graceMs) break;");
        expect(sweep).toContain("{ at: Math.max(due, lastSeen), quiet: true }");
        expect(route).toContain("if (opts.quiet && !finished) return row;");
        // 목록을 볼 때(인스턴스마다 30초에 한 번) · 매시 크론
        expect(section(route, 'router.get("/sim/rooms"', "out.sort(")).toContain("await sweepSoon();");
        expect(section(route, 'router.get("/sim/watch"', "return sendSuccess(")).toContain("await sweepSoon();");
        expect(read("server/routes/modules/cron.ts")).toContain("simClocks: await simClocksQuietly()");
    });
    it("버려진 판 찾기는 drizzle 연산자로 — raw sql 에 Date 를 넣으면 9시간 어긋난다", () => {
        const q = section(repo, "async listAbandonedClocks(", "async cleanupStaleWaiting(");
        expect(q).toContain("lt(hiqSimMatches.turnSeenAt, dueBefore)");
        expect(q).not.toMatch(/\$\{(dueBefore|absentSince)\}/);
    });
    it("오래 버려진 판은 한 번에 끝난다 — 차례였던 사람이 세 번째 시간 초과로 실격(다음 차례 시계를 그때 시각으로 센다)", () => {
        // 19:20 에 둘 다 떠남, A(0)의 차례 시계는 19:19:50 에 시작. 지금은 한 시간 뒤.
        const left = Date.parse("2026-10-26T10:20:00Z"), now = left + 3_600_000;
        const m = { hostSeenAt: new Date(left), guestSeenAt: new Date(left), hostTimeouts: 0, guestTimeouts: 0 };
        let turn = 0, seenAt = left - 10_000, strikes = [0, 0], steps = 0;
        while (steps < SHOT_CLOCK_STRIKES * 2) {
            const due = seenAt + SHOT_CLOCK_S * 1000;
            if (now - due < 10_000) break;
            const at = Math.max(due, left);
            strikes[turn]++; steps++;
            if (strikes[turn] >= SHOT_CLOCK_STRIKES) break;
            turn = turn === 0 ? 1 : 0;
            seenAt = nextTurnSeenAt({ ...m, hostTimeouts: strikes[0], guestTimeouts: strikes[1] }, turn, false, 0, at)!.getTime();
        }
        expect(strikes).toEqual([3, 2]);
        expect(steps).toBe(5);
        // 쓰는 값이 바뀌면 이 시간표도 다시 본다
        expect([ABSENT_GRACE_MS, REPEAT_ABSENT_GRACE_MS, PRESENCE_MS]).toEqual([60_000, 0, 20_000]);
    });
});

describe("C. 대전 채팅 한 줄 — 신고 · 차단 · 끄기", () => {
    it("차단 관계인 사람의 줄은 글만 비워 보낸다(줄을 빼면 화면의 seq 커서가 멈춘다)", () => {
        expect(route).toContain("return sendSuccess(res, rows.map((r) => chatLine(r, blocked.has(r.senderId))));");
        expect(repo).toContain("async blockedPeerIds(memberId: string): Promise<Set<string>>");
    });
    it("신고 · 차단은 방 id 와 줄 번호로 — 볼 수 있었던 줄만, 내 말은 안 된다, 그때의 말을 증거로", () => {
        const t = section(route, "async function chatLineTarget(", "// POST /sim/matches/:id/chats/:seq/report");
        expect(t).toContain("canReadChat(m, req.userId!)");
        expect(t).toContain("if (row.senderId === req.userId)");
        const r = section(route, 'router.post("/sim/matches/:id/chats/:seq/report"', 'router.post("/sim/matches/:id/chats/:seq/block"');
        expect(r).toContain('targetType: "member", targetId: row.senderId');
        expect(r).toContain("detail: `[대전 채팅 ${m.id.slice(0, 8)} · ${row.seq}번째] ${said}`.slice(0, 500)");
        expect(section(route, 'router.post("/sim/matches/:id/chats/:seq/block"', "// POST /sim/matches/:id/resign")).toContain("storage.community.block(req.userId!, target.row.senderId)");
    });
    it("화면 — 상대가 쓴 글만 누를 수 있고, 보이는 줄은 숨긴 줄 · 차단한 자리 · 끈 채팅을 뺀다(내 말은 늘)", () => {
        const chat = read("client/src/sim/match/MatchChat.tsx");
        expect(chat).toContain('const menu = p.onLineMenu && !mine && l.kind === "text" && l.from !== CHAT_FROM_WATCHER ? p.onLineMenu : null;');
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain('chatLines.filter((l) => l.from === myIdx || (!l.hidden && l.from !== mutedFrom && !(chatOff && l.kind === "text")))');
        expect(page).toContain("<MatchChatLog lines={visibleChat}");
        expect(page).toContain("lines={visibleChat} myIndex={sim.match.myIndex}");
        expect(page).toContain("reportPath={matchChatReportUrl(reportLine.matchId, reportLine.seq)}");
    });
});

describe("D. 채팅 금지", () => {
    it("숫자 — 고르기는 1 · 7 · 30일만, 남은 시간은 올림(최소 1)", () => {
        expect(CHAT_BAN_CHOICES.map((c) => c.hours)).toEqual([24, 168, 720]);
        expect([24, 168, 720, 5, null, "24"].map(isChatBanHours)).toEqual([true, true, true, false, false, false]);
        const now = Date.parse("2026-10-26T10:00:00Z");
        expect(chatBanHoursLeft({ until: "2026-10-27T09:30:00Z" }, now)).toBe(24);
        expect(chatBanHoursLeft({ until: "2026-10-26T10:00:30Z" }, now)).toBe(1);
        expect([CHAT_AUTO_BAN_HITS, CHAT_HIT_WINDOW_MIN, CHAT_AUTO_BAN_HOURS]).toEqual([3, 10, 24]);
    });
    it("마이그레이션은 표 하나를 더하기만 · 시각은 timestamptz", () => {
        const sql = read("migrations/hiq_chat_moderation.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
        expect(sql).toMatch(/^create table if not exists hiq_chat_moderation \(/);
        expect(sql).not.toMatch(/\b(drop|delete|alter|update|truncate)\b/i);
        expect(sql).toContain("ban_until timestamptz");
        // 저장소는 시각을 DB 의 now() 로만 센다
        expect(read("server/storage/chatBans.ts")).not.toMatch(/new Date\(\)/);
    });
    it("대전 채팅 — 글만 막고(문구 단추는 그대로), 금지 확인이 금칙어보다 먼저, 막힌 말은 세어 자동 금지", () => {
        const send = section(route, 'router.post("/sim/matches/:id/chat"', "// POST /sim/matches/:id/resign");
        const textBranch = send.slice(send.indexOf('} else if (typeof body.text === "string") {'));
        expect(send.indexOf("chatBanOf(")).toBeGreaterThan(send.indexOf('} else if (typeof body.text === "string") {'));
        expect(textBranch.indexOf("chatBanOf(")).toBeLessThan(textBranch.indexOf('checkContent(t, { context: "match" })'));
        expect(textBranch).toContain("const auto = await countChatFilterHit(req.userId!);");
    });
    it("크루 · 1:1 채팅도 막는다 — 운영자 문의와 오너(슈퍼 관리자)는 빼고(문의 = 금지에 이의를 말할 길)", () => {
        const chat = read("server/routes/modules/chat.ts");
        const at = chat.indexOf('if (ref.kind !== "support" && !trusted) {\n        // 채팅 금지');
        expect(at).toBeGreaterThan(-1);
        expect(chat.slice(at, at + 400)).toContain("const ban = await chatBanOf(req.userId!);");
        expect(chat.slice(at - 200, at)).toContain("const trusted = await isSuperAdmin(req.userId);");
    });
    it("오너(슈퍼 관리자)는 대전 채팅에서도 금지 · 금칙어 · 가리기를 받지 않는다(2026-10-29)", () => {
        const send = section(route, 'router.post("/sim/matches/:id/chat"', "// POST /sim/matches/:id/resign");
        expect(send).toContain("const trusted = await isSuperAdmin(req.userId);");
        expect(send).toContain("const ban = trusted ? null : await chatBanOf(req.userId!);");
        expect(send).toContain('const check = trusted ? null : checkContent(t, { context: "match" });');
        expect(send).toContain("text = trusted ? t : maskContacts(t);");
    });
    it("관리자 — 슈퍼관리자만 정하고 푼다, 화면의 단추는 보기 전용 계정에 안 보인다", () => {
        const admin = read("server/routes/modules/admin.ts");
        expect(admin).toContain('router.post("/members/:id/chat-ban", checkSuperAdmin,');
        const sheet = read("client/src/pages/admin/MemberDetailSheet.tsx");
        const block = section(sheet, 'data-testid="admin-chat-ban"', "{m.profileId && !isStaff && (");
        expect((block.match(/<button /g) ?? []).length).toBe((block.match(/data-admin-write/g) ?? []).length);
        for (const l of ["ko", "en", "es", "vi", "tr"]) expect(read(`shared/i18n/${l}.ts`), l).toContain('"err.chat.banned":');
    });
});
