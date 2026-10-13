/**
 * 골프장 공식 사이트가 공개한 남은 티(2026-10-13 오너: "골프가 데이터의 변화가 없어서 즐길 거리가 없다 — 골프장 취소티 가져오자").
 *
 * 무엇을 받는가: 골프장 **공식 사이트가 로그인 없이 보여 주는** 날짜별 남은 티타임(시간 · 코스 · 홀 · 요금)만.
 *   실측(2026-10-13, reports/golf-tee-survey-1013.md): 공식 사이트 435곳 가운데 41곳이 시간표를 공개한다. 173곳은 로그인 뒤라 받지 않는다.
 * 받지 않는 것: 로그인 뒤의 티 · 자동 접속을 막은 사이트(robots · 차단 화면) · 예약 플랫폼의 화면(카카오골프예약 · 티스캐너 · XGOLF · 골프존 …).
 * 예약은 우리가 받지 않는다 — 화면은 그 골프장의 예약 화면(page)으로 보낸다. 받은 값에는 확인한 시각을 같이 보인다(그사이 팔렸을 수 있다).
 *
 * 받는 곳은 이 파일의 목록이 전부다. 한 줄을 지우면 그 골프장은 더 받지 않는다(골프장이 원하지 않으면 지운다).
 * 틀(family)마다 받는 법이 다르다(같은 예약 프로그램을 쓰는 곳끼리 요청과 답의 꼴이 같다). 목록의 곳은 하나씩 받아 보고 넣는다:
 *   golfres  /GolfRes/onepage/… — 날짜를 POST → 표(EUC-KR)                         13곳
 *   v1cal    <api>/v1/reservation-calender?…&date= — GET → JSON(그 날의 resveTimes)   5곳
 *   qctl     /controller/ReservationController.asp method=getTeeList — POST → JSON   1곳
 *   rows     날짜를 POST → 머리줄 없는 표(줄마다 시간 · 홀 · 요금 · 코스)              3곳
 * 넣지 않은 곳(2026-10-13): 폼의 상태값(__VIEWSTATE)이나 화면에서 받은 세션이 있어야 답하는 곳 — 쿠키 없이 공개 요청 한 번으로 받는다는 선 밖이다.
 *
 * 얼마나 자주: 가까운 날(오늘 ~ 사흘 뒤)은 4시간, 그 뒤(나흘 ~ 엿새 뒤)는 8시간에 한 번. 밤(23 ~ 06시)에는 쉰다 — 한 곳에 하루 스무 번 남짓.
 */

export type TeeFamily = "golfres" | "v1cal" | "qctl" | "rows";

export interface TeeSource {
    /** 우리 골프장 페이지의 slug */
    slug: string;
    family: TeeFamily;
    /** 그 골프장 사이트(끝에 / 없이) */
    origin: string;
    /** golfres — 예약 화면이 비회원 손님에게 붙이는 구분값(그 화면의 숨은 칸 usrmemcd 에 적혀 있다 — 곳마다 다르다) */
    memcd?: string;
    /** v1cal — 예약 화면이 부르는 API 의 자리(끝에 / 없이) */
    api?: string;
    /** v1cal — 코스 구분(회원제 R · 대중제 P …). 예약 화면이 붙이는 값 그대로. 구분이 없는 곳은 [null] */
    classes?: readonly (string | null)[];
    /** v1cal — 코스 번호 → 이름(그 사이트의 코스 이름표) */
    courses?: Readonly<Record<string, string>>;
    /** qctl — 골프장 구분값 */
    coDiv?: string;
    /** rows — 날짜를 보내는 길과 보내는 값({ymd} 자리에 20261016 꼴의 날짜) */
    path?: string;
    form?: string;
    /** 사람이 여는 예약 화면 — 화면의 '예약 화면으로' 가 가는 곳 */
    page: string;
    /**
     * 그 예약 화면이 주소의 # 뒤 날짜를 읽어 그 날의 시간표를 바로 여는가(2026-10-13 실측: 13곳 가운데 12곳).
     * 되는 곳은 teeBookingUrl 이 날짜를 붙인다 — 들어가서 달력에서 날짜를 다시 찾지 않아도 된다.
     */
    dateLink: boolean;
}

const golfres = (slug: string, origin: string, memcd: string, dateLink = true): TeeSource => ({ slug, family: "golfres", origin, memcd, dateLink, page: `${origin}/GolfRes/onepage/real_reservation.asp` });

const v1cal = (slug: string, page: string, api: string, classes: readonly (string | null)[], courses: Record<string, string>): TeeSource =>
    ({ slug, family: "v1cal", origin: new URL(page).origin, page, api, classes, courses, dateLink: false });
const rows = (slug: string, page: string, path: string, form: string): TeeSource =>
    ({ slug, family: "rows", origin: new URL(page).origin, page, path, form, dateLink: false });

/** 받는 곳 — 하나씩 받아 보고 넣은 것만(server/scripts/golf-open-tees-check.ts 로 다시 볼 수 있다) */
// 같은 틀인데 넣지 않은 곳: 로드힐스(같은 요청에 표가 오지 않는다 — 화면이 다른 값을 더 보낸다) · 익산CC(상떼힐과 같은 사이트)
export const GOLF_TEE_SOURCES: readonly TeeSource[] = [
    golfres("에덴블루CC", "https://www.edenblue.co.kr", "10"),
    golfres("인천그랜드CC", "https://www.incheongrand.cc", "10"),
    golfres("캐슬파인GC", "https://www.castlepine.co.kr", "80"),
    golfres("구니CC", "https://www.gunicc.co.kr", "41"),
    golfres("기장동원로얄컨트리클럽", "https://dongwongolf.co.kr", "11"),
    golfres("양산CC", "https://yangsancc.co.kr", "70"),
    golfres("양산동원로얄CC", "https://www.dongwonroyalcc.co.kr", "10"),
    golfres("상떼힐CC", "https://santehill.co.kr", "80"),
    golfres("웅포CC", "https://www.bearportcc.co.kr", "80"),
    golfres("대호단양", "https://www.daehocc.co.kr", "10"),
    golfres("백제CC", "https://www.baekjecc.com", "10"),
    // 솔라고는 주소의 날짜를 읽지 않는다(늘 오늘을 연다) — 날짜를 붙이지 않는다
    golfres("솔라고CC", "http://sollago.co.kr", "10", false),
    golfres("코스카CC", "https://www.koscacc.kr", "60"),
    // v1cal — 블루원용인은 회원제(R) · 대중제(P) 코스를 따로 묻는다
    v1cal("블루원용인CC", "https://yi.blueone.com/reservation/reservation", "https://api-yi.blueone.com", ["R", "P"], { 1: "서코스", 2: "중코스", 3: "동코스" }),
    v1cal("블루원상주CC", "https://sj.blueone.com/reservation/reservation", "https://api-sj.blueone.com", ["P"], { 1: "동코스", 2: "서코스" }),
    v1cal("클럽모우골프-라이프스타일", "https://www.clubmow.com/internet-resve/reserve-view", "https://api.clubmow.com", [null], { 1: "Mountain", 2: "Oasis", 3: "Wild" }),
    v1cal("포천힐마루CC", "https://pocheon.hillmaru.com/booking/reservations/reserve", "https://api.pocheon.hillmaru.com", [null], { 1: "시그니처A", 2: "시그니처B", 3: "브리즈", 4: "선샤인", 5: "네스트" }),
    v1cal("메이플비치-골프앤리조트", "https://www.maplebeach.co.kr/reservation/golf-reservation", "https://api.maplebeach.co.kr", ["P"], { 1: "MAPLE", 2: "BEACH" }),
    { slug: "골프클럽-Q", family: "qctl", origin: "http://www.golfclubq.com", page: "http://www.golfclubq.com/reservation/reservation.asp", coDiv: "660", dateLink: false },
    rows("오창에딘버러CC", "https://www.ochangedincc.com/Booking/ReservationCalendar", "/Booking/AjaxGetTime_new", "day={ymd}&change_day="),
    rows("금실대덕밸리CC", "https://www.hanmircc.com/Reservation/ReservCalendar", "/Reservation/AjaxTimeList", "date={ymd}&changeDate=&changeSeq=&course=&gubun=WEB"),
    rows("전주샹그릴라CC", "http://www.jeonjucc.co.kr/html/reserve/reserve01.asp", "/html/reserve/reserve01.asp", "book_date={ymd}"),
];

const BY_SLUG: ReadonlyMap<string, TeeSource> = new Map(GOLF_TEE_SOURCES.map((s) => [s.slug, s]));
export function teeSource(slug: string): TeeSource | null {
    return BY_SLUG.get(slug) ?? null;
}

/**
 * 그 골프장의 예약 화면 주소 — 날짜를 알고 그 사이트가 받으면 그 날이 열린 화면으로.
 * 붙이는 값은 예약 화면이 날짜를 눌렀을 때 스스로 주소에 적는 것과 같다(dategbn 은 요일 — 일요일 1).
 */
export function teeBookingUrl(s: Pick<TeeSource, "page" | "dateLink" | "family">, day?: string | null): string {
    if (!day || !s.dateLink || s.family !== "golfres" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return s.page;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() + 1;
    return `${s.page}#pointdate=${day.replace(/-/g, "")}&courseid=0&openyn=1&dategbn=${weekday}&choice_time=00&settype=T`;
}

/** 남은 티 한 줄 */
export interface OpenTee {
    /** "06:16" */
    time: string;
    /** 코스 이름(그 골프장이 적은 그대로) — 없으면 빈 글자 */
    course: string;
    holes: number | null;
    /** 정상 요금(원) */
    listPrice: number | null;
    /** 그 티의 요금(원) — 할인 요금이 따로 없으면 정상 요금 */
    price: number | null;
}

/** 화면에 주는 한 줄 — fresh: 그 날짜를 처음 본 뒤에 새로 나온 티 */
export interface OpenTeeRow extends OpenTee { fresh: boolean }
/** 하루 — checkedAt: 그 날을 마지막으로 확인한 때(ms) */
export interface OpenTeeDay { day: string; checkedAt: number; tees: OpenTeeRow[] }
/** 골프장 한 곳 — page: 그 골프장의 예약 화면 */
export interface CourseOpenTees { page: string; days: OpenTeeDay[] }
/** 여러 골프장을 모아 본 한 줄 */
export interface OpenTeeFeedRow extends OpenTeeRow { slug: string; day: string; checkedAt: number; page: string }
/** 모아 본 한 줄에 골프장의 이름 · 자리를 붙인 것(GET /api/hiq/golf-courses/open-tees) */
export interface OpenTeeFeedItem extends OpenTeeFeedRow { name: string; region: string; city: string | null }

/**
 * 부킹 목록에 싣는 꼴(2026-10-13 오너: "부킹에 넣어줘 … '해당 부킹은 홈페이지 예약 티입니다'라고 안내하고 연결되게") — 부킹 한 줄과 같은 칸에
 * sellerType "OFFICIAL" 과 official(골프장 예약 화면 · 정상 요금 · 확인한 때)을 얹는다. golf_bookings 표의 줄이 아니다(신청 · 채팅 · 삭제의 대상이 아니다).
 */
export interface OfficialListing {
    /** "official:<slug>:<날짜>:<시간>:<코스>" — 부킹의 uuid 와 겹치지 않는다 */
    id: string;
    courseId: string;
    courseName: string;
    region: string;
    /** 티타임(ISO) */
    datetime: string;
    /** 그 티의 요금(원) — 모르면 0(official.price 가 null) */
    greenFee: number;
    isHotDeal: false; isBlind: false; options: string[]; comment: null;
    /** 코스 이름 */
    courseType: string | null;
    listingType: "BOOKING";
    sellerType: "OFFICIAL";
    lat: number | null; lng: number | null;
    official: { slug: string; page: string; course: string; holes: number | null; listPrice: number | null; price: number | null; checkedAt: number; fresh: boolean };
}
export const isOfficialListing = (x: unknown): x is OfficialListing => !!x && typeof x === "object" && (x as { sellerType?: unknown }).sellerType === "OFFICIAL" && !!(x as { official?: unknown }).official;

/** 부킹 화면의 글 — 묶음의 제목과 눌렀을 때의 안내 */
export const OFFICIAL_LISTING_COPY = {
    title: "골프장 홈페이지 예약 티",
    sub: "골프장 공식 홈페이지에 열려 있는 티타임이에요.",
    notice: "이 부킹은 골프장 홈페이지 예약 티예요.",
    how: "예약은 골프장 홈페이지에서 해요. 랭큐가 받는 예약이 아니에요.",
    stale: "확인한 뒤에 예약됐을 수 있어요.",
    go: "골프장 홈페이지에서 예약",
    info: "골프장 정보",
    badge: "홈페이지 예약",
} as const;

/** 날짜의 짧은 이름 — "오늘" · "내일" · "10/16 금" */
export function teeDayLabel(day: string, nowMs: number): string {
    const today = kstDay(nowMs);
    if (day === today) return "오늘";
    if (day === kstDay(nowMs, 1)) return "내일";
    const d = new Date(`${day}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${"일월화수목금토"[d.getUTCDay()]}`;
}

/** 며칠 치를 보는가 — 오늘부터 이레 */
export const OPEN_TEE_DAYS = 7;
const KST_MS = 9 * 3_600_000, DAY_MS = 86_400_000;

/** 한국 날짜 "YYYY-MM-DD" — 오늘에서 n 일 뒤 */
export function kstDay(nowMs: number, plus = 0): string {
    return new Date(nowMs + KST_MS + plus * DAY_MS).toISOString().slice(0, 10);
}
/** 한국 시각의 "HH:MM" */
export function kstClock(ms: number): string {
    return new Date(ms + KST_MS).toISOString().slice(11, 16);
}
/** 볼 날짜들 — 오늘부터 OPEN_TEE_DAYS 일 */
export function openTeeDays(nowMs: number): string[] {
    return Array.from({ length: OPEN_TEE_DAYS }, (_, i) => kstDay(nowMs, i));
}
/** 밤에는 쉰다(한국 시각 23 ~ 06시) */
export function teeQuietHour(nowMs: number): boolean {
    const h = Number(kstClock(nowMs).slice(0, 2));
    return h >= 23 || h < 6;
}
/** 다시 볼 때가 됐는가 — 가까운 날은 4시간, 먼 날은 8시간. 한 번도 안 본 날은 바로 */
export function openTeeDue(day: string, checkedMs: number | null, nowMs: number): boolean {
    if (checkedMs == null) return true;
    const ahead = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${kstDay(nowMs)}T00:00:00Z`)) / DAY_MS);
    if (ahead < 0) return false;
    return nowMs - checkedMs >= (ahead <= 3 ? 4 : 8) * 3_600_000;
}
/**
 * 새로 나온 티인가 — 그 날짜를 처음 본 뒤에 생긴 줄(= 누가 취소했거나 골프장이 더 연 티).
 * 처음 본 순간에 있던 줄은 '새로'가 아니다(처음 받은 날 전부가 새 티로 보이지 않게).
 */
export function isNewTee(firstSeenMs: number, dayFirstCheckedMs: number | null, nowMs: number, withinMs = 12 * 3_600_000): boolean {
    if (dayFirstCheckedMs == null) return false;
    return firstSeenMs - dayFirstCheckedMs > 60_000 && nowMs - firstSeenMs <= withinMs;
}
/** 이미 지난 티(오늘의 지난 시각)는 보이지 않는다 */
export function teeStillAhead(day: string, time: string, nowMs: number): boolean {
    const today = kstDay(nowMs);
    return day > today || (day === today && time > kstClock(nowMs));
}

/**
 * golfres 틀 — 날짜의 시간표를 부르는 요청. 예약 화면이 달력의 날짜를 눌렀을 때 스스로 보내는 것과 같은 값이다:
 * dategbn 은 요일(일요일 1 … 토요일 7), usrmemcd 는 그 화면에 적힌 비회원 구분값. 값이 다르면 표 없이 빈 답이 온다.
 */
export function golfResRequest(s: Pick<TeeSource, "origin" | "memcd">, day: string): { url: string; body: string; headers: Record<string, string> } {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() + 1;
    const body = new URLSearchParams({ golfrestype: "real", courseid: "0", usrmemcd: s.memcd ?? "", pointdate: day.replace(/-/g, ""), openyn: "1", dategbn: String(weekday), choice_time: "00", cssncourseum: "", inputtype: "I" }).toString();
    return {
        url: `${s.origin}/GolfRes/onepage/real_timelist_ajax_list.asp`,
        body,
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", referer: `${s.origin}/GolfRes/onepage/real_reservation.asp`, "x-requested-with": "XMLHttpRequest" },
    };
}

/**
 * 칸의 글에서 요금 하나 — **처음 나오는 돈 꼴의 수**만 읽는다(쉼표로 끊은 수, 또는 다섯 ~ 일곱 자리 수).
 * 칸의 숫자를 전부 이어 붙이면 안 된다: 에덴블루는 요금 칸에 "170,000 2인플레이가능."이라고 적어, 뒤의 2 까지 붙어 1,700,002원이 됐다(2026-10-13 오너 신고 "금액이 10배").
 */
const won = (s: string): number | null => {
    const m = /\d{1,3}(?:,\d{3})+|\d{5,7}/.exec(s);
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ""));
    // 요금이 아닌 숫자(0 · 자리수가 이상한 값)는 버린다
    return Number.isFinite(n) && n >= 10_000 && n <= 2_000_000 ? n : null;
};
const cellText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * golfres 틀의 시간표(HTML) → 남은 티. 표를 못 찾으면 null(못 받은 것 — 로그인 화면 · 점검 화면 · 틀이 바뀜), 표는 있는데 줄이 없으면 [](남은 티 없음).
 * 첫 표(전체 코스)만 읽는다 — 코스별 표는 같은 줄의 되풀이다. 표의 꼴이 둘이다(새 것은 thead/tbody · class cm_time_list_tbl, 옛 것은 맨 표):
 * 그래서 '머리줄에 시간이 있는 첫 표'를 찾고, 칸은 머리줄의 이름으로 고른다(곳마다 칸의 순서 · 수가 다르다).
 * 요금 칸: 둘이면 앞이 정상 요금 · 뒤가 그 티의 요금(정상요금 + 입장요금 · 인터넷회원가 + 특가), 하나면 그 티의 요금(그린피 · 이용요금).
 * 시간이 "HH:MM" 꼴이 아닌 줄은 버린다.
 */
export function parseGolfResTimes(html: string): OpenTee[] | null {
    const clean = html.replace(/<!--[\s\S]*?-->/g, "");
    let table = "", heads: string[] = [];
    for (const m of clean.matchAll(/<table[\s\S]*?<\/table>/gi)) {
        const h = [...m[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => cellText(x[1]));
        if (h.some((x) => /시간/.test(x))) { table = m[0]; heads = h; break; }
    }
    if (!table) return null;
    const at = (re: RegExp) => heads.findIndex((h) => re.test(h));
    const iTime = at(/시간/), iCourse = at(/코스/), iHoles = at(/홀/);
    const money = heads.map((h, i) => (i !== iTime && i !== iCourse && i !== iHoles && /요금|그린피|회원|특가|할인|입장|이용/.test(h) ? i : -1)).filter((i) => i >= 0);
    const out: OpenTee[] = [];
    const seen = new Set<string>();
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
        if (!cells.length) continue;
        // 옛 표는 시간 뒤에 점을 찍기도 한다("06:03.")
        const t = /^([01]?\d|2[0-3])\s*:\s*([0-5]\d)\.?$/.exec(cells[iTime] ?? "");
        if (!t) continue;
        const time = `${t[1].padStart(2, "0")}:${t[2]}`;
        const course = (iCourse >= 0 ? cells[iCourse] ?? "" : "").slice(0, 30);
        const key = `${time}|${course}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const holes = iHoles >= 0 ? Number(/\d+/.exec(cells[iHoles] ?? "")?.[0] ?? NaN) : NaN;
        const values = money.map((i) => won(cells[i] ?? ""));
        const price = [...values].reverse().find((v) => v != null) ?? null;
        const listPrice = money.length >= 2 ? values[0] : null;
        out.push({ time, course, holes: holes === 9 || holes === 18 || holes === 27 ? holes : null, listPrice: listPrice != null && price != null && listPrice > price ? listPrice : null, price });
    }
    return out.sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "ko"));
}

// ── 그 밖의 틀 ───────────────────────────────────────────────────────

/** 한 번의 공개 요청 */
export interface TeeRequest { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string }

const FORM = "application/x-www-form-urlencoded; charset=UTF-8";
/** 그 골프장 · 그 날의 시간표를 부르는 요청들(대부분 하나 — 코스 구분이 둘인 곳만 둘). 예약 화면이 스스로 보내는 것과 같은 값이다 */
export function teeRequests(s: TeeSource, day: string): TeeRequest[] {
    const ymd = day.replace(/-/g, "");
    if (s.family === "golfres") { const r = golfResRequest(s, day); return [{ url: r.url, method: "POST", headers: r.headers, body: r.body }]; }
    if (s.family === "v1cal") {
        const [y, m] = day.split("-");
        return (s.classes ?? [null]).map((c) => ({ url: `${s.api}/v1/reservation-calender?year=${y}&month=${Number(m)}&date=${day}${c ? `&courseClass=${c}` : ""}`, method: "GET" as const, headers: { referer: s.page } }));
    }
    if (s.family === "qctl") {
        return [{ url: `${s.origin}/controller/ReservationController.asp`, method: "POST", headers: { "content-type": FORM, referer: s.page, "x-requested-with": "XMLHttpRequest" }, body: `method=getTeeList&coDiv=${s.coDiv ?? ""}&date=${ymd}` }];
    }
    return [{ url: `${s.origin}${s.path ?? ""}`, method: "POST", headers: { "content-type": FORM, referer: s.page, "x-requested-with": "XMLHttpRequest" }, body: (s.form ?? "").replace(/\{ymd\}/g, ymd) }];
}

const hhmm = (v: unknown): string | null => {
    const m = /^([01]?\d|2[0-3])\s*:?\s*([0-5]\d)/.exec(String(v ?? "").trim());
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};
const holesOf = (v: unknown): number | null => { const n = Number(/\d+/.exec(String(v ?? ""))?.[0] ?? NaN); return n === 9 || n === 18 || n === 27 ? n : null; };
const tidy = (out: OpenTee[]): OpenTee[] => {
    const seen = new Set<string>();
    return out.filter((t) => { const k = `${t.time}|${t.course}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "ko"));
};
const pair = (list: number | null, price: number | null): Pick<OpenTee, "listPrice" | "price"> => ({ price: price ?? list, listPrice: list != null && price != null && list > price ? list : null });

/** v1cal — 달력 답의 그 날 칸에 든 시간들. 비어 있는(EMPTY) · 홈페이지에 연(webOpenFlag) 줄만 */
export function parseV1Cal(text: string, day: string, courses: Readonly<Record<string, string>> = {}): OpenTee[] | null {
    let d: any;
    try { d = JSON.parse(text); } catch { return null; }
    const cal = d?.data?.calenders;
    if (!Array.isArray(cal)) return null;
    const times: any[] = cal.find((c: any) => c?.bsnDate === day)?.resveTimes ?? [];
    const out: OpenTee[] = [];
    for (const t of times) {
        if (t?.timeStatus !== "EMPTY" || t?.webOpenFlag === false || t?.delFlag === true) continue;
        const time = hhmm(t.resveTime);
        if (!time) continue;
        const num = (v: unknown) => (typeof v === "number" && v >= 10_000 && v <= 2_000_000 ? Math.round(v) : null);
        out.push({ time, course: String(courses[String(t.resveCourse)] ?? "").slice(0, 30), holes: holesOf(t.holeDiv), ...pair(num(t.nomPrice) ?? num(t.price), num(t.promtnPrice) ?? num(t.price)) });
    }
    return tidy(out);
}

/** qctl — rows[] 의 한 줄이 티 하나(BK_TIME "0621" · BK_COS_NM · BK_CHARGE "160,000" · BK_BASIC_CHARGE "코드,200000,구분") */
export function parseQctl(text: string): OpenTee[] | null {
    let d: any;
    try { d = JSON.parse(text); } catch { return null; }
    if (!Array.isArray(d?.rows)) return null;
    const out: OpenTee[] = [];
    for (const r of d.rows) {
        const time = hhmm(r?.BK_TIME);
        if (!time) continue;
        out.push({ time, course: String(r.BK_COS_NM ?? "").slice(0, 30), holes: holesOf(r.BK_ROUNDF_NM), ...pair(won(String(r.BK_BASIC_CHARGE ?? "").split(",")[1] ?? ""), won(String(r.BK_CHARGE ?? ""))) });
    }
    return tidy(out);
}

/** 코스 이름으로 볼 수 없는 칸의 말 */
const NOT_COURSE = /^(예약|신청|마감|대기|캐디|노캐디|셀프|카트|\d부|[\d,]+원?|\d+홀|-|)$/;
/**
 * rows — 머리줄 없는 표: 줄(tr)마다 시간이 든 칸을 찾고, 같은 줄의 다른 칸에서 홀 수 · 요금 · 코스 이름을 읽는다.
 * 코스 이름은 줄에 적힌 속성(data-coursekor)이 있으면 그것, 없으면 글자뿐인 짧은 칸. 요금이 둘이면 앞이 정상 · 뒤가 그 티의 요금.
 * 표가 아예 없으면 null(못 받음), 표는 있는데 시간이 든 줄이 없으면 [](남은 티 없음).
 */
export function parseTeeRows(html: string): OpenTee[] | null {
    const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    if (!/<table/i.test(clean)) return null;
    const out: OpenTee[] = [];
    for (const row of clean.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1].replace(/<br\s*\/?>/gi, " ")));
        const iTime = cells.findIndex((c) => /(^|\s)([01]?\d|2[0-3])\s*:\s*[0-5]\d(\s|$)/.test(c));
        if (iTime < 0) continue;
        const t = /([01]?\d|2[0-3])\s*:\s*([0-5]\d)/.exec(cells[iTime])!;
        const time = `${t[1].padStart(2, "0")}:${t[2]}`;
        // 시간 칸에 코스 이름이 같이 적힌 곳("Hill 17:21")
        const beside = cells[iTime].replace(t[0], "").trim();
        const attr = /data-coursekor="([^"]*)"/i.exec(row[1])?.[1]?.trim();
        const others = cells.filter((_, i) => i !== iTime);
        const named = attr || (beside && !NOT_COURSE.test(beside) ? beside : "") || others.find((c) => c.length <= 12 && !/\d/.test(c) && !NOT_COURSE.test(c)) || "";
        // 칸의 폭을 맞추려고 글자 사이를 띄운 이름("드 림")은 붙인다
        const course = (/^[가-힣]( [가-힣])+$/.test(named) ? named.replace(/ /g, "") : named).slice(0, 30);
        const holes = holesOf(others.find((c) => /^\d{1,2}\s*홀/.test(c)));
        // 요금 칸 — 수로 시작하는(앞에 짧은 말이 붙기도 한다) 칸. 뒤에 붙은 말("2인 가능")은 won 이 버린다
        const money = others.map((c) => (/^[^\d]{0,6}\d{1,3}(,\d{3})+/.test(c) || /^[^\d]{0,6}\d{5,7}(\D|$)/.test(c) ? won(c) : null)).filter((v): v is number => v != null);
        out.push({ time, course, holes, ...pair(money.length >= 2 ? money[0] : null, money.length ? money[money.length - 1] : null) });
    }
    return tidy(out);
}

/** 그 틀의 답 → 남은 티. 못 읽으면 null(못 받음) */
export function parseTees(s: TeeSource, text: string, day: string): OpenTee[] | null {
    if (s.family === "golfres") return parseGolfResTimes(text);
    if (s.family === "v1cal") return parseV1Cal(text, day, s.courses);
    if (s.family === "qctl") return parseQctl(text);
    return parseTeeRows(text);
}

/** 그 날의 한 줄 요약 — "남은 티 12 · 06:16부터" */
export function openTeeDayLine(tees: readonly Pick<OpenTee, "time">[]): string {
    if (!tees.length) return "남은 티 없음";
    return `남은 티 ${tees.length} · ${tees[0].time}부터`;
}
/** "70,000원" — 모르면 빈 글자 */
export function teePriceText(n: number | null): string {
    return n == null ? "" : `${n.toLocaleString("ko-KR")}원`;
}

export const OPEN_TEE_COPY = {
    title: "공식 사이트의 남은 티",
    note: "골프장 공식 예약 화면에 공개된 티타임이에요. 확인한 뒤에 예약됐을 수 있어요.",
    go: "골프장 예약 화면으로",
    fresh: "새로 나옴",
    empty: "지금 공개된 남은 티가 없어요.",
} as const;
