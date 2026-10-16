/**
 * 낚시 공공자료 상태판의 정의(2026-10-17 어드민 › 낚시 › 공공자료). 받아 두는 곳은 fishing_obs(kind) · fishing_sea_status(바다 특보),
 * 받기 기록은 fishing_obs(kind 'health', key 출처 — services/fishingFeedHealth). 화면과 서버가 같이 쓴다. 순수 함수.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
export interface FishingFeedDef {
    id: string;
    label: string;
    /** 어디에 쓰나 — 운영자가 '이게 멈추면 무엇이 비나'를 안다 */
    use: string;
    /** fishing_obs.kind — 바다 특보는 'sea'(fishing_sea_status) */
    kind: string;
    /** 이만큼 지나면 다시 받는다(분). 날마다의 값(조위 · 해)은 null — 그날 것을 한 번 받으면 끝 */
    ttlMin: number | null;
    sources: readonly string[];
}

export const FISHING_FEEDS: readonly FishingFeedDef[] = [
    { id: "indexall", label: "낚시지수 · 전국 지도", use: "오늘 바다 지도 · 조과에 붙는 그날의 바다", kind: "indexall", ttlMin: 180, sources: ["khoa:fcstFishingv2"] },
    { id: "index", label: "낚시지수 · 지점", use: "항구 브리핑의 엿새 지수", kind: "index", ttlMin: 180, sources: ["khoa:fcstFishingv2"] },
    { id: "now", label: "지금 바다", use: "항구 브리핑의 수온 · 기온 · 부이 · 해무", kind: "now", ttlMin: 20, sources: ["khoa:surveyWaterTemp", "khoa:surveyAirTemp", "khoa:twRecent", "khoa:surveySeafog"] },
    { id: "tide", label: "조위 예측", use: "물때 · 만조 · 간조", kind: "tide", ttlMin: null, sources: ["khoa:surveyTideLevel"] },
    { id: "sun", label: "해 뜨고 지는 때", use: "항구 브리핑 · 출조 시간", kind: "sun", ttlMin: null, sources: ["kasi:riseSet"] },
    { id: "sea", label: "바다 특보", use: "오늘 바다 맨 위의 풍랑 · 폭풍해일 주의보", kind: "sea", ttlMin: 15, sources: ["kma:pwn"] },
    { id: "market", label: "위판 · 경매 건수", use: "제철 어종(어시장 경매)", kind: "market", ttlMin: 24 * 60, sources: ["mof:market"] },
    { id: "resv", label: "저수지 물높이", use: "민물 — 저수지 물이 얼마나 찼나", kind: "resv", ttlMin: 360, sources: ["krc:reservoir"] },
];

export const SOURCE_LABEL: Readonly<Record<string, string>> = {
    "khoa:fcstFishingv2": "해양조사원 · 낚시지수", "khoa:surveyTideLevel": "해양조사원 · 조위", "khoa:surveyWaterTemp": "해양조사원 · 수온",
    "khoa:surveyAirTemp": "해양조사원 · 기온", "khoa:twRecent": "해양조사원 · 부이", "khoa:surveySeafog": "해양조사원 · 해무",
    "kasi:riseSet": "천문연구원 · 출몰시각", "kma:pwn": "기상청 · 특보", "mof:market": "해양수산부 · 위판", "krc:reservoir": "농어촌공사 · 저수지",
};

export type FeedState = "fresh" | "stale" | "empty";
/** 받아 둔 값이 지금 쓸 만한가 — 정해진 때의 두 배를 넘겨도 새로 받지 못했으면 '낡음'. 날마다의 값은 오늘 받은 적이 있으면 신선 */
export function feedState(newestMs: number | null, ttlMin: number | null, nowMs: number): FeedState {
    if (newestMs == null) return "empty";
    const limit = ttlMin == null ? 26 * 3600_000 : ttlMin * 2 * 60_000;
    return nowMs - newestMs > limit ? "stale" : "fresh";
}

export interface FeedSourceHealth { source: string; label: string; okAt: string | null; failAt: string | null; fails: number; lastError: string | null }
export interface FishingFeedRow { id: string; label: string; use: string; ttlMin: number | null; keys: number; newestAt: string | null; oldestAt: string | null; state: FeedState; sources: FeedSourceHealth[] }
/** GET /admin/fishing/feeds */
export interface FishingFeeds { keyPresent: boolean; feeds: FishingFeedRow[]; warmFails: { at: string; error: string }[] }
