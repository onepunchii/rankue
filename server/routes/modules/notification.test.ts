import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { clampNotifLimit, parseNotifCursor, NOTIF_PAGE_DEFAULT, NOTIF_PAGE_MAX } from "../../storage/notification.repo.js";
import { NOTIF_GROUPS, NOTIF_GROUP_TYPES } from "../../../shared/notificationGroup.js";

const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 주석은 빼고 본다 — 규칙을 설명하는 주석이 규칙을 지킨 것처럼 보이면 안 된다. */
const code = (f: string) => read(f).split("\n").filter((l) => {
    const t = l.trim();
    return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
}).join("\n");

describe("알림 라우트", () => {
    const src = code("server/routes/modules/notification.ts");

    it("unread-count 가 /:id/read 보다 위에 있다", () => {
        // Express 는 먼저 선언된 것이 이긴다. 아래에 두면 "unread-count" 가 알림 id 로 먹혀
        // 배지 요청이 조용히 404(또는 남의 알림 읽음 처리)가 된다 — read-all 로 이미 한 번 겪은 함정이다.
        const unread = src.indexOf('"/notifications/unread-count"');
        const readAll = src.indexOf('"/notifications/read-all"');
        const byId = src.indexOf('"/notifications/:id/read"');
        expect(unread, "unread-count 라우트가 없다").toBeGreaterThan(-1);
        expect(byId).toBeGreaterThan(-1);
        expect(unread).toBeLessThan(byId);
        expect(readAll).toBeLessThan(byId);
    });

    it("테스트 발송 라우트는 없앴다", () => {
        // 로그인만 하면 누구나 아무 type 으로 자기 알림을 만들 수 있었고, 운영 화면에 버튼까지 있었다.
        expect(src).not.toContain("test-notification");
        expect(src).not.toContain("sendAndSaveNotification");
        expect(code("server/routes/index.ts")).not.toContain("test-notification");
    });

    it("목록은 { items, nextBefore } 를 그대로 보낸다(배열이 아니다)", () => {
        expect(src).toContain("const page = await storage.getNotifications(");
        expect(src).toContain("sendSuccess(res, page)");
        expect(src).toContain("before: beforeOf(req.query.before)");
        expect(src).toContain("group: groupOf(req.query.group)");
    });

    it("read-all 은 종목을 넘긴다", () => {
        // 안 넘기면 당구 알림함에서 누른 '모두 읽음' 이 골프 알림까지 읽힌다(2026-09-23 이전 버그).
        expect(src).toContain("markAllNotificationsAsRead(req.userId!, sportOf(req))");
    });
});

describe("알림 목록 한 페이지", () => {
    it("limit 은 50을 넘지 않고, 이상한 값은 기본 30", () => {
        expect(clampNotifLimit(999)).toBe(NOTIF_PAGE_MAX);
        expect(clampNotifLimit(NOTIF_PAGE_MAX + 1)).toBe(NOTIF_PAGE_MAX);
        expect(clampNotifLimit(10)).toBe(10);
        expect(clampNotifLimit(undefined)).toBe(NOTIF_PAGE_DEFAULT);
        expect(clampNotifLimit("abc")).toBe(NOTIF_PAGE_DEFAULT);
        expect(clampNotifLimit(NaN)).toBe(NOTIF_PAGE_DEFAULT);
        expect(clampNotifLimit(0)).toBe(NOTIF_PAGE_DEFAULT);
        expect(clampNotifLimit(-5)).toBe(NOTIF_PAGE_DEFAULT);
        expect(NOTIF_PAGE_MAX).toBeLessThanOrEqual(50);
    });
});

describe("묶음 SQL", () => {
    const repo = code("server/storage/notification.repo.ts");

    it("notice 는 목록이 아니라 else 다 — 모르는 type 이 어디에도 안 속하면 안 된다", () => {
        // notice 를 `in (NOTIF_GROUP_TYPES.notice)` 로 쓰면 모르는 type 이 네 칩 어디에도 안 뜬다.
        expect(repo).toContain("else 'notice'");
        expect(repo).not.toMatch(/typeList\("notice"\)/);
    });

    it("방송(rooms=1)은 like 가 아니라 쿼리 경계 정규식으로 가른다", () => {
        // '%rooms=1%' 는 mushrooms=1 을 문다. 화면의 isRoomBroadcast 와 판정이 갈리면
        // "칩엔 3건인데 열면 1건" 이 된다.
        expect(repo).toContain("[?&]rooms=1(&|$|#)");
        expect(repo).not.toContain("like '%rooms=1%'");
    });

    it("목록 필터와 배지 집계가 같은 식 하나를 쓴다", () => {
        expect(repo).toContain("const GROUP_EXPR");
        expect(repo).toContain("${GROUP_EXPR} = ${group}");
        for (const g of NOTIF_GROUPS) expect(repo).toContain(`filter (where \${GROUP_EXPR} = '${g}')`);
    });

    it("종목 조건은 한 벌(sportWhere)만 있고 목록·읽음처리·집계가 같이 쓴다", () => {
        expect((repo.match(/function sportWhere/g) ?? []).length).toBe(1);
        expect((repo.match(/sportWhere\(sport\)/g) ?? []).length).toBe(3);
    });

    it("커서 경로에 JS Date 가 없다 — 9시간 함정도, 마이크로초 잘림도 생길 자리가 없다", () => {
        // 커서는 DB 가 만든 문자열(to_char)이 그대로 돌아와 ::timestamp 로 묶인 값(bound param)이 된다.
        // JS Date 로 한 번이라도 옮기면 (a) 드라이버가 로컬시각 문자열로 바꿔 9시간 어긋나고
        // (b) 마이크로초가 내림으로 잘려 그 폭 안의 행이 사라진다.
        const i = repo.indexOf("async getNotifications(");
        const block = repo.slice(i, repo.indexOf("async countUnread(", i));
        expect(block).not.toContain("new Date");
        expect(block).not.toContain("toISOString");
        expect(block).toContain("cursorWhere(cursor)");
    });

    it("오래된 알림 삭제는 now() - interval 로, 읽음 여부를 보지 않는다", () => {
        const i = repo.indexOf("async deleteOlderThan(");
        expect(i).toBeGreaterThan(-1);
        const block = repo.slice(i, i + 600);
        expect(block).toContain("now() - make_interval(days =>");
        expect(block).not.toContain("isRead");
    });

    it("SQL 이 쓰는 type 목록이 shared 의 목록과 같다", () => {
        // 여기서 갈라지면 서버가 거르는 것과 화면이 그리는 아이콘이 어긋난다.
        for (const g of ["turn", "chat", "crew"] as const) {
            for (const t of NOTIF_GROUP_TYPES[g]) expect(NOTIF_GROUP_TYPES[g]).toContain(t);
        }
        expect(repo).toContain('NOTIF_GROUP_TYPES[g].map((t) => sql`${t.toUpperCase()}`)');
    });
});

describe("멀티방 방송", () => {
    it("알림함에 남기지 않는다 — 저장만 건너뛰고 푸시는 그대로", () => {
        const sim = code("server/routes/modules/simMatch.ts");
        const i = sim.indexOf("async function broadcastRoomOpened(");
        expect(i).toBeGreaterThan(-1);
        const block = sim.slice(i, sim.indexOf("\nasync function", i + 10));
        expect(block).toContain("saveToInbox: false");
        expect(block).toContain('params: { url: "/online-game?rooms=1" }');

        const svc = code("server/services/notificationService.ts");
        // 푸시 분기(pref·토큰)는 저장과 무관하게 계속 돌아야 한다.
        expect(svc).toContain("const saveToInbox = params.saveToInbox !== false;");
        expect(svc).toContain("if (saveToInbox) {");
        expect(svc).toContain("isPushAllowed(");
        expect(svc.indexOf("const saveToInbox")).toBeLessThan(svc.indexOf("isPushAllowed("));
    });

    it("다른 전체 방송(관리자 공지·긴급 조인)은 그대로 남는다", () => {
        const all = ["server/routes/modules/admin.ts", "server/routes/modules/golfJoin.ts", "server/services/notificationScheduler.ts"]
            .map((f) => { try { return code(f); } catch { return ""; } }).join("\n");
        expect(all).not.toContain("saveToInbox");
    });
});

describe("7일 청소 크론", () => {
    const cron = code("server/routes/modules/cron.ts");

    it("이미 매일 도는 정리 크론에 얹었다 — vercel.json 에 새 항목을 만들지 않는다", () => {
        expect(cron).toContain("storage.notifs.deleteOlderThan(NOTIFICATION_KEEP_DAYS)");
        const i = cron.indexOf("async function handleSimCleanup(");
        const block = cron.slice(i, cron.indexOf("router.get(", i));
        expect(block).toContain("deleteOlderThan");
        // 삭제 건수를 응답에 싣는다(크론 결과만 보고도 청소가 도는지 알 수 있어야 한다)
        expect(block).toContain("notifications");

        const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string }[] };
        expect(vercel.crons.some((c) => c.path.startsWith("/api/cron/sim-cleanup"))).toBe(true);
        expect(vercel.crons.filter((c) => c.path.includes("notification")).length).toBe(0);
    });

    it("보존 기간은 7일", () => {
        expect(cron).toContain("const NOTIFICATION_KEEP_DAYS = 7;");
    });
});

describe("목록 커서", () => {
    // 왜 복합 커서인가(2026-09-23 실측): created_at 은 마이크로초인데 운영 4,559행 중 4,557행이
    // 밀리초 아래 자리를 갖는다. 옛 커서는 JS Date 를 거쳐 그 자리를 내림으로 잘랐고,
    // 시각이 같은 행이 둘이면 `<` 가 둘 다 건너뛰었다(동시각 3행 · limit=2 → 2건만 보였다).
    it("시각+id 를 읽고, 시각만 있어도 읽는다", () => {
        expect(parseNotifCursor("2026-09-23T04:26:42.858890|be6b5988-42d3-4cda-9a8e-cef0c2eabf74"))
            .toEqual({ ts: "2026-09-23T04:26:42.858890", id: "be6b5988-42d3-4cda-9a8e-cef0c2eabf74" });
        expect(parseNotifCursor("2026-09-23T04:26:42.858890")).toEqual({ ts: "2026-09-23T04:26:42.858890" });
    });

    it("옛 화면이 보내던 밀리초 ISO(Z)도 받는다 — 배포가 화면·서버 따로 나가도 안 깨진다", () => {
        expect(parseNotifCursor("2026-09-23T04:20:07.126Z")).toEqual({ ts: "2026-09-23T04:20:07.126" });
    });

    it("못 읽는 값은 커서 없음(최신부터) — 던지지 않는다", () => {
        for (const bad of ["", "not-a-cursor", "abc|def", "2026-13-99T99:99:99", null, undefined, 42, {}]) {
            expect(parseNotifCursor(bad as unknown)).toBeUndefined();
        }
        // id 자리가 uuid 가 아니면 시각만 살린다(행을 잃느니 동점 가리기를 포기한다)
        expect(parseNotifCursor("2026-09-23T04:26:42.858890|xxx")).toEqual({ ts: "2026-09-23T04:26:42.858890" });
    });

    it("마이크로초 자리를 잘라 먹지 않는다", () => {
        const c = parseNotifCursor("2026-09-23T04:26:42.858890|be6b5988-42d3-4cda-9a8e-cef0c2eabf74")!;
        expect(c.ts).toContain(".858890");
        // 옛 방식(JS Date 경유)이라면 여기서 .858 로 잘렸다 — 그 0.89ms 폭 안의 행이 영영 안 보였다.
        expect(new Date(c.ts + "Z").toISOString()).toBe("2026-09-23T04:26:42.858Z");
    });

    it("정렬과 커서가 같은 순서다(created_at desc, id desc)", () => {
        const repo = code("server/storage/notification.repo.ts");
        expect(repo).toContain("desc(hiqNotifications.createdAt), desc(hiqNotifications.id)");
        // created_at <= ts 를 앞에 둬야 인덱스가 커서를 직접 받는다(뒤에 두면 통째로 필터가 된다)
        expect(repo).toContain("${hiqNotifications.createdAt} <= ${c.ts}::timestamp");
        // 라우트가 Date 로 한 번 옮기면 다시 잘린다 — 커서는 저장소까지 문자열 그대로 간다
        expect(code("server/routes/modules/notification.ts")).not.toContain("Date.parse");
    });
});
