/**
 * 공공데이터 인허가 좌표(EPSG:5174 — 보정계수 없는 Bessel 중부원점 TM) → 위경도(WGS84)(2026-10-19).
 * 「행정안전부_생활_당구장업 조회서비스」처럼 지방행정 인허가 자료가 이 좌표로 온다 — 바깥 지오코딩 없이 우리가 바꾼다.
 * 1) TM 역투영(Bessel 1841 타원체, 원점 위도 38° · 경도 127.0028902777778° · 축척 1 · 가산 200,000 / 500,000)
 * 2) Bessel 지심 좌표 → 7변수 변환(EPSG:5174 의 towgs84: -115.80, 474.99, 674.11 m · 1.16, -2.31, -1.63″ · 6.43 ppm, 위치 벡터 방식) → WGS84
 * 정확도는 받은 자료로 실측해서 적는다(우리 매장 1,195곳의 좌표와 견준다). ⚠️ 서버가 부른다 — 임포트 없음.
 */

const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };
const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const LAT0 = (38 * Math.PI) / 180, LON0 = (127.0028902777778 * Math.PI) / 180, K0 = 1, X0 = 200000, Y0 = 500000;
const TOWGS = { dx: -115.8, dy: 474.99, dz: 674.11, rx: 1.16, ry: -2.31, rz: -1.63, ds: 6.43 };

const meridianArc = (phi: number, a: number, e2: number) => {
    const e4 = e2 * e2, e6 = e4 * e2;
    return a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
        + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) - ((35 * e6) / 3072) * Math.sin(6 * phi));
};

/** TM 평면(x 동쪽 · y 북쪽, m) → Bessel 위경도(라디안) */
function tmInverse(x: number, y: number): { phi: number; lam: number } {
    const { a, f } = BESSEL;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const M = meridianArc(LAT0, a, e2) + (y - Y0) / K0;
    const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
        + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const N1 = a / Math.sqrt(1 - e2 * s * s), R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
    const C1 = ep2 * c * c, T1 = t * t, D = (x - X0) / (N1 * K0);
    const phi = phi1 - ((N1 * t) / R1) * (D * D / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
        + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
    const lam = LON0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
    return { phi, lam };
}

const toEcef = (phi: number, lam: number, { a, f }: { a: number; f: number }) => {
    const e2 = f * (2 - f), N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    return [N * Math.cos(phi) * Math.cos(lam), N * Math.cos(phi) * Math.sin(lam), N * (1 - e2) * Math.sin(phi)] as const;
};
const fromEcef = (X: number, Y: number, Z: number, { a, f }: { a: number; f: number }) => {
    const e2 = f * (2 - f), p = Math.hypot(X, Y);
    let phi = Math.atan2(Z, p * (1 - e2));
    for (let i = 0; i < 6; i++) { const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2); phi = Math.atan2(Z + e2 * N * Math.sin(phi), p); }
    return { phi, lam: Math.atan2(Y, X) };
};

/** EPSG:5174 (x, y) → { lat, lng }(WGS84, 도). 숫자가 아니거나 한반도 밖이면 null */
export function tm5174ToWgs84(x: number, y: number): { lat: number; lng: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 700000 || y > 900000) return null;
    const { phi, lam } = tmInverse(x, y);
    const [X, Y, Z] = toEcef(phi, lam, BESSEL);
    const sec = Math.PI / (180 * 3600), s = 1 + TOWGS.ds * 1e-6;
    const rx = TOWGS.rx * sec, ry = TOWGS.ry * sec, rz = TOWGS.rz * sec;
    // 위치 벡터 방식(proj4 towgs84 와 같다)
    const X2 = TOWGS.dx + s * (X - rz * Y + ry * Z);
    const Y2 = TOWGS.dy + s * (rz * X + Y - rx * Z);
    const Z2 = TOWGS.dz + s * (-ry * X + rx * Y + Z);
    const g = fromEcef(X2, Y2, Z2, WGS84);
    const lat = (g.phi * 180) / Math.PI, lng = (g.lam * 180) / Math.PI;
    return lat > 32 && lat < 39.5 && lng > 124 && lng < 132 ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}
