import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    TRAIL_BATCH_MAX, TRAIL_IN_APP, TRAIL_KEEP_DAYS, TRAIL_NO_CLICK_PATH, TRAIL_SKIP_PATH,
    cleanTrailEvent, isTrailVisitor, pageKind, trailFirstLine, trailHref, trailLabel, trailPath,
} from "./uiTrail";

/**
 * 방문자 발자국(2026-10-08 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도 접목해 줘").
 * 폴리 것을 그대로 옮기면 새는 것들 — PIN·점수 숫자, 채팅 상대 이름, 네이버 결과 글자 — 을 막은 규칙을 고정한다.
 * 아래 이름·주소는 시험용으로 지어낸 값이다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("trailLabel — 단추 글자", () => {
    it("공백을 줄이고 40자로 자른다", () => {
        expect(trailLabel("  조인   올리기 \n")).toBe("조인 올리기");
        expect(trailLabel("가".repeat(60))).toHaveLength(40);
    });

    it("숫자·기호뿐인 글자는 남기지 않는다 — PIN 키패드·참가 코드·점수 단추를 누른 순서가 곧 그 값이다", () => {
        for (const s of ["7", "0", "12", "3 4", "+1", "-1", "1,200", "50%", "12:30", "#", "←", "1/2", "(3)", "×2"]) expect(trailLabel(s), s).toBeNull();
        // 글자가 섞이면 남긴다
        expect(trailLabel("3쿠션")).toBe("3쿠션");
        expect(trailLabel("조인 7")).toBe("조인 7");
    });

    it("한 글자·빈 글자·글자가 아닌 값은 남기지 않는다", () => {
        for (const s of ["", " ", "가", "x", null, undefined, 7, {}]) expect(trailLabel(s), String(s)).toBeNull();
    });
});

describe("trailFirstLine — 줄 전체가 링크인 목록", () => {
    it("숫자뿐인 줄(순위·점수)을 건너뛰고 첫 글자 줄만", () => {
        expect(trailFirstLine("1\n초록큐\n1,124\n0.553")).toBe("초록큐");
        expect(trailFirstLine("12\n34")).toBeNull();
        expect(trailFirstLine(undefined)).toBeNull();
    });
});

describe("trailPath · trailHref — 주소", () => {
    it("쿼리·해시를 떼고, 우리 화면 주소가 아니면 버린다", () => {
        expect(trailPath("/golf/course/세레니티CC?d=2026-10-11&t=0712#sec-tee")).toBe("/golf/course/세레니티CC");
        expect(trailPath("/kakao-preview?key=secret")).toBe("/kakao-preview");
        for (const s of ["https://evil.example/x", "//evil.example", "javascript:alert(1)", "", null, 3]) expect(trailPath(s), String(s)).toBeNull();
        expect(trailPath(`/${"a".repeat(400)}`)).toHaveLength(300);
    });

    it("누른 링크 — 안쪽은 경로만(쿼리 없음), 바깥은 호스트만. 전화·메일·스크립트 주소는 남기지 않는다", () => {
        const o = "https://www.rankue.co.kr";
        expect(trailHref("/golf/join/충청?alert=1", o)).toBe(`/golf/join/${encodeURIComponent("충청")}`);
        expect(trailHref("https://www.rankue.co.kr/stores?x=1", o)).toBe("/stores");
        expect(trailHref("https://map.kakao.com/link/to/어딘가,37.1,127.1", o)).toBe("↗map.kakao.com");
        for (const s of ["tel:031-000-0000", "mailto:a@b.c", "sms:010", "javascript:void(0)", "#top", "", null, undefined]) expect(trailHref(s, o), String(s)).toBeNull();
    });
});

describe("cleanTrailEvent — 서버가 한 번 더 거른다", () => {
    it("이름은 넷뿐(page · click · scroll · open)", () => {
        expect(cleanTrailEvent({ n: "page", p: "/stores" })).toEqual({ name: "page", path: "/stores", meta: {} });
        for (const n of ["nudge", "", "PAGE", undefined, 1]) expect(cleanTrailEvent({ n, p: "/stores" }), String(n)).toBeNull();
        for (const e of [null, undefined, "page", 3, []]) expect(cleanTrailEvent(e), String(e)).toBeNull();
    });

    it("관리자·사장님 콘솔은 받지 않는다", () => {
        for (const p of ["/admin", "/admin/dashboard", "/partner/login", "/partner/dashboard"]) {
            expect(cleanTrailEvent({ n: "page", p }), p).toBeNull();
            expect(cleanTrailEvent({ n: "click", p, m: { l: "회원 관리" } }), p).toBeNull();
        }
        // 이름이 닮은 주소는 받는다
        expect(cleanTrailEvent({ n: "page", p: "/partners" })?.path).toBe("/partners");
    });

    it("채팅·친구·경기 중·게임·가입 절차 — 화면 이동은 남기고 누른 것은 버린다", () => {
        for (const p of ["/chat", "/chat/dm/abc", "/friends", "/game/abc", "/game/result", "/golf/game/abc", "/golf/game/abc/result", "/online-game", "/golf/play", "/golf/minigolf", "/golf/arcade", "/golf/range", "/register", "/auth/kakao", "/kakao-preview"]) {
            expect(TRAIL_NO_CLICK_PATH.test(p), p).toBe(true);
            expect(cleanTrailEvent({ n: "click", p, m: { l: "아무 이름" } }), p).toBeNull();
            expect(cleanTrailEvent({ n: "page", p })?.path, p).toBe(p);
        }
        // 닮았지만 다른 화면은 누른 것도 남긴다
        for (const p of ["/golf/join", "/golf/courses", "/community", "/club/abc", "/golf/passport", "/gamers"]) expect(TRAIL_NO_CLICK_PATH.test(p), p).toBe(false);
    });

    it("누름 — 글자가 있어야 하고(숫자뿐이면 버림), 글자는 40자, 주소는 경로·호스트만", () => {
        expect(cleanTrailEvent({ n: "click", p: "/golf/courses", m: { l: "  조인   올리기 ", h: "/golf/booking-list?view=JOIN&new=1" } }))
            .toEqual({ name: "click", path: "/golf/courses", meta: { l: "조인 올리기", h: "/golf/booking-list" } });
        expect(cleanTrailEvent({ n: "click", p: "/dashboard", m: { l: "7" } })).toBeNull();
        expect(cleanTrailEvent({ n: "click", p: "/dashboard", m: {} })).toBeNull();
        expect(cleanTrailEvent({ n: "click", p: "/golf/course/x", m: { l: "길찾기", h: "↗map.kakao.com/link/to/x?y=1" } })?.meta).toEqual({ l: "길찾기", h: "↗map.kakao.com" });
        expect(cleanTrailEvent({ n: "click", p: "/golf/course/x", m: { l: "길찾기", h: "https://evil.example/a" } })?.meta).toEqual({ l: "길찾기" });
        // 모르는 칸은 버린다 — 입력값·임의의 글자가 실려 오지 못한다
        expect(cleanTrailEvent({ n: "click", p: "/x", m: { l: "저장", value: "010-0000-0000", note: "x".repeat(999) } })?.meta).toEqual({ l: "저장" });
    });

    it("스크롤은 50·90 만, 열림은 글자가 있어야", () => {
        expect(cleanTrailEvent({ n: "scroll", p: "/stores", m: { d: 50 } })?.meta).toEqual({ d: 50 });
        expect(cleanTrailEvent({ n: "scroll", p: "/stores", m: { d: 90 } })?.meta).toEqual({ d: 90 });
        for (const d of [10, "50", 100, undefined]) expect(cleanTrailEvent({ n: "scroll", p: "/stores", m: { d } }), String(d)).toBeNull();
        expect(cleanTrailEvent({ n: "open", p: "/golf/course/x", m: { l: "가입 창" } })?.meta).toEqual({ l: "가입 창" });
        expect(cleanTrailEvent({ n: "open", p: "/golf/course/x", m: {} })).toBeNull();
        // 채팅 화면에서 가입 창이 열린 것은 남는다(누름이 아니다)
        expect(cleanTrailEvent({ n: "open", p: "/chat", m: { l: "가입 창" } })?.name).toBe("open");
    });

    it("화면 — 유입처는 호스트 꼴만, 기기는 m·d 만. 화면 줄에 누른 글자는 실리지 않는다", () => {
        expect(cleanTrailEvent({ n: "page", p: "/golf/course/x", m: { ref: "Search.Naver.com", w: "m", l: "몰래" } })?.meta).toEqual({ ref: "search.naver.com", w: "m" });
        expect(cleanTrailEvent({ n: "page", p: "/", m: { ref: "https://search.naver.com/search?query=비밀", w: "tablet" } })?.meta).toEqual({});
    });
});

describe("isTrailVisitor", () => {
    it("방문 비콘과 같은 난수 ID 꼴만", () => {
        expect(isTrailVisitor("3f2c1a9e-0000-4000-8000-000000000001")).toBe(true);
        for (const v of ["", "short", "a b c d e f g h", "x".repeat(65), "<script>", null, 12345678]) expect(isTrailVisitor(v), String(v)).toBe(false);
    });
});

describe("pageKind — 화면 종류로 묶기", () => {
    it("낱개가 수백 개인 주소는 앞머리만", () => {
        const cases: [string, string][] = [
            ["/", "/ (첫 화면)"], ["/dashboard", "/dashboard (홈)"],
            ["/golf/course/세레니티CC", "/golf/course/…"], [`/golf/course/${encodeURIComponent("수원CC")}`, "/golf/course/…"],
            ["/golf/courses", "/golf/courses"], ["/golf/courses/경기", "/golf/courses/…"], ["/golf/courses/경기/용인", "/golf/courses/…"],
            ["/golf/join", "/golf/join"], ["/golf/join/충청", "/golf/join/…"], ["/golf/booking/강원/춘천", "/golf/booking/…"], ["/golf/urgent/제주", "/golf/urgent/…"],
            ["/golf/booking-list", "/golf/booking-list"], ["/golf/booking-list/abc", "/golf/booking-list/…"],
            ["/golf/terms/핸디캡", "/golf/terms/…"], ["/golf/find/2인/경기", "/golf/find/…"], ["/golf/membership/12", "/golf/membership/…"],
            ["/golf/game/new", "/golf/game/new"], ["/golf/game/abc/result", "/golf/game/…"],
            ["/stores", "/stores"], ["/stores/register", "/stores/register"], ["/stores/AB12", "/stores/…"], ["/store/어느당구장", "/store/…"],
            ["/r/abc", "/r/…"], ["/join/XY99", "/join/…"],
            ["/club", "/club"], ["/club/create", "/club/create"], ["/club/abc", "/club/…"], ["/crew/abc/hall-of-fame", "/crew/…"], ["/crew/abc/board", "/crew/…"],
            ["/game/result", "/game/result"], ["/game/abc", "/game/…"],
            ["/chat", "/chat"], ["/chat/dm/abc", "/chat/…"],
            ["/community", "/community"], ["/community/123", "/community/…"], ["/briefing/2026-10-08", "/briefing/…"],
            ["/player/3c/1234", "/player/…"], ["/pba-player/abc", "/pba-player/…"], ["/golfer/kpga/77", "/golfer/…"],
            ["/world-ranking", "/world-ranking"], ["/world-ranking/country/KOR", "/world-ranking/country/…"], ["/world-ranking/movers", "/world-ranking/movers"],
            ["/tournaments", "/tournaments"], ["/tournaments/pba/2026/T1", "/tournaments/pba/…"], ["/tournaments/umb/world-cup", "/tournaments/umb/…"],
            ["/billiards/terms", "/billiards/terms"], ["/billiards/terms/뱅크샷", "/billiards/terms/…"],
            ["/ranking", "/ranking"], ["/menu", "/menu"], ["/golf/passport", "/golf/passport"],
        ];
        for (const [p, kind] of cases) expect(pageKind(p), p).toBe(kind);
    });

    it("끝의 빗금·깨진 인코딩·빈 값에도 죽지 않는다", () => {
        expect(pageKind("/golf/courses/")).toBe("/golf/courses");
        expect(pageKind("/golf/course/%E0%A4%A")).toBe("/golf/course/…");
        expect(pageKind(null)).toBe("/");
        expect(pageKind(`/${"x".repeat(80)}`)).toHaveLength(41);
    });
});

describe("수집기(Tracker)와 표시해 둔 구역", () => {
    const tracker = code(root("client/src/components/hiq/Tracker.tsx"));

    it("방문 비콘과 같은 방문자 ID 를 쓴다", () => {
        expect(tracker).toContain('const ID_KEY = "rankue-visitor";');
        expect(code(root("client/src/components/hiq/VisitBeacon.tsx"))).toContain('const ID_KEY = "rankue-visitor";');
    });

    it("끄는 곳 — 개발 서버(운영 DB 를 같이 쓴다) · 앱 안(스토어 개인정보 표기 전) · 관리자 콘솔", () => {
        expect(TRAIL_IN_APP).toBe(false);
        expect(tracker).toContain("return !TRAIL_IN_APP && isNativeApp();");
        expect(tracker).toContain("localhost|127\\.0\\.0\\.1");
        expect(tracker).toContain("if (disabled.current || TRAIL_SKIP_PATH.test(e.p)) return;");
        expect(TRAIL_SKIP_PATH.test("/admin/dashboard")).toBe(true);
    });

    it("누름 — 채팅·경기 중 화면, data-notrack, 입력칸은 건너뛰고 · data-track-as 구역은 구역 이름만(주소 없음) · 글자는 규칙을 지난 것만", () => {
        expect(tracker).toContain("if (TRAIL_NO_CLICK_PATH.test(path)) return;");
        expect(tracker).toContain('el.closest("[data-notrack], input, textarea, select, [contenteditable=true]")');
        const zone = tracker.slice(tracker.indexOf('const zone = el.closest("[data-track-as]");'), tracker.indexOf("const label = trailLabel("));
        expect(zone).toContain('push.current({ n: "click", p: path, m: { l }, t: Date.now() });');
        expect(zone).toContain("return;");
        expect(zone).not.toContain("href");
        expect(tracker).toContain('const label = trailLabel(el.getAttribute("data-track")) ?? trailLabel(el.getAttribute("aria-label")) ?? trailFirstLine((el as HTMLElement).innerText);');
        expect(tracker).toContain("if (!label) return;");
        // 입력값을 읽는 코드가 없다
        expect(tracker).not.toMatch(/\.value\b|FormData|keyCode|\.key\b|inputType/);
    });

    it("사람인지 확인되기 전(첫 조작·5초 체류)에는 보내지 않고, 모아서 한 번에 보낸다", () => {
        expect(tracker).toContain("if (!human.current || buf.current.length === 0) return;");
        expect(tracker).toContain("const FLUSH_MS = 20_000;");
        expect(tracker).toContain("buf.current.splice(0, TRAIL_BATCH_MAX)");
        expect(TRAIL_BATCH_MAX).toBe(60);
    });

    it("숫자 키패드는 data-notrack, 네이버 검색 결과 두 구역은 data-track-as(글자·주소 저장 금지)", () => {
        expect(root("client/src/components/hiq/dashboard/PinCodeModal.tsx")).toContain('<div data-notrack className="grid grid-cols-3 gap-4 w-full px-2">');
        expect(root("client/src/golf/components/course/detail/NearbyPlaces.tsx")).toContain('<ul data-track-as="근처 검색 결과" className="divide-y divide-[#FFFFFF0A]">');
        expect(root("client/src/components/hiq/TourNews.tsx")).toContain('<ul data-track-as="투어 소식" className="flex flex-col gap-1.5">');
    });

    it("앱에 붙어 있고, 가입 창이 열리면 한 줄 남는다", () => {
        expect(root("client/src/App.tsx")).toContain("<Tracker />");
        expect(code(root("client/src/components/hiq/LoginSheet.tsx"))).toContain('trailOpen("가입 창");');
    });
});

describe("서버 — 수집 · 조회 · 정리", () => {
    const ingest = code(root("server/routes/modules/uiEvents.ts"));
    const admin = code(root("server/routes/modules/adminVisitors.ts"));

    it("수집: 봇은 받지 않고, IP 는 한도 세기에만 쓰고 저장하지 않는다. 회원 id 는 서명 쿠키에서만", () => {
        expect(ingest).toContain('if (isBotUA(req.get("user-agent"))) return res.status(204).end();');
        expect(ingest).toContain("const cookie = req.signedCookies?.hiq_user_id;");
        expect(ingest).not.toMatch(/body\.(member|memberId|userId)/);
        expect(ingest).toContain("insert into ui_events (name, visitor, member_id, path, meta, created_at) values");
        expect(ingest).not.toMatch(/insert into ui_events \([^)]*ip/i);
        expect(ingest).toContain("const row = cleanTrailEvent(e);");
        // 실패해도 화면에는 아무 일 없다
        expect(ingest.match(/res\.status\(204\)\.end\(\)/g)!.length).toBeGreaterThanOrEqual(5);
    });

    it("조회: 관리자 가드 뒤, 전부 GET(보기 전용 관리자도 본다 — 고치는 길이 없다)", () => {
        expect(admin).toContain("router.use(checkSuperAdmin);");
        expect(admin.indexOf("router.use(checkSuperAdmin);")).toBeLessThan(admin.indexOf("router.get("));
        expect(admin.match(/router\.get\(/g)).toHaveLength(3);
        expect(admin).not.toMatch(/router\.(post|put|patch|delete)\(/);
        expect(admin).not.toMatch(/\b(insert|update|delete)\b[^`]*\bui_events\b/i);
        expect(code(root("server/routes/modules/admin.ts"))).toContain('router.use("/visitors", adminVisitorsRouter);');
        expect(code(root("server/routes.ts"))).toContain('app.use("/api", uiEventsRouter);');
    });

    it("조회: 날짜 경계는 한국 자정 · 회원 표의 시간대 없는 UTC 는 UTC 로 읽는다(9시간 함정)", () => {
        expect(admin).toContain("date_trunc('day', now() at time zone 'Asia/Seoul')");
        expect(admin).toContain("from hiq_members where (created_at at time zone 'UTC') >=");
    });

    it("정리: 하루 한 번 도는 크론이 60일 지난 줄을 지운다", () => {
        expect(TRAIL_KEEP_DAYS).toBe(60);
        expect(code(root("server/routes/modules/cron.ts"))).toContain("delete from ui_events where created_at < now() - make_interval(days => ${TRAIL_KEEP_DAYS})");
    });

    it("표 — 더하기만(새 표), created_at 은 timestamptz, 회원 id 에 FK 없음", () => {
        const ddl = root("migrations/ui_events.sql");
        expect(ddl).toContain("create table if not exists ui_events (");
        expect(ddl).toContain("created_at timestamptz not null default now()");
        expect(ddl).toContain("member_id uuid,");
        expect(ddl).not.toMatch(/^\s*(drop|alter|delete|truncate)\b/im);
        expect(ddl).not.toMatch(/references/i);
        const schema = root("shared/schema.ts");
        expect(schema).toContain('export const uiEvents = pgTable("ui_events", {');
        expect(schema).toContain('createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),');
    });
});

describe("개인정보 처리방침 — 무엇을 모으는지 적혀 있다(화면 · 검색엔진용 화면 두 곳)", () => {
    it("본 화면·누른 메뉴·유입 경로, 임의의 번호로만 구분, 입력 내용·IP 없음, 60일", () => {
        for (const p of ["client/src/pages/privacy.tsx", "server/prerender.ts"]) {
            const s = root(p);
            expect(s, p).toContain("서비스 이용 기록(접속 일시·이용 시간·기기 종류, 웹에서 본 화면·누른 메뉴·유입 경로)");
            expect(s, p).toContain("입력한 내용과 IP 주소는 남기지 않으며 60일 뒤 지웁니다.");
        }
    });
});
