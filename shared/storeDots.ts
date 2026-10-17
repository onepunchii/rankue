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

/* ── 매장 상세 '이 근처' 당구대(client/src/components/hiq/stores/StoreTableMap — StoreNearTable)의 셈 ── */

/** 축척 막대의 후보(km) */
export const NICE_KM = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
/** 판의 반높이(km) — 다섯째 곳까지 들어가게. 시골 · 섬은 다섯째가 100km 넘게 멀다(강원 고성 85km · 제주 118km) — 150km 까지 넓힌다 */
export function nearViewKm(near: readonly { distanceKm: number | null }[]): number {
    const far = Math.max(0, ...near.map((n) => n.distanceKm ?? 0));
    return Math.min(150, Math.max(1.2, far * 1.18));
}
/**
 * 번호 공이 겹치면 옆으로 민다(같은 건물의 두 곳 · 같은 읍의 세 곳). 놓인 공(이 매장 먼저)과 겹치면 원래 자리 둘레 여섯 방향 →
 * 두 배 거리 순으로 빈자리를 찾는다. 자리를 지어내는 것이 아니라 표시만 비킨다 — 거리는 목록의 숫자가 말한다.
 */
export function spreadBalls(pts: readonly [number, number][], r: number, first: { x: number; y: number; r: number }, box?: { hw: number; hh: number }): [number, number][] {
    const placed = [first];
    const out: [number, number][] = [];
    // 판 안쪽(box: 가운데에서 반폭 · 반높이)으로 먼저 당기고, 빈자리도 판 안에서만 찾는다 — 당긴 뒤에 다시 겹치던 것(제주의 3 · 4)
    const clamp = (x: number, y: number): [number, number] => box ? [Math.max(-box.hw, Math.min(box.hw, x)), Math.max(-box.hh, Math.min(box.hh, y))] : [x, y];
    const inside = (x: number, y: number) => !box || (Math.abs(x) <= box.hw && Math.abs(y) <= box.hh);
    for (const [xr, yr] of pts) {
        const [x0, y0] = clamp(xr, yr);
        const free = (x: number, y: number) => inside(x, y) && placed.every((p) => Math.hypot(p.x - x, p.y - y) >= (p.r + r) * 0.98);
        let at: [number, number] = [x0, y0];
        if (!free(x0, y0)) {
            outer: for (const ring of [1, 2, 3]) {
                for (let k = 0; k < 6; k++) {
                    const a = (-90 + k * 60 + (ring - 1) * 30) * (Math.PI / 180);
                    const x = x0 + Math.cos(a) * 2.05 * r * ring, y = y0 + Math.sin(a) * 2.05 * r * ring;
                    if (free(x, y)) { at = [x, y]; break outer; }
                }
            }
        }
        placed.push({ x: at[0], y: at[1], r });
        out.push(at);
    }
    return out;
}
/** 거리 글 — 50m 안 · 100m 단위(1km 아래) · km */
export function nearDistText(km: number, within50: string): string {
    if (km < 0.05) return within50;
    if (Math.round(km * 10) < 10) return `${Math.round(km * 10) * 100}m`;
    return km >= 10 ? `${Math.round(km)}km` : `${km.toFixed(1)}km`;
}
