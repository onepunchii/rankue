/**
 * 카카오 지도(2026-10-25 오너: "코스 지도에 주변 건물 · 도로가 안 보여 답답해한다" → "카카오맵 연동 · 유료로 연결").
 * 랭큐 앱은 **유료**다 — 같은 개발자 계정의 첫 앱(폴리)이 무료 한도를 가져가서, 지도를 한 번 띄울 때마다(new kakao.maps.Map) 0.1원.
 * 정상 사용은 한 달 수백 원이지만, 개발자 게시판에 '개발 중 100만 원' 사례가 있다 — 비용은 사고가 만든다. 그래서 세 겹으로 막는다:
 *   ① 단추를 눌렀을 때만 띄운다(검색 로봇 · 미리 그리기 서버는 누르지 않는다) · 한 화면에서 지도는 한 번만 만든다(KakaoCourseMap)
 *   ② 기기 하나의 하루 상한(KAKAO_MAP_DEVICE_DAILY — 기기 저장소)
 *   ③ 서버의 하루 전체 상한(KAKAO_MAP_DAILY_CAP — 표 kakao_map_loads 의 오늘 줄). 넘으면 그날은 종이 지도만. 끄는 스위치는 env KAKAO_MAP_OFF=1.
 * 지도를 못 띄우면(상한 · 꺼짐 · 신호 없음 · 카카오 오류) 언제나 우리 종이 지도로 돌아간다.
 */

/** 서버의 하루 전체 상한 기본값 — 3,000건 = 약 300원(지금 산 화면이 하루 400번 열린다 — 다 눌러도 남는다). env KAKAO_MAP_DAILY_CAP 로 바꾼다 */
export const KAKAO_MAP_DAILY_CAP_DEFAULT = 3000;
/** 기기 하나가 하루에 띄울 수 있는 수 — 넘으면 그날은 종이 지도만 */
export const KAKAO_MAP_DEVICE_DAILY = 20;
/** 지도를 띄우기 전에 서버에 묻는 곳(POST — 오늘 한 칸을 쓴다) */
export const KAKAO_MAP_LOAD_API = "/api/hiq/hiking/map-load";
/** 카카오 지도 SDK — autoload=false 로 받고 kakao.maps.load 로 연다 */
export const KAKAO_MAP_SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";

export type KakaoMapGate = { ok: true } | { ok: false; reason: "off" | "cap" };

/** env 값 → 하루 상한. 비었거나 숫자가 아니면 기본값, 0 이하면 0(=그날 내내 막힘) */
export function kakaoMapCap(raw: string | undefined | null): number {
    if (raw == null || raw.trim() === "") return KAKAO_MAP_DAILY_CAP_DEFAULT;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? Math.max(0, n) : KAKAO_MAP_DAILY_CAP_DEFAULT;
}

/** 한국 날짜(YYYY-MM-DD) — 카카오 하루 한도도 한국 0시에 새로 찬다 */
export function kstDay(now: Date): string {
    return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 기기 저장소의 오늘 수를 읽어 하나 더 써도 되는지 — 저장소를 못 쓰면 막지 않는다(서버 상한이 뒤에 있다) */
export function deviceAllows(stored: string | null, today: string, max = KAKAO_MAP_DEVICE_DAILY): { ok: boolean; next: string } {
    let n = 0;
    try {
        const v = stored ? (JSON.parse(stored) as { d?: unknown; n?: unknown }) : null;
        if (v && v.d === today && typeof v.n === "number" && Number.isFinite(v.n)) n = v.n;
    } catch { /* 깨진 값 — 0 부터 */ }
    return { ok: n < max, next: JSON.stringify({ d: today, n: n + 1 }) };
}
