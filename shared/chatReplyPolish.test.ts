import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { languageLabel } from "./languageLabel";

/**
 * 2026-10-06 — 문의 답변 다듬기의 화면 쪽(오너: "내가 한국어로 적어서 버튼이 있으면 … 해당 언어로 정식적인 내용으로 바꿔주는 형태").
 * 화면 코드의 시험이지만 shared 에 둔다(vitest 가 client/src 에서는 sim·golf 만 읽는다) — 소스를 읽어 지킨다.
 *
 *  (가) 언어 이름: 코드 → 화면 언어의 이름, 모르면 빈 글
 *  (나) 입력줄(ChatRoom): 단추는 넘겼을 때만 · 바꾼 글은 입력칸에만 들어간다(보내지 않는다) · 안내는 그 글이 그대로일 때만 · 되돌리기
 *  (다) 대화방(chat-room): 운영자가 남의 문의 방에서만 · 서버에는 쓴 글만 보낸다 · 방을 옮기면 버린다
 *  (라) 문구 다섯 언어
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
function between(s: string, from: string, to: string): string {
    const a = s.indexOf(from);
    if (a < 0) throw new Error(`시작을 못 찾음: ${from}`);
    const b = s.indexOf(to, a + from.length);
    if (b < 0) throw new Error(`끝을 못 찾음: ${to}`);
    return s.slice(a, b);
}

describe("(가) 언어 이름 — languageLabel", () => {
    it("코드를 화면 언어의 이름으로", () => {
        expect(languageLabel("es", "ko")).toBe("스페인어");
        expect(languageLabel("vi", "ko")).toBe("베트남어");
        expect(languageLabel("pt", "ko")).toBe("포르투갈어");
        expect(languageLabel("ES", "en")).toBe("Spanish");
    });
    it("한국어 화면의 이름은 모두 '어'로 끝난다 — \"{lang}로 바꿨어요\"의 조사가 맞는다", () => {
        for (const c of ["es", "vi", "tr", "en", "ko", "pt", "ja", "zh", "fr", "de", "ru", "id", "th"]) expect(languageLabel(c, "ko"), c).toMatch(/어$/);
    });
    it("빈 값·이상한 값·모르는 코드는 빈 글", () => {
        for (const bad of ["", "  ", null, undefined, 3, "spanish language", "e", "zz"]) expect(languageLabel(bad, "ko"), String(bad)).toBe("");
    });
});

describe("(나) 입력줄(ChatRoom)", () => {
    const src = code(client("components/hiq/chat/ChatRoom.tsx"));
    const polish = between(src, "const polish = async () => {", "const undoPolish");

    it("단추는 onPolish 를 넘긴 방에서만 그린다", () => {
        expect(src).toContain("{onPolish && !disabled && (");
        expect(src).toContain('aria-label={t("chat.polish.button")} title={t("chat.polish.button")} aria-busy={polishing}');
        expect(src).toContain("disabled={polishing || sending || !text.trim()}");
    });

    it("바꾼 글은 입력칸에만 들어간다 — 다듬기는 보내지 않는다", () => {
        expect(polish).toContain("const r = await onPolish(v);");
        expect(polish).toContain("setText(next);");
        expect(polish).not.toContain("onSend");
        expect(polish).not.toContain("send(");
        // 쓴 글을 기억해 둔다(되돌리기) · 채팅 한 건 상한을 넘겨 넣지 않는다
        expect(polish).toContain("const next = r.text.slice(0, 1000);");
        expect(polish).toContain("setPolished({ original: text, text: next, title: r.title, detail: r.detail });");
    });

    it("바꾸는 동안에는 입력칸을 못 고치고(늦게 온 답이 새로 친 글을 덮지 않게) 보내기도 막는다", () => {
        expect(src).toContain("readOnly={polishing}");
        expect(src).toContain("disabled={disabled || sending || polishing || !text.trim()}");
        expect(between(src, "const send = async () => {", "return (")).toContain("if (!v || sending || disabled || polishing) return;");
    });

    it("안내(무슨 언어로·뜻·되돌리기)는 바꾼 글이 입력칸에 그대로 있을 때만 — 고쳐 쓰면 뜻이 달라지니 내린다", () => {
        expect(src).toContain("{polished && polished.text === text && (");
        expect(src).toContain("{polished.detail && <p");
        expect(src).toContain('<button type="button" onClick={undoPolish}');
        expect(src).toContain("const undoPolish = () => { if (!polished) return; setText(polished.original); setPolished(null);");
        // 보내면 안내를 치운다
        expect(between(src, "const send = async () => {", "return (")).toContain("setPolished(null);");
    });

    it("뜻풀이는 글자로만 그린다 — HTML 로 넣지 않는다", () => {
        expect(src).not.toContain("dangerouslySetInnerHTML");
    });

    it("다듬기가 있는 방의 입력칸은 쓰는 법을 말해 준다", () => {
        expect(src).toContain('placeholder={disabled ? t("chat.readOnly") : onPolish ? t("chat.polish.placeholder") : t("chat.placeholder")}');
    });
});

describe("(다) 대화방(chat-room)", () => {
    const src = code(client("pages/hiq/chat-room.tsx"));
    const fn = between(src, "const polishReply = async (draft: string) => {", "\n    };\n");

    it("운영자가 남의 문의 방에서 답할 때만 — 가리는 것은 편의고, 서버가 같은 조건으로 다시 막는다", () => {
        expect(src).toContain('const canPolish = isStaff && kind === "support" && !!member && id !== member.id;');
        expect(src).toContain("onPolish={canPolish ? polishReply : undefined}");
        const route = between(code(root("server/routes/modules/chat.ts")), 'router.post("/rooms/:key/reply-polish"', "\n}));");
        expect(route).toContain('router.post("/rooms/:key/reply-polish", requireAuth, requireChatAdmin,');
        expect(route).toContain('if (ref.kind !== "support" || ref.id === req.userId) return sendError(res, 400, "err.chat.polishSupportOnly", "SUPPORT_ONLY");');
    });

    it("서버에는 쓴 글만 보낸다 — 회원 글·언어는 서버가 DB 에서 읽는다", () => {
        expect(fn).toContain("await apiRequest(`/api/hiq/chat/rooms/${asked}/reply-polish`, { method: \"POST\", body: { text: draft } })");
        const route = between(code(root("server/routes/modules/chat.ts")), 'router.post("/rooms/:key/reply-polish"', "\n}));");
        expect(route).toContain("const draft = replyDraft(req.body?.text);");
        expect(route.match(/req\.body/g)).toHaveLength(1);
        // 돌려주기만 한다 — 이 라우트에는 메시지 쓰기·알림이 없다
        expect(route).not.toContain("addMessage");
        expect(route).not.toContain("sendAndSaveNotification");
    });

    it("그사이 방을 옮겼으면 버린다 — 앞 방의 답을 새 방 입력칸에 넣지 않는다", () => {
        expect(fn).toContain("if (keyRef.current !== asked) return null;");
    });

    it("무슨 언어로 바꿨는지 말한다 — 이름을 모르면 언어를 빼고 말한다", () => {
        expect(fn).toContain("const lang = languageLabel(out.language, locale);");
        expect(fn).toContain('title: lang ? t("chat.polish.done").replace("{lang}", lang) : t("chat.polish.doneNoLang"), detail: out.back || undefined');
    });

    it("실패는 서버가 말한 이유로(없으면 기본 문구) 한 번 알린다", () => {
        expect(fn).toContain('toast({ title: e?.message || t("chat.polish.failed"), variant: "destructive" });');
    });
});

describe("(라) 문구 — 다섯 언어", () => {
    const CLIENT_KEYS = ["chat.polish.button", "chat.polish.placeholder", "chat.polish.done", "chat.polish.doneNoLang", "chat.polish.undo", "chat.polish.failed"];
    const SERVER_KEYS = ["err.chat.polishEmpty", "err.chat.polishTooLong", "err.chat.polishSupportOnly", "err.chat.polishFailed", "err.chat.polishResultTooLong"];
    const value = (dict: string, k: string) => new RegExp(`"${k.replace(/\./g, "\\.")}": "([^"]+)"`).exec(dict)?.[1] ?? "";
    for (const loc of ["ko", "en", "es", "vi", "tr"]) {
        it(`${loc}: 화면 사전과 서버 사전에 전부 있고, 자리표시({lang}·{n})가 살아 있다`, () => {
            const c = client(`lib/i18n/${loc}.ts`);
            for (const k of CLIENT_KEYS) expect(value(c, k), k).not.toBe("");
            expect(value(c, "chat.polish.done")).toContain("{lang}");
            expect(value(c, "chat.polish.doneNoLang")).not.toContain("{lang}");
            const s = root(`shared/i18n/${loc}.ts`);
            for (const k of SERVER_KEYS) expect(value(s, k), k).not.toBe("");
            expect(value(s, "err.chat.polishTooLong")).toContain("{n}");
        });
    }
    it("한국어가 아닌 사전에 한글이 섞이지 않았다", () => {
        for (const loc of ["en", "es", "vi", "tr"]) {
            const c = client(`lib/i18n/${loc}.ts`);
            for (const k of CLIENT_KEYS) expect(value(c, k), `${loc} ${k}`).not.toMatch(/[가-힣]/);
            const s = root(`shared/i18n/${loc}.ts`);
            for (const k of SERVER_KEYS) expect(value(s, k), `${loc} ${k}`).not.toMatch(/[가-힣]/);
        }
    });
});
