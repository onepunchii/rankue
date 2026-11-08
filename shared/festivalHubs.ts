/**
 * 축제 묶음 화면(2026-11-08 — 네이버 검색어 트렌드 12개월, 당구장=100):
 *   달    /festivals/month/<1~12>   '11월 축제' 27 · '12월 축제' 11
 *   시도  /festivals/region/<시도>   '부산 축제' 46 · '서울 축제' 32 · '경기도 축제' 11 · '지역축제' 20
 *   종류  /festivals/theme/<말>      '불꽃축제' 134 · '벚꽃축제' 55 · '단풍축제' 38 · '국화축제' 34 · '겨울축제' 25 · '눈꽃축제' 22
 * 전엔 /festivals 한 장뿐이라 이 검색어를 받을 자리가 없었다.
 *
 * 묶는 기준은 받은 자료뿐이다 — 달은 기간이 그 달에 걸치는가, 시도는 관광공사 주소의 시도, 종류는 **축제 이름에 그 말이 들었는가**.
 * 화면(client/src/festivals/pages/FestivalGroupPage) · 검색용 화면(server/seo/festivals) · 사이트맵이 같은 셈을 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { FESTIVALS_PATH, FESTIVAL_REGIONS, addDays, type FestivalRow } from "./festivals.js";

export type FestivalGroupKind = "month" | "region" | "theme";
export interface FestivalTheme { slug: string; name: string; re: RegExp }
/** 종류 — 이름에 든 말로만 묶는다(지어 붙이지 않는다). 잰 검색어가 있는 것만 */
export const FESTIVAL_THEMES: readonly FestivalTheme[] = [
    { slug: "불꽃", name: "불꽃축제", re: /불꽃/ },
    { slug: "벚꽃", name: "벚꽃축제", re: /벚꽃/ },
    { slug: "단풍", name: "단풍축제", re: /단풍/ },
    { slug: "국화", name: "국화축제", re: /국화/ },
    { slug: "겨울", name: "겨울축제", re: /겨울|눈꽃|얼음|눈썰매|빙어|산천어/ },
    { slug: "빛", name: "빛축제", re: /빛\s?축제|불빛|별빛|빛의|일루미/ },
];
/** 시도의 검색 이름 — '경기도 축제'처럼 도는 '도'까지 붙여 찾는다 */
const REGION_LONG: Readonly<Record<string, string>> = { 경기: "경기도", 강원: "강원도", 충북: "충청북도", 충남: "충청남도", 전북: "전라북도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주도" };
export const festivalRegionLong = (r: string) => REGION_LONG[r] ?? r;

export const festivalMonthPath = (m: number) => `${FESTIVALS_PATH}/month/${m}`;
export const festivalRegionPath = (r: string) => `${FESTIVALS_PATH}/region/${encodeURIComponent(r)}`;
export const festivalThemePath = (slug: string) => `${FESTIVALS_PATH}/theme/${encodeURIComponent(slug)}`;
export const festivalThemeBySlug = (s: string) => FESTIVAL_THEMES.find((t) => t.slug === s.normalize("NFC")) ?? null;
export const festivalRegionByName = (s: string) => (FESTIVAL_REGIONS as readonly string[]).includes(s.normalize("NFC")) ? s.normalize("NFC") : null;

const byStart = (a: FestivalRow, b: FestivalRow) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "ko");
const ymd = (y: number, m: number, d: number) => `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * 그 달의 축제 — 앞으로 올 그 달(이번 달이면 올해, 지난 달이면 내년). 내년 자료가 아직 없으면 올해 그 달(끝난 축제 — 화면이 '지난 축제'라 적는다).
 * 기간이 그 달에 하루라도 걸치면 넣는다.
 */
export function festivalsOfMonth(all: readonly FestivalRow[], m: number, today: string): { year: number; items: FestivalRow[]; past: boolean } {
    const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(4, 6));
    // 끝나지 않은 축제 먼저(이번 달 화면 맨 위에 '끝남'이 줄지어 서지 않게 — 2026-11-08 화면 확인), 그 안에서 시작한 날 순
    const pick = (y: number) => { const from = ymd(y, m, 1), to = ymd(y, m, lastDay(y, m)); return all.filter((f) => f.start <= to && f.end >= from).sort((a, b) => Number(a.end < today) - Number(b.end < today) || byStart(a, b)); };
    const ahead = m >= m0 ? y0 : y0 + 1;
    const items = pick(ahead);
    if (items.length || ahead === y0) return { year: ahead, items, past: false };
    return { year: y0, items: pick(y0), past: true };
}
/** 끝나지 않은 것(지금 · 곧)과 끝난 것(최근 1년)으로 */
function split(items: readonly FestivalRow[], today: string): { live: FestivalRow[]; past: FestivalRow[] } {
    const yearAgo = addDays(today, -365);
    return {
        live: items.filter((f) => f.end >= today).sort(byStart),
        past: items.filter((f) => f.end < today && f.end >= yearAgo).sort((a, b) => b.start.localeCompare(a.start)),
    };
}
export const festivalsOfRegion = (all: readonly FestivalRow[], r: string, today: string) => split(all.filter((f) => f.region === r), today);
export const festivalsOfTheme = (all: readonly FestivalRow[], t: FestivalTheme, today: string) => split(all.filter((f) => t.re.test(f.title)), today);

/** 검색 제목 · 설명 — 있는 숫자만. '추천 · 가볼 만한' 같은 말은 쓰지 않는다 */
export function festivalMonthSeo(m: number, r: { year: number; items: readonly FestivalRow[]; past: boolean }) {
    const n = r.items.length;
    return {
        path: festivalMonthPath(m), h1: `${m}월 축제`,
        title: `${m}월 축제 ${r.year} — 전국 ${n}곳 날짜 · 장소 · 지역 | 랭큐`,
        desc: `${r.year}년 ${m}월에 열리는${r.past ? "(열렸던)" : ""} 전국 축제 ${n}곳을 날짜순으로 — 기간 · 장소 · 시도와 가는 길에 들를 산 · 골프장 · 낚시터. 자료 한국관광공사.`,
    };
}
export function festivalRegionSeo(r: string, g: { live: readonly FestivalRow[]; past: readonly FestivalRow[] }, year: string) {
    const long = festivalRegionLong(r);
    return {
        path: festivalRegionPath(r), h1: `${long} 축제`,
        title: `${long} 축제 ${year} — 지금 · 곧 열리는 ${g.live.length}곳 날짜 · 장소 | 랭큐`,
        desc: `${long}에서 지금 열리거나 곧 열릴 축제 ${g.live.length}곳${g.past.length ? `과 최근 1년에 열린 축제 ${g.past.length}곳` : ""}을 날짜순으로. 자료 한국관광공사.`,
    };
}
export function festivalThemeSeo(t: FestivalTheme, g: { live: readonly FestivalRow[]; past: readonly FestivalRow[] }, year: string) {
    return {
        path: festivalThemePath(t.slug), h1: t.name,
        title: `${t.name} ${year} — 전국 ${t.name} ${g.live.length + g.past.length}곳 날짜 · 장소 | 랭큐`,
        desc: `이름에 '${t.slug}'이 든 전국 축제 — 지금 · 곧 열리는 ${g.live.length}곳${g.past.length ? `, 최근 1년에 열린 ${g.past.length}곳` : ""}. 기간 · 장소 · 시도를 날짜순으로. 자료 한국관광공사.`,
    };
}

/** 사이트맵에 올릴 묶음 — 축제가 하나도 없는 묶음은 빈 화면이라 올리지 않는다 */
export function festivalGroupPaths(all: readonly FestivalRow[], today: string): string[] {
    const out: string[] = [];
    for (let m = 1; m <= 12; m++) if (festivalsOfMonth(all, m, today).items.length) out.push(festivalMonthPath(m));
    for (const r of FESTIVAL_REGIONS) { const g = festivalsOfRegion(all, r, today); if (g.live.length + g.past.length) out.push(festivalRegionPath(r)); }
    for (const t of FESTIVAL_THEMES) { const g = festivalsOfTheme(all, t, today); if (g.live.length + g.past.length) out.push(festivalThemePath(t.slug)); }
    return out;
}
/** 끝난 지 90일 넘은 축제는 사이트맵에서 뺀다(페이지는 남는다 — 다음 해 날짜가 나오면 그 번호로 다시 올라온다) */
export const FESTIVAL_SITEMAP_KEEP_DAYS = 90;
export const festivalInSitemap = (f: Pick<FestivalRow, "end">, today: string) => f.end >= addDays(today, -FESTIVAL_SITEMAP_KEEP_DAYS);
