/**
 * 골프장 공식 사이트가 공개한 남은 티(2026-10-13 오너: "골프가 데이터의 변화가 없어서 즐길 거리가 없다 — 골프장 취소티 가져오자").
 *
 * 무엇을 받는가: 골프장 **공식 사이트가 로그인 없이 보여 주는** 날짜별 남은 티타임(시간 · 코스 · 홀 · 요금)만.
 *   실측(2026-10-13, reports/golf-tee-survey-1013.md): 공식 사이트 435곳 가운데 41곳이 시간표를 공개한다. 173곳은 로그인 뒤라 받지 않는다.
 * 받지 않는 것: 로그인 뒤의 티 · 자동 접속을 막은 사이트(robots · 차단 화면) · 예약 플랫폼의 화면(카카오골프예약 · 티스캐너 · XGOLF · 골프존 …).
 * 예약은 우리가 받지 않는다 — 화면은 그 골프장의 예약 화면(page)으로 보낸다. 받은 값에는 확인한 시각을 같이 보인다(그사이 팔렸을 수 있다).
 *
 * 받는 곳은 이 파일의 목록이 전부다. 한 줄을 지우면 그 골프장은 더 받지 않는다(골프장이 원하지 않으면 지운다).
 * 틀(family)마다 받는 법이 다르다 — 지금은 가장 큰 틀 하나("golfres": /GolfRes/onepage/…)만. 목록의 곳은 하나씩 받아 보고 넣는다.
 *
 * 얼마나 자주: 가까운 날(오늘 ~ 사흘 뒤)은 4시간, 그 뒤(나흘 ~ 엿새 뒤)는 8시간에 한 번. 밤(23 ~ 06시)에는 쉰다 — 한 곳에 하루 스무 번 남짓.
 */

export type TeeFamily = "golfres";

export interface TeeSource {
    /** 우리 골프장 페이지의 slug */
    slug: string;
    family: TeeFamily;
    /** 그 골프장 사이트(끝에 / 없이) */
    origin: string;
    /** 예약 화면이 비회원 손님에게 붙이는 구분값(그 화면의 숨은 칸 usrmemcd 에 적혀 있다 — 곳마다 다르다) */
    memcd: string;
    /** 사람이 여는 예약 화면 — 화면의 '예약 화면으로' 가 가는 곳 */
    page: string;
    /**
     * 그 예약 화면이 주소의 # 뒤 날짜를 읽어 그 날의 시간표를 바로 여는가(2026-10-13 실측: 13곳 가운데 12곳).
     * 되는 곳은 teeBookingUrl 이 날짜를 붙인다 — 들어가서 달력에서 날짜를 다시 찾지 않아도 된다.
     */
    dateLink: boolean;
}

const golfres = (slug: string, origin: string, memcd: string, dateLink = true): TeeSource => ({ slug, family: "golfres", origin, memcd, dateLink, page: `${origin}/GolfRes/onepage/real_reservation.asp` });

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
    const body = new URLSearchParams({ golfrestype: "real", courseid: "0", usrmemcd: s.memcd, pointdate: day.replace(/-/g, ""), openyn: "1", dategbn: String(weekday), choice_time: "00", cssncourseum: "", inputtype: "I" }).toString();
    return {
        url: `${s.origin}/GolfRes/onepage/real_timelist_ajax_list.asp`,
        body,
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", referer: `${s.origin}/GolfRes/onepage/real_reservation.asp`, "x-requested-with": "XMLHttpRequest" },
    };
}

const won = (s: string): number | null => {
    const n = Number(s.replace(/[^\d]/g, ""));
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
