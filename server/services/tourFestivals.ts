/**
 * 한국관광공사 행사(TourAPI searchFestival2) — 산 페이지의 '이 근처 축제 · 행사'(2026-10-21, shared/tourFestivals).
 * 인스턴스가 6시간 기억한다(행사 목록은 하루에도 거의 안 바뀐다 · 개발 계정 하루 1,000번). 두 달 전부터 시작한 것까지 한 번에(500줄).
 * 못 받으면 빈 목록 — 산 페이지는 그 구역 없이 나간다.
 */
import { festivalOf, type TourFestival } from "../../shared/tourFestivals.js";

const TTL = 6 * 3600_000;
let cache: { at: number; list: TourFestival[] } | null = null;
let inflight: Promise<TourFestival[]> | null = null;

const ymd = (ms: number) => { const d = new Date(ms + 9 * 3600_000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`; };
export const kstYmd = (ms = Date.now()) => ymd(ms);

export async function tourFestivals(): Promise<TourFestival[]> {
    if (cache && Date.now() - cache.at < TTL) return cache.list;
    if (!inflight) {
        inflight = (async () => {
            const key = process.env.DATA_GO_KR_KEY;
            if (!key) return cache?.list ?? [];
            const k = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
            try {
                const r = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${k}&MobileOS=ETC&MobileApp=rankue&_type=json&numOfRows=500&pageNo=1&eventStartDate=${ymd(Date.now() - 60 * 86_400_000)}&arrange=A`, { signal: AbortSignal.timeout(6000) });
                const j: any = await r.json();
                const raw = j?.response?.body?.items?.item;
                const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(festivalOf).filter((x: TourFestival | null): x is TourFestival => !!x);
                cache = { at: Date.now(), list };
                return list;
            } catch (e) {
                console.error("[tourFestivals]", (e as Error)?.message);
                return cache?.list ?? [];
            }
        })().finally(() => { inflight = null; });
    }
    return inflight;
}
