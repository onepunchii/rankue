// 도시명/지역명 → 좌표 (Nominatim/OpenStreetMap, 무료·키 불필요).
// 크루 생성 시 좌표 폴백용 — 매장 등록 등 다른 곳에서도 재사용 가능하게 분리.
// 도시 수준 정밀도라 프라이버시 이슈 없음. 실패는 null(좌표 없이 저장 — 무해).

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * 단계적 축소 재시도 — "서울특별시 광진구 구의제1동"처럼 좁은 행정동은 OSM에 없을 수
 * 있어, 실패 시 마지막 토큰을 하나씩 떼며 구→시 수준으로 넓혀 재시도한다.
 */
export async function geocodeCity(
  query: string,
  countryCode?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const tokens = query.trim().split(/\s+/);
  for (let n = tokens.length; n >= 1; n--) {
    const result = await geocodeOnce(tokens.slice(0, n).join(" "), countryCode);
    if (result) return result;
  }
  return null;
}

async function geocodeOnce(
  query: string,
  countryCode?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  try {
    const params = new URLSearchParams({ q, format: "json", limit: "1" });
    if (countryCode) params.set("countrycodes", countryCode.toLowerCase());
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: {
        // Nominatim 정책: 식별 가능한 User-Agent 필수
        "User-Agent": "RANKUE/1.0 (rankue.co.kr; support@rankue.co.kr)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string }[];
    if (!rows?.[0]) return null;
    const lat = Number(rows[0].lat);
    const lng = Number(rows[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
