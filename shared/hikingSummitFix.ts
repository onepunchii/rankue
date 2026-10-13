/**
 * 100대 명산 — 정상 자리 바로잡기(2026-10-13).
 *
 * 오너가 활용신청한 공식 목록(한국등산트레킹지원센터 '100대명산목록기본정보', data.go.kr B553662)과 우리 산 표를 견줘 보니
 * 100곳 가운데 40곳의 정상 자리가 150m(정상 인증의 반경) 넘게 달랐다. **어느 쪽도 그대로 믿을 수 없었다** — 공식 좌표가 이웃 봉우리를
 * 가리키는 산도 있었다(천성산 → 토곡산, 대야산 → 둔덕산, 두타산 → 청옥산 쪽 …). 그래서 받아 둔 코스 파일(GPX 6,748개)을 심판으로 썼다:
 * 그 자리 150m 안을 '그 산의 높이로(±35m)' 지나는 기록이 있는 쪽이 맞다.
 *   · 우리 자리를 지나는 기록이 있으면 그대로 둔다(21곳).
 *   · 우리 자리에는 없고 공식 자리에만 있으면 공식 값(by: "official").
 *   · 둘 다 아니면 그 산 이름의 코스 묶음에서 가장 높은 점(by: "track") — 소백산 비로봉 · 두타산 · 천성산 원효봉.
 *   · 정상이 막혀 있어 사람이 서는 곳이 따로 있는 산은 그 자리(공식 값이 그 자리다) — 한라산 동릉 · 무등산 서석대 · 계룡산 관음봉 · 화악산 중봉.
 * 높이는 고치지 않는다(우리 값이 최근 측량값에 더 가깝다 — 한라산 1,947m 등).
 *   · 산림청 100대 명산 코스 파일(같은 날 오너가 받아 준 607개)의 '봉우리' 지점이 그 산의 정상 이름 · 높이로 다른 자리를 가리키면 그 자리(by: "peak") —
 *     청량산: 우리 자리는 장인봉(정상 · 870m)에서 1.6km 동쪽이었다. 그 파일로 100곳을 다시 보니 95곳은 정상 150m 안을 코스가 지난다.
 *     나머지: 명성산(받은 코스가 삼각봉에서 끝난다 — 자리는 그대로) · 점봉산(걸을 수 있는 길이 곰배령까지다) · 대암산(높이 기록이 없는 선) · 천성산(그 폴더의 길은 토곡산이다).
 * 판정하지 못해 그대로 둔 산: 대야산 · 내연산 · 백운산(정선) · 점봉산 · 깃대봉(홍도) — 지나는 기록이 없고 공식 좌표는 이웃 봉우리를 가리킨다.
 *
 * 적재(server/scripts/hiking-import.ts)가 산 자료를 읽은 바로 뒤에 이 표를 덮어쓴다 — 다시 적재해도 고친 자리가 남는다.
 * was 는 고치기 전 자리와의 거리(m) — 기록용.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
export interface SummitFix { id: string; name: string; lat: number; lng: number; by: "official" | "track" | "peak"; was: number }

export const HIKING_SUMMIT_FIXES: readonly SummitFix[] = [
    { id: "Q626912", name: "방태산", lat: 37.88814, lng: 128.39034, by: "official", was: 3138 },
    { id: "Q482720", name: "속리산", lat: 36.54318, lng: 127.87085, by: "official", was: 2825 },
    { id: "Q482709", name: "월악산", lat: 36.88605, lng: 128.10584, by: "official", was: 2025 },
    { id: "Q626975", name: "화악산", lat: 37.98886, lng: 127.49765, by: "official", was: 821 },
    { id: "Q624313", name: "팔공산", lat: 36.01614, lng: 128.6949, by: "official", was: 453 },
    { id: "Q5528708", name: "가야산", lat: 35.82256, lng: 128.12252, by: "official", was: 416 },
    { id: "Q8055033", name: "용문산", lat: 37.56198, lng: 127.54964, by: "official", was: 210 },
    { id: "Q483528", name: "변산", lat: 35.67982, lng: 126.62008, by: "official", was: 8012 },
    { id: "osm8334051398", name: "한라산", lat: 33.36158, lng: 126.53576, by: "official", was: 609 },
    { id: "Q6931712", name: "무등산", lat: 35.1211, lng: 127.00283, by: "official", was: 682 },
    { id: "Q496427", name: "계룡산", lat: 36.36142, lng: 127.21029, by: "official", was: 2046 },
    { id: "Q625589", name: "소백산", lat: 36.95749, lng: 128.48482, by: "track", was: 572 },
    { id: "Q5317235", name: "두타산", lat: 37.4272, lng: 129.00574, by: "track", was: 22392 },
    { id: "Q5091685", name: "천성산", lat: 35.40124, lng: 129.10606, by: "track", was: 15364 },
    { id: "Q5091652", name: "청량산", lat: 36.79442, lng: 128.90884, by: "peak", was: 1648 },
];

/** 산 자료의 한 줄에 고친 자리를 덮어쓴다 — 이름이 다르면(자료의 id 가 바뀌었으면) 건드리지 않는다 */
export function applySummitFix<T extends { id: string; name: string; lat?: number | null; lon?: number | null }>(m: T): T {
    const f = HIKING_SUMMIT_FIXES.find((x) => x.id === m.id);
    return f && m.name === f.name ? { ...m, lat: f.lat, lon: f.lng } : m;
}
