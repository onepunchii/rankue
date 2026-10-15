/**
 * 내 위치 보내기(2026-10-15 오너 "추천대로") — 산행 중 지금 자리를 카카오톡 · 문자로. 서버에 남기지 않는다.
 * 카카오맵 공식 링크 꼴: https://map.kakao.com/link/map/이름,위도,경도
 * ⚠️ 서버가 임포트할 수 있는 shared 파일 — 상대 임포트는 './x.js'.
 */
export function kakaoMapLink(name: string, lat: number, lng: number): string {
    const label = name.replace(/[,\s]+/g, " ").trim() || "내 위치";
    return `https://map.kakao.com/link/map/${encodeURIComponent(label)},${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function locationMessage(o: { mountain: string; lat: number; lng: number; atMs: number; gridNo?: string | null }): string {
    const d = new Date(o.atMs + 9 * 3_600_000);
    const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const lines = [`[랭큐 등산] ${o.mountain} 산행 중 · ${hm} 위치`, kakaoMapLink(`${o.mountain} 내 위치`, o.lat, o.lng)];
    if (o.gridNo) lines.push(`국가지점번호 ${o.gridNo}`);
    return lines.join("\n");
}
