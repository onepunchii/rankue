import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    ACTIVITY_DAYS, ACTIVITY_LIMITS, VISIT_GAP_MIN, activityDayLabel, activityDaysOf, activityFromDay, activitySinceIso,
    buildMemberActivity, foldVisits, minutesLabel, type ActivityRecordRow, type ActivitySessionRow, type ActivityTrailRow,
} from "./memberActivity";

/**
 * 2026-10-12 오너: "어드민 대시보드에 회원 내역 나오잖아 — 그거 클릭하면 관리에 탭 하나 더 만들어 줘. 일자별로 어떠한 클릭을 했고 활동을 했는지"
 * → 회원 상세 창 → 관리 → '활동 기록'. 여기는 날짜로 접는 셈과, 지켜야 할 뼈대(채팅 내용을 읽지 않는다 · 조회만 · 아이폰 상태바)를 고정한다.
 * 화면은 하니스로, 질의는 운영 자료(읽기 전용)로 봤다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

const S = (open: string, end: string, platform = "android"): ActivitySessionRow => ({ open: `2026-10-12T${open}`, end: `2026-10-12T${end}`, platform });
const build = (p: { sessions?: ActivitySessionRow[]; trail?: ActivityTrailRow[]; records?: ActivityRecordRow[] }) =>
    buildMemberActivity({ days: 30, from: "2026-09-13", sessions: p.sessions ?? [], trail: p.trail ?? [], records: p.records ?? [] });

describe("기간", () => {
    it("7·30·90일만 받고, 그 밖은 30일", () => {
        expect([...ACTIVITY_DAYS]).toEqual([7, 30, 90]);
        expect(activityDaysOf("7")).toBe(7);
        expect(activityDaysOf(90)).toBe(90);
        for (const v of ["1", "365", "", undefined, "abc", "30; drop"]) expect(activityDaysOf(v), String(v)).toBe(30);
    });

    it("시작은 한국 자정이다 — 한국 시각으로 날이 바뀐 직후에도 오늘이 첫 줄에 든다", () => {
        // 한국 10/12 00:30 = UTC 10/11 15:30
        const justAfterMidnight = new Date("2026-10-11T15:30:00Z");
        expect(activitySinceIso(justAfterMidnight, 1)).toBe("2026-10-11T15:00:00.000Z");
        expect(activityFromDay(activitySinceIso(justAfterMidnight, 1))).toBe("2026-10-12");
        expect(activityFromDay(activitySinceIso(justAfterMidnight, 7))).toBe("2026-10-06");
        // 한국 10/12 23:59 도 같은 날
        expect(activityFromDay(activitySinceIso(new Date("2026-10-12T14:59:00Z"), 30))).toBe("2026-09-13");
        // 한국 자정 직전(UTC 14:59)과 직후(UTC 15:00)는 다른 날
        expect(activityFromDay(activitySinceIso(new Date("2026-10-12T15:00:00Z"), 1))).toBe("2026-10-13");
    });

    it("날짜 이름표", () => {
        expect(activityDayLabel("2026-10-12")).toBe("10.12 (월)");
        expect(activityDayLabel("2026-10-11")).toBe("10.11 (일)");
        expect(activityDayLabel("엉뚱")).toBe("엉뚱");
    });
});

describe("접속 묶기", () => {
    it(`${VISIT_GAP_MIN}분 안에 다시 열면 같은 접속 — 쓴 시간은 세션 길이의 합(빈 시간은 세지 않는다)`, () => {
        const v = foldVisits([S("14:00:00", "14:05:00"), S("14:20:00", "14:30:00"), S("14:59:00", "15:00:00")]);
        expect(v).toHaveLength(1);
        expect(v[0]).toMatchObject({ open: "2026-10-12T14:00:00", end: "2026-10-12T15:00:00", seconds: 5 * 60 + 10 * 60 + 60, sessions: 3 });
    });

    it("그보다 오래 비면 새 접속 · 순서가 뒤섞여 와도 시간순으로", () => {
        const v = foldVisits([S("20:00:00", "20:10:00", "ios"), S("09:00:00", "09:03:00", "web"), S("09:34:00", "09:40:00", "web")]);
        expect(v.map((x) => [x.open.slice(11, 16), x.sessions])).toEqual([["09:00", 1], ["09:34", 1], ["20:00", 1]]);
    });

    it("기기가 섞이면 둘 다 적는다 · 끝이 이상한 줄(시작보다 이르거나 없음)은 길이 0", () => {
        const v = foldVisits([S("10:00:00", "10:10:00", "web"), S("10:12:00", "10:15:00", "ios"), { open: "2026-10-12T10:16:00", end: "2026-10-12T09:00:00", platform: "ios" }, { open: "2026-10-12T10:17:00", end: null as any, platform: "ios" }]);
        expect(v).toHaveLength(1);
        expect(v[0].platforms).toEqual(["web", "ios"]);
        expect(v[0].seconds).toBe(13 * 60);
        expect(v[0].sessions).toBe(4);
    });

    it("날이 바뀌면 끊는다 · 엉뚱한 줄은 버린다", () => {
        const v = foldVisits([{ open: "2026-10-11T23:50:00", end: "2026-10-11T23:59:00", platform: "ios" }, { open: "2026-10-12T00:05:00", end: "2026-10-12T00:10:00", platform: "ios" }, { open: "엉뚱", end: "x", platform: "ios" }, null as any]);
        expect(v.map((x) => x.open.slice(0, 10))).toEqual(["2026-10-11", "2026-10-12"]);
    });

    it("하루 수백 번 열고 닫는 사람도 몇 줄이 된다(운영에 하루 556번인 회원이 있다)", () => {
        const many: ActivitySessionRow[] = [];
        for (let i = 0; i < 500; i++) { const m = String(Math.floor(i / 10)).padStart(2, "0"), s = String((i % 10) * 6).padStart(2, "0"); many.push(S(`13:${m}:${s}`, `13:${m}:${s}`, "web")); }
        expect(foldVisits(many)).toHaveLength(1);
        expect(foldVisits(many)[0].sessions).toBe(500);
    });

    it("쓴 시간 글자", () => {
        expect(minutesLabel(0)).toBe("1분 미만");
        expect(minutesLabel(59)).toBe("1분 미만");
        expect(minutesLabel(60)).toBe("1분");
        expect(minutesLabel(38 * 60)).toBe("38분");
        expect(minutesLabel(60 * 60)).toBe("1시간");
        expect(minutesLabel(72 * 60)).toBe("1시간 12분");
    });
});

describe("날짜로 접기", () => {
    const a = build({
        sessions: [S("14:00:00", "14:41:00"), { open: "2026-10-10T09:00:00", end: "2026-10-10T09:02:00", platform: "web" }],
        trail: [
            { at: "2026-10-10T09:00:05", name: "page", path: "/golf/course/%EC%84%B8%EB%A0%88%EB%8B%88%ED%8B%B0CC", ref: "google.com" },
            { at: "2026-10-10T09:00:20", name: "click", path: "/golf/course/x", l: "조인 보기", h: "/golf/find" },
            { at: "2026-10-10T09:00:20", name: "page", path: "/golf/find" },
            { at: "2026-10-10T09:01:00", name: "open", path: "/golf/find", l: "가입 창" },
            { at: "2026-10-10T09:01:10", name: "scroll", path: "/golf/find" },
            { at: "2026-10-10T09:01:20", name: "click", path: "/golf/find", l: null },
            { at: "엉뚱", name: "page", path: "/" },
        ],
        records: [
            { at: "2026-10-12T14:10:00", kind: "game", a: "3c", b: "match", c: "김상대", n: 25, m: 31, f: true, g: true },
            { at: "2026-10-12T14:30:00", kind: "game", a: "4c", b: "match", c: "이상대", n: 120, m: 14, f: false, g: false },
            { at: "2026-10-12T14:35:00", kind: "game", a: "3c", b: "practice", n: 12, m: 20, f: false, g: false },
            { at: "2026-10-12T14:36:00", kind: "game", a: "golf", b: "match", c: "세레니티CC", d: "레이크 / 마운틴", n: 81, m: 0, f: false, g: true },
            { at: "2026-10-12T14:37:00", kind: "simMatch", a: "3c", b: "resign", c: "박상대", f: true, g: true },
            { at: "2026-10-12T14:38:00", kind: "simMatch", a: "4c", b: "target", c: null, f: null, g: false },
            { at: "2026-10-12T14:39:00", kind: "sim", a: "3c", n: 12, m: 0 },
            { at: "2026-10-12T14:39:30", kind: "simRoom", n: 3 },
            { at: "2026-10-12T14:39:40", kind: "drill", n: 5, m: 2 },
            { at: "2026-10-12T14:40:00", kind: "chat", a: "dm", n: "8" },
            { at: "2026-10-12T14:05:00", kind: "chat", a: "crew", n: 4 },
            { at: "2026-10-12T14:06:00", kind: "chat", a: "모르는방", n: 1 },
            { at: "2026-10-12T14:07:00", kind: "chat", a: "dm", n: 0 },
            { at: "2026-10-10T09:01:30", kind: "golfApply", a: "cancelled", c: "세레니티CC" },
            { at: "2026-10-10T09:01:40", kind: "golfPost", a: "JOIN", c: "세레니티CC", f: false },
            { at: "2026-10-10T09:01:45", kind: "golfStart", a: "abandoned", c: "세레니티CC" },
            { at: "2026-10-10T09:01:50", kind: "report", a: "golf_booking" },
            { at: "2026-10-10T09:01:55", kind: "suggest", a: "BUG" },
            { at: "2026-10-10T09:01:56", kind: "모르는종류", a: "x" },
            { at: "2026-09-20T12:00:00", kind: "signup" },
        ],
    });
    const day = (d: string) => a.list.find((x) => x.day === d)!;
    const lines = (d: string) => day(d).items.map((i) => `${i.at.slice(11, 16)} ${i.tag} ${i.text}${i.sub ? ` | ${i.sub}` : ""}`);

    it("날짜는 최근부터, 날 안에서는 이른 시각부터", () => {
        expect(a.list.map((d) => d.day)).toEqual(["2026-10-12", "2026-10-10", "2026-09-20"]);
        const at = day("2026-10-12").items.map((i) => i.at);
        expect(at).toEqual([...at].sort());
        expect(day("2026-10-12").items[0]).toMatchObject({ group: "visit", tag: "접속", text: "안드로이드 앱으로 들어옴", sub: "14:41까지 · 쓴 시간 41분" });
    });

    it("발자국 — 화면·누름·열림만. 스크롤과 글자 없는 누름은 버리고, 같은 초의 줄은 남긴 순서대로", () => {
        expect(lines("2026-10-10").filter((l) => /화면|누름|열림/.test(l))).toEqual([
            "09:00 화면 /golf/course/세레니티CC | google.com에서",
            "09:00 누름 “조인 보기” | → /golf/find",
            "09:00 화면 /golf/find",
            "09:01 열림 가입 창",
        ]);
        expect(day("2026-10-10")).toMatchObject({ pages: 2, clicks: 1, visits: 1, minutes: 2, platforms: ["web"] });
    });

    it("경기 — 승패·점수·이닝·상대. 랭킹전이 아니면 친선, 연습에는 승패를 적지 않는다", () => {
        const l = lines("2026-10-12");
        expect(l).toContain("14:10 경기 3쿠션 대결 · 승 · 25점 / 31이닝 | 상대 김상대");
        expect(l).toContain("14:30 경기 4구 대결(친선) · 패 · 120점 / 14이닝 | 상대 이상대");
        expect(l).toContain("14:35 경기 3쿠션 연습 · 12점 / 20이닝");
        expect(l).toContain("14:36 라운드 골프 라운드 기록 · 81타 | 세레니티CC (레이크 / 마운틴) · 현장 인증");
    });

    it("온라인게임 — 승자가 없는 판은 '패'가 아니다", () => {
        const l = lines("2026-10-12");
        expect(l).toContain("14:37 대전 온라인 대전 · 3쿠션 · 승 | 상대 박상대 · 방 만듦 · 기권으로 끝남");
        expect(l).toContain("14:38 대전 온라인 대전 · 4구 · 승부 없음 | 방에 들어감");
        expect(l).toContain("14:39 연습 온라인 연습 · 3쿠션 12판 | 끝까지 친 판 없음");
        expect(l).toContain("14:39 대전 온라인 대전 방을 만들었다 닫음 3번");
        expect(l).toContain("14:39 연습 이번 주 과제 5번 시도 | 성공 2번");
    });

    it("채팅은 하루 한 줄 — 건수와 방 종류뿐(0건·내용 없음)", () => {
        const chat = day("2026-10-12").items.filter((i) => i.tag === "채팅");
        expect(chat).toHaveLength(1);
        expect(chat[0]).toMatchObject({ at: "2026-10-12T14:05:00", text: "채팅 13건 보냄", sub: "1:1 8 · 크루 4 · 그 밖 1" });
    });

    it("골프·기타 — 상태는 우리말로, 모르는 종류는 버린다", () => {
        const l = lines("2026-10-10");
        expect(l).toContain("09:01 신청 조인·부킹 신청 · 세레니티CC | 취소함");
        expect(l).toContain("09:01 글 조인 글 올림 · 세레니티CC");
        expect(l).toContain("09:01 라운드 골프 라운드 시작 · 세레니티CC | 끝내지 않고 닫음");
        expect(l).toContain("09:01 신고 신고함 · 조인·부킹 글");
        expect(l).toContain("09:01 건의 건의 보냄 · 오류 신고");
        expect(l.some((x) => x.includes("모르는종류"))).toBe(false);
        expect(lines("2026-09-20")).toEqual(["12:00 가입 랭큐 가입"]);
    });

    it("그날의 묶음별 줄 수와 기간 합계", () => {
        expect(day("2026-10-12").counts).toEqual({ visit: 1, game: 3, golf: 1, sim: 5, social: 1 });
        expect(day("2026-10-10").counts).toEqual({ visit: 1, trail: 4, golf: 3, etc: 2 });
        expect(a.totals).toEqual({ activeDays: 3, visits: 2, minutes: 43, pages: 2, clicks: 1 });
        expect(a.capped).toEqual([]);
    });

    it("상한에 걸리면 그렇다고 알린다", () => {
        const trail = Array.from({ length: ACTIVITY_LIMITS.trail }, (_, i): ActivityTrailRow => ({ at: "2026-10-12T10:00:00", name: "page", path: `/p/${i}` }));
        expect(build({ trail }).capped).toEqual(["trail"]);
    });

    it("빈 회원", () => {
        expect(build({})).toMatchObject({ list: [], totals: { activeDays: 0, visits: 0, minutes: 0, pages: 0, clicks: 0 } });
    });
});

describe("뼈대", () => {
    const storage = code(root("server/storage/adminMemberActivity.ts"));
    const shared = code(root("shared/memberActivity.ts"));

    it("채팅·댓글은 세기만 한다 — 내용 칸을 읽지 않는다", () => {
        expect(storage).not.toMatch(/\.message\b/);
        expect(storage).not.toMatch(/\bcc\.content\b|\bch\.metadata\b|\bsg\.content\b|\bpc\.content\b|\bcp\.content\b|\bwp\.content\b/);
        expect(storage).toContain("from hiq_chat_messages ch where ch.sender_id = ${id} and ch.type <> 'system'");
    });

    it("질의가 내는 종류와 글로 바꾸는 표가 같다(어긋나면 줄이 말없이 사라진다)", () => {
        const sent = [...storage.matchAll(/row\("([A-Za-z]+)"/g)].map((m) => m[1]).sort();
        const table = shared.slice(shared.indexOf("const RECORD:"), shared.indexOf("function trailLine"));
        const known = [...table.matchAll(/^ {4}([A-Za-z]+): \(/gm)].map((m) => m[1]);
        expect(sent.length).toBe(new Set(sent).size);
        expect(sent).toEqual([...known, "chat"].sort());
    });

    it("시각은 글자로만 주고받는다 — 시간대 없는 칸은 +9시간, 발자국만 timestamptz", () => {
        expect(storage).toContain("to_char(${col} + interval '9 hours', ${FMT})");
        expect(storage).toContain("to_char(created_at at time zone 'Asia/Seoul', ${FMT})");
        expect(storage).toContain("const since = sql`(${sinceIso}::timestamptz at time zone 'UTC')`;");
        expect(storage).not.toMatch(/new Date\(\)\s*[,)]\s*\}/);
    });

    it("주소는 조회(GET)뿐 — 관리자 가드와 id 검사를 거친다", () => {
        const admin = code(root("server/routes/modules/admin.ts"));
        const at = admin.indexOf('router.get("/members/:id/activity", checkSuperAdmin,');
        expect(at).toBeGreaterThan(0);
        const body = admin.slice(at, at + 520);
        expect(body).toContain("if (!MEMBER_ID_RE.test(req.params.id)) return sendError(res, 404");
        expect(body).toContain("activityDaysOf(req.query.days)");
        expect(admin).not.toMatch(/router\.(post|patch|put|delete)\("\/members\/:id\/activity"/);
    });

    it("화면 — 회원 상세의 '관리' 맨 위 줄에서 열고, 보기 전용 관리자에게도 나온다", () => {
        const sheet = code(root("client/src/pages/admin/MemberDetailSheet.tsx"));
        const rowAt = sheet.indexOf("<button data-member-activity onClick={() => setActivityFor({ id: m.id, name: m.name })}");
        expect(rowAt).toBeGreaterThan(sheet.indexOf(">관리</h3>"));
        expect(rowAt).toBeLessThan(sheet.indexOf(">경기 기록 정리</span>"));
        expect(sheet.slice(rowAt, rowAt + 120)).not.toContain("data-admin-write");
        expect(sheet).toContain("<MemberActivitySheet member={activityFor} onClose={() => setActivityFor(null)} />");
        // 다른 회원을 열면 닫힌다
        expect(sheet).toContain("setActivityFor(null);");
    });

    it("화면 — 남의 활동을 기기에 남기지 않고, 아이폰 상태바를 비킨다. 무엇이 안 남는지도 적는다", () => {
        const view = code(root("client/src/pages/admin/MemberActivitySheet.tsx"));
        expect(view).toContain("enabled: !!member, staleTime: 0, gcTime: 0,");
        expect(view).toContain('<SheetContent side="right" style={SHEET_SAFE_TOP} className="w-full sm:max-w-lg p-0 flex flex-col gap-0 bg-white">');
        // 창 전체를 스크롤하면 붙는 머리줄이 닫기(X) 단추를 덮는다 — 목록만 스크롤한다(방문자 발자국의 창도 같이 고쳤다)
        expect(view).toContain('<div data-activity-scroll className="flex-1 min-h-0 overflow-y-auto');
        for (const f of ["MemberActivitySheet.tsx", "VisitorsView.tsx"]) {
            const s = code(root("client/src/pages/admin/" + f));
            const at = s.indexOf('<SheetContent side="right"');
            expect(s.slice(at, s.indexOf("</SheetContent>", at)), f).not.toMatch(/sticky top-0|<SheetContent[^>]*overflow-y-auto/);
        }
        expect(view).toContain("본 화면과 누른 것은 웹에서 쓴 것만 남습니다");
        expect(view).toContain('{TRAIL_IN_APP ? " " : " 앱 안에서 누른 것은 아직 모으지 않습니다. "}');
        expect(view).toContain("채팅은 보낸 건수만 세고 내용은 읽지 않습니다.");
        expect(view).not.toContain("data-admin-write");
        expect(view).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
    });

    it("회원 id 로 읽는 인덱스 — 표와 스키마에 같이", () => {
        expect(root("migrations/ui_events.sql")).toContain("create index if not exists ui_events_member_time_idx on ui_events (member_id, created_at) where member_id is not null;");
        expect(code(root("shared/schema.ts"))).toContain('index("ui_events_member_time_idx").on(table.memberId, table.createdAt).where(sql`member_id is not null`),');
    });
});
