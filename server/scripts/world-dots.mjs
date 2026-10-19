// 세계 육지 점 격자 만들기(2026-10-19) — Natural Earth(퍼블릭 도메인, world-atlas land-50m) → 2.5° 격자에서 육지인 칸 → shared/worldDots.ts
// 프로젝트 의존성이 아니다 — 빈 폴더에 받아서 한 번 돌린다:
//   mkdir /tmp/geo && cd /tmp/geo && npm init -y && npm i world-atlas@2.0.2 topojson-client@3.1.0
//   node server/scripts/world-dots.mjs /tmp/geo shared/worldDots.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const [pkgs, out] = process.argv.slice(2);
const require = createRequire(join(pkgs, "package.json"));
const topo = JSON.parse(readFileSync(join(pkgs, "node_modules/world-atlas/land-50m.json"), "utf8"));
const { feature } = require("topojson-client");
const land = feature(topo, topo.objects.land);
const polys = [];
for (const f of land.features ?? [land]) {
    const g = f.geometry ?? f;
    const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const p of list) {
        const ring = p[0];
        let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
        for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        polys.push({ rings: p, x0, x1, y0, y1 });
    }
}
const inRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
const isLand = (x, y) => polys.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1 && inRing(x, y, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(x, y, h)));
const STEP = 2.5, LAT0 = 75, LAT1 = -55;
const rows = [];
let n = 0;
for (let lat = LAT0; lat >= LAT1; lat -= STEP) {
    const runs = [];
    let start = -1;
    const cols = 360 / STEP;
    for (let c = 0; c <= cols; c++) {
        const lng = -180 + c * STEP + STEP / 2;
        // 칸 가운데 + 네 귀퉁이 가운데 하나라도 땅이면 땅(작은 섬 · 반도가 사라지지 않게 — 한국 · 일본 · 대만 · 필리핀)
        const land = c < cols && [[0, 0], [-0.8, -0.8], [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8]].some(([dx, dy]) => isLand(lng + dx, lat + dy));
        if (land && start < 0) start = c;
        if (!land && start >= 0) { runs.push(start, c - start); n += c - start; start = -1; }
    }
    rows.push(runs);
}
const body = `/**
 * 세계 육지 점 격자(2026-10-19) — Natural Earth(퍼블릭 도메인) 50m 육지를 ${STEP}° 칸으로 찍은 것. 점 지도 화풍(골프 · 당구장 지도와 같은 손).
 * 만든 법: 작업 폴더에 world-atlas@2.0.2 · topojson-client 를 받아 scratchpad 의 world-dots.mjs 로 한 번 계산(프로젝트 의존성은 아니다).
 * 줄 = 위도 ${LAT0}° → ${LAT1}°(${STEP}° 간격), 줄마다 [시작 칸, 길이, …] — 칸 c 의 경도 = -180 + (c + 0.5) × ${STEP}. 점 ${n}개.
 */
export const WORLD_DOT_STEP = ${STEP};
export const WORLD_DOT_LAT0 = ${LAT0};
export const WORLD_DOT_ROWS: readonly (readonly number[])[] = ${JSON.stringify(rows)};
`;
writeFileSync(out, body);
console.log("dots", n, "rows", rows.length, "bytes", body.length);
