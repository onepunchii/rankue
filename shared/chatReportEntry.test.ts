import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// 서버가 받는 신고 타입(순수 모듈 — DB 를 물지 않는다)
import { REPORT_TARGET_TYPES } from "../server/lib/reportQueue.js";
import { isCrewReportTarget } from "../server/utils/crewModeration.js";

/**
 * 2026-10-06 — 채팅의 신고·차단 입구(스토어 심사 1.2 차단 항목).
 *
 * 9/21 "채팅 한 체계"(b4fe9093)가 옛 크루 채팅 탭을 지우면서 거기 있던 신고·차단 ⋯ 가 같이 사라졌다.
 * 약관과 심사 노트는 채팅에서 신고·차단이 된다고 적는데 화면 어디에도 입구가 없었다. 다시 사라지지 않게 소스를 읽어 지킨다
 * (화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim·golf 만 읽는다).
 *
 *  (가) 말풍선(ChatRoom): 남의 글**마다** 늘 보이는 ⋯ 와 길게 누르기·우클릭 — 누른 그 글이 대상이다(묶음의 첫 글이 아니다).
 *       지울 수 있는 글의 길게 누르기는 예전대로 삭제.
 *  (나) 대화방(chat-room): 방 종류별 대상 — 크루는 그 메시지(crew_chat), 조인/부킹·1:1 은 보낸 사람(member), 문의 방은 없음.
 *       차단하면 그 사람 글을 바로 걷는다.
 *  (다) ⋯ 메뉴의 참여자 줄(ChatMenuSheet): 내가 아닌 사람 오른쪽에 회원 신고·차단. 메뉴가 잘리지 않는다
 *       (긴 명단은 스크롤 상자의 보이는 창 기준으로 — 열 때 상자를 밀어 메뉴를 꺼낸다).
 *  (라) 문구는 다섯 언어 사전에.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);

/** 주석만 있는 줄을 뺀다 — 주석 속 낱말이 검사를 통과시키지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

/** from 부터 그 뒤 처음 나오는 to 앞까지 */
function between(s: string, from: string, to: string): string {
    const a = s.indexOf(from);
    if (a < 0) throw new Error(`시작을 못 찾음: ${from}`);
    const b = s.indexOf(to, a + from.length);
    if (b < 0) throw new Error(`끝을 못 찾음: ${to}`);
    return s.slice(a, b);
}

const HANGUL = /[가-힣]/;

describe("(가) 말풍선(ChatRoom) — 남의 글에 신고·차단 입구", () => {
    const src = code(client("components/hiq/chat/ChatRoom.tsx"));

    it("onReport 를 받는다 — 안 넘기면 입구를 안 그린다(문의 방)", () => {
        expect(src).toContain("onReport?: (msg: ChatMsg) => void;");
        expect(src).toMatch(/const canReport = \(m: ChatMsg\) => !!onReport && /);
    });

    it("대상은 남의 글만 — 내 글과 시스템 글(보낸 사람 없음)은 아니다", () => {
        const rule = /const canReport = [^\n]+/.exec(src)?.[0] ?? "";
        expect(rule).toContain("!!meId");
        expect(rule).toContain("!!m.senderId");
        expect(rule).toContain("m.senderId !== meId");
        expect(rule).toContain('m.type !== "system"');
    });

    describe("말풍선 옆 ⋯ 단추 — 길게 누르기는 못 찾을 수 있다", () => {
        // 말풍선 옆 시각 칸. 여기는 말풍선마다 그려진다 — 같은 사람이 이어 보낸 글(grouped)에도.
        const META = '<span className={cn("shrink-0 mb-0.5 flex flex-col gap-0.5 leading-none", mine ? "items-end" : "items-start")}>';
        const meta = between(src, META, "timeLabel(m.createdAt, locale)");
        const btn = /<button[\s\S]*?<\/button>/.exec(meta)?.[0] ?? "";
        const cls = /className="([^"]+)"/.exec(btn)?.[1] ?? "";
        const px = (re: RegExp) => Number(re.exec(cls)?.[1] ?? NaN) * 4;

        it("신고할 수 있는 글에만 그리고, 누르면 그 메시지로 onReport", () => {
            expect(meta).toContain("{canReport(m) && (");
            expect(btn).toContain('type="button"');
            expect(btn).toContain("onClick={() => onReport?.(m)}");
            expect(btn).toContain("LucideMoreHorizontal");
        });

        it("이어 보낸 글에도 있다 — 이름 줄(묶음의 첫 글)에만 두면 뒤 글 대신 첫 글이 신고된다", () => {
            // 이름 줄은 이름만: 거기 ⋯ 를 두면 누른 사람이 가리킨 글이 아니라 묶음의 첫 글이 넘어간다(크루 방은 그 id 가 지워진다).
            expect(src).toContain('{!mine && !grouped && <span className="mb-0.5 ml-1 text-[11.5px] font-medium text-ink-3">{m.sender?.name}</span>}');
            // ⋯ 는 소스에 하나뿐이고, 묶임(grouped)과 무관한 시각 칸 안에 있다
            expect(src.match(/onClick=\{\(\) => onReport\?\.\(m\)\}/g)).toHaveLength(1);
            expect(src.match(/LucideMoreHorizontal className=/g)).toHaveLength(1);
            expect(meta).not.toContain("grouped");
            // 시각 칸은 글·카드 말풍선과 같은 줄(묶임 조건 밖)에 있다
            const row = between(src, '<div className={cn("flex items-end gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>', "timeLabel(m.createdAt, locale)");
            expect(row).toContain(META);
            expect(row).not.toContain("grouped");
        });

        it("이름표(aria-label)는 사전 키 — 누구 것인지 읽어 준다", () => {
            expect(btn).toMatch(/aria-label=\{t\("chat\.report\.of"\)\.replace\("\{name\}", m\.sender\?\.name \|\| t\("community\.thisUser"\)\)\}/);
            expect(btn).not.toMatch(HANGUL);
        });

        it("누를 자리는 가로 44px — 그림은 작게 두고 before 로 넓힌다(왼쪽은 말풍선과의 틈까지만)", () => {
            expect(cls).toContain("relative");
            expect(cls).toContain("before:absolute");
            const left = px(/before:-left-(\d+(?:\.\d+)?)/), right = px(/before:-right-(\d+(?:\.\d+)?)/);
            expect(px(/(?:^| )w-(\d+(?:\.\d+)?)(?: |$)/) + left + right).toBeGreaterThanOrEqual(44);
            // 말풍선과 시각 칸 사이 틈(gap-1.5 = 6px)을 넘지 않는다 — 넘으면 말풍선 가장자리를 눌러도 신고가 열린다
            expect(src).toContain('<div className={cn("flex items-end gap-1.5", mine');
            expect(left).toBeLessThanOrEqual(6);
        });

        it("세로는 위아래 글의 ⋯ 와 겹치지 않는 한도 안에서 가장 크게", () => {
            // 한 줄 말풍선: 위아래 여백 py-2(16) + 14px 글자 × leading-snug(1.375) = 35.25px.
            // 이어 보낸 글 사이 간격: 목록의 space-y-1.5(6px) — 말풍선 줄의 mt-0.5 는 그 여백과 겹쳐 6px 그대로다.
            expect(src).toContain('"px-3 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words select-none"');
            expect(src).toContain('className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5"');
            const BUBBLE = 16 + 14 * 1.375, PITCH = BUBBLE + 6;
            const h = px(/(?:^| )h-(\d+(?:\.\d+)?)(?: |$)/);
            const height = h + px(/before:-top-(\d+(?:\.\d+)?)/) + px(/before:-bottom-(\d+(?:\.\d+)?)/);
            expect(height).toBeLessThanOrEqual(PITCH);
            expect(height).toBeGreaterThanOrEqual(40);
            // 그림(⋯) + 틈(gap-0.5) + 시각 한 줄(10.5px) + 아래 여백(mb-0.5)이 한 줄 말풍선보다 크지 않다 — 줄 높이를 늘리지 않는다
            expect(meta).toContain("gap-0.5");
            expect(src).toContain('<span className="text-[10.5px] text-ink-4">{m.pending ? "…" : timeLabel(m.createdAt, locale)}</span>');
            expect(h + 2 + 10.5 + 2).toBeLessThanOrEqual(BUBBLE);
        });
    });

    it("길게 누르기: 지울 수 있는 글(내 글·운영진)은 예전대로 삭제, 그 밖의 남의 글은 신고", () => {
        expect(src).toContain("const act = onDelete && canDelete?.(m) ? onDelete : canReport(m) ? onReport : undefined;");
        expect(src).toContain("holdRef.current = setTimeout(() => { holdRef.current = null; act(m); }, 600);");
    });

    it("우클릭도 같은 순서 — 삭제가 먼저, 아니면 신고", () => {
        const ctx = between(src, "const onContext = ", "\n    };");
        expect(ctx).toContain("e.preventDefault();");
        expect(ctx).toMatch(/if \(canDelete\?\.\(m\)\) onDelete\?\.\(m\);\s*else if \(canReport\(m\)\) onReport\?\.\(m\);/);
    });

    it("글 말풍선과 카드 말풍선 둘 다 길게 누르기·우클릭을 받는다", () => {
        expect(src.match(/onPointerDown=\{\(\) => holdStart\(m\)\}/g)).toHaveLength(2);
        expect(src.match(/onContextMenu=\{\(e\) => onContext\(e, m\)\}/g)).toHaveLength(2);
    });
});

describe("(나) 대화방(chat-room) — 방 종류별 신고 대상", () => {
    const src = code(client("pages/hiq/chat-room.tsx"));
    const fn = between(src, "function reportTargetFor(", "\n}\n");
    const dialog = /<ReportDialog[\s\S]*?\/>/.exec(src)?.[0] ?? "";

    it("크루 방은 그 메시지를 신고한다 — crew_chat + 메시지 id + 크루 id", () => {
        expect(fn).toMatch(/if \(room\.kind === "crew"\) return \{ targetType: "crew_chat", targetId: msg\.id, crewId: room\.crewId \?\? room\.id, /);
    });

    it("조인/부킹·1:1 방은 보낸 사람을 신고한다 — member + 보낸 사람 id", () => {
        expect(fn).toMatch(/return \{ targetType: "member", targetId: msg\.senderId, /);
        // 차단할 사람은 어느 방이든 보낸 사람
        expect(fn).toContain("const author = { authorId: msg.senderId, authorName: msg.sender?.name };");
    });

    it("문의 방과 보낸 사람 없는 글(시스템)은 대상이 아니다", () => {
        expect(fn).toContain('if (room.kind === "support" || !msg.senderId) return null;');
    });

    it("서버가 받는 타입만 쓴다 — 메시지 단위 타입(chat_message)을 지어내지 않는다", () => {
        const used = Array.from(fn.matchAll(/targetType: "([a-z_]+)"/g)).map((m) => m[1]).sort();
        expect(used).toEqual(["crew_chat", "member"]);
        for (const type of used) expect(REPORT_TARGET_TYPES as readonly string[], type).toContain(type);
    });

    it("문의 방에는 입구를 아예 안 넘긴다 — 말풍선에도, 참여자 줄에도", () => {
        expect(src).toContain('const canReport = !!d && d.kind !== "support" && !!member;');
        expect(src).toContain("onReport={canReport ? openReport : undefined}");
        expect(src).toContain("reportable={canReport}");
        expect(src).toContain("const reportTarget = canReport && reportMsg ? reportTargetFor(d, reportMsg) : null;");
    });

    it("고른 메시지로 [신고] [차단하기] 시트를 띄우고, 신고는 신고 창으로 잇는다", () => {
        expect(src).toContain("const openReport = useCallback((m: ChatMsg) => { setReportMsg(m); setReportMenuOpen(true); }, []);");
        const sheet = /<ChatReportSheet[\s\S]*?\/>/.exec(src)?.[0] ?? "";
        expect(sheet).toContain("open={reportMenuOpen && !!reportTarget}");
        expect(sheet).toContain("onReport={() => { setReportMenuOpen(false); setReportDialogOpen(true); }}");
        expect(sheet).toContain("onBlock={() => void askBlock()}");
    });

    it("신고 창에 그 대상을 그대로 넘긴다(차단 단추도 뜨게 보낸 사람 id 까지)", () => {
        expect(dialog).toContain("targetType={reportTarget.targetType}");
        expect(dialog).toContain("targetId={reportTarget.targetId}");
        expect(dialog).toContain("crewId={reportTarget.crewId}");
        expect(dialog).toContain("targetAuthorId={reportTarget.authorId}");
        expect(dialog).toContain("targetAuthorName={reportTarget.authorName}");
    });

    it("차단하면 그 사람 글을 바로 걷는다 — 시트의 차단·신고 창의 차단·참여자 줄의 차단 모두", () => {
        expect(src).toContain("const dropSender = useCallback((senderId: string) => setMessages((cur) => cur.filter((x) => x.senderId !== senderId)), []);");
        expect(src).toMatch(/blockSender\.mutate\(authorId, \{ onSuccess: \(\) => \{ dropSender\(authorId\); /);
        expect(dialog).toContain("onBlocked={() => dropSender(reportTarget.authorId)}");
        expect(src).toContain("reportable={canReport} onBlocked={dropSender}");
    });

    it("차단은 앱 확인창으로 묻는다 — 네이티브 confirm/alert 없음", () => {
        const ask = between(src, "const askBlock = async () => {", "\n    };");
        expect(ask).toMatch(/await appConfirm\(\{ message: blockConfirmText\(t, reportTarget\.targetType, reportTarget\.authorName\), tone: "danger", confirmText: t\("community\.blockMenu"\) \}\)/);
        for (const p of ["pages/hiq/chat-room.tsx", "components/hiq/chat/ChatRoom.tsx", "components/hiq/chat/ChatMenuSheet.tsx"]) {
            expect(code(client(p)), p).not.toMatch(/(?<![\w.])(?:window\.)?(?:confirm|alert)\(/);
        }
    });

    it("방을 옮기면 앞 방에서 고른 메시지를 버린다(같은 화면이 방→방으로 재사용된다)", () => {
        expect(src).toContain("useEffect(() => { setReportMsg(null); setReportMenuOpen(false); setReportDialogOpen(false); }, [key]);");
    });
});

describe("서버 계약 — 화면이 보내는 타입을 서버가 받는다(서버는 고치지 않았다)", () => {
    it("크루 메시지(crew_chat)는 크루 신고 주소가 받고, 이 크루의 메시지인지 확인한다", () => {
        expect(isCrewReportTarget("crew_chat")).toBe(true);
        const crew = root("server/routes/modules/crew.ts");
        const check = between(crew, 'case "crew_chat": {', "}");
        expect(check).toContain("storage.getCrewChat(id)");
        expect(check).toContain("ch.crewId === crewId ? ch.senderId : null");
    });

    it("회원(member)은 커뮤니티 신고 주소가 받는다 — crew_* 는 거기서 안 받는다", () => {
        expect(isCrewReportTarget("member")).toBe(false);
        const targets = /const REPORT_TARGETS = \[([^\]]+)\]/.exec(root("server/routes/modules/community.ts"))?.[1] ?? "";
        expect(targets).toContain('"member"');
        expect(targets).not.toContain("crew_");
    });

    it("신고 창이 타입에 따라 주소를 가른다", () => {
        const dialog = client("components/hiq/community/ReportDialog.tsx");
        expect(dialog).toContain('const isCrewTarget = (t: ReportTargetType) => t.startsWith("crew_");');
        expect(dialog).toContain('apiRequest(isCrewTarget(targetType) ? `/api/hiq/crews/${crewId}/reports` : "/api/hiq/community/reports"');
    });
});

describe("(다) ⋯ 메뉴의 참여자 줄(ChatMenuSheet) — 회원 신고·차단", () => {
    const src = code(client("components/hiq/chat/ChatMenuSheet.tsx"));
    const list = between(src, "{members.map((m, i) => (", "\n                                ))}");
    const menu = /<UgcActionMenu[\s\S]*?\/>/.exec(list)?.[0] ?? "";

    it("내가 아닌 사람 줄에만 둔다 — 문의 방(reportable 아님)에는 없다", () => {
        expect(list).toContain("{reportable && !!meId && m.id !== meId && (");
        expect(menu).not.toBe("");
    });

    it("회원 신고·차단 메뉴 — 대상도 차단할 사람도 그 참여자", () => {
        expect(menu).toContain('targetType="member"');
        expect(menu).toContain("targetId={m.id}");
        expect(menu).toContain("authorId={m.id}");
        expect(menu).toContain("authorName={m.name}");
        expect(menu).toContain("onBlocked={() => onBlocked?.(m.id)}");
    });

    it("누를 자리 44px", () => {
        expect(menu).toMatch(/ className="[^"]*\bw-11 h-11\b/);
    });

    describe("메뉴가 잘리지 않는다", () => {
        // 화면의 규칙 — 아래에서 같은 식으로 자리를 검산한다. 규칙을 바꾸면 이 식과 검산을 같이 고친다.
        const RULE = 'index > 0 && index >= count - 2 ? "top" : "bottom"';
        const side = (index: number, count: number): "top" | "bottom" => (index > 0 && index >= count - 2 ? "top" : "bottom");
        const scrollFrom = Number(/const MEMBER_SCROLL_FROM = (\d+);/.exec(src)?.[1] ?? NaN);

        it("시트 아래쪽 줄은 위로 연다(side=top), 첫 줄은 늘 아래로", () => {
            expect(src).toContain(`const memberMenuSide = (index: number, count: number): "top" | "bottom" => (${RULE});`);
            expect(menu).toContain("side={memberMenuSide(i, members.length)}");
            expect(side(0, 2)).toBe("bottom");
            expect(side(1, 2)).toBe("top");
            expect(side(0, 30)).toBe("bottom");
            expect(side(27, 30)).toBe("bottom");
            expect(side(28, 30)).toBe("top");
            expect(side(29, 30)).toBe("top");
        });

        it("검산에 쓰는 치수가 소스와 같다", () => {
            // UgcActionMenu: 메뉴는 ⋯ 상자에서 36px(top-9/bottom-9) 떨어져 펼쳐지고, 44px 줄 둘(+테두리)이다
            const ugc = client("components/hiq/community/UgcActionMenu.tsx");
            expect(ugc).toContain('side === "top" ? "bottom-9" : "top-9"');
            expect(ugc.match(/role="menuitem"/g)).toHaveLength(2);
            expect(ugc.match(/className="w-full h-11 /g)).toHaveLength(2);
            // ChatMenuSheet: 줄 54px, 4명부터 스크롤 상자(아래 여백 8px), 그 아래는 상자 없이 아래 여백 24px
            expect(list).toContain('className="flex items-center gap-3 px-4 h-[54px]"');
            expect(scrollFrom).toBe(4);
            expect(src).toContain('members.length >= MEMBER_SCROLL_FROM ? "pb-2 max-h-[52vh] overflow-y-auto" : "pb-6"');
            // 뒤로 줄: pt-2(8) + 단추 h-9(36) + pb-1(4) = 48px
            expect(src).toContain('<div className="flex items-center gap-1 px-2 pt-2 pb-1">');
            // 시트 아래 여백 0.75rem(12px) + 안전 영역
            expect(src).toContain("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
        });

        it("명단 카드에 overflow-hidden 이 없다 — 있으면 메뉴가 카드 밖에서 잘린다", () => {
            const card = /<div className="([^"]*)">\s*\{members\.map\(/.exec(src)?.[1] ?? "";
            expect(card).toContain("rounded-2xl");
            expect(card).not.toContain("overflow-hidden");
        });

        const ROW = 54, TRIGGER = 44, OFFSET = 36, MENU = 44 * 2 + 2, HEADER = 48;
        /** 명단 맨 위를 0 으로 본 메뉴의 위·아래 끝 */
        const menuSpan = (i: number, n: number) => {
            const boxTop = ROW * i + (ROW - TRIGGER) / 2;
            const top = side(i, n) === "bottom" ? boxTop + OFFSET : boxTop + TRIGGER - OFFSET - MENU;
            return { top, bottom: top + MENU };
        };

        it("2명부터 60명까지, 어느 줄에서 열어도 메뉴가 명단 안에 들어온다 — 상자 안이면 밀어서 다 꺼낼 수 있는 자리다", () => {
            for (let n = 2; n <= 60; n++) {
                // 스크롤 상자가 있으면 그 안(명단 + 아래 여백 8px)이 한계다. 없으면 위로는 뒤로 줄까지, 아래로는 여백 24px + 시트 여백 12px 까지.
                // 상자가 없는 방(3명 이하)은 이 한계가 곧 보이는 자리다. 상자가 있는 방은 '보이는 창'을 아래 시험이 따로 본다.
                const boxed = n >= scrollFrom;
                const min = boxed ? 0 : -HEADER;
                const max = ROW * n + (boxed ? 8 : 24 + 12);
                for (let i = 0; i < n; i++) {
                    const { top, bottom } = menuSpan(i, n);
                    expect(top, `${n}명 중 ${i + 1}번째 줄 — 위`).toBeGreaterThanOrEqual(min);
                    expect(bottom, `${n}명 중 ${i + 1}번째 줄 — 아래`).toBeLessThanOrEqual(max);
                }
            }
        });

        it("열면 스크롤 상자를 밀어 메뉴를 다 보이게 한다 — 소스", () => {
            // 스크롤 상자에 ref 를 달고(클래스는 그대로), 메뉴가 열릴 때 그 상자 안에서 메뉴를 찾아 넘친 만큼만 민다
            expect(src).toContain("const listRef = useRef<HTMLDivElement>(null);");
            expect(src).toContain('<div ref={listRef} className={cn("px-3", members.length >= MEMBER_SCROLL_FROM ? "pb-2 max-h-[52vh] overflow-y-auto" : "pb-6")}>');
            expect(menu).toContain("onOpenChange={revealMemberMenu}");
            const reveal = between(src, "const revealMemberMenu = (opened: boolean) => {", "\n    };");
            expect(reveal).toContain("if (!opened) return;");
            expect(reveal).toContain("requestAnimationFrame(() => {");
            expect(reveal).toContain(`const menu = box?.querySelector('[role="menu"]');`);
            expect(reveal).toContain("if (at.bottom > view.bottom) box.scrollTop += at.bottom - view.bottom + 8;");
            expect(reveal).toContain("else if (at.top < view.top) box.scrollTop -= view.top - at.top + 8;");
            // 메뉴는 열릴 때 알려 주고(onOpenChange), 그 메뉴가 role="menu" 다
            const ugc = client("components/hiq/community/UgcActionMenu.tsx");
            expect(ugc).toContain("const setMenuOpen = (o: boolean) => { setInnerOpen(o); onOpenChange?.(o); };");
            expect(ugc).toContain('role="menu"');
        });

        it("보이는 창(52vh)으로 검산 — 밀기 전에는 잘리는 줄이 있고, 민 뒤에는 어느 화면·어느 줄에서도 통째로 보인다", () => {
            const PAD = 8;   // 스크롤 상자 아래 여백(pb-2)
            const NUDGE = 8; // revealMemberMenu 가 더 미는 여유
            let opened = 0, clippedBefore = 0;
            const stillClipped: string[] = [];
            for (const vh of [568, 667, 700, 740, 844, 932]) {
                for (let n = scrollFrom; n <= 60; n++) {
                    const content = ROW * n + PAD;
                    const win = Math.min(content, Math.floor(vh * 0.52));
                    // 메뉴가 창보다 크면 밀어도 다 안 보인다
                    expect(MENU + NUDGE, `${vh}px 창`).toBeLessThanOrEqual(win);
                    const maxScroll = content - win;
                    // 스크롤 위치를 한 줄의 1/3 씩 옮겨 가며, 창에 ⋯ 가 보이는(누를 수 있는) 줄을 모두 열어 본다
                    for (let s = 0; ; s = Math.min(maxScroll, s + ROW / 3)) {
                        for (let i = 0; i < n; i++) {
                            const trigTop = ROW * i + (ROW - TRIGGER) / 2;
                            if (trigTop + TRIGGER <= s || trigTop >= s + win) continue;
                            opened++;
                            const { top, bottom } = menuSpan(i, n);
                            if (top < s || bottom > s + win) clippedBefore++;
                            // revealMemberMenu 와 같은 셈(브라우저가 scrollTop 을 0~끝으로 묶는다)
                            let after = s;
                            if (bottom > s + win) after = s + (bottom - (s + win)) + NUDGE;
                            else if (top < s) after = s - (s - top + NUDGE);
                            after = Math.max(0, Math.min(maxScroll, after));
                            if (top < after || bottom > after + win) stillClipped.push(`${vh}px · ${n}명 중 ${i + 1}번째 줄 · 스크롤 ${Math.round(s)}`);
                        }
                        if (s >= maxScroll) break;
                    }
                }
            }
            expect(opened).toBeGreaterThan(10_000);
            expect(stillClipped).toEqual([]);
            // 이 검산이 헛돌지 않는다 — 밀지 않으면 실제로 잘리는 줄이 있다(700px 화면 10명 방의 7번째 줄 등)
            expect(clippedBefore).toBeGreaterThan(0);
            const win700 = Math.floor(700 * 0.52);
            expect(menuSpan(6, 10).top).toBeGreaterThanOrEqual(win700);          // 통째로 창 밖
            expect(menuSpan(5, 10).bottom).toBeGreaterThan(win700);              // '차단하기' 줄이 잘린다
        });
    });
});

describe("메시지 신고·차단 시트(ChatReportSheet) — [신고] [차단하기]", () => {
    const src = code(client("components/hiq/chat/ChatMenuSheet.tsx"));
    const sheet = src.slice(src.indexOf("export function ChatReportSheet("));

    it("신고와 차단이 한 화면에 나란히 — 차단을 신고 창 안에만 숨기지 않는다", () => {
        expect(sheet).toContain('<Row Icon={LucideFlag} label={t("community.report")} onClick={onReport} />');
        expect(sheet).toContain('<Row Icon={LucideBan} label={t("community.blockMenu")} danger busy={busy} onClick={onBlock} />');
        expect(sheet.indexOf("LucideFlag")).toBeLessThan(sheet.indexOf("LucideBan"));
    });

    it("누구 것인지 알리고(화면·읽어 주기 둘 다), 취소로 닫는다", () => {
        expect(sheet).toContain('const who = t("chat.report.of").replace("{name}", name);');
        expect(sheet).toContain('<SheetTitle>{t("chat.report.title")}</SheetTitle>');
        // 보이는 한 줄이 곧 시트 설명이다 — sr-only 머리줄 안에 숨기지 않는다
        const desc = /<SheetDescription className="([^"]*)">\{who\}<\/SheetDescription>/.exec(sheet)?.[1] ?? "";
        expect(desc).not.toBe("");
        expect(desc).not.toContain("sr-only");
        expect(between(sheet, '<SheetHeader className="sr-only">', "</SheetHeader>")).not.toContain("SheetDescription");
        expect(sheet).toContain('{t("common.cancel")}');
    });

    it("문구를 화면에 박지 않았다(사전 키로만)", () => {
        expect(sheet).not.toMatch(HANGUL);
    });
});

describe("(라) 문구 — 다섯 언어 사전", () => {
    const LOCALES = ["ko", "en", "es", "vi", "tr"] as const;
    const dict = (l: string) => client(`lib/i18n/${l}.ts`);
    const value = (l: string, key: string) => new RegExp(`^\\s*"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)",?\\s*$`, "m").exec(dict(l))?.[1];

    it("새 키(chat.report.*)가 다섯 언어에 다 있고, 언어마다 한 번씩만 있다", () => {
        const keys = (l: string) => Array.from(dict(l).matchAll(/"(chat\.report\.[A-Za-z]+)":/g)).map((m) => m[1]).sort();
        for (const l of LOCALES) expect(keys(l), l).toEqual(["chat.report.of", "chat.report.title"]);
    });

    it("화면이 쓰는 키가 다섯 언어에 다 있다 — 신고·차단은 있던 키를 다시 쓴다", () => {
        const used = [
            "chat.report.title", "chat.report.of",
            "community.report", "community.blockMenu", "community.thisUser", "community.blockConfirmCrew", "community.more", "common.cancel",
        ];
        for (const l of LOCALES) for (const k of used) expect((value(l, k) ?? "").trim(), `${l} ${k}`).not.toBe("");
    });

    it("이름 자리({name})를 다섯 언어가 다 쓴다", () => {
        for (const l of LOCALES) {
            expect(value(l, "chat.report.of"), l).toContain("{name}");
            expect(value(l, "chat.report.title"), l).not.toContain("{");
        }
    });

    it("한국어가 아닌 사전에 한국어가 섞이지 않았다", () => {
        for (const l of LOCALES) {
            if (l === "ko") continue;
            for (const k of ["chat.report.title", "chat.report.of"]) expect(value(l, k), `${l} ${k}`).not.toMatch(HANGUL);
        }
    });
});
