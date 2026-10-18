/**
 * PBA 선수 '시즌별 기록' 그래프 — SVG 로 직접 그린다(2026-10-18, recharts 를 걷어 냈다 — 셈은 shared/pbaSeasonChart).
 * 상금 순위 · 포인트 순위는 선(위가 1위), 상금은 막대. 화면(pba-player)이 lazy 로 받는다(shared/bundleSplit.test).
 *
 *  · 시즌 칸은 첫 시즌부터 마지막까지 빠짐없이 — 쉰 시즌은 점선으로 건너고, 글씨는 옅게
 *  · 시즌 글씨는 겹치면 뺀다 — 마지막 · 기록 있는 첫 시즌 · 가장 좋은 시즌이 먼저(pickXLabels)
 *  · 순위 · 상금 글씨는 점 · 선 · 막대 · 다른 글씨와 부딪치지 않는 자리를 고른다(placeLabels). 들어갈 데가 없으면 뺀다
 *    — 가장 좋은 시즌과 마지막 시즌은 늘 보인다. 흰 테두리로 눈금선 위에서도 읽히게
 *  · 가장 좋은 시즌만 속을 채운다(막대는 진하게)
 */
import { useEffect, useRef, useState } from "react";
import { seasonLabel } from "@shared/pbaMeta";
import { labelDir, pickXLabels, placeLabels, prizeShort, rankAxis, seasonSlots, segmentBoxes, textW, type LabelBox, type LabelCand, type LabelReq } from "@shared/pbaSeasonChart";

export interface SeasonChartRow { season: number; prizeRank: number | null; pointRank: number | null; prize: number }
export interface SeasonChartProps {
    seasons: readonly SeasonChartRow[];
    metric: "prizeRank" | "pointRank" | "prize";
    colors: { brand: string; axis: string; grid: string };
    rankLabel: (v: number) => string;
    lang: string;
    /** 읽어 주는 글 — 무엇을 그린 그래프인지 */
    label: string;
}

/** 판 높이 · 위 여백(맨 위 글씨) · 아래 여백(시즌 글씨 + 맨 아래 점의 글씨) · 오른쪽 여백 */
const H = 204, T = 24, B = 38, R = 14;
const MUTED = "rgba(0,0,0,0.22)";

/** 글씨 — 흰 테두리를 먼저 칠해 선 위에서도 읽힌다 */
function Tag({ c, children, fill, weight = 700 }: { c: LabelCand; children: string; fill: string; weight?: number }) {
    return (
        <text x={c.x} y={c.y} dy="0.35em" textAnchor={c.anchor} fontSize={12} fontWeight={weight} fill={fill}
            stroke="#fff" strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round">{children}</text>
    );
}

export default function SeasonChart({ seasons, metric, colors, rankLabel, lang, label }: SeasonChartProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(300);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => { if (e?.contentRect.width) setW(Math.round(e.contentRect.width)); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const slots = seasonSlots(seasons);
    const n = slots.length;
    const L = metric === "prize" ? 6 : 34;
    const pw = Math.max(40, w - L - R), ph = H - T - B;
    const slotW = n ? pw / n : pw;
    const cx = (k: number) => L + slotW * (k + 0.5);
    // 시즌 글씨 — 칸이 좁으면 겹치는 것을 뺀다(마지막 · 기록 있는 첫 시즌 · 가장 좋은 시즌이 먼저)
    const bestSlot = metric === "prize"
        ? slots.reduce((b, s, k) => ((s.row?.prize ?? -1) > (slots[b]?.row?.prize ?? -1) ? k : b), 0)
        : slots.reduce((b, s, k) => { const v = s.row?.[metric], bv = slots[b]?.row?.[metric]; return v != null && (bv == null || v < bv) ? k : b; }, 0);
    const xShown = pickXLabels(slots.map((_, k) => cx(k)), slots.map((s) => textW(seasonLabel(s.season))), slots.map((s) => !!s.row), [bestSlot]);
    const xLabels = slots.map((s, k) => xShown.has(k) && (
        <text key={s.season} x={cx(k)} y={H - 7} textAnchor="middle" fontSize={12} fill={s.row ? colors.axis : MUTED}>{seasonLabel(s.season)}</text>
    ));
    // 글씨가 앉을 수 있는 곳 — 세로 눈금 숫자 오른쪽, 시즌 글씨 위
    const bounds: LabelBox = { x0: L - 4, x1: w - 1, y0: 1, y1: H - 19 };

    let body: React.ReactNode = null;
    if (metric === "prize") {
        const max = Math.max(1, ...slots.map((s) => s.row?.prize ?? 0));
        const present = slots.map((s, k) => (s.row ? k : -1)).filter((k) => k >= 0);
        const best = present.reduce((b, k) => (slots[k].row!.prize > slots[b].row!.prize ? k : b), present[0] ?? 0);
        const bw = Math.min(30, slotW * 0.56);
        const base = T + ph;
        const bar = (k: number) => {
            const h = Math.max(2, (slots[k].row!.prize / max) * (ph - 4));
            return { x: cx(k) - bw / 2, y: base - h, h };
        };
        const obstacles = present.map((k) => { const b = bar(k); return { x0: b.x, x1: b.x + bw, y0: b.y, y1: base }; });
        const order = [best, present[present.length - 1], ...[...present].sort((a, b) => slots[b].row!.prize - slots[a].row!.prize)]
            .filter((k, i, a) => a.indexOf(k) === i && slots[k].row!.prize > 0);
        const placed = placeLabels(order.map((k): LabelReq => {
            const txt = prizeShort(slots[k].row!.prize, lang);
            return { key: k, width: textW(txt), cands: [{ x: cx(k), y: bar(k).y - 10, anchor: "middle" }], must: k === best || k === present[present.length - 1] };
        }), obstacles, bounds);
        body = (
            <>
                <line x1={L} x2={L + pw} y1={base + 0.5} y2={base + 0.5} stroke={colors.grid} strokeWidth={1} />
                {slots.map((s, k) => {
                    if (!s.row) return <line key={s.season} x1={cx(k) - 5} x2={cx(k) + 5} y1={base - 2} y2={base - 2} stroke={MUTED} strokeWidth={2} strokeLinecap="round" />;
                    const { x, y, h } = bar(k);
                    const r = Math.min(5, bw / 2, h);
                    return (
                        <path key={s.season} d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`}
                            fill={colors.brand} opacity={k === best ? 1 : 0.5} />
                    );
                })}
                {[...placed].map(([k, c]) => (
                    <Tag key={k} c={c} fill={k === best ? colors.brand : "rgba(0,0,0,0.6)"} weight={600}>{prizeShort(slots[k].row!.prize, lang)}</Tag>
                ))}
            </>
        );
    } else {
        const vals = slots.map((s) => s.row?.[metric] ?? null);
        const present = vals.map((v, k) => (v != null ? k : -1)).filter((k) => k >= 0);
        if (present.length) {
            const { max, ticks } = rankAxis(Math.max(...present.map((k) => vals[k]!)));
            const y = (r: number) => T + ((r - 1) / Math.max(1, max - 1)) * ph;
            const pt = (k: number): [number, number] => [cx(k), y(vals[k]!)];
            const best = present.reduce((b, k) => (vals[k]! < vals[b]! ? k : b), present[0]);
            const last = present[present.length - 1];
            const segs = present.slice(1).map((k, i) => ({ a: present[i], b: k }));
            // 장애물 — 점(지름 13)과 선
            const obstacles: LabelBox[] = [
                ...present.map((k) => { const [px, py] = pt(k); return { x0: px - 6.5, x1: px + 6.5, y0: py - 6.5, y1: py + 6.5 }; }),
                ...segs.flatMap(({ a, b }) => segmentBoxes(pt(a), pt(b))),
            ];
            const order = [best, last, present[0], ...present].filter((k, i, a) => a.indexOf(k) === i);
            const placed = placeLabels(order.map((k): LabelReq => {
                const i = present.indexOf(k);
                const p = pt(k);
                const [dx, dy] = labelDir(p, i > 0 ? pt(present[i - 1]) : null, i < present.length - 1 ? pt(present[i + 1]) : null);
                const lean: LabelCand = { x: p[0] + dx * 15, y: p[1] + dy * 15, anchor: Math.abs(dx) > 0.55 ? (dx > 0 ? "start" : "end") : "middle" };
                return {
                    key: k, width: textW(rankLabel(vals[k]!)), must: k === best || k === last,
                    cands: [
                        lean,
                        { x: p[0], y: p[1] - 15, anchor: "middle" }, { x: p[0], y: p[1] + 16, anchor: "middle" },
                        { x: p[0] + 10, y: p[1] - 9, anchor: "start" }, { x: p[0] - 10, y: p[1] - 9, anchor: "end" },
                        { x: p[0] + 10, y: p[1] + 9, anchor: "start" }, { x: p[0] - 10, y: p[1] + 9, anchor: "end" },
                    ],
                };
            }), obstacles, bounds);
            body = (
                <>
                    {ticks.map((v) => (
                        <g key={v}>
                            <line x1={L} x2={L + pw} y1={y(v) + 0.5} y2={y(v) + 0.5} stroke={colors.grid} strokeWidth={1} />
                            <text x={L - 8} y={y(v)} dy="0.35em" textAnchor="end" fontSize={12} fill={colors.axis}>{v}</text>
                        </g>
                    ))}
                    {/* 선 — 붙은 시즌은 실선, 쉰 시즌을 건너뛰면 점선 */}
                    {segs.map(({ a, b }) => {
                        const [x1, y1] = pt(a), [x2, y2] = pt(b);
                        const gap = b - a > 1;
                        return <line key={b} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gap ? MUTED : colors.brand} strokeWidth={gap ? 2 : 2.5}
                            strokeDasharray={gap ? "3 5" : undefined} strokeLinecap="round" />;
                    })}
                    {present.map((k) => {
                        const [px, py] = pt(k);
                        return <circle key={k} cx={px} cy={py} r={k === best ? 5.5 : 4.5} fill={k === best ? colors.brand : "#fff"} stroke={colors.brand} strokeWidth={2.5} />;
                    })}
                    {[...placed].map(([k, c]) => <Tag key={k} c={c} fill={colors.brand}>{rankLabel(vals[k]!)}</Tag>)}
                </>
            );
        }
    }

    return (
        <div ref={ref} className="w-full min-w-0" data-testid="season-chart">
            <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label} className="block">
                {body}
                {xLabels}
            </svg>
        </div>
    );
}
