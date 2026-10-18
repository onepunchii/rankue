/**
 * PBA 선수 '시즌별 기록' 그래프의 셈(2026-10-18) — 화면(client/src/components/hiq/charts/SeasonChart)이 SVG 로 직접 그린다(recharts 를 걷어 냈다).
 *
 * 고친 까닭(디자이너 리뷰): 순위 글씨가 점 · 선 위에 겹쳤고, 쉰 시즌을 건너뛰어 19-20 다음이 바로 23-24 로 붙어 '쉰 적 없는' 것처럼 보였다.
 *  · 시즌 칸은 첫 시즌부터 마지막 시즌까지 빠짐없이 — 기록이 없는 시즌은 칸만 남기고 점선으로 잇는다
 *  · 순위 글씨는 꺾인 바깥쪽에 — 이웃 두 점으로 가는 방향을 더해 그 반대쪽(곧게 지나가는 점은 선의 위쪽 수직)
 *  · 세로 눈금은 1위가 맨 위, 끝은 보기 좋은 수로 올린다
 * ⚠️ 서버가 부를 수도 있다 — 상대 임포트는 ./x.js(지금은 없다).
 */

export interface SeasonSlot<T> { season: number; row: T | null }

/** 첫 시즌부터 마지막 시즌까지 한 칸씩 — 없는 시즌은 row: null */
export function seasonSlots<T extends { season: number }>(rows: readonly T[]): SeasonSlot<T>[] {
    if (!rows.length) return [];
    const by = new Map(rows.map((r) => [r.season, r]));
    const lo = Math.min(...rows.map((r) => r.season)), hi = Math.max(...rows.map((r) => r.season));
    const out: SeasonSlot<T>[] = [];
    for (let s = lo; s <= hi; s++) out.push({ season: s, row: by.get(s) ?? null });
    return out;
}

/** 순위 눈금 — 끝(아래)은 보기 좋은 수로, 칸 간격은 그 끝의 대략 3등분 */
export function rankAxis(maxRank: number): { max: number; ticks: number[] } {
    const m = Math.max(2, Math.ceil(maxRank));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => m / s <= 4) ?? 500;
    const max = Math.max(step, Math.ceil(m / step) * step);
    const ticks = [1];
    for (let v = step; v <= max; v += step) if (v > 1) ticks.push(v);
    return { max, ticks };
}

/**
 * 글씨를 놓을 방향(단위 벡터, 화면 좌표 — y 는 아래가 +).
 * 이웃 두 점(없으면 하나)으로 가는 단위 벡터를 더한 것의 반대쪽. 곧게 지나가 거의 0 이면 선의 위쪽 수직. 이웃이 없으면 위.
 */
export function labelDir(p: [number, number], prev: [number, number] | null, next: [number, number] | null): [number, number] {
    const unit = (a: [number, number]): [number, number] => {
        const dx = a[0] - p[0], dy = a[1] - p[1], l = Math.hypot(dx, dy) || 1;
        return [dx / l, dy / l];
    };
    const us = [prev, next].filter((q): q is [number, number] => q != null).map(unit);
    if (!us.length) return [0, -1];
    let vx = -us.reduce((a, u) => a + u[0], 0), vy = -us.reduce((a, u) => a + u[1], 0);
    if (Math.hypot(vx, vy) < 0.35) {
        // 곧게 지나간다 — 선(다음 쪽 방향)에 수직인 두 쪽 가운데 위쪽
        const [ux, uy] = us[us.length - 1];
        [vx, vy] = [-uy, ux];
        if (vy > 0 || (vy === 0 && vx > 0)) [vx, vy] = [-vx, -vy];
    }
    const l = Math.hypot(vx, vy) || 1;
    return [vx / l, vy / l];
}

/** 막대 위 상금 — 좁은 칸에 들어가게 짧게(ko: 1.2억 · 750만, 그 밖: ₩12M · ₩750K) */
export function prizeShort(won: number, lang: string): string {
    if (lang === "ko") {
        if (won >= 1e8) return `${(Math.round(won / 1e7) / 10).toLocaleString("ko-KR")}억`;
        return `${Math.round(won / 1e4).toLocaleString("ko-KR")}만`;
    }
    if (won >= 1e6) return `₩${(Math.round(won / 1e5) / 10).toLocaleString("en-US")}M`;
    return `₩${Math.round(won / 1e3).toLocaleString("en-US")}K`;
}

/* ── 글씨 자리 고르기 ─────────────────────────────────────────────────── */

export interface LabelBox { x0: number; x1: number; y0: number; y1: number }
export interface LabelCand { x: number; y: number; anchor: "start" | "middle" | "end" }
export interface LabelReq {
    key: number;
    width: number;
    /** 앞의 것부터 시도 */
    cands: LabelCand[];
    /** 어디에도 안 들어가도 첫 자리에 (판 안으로 밀어서) — 가장 좋은 시즌 · 마지막 시즌 */
    must?: boolean;
}

/** 12px 글씨 폭 어림 — 한글 12 · 쉼표 · 점 3.6 · 그 밖 7.2 */
export const textW = (s: string): number => [...s].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? 12 : /[,.]/.test(ch) ? 3.6 : 7.2), 0);

/**
 * 시즌 글씨 중 보일 것 — 칸이 좁으면 겹치는 것을 뺀다. 마지막 · 기록 있는 첫 시즌 · 주어진 강조(가장 좋은 시즌)가 먼저, 그다음 기록 있는 시즌, 쉰 시즌은 맨 나중.
 * xs = 글씨 가운데 x, widths = 글씨 폭, present = 기록 있는 칸인가
 */
export function pickXLabels(xs: readonly number[], widths: readonly number[], present: readonly boolean[], extra: readonly number[] = [], gap = 5): Set<number> {
    const n = xs.length;
    const firstPresent = present.indexOf(true);
    const order = [n - 1, firstPresent, ...extra, ...xs.map((_, k) => k).filter((k) => present[k]), ...xs.map((_, k) => k).filter((k) => !present[k])]
        .filter((k, i, a) => k >= 0 && k < n && a.indexOf(k) === i);
    const shown = new Set<number>();
    for (const k of order) {
        const hit = [...shown].some((j) => Math.abs(xs[j] - xs[k]) < (widths[j] + widths[k]) / 2 + gap);
        if (!hit) shown.add(k);
    }
    return shown;
}

/** 글씨 상자(세로 가운데가 y — 높이 14) */
export function boxOf(c: LabelCand, width: number): LabelBox {
    const x0 = c.anchor === "start" ? c.x : c.anchor === "end" ? c.x - width : c.x - width / 2;
    return { x0, x1: x0 + width, y0: c.y - 7, y1: c.y + 7 };
}
const overlaps = (a: LabelBox, b: LabelBox, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 && b.y0 < a.y1;
const inside = (a: LabelBox, b: LabelBox) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;

/** 선분을 작은 상자들로 — 글씨가 선 위에 앉지 않게 */
export function segmentBoxes(a: [number, number], b: [number, number], step = 5, r = 1.5): LabelBox[] {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    const out: LabelBox[] = [];
    for (let i = 0; i <= n; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / n, y = a[1] + ((b[1] - a[1]) * i) / n;
        out.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
    }
    return out;
}

/**
 * 차례대로 자리를 고른다 — 판 안이고, 장애물(점 · 선 · 막대)과 앞서 놓인 글씨에 안 부딪치는 첫 후보.
 * 들어갈 데가 없으면 빼고(must 는 첫 후보를 판 안으로 밀어 넣는다). 반환: key → 고른 자리
 */
export function placeLabels(reqs: readonly LabelReq[], obstacles: readonly LabelBox[], bounds: LabelBox): Map<number, LabelCand> {
    const placed: LabelBox[] = [];
    const out = new Map<number, LabelCand>();
    for (const r of reqs) {
        let pick = r.cands.find((c) => {
            const b = boxOf(c, r.width);
            return inside(b, bounds) && !obstacles.some((o) => overlaps(b, o, 1)) && !placed.some((p) => overlaps(b, p));
        });
        if (!pick && r.must && r.cands.length) {
            const c = r.cands[0], b = boxOf(c, r.width);
            const dx = b.x0 < bounds.x0 ? bounds.x0 - b.x0 : b.x1 > bounds.x1 ? bounds.x1 - b.x1 : 0;
            const dy = b.y0 < bounds.y0 ? bounds.y0 - b.y0 : b.y1 > bounds.y1 ? bounds.y1 - b.y1 : 0;
            pick = { ...c, x: c.x + dx, y: c.y + dy };
        }
        if (!pick) continue;
        placed.push(boxOf(pick, r.width));
        out.set(r.key, pick);
    }
    return out;
}
