import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 2026-10-06 — 채팅 말풍선 메뉴(오너: "신고하기 버튼 위에 기능들 더 — 복사하기나 이런 거, 번역하기는 일단 관리자만").
 *
 * 신고·차단만 있던 시트가 메시지 메뉴 전체가 됐다: [복사] [번역] · [신고] [차단하기] · [삭제].
 * 화면 코드의 시험이지만 shared 에 둔다(vitest 가 client/src 에서는 sim·golf 만 읽는다) — 소스를 읽어 지킨다.
 *
 *  (가) 시트(ChatReportSheet): 넘긴 줄만 그린다. 신고·차단 묶음은 reportable 일 때만. 순서는 복사·번역 → 신고·차단 → 삭제.
 *  (나) 말풍선(ChatRoom): 메뉴가 있으면 길게 누르기·우클릭·⋯ 가 메뉴를 연다. 보내는 중·실패·시스템 글은 아니다. 번역은 글자로만 그린다.
 *  (다) 대화방(chat-room): 메시지마다 할 수 있는 일 — 복사(글자 메시지) · 번역(운영자, 남의 글자 메시지) · 신고·차단(남의 글, 문의 방 아님) · 삭제(내 글·운영진).
 *       내 글에는 신고·차단이 안 뜬다. 번역은 서버에 메시지 id 만 보낸다(글을 실어 보내지 않는다).
 *  (라) 서버: 번역 라우트는 운영자만, 글은 DB 에서 읽는다. 열쇠는 env 에서만 읽고 소스에 없다.
 *  (마) 문구는 다섯 언어 사전에.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
/** 주석만 있는 줄을 뺀다 — 주석 속 낱말이 검사를 통과시키지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
function between(s: string, from: string, to: string): string {
    const a = s.indexOf(from);
    if (a < 0) throw new Error(`시작을 못 찾음: ${from}`);
    const b = s.indexOf(to, a + from.length);
    if (b < 0) throw new Error(`끝을 못 찾음: ${to}`);
    return s.slice(a, b);
}
const HANGUL = /[가-힣]/;

describe("(가) 시트(ChatReportSheet) — 메시지 메뉴", () => {
    const src = code(client("components/hiq/chat/ChatMenuSheet.tsx"));
    const sheet = src.slice(src.indexOf("export function ChatReportSheet("));

    it("복사·번역·삭제는 넘겼을 때만 그린다", () => {
        expect(sheet).toContain("{(onCopy || onTranslate) && (");
        expect(sheet).toContain('{onCopy && <Row Icon={LucideCopy} label={t("chat.msgMenu.copy")} onClick={onCopy} />}');
        expect(sheet).toContain('{onTranslate && <Row Icon={LucideLanguages} label={translateLabel ?? t("chat.msgMenu.translate")} onClick={onTranslate} />}');
        expect(sheet).toContain("{onDelete && (");
        expect(sheet).toContain('<Row Icon={LucideTrash2} label={t("community.delete")} danger onClick={onDelete} />');
    });

    it("신고·차단 묶음은 reportable 일 때만 — 안 넘기면 보인다(예전 쓰임 그대로)", () => {
        expect(sheet).toContain("reportable = true");
        const group = between(sheet, "{reportable && (", "{onDelete && (");
        expect(group).toContain("LucideFlag");
        expect(group).toContain("LucideBan");
    });

    it("순서: 복사·번역 → 신고·차단 → 삭제 → 취소", () => {
        const at = (s: string) => { const i = sheet.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
        const order = [at("LucideCopy} label"), at("LucideLanguages} label"), at("LucideFlag} label"), at("LucideBan} label"), at("LucideTrash2} label"), at('{t("common.cancel")}')];
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("문구를 화면에 박지 않았다(사전 키로만)", () => {
        expect(sheet).not.toMatch(HANGUL);
    });
});

describe("(나) 말풍선(ChatRoom) — 메뉴 입구와 번역", () => {
    const src = code(client("components/hiq/chat/ChatRoom.tsx"));

    it("메뉴를 열 수 있는 글 — 보내는 중·실패·시스템 글은 아니고, 할 일이 있는 글만(canMenu)", () => {
        expect(src).toContain('const menuable = (m: ChatMsg) => !!onMenu && m.type !== "system" && !m.pending && !m.failed && !!canMenu?.(m);');
    });

    it("길게 누르기·우클릭: 메뉴가 먼저다 — 삭제·신고를 곧바로 부르던 길은 메뉴를 안 넘긴 쓰임에만 남는다", () => {
        const hold = between(src, "const holdStart = (m: ChatMsg) => {", "const holdEnd");
        expect(hold).toContain("if (menuable(m)) { holdRef.current = setTimeout(() => { holdRef.current = null; onMenu?.(m); }, 600); return; }");
        expect(hold.indexOf("if (menuable(m))")).toBeLessThan(hold.indexOf("const act = onDelete"));
        const ctx = between(src, "const onContext = (e: MouseEvent, m: ChatMsg) => {", "};");
        expect(ctx).toContain("if (menuable(m)) { onMenu?.(m); return; }");
        expect(ctx.indexOf("e.preventDefault();")).toBeLessThan(ctx.indexOf("if (menuable(m))"));
    });

    it("⋯ 는 남의 글에만 — 내 글은 길게 눌러 연다", () => {
        expect(src).toContain("{(canReport(m) || (!mine && menuable(m))) && (");
    });

    it("번역은 말풍선 아래에 글자로만 그린다 — HTML 로 넣지 않는다", () => {
        expect(src).toContain("const tr = translationOf?.(m);");
        expect(src).toContain('{tr.loading ? t("chat.msgMenu.translating") : tr.failed ? t("chat.msgMenu.translateFailed") : tr.text}');
        expect(src).not.toContain("dangerouslySetInnerHTML");
    });
});

describe("(다) 대화방(chat-room) — 메시지마다 할 수 있는 일", () => {
    const src = code(client("pages/hiq/chat-room.tsx"));
    const menuFor = between(src, "const menuFor = (m: ChatMsg) => {", "const menu = reportMsg");

    it("복사는 글자 메시지, 번역은 운영자가 보는 남의 글자 메시지", () => {
        expect(menuFor).toContain('const text = (m.type ?? "text") === "text" && !!m.message?.trim();');
        expect(menuFor).toContain("const others = !!m.senderId && m.senderId !== member?.id;");
        expect(menuFor).toContain("copy: text,");
        expect(menuFor).toContain("translate: text && isStaff && others,");
        // 운영자 = profiles.role 의 super_admin(/me 가 준다). 관리자(admin · 보기 전용, 2026-10-07)는 운영자가 아니다.
        // 전화번호·이메일로 가르지 않는다. 가리는 것은 편의일 뿐 — 서버가 운영자만 받는다
        expect(src).toContain('const isStaff = (member as any)?.role === "super_admin";');
    });

    it("신고·차단은 남의 글에만(내 글에는 안 뜬다), 문의 방에는 없다", () => {
        expect(menuFor).toContain("report: canReport && others && !!d && !!reportTargetFor(d, m),");
        expect(src).toContain('const canReport = !!d && d.kind !== "support" && !!member;');
        const sheet = /<ChatReportSheet[\s\S]*?\/>/.exec(src)?.[0] ?? "";
        expect(sheet).toContain("reportable={menu.report && !!reportTarget}");
        // 신고 창도 신고할 수 있는 글일 때만 붙는다
        expect(src).toContain("{menu.report && reportTarget && (");
    });

    it("삭제는 지울 수 있는 글(내 글·운영진) — 누르면 시트를 닫고 예전 삭제 확인으로 잇는다", () => {
        expect(src).toContain("const canDeleteMsg = (m: ChatMsg) => !!member && (m.senderId === member.id || !!d?.canManage);");
        expect(menuFor).toContain("del: canDeleteMsg(m),");
        expect(src).toContain("const deleteFromMenu = () => { const m = reportMsg; if (!m) return; setReportMenuOpen(false); void remove(m); };");
        const sheet = /<ChatReportSheet[\s\S]*?\/>/.exec(src)?.[0] ?? "";
        expect(sheet).toContain("onDelete={menu.del ? deleteFromMenu : undefined}");
    });

    it("시트의 줄은 고른 메시지로 정한다 — 할 일이 없는 글에서는 메뉴를 열지 않는다", () => {
        const sheet = /<ChatReportSheet[\s\S]*?\/>/.exec(src)?.[0] ?? "";
        expect(sheet).toContain("onCopy={menu.copy ? () => void copyMsg() : undefined}");
        expect(sheet).toContain("onTranslate={menu.translate ? () => void translateMsg() : undefined}");
        expect(src).toContain("canMenu={(m) => { const x = menuFor(m); return x.copy || x.translate || x.report || x.del; }}");
        expect(src).toContain("onMenu={openReport}");
    });

    it("복사: 됐는지에 따라 말한다", () => {
        const copy = between(src, "const copyMsg = async () => {", "const translateMsg");
        expect(copy).toContain("const ok = await copyText(m.message);");
        expect(copy).toContain('toast(ok ? { title: t("chat.msgMenu.copied") } : { title: t("chat.msgMenu.copyFailed"), variant: "destructive" });');
    });

    it("번역: 서버에 메시지 id 만 보낸다(글을 실어 보내지 않는다) · 다시 누르면 숨긴다 · 방을 옮기면 버린다", () => {
        const tr = between(src, "const translateMsg = async () => {", "const deleteFromMenu");
        expect(tr).toContain("await apiRequest(`/api/hiq/chat/rooms/${asked}/messages/${m.id}/translate`, { method: \"POST\" })");
        expect(tr).not.toContain("body:");
        expect(tr).toContain("if (translations[m.id]?.text) {");
        expect(tr.match(/if \(keyRef\.current !== asked\) return;/g)).toHaveLength(2);
        // 실패는 한 번만 말하고(서버 사유, 없으면 기본 문구) 말풍선 아래에 실패 줄을 남기지 않는다
        expect(tr).toContain('toast({ title: e?.message || t("chat.msgMenu.translateFailed"), variant: "destructive" });');
        expect(tr).not.toContain("failed: true");
        expect(src).toContain("useEffect(() => { setTranslations({}); }, [key]);");
        const sheet = /<ChatReportSheet[\s\S]*?\/>/.exec(src)?.[0] ?? "";
        expect(sheet).toContain('translateLabel={reportMsg && translations[reportMsg.id]?.text ? t("chat.msgMenu.hideTranslation") : undefined}');
    });

    it("네이티브 confirm/alert 를 쓰지 않는다", () => {
        for (const p of ["pages/hiq/chat-room.tsx", "components/hiq/chat/ChatRoom.tsx", "components/hiq/chat/ChatMenuSheet.tsx", "lib/copyText.ts"]) {
            expect(code(client(p)), p).not.toMatch(/(?<![\w.])(?:window\.)?(?:confirm|alert)\(/);
        }
    });
});

describe("(라) 서버 — 번역은 운영자만, 글은 DB 에서, 열쇠는 env 에서만", () => {
    const routes = code(root("server/routes/modules/chat.ts"));
    const lib = root("server/lib/chatTranslate.ts");

    it("라우트: 로그인 + 운영자 가드, 방 접근 확인 뒤 DB 의 메시지를 옮긴다", () => {
        expect(routes).toContain('router.post("/rooms/:key/messages/:id/translate", requireAuth, requireChatAdmin, asyncHandler(async (req: AuthRequest, res: any) => {');
        const r = between(routes, 'router.post("/rooms/:key/messages/:id/translate"', "\n}));");
        expect(r).toContain("const ref = await openRoom(req, res); if (!ref) return;");
        expect(r).toContain("const row = await storage.chat.getMessage(req.params.id);");
        expect(r).toContain("if (!row || row.roomKey !== ref.key)");
        expect(r).toContain("await translateText(row.message, to)");
        // 요청 본문의 글을 읽지 않는다
        expect(r).not.toContain("req.body");
    });

    it("열쇠는 env OPENROUTER_API_KEY 에서만 읽는다 — 소스 어디에도 열쇠 모양 글자가 없다", () => {
        expect(lib).toContain("process.env.OPENROUTER_API_KEY");
        for (const p of ["server/lib/chatTranslate.ts", "server/routes/modules/chat.ts", "client/src/pages/hiq/chat-room.tsx", "client/src/components/hiq/chat/ChatRoom.tsx"]) {
            expect(root(p), p).not.toMatch(/sk-or-v1-[0-9a-f]{20,}/);
        }
        // 화면 쪽은 열쇠 이름조차 모른다
        expect(client("pages/hiq/chat-room.tsx")).not.toContain("OPENROUTER");
    });

    it("회원 글을 저장·학습하는 사업자에게는 보내지 않고, 생각 단계는 끈다", () => {
        expect(lib).toContain('provider: { data_collection: "deny" }');
        expect(lib).toContain("reasoning: { enabled: false }");
    });
});

describe("(마) 문구 — 다섯 언어", () => {
    const CLIENT_KEYS = ["chat.msgMenu.title", "chat.msgMenu.open", "chat.msgMenu.of", "chat.msgMenu.copy", "chat.msgMenu.copied", "chat.msgMenu.copyFailed", "chat.msgMenu.translate", "chat.msgMenu.hideTranslation", "chat.msgMenu.translating", "chat.msgMenu.translateFailed"];
    const SERVER_KEYS = ["err.chat.translateOff", "err.chat.translateFailed", "err.chat.translateBusy", "err.chat.translateNoText"];
    for (const loc of ["ko", "en", "es", "vi", "tr"]) {
        it(`${loc}: 화면 사전과 서버 사전에 전부 있다`, () => {
            const c = client(`lib/i18n/${loc}.ts`);
            for (const k of CLIENT_KEYS) expect(c, k).toMatch(new RegExp(`"${k.replace(/\./g, "\\.")}": "[^"]+`));
            const s = root(`shared/i18n/${loc}.ts`);
            for (const k of SERVER_KEYS) expect(s, k).toMatch(new RegExp(`"${k.replace(/\./g, "\\.")}": "[^"]+`));
        });
    }
});
