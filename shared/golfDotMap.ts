/**
 * 골프장 점 지도의 **좌표 규칙 정본**(2026-09-30) — 화면(CourseDotMap·발자국 지도)과 서버(발자국 공유 카드)가 같이 쓴다.
 *
 * 왜 따로 뺐나: 발자국(도장깨기 순서)은 점 지도 위에 겹쳐 그린다. 투영이 한 글자라도 다르면 발자국이 엉뚱한 칸에
 * 찍힌다. 그래서 CourseDotMap 안에 있던 투영·틀 맞추기·벌집 격자를 그대로 옮겨 와 세 곳이 한 함수를 부른다.
 * (옮기기만 했다 — 숫자·규칙은 2026-09-24 셋째 판 그대로다.)
 */

/**
 * 점의 뜻. dim = 지금 범위 밖 · on = 골프장 · watch = 내 관심(2026-10-05 — 로그인한 사람에게만) · 나머지 셋 = 지금 올라온 글.
 * 색은 화면(CourseDotMap)이 정한다: 조인 주황 · 부킹 라임 · 긴급 빨강 · 내 관심 호박색.
 */
export type DotTone = "dim" | "on" | "watch" | "booking" | "join" | "urgent";
export interface MapDot { key: string; lat: number; lng: number; tone: DotTone }
/** [x, y, 너비, 높이] — SVG viewBox 와 같은 순서 */
export type MapBox = [number, number, number, number];

// 등거리 투영에 위도 36° 코사인을 곱한다 — 한반도 안에서는 이 정도면 모양이 맞는다.
export const mapX = (lng: number) => (lng - 125.5) * 81;
export const mapY = (lat: number) => (38.8 - lat) * 100;

/** 점이 없을 때의 전국 틀 — 제주 남단과 강원 북단을 감싼다. */
export const KOREA_CORNERS = [{ lat: 33.2, lng: 126.1 }, { lat: 38.4, lng: 129.5 }] as const;

/** 점들을 감싸는 상자를 화면 비율(aspect = 너비/높이)에 맞춰 넓힌다. 너무 좁으면(시군 하나) 최소 폭을 둔다. */
export function fitBox(pts: readonly { lat: number; lng: number }[], aspect: number): MapBox {
    if (!pts.length) return fitBox(KOREA_CORNERS, aspect);
    // 좌표가 엉뚱한 도에 찍힌 골프장이 몇 곳 있다(2026-09-24 검토: 4곳) — 한 점이 틀을 넓히면 경상·전라를 골라도 확대가 안 된다.
    // 가운데(중앙값)에서 1.2도 넘게 떨어진 점은 틀 계산에서 뺀다(점은 그대로 그린다). 점이 적으면 빼지 않는다.
    if (pts.length >= 5) {
        const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
        const mLat = med(pts.map((p) => p.lat)), mLng = med(pts.map((p) => p.lng));
        const near = pts.filter((p) => Math.abs(p.lat - mLat) <= 1.2 && Math.abs(p.lng - mLng) <= 1.2);
        if (near.length >= Math.ceil(pts.length * 0.8)) pts = near;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
        const x = mapX(p.lng), y = mapY(p.lat);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max(x1 - x0, 44) * 1.22, h = Math.max(y1 - y0, 44) * 1.16;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    return [cx - w / 2, cy - h / 2, w, h];
}

/**
 * 가라앉힌 점(발자국 지도 바탕) — 한 칸의 골프장 수(1·2·3곳 이상) → 밝기. CourseDotMap 의 muted 와 같은 값이다
 * (발자국 지도는 확대하려고 점을 직접 그린다 — 2026-09-30). 한쪽을 바꾸면 다른 쪽도.
 */
export const MUTED_DOT_FILL = ["#FFFFFF33", "#FFFFFF4D", "#FFFFFF6B"] as const;

/** 칸 하나에 여러 골프장이 들어오면 가장 급한 색이 이긴다. */
export const TONE_RANK: Record<DotTone, number> = { dim: 0, on: 1, watch: 2, booking: 3, join: 4, urgent: 5 };

export interface DotCell { key: string; x: number; y: number; n: number; tone: DotTone }

/** 벌집 격자(홀수 줄은 반 칸 밀기)에 점을 모은다. g = 칸 너비(지도 좌표). */
export function toCells(dots: readonly MapDot[], g: number): DotCell[] {
    const rowH = g * 0.866;
    const map = new Map<string, DotCell>();
    for (const d of dots) {
        const x = mapX(d.lng), y = mapY(d.lat);
        const r = Math.round(y / rowH);
        const off = (r & 1) * (g / 2);
        const c = Math.round((x - off) / g);
        const k = `${r}:${c}`;
        const cur = map.get(k);
        if (!cur) map.set(k, { key: k, x: c * g + off, y: r * rowH, n: 1, tone: d.tone });
        else {
            if (d.tone !== "dim") cur.n += 1;
            if (TONE_RANK[d.tone] > TONE_RANK[cur.tone]) cur.tone = d.tone;
        }
    }
    // 색 있는 칸이 위에 오게(나중에 그린 것이 위)
    return [...map.values()].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}
