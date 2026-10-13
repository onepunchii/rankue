import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    GOLF_TEE_SOURCES, OPEN_TEE_COPY, golfResRequest, isNewTee, kstClock, kstDay, openTeeDays, openTeeDue, parseGolfResTimes, teeDayLabel, teePriceText, teeQuietHour,
    teeSource, teeStillAhead,
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
        expect(GOLF_TEE_SOURCES.length).toBe(13);
        expect(new Set(GOLF_TEE_SOURCES.map((s) => s.slug)).size).toBe(GOLF_TEE_SOURCES.length);
        expect(new Set(GOLF_TEE_SOURCES.map((s) => s.origin)).size).toBe(GOLF_TEE_SOURCES.length);
        for (const s of GOLF_TEE_SOURCES) {
            expect(s.origin, s.slug).toMatch(/^https?:\/\/[a-z0-9.-]+$/);
            expect(s.page.startsWith(`${s.origin}/`), s.slug).toBe(true);
            expect(s.memcd, s.slug).toMatch(/^\d+$/);
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
        expect(fetcher).toContain('if (!tees) return { ok: false, note: /로그인/.test(html) ? "로그인 화면" : "표 없음" };');
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
        expect(card).toContain('<a href={q.data.page} target="_blank" rel="noopener noreferrer nofollow" data-track-as="golf-open-tee-go"');
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
