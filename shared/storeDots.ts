/**
 * 전국 당구장 지도의 점(2026-10-17 디자인 리뷰 — 당구에만 '우리 지도'가 없었다: 등산은 종이 지도, 골프는 점 지도, 낚시는 바다).
 *
 * 매장 디렉터리(store_listings, 1,199곳 — 전부 좌표가 있다)를 당구대 위의 공으로 찍는다. 화면이 한 번에 받는 꼴:
 *   { total, regions: ["경기", …], pts: [위도·1000−33000, 경도·1000−124000, 지역 번호, …] }  — 1,199곳이 6KB 남짓(압축).
 * 좌표는 소수 셋째 자리(약 100m)까지만 — 지도에 점을 찍는 데는 그것으로 넉넉하고, 매장 상세에 주소가 따로 있다.
 * 누구에게나 같은 답이라 CDN 공개 캐시에 얹는다(/listings 의 규칙 그대로 — 사람별 답 금지).
 *
 * 지도의 시도 윤곽선(golf/data/koreaMapData, 영문 id 17개)과 디렉터리의 지역 이름(한글 약칭 17개)을 잇는 표도 여기에 둔다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */

export interface StoreDotsWire { total: number; regions: string[]; pts: number[] }
export interface StoreDot { lat: number; lng: number; region: string }

const LAT0 = 33000, LNG0 = 124000;

/** 행 → 보낼 꼴. 좌표가 없거나 한반도 밖이면 뺀다(지도에 찍을 수 없다) */
export function packStoreDots(rows: readonly { lat: number | null; lng: number | null; region: string | null }[]): StoreDotsWire {
    const regions: string[] = [];
    const idx = new Map<string, number>();
    const pts: number[] = [];
    for (const r of rows) {
        if (r.lat == null || r.lng == null || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
        if (r.lat < 33 || r.lat > 38.7 || r.lng < 124.5 || r.lng > 131) continue;
        const name = (r.region ?? "").trim() || "기타";
        let i = idx.get(name);
        if (i == null) { i = regions.length; regions.push(name); idx.set(name, i); }
        pts.push(Math.round(r.lat * 1000) - LAT0, Math.round(r.lng * 1000) - LNG0, i);
    }
    return { total: pts.length / 3, regions, pts };
}

/** 받은 꼴 → 점. 모양이 틀린 답은 빈 목록 */
export function unpackStoreDots(w: unknown): StoreDot[] {
    const o = (w ?? {}) as Partial<StoreDotsWire>;
    if (!Array.isArray(o.pts) || !Array.isArray(o.regions) || o.pts.length % 3 !== 0) return [];
    const out: StoreDot[] = [];
    for (let i = 0; i < o.pts.length; i += 3) {
        const a = Number(o.pts[i]), b = Number(o.pts[i + 1]), r = o.regions[Number(o.pts[i + 2])];
        if (!Number.isFinite(a) || !Number.isFinite(b) || typeof r !== "string") continue;
        out.push({ lat: (a + LAT0) / 1000, lng: (b + LNG0) / 1000, region: r });
    }
    return out;
}

/** 지도 윤곽선의 영문 시도 id → 디렉터리의 지역 이름 */
export const OUTLINE_TO_STORE_REGION: Readonly<Record<string, string>> = {
    Seoul: "서울", Gyeonggi: "경기", Incheon: "인천", Gangwon: "강원",
    "North Chungcheong": "충북", "South Chungcheong": "충남", Daejeon: "대전", Sejong: "세종",
    "North Jeolla": "전북", "South Jeolla": "전남", Gwangju: "광주",
    "North Gyeongsang": "경북", "South Gyeongsang": "경남", Busan: "부산", Daegu: "대구", Ulsan: "울산",
    Jeju: "제주",
};

/** 지역별 수 — 많은 차례 */
export function storeRegionCounts(dots: readonly StoreDot[]): { region: string; count: number }[] {
    const m = new Map<string, number>();
    for (const d of dots) m.set(d.region, (m.get(d.region) ?? 0) + 1);
    return [...m].map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, "ko"));
}
