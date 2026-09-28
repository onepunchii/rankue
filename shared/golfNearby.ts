/**
 * 라운드 만들기 '가까운 골프장'(2026-09-28 오너: "내 위치 권한 주면 가까운 골프장이 나와야 하는데 안 나온다").
 * 예전 정렬은 거리가 없는 곳(좌표 없는 골프장)을 만나면 0(같음)을 돌려줘 비교가 앞뒤가 안 맞았다 —
 * 가나다순 목록이 거의 그대로 남아 화면의 '가까운 5곳'이 가나다순 앞쪽의 먼 골프장이 됐다.
 * 거리가 있는 곳을 가까운 순으로 먼저, 없는 곳은 뒤에(원래 순서 그대로).
 */
export function sortByDistance<T extends { distance?: number | null }>(list: readonly T[]): T[] {
    const has = (x: T) => typeof x.distance === "number" && Number.isFinite(x.distance);
    return list
        .map((x, i) => ({ x, i }))
        .sort((a, b) => {
            const ha = has(a.x), hb = has(b.x);
            if (ha && hb) return (a.x.distance as number) - (b.x.distance as number) || a.i - b.i;
            if (ha !== hb) return ha ? -1 : 1;
            return a.i - b.i;
        })
        .map((e) => e.x);
}

/** 위치 좌표 읽기 — 숫자이고 지구 위 범위일 때만(0·NaN·빈 값은 위치 없음) */
export function parseLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
    const a = typeof lat === "string" ? Number(lat) : typeof lat === "number" ? lat : NaN;
    const b = typeof lng === "string" ? Number(lng) : typeof lng === "number" ? lng : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
    return { lat: a, lng: b };
}
