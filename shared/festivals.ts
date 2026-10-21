/**
 * 전국 축제(2026-10-21) — 오너: "전국 축제랑 국토종주를 추가하고 싶은데 어디 카테고리가 좋겠어?" → 축제는 종목이 아니라 '갈 이유'.
 * 결정(AskUserQuestion): **공개 페이지 + 종목별** — /festivals(지도 · 달력 · 축제 한 곳) + 등산 · 낚시 홈과 골프장 · 낚시터 화면에 맞는 축제만.
 *
 * 자료: 한국관광공사 TourAPI(KorService2 · 국문 관광정보 · 이용허락범위 제한 없음)의 축제(EV01)를 하루 한 번 표(tour_festivals)로 옮긴다.
 * 이름 · 날짜 · 주소 · 장소 · 시간 · 요금 · 주최 · 소개는 받은 그대로 싣고 '한국관광공사'를 적는다 — 지어 쓰지 않는다.
 * 사진은 공공누리 제3유형(변경 금지) — **자르지 않는다**(object-cover 금지 · 원본 비율 그대로).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { shortenAddress } from "./billiardHalls.js";

/** 검색용 정본 주소 — 종목마다의 화면(아래)은 정본을 이 주소로 둔다(같은 글이 세 주소로 색인되지 않게) */
export const FESTIVALS_PATH = "/festivals";
export const festivalPath = (id: string) => `/festivals/${encodeURIComponent(id)}`;

/**
 * 종목마다의 축제 화면(2026-10-21 오너: "낚시에서 전국축제 누르면 등산으로 가잖아 … 골프 등산 낚시에 각각 … 골프도 축제가 중요해").
 * 자료는 하나, 화면은 종목의 색 · 하단 탭 안에서 — /golf/festivals · /hiking/festivals · /fishing/festivals(+ /:id).
 */
export type FestivalSport = "GOLF" | "HIKING" | "FISHING";
export const FESTIVAL_SPORTS: readonly FestivalSport[] = ["GOLF", "HIKING", "FISHING"];
export const festivalsSportPath = (sport: FestivalSport) => `/${sport.toLowerCase()}/festivals`;
export const festivalSportPath = (sport: FestivalSport, id: string) => `${festivalsSportPath(sport)}/${encodeURIComponent(id)}`;
export const FESTIVAL_SOURCE = "한국관광공사";
export const FESTIVAL_CREDIT = "자료 · 사진 한국관광공사 · 공공누리 제3유형";
export const festivalPhotoCredit = (lic: string | null | undefined) => `사진 한국관광공사 · 공공누리 제${lic === "Type1" ? 1 : 3}유형`;

/** 목록 한 줄(지도 · 달력 · 목록이 같이 쓴다) */
export interface FestivalRow {
    id: string;
    title: string;
    /** 'YYYYMMDD' */
    start: string;
    end: string;
    addr: string | null;
    /** 시도 줄임말(서울 · 경기 …) */
    region: string | null;
    lat: number;
    lng: number;
    /** 분류(EV010100 …) */
    cat: string | null;
    image: string | null;
    lic: "Type1" | "Type3" | null;
    /** 받은 자료가 고쳐진 날 'YYYYMMDD' */
    mod: string | null;
}
/** 축제 한 곳 — 상세에서 받은 칸이 붙는다(못 받았으면 null) */
export interface FestivalDetail extends FestivalRow {
    tel: string | null;
    place: string | null;
    playtime: string | null;
    fee: string | null;
    host: string | null;
    hostTel: string | null;
    homepage: string | null;
    overview: string | null;
}

/** 시도 — 지도 · 고르기 순서(수도권 → 강원 → 충청 → 전라 → 경상 → 제주) */
export const FESTIVAL_REGIONS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"] as const;
const SHORT_PREFIX = new RegExp(`^(${FESTIVAL_REGIONS.join("|")})(?:\\s|$)`);
/** 법정동 시도 코드(lDongRegnCd) → 줄임말. 주소로 못 정할 때만 쓴다 */
const LDONG: Readonly<Record<string, string>> = { "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산", "36": "세종", "41": "경기", "51": "강원", "42": "강원", "43": "충북", "44": "충남", "52": "전북", "45": "전북", "46": "전남", "47": "경북", "48": "경남", "50": "제주" };

/** 주소(+ 법정동 시도 코드) → 시도 줄임말. 받은 주소가 '부산 …' · '충북 …' 같은 줄임 꼴로 오기도 한다 */
export function festivalRegion(addr: string | null | undefined, ldong?: string | null): string | null {
    const a = String(addr ?? "").replace(/\s+/g, " ").trim();
    const s = shortenAddress(a);
    if (s) return s.region;
    const m = SHORT_PREFIX.exec(a);
    if (m) return m[1];
    return LDONG[String(ldong ?? "")] ?? null;
}

/** 분류 — 고르기 칩의 순서. 이름은 TourAPI 분류표(lclsSystmCode2) 그대로, 칩에는 짧게 */
export const FESTIVAL_CATS: readonly { code: string; chip: string; name: string }[] = [
    { code: "EV010300", chip: "먹거리", name: "지역특산물축제" },
    { code: "EV010500", chip: "자연", name: "생태자연축제" },
    { code: "EV010400", chip: "전통", name: "전통역사축제" },
    { code: "EV010200", chip: "예술", name: "문화예술축제" },
    { code: "EV010100", chip: "문화관광", name: "문화관광축제" },
    { code: "EV010600", chip: "기타", name: "기타 축제" },
];
export const festivalCatName = (code: string | null | undefined) => FESTIVAL_CATS.find((c) => c.code === code)?.name ?? null;

const dayNo = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86_400_000;
const WD = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** 'YYYYMMDD' 의 요일 */
export const weekdayKo = (ymd: string) => WD[new Date(dayNo(ymd) * 86_400_000).getUTCDay()];
/** 한국 시각의 오늘 'YYYYMMDD' */
export function kstToday(ms = Date.now()): string {
    const d = new Date(ms + 9 * 3600_000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
/** 'YYYYMMDD' 에 날을 더한다 */
export function addDays(ymd: string, n: number): string {
    const d = new Date((dayNo(ymd) + n) * 86_400_000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 기간 — '10월 24일(토) ~ 25일(일)' · 달이 바뀌면 '10월 30일(금) ~ 11월 2일(월)' · 하루면 '10월 24일(토)'.
 * withYear 면 앞에 '2026년 ' (검색용 화면 · 지난 축제)
 */
export function festivalPeriod(f: Pick<FestivalRow, "start" | "end">, withYear = false): string {
    const y = withYear ? `${Number(f.start.slice(0, 4))}년 ` : "";
    const md = (s: string) => `${Number(s.slice(4, 6))}월 ${Number(s.slice(6, 8))}일(${weekdayKo(s)})`;
    if (f.start === f.end) return `${y}${md(f.start)}`;
    const sameYear = f.start.slice(0, 4) === f.end.slice(0, 4);
    const endText = !sameYear ? `${Number(f.end.slice(0, 4))}년 ${md(f.end)}` : f.start.slice(4, 6) === f.end.slice(4, 6) ? `${Number(f.end.slice(6, 8))}일(${weekdayKo(f.end)})` : md(f.end);
    return `${y}${md(f.start)} ~ ${endText}`;
}

export type FestivalState = "now" | "soon" | "ended";
/** 오늘 기준 — now: 끝나는 날까지 남은 날(0 = 오늘까지) · soon: 시작까지 남은 날 · ended: 끝난 지 며칠 */
export function festivalState(f: Pick<FestivalRow, "start" | "end">, today: string): { state: FestivalState; days: number } {
    const t = dayNo(today), s = dayNo(f.start), e = dayNo(f.end);
    if (t < s) return { state: "soon", days: s - t };
    if (t <= e) return { state: "now", days: e - t };
    return { state: "ended", days: t - e };
}
/** 알약 한 마디 — '오늘까지' · '3일 남음' · '내일 시작' · 'D-5' · '끝남' */
export function festivalBadge(f: Pick<FestivalRow, "start" | "end">, today: string): string {
    const { state, days } = festivalState(f, today);
    if (state === "now") return days === 0 ? "오늘까지" : days === 1 ? "내일까지" : `${days}일 남음`;
    if (state === "soon") return days === 1 ? "내일 시작" : `D-${days}`;
    return "끝남";
}

/** 이번 주말(토 · 일) — 오늘이 토요일이면 오늘 · 내일, 일요일이면 오늘만 */
export function thisWeekend(today: string): { sat: string; sun: string } {
    const wd = new Date(dayNo(today) * 86_400_000).getUTCDay();
    if (wd === 0) return { sat: today, sun: today };
    const sat = addDays(today, 6 - wd);
    return { sat, sun: addDays(sat, 1) };
}
/** 두 기간이 겹치는가('YYYYMMDD') */
export const overlaps = (f: Pick<FestivalRow, "start" | "end">, from: string, to: string) => f.start <= to && f.end >= from;

/** 지금 열려 있거나 aheadDays 안에 시작하는 것 — 열린 것 먼저, 그다음 빨리 시작하는 것 */
export function liveFestivals<T extends FestivalRow>(list: readonly T[], today: string, aheadDays = 45): T[] {
    const until = addDays(today, aheadDays);
    return list.filter((f) => f.end >= today && f.start <= until)
        .sort((a, b) => (a.start <= today ? 0 : 1) - (b.start <= today ? 0 : 1) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title, "ko"));
}

export const festivalKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const t = Math.PI / 180, x = (b.lng - a.lng) * t * Math.cos(((a.lat + b.lat) / 2) * t), y = (b.lat - a.lat) * t;
    return Math.sqrt(x * x + y * y) * 6371;
};

/**
 * 종목에 맞는 축제 — 이름으로만 고른다(받은 칸에 종목이 없다). 지어 붙이지 않게 낱말을 좁게 둔다.
 *  · 등산: 명산 5km 안의 축제만 싣고(서버), 이 낱말(꽃 · 단풍 · 억새 · 눈꽃 …)이 든 것을 앞에 둔다
 *  · 낚시: 얼음낚시 축제(산천어 · 송어 · 빙어)와 이름에 '낚시'가 든 것 — 대게 · 방어 · 주꾸미는 먹거리 축제라 넣지 않는다
 */
export const HIKING_FESTIVAL_WORDS = /철쭉|진달래|억새|단풍|눈꽃|산수유|구절초|상고대|트레킹|등산|산행|산\s?축제|산\s?철쭉제/;
export const FISHING_FESTIVAL_WORDS = /낚시|산천어|송어|빙어|루어/;

/** 받은 소개 글 다듬기 — 태그를 걷고(줄바꿈은 살린다) 흔한 글자 엔티티를 되돌린다. 길면 자른다 */
export function cleanTourText(raw: unknown, max = 2000): string | null {
    let s = String(raw ?? "");
    if (!s.trim()) return null;
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!s) return null;
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** 홈페이지 칸 — '<a href="http://…">…</a>' · 'www.x.com' 꼴로 온다. http(s) 주소 하나만 */
export function tourHomepage(raw: unknown): string | null {
    const s = String(raw ?? "");
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(s)?.[1] ?? /(https?:\/\/[^\s<>"']+)/i.exec(s)?.[1] ?? /\b(www\.[^\s<>"']+)/i.exec(s)?.[1];
    if (!href) return null;
    try {
        const u = new URL(/^https?:\/\//i.test(href) ? href : `https://${href}`);
        return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch { return null; }
}

/**
 * 문의 번호 — 지역번호 · 070 · 050x · 대표번호(15xx · 16xx · 18xx)만. 휴대전화(01x)는 사람의 번호일 수 있어 싣지 않는다.
 * 받은 칸에 번호가 둘 이상이면 첫 번호만.
 */
export function festivalPhone(raw: unknown): string | null {
    const first = /(\d[\d\-\s)]{6,16}\d)/.exec(String(raw ?? ""))?.[1] ?? "";
    const d = first.replace(/\D/g, "");
    if (/^01\d/.test(d)) return null;
    if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
    if (/^0[3-6][1-5]\d{7,8}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^070\d{8}$/.test(d)) return `070-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^050\d{9}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
    if (/^1[5-8]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return null;
}

/**
 * 받은 목록 한 줄 → 우리 꼴. 축제(EV01)만 · 60일 넘게 이어지는 것(사실상 상설) 빼고 · 좌표가 한반도 안인 것만.
 * 상세 칸은 따로 받는다(detailIntro2 · detailCommon2).
 */
export function festivalFromTour(x: Record<string, unknown>): (FestivalRow & { tel: string | null }) | null {
    const start = String(x.eventstartdate ?? ""), end = String(x.eventenddate ?? "");
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || end < start) return null;
    if (String(x.lclsSystm2 ?? "") !== "EV01") return null;
    if (dayNo(end) - dayNo(start) > 60) return null;
    const lat = Number(x.mapy), lng = Number(x.mapx);
    if (!(lat > 32 && lat < 39.5 && lng > 124 && lng < 132)) return null;
    const title = String(x.title ?? "").replace(/\s+/g, " ").trim();
    const id = String(x.contentid ?? "").trim();
    if (!title || !/^\d+$/.test(id)) return null;
    const addr = String(x.addr1 ?? "").replace(/\s+/g, " ").trim() || null;
    const lic = String(x.cpyrhtDivCd ?? "");
    const img = String(x.firstimage ?? "").trim();
    // 사진은 공공누리 1 · 3유형으로 표시된 것만(표시 없는 것은 쓰지 않는다). 화면이 https 라 http 는 https 로
    const image = img && (lic === "Type1" || lic === "Type3") ? img.replace(/^http:\/\//, "https://") : null;
    const mod = /^\d{8}/.exec(String(x.modifiedtime ?? ""))?.[0] ?? null;
    return {
        id, title, start, end, addr, region: festivalRegion(addr, String(x.lDongRegnCd ?? "")), lat, lng,
        cat: /^EV01\d{4}$/.test(String(x.lclsSystm3 ?? "")) ? String(x.lclsSystm3) : null,
        image, lic: image ? (lic as "Type1" | "Type3") : null, mod, tel: festivalPhone(x.tel),
    };
}

/**
 * 축제 날 날씨(2026-10-21) — 기상청 예보(오늘부터 열하루, server/services/golfWeather 를 그대로)에서 축제 기간과 겹치는 날만, 일곱 날까지.
 * 하루의 하늘은 비 · 눈이 낀 반나절이 있으면 그것, 아니면 낮(오후)의 하늘. 예보 칸은 'YYYY-MM-DD'.
 */
export interface FestivalWxDay { date: string; kind: string; pop: number | null; tmn: number | null; tmx: number | null; src: "short" | "mid" }
export function festivalWeatherDays(days: readonly { date: string; src: "short" | "mid"; am: { kind: string; pop: number | null } | null; pm: { kind: string; pop: number | null } | null; tmn: number | null; tmx: number | null }[], f: Pick<FestivalRow, "start" | "end">): FestivalWxDay[] {
    const wet = new Set(["shower", "rain", "sleet", "snow"]);
    const ymd = (d: string) => d.replace(/-/g, "");
    return days.filter((d) => ymd(d.date) >= f.start && ymd(d.date) <= f.end).slice(0, 7).map((d) => {
        const halves = [d.am, d.pm].filter((x): x is { kind: string; pop: number | null } => !!x);
        const pick = halves.find((x) => wet.has(x.kind)) ?? d.pm ?? d.am;
        const pops = halves.map((x) => x.pop).filter((x): x is number => x != null);
        return { date: d.date, kind: pick?.kind ?? "clear", pop: pops.length ? Math.max(...pops) : null, tmn: d.tmn, tmx: d.tmx, src: d.src };
    });
}

/** 축제 카드(1200 정사각 · server/services/festivalCard)의 글 — 이름 · 기간(해까지) · 지역 · 장소 · 알약(열림 · D-day, 끝났으면 없음) */
export function festivalCardInput(f: FestivalRow & { place?: string | null }, today: string): { title: string; period: string; place: string; tag: string | null; live: boolean } {
    const st = festivalState(f, today);
    const where = f.place || f.addr?.split(" ").slice(1, 3).join(" ") || null;
    return {
        title: f.title, period: festivalPeriod(f, true), place: [f.region, where].filter(Boolean).join(" · "),
        tag: st.state === "now" ? (st.days === 0 ? "오늘까지" : "지금 열려요") : st.state === "soon" ? `D-${st.days}` : null,
        live: st.state === "now",
    };
}

/** 검색용 제목 · 설명 — 허브 */
export function festivalsHubSeo(n: { live: number; weekend: number }) {
    const bits = [n.weekend > 0 ? `이번 주말 ${n.weekend}곳` : "", n.live > 0 ? `지금 · 곧 열리는 축제 ${n.live}곳` : ""].filter(Boolean).join(" · ");
    return {
        path: FESTIVALS_PATH,
        title: "전국 축제 달력 · 지도 — 이번 주말 어디 갈까 | 랭큐",
        desc: `${bits ? `${bits}. ` : ""}전국 축제를 지도와 달력으로 보고 지역 · 종류로 골라요. 축제 가는 길에 들를 산 · 골프장 · 낚시터까지. 자료 한국관광공사.`,
    };
}
export const FESTIVALS_H1 = "전국 축제";
export const FESTIVALS_TAGLINE = "이번 주말 어디 갈까 — 지도와 달력으로 보는 전국 축제";

/** 검색용 제목 · 설명 — 축제 한 곳. 없는 것은 적지 않는다 */
export function festivalSeo(f: FestivalRow & { place?: string | null }, near: { mountains: number; golf: number; fishing: number }) {
    const year = Number(f.start.slice(0, 4));
    const where = [f.region, f.addr?.split(" ").slice(1, 2)[0]].filter(Boolean).join(" ");
    const around = [near.mountains ? `산 ${near.mountains}곳` : "", near.golf ? `골프장 ${near.golf}곳` : "", near.fishing ? `낚시터 ${near.fishing}곳` : ""].filter(Boolean).join(" · ");
    return {
        path: festivalPath(f.id),
        title: `${f.title} ${year} — ${festivalPeriod(f)}${where ? ` · ${where}` : ""} | 랭큐`,
        desc: `${festivalPeriod(f, true)}${f.place || f.addr ? `, ${f.place || f.addr}` : ""}.${around ? ` 가는 길에 들를 ${around}.` : ""} 자료 한국관광공사.`,
    };
}
