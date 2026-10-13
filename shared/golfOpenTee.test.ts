import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    GOLF_TEE_SOURCES, OPEN_TEE_COPY, golfResRequest, isNewTee, kstClock, kstDay, openTeeDays, openTeeDue, parseGolfResTimes, teeDayLabel, teePriceText, teeQuietHour,
    parseQctl, parseTeeRows, parseV1Cal, teeBookingUrl, teeRequests, teeSource, teeStillAhead,
} from "./golfOpenTee";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const H = 3_600_000;
const NOON = Date.UTC(2026, 9, 13, 3, 0);   // 한국 10/13(화) 12:00

// 2026-10-13 오너: "골프가 데이터의 변화들이 없어서 유저들이 와도 즐길 거리가 없는데 … 골프장 취소티 가져오자"
// 실측: 공식 사이트 435곳 가운데 41곳이 로그인 없이 시간표를 보여 준다(reports/golf-tee-survey-1013.md). 가장 큰 틀 하나부터 받는다.
describe("받는 곳 — 공식 사이트만, 하나씩 받아 본 곳만", () => {
    it("목록 — slug 가 겹치지 않고, 예약 화면은 그 골프장 사이트 안에 있다", () => {
        expect(GOLF_TEE_SOURCES.length).toBe(22);
        expect(Object.fromEntries(["golfres", "v1cal", "qctl", "rows"].map((f) => [f, GOLF_TEE_SOURCES.filter((s) => s.family === f).length]))).toEqual({ golfres: 13, v1cal: 5, qctl: 1, rows: 3 });
        expect(new Set(GOLF_TEE_SOURCES.map((s) => s.slug)).size).toBe(GOLF_TEE_SOURCES.length);
        expect(new Set(GOLF_TEE_SOURCES.map((s) => s.origin)).size).toBe(GOLF_TEE_SOURCES.length);
        for (const s of GOLF_TEE_SOURCES) {
            expect(s.origin, s.slug).toMatch(/^https?:\/\/[a-z0-9.-]+$/);
            expect(s.page.startsWith(`${s.origin}/`), s.slug).toBe(true);
            if (s.family === "golfres") expect(s.memcd, s.slug).toMatch(/^\d+$/);
            if (s.family === "v1cal") { expect(s.api, s.slug).toMatch(/^https:\/\/api[.-]/); expect(Object.keys(s.courses ?? {}).length, s.slug).toBeGreaterThan(0); }
            if (s.family === "rows") { expect(s.path, s.slug).toMatch(/^\//); expect(s.form, s.slug).toContain("{ymd}"); }
        }
        expect(teeSource("솔라고CC")?.page).toBe("http://sollago.co.kr/GolfRes/onepage/real_reservation.asp");
        expect(teeSource("레이크사이드CC")).toBeNull();
    });
    it("예약 플랫폼 · 우리가 쓰지 않기로 한 출처는 목록에 없다", () => {
        const hosts = GOLF_TEE_SOURCES.map((s) => s.origin).join(" ");
        expect(hosts).not.toMatch(/smartscore|xgolf|golfzon|teescanner|kakao|naver|golfpang|kimcaddie|teeupnjoy|tigerbooking/i);
    });
    it("요청 — 예약 화면이 날짜를 눌렀을 때 보내는 값과 같다(요일 · 그 화면의 비회원 구분값) · 쿠키 · 로그인 값은 없다", () => {
        const rq = golfResRequest({ origin: "https://x.test", memcd: "80" }, "2026-10-15");   // 목요일
        expect(rq.url).toBe("https://x.test/GolfRes/onepage/real_timelist_ajax_list.asp");
        const b = new URLSearchParams(rq.body);
        expect(Object.fromEntries(b)).toEqual({ golfrestype: "real", courseid: "0", usrmemcd: "80", pointdate: "20261015", openyn: "1", dategbn: "5", choice_time: "00", cssncourseum: "", inputtype: "I" });
        expect(new URLSearchParams(golfResRequest({ origin: "https://x.test", memcd: "10" }, "2026-10-18").body).get("dategbn")).toBe("1");   // 일요일
        expect(Object.keys(rq.headers).map((k) => k.toLowerCase())).not.toContain("cookie");
    });
});

// 2026-10-13: 더블이글의 '자동 회원가입'을 본 오너의 물음에 — 남의 사이트 비밀번호를 우리가 보관하지 않고, 예약 화면을 앱 안 브라우저 창으로 열어
// 휴대폰의 저장된 비밀번호 · 자동 채움을 쓰게 하고, 그 날짜가 열린 화면으로 바로 보낸다.
describe("골프장 예약 화면으로 가는 길 — 그 날이 열린 화면 · 앱 안 브라우저 창", () => {
    it("날짜를 받는 사이트(13곳 가운데 12곳)는 그 날이 열린 주소로 — 예약 화면이 스스로 적는 값과 같다(요일은 일요일 1)", () => {
        const s = teeSource("코스카CC")!;
        expect(s.dateLink).toBe(true);
        expect(teeBookingUrl(s, "2026-10-17")).toBe("https://www.koscacc.kr/GolfRes/onepage/real_reservation.asp#pointdate=20261017&courseid=0&openyn=1&dategbn=7&choice_time=00&settype=T");
        expect(teeBookingUrl(s)).toBe(s.page);
        expect(teeBookingUrl(s, "2026/10/17")).toBe(s.page);
        // 솔라고는 주소의 날짜를 읽지 않는다 — 붙이지 않는다
        const sol = teeSource("솔라고CC")!;
        expect(sol.dateLink).toBe(false);
        expect(teeBookingUrl(sol, "2026-10-17")).toBe(sol.page);
        expect(GOLF_TEE_SOURCES.filter((x) => x.dateLink).length).toBe(12);
    });
    it("앱 안 브라우저 창 — 그 플러그인이 있는 앱에서만 링크를 가로챈다 · http(s) 만 · 우리가 비밀번호를 받거나 채우는 코드는 없다", () => {
        const src = read("client/src/lib/openOutside.ts");
        expect(src).toContain('export const canOpenInApp = (): boolean => hasPlugin("Browser");');
        expect(src).toContain("if (!/^https?:\\/\\//i.test(url) || !canOpenInApp()) return false;");
        expect(src).toContain("if (!canOpenInApp()) return;");
        expect(code(src)).not.toMatch(/password|executeScript|inject|localStorage|apiRequest/i);
        // 남의 도메인을 앱의 웹뷰에 들이지 않는다(allowNavigation 을 넓히지 않는다) — 따로 뜨는 창이다
        expect(read("capacitor.config.ts")).not.toMatch(/GolfRes|sollago|koscacc/);
    });
});

describe("시간표 읽기 — 표의 꼴 둘, 칸은 머리줄의 이름으로", () => {
    const NEW = `<!-- 코스타임 리스트 --><ul class="tab"><li><a class="on">전체코스</a></li></ul>
        <div id="tab0"><table class="cm_time_list_tbl" summary="전체코스"><thead><tr><th>번호</th><th>코스</th><th>시간</th><th>홀</th>
        <!-- <th>비회원그린피</th> <th>할인그린피</th> --><th>정상요금</th><th>입장요금</th><th>예약</th></tr></thead><tbody>
        <tr><td>1</td><td>동</td><td>06:16</td><td>18홀</td><td><span style='text-decoration:line-through'>185,000</span></td><td><span style='color:#ff3333;'>80,000</td><td><button onclick="x('R','3','0616','I','ABLE')">신청</button></td></tr>
        <tr><td>2</td><td>서</td><td>13:11</td><td>18홀</td><td><span>185,000</span></td><td><span>185,000</td><td><button>신청</button></td></tr>
        <tr><td>3</td><td>동</td><td>06:16</td><td>18홀</td><td>185,000</td><td>80,000</td><td></td></tr>
        <tr><td colspan="7">안내 줄</td></tr></tbody></table></div>
        <div id="tab1"><table class="cm_time_list_tbl"><thead><tr><th>번호</th><th>코스</th><th>시간</th></tr></thead><tbody><tr><td>1</td><td>동</td><td>09:00</td></tr></tbody></table></div>`;
    it("새 꼴 — 첫 표(전체 코스)만 · 주석 속 칸은 세지 않는다 · 같은 줄은 한 번 · 정상 요금은 더 쌀 때만 남긴다", () => {
        expect(parseGolfResTimes(NEW)).toEqual([
            { time: "06:16", course: "동", holes: 18, listPrice: 185000, price: 80000 },
            { time: "13:11", course: "서", holes: 18, listPrice: null, price: 185000 },
        ]);
    });
    it("요금 칸에 다른 말이 붙어 있어도 요금만 — 숫자를 전부 이어 붙이지 않는다(에덴블루: '170,000 2인플레이가능.' 이 1,700,002원이 됐다)", () => {
        const html = `<table class="cm_time_list_tbl"><thead><tr><th>번호</th><th>코스</th><th>시간</th><th>홀</th><th>비회원</th><th>인터넷회원</th><th>예약</th></tr></thead><tbody>
            <tr><td>1</td><td>마운틴</td><td>08:05</td><td>18홀</td><td>170,000</td><td><span>170,000<em><br>2인플레이가능.</em></td><td><button>신청</button></td></tr>
            <tr><td>3</td><td>레이크</td><td>18:11</td><td>18홀</td><td>140,000</td><td><span>89,900<em><br>2인플레이가능.</em></td><td><button>신청</button></td></tr>
            <tr><td>4</td><td>밸리</td><td>18:18</td><td>18홀</td><td>140000원</td><td>4인 필수 95000</td><td><button>신청</button></td></tr></tbody></table>`;
        expect(parseGolfResTimes(html)).toEqual([
            { time: "08:05", course: "마운틴", holes: 18, listPrice: null, price: 170000 },
            { time: "18:11", course: "레이크", holes: 18, listPrice: 140000, price: 89900 },
            { time: "18:18", course: "밸리", holes: 18, listPrice: 140000, price: 95000 },
        ]);
        // 머리줄 없는 표도 같다
        expect(parseTeeRows(`<table><tr><td>06:23</td><td>18홀</td><td>80,000원 2인 가능</td><td>예약</td></tr></table>`)).toEqual([{ time: "06:23", course: "", holes: 18, listPrice: null, price: 80000 }]);
    });
    it("옛 꼴 — thead 없는 맨 표 · 시간 뒤의 점 · 요금 칸이 하나(그린피) 또는 둘(인터넷회원가 + 특가)", () => {
        const one = `<div class="cm_time_live_tab_list"><table><colgroup><col /></colgroup><tr><th>번호</th><th>코스</th><th>시간</th><th>홀</th><th>그린피</th><th>예약</th></tr>
            <tr><td class="a">1</td><td>레이크</td><td>06:03.</td><td>18홀</td><td>120,000</td><td><a href="javascript:subcmd('R','1','0603')"><img alt='신청[0603]'/></a></td></tr></table></div>`;
        expect(parseGolfResTimes(one)).toEqual([{ time: "06:03", course: "레이크", holes: 18, listPrice: null, price: 120000 }]);
        const two = `<table><tr><th>번호</th><th>코스</th><th>시간</th><th>인터넷회원가</th><th style='color:red;'>특가</th><th>예약</th></tr>
            <tr><td>1</td><td>가온</td><td>06:01</td><td><span>120,000</span></td><td><span>95,000</span></td><td></td></tr>
            <tr><td>2</td><td>누리</td><td>7:08</td><td><span>120,000</span></td><td></td><td></td></tr></table>`;
        expect(parseGolfResTimes(two)).toEqual([
            { time: "06:01", course: "가온", holes: null, listPrice: 120000, price: 95000 },
            { time: "07:08", course: "누리", holes: null, listPrice: null, price: 120000 },
        ]);
    });
    it("표가 없으면 null(못 받음 — 그 날의 줄을 지우지 않는다) · 표는 있는데 줄이 없으면 [](남은 티 없음)", () => {
        expect(parseGolfResTimes("<html><body>로그인 후 이용해 주세요</body></html>")).toBeNull();
        expect(parseGolfResTimes("")).toBeNull();
        expect(parseGolfResTimes(`<table class="cm_time_list_tbl"><thead><tr><th>코스</th><th>시간</th></tr></thead><tbody><tr><td colspan="2">예약 가능한 시간이 없습니다</td></tr></tbody></table>`)).toEqual([]);
        // 요금이 아닌 숫자는 버린다
        expect(parseGolfResTimes(`<table><tr><th>시간</th><th>그린피</th></tr><tr><td>08:00</td><td>문의</td></tr><tr><td>08:07</td><td>0</td></tr></table>`)).toEqual([
            { time: "08:00", course: "", holes: null, listPrice: null, price: null }, { time: "08:07", course: "", holes: null, listPrice: null, price: null },
        ]);
    });
});

// 2026-10-13 오너: "최대한 골프티 취소티 확보가 가능한 홈페이지를 연결하는 게 1번" → 남은 28곳의 요청을 받아 보고, 쿠키 없이 받아지는 틀 셋을 더했다(9곳)
describe("그 밖의 틀 — 요청과 답의 꼴", () => {
    it("요청 — 틀마다 예약 화면이 스스로 보내는 값. 코스 구분이 둘인 곳은 둘", () => {
        const yi = teeRequests(teeSource("블루원용인CC")!, "2026-10-16");
        expect(yi.map((r) => `${r.method} ${r.url}`)).toEqual([
            "GET https://api-yi.blueone.com/v1/reservation-calender?year=2026&month=10&date=2026-10-16&courseClass=R",
            "GET https://api-yi.blueone.com/v1/reservation-calender?year=2026&month=10&date=2026-10-16&courseClass=P",
        ]);
        expect(teeRequests(teeSource("클럽모우골프-라이프스타일")!, "2026-01-05")[0].url).toBe("https://api.clubmow.com/v1/reservation-calender?year=2026&month=1&date=2026-01-05");
        expect(teeRequests(teeSource("골프클럽-Q")!, "2026-10-16")[0]).toMatchObject({ method: "POST", url: "http://www.golfclubq.com/controller/ReservationController.asp", body: "method=getTeeList&coDiv=660&date=20261016" });
        expect(teeRequests(teeSource("금실대덕밸리CC")!, "2026-10-16")[0]).toMatchObject({ method: "POST", url: "https://www.hanmircc.com/Reservation/AjaxTimeList", body: "date=20261016&changeDate=&changeSeq=&course=&gubun=WEB" });
        expect(teeRequests(teeSource("코스카CC")!, "2026-10-16")[0].url).toBe("https://www.koscacc.kr/GolfRes/onepage/real_timelist_ajax_list.asp");
        for (const s of GOLF_TEE_SOURCES) for (const r of teeRequests(s, "2026-10-16")) expect(Object.keys(r.headers).map((k) => k.toLowerCase()), s.slug).not.toContain("cookie");
    });
    it("v1cal — 그 날 칸의 비어 있는 · 홈페이지에 연 줄만. 코스는 이름표로, 정상 요금은 더 쌀 때만", () => {
        const body = JSON.stringify({ status: "OK", data: { calenders: [
            { bsnDate: "2026-10-15", resveTimes: [{ timeStatus: "EMPTY", webOpenFlag: true, resveCourse: "1", resveTime: "09:00", holeDiv: "18", price: 100000 }] },
            { bsnDate: "2026-10-16", resveTimes: [
                { timeStatus: "EMPTY", webOpenFlag: true, resveCourse: "1", resveTime: "17:34", holeDiv: "18", nomPrice: 275000, price: 275000, promtnPrice: 185000 },
                { timeStatus: "RESVE", webOpenFlag: true, resveCourse: "2", resveTime: "06:20", holeDiv: "18", price: 200000 },
                { timeStatus: "EMPTY", webOpenFlag: false, resveCourse: "2", resveTime: "06:27", holeDiv: "18", price: 200000 },
                { timeStatus: "EMPTY", webOpenFlag: true, resveCourse: "3", resveTime: "06:40:00", holeDiv: "09", price: 258000 },
            ] },
        ] } });
        expect(parseV1Cal(body, "2026-10-16", { 1: "서코스", 3: "동코스" })).toEqual([
            { time: "06:40", course: "동코스", holes: 9, listPrice: null, price: 258000 },
            { time: "17:34", course: "서코스", holes: 18, listPrice: 275000, price: 185000 },
        ]);
        // 그 날 칸에 시간이 없으면 남은 티 없음 · 답의 꼴이 다르면 못 받음
        expect(parseV1Cal(JSON.stringify({ data: { calenders: [{ bsnDate: "2026-10-16" }] } }), "2026-10-16")).toEqual([]);
        expect(parseV1Cal(JSON.stringify({ status: "FAIL" }), "2026-10-16")).toBeNull();
        expect(parseV1Cal("<html>로그인</html>", "2026-10-16")).toBeNull();
    });
    it("qctl — rows 의 한 줄이 티 하나", () => {
        const body = JSON.stringify({ rows: [{ BK_COS_NM: "팜파스", BK_TIME: "0621", BK_ROUNDF_NM: 18, BK_CHARGE: "160,000", BK_BASIC_CHARGE: "P0044,200000,B" }, { BK_COS_NM: "밸리", BK_TIME: "1310", BK_ROUNDF_NM: 18, BK_CHARGE: "200,000", BK_BASIC_CHARGE: "P0044,200000,B" }] });
        expect(parseQctl(body)).toEqual([
            { time: "06:21", course: "팜파스", holes: 18, listPrice: 200000, price: 160000 },
            { time: "13:10", course: "밸리", holes: 18, listPrice: null, price: 200000 },
        ]);
        expect(parseQctl(JSON.stringify({ rows: [] }))).toEqual([]);
        expect(parseQctl("{}")).toBeNull();
    });
    it("rows — 머리줄 없는 표: 줄마다 시간 · 홀 · 요금 · 코스(줄의 속성 · 글자뿐인 칸 · 시간 옆의 글자)", () => {
        const a = `<div class="scrollBox"><table class="timeTbl"><tbody id="timeList"><tr><td>06:23</td><td>18홀</td><td><p>캐디</p></td><td class="txt_sun">80,000원</td><td><a href="/Member/Login?url=x">예약</a></td></tr></tbody></table></div>`;
        expect(parseTeeRows(a)).toEqual([{ time: "06:23", course: "", holes: 18, listPrice: null, price: 80000 }]);
        const b = `<table class="timeTbl"><tr data-course="11" data-coursekor="미르"><td>05:06</td><td>09홀 </td><td> <span class="txt_sub"></span> 50,000원 </td><td><a href="javascript:x()">예약</a></td></tr></table>`;
        expect(parseTeeRows(b)).toEqual([{ time: "05:06", course: "미르", holes: 9, listPrice: null, price: 50000 }]);
        // 달력(날짜만 든 표)이 같이 와도 시간이 든 줄만 · 폭을 맞추려 띄운 이름("드 림")은 붙인다
        const c = `<table><tr><th>일</th><th>월</th></tr><tr><td>16</td><td>17</td></tr></table><table summary="코스 및 시간 선택"><tbody><tr><td>레이크</td><td>06:39</td><td></td><td><a href="#"><button>예약</button></a></td></tr><tr><td>드 림</td><td>06:25</td><td></td><td><button>예약</button></td></tr></tbody></table>`;
        expect(parseTeeRows(c)).toEqual([{ time: "06:25", course: "드림", holes: null, listPrice: null, price: null }, { time: "06:39", course: "레이크", holes: null, listPrice: null, price: null }]);
        const d = `<table class="table_typeA"><tbody><tr><td>3부</td><td>Hill<br/>17:21</td><td>180,000</td><td>150,000</td><td></td><td><button>예약</button></td></tr></tbody></table>`;
        expect(parseTeeRows(d)).toEqual([{ time: "17:21", course: "Hill", holes: null, listPrice: 180000, price: 150000 }]);
        expect(parseTeeRows(`<table><tr><td>예약 가능한 시간이 없습니다</td></tr></table>`)).toEqual([]);
        expect(parseTeeRows("로그인 후 이용해 주세요")).toBeNull();
    });
});

describe("언제 다시 보는가 — 가까운 날 4시간 · 먼 날 8시간 · 밤에는 쉰다", () => {
    it("한국 날짜 — 오늘부터 이레", () => {
        expect(kstDay(NOON)).toBe("2026-10-13");
        expect(kstDay(Date.UTC(2026, 9, 13, 15, 30))).toBe("2026-10-14");   // 한국 00:30
        expect(openTeeDays(NOON)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
        expect(kstClock(NOON)).toBe("12:00");
    });
    it("때 — 한 번도 안 본 날은 바로, 가까운 날은 4시간, 나흘 뒤부터는 8시간, 지난 날은 보지 않는다", () => {
        expect(openTeeDue("2026-10-14", null, NOON)).toBe(true);
        expect(openTeeDue("2026-10-16", NOON - 3.9 * H, NOON)).toBe(false);
        expect(openTeeDue("2026-10-16", NOON - 4 * H, NOON)).toBe(true);
        expect(openTeeDue("2026-10-17", NOON - 7.9 * H, NOON)).toBe(false);
        expect(openTeeDue("2026-10-17", NOON - 8 * H, NOON)).toBe(true);
        expect(openTeeDue("2026-10-12", NOON - 30 * H, NOON)).toBe(false);
    });
    it("밤(23 ~ 06시)에는 쉰다", () => {
        const at = (h: number) => Date.UTC(2026, 9, 13, h - 9, 0);
        expect([23, 24, 26, 29].map((h) => teeQuietHour(at(h)))).toEqual([true, true, true, true]);
        expect([6, 12, 22].map((h) => teeQuietHour(at(h)))).toEqual([false, false, false]);
    });
    it("새로 나온 티 — 그 날짜를 처음 본 뒤에 생긴 줄만(처음 받은 날 전부가 새 티로 보이지 않게) · 12시간이 지나면 새 티가 아니다", () => {
        expect(isNewTee(NOON, NOON, NOON + H)).toBe(false);
        expect(isNewTee(NOON + 30_000, NOON, NOON + H)).toBe(false);
        expect(isNewTee(NOON + 4 * H, NOON, NOON + 5 * H)).toBe(true);
        expect(isNewTee(NOON + 4 * H, NOON, NOON + 17 * H)).toBe(false);
        expect(isNewTee(NOON, null, NOON + H)).toBe(false);
    });
    it("이미 지난 시각은 보이지 않는다 · 날짜의 짧은 이름 · 요금", () => {
        expect(teeStillAhead("2026-10-13", "11:59", NOON)).toBe(false);
        expect(teeStillAhead("2026-10-13", "12:01", NOON)).toBe(true);
        expect(teeStillAhead("2026-10-14", "06:00", NOON)).toBe(true);
        expect(teeStillAhead("2026-10-12", "18:00", NOON)).toBe(false);
        expect(["2026-10-13", "2026-10-14", "2026-10-16", "2026-10-18"].map((d) => teeDayLabel(d, NOON))).toEqual(["오늘", "내일", "10/16 금", "10/18 일"]);
        expect(teePriceText(80000)).toBe("80,000원");
        expect(teePriceText(null)).toBe("");
    });
});

describe("지키는 것 — 서버 · 화면", () => {
    const fetcher = read("server/services/golfOpenTeeFetch.ts");
    const svc = read("server/services/golfOpenTees.ts");
    it("바깥 요청 — robots 를 본다 · 쿠키 없이 한 번 · 4초까지만 · 넘겨 보내는 곳(로그인 화면)은 따라가지 않는다 · 우리가 누구인지 밝힌다", () => {
        expect(fetcher).toContain("export async function robotsAllows(origin: string, path: string): Promise<boolean> {");
        expect(fetcher).toContain('redirect: "manual"');
        expect(fetcher).toContain("export async function fetchOpenTees(s: TeeSource, day: string, timeoutMs = 4000): Promise<TeeFetch> {");
        expect(fetcher).toContain('const UA = "Mozilla/5.0 (compatible; RankueBot/1.0; +https://www.rankue.co.kr/support)";');
        expect(code(fetcher)).not.toMatch(/cookie|password|login\(/i);
        expect(fetcher).toContain('if (!tees) return { ok: false, note: /로그인/.test(text.slice(0, 4000)) ? "로그인 화면" : "표 없음" };');
        expect(fetcher).toContain("for (const rq of teeRequests(s, day)) {");
        // DB 를 모른다
        expect(code(fetcher)).not.toMatch(/from "\.\.\/db/);
    });
    it("받기 — 끌 수 있다 · 밤에는 쉰다 · robots 가 막으면 부르지 않고 적어 둔다 · 못 받은 날의 줄은 건드리지 않는다 · 한 곳에는 한 번에 요청 하나", () => {
        expect(svc).toContain('export const openTeesEnabled = () => process.env.GOLF_OPEN_TEES !== "false";');
        expect(svc).toContain('if (!opts.force && teeQuietHour(nowMs)) return { skipped: "밤(23 ~ 06시)" };');
        expect(svc).toContain('for (const day of list) await saveMiss(s, day, "robots 가 막음");');
        expect(svc).toContain("else { await saveMiss(s, day, r.note); miss++; }");
        const miss = svc.slice(svc.indexOf("async function saveMiss"), svc.indexOf("/**\n * 볼 때가 된 날을"));
        expect(miss).not.toMatch(/golf_open_tees\b(?!_)/);
        // 곳끼리만 나란히(4) — 한 곳의 날짜들은 차례로
        expect(svc).toContain("await Promise.all(Array.from({ length: Math.min(4, due.length) }, worker));");
        expect(svc).toContain("for (const day of list) {");
        expect(svc).toContain("if (left < 800) break;");
    });
    it("읽기 — 12시간 넘게 못 본 날 · 받는 곳이 아닌 골프장 · 지난 시각은 싣지 않는다", () => {
        expect(svc).toContain("const FRESH_MS = 12 * 3_600_000;");
        expect(svc).toContain("if (nowMs - checkedAt > FRESH_MS) continue;");
        expect(svc).toContain("if (!s || !openTeesEnabled()) return null;");
        expect(svc).toContain("d.checked_at > now() - interval '12 hours'");
        expect(svc.match(/teeStillAhead\(/g)?.length).toBeGreaterThanOrEqual(2);
    });
    it("크론 — 20분마다 · 인증 · 시간 예산은 날씨 크론과 같은 셈", () => {
        expect(read("vercel.json")).toContain('{ "path": "/api/cron/golf-open-tees", "schedule": "15,35,55 * * * *" }');
        const cron = read("server/routes/modules/cron.ts");
        const fn = cron.slice(cron.indexOf("async function handleGolfOpenTees"), cron.indexOf('router.get("/golf-open-tees"'));
        expect(fn).toContain("if (req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, \"인증 실패\");");
        expect(fn).toContain("Math.max(1000, 7000 - (Date.now() - t0) - 2500)");
    });
    it("API — 모아 보기는 '/:slug' 보다 먼저(아니면 그 이름의 골프장을 찾는다) · 누구에게나 같은 답이라 잠깐 기억한다", () => {
        const routes = read("server/routes/modules/golfCourses.ts");
        expect(routes.indexOf('router.get("/open-tees"')).toBeGreaterThan(0);
        expect(routes.indexOf('router.get("/open-tees"')).toBeLessThan(routes.indexOf('router.get("/:slug",'));
        expect(routes).toContain('router.get("/:slug/open-tees"');
        expect(routes.match(/public, max-age=120, s-maxage=300, stale-while-revalidate=600/g)?.length).toBe(2);
    });
    it("화면 — 예약은 골프장에서(바깥 링크) · 확인한 시각을 적는다 · 기기에 남은 옛 답을 한 번 더 거른다 · 캐시 열쇠는 골프장 목록 밑에 두지 않는다", () => {
        const card = read("client/src/golf/components/course/detail/OpenTees.tsx");
        expect(card).toContain('<a href={go} target="_blank" rel="noopener noreferrer nofollow" onClick={outsideLinkClick(go)} data-track-as="golf-open-tee-go"');
        expect(card).toContain("const go = source ? teeBookingUrl(source, day.day) : q.data.page;");
        expect(card).toContain("확인 {kstClock(day.checkedAt)}");
        expect(card).toContain("now - d.checkedAt <= FRESH_MS");
        expect(card).toContain("teeStillAhead(d.day, t.time, now)");
        // 골프 홈에는 구역을 두지 않는다(2026-10-13 오너: "지금 남은 티 섹션 넣지 말고 부킹에 넣어줘")
        expect(read("client/src/golf/pages/Dashboard.tsx")).not.toMatch(/OpenTeeHome|지금 남은 티/);
        const api = read("client/src/golf/lib/courseApi.ts");
        expect(api).toContain('export const OPEN_TEES_KEY = "golf-open-tees";');
        expect(api).toContain("queryKey: [OPEN_TEES_KEY, slug],");
        expect(api).toContain("queryKey: [OPEN_TEES_KEY],");
        // 골프 화면의 글자 규칙 — 12px 미만 없음
        for (const src of [card]) for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);
        expect(code(card)).not.toMatch(/font-(bold|extrabold|black)/);
        // 구역의 key 는 형제와 달라야 한다(2026-10-05 사고)
        expect(read("client/src/golf/pages/GolfCoursePage.tsx")).toContain("<OpenTees key={`opentee:${d.slug}`} slug={d.slug} className=\"px-5 mt-3\" />");
    });
    it("문구 — 우리가 예약을 받는다고 읽히지 않는다 · 술 · 내기의 말이 없다", () => {
        const all = Object.values(OPEN_TEE_COPY).join(" ");
        expect(all).toContain("공식");
        expect(all).not.toMatch(/랭큐에서 예약|바로 예약|예약 완료|내기|술|맥주|소주/);
    });
});
