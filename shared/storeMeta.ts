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

// ── 주소 → 시/군/구·동 ─────────────────────────────────────────────
// 제목이 시·도('경기')만 말하면 "화성 당구장" 같은 동네 검색어와 겹치지 않는다(2026-09-24 점검).
// 수집 주소는 "경기 화성시 남양읍 역골로 17 6층" · "서울 동작구 상도동 358-1" · "세종 아름서1길 23 (아름동)" 꼴이다.
// 첫 낱말(시·도, "전북특별자치도" 같은 긴 꼴 포함)을 건너뛰고 시·군·구와 읍·면·동을 읽는다. 못 읽으면 빈칸 — 지어내지 않는다.
const METRO = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);
export interface StoreLocality {
    /** "화성시" · "동작구" · "음성군" — schema.org addressLocality */
    city: string | null;
    /** 시 안의 구("수원시 권선구" 의 권선구) */
    gu: string | null;
    /** "남양읍" · "상도동" · "아름동" */
    dong: string | null;
}
export function storeLocality(address: string | null | undefined, region: string): StoreLocality {
    const addr = (address ?? "").trim();
    const toks = addr.split(/\s+/).filter(Boolean);
    // 첫 낱말이 시·도면 건너뛴다. 아니면(도로명부터 시작하는 주소) 시군구·동을 읽지 않는다 — 틀린 동네를 제목에 쓰느니 시·도만
    const skipped = !!toks[0] && (toks[0].startsWith(region) || /(도|특별시|광역시|특별자치시)$/.test(toks[0]));
    if (!skipped) return { city: null, gu: null, dong: null };
    let i = 1;
    const city = /^[가-힣]{1,6}(시|군|구)$/.test(toks[i] ?? "") ? toks[i++] : null;
    const gu = city && /시$/.test(city) && /^[가-힣]{1,6}구$/.test(toks[i] ?? "") ? toks[i++] : null;
    // 동은 "상도동" · "을지로3가" · 읍·면. '가'는 숫자가 붙은 것만(상가·빌리지가 같은 건물 이름을 동으로 읽지 않게)
    const isDong = (t: string) => /^[가-힣]{1,8}(?:\d{0,2}동|\d{1,2}가|읍|면)$/.test(t);
    // 지번 주소는 시군구 바로 뒤, 도로명 주소는 괄호 "(아름동)" · "(가음동, …)" 에 동이 있다
    const paren = /\(([가-힣]{1,8}(?:\d{0,2}동|\d{1,2}가))[,)\s]/.exec(addr)?.[1] ?? null;
    const dong = toks[i] && isDong(toks[i]) ? toks[i] : paren;
    return { city, gu, dong };
}
/**
 * 제목에 쓰는 동네, 긴 것부터 — ["화성 남양", "화성"] · ["서울 동작구 상도동", "서울 동작구", "서울"].
 * 광역시는 구 이름이 겹쳐(중구·서구·강서구) 시·도를 앞에 둔다. 읍·면은 꼬리를 떼고(남양읍 → 남양), 동은 붙인다("상도동 당구장").
 */
export function storeAreasKo(address: string | null | undefined, region: string): string[] {
    const { city, gu, dong } = storeLocality(address, region);
    const d = dong ? dong.replace(/^(.{2,})(읍|면)$/, "$1") : null;
    const out: string[] = [];
    if (METRO.has(region)) {
        if (city && d) out.push(`${region} ${city} ${d}`);
        if (city) out.push(`${region} ${city}`);
        else if (d) out.push(`${region} ${d}`);
    } else if (city) {
        const c = city.replace(/^(.{2,})(시|군)$/, "$1");
        // "부안군 부안읍" 처럼 읍 이름이 시군과 같으면 한 번만
        if (d && d !== c) out.push(`${c} ${d}`);
        if (gu) out.push(`${c} ${gu}`);
        out.push(c);
    }
    out.push(region);
    return out;
}

/**
 * 매장 제목 — "캐롬 그라운드 화성 남양 당구장 — 요금·영업시간 | 랭큐". 이름+동네가 22자를 넘으면 짧은 동네로 내려간다(브랜드 앞 35자 안).
 * address 를 안 주면 예전 꼴(시·도만). 화면·프리렌더가 **같은 인자**를 넘겨야 같은 제목이다(2026-09-24).
 */
export function storeTitleKo(name: string, region: string, address?: string | null): string {
    if (address == null) return `${name} — ${region} 당구장 요금·영업시간 | 랭큐`;
    const areas = storeAreasKo(address, region);
    const area = areas.find((a) => name.length + 1 + a.length <= 22) ?? areas[areas.length - 1];
    // 이름에 이미 '당구장'이 있으면(1,199곳 중 280곳) 한 번만 — "코빌당구장 인천 미추홀구 주안동 당구장"이 되지 않게
    return `${name} ${area}${name.includes("당구장") ? "" : " 당구장"} — 요금·영업시간 | 랭큐`;
}

/** 지역 허브(/stores?region=서울) — "서울 당구장" 로컬 검색 타깃. 클라이언트 useSeo 와 프리렌더가 함께 쓴다. */
export const regionTitleKo = (region: string) => `${region} 당구장 목록 · 주소·영업시간·요금 | 랭큐`;
export const regionDescKo = (region: string, count: number) =>
    `${region} 당구장 ${count.toLocaleString("ko-KR")}곳의 주소·영업시간·테이블 구성·요금을 한 곳에서. 전국 당구장 디렉토리 랭큐.`;

/**
 * "지역 당구장 요금"이 실제 검색어라 요금을 맨 앞에 둔다. 끝에 붙던 "전국 당구장 디렉토리를 랭큐에서."는 1,199곳이 같은 문장이라 뺐다(2026-09-24).
 * 테이블 구성은 100자 안에 들 때만 덧붙인다.
 */
export function storeDescKo(
    name: string, address: string,
    s: StoreRates & { tableLarge?: number | null; tableMedium?: number | null; tablePocket?: number | null },
    openHours?: string | null,
): string {
    const rate = rateSummaryKo(s);
    const build = (addr: string) => [
        rate ? `${rate} —` : "",
        `${name}, ${addr}.`,
        openHours ? `영업시간 ${openHours}.` : "",
    ].filter(Boolean).join(" ");
    let out = build(address);
    // 100자를 넘으면 주소의 괄호·건물·층을 뗀다(길찾기 링크와 같은 정리) — 요금·영업시간이 잘리지 않게
    if (out.length > 100) {
        const short = address.replace(/\s*\(.*$/, "").replace(/\s*(지하\s*)?\d+층.*$/, "").trim();
        if (short.length >= 5) out = build(short);
    }
    const tables = [
        s.tableLarge ? `대대 ${s.tableLarge}` : "", s.tableMedium ? `중대 ${s.tableMedium}` : "", s.tablePocket ? `포켓 ${s.tablePocket}` : "",
    ].filter(Boolean).join("·");
    if (tables && out.length + tables.length + 6 <= 100) out += ` 테이블 ${tables}.`;
    return out;
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
    const loc = storeLocality(s.address, s.region);
    return {
        "@context": "https://schema.org",
        "@type": ["LocalBusiness", "SportsActivityLocation"],
        "@id": url,
        name: s.name,
        url,
        address: {
            "@type": "PostalAddress",
            streetAddress: s.address,
            // 지역(region)은 시·도(경기·서울 …) 17개 중 하나라 addressRegion 이다. 시·군·구를 읽지 못하면 locality 는 비운다(2026-09-24)
            ...(loc.city ? { addressLocality: loc.city } : {}),
            addressRegion: s.region,
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
