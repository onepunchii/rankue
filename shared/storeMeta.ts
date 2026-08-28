// 매장 디렉토리(/stores/:code) 표기·구조화데이터 — 클라이언트(store-listing.tsx)와
// 서버 프리렌더가 공유한다. 프리렌더 금선(봇 문서 = React 렌더 결과)을 복제 대신 공유로 보장.

export interface StoreRates {
    rate10Large?: number | null; rate10Medium?: number | null; rate10Pocket?: number | null;
    flatLarge?: number | null; flatMedium?: number | null; flatPocket?: number | null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 검색 설명에 넣을 요금 요약 — "대대 10분당 2,000원 · 중대 10분당 1,700원" */
export function rateSummaryKo(s: StoreRates): string {
    const parts: string[] = [];
    if (s.rate10Large != null) parts.push(`대대 10분당 ${won(s.rate10Large)}`);
    if (s.rate10Medium != null) parts.push(`중대 10분당 ${won(s.rate10Medium)}`);
    if (!parts.length && s.rate10Pocket != null) parts.push(`포켓 10분당 ${won(s.rate10Pocket)}`);
    return parts.join(" · ");
}

export const storeTitleKo = (name: string, region: string) => `${name} — ${region} 당구장 요금·영업시간 | 랭큐`;

/** "지역 당구장 요금"이 실제 검색어라, 값이 있으면 설명 앞쪽에 배치한다. */
export function storeDescKo(name: string, address: string, s: StoreRates, openHours?: string | null): string {
    const rate = rateSummaryKo(s);
    return [
        `${name} — ${address}.`,
        rate ? `요금 ${rate}.` : "",
        openHours ? `영업시간 ${openHours}.` : "",
        "전국 당구장 디렉토리를 랭큐에서.",
    ].filter(Boolean).join(" ");
}

/** schema.org priceRange — 구글 로컬 리치결과에 노출되는 필드. */
export function priceRangeOf(s: StoreRates): string | undefined {
    const nums = [s.rate10Large, s.rate10Medium, s.rate10Pocket].filter((n): n is number => n != null);
    if (!nums.length) return undefined;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    return lo === hi ? `${won(lo)} / 10분` : `${won(lo)}~${won(hi)} / 10분`;
}

/** 수집 원문의 "12:00 ~ 01:00" 은 schema.org 형식이 아니라 구글이 통째로 무시한다.
 *  규격은 "Mo-Su 12:00-01:00" — 요일 접두사 + 하이픈 + 24시간. 변환 실패 시 undefined
 *  (잘못된 값을 넣느니 필드를 빼는 게 낫다). */
export function openingHoursSchema(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    const m = raw.match(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return undefined;
    const pad = (h: string) => h.padStart(2, "0");
    return `Mo-Su ${pad(m[1])}:${m[2]}-${pad(m[3])}:${m[4]}`;
}

export interface StoreLdInput extends StoreRates {
    code: string; name: string; region: string; address: string;
    phone?: string | null; openHours?: string | null;
    latitude?: number | string | null; longitude?: number | string | null;
    tableLarge?: number | null; tableMedium?: number | null; tablePocket?: number | null;
}

/** 당구장 LocalBusiness 구조화데이터.
 *  SportsActivityLocation 을 함께 선언해 "당구장"이라는 업종을 명시한다(구글 로컬 이해도↑). */
export function storeJsonLd(s: StoreLdInput, origin = "https://www.rankue.co.kr") {
    const url = `${origin}/stores/${encodeURIComponent(s.code)}`;
    const lat = s.latitude != null ? Number(s.latitude) : null;
    const lng = s.longitude != null ? Number(s.longitude) : null;
    const tables = (s.tableLarge ?? 0) + (s.tableMedium ?? 0) + (s.tablePocket ?? 0);
    const hours = openingHoursSchema(s.openHours);
    const price = priceRangeOf(s);
    return {
        "@context": "https://schema.org",
        "@type": ["LocalBusiness", "SportsActivityLocation"],
        "@id": url,
        name: s.name,
        url,
        address: {
            "@type": "PostalAddress",
            streetAddress: s.address,
            addressLocality: s.region,
            addressCountry: "KR",
        },
        ...(s.phone ? { telephone: s.phone } : {}),
        ...(hours ? { openingHours: hours } : {}),
        ...(price ? { priceRange: price } : {}),
        ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
            ? {
                geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng },
                hasMap: mapLink(s as any),
            }
            : {}),
        ...(tables > 0
            ? { amenityFeature: { "@type": "LocationFeatureSpecification", name: "당구대", value: tables } }
            : {}),
    };
}

/** 길찾기 링크 — 항상 주소 검색으로 연다.
 *
 *  좌표를 쓰지 않는 이유: 우리 좌표는 Nominatim 지오코딩이 번지를 못 찾으면 동·구
 *  중심점으로 폴백한 값이라 수백 m 어긋날 수 있다(2026-08-28 실사고: 구의동 242-22 가
 *  약 900m 북쪽 지점으로 안내됨). 거리순 정렬에는 충분하지만 길찾기 목적지로는 틀린다.
 *  카카오맵은 한국 지번·도로명 주소를 정확한 필지로 해석하므로 주소 검색이 항상 옳다.
 *  층·호·괄호 주기는 검색 노이즈라 떼고 넘긴다. */
export function mapLink(s: { name: string; address: string; latitude?: number | string | null; longitude?: number | string | null }): string {
    const cleaned = s.address
        .replace(/\(.*$/, "")
        .replace(/\s*(지하\s*)?\d+층.*$/, "")
        .replace(/\s+[\dB]+호.*$/, "")
        .trim();
    const q = cleaned.length >= 5 ? cleaned : s.address;
    if (q) return `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
    // 주소가 아예 없을 때만 좌표 폴백
    const lat = s.latitude != null ? Number(s.latitude) : null;
    const lng = s.longitude != null ? Number(s.longitude) : null;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${lat},${lng}`;
    }
    return `https://map.kakao.com/link/search/${encodeURIComponent(s.name)}`;
}
