import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    MEMBER_SEARCH_LIMIT, MEMBER_SEARCH_MAX, SUPPORT_TEAM_ID,
    collapseSupportReads, escapeLike, isWithdrawnMember, maskSupportMembers, maskSupportMessages, memberSearchTerm,
    phoneLast4, supportHidesSender, supportNotifyTitleKey, supportPreviewSender, toAdminMemberHit,
} from "./chatSupport";
import { ko as serverKo } from "./i18n/ko";
import { en as serverEn } from "./i18n/en";
import { es as serverEs } from "./i18n/es";
import { vi as serverVi } from "./i18n/vi";
import { tr as serverTr } from "./i18n/tr";

/**
 * 2026-10-06 — 운영자가 회원에게 먼저 말 걸기(오너: "관리자는 누구와도 다 채팅을 할 수 있게").
 * 문의 방(support:<회원 id>)을 거꾸로도 쓴다. 여기서는 DB 없이 볼 수 있는 것을 본다:
 *  (가) 규칙 함수 — 회원에게 운영자는 '랭큐 운영팀' 한 사람(이름·사진·회원 id·읽은 시각), 알림 제목 분기, 회원 찾기 검색어.
 *  (나) 화면 소스 — 채팅 탭 단추가 운영자 조건 안에 있고, 회원 찾기는 전체 화면 층이고, 어드민 회원 상세에 '메시지' 단추가 있다
 *       (화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim·golf 만 읽는다).
 *  (다) 문구 — 화면 사전·서버 사전 다섯 언어.
 * 진짜 저장소가 만드는 SQL 과 가리기는 server/storage/chat.repo.support.test.ts, 라우트 권한·알림은 server/routes/modules/chatSupport.test.ts.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
/** 주석만 있는 줄을 뺀다 — 주석 속 낱말이 검사를 통과시키지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEAM = "랭큐 운영팀";

describe("(가-1) 회원에게 운영자는 '랭큐 운영팀' 한 사람", () => {
    const rows = [
        { id: "m1", senderId: OWNER, message: "안 돼요", sender: { name: "김회원", profileImageUrl: "https://img/owner.webp" } },
        { id: "m2", senderId: ADMIN_A, message: "확인해 볼게요", sender: { name: "최운영", profileImageUrl: "https://img/a.webp" } },
        { id: "m3", senderId: null, message: "시스템", sender: null },
        { id: "m4", senderId: ADMIN_B, message: "고쳤습니다", sender: { name: "박관리", profileImageUrl: null } },
    ];

    it("운영자 글은 이름·사진·회원 id 가 모두 바뀐다 — 회원 글과 시스템 글은 그대로", () => {
        const out = maskSupportMessages(rows, OWNER, TEAM);
        expect(out[0]).toEqual(rows[0]);
        expect(out[2]).toEqual(rows[2]);
        for (const i of [1, 3]) {
            expect(out[i].senderId).toBe(SUPPORT_TEAM_ID);
            expect(out[i].sender).toEqual({ name: TEAM, profileImageUrl: null });
            expect(out[i].message).toBe(rows[i].message);
            expect(out[i].id).toBe(rows[i].id);
        }
        // 응답 어디에도 운영자 개인 정보가 남지 않는다
        const json = JSON.stringify(out);
        for (const leak of ["최운영", "박관리", ADMIN_A, ADMIN_B, "https://img/a.webp"]) expect(json, leak).not.toContain(leak);
        // 운영자 둘의 글이 같은 보낸 사람으로 묶인다(화면은 senderId 가 같으면 한 사람으로 그린다)
        expect(out[1].senderId).toBe(out[3].senderId);
    });

    it("원본을 바꾸지 않는다", () => {
        const before = JSON.stringify(rows);
        maskSupportMessages(rows, OWNER, TEAM);
        expect(JSON.stringify(rows)).toBe(before);
    });

    it("운영팀 id 는 회원 id(uuid)와 겹칠 수 없다", () => {
        expect(SUPPORT_TEAM_ID).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("참여자 명단 — [회원 본인, 운영팀] 둘. 운영자가 몇 명이든 같다", () => {
        const members = [
            { id: ADMIN_A, name: "최운영", profileImageUrl: "https://img/a.webp" },
            { id: OWNER, name: "김회원", profileImageUrl: null },
            { id: ADMIN_B, name: "박관리", profileImageUrl: null },
        ];
        expect(maskSupportMembers(members, OWNER, TEAM)).toEqual([
            { id: OWNER, name: "김회원", profileImageUrl: null },
            { id: SUPPORT_TEAM_ID, name: TEAM, profileImageUrl: null },
        ]);
        // 운영자가 한 명도 없어도(명단 조회가 비어도) 운영팀 줄은 있다 — 방의 상대가 누구인지는 보여야 한다
        expect(maskSupportMembers([members[1]], OWNER, TEAM)).toHaveLength(2);
    });

    it("읽은 시각 — 운영자들의 커서를 운영팀 하나로(가장 늦게 읽은 시각). 운영자 id 는 나가지 않는다", () => {
        const reads = [
            { id: OWNER, at: "2026-10-06T01:00:00.000Z" },
            { id: ADMIN_A, at: "2026-10-06T02:00:00.000Z" },
            { id: ADMIN_B, at: "2026-10-06T03:30:00.000Z" },
        ];
        expect(collapseSupportReads(reads, OWNER)).toEqual([
            { id: OWNER, at: "2026-10-06T01:00:00.000Z" },
            { id: SUPPORT_TEAM_ID, at: "2026-10-06T03:30:00.000Z" },
        ]);
        // 운영자 중 아무도 안 읽었으면 운영팀 줄이 없다 = 화면이 '안 읽음 1'로 센다
        expect(collapseSupportReads([reads[0]], OWNER)).toEqual([reads[0]]);
        expect(collapseSupportReads([], OWNER)).toEqual([]);
    });

    it("방 목록 미리보기의 이름 — 운영자 글이면 운영팀, 내 글이면 내 이름, 시스템 글이면 없음", () => {
        expect(supportPreviewSender(ADMIN_A, OWNER, "최운영", TEAM)).toBe(TEAM);
        expect(supportPreviewSender(OWNER, OWNER, "김회원", TEAM)).toBe("김회원");
        expect(supportPreviewSender(null, OWNER, null, TEAM)).toBeNull();
    });
});

describe("(가-2) 알림 — 제목 분기와 본문의 이름", () => {
    it("회원이 쓰면 운영자들에게 '문의'", () => {
        expect(supportNotifyTitleKey({ senderIsOwner: true, recipientIsOwner: false, ownerHasWritten: true })).toBe("notif.chat.supportInquiry.title");
    });
    it("운영자가 썼고 회원이 이 방에 쓴 적이 있으면 회원에게 '답변'", () => {
        expect(supportNotifyTitleKey({ senderIsOwner: false, recipientIsOwner: true, ownerHasWritten: true })).toBe("notif.chat.supportReply.title");
    });
    it("운영자가 먼저 말을 걸었으면(회원의 글이 없다) 회원에게 '랭큐 운영팀 메시지'", () => {
        expect(supportNotifyTitleKey({ senderIsOwner: false, recipientIsOwner: true, ownerHasWritten: false })).toBe("notif.chat.supportTeam.title");
    });
    it("다른 운영자에게는 어느 경우든 예전 그대로 '답변'", () => {
        for (const ownerHasWritten of [true, false]) {
            expect(supportNotifyTitleKey({ senderIsOwner: false, recipientIsOwner: false, ownerHasWritten })).toBe("notif.chat.supportReply.title");
        }
    });
    it("본문에서 보낸 사람 이름을 빼는 것은 '문의 방 · 운영자가 씀 · 받는 사람이 그 방의 회원' 일 때뿐", () => {
        const room = { kind: "support", id: OWNER };
        expect(supportHidesSender(room, ADMIN_A, OWNER)).toBe(true);
        expect(supportHidesSender(room, ADMIN_A, ADMIN_B)).toBe(false); // 운영자끼리는 누가 답했는지 본다
        expect(supportHidesSender(room, OWNER, ADMIN_A)).toBe(false);   // 회원의 문의는 이름이 붙어 간다
        expect(supportHidesSender({ kind: "dm", id: OWNER }, ADMIN_A, OWNER)).toBe(false);
        expect(supportHidesSender({ kind: "crew", id: OWNER }, ADMIN_A, OWNER)).toBe(false);
    });
});

describe("(가-3) 회원 찾기 — 검색어·이스케이프·탈퇴·전화 끝자리", () => {
    it("2글자부터 — 그보다 짧거나 글자가 아니면 null(서버는 DB 를 부르지 않는다)", () => {
        expect(memberSearchTerm("김")).toBeNull();
        expect(memberSearchTerm("  김  ")).toBeNull();
        expect(memberSearchTerm("")).toBeNull();
        expect(memberSearchTerm(undefined)).toBeNull();
        expect(memberSearchTerm(["김철", "수"])).toBeNull(); // ?q=a&q=b
        expect(memberSearchTerm({ $ne: "" })).toBeNull();
        expect(memberSearchTerm(12)).toBeNull();
        expect(memberSearchTerm("김철")).toBe("김철");
    });
    it("앞뒤 공백을 걷고 겹친 공백은 한 칸으로, 30자에서 자른다(글자 수로 센다)", () => {
        expect(memberSearchTerm("  김   철수 ")).toBe("김 철수");
        const long = "가".repeat(80);
        expect(Array.from(memberSearchTerm(long)!)).toHaveLength(MEMBER_SEARCH_MAX);
        // 이모지 둘도 두 글자다(UTF-16 길이로 세면 한 글자짜리가 통과한다)
        expect(memberSearchTerm("😀")).toBeNull();
        expect(memberSearchTerm("😀😀")).toBe("😀😀");
    });
    it("LIKE 의 %·_·\\ 는 글자 그대로 찾는다", () => {
        expect(escapeLike("100%")).toBe("100\\%");
        expect(escapeLike("a_b")).toBe("a\\_b");
        expect(escapeLike("a\\b")).toBe("a\\\\b");
        expect(escapeLike("%%")).toBe("\\%\\%");
        expect(escapeLike("김철수")).toBe("김철수");
        // 따옴표는 건드리지 않는다 — 값은 파라미터로 넘어가므로 이스케이프할 것이 아니다(문장에 이어 붙이지 않는다)
        expect(escapeLike("o'brien")).toBe("o'brien");
    });
    it("탈퇴회원 — 번호가 del- 자리표시자일 때만. 이름으로는 보지 않는다(이름은 회원이 바꿀 수 있다)", () => {
        const row = (name: string, phone: unknown) => ({ name, phone });
        expect(isWithdrawnMember(row("탈퇴회원", "del-0b0e6f0e-8a3"))).toBe(true);
        expect(isWithdrawnMember(row("어드민이 고친 이름", "del-0b0e6f0e-8a3"))).toBe(true);
        // 살아 있는 회원이 이름만 '탈퇴회원'으로 바꿨다 — 탈퇴회원이 아니다(예전엔 운영자가 이 회원의 문의에 답하지 못했다)
        expect(isWithdrawnMember(row("탈퇴회원", "01012345678"))).toBe(false);
        expect(isWithdrawnMember(row("탈퇴회원", "social:google:abcdef"))).toBe(false);
        expect(isWithdrawnMember(row("김회원", "01012345678"))).toBe(false);
        expect(isWithdrawnMember(row("김회원", "social:kakao:abcdef"))).toBe(false);
        // 번호가 글자가 아니거나 없으면 탈퇴로 보지 않는다
        expect(isWithdrawnMember(row("탈퇴회원", null))).toBe(false);
        expect(isWithdrawnMember({})).toBe(false);
        expect(isWithdrawnMember(null)).toBe(false);
        expect(isWithdrawnMember(undefined)).toBe(false);
    });
    it("전화는 끝 4자리만 — 소셜·탈퇴 자리표시자와 짧은 값은 없음", () => {
        expect(phoneLast4("01012345678")).toBe("5678");
        expect(phoneLast4("010-1234-5678")).toBe("5678");
        expect(phoneLast4("+82 10 1234 5678")).toBe("5678");
        expect(phoneLast4("social:google:1234567890")).toBeNull();
        expect(phoneLast4("del-0b0e6f0e-8a3")).toBeNull();
        expect(phoneLast4("123")).toBeNull();
        expect(phoneLast4("")).toBeNull();
        expect(phoneLast4(null)).toBeNull();
    });
    it("한 줄 모양 — 번호 전체·역할 원문·프로필 id 는 싣지 않는다", () => {
        const PROFILE = "99999999-9999-4999-8999-999999999999";
        const hit = toAdminMemberHit({
            id: OWNER, name: "김회원", phone: "010-1234-5678", createdAt: new Date("2026-09-01T03:00:00.000Z"), primarySport: "GOLF",
            nickname: "버디킴", profileImageUrl: "https://img/owner.webp", status: "banned", role: "user",
            profileId: PROFILE, storeName: "랭큐", storeSlug: "hiq",
        });
        expect(hit).toEqual({
            id: OWNER, name: "김회원", nickname: "버디킴", profileImageUrl: "https://img/owner.webp",
            joinedAt: "2026-09-01T03:00:00.000Z", phoneLast4: "5678", sport: "GOLF", banned: true, staff: false,
            store: null, noAccount: false,
        });
        expect(JSON.stringify(hit)).not.toContain("1234-5678");
        expect(JSON.stringify(hit)).not.toContain(PROFILE);
        for (const k of ["phone", "role", "profileId", "storeSlug", "storeName"]) expect(Object.keys(hit), k).not.toContain(k);
    });
    it("닉네임은 이름과 다를 때만, 프로필 없는 회원(매장 등록)도 깨지지 않는다", () => {
        expect(toAdminMemberHit({ id: OWNER, name: "김회원", nickname: "김회원" }).nickname).toBeNull();
        expect(toAdminMemberHit({ id: OWNER, name: "김회원", nickname: "  " }).nickname).toBeNull();
        const bare = toAdminMemberHit({ id: OWNER, name: "김회원", phone: "social:kakao:x", createdAt: null, primarySport: null, nickname: null, profileImageUrl: null, status: null, role: null });
        expect(bare).toEqual({ id: OWNER, name: "김회원", nickname: null, profileImageUrl: null, joinedAt: null, phoneLast4: null, sport: null, banned: false, staff: false, store: null, noAccount: true });
        expect(toAdminMemberHit({ id: ADMIN_A, name: "최운영", role: "super_admin" }).staff).toBe(true);
        expect(toAdminMemberHit({ id: ADMIN_A, name: "최운영", role: "admin" }).staff).toBe(true);
        expect(toAdminMemberHit({ id: ADMIN_A, name: "최운영", role: "store_owner" }).staff).toBe(false);
    });
    it("어느 행인지 — 매장에서 가입한 행에는 매장 이름, 본 사이트·글로벌 행에는 없다", () => {
        const of = (storeSlug: string | null, storeName: string | null) => toAdminMemberHit({ id: OWNER, name: "김회원", profileId: "p1", storeSlug, storeName }).store;
        // 앱이 로그인하는 행(전화 가입 = hiq, 소셜 가입 = global)은 표시가 없다 — 표시 없는 줄이 '고를 줄'이다
        expect(of("hiq", "랭큐")).toBeNull();
        expect(of("global", "글로벌")).toBeNull();
        // 제휴 매장 행은 매장 이름. 이름이 비었으면 슬러그라도 보인다(표시가 사라지면 본 사이트 행으로 읽힌다)
        expect(of("star-billiards", "스타당구장")).toBe("스타당구장");
        expect(of("star-billiards", "  ")).toBe("star-billiards");
        expect(of("star-billiards", null)).toBe("star-billiards");
        // 매장을 모르면 지어내지 않는다
        expect(of(null, "스타당구장")).toBeNull();
    });
    it("로그인 계정(프로필)이 없는 행은 표시한다 — 푸시가 가지 않는다", () => {
        expect(toAdminMemberHit({ id: OWNER, name: "김회원", profileId: null, storeSlug: "star-billiards", storeName: "스타당구장" }).noAccount).toBe(true);
        expect(toAdminMemberHit({ id: OWNER, name: "김회원", profileId: "p1", storeSlug: "star-billiards", storeName: "스타당구장" }).noAccount).toBe(false);
    });
    it("최대 20명", () => {
        expect(MEMBER_SEARCH_LIMIT).toBe(20);
    });
});

describe("(나-1) 채팅 탭 — '회원에게 메시지'는 운영자에게만", () => {
    const src = code(client("pages/hiq/chat-hub.tsx"));

    it("운영자 판정은 /me 의 role(profiles.role) — 전화번호·이메일을 적지 않는다", () => {
        expect(src).toContain('const isAdmin = (member as any)?.role === "admin" || (member as any)?.role === "super_admin";');
        expect(src).not.toMatch(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
        expect(src).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    });

    it("단추는 {isAdmin && ( … )} 안에 있고 회원 찾기를 연다", () => {
        const at = src.indexOf("{isAdmin && (");
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, src.indexOf("{!isAdmin && (", at));
        expect(block).toContain("<button");
        expect(block).toContain("onClick={() => setMemberPickerOpen(true)}");
        expect(block).toContain('t("chat.adminMessage")');
        // 운영자 단추는 이 한 곳뿐이다 — 조건 밖에 같은 단추가 또 있으면 일반 회원에게 보인다
        expect(src.split("setMemberPickerOpen(true)").length - 1).toBe(1);
    });

    it("회원 찾기 층도 운영자일 때만 그린다", () => {
        expect(src).toContain("{isAdmin && <AdminMemberPicker open={memberPickerOpen} onOpenChange={setMemberPickerOpen} />}");
        expect(src.split("<AdminMemberPicker").length - 1).toBe(1);
    });

    it("일반 회원의 머리줄은 그대로다 — 운영자 문의 · 새 대화", () => {
        const at = src.indexOf("{!isAdmin && (");
        const block = src.slice(at, src.indexOf("</header>", at));
        expect(block).toContain("setLocation(`/chat/support/${member.id}`)");
        expect(block).toContain('t("chat.support")');
        expect(block).toContain("onClick={() => setPickerOpen(true)}");
        expect(block).toContain('t("chat.newChat")');
    });

    it("종목과 무관하다 — 단추가 golf 조건에 묶여 있지 않다", () => {
        const at = src.indexOf("{isAdmin && (");
        const block = src.slice(at, src.indexOf("{!isAdmin && (", at));
        expect(block).not.toContain("golf");
        expect(block).not.toContain("currentSport");
    });
});

describe("(나-2) 회원 찾기(AdminMemberPicker) — 전체 화면 층", () => {
    const raw = client("components/hiq/chat/AdminMemberPicker.tsx");
    const src = code(raw);

    it("Radix 시트를 쓰지 않는다 — 키보드가 뜰 때 시트가 밀린다(FriendPicker 와 같은 이유)", () => {
        expect(src).not.toContain("@/components/ui/sheet");
        expect(src).not.toContain("<Sheet");
        expect(src).toContain('role="dialog" aria-modal="true"');
        expect(src).toContain("fixed inset-0 z-[60]");
        expect(src).toContain('style={{ paddingBottom: "var(--keyboard-height, 0px)" }}');
        // index.css 의 키보드 회피 규칙(가운데 다이얼로그·아래 시트)에 걸리는 클래스를 층에 달지 않는다
        const panel = /<div ref=\{panelRef\}[^>]*>/.exec(src)?.[0] ?? "";
        expect(panel).not.toContain("bottom-0");
        expect(panel).not.toContain("translate-y-[-50%]");
    });

    it("입력은 디바운스하고, 2글자 규칙은 서버와 같은 함수로 본다", () => {
        expect(src).toContain("const debounced = useDebounce(q, 300);");
        expect(src).toContain('import { MEMBER_SEARCH_LIMIT, memberSearchTerm, type AdminMemberHit } from "@shared/chatSupport";');
        expect(src).toContain("const asked = open ? memberSearchTerm(debounced) : null;");
        expect(src).toContain("/api/hiq/chat/admin/members?q=${encodeURIComponent(asked)}");
    });

    it("안내·기다림·오류(다시 시도)·빈 결과·목록을 각각 그린다", () => {
        expect(src).toContain('t("chat.adminPicker.hint")');
        expect(src).toContain("LucideLoader2");
        expect(src).toContain('res.status === "error"');
        expect(src).toContain('t("chat.adminPicker.failed")');
        expect(src).toContain("onClick={() => setAttempt((n) => n + 1)}");
        expect(src).toContain('t("chat.adminPicker.empty")');
        expect(src).toContain("res.hits.map((h) =>");
        // 줄의 key 는 회원 id — 형제끼리 겹치지 않는다
        expect(src).toContain("<li key={h.id}>");
    });

    it("어느 회원 행인지 가릴 수 있다 — 매장에서 가입한 줄에는 매장 이름, 계정 없는 줄에는 표시, 그리고 고르는 법 한 줄", () => {
        // 같은 사람의 두 줄(본 사이트 행·매장 행)은 닉네임·번호가 같아 이 칸으로만 갈린다. 줄이 잘려도 남게 보조 정보의 맨 앞에 둔다
        const facts = src.slice(src.indexOf("const facts = ["), src.indexOf("].filter((x): x is string => !!x);"));
        const first = facts.split("\n").map((l) => l.trim()).filter(Boolean)[1];
        expect(first).toBe('h.store ? t("chat.adminPicker.store").split("{name}").join(h.store) : null,');
        expect(src).toContain('{h.noAccount && <span');
        expect(src).toContain('{t("chat.adminPicker.noAccount")}');
        // 표시가 달린 줄이 하나라도 있을 때만 안내를 그린다(없으면 소음이다)
        expect(src).toContain("{res.hits.some((h) => !!h.store || h.noAccount) && (");
        expect(src).toContain('{t("chat.adminPicker.rowHint")}');
        // 배지끼리 형제다 — key 가 필요한 목록으로 그리지 않는다(형제 key 겹침 사고 방지)
        expect(src.split("key={").length - 1).toBe(1);
    });

    it("늦게 온 앞 요청의 답을 쓰지 않는다 — 요청마다 끊을 수 있고, 끊긴 답은 버린다", () => {
        expect(src).toContain("const ctrl = new AbortController();");
        expect(src).toContain("return () => ctrl.abort();");
        expect(src.split("if (!ctrl.signal.aborted)").length - 1).toBe(2);
    });

    it("고르면 그 회원의 문의 방으로 — 방을 따로 만들지 않는다", () => {
        expect(src).toContain("setLocation(`/chat/support/${h.id}`)");
        expect(src).not.toContain("/api/hiq/chat/dm");
        expect(src).not.toContain('method: "POST"');
    });

    it("찾은 결과를 React Query 캐시에 넣지 않는다 — 그 캐시는 기기에 7일 저장된다", () => {
        expect(src).not.toContain("useQuery");
        expect(src).not.toContain("@tanstack/react-query");
        expect(src).not.toContain("localStorage");
    });

    it("화면 문구는 전부 사전 키 — 한글을 직접 적지 않는다", () => {
        const jsx = src.slice(src.indexOf("return ("));
        expect(jsx).not.toMatch(/[가-힣]/);
    });
});

describe("(나-3) 어드민 회원 상세 — '메시지' 단추", () => {
    const src = code(client("pages/admin/MemberDetailSheet.tsx"));

    it("탈퇴회원에게는 숨긴다", () => {
        expect(src).toContain('import { isWithdrawnMember } from "@shared/chatSupport";');
        expect(src).toContain("const canMessage = !!m && !isWithdrawnMember(m);");
        const at = src.indexOf("{canMessage && (");
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, src.indexOf("</button>", at));
        expect(block).toContain("<button");
        expect(block).toContain("onClick={() => void openChat()}");
        expect(block).toContain('t("chat.adminMessageShort")');
    });

    it("같은 방으로 간다 — 그 회원의 문의 방", () => {
        expect(src).toContain("setLocation(`/chat/support/${m.id}`);");
    });

    it("가기 전에 방이 열리는지 묻고, 안 열리면 앱 안내창으로 알린다(브라우저 기본 창 금지)", () => {
        const at = src.indexOf("const openChat = async () => {");
        const fn = src.slice(at, src.indexOf("const dirty =", at));
        expect(fn).toContain("await apiRequest(`/api/hiq/chat/rooms/support:${m.id}/info`);");
        expect(fn.indexOf("await apiRequest(")).toBeLessThan(fn.indexOf("setLocation("));
        expect(fn).toContain("void appAlert(");
        expect(fn).toContain('t("chat.adminNeedAppLogin")');
        expect(src).not.toMatch(/\bwindow\.(alert|confirm)\(/);
        expect(src).not.toMatch(/(^|[^.\w])(alert|confirm)\(/m);
    });

    it("전화가 없는(소셜 가입) 회원에게도 단추 줄이 뜬다", () => {
        expect(src).toContain("{(isRealPhone(m.phone) || canMessage) && (");
    });
});

describe("(나-4) 대화방 — 운영자가 연 빈 문의 방", () => {
    const src = code(client("pages/hiq/chat-room.tsx"));
    it("빈 화면 문구가 보는 사람에 따라 다르다 — 운영자에게 '궁금한 점을 적어 주세요'라고 하지 않는다", () => {
        expect(src).toContain('d?.kind === "support" ? (d.id === member?.id ? t("chat.emptySupport") : t("chat.emptySupportAdmin"))');
    });
    it("문의 방에는 여전히 첨부·신고가 없다", () => {
        expect(src).toContain('const canAttach = !!d && d.kind !== "support" && !!member;');
        expect(src).toContain('const canReport = !!d && d.kind !== "support" && !!member;');
    });
});

describe("(다) 문구 — 다섯 언어", () => {
    const CLIENT_KEYS = [
        "chat.adminMessage", "chat.adminMessageShort", "chat.adminPicker.desc", "chat.adminPicker.search", "chat.adminPicker.hint",
        "chat.adminPicker.empty", "chat.adminPicker.failed", "chat.adminPicker.retry", "chat.adminPicker.more", "chat.adminPicker.joined",
        "chat.adminPicker.phoneEnd", "chat.adminPicker.banned", "chat.adminPicker.staff", "chat.emptySupportAdmin", "chat.adminNeedAppLogin",
        "chat.adminPicker.store", "chat.adminPicker.noAccount", "chat.adminPicker.rowHint",
    ];
    const SERVER_KEYS = ["notif.chat.supportTeam.title", "ui.chat.supportTeam", "ui.chat.supportTeamMessage", "err.chat.supportMemberGone", "err.member.nameReserved"];
    const LANGS = ["ko", "en", "es", "vi", "tr"] as const;
    const line = (dict: string, key: string) => new RegExp(`^\\s*"${key.replace(/\./g, "\\.")}": "(.+)",\\s*$`, "m").exec(dict)?.[1];

    it("화면 사전에 키가 다섯 언어 모두 있고, 한 번씩만 있다", () => {
        for (const lang of LANGS) {
            const dict = client(`lib/i18n/${lang}.ts`);
            for (const k of CLIENT_KEYS) {
                expect(line(dict, k), `${lang} ${k}`).toBeTruthy();
                expect(dict.split(`"${k}":`).length - 1, `${lang} ${k} 중복`).toBe(1);
            }
        }
    });

    it("화면 사전 — 한국어가 아닌 사전에 한글이 섞이지 않고, 자리표시자가 한국어와 같다", () => {
        const koDict = client("lib/i18n/ko.ts");
        const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
        for (const lang of LANGS) {
            const dict = client(`lib/i18n/${lang}.ts`);
            for (const k of CLIENT_KEYS) {
                const v = line(dict, k)!;
                if (lang !== "ko") expect(v, `${lang} ${k}`).not.toMatch(/[가-힣]/);
                expect(holes(v), `${lang} ${k}`).toBe(holes(line(koDict, k)!));
            }
        }
    });

    it("서버 사전에 키가 다섯 언어 모두 있다", () => {
        const dicts: Record<(typeof LANGS)[number], Record<string, string>> = { ko: serverKo, en: serverEn, es: serverEs, vi: serverVi, tr: serverTr };
        for (const lang of LANGS) {
            for (const k of SERVER_KEYS) {
                expect(dicts[lang][k], `${lang} ${k}`).toBeTruthy();
                if (lang !== "ko") expect(dicts[lang][k], `${lang} ${k}`).not.toMatch(/[가-힣]/);
            }
        }
        expect(serverKo["ui.chat.supportTeam"]).toBe("랭큐 운영팀");
        expect(serverKo["notif.chat.supportTeam.title"]).toContain("랭큐 운영팀 메시지");
        // 회원에게 가는 제목에 이름 자리가 없다 — 운영자 이름이 끼어들 틈이 없다
        for (const lang of LANGS) {
            expect(dicts[lang]["notif.chat.supportTeam.title"]).not.toContain("{");
            expect(dicts[lang]["notif.chat.supportReply.title"]).not.toContain("{");
        }
    });

    it("화면이 쓰는 키는 전부 사전에 있다(오타로 키가 그대로 화면에 뜨지 않게)", () => {
        const koDict = client("lib/i18n/ko.ts");
        for (const f of ["components/hiq/chat/AdminMemberPicker.tsx", "pages/hiq/chat-hub.tsx"]) {
            const used = Array.from(code(client(f)).matchAll(/\bt\("([\w.]+)"\)/g), (m) => m[1]);
            expect(used.length).toBeGreaterThan(3);
            for (const k of used) expect(koDict.includes(`"${k}":`), `${f} ${k}`).toBe(true);
        }
    });
});
