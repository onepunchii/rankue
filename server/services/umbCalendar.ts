// UMB 공식 달력(https://www.umb-carom.org/calendar) — 대회 허브의 '다가오는 대회' UMB 줄(2026-09-24).
// 서버에서 미리 그린 Blazor HTML 이라 표 하나를 읽으면 된다(robots.txt: /calendar 허용, 2026-09-24 실측).
// 실측한 표 모양: 열 = Date · Tournament · Place · Type · Organization. 달 머리줄("September 2026", colspan=5) 아래에
//   "23 - 27 Sep" · "24 Oct" · "30 Aug - 05 Sep"(달을 넘김) 같은 날짜가 온다. 장소는 "BLOIS / France",
//   미정 도시는 "N/A / Korea", 연기는 "POSTPONED - DOHA / Qatar". 대회명 칸에는 "Registration Open" 배지 span 이 붙기도 한다.
// 사실(날짜·이름·도시·국가·종류·주관)만 옮긴다. 총회(General Assembly) 같은 대회가 아닌 줄과 취소(CANCELLED)된 줄은 뺀다.
// 부른 쪽에 절대 던지지 않는다 — 실패하면 직전 캐시, 그것도 없으면 빈 목록(ok=false).
import type { UmbCalendarItem } from "../../shared/tournamentMeta.js";
import { titleCase } from "../../shared/umbEventLabel.js";

const URL_CAL = "https://www.umb-carom.org/calendar";
const UA = "RankueBot/1.0 (+https://www.rankue.co.kr; billiards app; contact: support@rankue.co.kr)";
const TTL_MS = 6 * 60 * 60 * 1000;
// 실패 뒤 곧바로 다시 두드리지 않는다 — 봇·사람 요청마다 상대 서버로 새지 않게
const RETRY_AFTER_FAIL_MS = 15 * 60 * 1000;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// 공식 달력의 영어 국가명 → 두 글자 코드(한글 국가명·국기용). 모르는 이름은 코드 없이 영어 그대로 보여 준다.
const COUNTRY_CODE: Record<string, string> = {
    korea: "KR", "south korea": "KR", "republic of korea": "KR", france: "FR", turkey: "TR", "türkiye": "TR", turkiye: "TR",
    egypt: "EG", colombia: "CO", vietnam: "VN", "viet nam": "VN", portugal: "PT", belgium: "BE", germany: "DE", spain: "ES",
    qatar: "QA", netherlands: "NL", "the netherlands": "NL", usa: "US", "united states": "US", greece: "GR", japan: "JP",
    italy: "IT", mexico: "MX", peru: "PE", ecuador: "EC", austria: "AT", denmark: "DK", sweden: "SE", "czech republic": "CZ",
    czechia: "CZ", jordan: "JO", luxembourg: "LU", china: "CN", "united arab emirates": "AE", switzerland: "CH",
};

const decode = (s: string) => s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const validDay = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** 날짜 칸 + 달 머리줄의 연·월 → 시작·끝 ISO. 못 읽으면 null */
function parseDates(cell: string, headYear: number, headMonth: number): { start: string; end: string } | null {
    const mon = (s: string) => MONTHS[s.slice(0, 3).toLowerCase()] ?? 0;
    let d1: number, m1: number, d2: number, m2: number;
    let m: RegExpExecArray | null;
    if ((m = /^(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,})\.?$/.exec(cell))) {
        d1 = +m[1]; d2 = +m[2]; m1 = m2 = mon(m[3]);
    } else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s*-\s*(\d{1,2})\s+([A-Za-z]{3,})\.?$/.exec(cell))) {
        d1 = +m[1]; m1 = mon(m[2]); d2 = +m[3]; m2 = mon(m[4]);
    } else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?$/.exec(cell))) {
        d1 = d2 = +m[1]; m1 = m2 = mon(m[2]);
    } else return null;
    if (!m1 || !m2) return null;
    // 시작 달은 머리줄 달과 같다(실측). 12월 머리줄 아래 1월 날짜 같은 어긋남만 연도를 넘긴다
    const y1 = m1 < headMonth - 6 ? headYear + 1 : headYear;
    const y2 = m2 < m1 ? y1 + 1 : y1;
    if (!validDay(y1, m1, d1) || !validDay(y2, m2, d2)) return null;
    const start = iso(y1, m1, d1), end = iso(y2, m2, d2);
    return end < start ? null : { start, end };
}

/** 표 HTML → 줄 목록(지난 대회 포함, 날짜순). 순수 함수(테스트 대상) */
export function parseUmbCalendar(html: string): UmbCalendarItem[] {
    const i = html.indexOf("<table");
    const j = html.indexOf("</table>", i);
    if (i < 0 || j < 0) return [];
    const table = html.slice(i, j).replace(/<!--[\s\S]*?-->/g, "");
    const out: UmbCalendarItem[] = [];
    let headYear = 0, headMonth = 0;
    for (const tr of table.match(/<tr\b[\s\S]*?<\/tr>/g) ?? []) {
        const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
        if (cells.length === 1) {
            const h = /^([A-Za-z]+)\s+(\d{4})$/.exec(text(cells[0]));
            if (h && MONTHS[h[1].slice(0, 3).toLowerCase()]) { headMonth = MONTHS[h[1].slice(0, 3).toLowerCase()]; headYear = +h[2]; }
            continue;
        }
        if (cells.length < 5 || !headYear) continue;
        const dates = parseDates(text(cells[0]), headYear, headMonth);
        // 배지(span: "Registration Open")는 대회 이름이 아니다
        const name = text(cells[1].replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, " "));
        const type = text(cells[3]) || null;
        if (!dates || !name) continue;
        if (/assembly|congress|meeting|seminar/i.test(`${type ?? ""} ${name}`)) continue;
        let place = text(cells[2]);
        // 취소된 대회는 '다가오는 대회'가 아니다 — 꼬리표만 떼고 멀쩡한 일정처럼 보여 주면 안 된다(연기는 연기로 표시)
        if (/^cancell?ed\b/i.test(place) || /\bcancell?ed\b/i.test(name)) continue;
        const postponed = /^postponed\b/i.test(place);
        place = place.replace(/^postponed\s*-\s*/i, "");
        const slash = place.lastIndexOf(" / ");
        const cityRaw = slash >= 0 ? place.slice(0, slash).trim() : "";
        const country = (slash >= 0 ? place.slice(slash + 3) : place).trim() || null;
        const city = cityRaw && !/^(?:n\/?a|tba|tbd|-)$/i.test(cityRaw) ? titleCase(cityRaw) : null;
        out.push({
            startDate: dates.start, endDate: dates.end, name: name.slice(0, 120),
            city, country, countryCode: country ? COUNTRY_CODE[country.toLowerCase()] ?? null : null,
            type, organization: text(cells[4]) || null, postponed,
        });
    }
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

let cache: { at: number; items: UmbCalendarItem[]; ok: boolean } | null = null;
let lastFailAt = 0;

/** 달력 전체(캐시 6시간). ok=false 면 한 번도 못 읽은 것 — 화면이 '불러오지 못했다'로 적는다 */
export async function getUmbCalendar(): Promise<{ items: UmbCalendarItem[]; ok: boolean }> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache;
    if (Date.now() - lastFailAt < RETRY_AFTER_FAIL_MS) return cache ?? { items: [], ok: false };
    try {
        const res = await fetch(URL_CAL, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`UMB calendar ${res.status}`);
        const items = parseUmbCalendar(await res.text());
        // 표를 하나도 못 읽었으면 모양이 바뀐 것 — 빈 목록으로 캐시를 덮지 않는다
        if (!items.length) throw new Error("UMB calendar: 읽은 줄 없음(표 모양 변경?)");
        cache = { at: Date.now(), items, ok: true };
        return cache;
    } catch (e) {
        lastFailAt = Date.now();
        console.warn("[umb-calendar]", (e as Error)?.message);
        return cache ?? { items: [], ok: false };
    }
}

/** 오늘(한국 날짜) 이후 끝나는 대회 — 시작일순 */
export async function getUpcomingUmbEvents(today: string): Promise<{ items: UmbCalendarItem[]; ok: boolean }> {
    const { items, ok } = await getUmbCalendar();
    return { items: items.filter((x) => x.endDate >= today), ok };
}
