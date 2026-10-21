/**
 * 이 근처 축제 · 행사(2026-10-21) — 한국관광공사 TourAPI(searchFestival2)의 행사를 산 페이지에(가을 단풍철 — 산에 가는 날 들를 곳).
 * 받은 칸(이름 · 날짜 · 주소 · 좌표)만 싣는다 — 소개 글은 지어 쓰지도, 옮겨 싣지도 않는다. 출처 '한국관광공사'.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */

export interface TourFestival { id: string; title: string; start: string; end: string; addr: string | null; lat: number; lng: number }
export interface NearbyFestival extends TourFestival { km: number; state: "now" | "soon" }

const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };
/** 'YYYYMMDD' 하나를 그날의 날 수로(비교 · 뺄셈용) */
const dayNo = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86_400_000;

/** 받은 한 줄 → 우리 꼴. 날짜 · 좌표가 이상하면 null */
export function festivalOf(x: Record<string, unknown>): TourFestival | null {
    const start = String(x.eventstartdate ?? ""), end = String(x.eventenddate ?? "");
    const lat = Number(x.mapy), lng = Number(x.mapx);
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || end < start) return null;
    // 축제(EV01)만 — 공연(EV02) · 체험 · 전시(EV03)는 한 해 내내 열리는 것이 많아 산에 가는 날 들를 '근처 축제'가 아니다(2026-10-21 화면 확인:
    // 남한산에 'DDP 건축투어 · 국악공연'이 떴다). 분류가 없는 옛 줄은 받되, 60일 넘게 이어지는 것은 받지 않는다
    const cls = String(x.lclsSystm2 ?? "");
    if (cls && cls !== "EV01") return null;
    if (dayNo(end) - dayNo(start) > 60) return null;
    if (!(lat > 32 && lat < 39.5 && lng > 124 && lng < 132)) return null;
    const title = String(x.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) return null;
    return { id: String(x.contentid ?? title), title, start, end, addr: String(x.addr1 ?? "").trim() || null, lat, lng };
}

/**
 * 이 자리에서 가까운 행사 — 오늘 열려 있거나(now) aheadDays 안에 시작하는(soon) 것만, 반경 radiusKm 안.
 * 열려 있는 것 먼저, 그다음 빨리 시작하는 것, 같으면 가까운 것. 셋까지.
 */
export function nearbyFestivals(list: readonly TourFestival[], lat: number, lng: number, todayYmd: string, radiusKm = 20, aheadDays = 45, max = 3): NearbyFestival[] {
    const today = dayNo(todayYmd);
    return list
        .map((f) => ({ ...f, km: Math.round(km(lat, lng, f.lat, f.lng) * 10) / 10 }))
        .filter((f) => f.km <= radiusKm && dayNo(f.end) >= today && dayNo(f.start) - today <= aheadDays)
        .map((f) => ({ ...f, state: (dayNo(f.start) <= today ? "now" : "soon") as "now" | "soon" }))
        .sort((a, b) => (a.state === b.state ? 0 : a.state === "now" ? -1 : 1) || a.start.localeCompare(b.start) || a.km - b.km)
        .slice(0, max);
}

/** '10월 24일 ~ 11월 1일'(같은 날이면 하나) */
export function festivalDateKo(f: Pick<TourFestival, "start" | "end">): string {
    const md = (s: string) => `${Number(s.slice(4, 6))}월 ${Number(s.slice(6, 8))}일`;
    return f.start === f.end ? md(f.start) : `${md(f.start)} ~ ${md(f.end)}`;
}

export const TOUR_FESTIVAL_SOURCE = "한국관광공사";
