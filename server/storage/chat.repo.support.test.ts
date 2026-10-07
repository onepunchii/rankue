import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatRepository, parseRoomKey, type RoomRef } from "./chat.repo.js";
import { SUPPORT_TEAM_ID } from "../../shared/chatSupport.js";

/**
 * 문의 방을 거꾸로 쓰기(2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게") — **진짜 저장소 코드**가 무엇을 묻고 무엇을 돌려주는지 본다.
 * DB 에는 붙지 않는다(.env 는 운영 DB 다). db 를 drizzle 의 프록시 드라이버로 바꿔, 저장소가 만든 문장과 값을 받아 적고
 * 아래 '가짜 세상'(world)에서 답을 지어 준다(loginHandoff.repo.test.ts 와 같은 방식). 모르는 문장이 오면 시험이 터진다.
 *
 *  (가) 회원 찾기 — 검색어는 파라미터로만 들어가고 %·_ 는 글자 그대로, 탈퇴회원·나 자신 제외, 20명, 번호는 끝 4자리만.
 *      줄 하나는 회원 행이다(매장별) — 가입한 매장·계정 유무를 같이 내보내고, 앱이 로그인하는 행을 위에 둔다.
 *  (나) 문의 방의 보낸 사람 — 회원에게는 '랭큐 운영팀'(이름·사진·회원 id), 운영자에게는 실명. 다른 종류의 방은 건드리지 않는다.
 *  (다) 방 정보의 참여자 · 읽은 시각 · 채팅 목록 미리보기 — 같은 규칙.
 *  (라) 방 열기 — 없는 회원·탈퇴회원의 빈 방은 운영자도 못 연다. 탈퇴는 번호 자리표시자로만 본다(이름만 '탈퇴회원'인 회원은 살아 있다).
 *  (마) 개인 차단 — 문의 방에는 걸지 않는다(차단이 '운영팀' 가리기를 푸는 길이 되고, 운영팀의 연락이 빈 방으로만 남는다). 다른 방은 그대로.
 * 아래 id·이름·번호는 시험용으로 지어낸 글자다.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GONE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOBODY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Msg = { id: string; roomKey: string; senderId: string | null; message: string; type: string; at: string };

const cap = vi.hoisted(() => ({
    calls: [] as { sql: string; params: unknown[]; method: string }[],
    respond: (_sql: string, _params: unknown[], _method: string): unknown[] => [],
}));
vi.mock("../db.js", async () => {
    const { drizzle } = await import("drizzle-orm/pg-proxy");
    const db = drizzle(async (sql: string, params: unknown[], method: string) => {
        cap.calls.push({ sql, params, method });
        const rows = cap.respond(sql, params, method);
        // db.execute(…) 는 운영 드라이버에서 { rows } 를 돌려준다(저장소가 .rows 를 읽는다) — 프록시는 rows 를 그대로 넘기므로 한 겹 싼다.
        return { rows: method === "execute" ? ({ rows } as unknown as unknown[]) : rows };
    });
    return { db, pool: {} };
});

/** 여러 줄·겹친 공백을 한 칸으로 */
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

const world = {
    /** 프로필이 있는 회원의 역할(없으면 프로필 없는 회원 — 운영자가 아니다) */
    roles: {} as Record<string, string>,
    members: {} as Record<string, { name: string; phone: string; img: string | null }>,
    messages: [] as Msg[],
    reads: [] as { roomKey: string; memberId: string; at: string }[],
    /** 개인 차단(hiq_blocks) — blocker 가 blocked 를 차단했다 */
    blocks: [] as { blocker: string; blocked: string }[],
    /** 회원 찾기에 돌려줄 행(선택한 칸 순서) */
    searchRows: [] as unknown[][],
};

// 운영자 = 슈퍼관리자만(2026-10-07). 관리자(admin · 보기 전용)는 문의 방에서 일반 회원이다
const isStaff = (id: string) => world.roles[id] === "super_admin";
/** viewer 가 이 글의 보낸 사람을 차단했나 */
const blockedBy = (viewer: string, m: Msg) => !!m.senderId && world.blocks.some((b) => b.blocker === viewer && b.blocked === m.senderId);
/**
 * 방 목록의 두 문장(마지막 글 · 안 읽은 수)이 차단을 어떻게 보는지 — 문장을 읽어 그대로 흉내 낸다.
 * 차단 조건이 없으면 아무것도 가리지 않고, 문의 방 예외가 있으면 문의 방의 글은 가리지 않는다.
 */
function hiddenInList(q: string, viewer: string): (m: Msg) => boolean {
    if (!q.includes("FROM hiq_blocks b WHERE b.blocker_id =")) return () => false;
    const supportExempt = q.includes("(c.room_key LIKE 'support:%' OR NOT EXISTS (SELECT 1 FROM hiq_blocks b");
    return (m) => blockedBy(viewer, m) && !(supportExempt && m.roomKey.startsWith("support:"));
}

function respond(sql: string, params: unknown[]): unknown[] {
    const q = flat(sql);
    // isAdmin · isSuperAdmin
    if (q.startsWith('select "profiles"."role" from "hiq_members" inner join "profiles"')) {
        const role = world.roles[String(params[0])];
        return role ? [[role]] : [];
    }
    // adminMemberIds
    if (q.startsWith('select "hiq_members"."id" from "hiq_members" inner join "profiles"') && q.includes('"profiles"."role" in (')) {
        return Object.keys(world.roles).filter(isStaff).map((id) => [id]);
    }
    // supportOwnerState — 번호만 읽는다(탈퇴는 번호 자리표시자로만 본다)
    if (q.startsWith('select "phone" from "hiq_members" where "hiq_members"."id" = $1')) {
        const m = world.members[String(params[0])];
        return m ? [[m.phone]] : [];
    }
    // hasMessages · hasMessageFrom
    if (q.startsWith('select "id" from "hiq_chat_messages" where')) {
        const bySender = q.includes('"hiq_chat_messages"."sender_id" = $2');
        const hit = world.messages.find((m) => m.roomKey === params[0] && (!bySender || m.senderId === params[1]));
        return hit ? [[hit.id]] : [];
    }
    // messages — 방의 글을 최근 것부터(저장소가 뒤집는다). 문장에 차단 조건이 있으면 보는 사람(값으로 실려 온다)이 차단한 사람의 글을 뺀다.
    if (q.startsWith('select "hiq_chat_messages"."id", "hiq_chat_messages"."room_key"') && q.includes('from "hiq_chat_messages" left join "hiq_members"')) {
        const hidden = (m: Msg) => q.includes('FROM "hiq_blocks" WHERE "hiq_blocks"."blocker_id" =') && params.some((p) => typeof p === "string" && blockedBy(p, m));
        return world.messages.filter((m) => m.roomKey === params[0] && !hidden(m)).sort((a, b) => b.at.localeCompare(a.at))
            .map((m) => [m.id, m.roomKey, m.senderId, m.message, m.type, null, m.at, m.senderId ? world.members[m.senderId]?.name ?? null : null, m.senderId ? world.members[m.senderId]?.img ?? null : null]);
    }
    // roomInfo 의 명단
    if (q.startsWith('select "hiq_members"."id", "hiq_members"."name", "profiles"."profile_image_url" from "hiq_members" left join "profiles"')) {
        return params.map(String).filter((id) => world.members[id]).map((id) => [id, world.members[id].name, world.members[id].img]);
    }
    // readCursors
    if (q.startsWith('select "member_id", "last_read_at" from "hiq_chat_reads" where "hiq_chat_reads"."room_key" = $1')) {
        return world.reads.filter((r) => r.roomKey === params[0]).map((r) => [r.memberId, r.at]);
    }
    // 회원 찾기
    if (q.startsWith('select "hiq_members"."id", "hiq_members"."name", "hiq_members"."phone", "hiq_members"."created_at"')) return world.searchRows;
    // myRooms — 크루·1:1 은 없는 회원
    if (q.includes('from "hiq_crew_members" inner join "hiq_crews"')) return [];
    if (q.startsWith('select "hiq_chat_room_members"."room_id" from "hiq_chat_room_members" inner join "hiq_chat_rooms"')) return [];
    // myRooms — 내 문의 방의 글 수 · 내가 쓴 글 수
    if (q.startsWith("select count(*)::int, count(*) filter (where") && q.includes('from "hiq_chat_messages"')) {
        const mine = world.messages.filter((m) => m.roomKey === params[1]);
        return [[mine.length, mine.filter((m) => m.senderId === params[0]).length]];
    }
    // myRooms — 방마다 마지막 글(보는 사람 = 첫 값)
    if (q.includes("SELECT DISTINCT ON (c.room_key)")) {
        const keys = new Set(params.map(String));
        const hidden = hiddenInList(q, String(params[0]));
        const last = new Map<string, Msg>();
        for (const m of [...world.messages].sort((a, b) => a.at.localeCompare(b.at))) if (keys.has(m.roomKey) && !hidden(m)) last.set(m.roomKey, m);
        return [...last.values()].map((m) => ({ room_key: m.roomKey, message: m.message, type: m.type, created_at: `${m.at}Z`, i18n: null, sender_id: m.senderId, sender_name: m.senderId ? world.members[m.senderId]?.name ?? null : null }));
    }
    // myRooms — 안 읽은 수: 남이 쓴 글 가운데 내가 마지막으로 읽은 뒤의 것(읽은 적이 없으면 전부). 보는 사람 = 첫 값
    if (q.includes("count(*)::int AS n FROM hiq_chat_messages c")) {
        const viewer = String(params[0]);
        const keys = new Set(params.map(String));
        const hidden = hiddenInList(q, viewer);
        const counts = new Map<string, number>();
        for (const m of world.messages) {
            if (!keys.has(m.roomKey) || hidden(m) || m.senderId === viewer) continue;
            const readAt = world.reads.find((r) => r.roomKey === m.roomKey && r.memberId === viewer)?.at ?? "";
            if (m.at > readAt) counts.set(m.roomKey, (counts.get(m.roomKey) ?? 0) + 1);
        }
        return [...counts].map(([room_key, n]) => ({ room_key, n }));
    }
    throw new Error(`시험이 모르는 질의: ${q}`);
}

const support = (ownerId: string): RoomRef => parseRoomKey(`support:${ownerId}`)!;
const repo = new ChatRepository();
/** 지금까지 받아 적은 문장 중 이 조각이 든 것 */
const callsWith = (part: string) => cap.calls.filter((c) => flat(c.sql).includes(part));

beforeEach(() => {
    cap.calls = [];
    cap.respond = respond;
    world.roles = { [OWNER]: "user", [ADMIN_A]: "super_admin", [ADMIN_B]: "super_admin", [STRANGER]: "user" };
    world.members = {
        [OWNER]: { name: "김회원", phone: "01012345678", img: "https://blob.test/owner.webp" },
        [ADMIN_A]: { name: "최운영", phone: "01099990000", img: "https://blob.test/admin-a.webp" },
        [ADMIN_B]: { name: "박관리", phone: "social:google:zzzz", img: null },
        [STRANGER]: { name: "남의회원", phone: "01055556666", img: null },
        [GONE]: { name: "탈퇴회원", phone: "del-dddddddd-ddd", img: null },
    };
    world.messages = [
        { id: "00000000-0000-4000-8000-000000000001", roomKey: `support:${OWNER}`, senderId: ADMIN_A, message: "안녕하세요, 랭큐입니다", type: "text", at: "2026-10-06 01:00:00" },
        { id: "00000000-0000-4000-8000-000000000002", roomKey: `support:${OWNER}`, senderId: OWNER, message: "네 안녕하세요", type: "text", at: "2026-10-06 01:05:00" },
        { id: "00000000-0000-4000-8000-000000000003", roomKey: `support:${OWNER}`, senderId: ADMIN_B, message: "이어서 답드려요", type: "text", at: "2026-10-06 01:10:00" },
    ];
    world.reads = [
        { roomKey: `support:${OWNER}`, memberId: OWNER, at: "2026-10-06 01:06:00" },
        { roomKey: `support:${OWNER}`, memberId: ADMIN_A, at: "2026-10-06 01:02:00" },
        { roomKey: `support:${OWNER}`, memberId: ADMIN_B, at: "2026-10-06 01:11:00" },
    ];
    world.blocks = [];
    world.searchRows = [];
});

describe("(가) searchMembersForAdmin — 회원 찾기", () => {
    it("검색어는 파라미터로만 들어간다 — 문장에 이어 붙지 않는다", async () => {
        const nasty = "'; drop table hiq_members; --";
        await repo.searchMembersForAdmin(nasty, ADMIN_A);
        expect(cap.calls).toHaveLength(1);
        const { sql, params } = cap.calls[0];
        expect(sql).not.toContain("drop table");
        expect(sql).not.toContain(nasty);
        // 값 자리에 통째로 들어간다(안의 _ 는 LIKE 와일드카드라 글자 그대로로 바뀐다)
        expect(params).toContain("%'; drop table hiq\\_members; --%");
        // 문장에 값이 하나도 박혀 있지 않다 — 따옴표로 싼 글자는 없다
        expect(sql).not.toMatch(/'[^']*'/);
    });

    it("%·_·\\ 는 글자 그대로 찾는다(와일드카드로 전 회원이 딸려 나오지 않는다)", async () => {
        await repo.searchMembersForAdmin("100%_a\\b", ADMIN_A);
        const { params } = cap.calls[0];
        expect(params).toContain("%100\\%\\_a\\\\b%"); // 들어간 곳
        expect(params).toContain("100\\%\\_a\\\\b");   // 이름이 똑같은 사람 먼저
        expect(params).toContain("100\\%\\_a\\\\b%");  // 그 글자로 시작하는 사람 다음
        expect(params).not.toContain("%100%_a\\b%");
        await repo.searchMembersForAdmin("%%", ADMIN_A);
        expect(cap.calls[1].params).toContain("%\\%\\%%");
    });

    it("이름과 닉네임에서 찾고, 탈퇴회원과 나 자신은 뺀다. 최대 20명", async () => {
        await repo.searchMembersForAdmin("김회", ADMIN_A);
        const q = flat(cap.calls[0].sql);
        const { params } = cap.calls[0];
        expect(q).toContain('from "hiq_members" left join "profiles" on "profiles"."id" = "hiq_members"."profile_id" left join "hiq_stores" on "hiq_stores"."id" = "hiq_members"."store_id"');
        expect(q).toContain('"hiq_members"."id" <> $1');
        expect(q).toContain('"hiq_members"."phone" not like $2');
        expect(q).toContain('("hiq_members"."name" ilike $3 or "profiles"."nickname" ilike $4)');
        expect(params.slice(0, 4)).toEqual([ADMIN_A, "del-%", "%김회%", "%김회%"]);
        expect(q).toMatch(/limit \$\d+$/);
        expect(params[params.length - 1]).toBe(20);
        // 정지 계정은 빼지 않는다(표시만) — 왜 답이 없는지 운영자가 알아야 한다
        expect(q).not.toContain('"profiles"."status" <>');
    });

    it("탈퇴는 번호 자리표시자로만 거른다 — 이름이 '탈퇴회원'일 뿐인 살아 있는 회원은 찾아진다", async () => {
        await repo.searchMembersForAdmin("탈퇴회원", ADMIN_A);
        const { sql, params } = cap.calls[0];
        // 이름을 조건으로 거르지 않는다(회원이 설정에서 바꿀 수 있는 값이다) — 이름 칸은 찾는 데와 줄 세우는 데만 쓰인다
        expect(flat(sql)).not.toContain('"hiq_members"."name" <>');
        expect(flat(sql)).not.toContain('"hiq_members"."name" =');
        expect(params.filter((p) => p === "탈퇴회원")).toEqual(["탈퇴회원"]); // '이름이 똑같은 사람 먼저' 한 곳뿐
        expect(params).toContain("%탈퇴회원%");
        expect(params).toContain("del-%");
    });

    it("줄 세우기 — 이름이 같은 사람 → 그 글자로 시작 → 나머지, 그 안에서 앱이 로그인하는 행(본 사이트 → 글로벌) 먼저, 그다음 최근 가입순", async () => {
        await repo.searchMembersForAdmin("김회", ADMIN_A);
        const q = flat(cap.calls[0].sql);
        const { params } = cap.calls[0];
        expect(q).toContain('order by ("hiq_members"."name" ilike $5) desc, ("hiq_members"."name" ilike $6) desc, '
            + 'case when "hiq_stores"."slug" = $7 then 0 when "hiq_stores"."slug" = $8 then 1 else 2 end, "hiq_members"."created_at" desc limit $9');
        // 매장 순서는 로그인할 행을 고르는 규칙(lib/loginMember)과 같다. 슬러그도 값으로 넘어간다(문장에 박지 않는다)
        expect(params.slice(4, 8)).toEqual(["김회", "김회%", "hiq", "global"]);
    });

    it("번호는 끝 4자리만 나간다 — 전체 번호·역할 원문·프로필 id 는 응답에 없다", async () => {
        const PROFILE_1 = "99999999-9999-4999-8999-999999999991";
        const PROFILE_2 = "99999999-9999-4999-8999-999999999992";
        world.searchRows = [
            [OWNER, "김회원", "010-1234-5678", "2026-09-01 03:00:00", "GOLF", "버디킴", "https://blob.test/owner.webp", "active", "user", PROFILE_1, "랭큐", "hiq"],
            [STRANGER, "김회장", "social:kakao:abcdef", "2026-08-01 00:00:00", null, "김회장", null, "banned", "user", PROFILE_2, "글로벌", "global"],
            [ADMIN_B, "김회계", "01099998888", "2026-07-01 00:00:00", "BILLIARDS", null, null, "active", "super_admin", PROFILE_2, "랭큐", "hiq"],
        ];
        const hits = await repo.searchMembersForAdmin("김회", ADMIN_A);
        expect(hits).toEqual([
            { id: OWNER, name: "김회원", nickname: "버디킴", profileImageUrl: "https://blob.test/owner.webp", joinedAt: "2026-09-01T03:00:00.000Z", phoneLast4: "5678", sport: "GOLF", banned: false, staff: false, store: null, noAccount: false },
            { id: STRANGER, name: "김회장", nickname: null, profileImageUrl: null, joinedAt: "2026-08-01T00:00:00.000Z", phoneLast4: null, sport: null, banned: true, staff: false, store: null, noAccount: false },
            { id: ADMIN_B, name: "김회계", nickname: null, profileImageUrl: null, joinedAt: "2026-07-01T00:00:00.000Z", phoneLast4: "8888", sport: "BILLIARDS", banned: false, staff: true, store: null, noAccount: false },
        ]);
        const json = JSON.stringify(hits);
        for (const leak of ["1234-5678", "01099998888", "social:kakao", '"role"', '"phone"', PROFILE_1, PROFILE_2, '"profileId"', '"storeSlug"']) expect(json, leak).not.toContain(leak);
    });

    it("같은 사람의 두 줄(본 사이트 행 · 매장 행)을 가릴 수 있다 — 매장 행에는 매장 이름, 계정 없는 행에는 표시", async () => {
        const PROFILE = "99999999-9999-4999-8999-999999999991";
        const STORE_ROW = "12121212-1212-4121-8121-121212121212";
        const BARE_ROW = "34343434-3434-4343-8343-343434343434";
        world.searchRows = [
            // 같은 번호·같은 프로필 — 닉네임·사진·끝 4자리가 똑같다
            [OWNER, "김회원", "01012345678", "2026-03-01 00:00:00", "BILLIARDS", "버디킴", "https://blob.test/owner.webp", "active", "user", PROFILE, "랭큐", "hiq"],
            [STORE_ROW, "김회원", "01012345678", "2026-09-01 00:00:00", "BILLIARDS", "버디킴", "https://blob.test/owner.webp", "active", "user", PROFILE, "스타당구장", "star-billiards"],
            // 매장에서 번호만으로 등록된 행 — 프로필이 없다(left join 이라 프로필 칸이 비어 온다)
            [BARE_ROW, "김회원", "01077778888", "2026-05-01 00:00:00", null, null, null, null, null, null, "스타당구장", "star-billiards"],
        ];
        const hits = await repo.searchMembersForAdmin("김회원", ADMIN_A);
        expect(hits.map((h) => [h.id, h.store, h.noAccount])).toEqual([
            [OWNER, null, false],
            [STORE_ROW, "스타당구장", false],
            [BARE_ROW, "스타당구장", true],
        ]);
        // 두 줄은 이 칸 말고는 가입일만 다르다 — 그래서 표시가 필요하다
        const { id: _a, store: _s1, joinedAt: _j1, ...appRow } = hits[0];
        const { id: _b, store: _s2, joinedAt: _j2, ...storeRow } = hits[1];
        expect(appRow).toEqual(storeRow);
    });
});

describe("(나) messages — 문의 방의 보낸 사람", () => {
    it("회원에게는 운영자 글이 '랭큐 운영팀' — 이름·사진·회원 id 가 응답에 없다", async () => {
        const rows = await repo.messages(support(OWNER), OWNER, { locale: "ko" });
        expect(rows.map((r) => r.message)).toEqual(["안녕하세요, 랭큐입니다", "네 안녕하세요", "이어서 답드려요"]);
        expect(rows[0].senderId).toBe(SUPPORT_TEAM_ID);
        expect(rows[0].sender).toEqual({ name: "랭큐 운영팀", profileImageUrl: null });
        expect(rows[2].senderId).toBe(SUPPORT_TEAM_ID);
        expect(rows[2].sender).toEqual({ name: "랭큐 운영팀", profileImageUrl: null });
        // 내 글은 그대로
        expect(rows[1].senderId).toBe(OWNER);
        expect(rows[1].sender).toEqual({ name: "김회원", profileImageUrl: "https://blob.test/owner.webp" });
        const json = JSON.stringify(rows);
        for (const leak of ["최운영", "박관리", ADMIN_A, ADMIN_B, "admin-a.webp"]) expect(json, leak).not.toContain(leak);
    });

    it("운영팀 이름은 보는 사람 언어로", async () => {
        const en = await repo.messages(support(OWNER), OWNER, { locale: "en" });
        expect(en[0].sender?.name).toBe("Rankue Team");
        const es = await repo.messages(support(OWNER), OWNER, { locale: "es" });
        expect(es[0].sender?.name).toBe("Equipo Rankue");
        // 언어를 안 넘기면 한국어
        const none = await repo.messages(support(OWNER), OWNER);
        expect(none[0].sender?.name).toBe("랭큐 운영팀");
    });

    it("운영자에게는 누가 답했는지 실제 이름과 id 가 보인다", async () => {
        const rows = await repo.messages(support(OWNER), ADMIN_B, { locale: "ko" });
        expect(rows.map((r) => [r.senderId, r.sender?.name])).toEqual([[ADMIN_A, "최운영"], [OWNER, "김회원"], [ADMIN_B, "박관리"]]);
        expect(rows[0].sender?.profileImageUrl).toBe("https://blob.test/admin-a.webp");
    });

    it("운영자가 아닌 사람이 읽으면 방 주인이 아니어도 가린다(다른 길로 읽게 돼도 새지 않는다)", async () => {
        const rows = await repo.messages(support(OWNER), STRANGER, { locale: "ko" });
        expect(JSON.stringify(rows)).not.toContain("최운영");
        expect(rows[0].senderId).toBe(SUPPORT_TEAM_ID);
    });

    it("자기 문의 방을 보는 운영자는 운영자다 — 다른 운영자의 이름이 보인다", async () => {
        world.messages = [{ id: "00000000-0000-4000-8000-000000000009", roomKey: `support:${ADMIN_B}`, senderId: ADMIN_A, message: "확인 부탁", type: "text", at: "2026-10-06 02:00:00" }];
        const rows = await repo.messages(support(ADMIN_B), ADMIN_B, { locale: "ko" });
        expect(rows[0].sender?.name).toBe("최운영");
        expect(rows[0].senderId).toBe(ADMIN_A);
    });

    it("다른 종류의 방은 건드리지 않는다 — 역할을 묻지도 않는다", async () => {
        const dm = parseRoomKey("dm:99999999-9999-4999-8999-999999999999")!;
        world.messages = [{ id: "00000000-0000-4000-8000-000000000010", roomKey: dm.key, senderId: ADMIN_A, message: "친구끼리", type: "text", at: "2026-10-06 02:00:00" }];
        const rows = await repo.messages(dm, OWNER, { locale: "ko" });
        expect(rows[0].sender?.name).toBe("최운영");
        expect(rows[0].senderId).toBe(ADMIN_A);
        expect(callsWith('"profiles"."role"')).toHaveLength(0);
    });
});

describe("(다) 참여자 · 읽은 시각 · 목록 미리보기", () => {
    it("방 정보: 회원에게 참여자는 [본인, 랭큐 운영팀] — 운영자 명단이 나가지 않는다", async () => {
        const info = await repo.roomInfo(support(OWNER), OWNER, "ko");
        expect(info.members).toEqual([
            { id: OWNER, name: "김회원", profileImageUrl: "https://blob.test/owner.webp" },
            { id: SUPPORT_TEAM_ID, name: "랭큐 운영팀", profileImageUrl: null },
        ]);
        expect(info.title).toBe("랭큐 운영자");
        expect(info.canManage).toBe(false);
        const json = JSON.stringify(info);
        for (const leak of ["최운영", "박관리", ADMIN_A, ADMIN_B]) expect(json, leak).not.toContain(leak);
    });

    it("방 정보: 운영자에게는 회원과 운영자 전원이 실명으로, 제목은 '<회원> · 문의'", async () => {
        const info = await repo.roomInfo(support(OWNER), ADMIN_A, "ko");
        expect(info.members.map((m) => m.name).sort()).toEqual(["김회원", "박관리", "최운영"]);
        expect(info.title).toBe("김회원 · 문의");
        expect(info.canManage).toBe(true);
    });

    it("방 정보: 메시지가 한 건도 없는 방도 운영자에게 정상으로 뜬다(먼저 말 걸기)", async () => {
        world.messages = [];
        const info = await repo.roomInfo(support(STRANGER), ADMIN_A, "ko");
        expect(info.title).toBe("남의회원 · 문의");
        expect(info.members.some((m) => m.id === STRANGER)).toBe(true);
        expect(await repo.messages(support(STRANGER), ADMIN_A, { locale: "ko" })).toEqual([]);
    });

    it("읽은 시각: 회원에게는 운영자들의 커서가 운영팀 하나로 접힌다", async () => {
        const reads = await repo.readCursorsFor(support(OWNER), OWNER);
        expect(reads).toEqual([
            { id: OWNER, at: "2026-10-06T01:06:00.000Z" },
            { id: SUPPORT_TEAM_ID, at: "2026-10-06T01:11:00.000Z" },
        ]);
        expect(JSON.stringify(reads)).not.toContain(ADMIN_A);
    });

    it("읽은 시각: 운영자에게는 그대로", async () => {
        const reads = await repo.readCursorsFor(support(OWNER), ADMIN_A);
        expect(reads.map((r) => r.id).sort()).toEqual([OWNER, ADMIN_A, ADMIN_B].sort());
    });

    it("채팅 목록: 회원의 미리보기에 운영자 이름 대신 운영팀", async () => {
        const rooms = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        expect(rooms).toHaveLength(1);
        expect(rooms[0].key).toBe(`support:${OWNER}`);
        expect(rooms[0].lastMessage?.text).toBe("이어서 답드려요");
        expect(rooms[0].lastMessage?.senderName).toBe("랭큐 운영팀");
        expect(JSON.stringify(rooms)).not.toContain("박관리");
        // 회원이 쓴 적이 있는 방은 예전 그대로 '관리자 문의'
        expect(rooms[0].subtitle).toBe("관리자 문의");
    });

    it("채팅 목록: 운영자가 먼저 말을 건 방(회원의 글이 없다)은 부제가 '운영팀 메시지'", async () => {
        world.messages = world.messages.filter((m) => m.senderId !== OWNER);
        const rooms = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        expect(rooms[0].subtitle).toBe("운영팀 메시지");
        expect(rooms[0].title).toBe("랭큐 운영자");
        const en = await repo.myRooms(OWNER, "BILLIARDS", "en");
        expect(en[0].subtitle).toBe("Team message");
        expect(en[0].lastMessage?.senderName).toBe("Rankue Team");
    });

    it("채팅 목록: 내가 마지막으로 쓴 방은 내 이름 그대로", async () => {
        world.messages.push({ id: "00000000-0000-4000-8000-000000000004", roomKey: `support:${OWNER}`, senderId: OWNER, message: "감사합니다", type: "text", at: "2026-10-06 01:20:00" });
        const rooms = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        expect(rooms[0].lastMessage?.senderName).toBe("김회원");
    });
});

describe("(라) canAccess — 문의 방 열기", () => {
    it("회원은 자기 방을 묻지도 않고 연다", async () => {
        expect(await repo.canAccess(support(OWNER), OWNER)).toBe(true);
        expect(cap.calls).toHaveLength(0);
    });

    it("남의 문의 방은 운영자만", async () => {
        expect(await repo.canAccess(support(OWNER), STRANGER)).toBe(false);
        expect(await repo.canAccess(support(OWNER), ADMIN_A)).toBe(true);
        expect(await repo.canAccess(support(OWNER), ADMIN_B)).toBe(true);
    });

    // 2026-10-07 오너: "해당 부관리자는 볼 수만 있어 … 슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)"
    it("관리자(admin · 보기 전용)는 운영자가 아니다 — 남의 문의 방을 열지 못하고, 자기 문의 방은 회원처럼 연다", async () => {
        world.roles[ADMIN_B] = "admin";
        expect(await repo.isAdmin(ADMIN_B)).toBe(false);
        expect(await repo.canAccess(support(OWNER), ADMIN_B)).toBe(false);
        expect(await repo.canAccess(support(ADMIN_B), ADMIN_B)).toBe(true);
        expect(await repo.isAdmin(ADMIN_A)).toBe(true);
    });

    it("메시지가 없어도 운영자는 연다 — 먼저 말 걸기", async () => {
        world.messages = [];
        expect(await repo.canAccess(support(STRANGER), ADMIN_A)).toBe(true);
    });

    it("없는 회원 id 로는 열리지 않는다", async () => {
        expect(await repo.supportOwnerState(NOBODY)).toBe("missing");
        expect(await repo.canAccess(support(NOBODY), ADMIN_A)).toBe(false);
    });

    it("탈퇴회원: 빈 방은 새로 열지 않고, 남은 문의 기록은 읽을 수 있다", async () => {
        expect(await repo.supportOwnerState(GONE)).toBe("withdrawn");
        expect(await repo.canAccess(support(GONE), ADMIN_A)).toBe(false);
        world.messages.push({ id: "00000000-0000-4000-8000-000000000005", roomKey: `support:${GONE}`, senderId: GONE, message: "탈퇴 전 문의", type: "text", at: "2026-09-01 00:00:00" });
        expect(await repo.canAccess(support(GONE), ADMIN_A)).toBe(true);
    });

    it("이름을 고친 탈퇴회원도 번호 자리표시자로 알아본다", async () => {
        world.members[GONE] = { name: "어드민이 고친 이름", phone: "del-dddddddd-ddd", img: null };
        expect(await repo.supportOwnerState(GONE)).toBe("withdrawn");
    });

    it("이름만 '탈퇴회원'인 살아 있는 회원은 탈퇴회원이 아니다 — 운영자가 방을 열고(빈 방 포함) 답할 수 있다", async () => {
        // 이름은 회원이 설정에서 바꿀 수 있다. 예전엔 이 이름만으로 '탈퇴'로 봐서, 이 회원이 문의해도 운영자가 답하지 못했다
        world.members[STRANGER] = { name: "탈퇴회원", phone: "01055556666", img: null };
        expect(await repo.supportOwnerState(STRANGER)).toBe("ok");
        world.messages = [];
        expect(await repo.canAccess(support(STRANGER), ADMIN_A)).toBe(true);
        // 소셜로 가입한 회원도 같다
        world.members[STRANGER] = { name: "탈퇴회원", phone: "social:google:zzzz", img: null };
        expect(await repo.supportOwnerState(STRANGER)).toBe("ok");
    });

    it("hasMessageFrom — 그 사람이 그 방에 쓴 적이 있는지(알림 제목 분기)", async () => {
        expect(await repo.hasMessageFrom(`support:${OWNER}`, OWNER)).toBe(true);
        expect(await repo.hasMessageFrom(`support:${STRANGER}`, STRANGER)).toBe(false);
        world.messages = world.messages.filter((m) => m.senderId !== OWNER);
        expect(await repo.hasMessageFrom(`support:${OWNER}`, OWNER)).toBe(false);
        const { sql, params } = cap.calls[cap.calls.length - 1];
        expect(flat(sql)).toContain('"hiq_chat_messages"."room_key" = $1 and "hiq_chat_messages"."sender_id" = $2');
        expect(params.slice(0, 2)).toEqual([`support:${OWNER}`, OWNER]);
    });
});

describe("(마) 개인 차단 — 문의 방에는 걸지 않는다", () => {
    const DM = parseRoomKey("dm:99999999-9999-4999-8999-999999999999")!;
    /** 저장소가 메시지를 읽을 때 만든 문장 */
    const messageQuery = () => flat(callsWith('from "hiq_chat_messages" left join "hiq_members"')[0].sql);

    it("회원이 운영자의 개인 계정을 차단해도 문의 방의 글은 그대로다 — 차단으로 '어느 글을 누가 썼는지' 가려낼 수 없다", async () => {
        const before = await repo.messages(support(OWNER), OWNER, { locale: "ko" });
        // 회원이 의심 가는 사람(랭킹·크루에서 본 회원)을 차단해 본다 — 그 사람이 쓴 '운영팀' 글만 빠지면 누가 운영자인지 드러난다
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_A }];
        const after = await repo.messages(support(OWNER), OWNER, { locale: "ko" });
        expect(after).toEqual(before);
        expect(after.map((r) => r.message)).toEqual(["안녕하세요, 랭큐입니다", "네 안녕하세요", "이어서 답드려요"]);
        expect(after[0].senderId).toBe(SUPPORT_TEAM_ID);
        expect(after[0].sender).toEqual({ name: "랭큐 운영팀", profileImageUrl: null });
        // 운영자 둘을 다 차단해도 같다
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_A }, { blocker: OWNER, blocked: ADMIN_B }];
        expect(await repo.messages(support(OWNER), OWNER, { locale: "ko" })).toEqual(before);
        // 문의 방을 읽는 문장은 차단 표를 보지도 않는다
        for (const c of callsWith('from "hiq_chat_messages" left join "hiq_members"')) expect(flat(c.sql)).not.toContain("hiq_blocks");
    });

    it("폴링(after)·위로 더 읽기(before)도 같다", async () => {
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_A }];
        await repo.messages(support(OWNER), OWNER, { after: new Date("2026-10-06T00:00:00Z"), locale: "ko" });
        await repo.messages(support(OWNER), OWNER, { before: new Date("2026-10-07T00:00:00Z"), locale: "ko" });
        const calls = callsWith('from "hiq_chat_messages" left join "hiq_members"');
        expect(calls).toHaveLength(2);
        for (const c of calls) expect(flat(c.sql)).not.toContain("hiq_blocks");
    });

    it("운영자가 회원을 개인적으로 차단해 두었어도 그 회원의 문의는 보인다", async () => {
        world.blocks = [{ blocker: ADMIN_A, blocked: OWNER }, { blocker: ADMIN_A, blocked: ADMIN_B }];
        const rows = await repo.messages(support(OWNER), ADMIN_A, { locale: "ko" });
        expect(rows.map((r) => [r.senderId, r.message])).toEqual([[ADMIN_A, "안녕하세요, 랭큐입니다"], [OWNER, "네 안녕하세요"], [ADMIN_B, "이어서 답드려요"]]);
    });

    it("다른 방은 예전 그대로 — 1:1 에서는 차단한 사람의 글이 안 보인다", async () => {
        world.messages = [
            { id: "00000000-0000-4000-8000-000000000011", roomKey: DM.key, senderId: ADMIN_A, message: "개인적으로 연락드려요", type: "text", at: "2026-10-06 02:00:00" },
            { id: "00000000-0000-4000-8000-000000000012", roomKey: DM.key, senderId: STRANGER, message: "저도 있어요", type: "text", at: "2026-10-06 02:01:00" },
        ];
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_A }];
        const rows = await repo.messages(DM, OWNER, { locale: "ko" });
        expect(rows.map((r) => r.message)).toEqual(["저도 있어요"]);
        expect(messageQuery()).toContain('NOT EXISTS (SELECT 1 FROM "hiq_blocks" WHERE "hiq_blocks"."blocker_id" = $2 AND "hiq_blocks"."blocked_id" = "hiq_chat_messages"."sender_id")');
        expect(cap.calls[0].params[1]).toBe(OWNER);
    });

    it("채팅 목록: 차단해 둔 운영자가 먼저 말을 건 방이 빈 방으로 뜨지 않는다 — 마지막 글과 안 읽은 수가 채워진다", async () => {
        // 회원은 이 방에 쓴 적도, 들어온 적도 없다. 예전엔 방은 생기는데(글 수로 생긴다) 미리보기·배지가 비었고, 들어가도 비어 있었다
        world.messages = [{ id: "00000000-0000-4000-8000-000000000021", roomKey: `support:${OWNER}`, senderId: ADMIN_A, message: "안녕하세요, 랭큐입니다", type: "text", at: "2026-10-06 03:00:00" }];
        world.reads = [];
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_A }];
        const rooms = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        expect(rooms).toHaveLength(1);
        expect(rooms[0]).toMatchObject({ key: `support:${OWNER}`, subtitle: "운영팀 메시지", unread: 1 });
        expect(rooms[0].lastMessage).toMatchObject({ text: "안녕하세요, 랭큐입니다", senderName: "랭큐 운영팀" });
        // 방 안도 같은 눈이다
        expect((await repo.messages(support(OWNER), OWNER, { locale: "ko" })).map((r) => r.message)).toEqual(["안녕하세요, 랭큐입니다"]);
        expect(JSON.stringify(rooms)).not.toContain("최운영");
    });

    it("채팅 목록: 미리보기·안 읽은 수가 차단 여부에 따라 달라지지 않는다(목록으로도 가려낼 수 없다)", async () => {
        world.reads = [];
        const before = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        world.blocks = [{ blocker: OWNER, blocked: ADMIN_B }]; // 마지막 글을 쓴 운영자
        const after = await repo.myRooms(OWNER, "BILLIARDS", "ko");
        expect(after).toEqual(before);
        expect(after[0].unread).toBe(2);
        expect(after[0].lastMessage?.text).toBe("이어서 답드려요");
    });

    it("채팅 목록의 두 문장 모두 문의 방만 예외로 두고, 다른 방에는 차단을 그대로 건다", async () => {
        await repo.myRooms(OWNER, "BILLIARDS", "ko");
        const exempt = "AND (c.room_key LIKE 'support:%' OR NOT EXISTS (SELECT 1 FROM hiq_blocks b WHERE b.blocker_id = ";
        const last = callsWith("SELECT DISTINCT ON (c.room_key)");
        const unread = callsWith("count(*)::int AS n FROM hiq_chat_messages c");
        expect(last).toHaveLength(1);
        expect(unread).toHaveLength(1);
        expect(flat(last[0].sql)).toContain(exempt);
        expect(flat(unread[0].sql)).toContain(exempt);
        // 차단 조건이 통째로 사라진 것이 아니다 — 크루·1:1·조인 방의 미리보기에는 여전히 걸린다
        expect(flat(last[0].sql).split("FROM hiq_blocks b").length - 1).toBe(1);
        expect(flat(unread[0].sql).split("FROM hiq_blocks b").length - 1).toBe(1);
    });
});
