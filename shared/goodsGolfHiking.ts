/**
 * 굿즈 증정 목록 — 골프 · 등산(2026-10-16). 받은 기록의 열쇠는 'kind:key'(golf_stamp_awards · hiking_awards 의 kind · key).
 * 이름은 화면의 이름표와 같게(client/src/golf/stamps/awardText awardLabel · 등산 '… 와펜'), 그림은 화면이 쓰는 파일 그대로.
 *  - 골프: 도장첩 볼마커 9 · 누구나 36 · 블랙/자개 8씩 · 트로피 5 · 핀 21 · 특별 볼마커(철 따라는 올해 것) · 시즌 태그(올해 것)
 *  - 등산: 와펜(100대 명산 · 명산 플러스 권역 8씩 · 특성 6 · 철 4) · 큰 와펜 2 · 핀 8 · 등급 7(들머리 제외)
 * 해마다 열리는 것(철 볼마커 · 시즌 태그)은 한국 시계로 올해 것만 — 지난해 것을 주면 화면이 올해 칸에 그리지 못한다.
 */
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_OPEN_TOTAL, STAMP_TOTAL, STAMP_TROPHY_STEPS } from "./golfStampBooks.js";
import { GOLF_PINS } from "./golfPins.js";
import { SEASON_TAG_TIERS, SPECIAL_MARKERS, seasonTagKey, specialKey } from "./golfStampExtras.js";
import { HIKING_GRANDS, HIKING_PINS } from "./hikingStamps.js";
import { HIKING_GRADES } from "./hikingGrade.js";
import { HIKING_FEATURES } from "./hikingFeatures.js";
import { HIKING_REGIONS } from "./hikingMountains.js";
import type { GoodsItem } from "./goods.js";

const kstYear = (ms = Date.now()) => new Date(ms + 9 * 3_600_000).getUTCFullYear();
const golfArt = (name: string) => `/golf/stamp-art/${name}.webp`;
const hikeArt = (name: string) => `/hiking/art/${name}.webp`;

export function golfGoods(nowMs = Date.now()): GoodsItem[] {
    const y = kstYear(nowMs);
    const g = (kind: string, key: string, name: string, group: string, groupName: string, image: string): GoodsItem => ({ sport: "golf", key: `${kind}:${key}`, name, group, groupName, image, shape: "square" });
    const open = STAMP_BOOKS.filter((b) => b.kind === "open");
    return [
        ...STAMP_BOOKS.map((b) => g("book", b.id, `${b.name} 볼마커`, "marker", "볼마커", golfArt(`marker-${b.id}`))),
        g("all", STAMP_ALL_OPEN, `누구나 ${STAMP_OPEN_TOTAL} 볼마커`, "marker", "볼마커", golfArt(`marker-${STAMP_ALL_OPEN}`)),
        ...(["black", "pearl"] as const).flatMap((tier) => [...open.map((b) => ({ id: b.id, name: b.name })), { id: STAMP_ALL_OPEN, name: `누구나 ${STAMP_OPEN_TOTAL}` }]
            .map((b) => g(tier, b.id, `${b.name} 볼마커 · ${tier === "black" ? "블랙" : "자개"}`, "tier", "블랙 · 자개", golfArt(`marker-${b.id}-${tier}`)))),
        ...STAMP_TROPHY_STEPS.map((n, i) => g("trophy", String(n), n >= STAMP_TOTAL ? "트로피 전부" : `트로피 ${n}곳`, "trophy", "트로피", golfArt(`trophy-${i + 1}`))),
        ...GOLF_PINS.map((p) => g("pin", p.id, `${p.name} 핀`, "pin", "핀", golfArt(p.art))),
        ...SPECIAL_MARKERS.map((m) => g("special", specialKey(m.id, y), m.yearly ? `${y} ${m.name}` : `${m.name} 볼마커`, "special", "특별 볼마커", golfArt(m.art))),
        ...SEASON_TAG_TIERS.map((t) => g("tag", seasonTagKey(y, t.id), `${y} 시즌 태그 · ${t.name}`, "tag", "시즌 태그", golfArt(t.art))),
    ];
}

/** 특성 도장첩의 이름표 · 이름(shared/hikingStamps THEMES 와 같다 — 그쪽은 내보내지 않는 표라 여기 따로 둔다. 시험이 맞춰 본다) */
export const HIKING_THEME_BOOKS: readonly (readonly [string, string])[] = [
    ["nationalparks", "국립공원의 산"], ["over1500", "하늘 가까운 산"], ["highest50", "높은 산 50"],
    ["island", "섬의 산"], ["provincialparks", "도립공원의 산"], ["under500", "가볍게 오르는 산"],
];

export function hikingGoods(): GoodsItem[] {
    const h = (kind: string, key: string, name: string, group: string, groupName: string, image: string): GoodsItem => ({ sport: "hiking", key: `${kind}:${key}`, name, group, groupName, image, shape: "square" });
    return [
        ...(["kfs", "plus"] as const).flatMap((kind) => HIKING_REGIONS.map((r) => h("patch", `${kind}-${r.id}`, `${kind === "kfs" ? "100대 명산" : "명산 플러스"} ${r.name} 와펜`, "patch", "와펜", hikeArt(`patch-${kind}-${r.id}`)))),
        ...HIKING_THEME_BOOKS.map(([id, name]) => h("patch", id, `${name} 와펜`, "patch", "와펜", hikeArt(`patch-${id}`))),
        ...HIKING_FEATURES.map((f) => h("patch", f.id, `${f.name} 와펜`, "patch", "와펜", hikeArt(`patch-${f.id}`))),
        ...HIKING_GRANDS.map((g) => h("grand", g.id, `${g.name} 큰 와펜`, "grand", "큰 와펜", hikeArt(`patch-${g.art}`))),
        ...HIKING_PINS.map((p) => h("pin", p.id, `${p.name} 핀`, "pin", "핀", hikeArt(p.art))),
        ...HIKING_GRADES.filter((g) => g.min >= 1).map((g) => h("grade", g.id, `등급 · ${g.name}`, "grade", "등급", hikeArt(`grade-${g.id}`))),
    ];
}
