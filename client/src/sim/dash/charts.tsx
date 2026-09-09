/**
 * 대시보드 차트 두 개 — 선(에버리지 추이)·막대(하이런·드릴). 의존성 없이 SVG 로 그린다.
 * 규격: 선 2 px, 마커 8 px + 바탕색 테두리 2 px, 막대 두께 ≤ 24 px·위만 4 px 둥글게·2 px 간격, 눈금선은 hairline 실선(surface-line).
 * 값 읽기: 플롯 위 "읽기 줄"이 마지막 점을 보여 주고, 플롯을 문지르거나(터치·마우스) 방향키로 다른 점을 고른다 — 툴팁이 카드 밖으로 넘치지 않는다.
 * 글자는 잉크 토큰만 쓴다(계열 색은 마크에만). 색은 전부 CSS 변수(DOM 에 hex 없음).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { areaPath, columnLayout, columnPath, linePath, nearestIndex, niceTicks, scale, xPositions } from "./chartLayout";

export interface ChartPoint {
    /** x 축 짧은 라벨(날짜·주) */
    readonly label: string;
    readonly value: number;
    /** 읽기 줄에 붙는 설명("12점 / 18이닝") */
    readonly detail?: string;
}

const PAD = { l: 34, r: 12, t: 10, b: 22 } as const;
const BRAND = "rgb(var(--brand))";
const BRAND_WASH = "rgb(var(--brand) / 0.1)";
const GRID = "var(--surface-line)";
const CROSS = "var(--surface-line-strong)";
const SURFACE = "var(--surface-1)";
const INK_1 = "var(--ink-1)";
const INK_3 = "var(--ink-3)";

/** 컨테이너 폭(ResizeObserver). 측정 전·jsdom 에선 fallback. */
function useWidth(fallback: number): [RefObject<HTMLDivElement>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(fallback);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.clientWidth > 0) setW(el.clientWidth);
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const cw = entries[0]?.contentRect.width;
            if (cw && cw > 0) setW(cw);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, w];
}

/** 문지르기·키보드로 고른 인덱스. 마우스가 떠나면 풀리고, 터치는 마지막 위치를 유지한다. */
function useScrub(count: number, indexAt: (localX: number) => number) {
    const [idx, setIdx] = useState<number | null>(null);
    const localX = (e: PointerEvent<SVGRectElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
    const onPointer = (e: PointerEvent<SVGRectElement>) => {
        if (count === 0) return;
        const i = indexAt(localX(e));
        if (i >= 0) setIdx(i);
    };
    const onPointerLeave = (e: PointerEvent<SVGRectElement>) => { if (e.pointerType === "mouse") setIdx(null); };
    const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
        if (count === 0) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const step = e.key === "ArrowLeft" ? -1 : 1;
            // 함수형 갱신: 연타가 한 배치에 묶여도 한 칸씩 움직인다
            setIdx((prev) => Math.max(0, Math.min(count - 1, (prev ?? count - 1) + step)));
        } else if (e.key === "Escape") setIdx(null);
    };
    return { idx, onPointer, onPointerLeave, onKeyDown };
}

function Readout({ point, format, hint }: { point: ChartPoint | undefined; format: (v: number) => string; hint: string }) {
    return (
        <div className="flex items-baseline gap-2 min-h-[28px]" aria-live="polite">
            {point ? (
                <>
                    <span className="rk-num text-[20px] font-bold text-ink-1 leading-none">{format(point.value)}</span>
                    <span className="rk-num text-[12px] font-medium text-ink-3 truncate">{point.label}{point.detail ? ` · ${point.detail}` : ""}</span>
                </>
            ) : (
                <span className="text-[12px] font-medium text-ink-4">{hint}</span>
            )}
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{text}</p>;
}

interface CommonProps {
    readonly points: readonly ChartPoint[];
    readonly format: (v: number) => string;
    readonly ariaLabel: string;
    readonly emptyText: string;
    /** 읽기 줄에 점이 없을 때(비었을 때만) */
    readonly hint?: string;
    readonly height?: number;
    /** 시각적으로 숨긴 표 쌍둥이의 제목 — 보이는 표가 따로 없는 차트에 준다(스크린리더·문지르기 없이도 값에 닿게) */
    readonly tableCaption?: string;
}

function HiddenTable({ caption, points, format }: { caption: string; points: readonly ChartPoint[]; format: (v: number) => string }) {
    return (
        <table className="sr-only">
            <caption>{caption}</caption>
            <tbody>
                {points.map((p, i) => (
                    <tr key={i}><th scope="row">{p.label}</th><td>{format(p.value)}</td>{p.detail ? <td>{p.detail}</td> : null}</tr>
                ))}
            </tbody>
        </table>
    );
}

export interface TrendLineProps extends CommonProps {
    /** y 축 아래 끝(기본 0 — 에버리지는 0 부터) */
    readonly yMin?: number;
}

export function TrendLine({ points, format, ariaLabel, emptyText, hint = "", height = 168, yMin = 0 }: TrendLineProps) {
    const [ref, width] = useWidth(320);
    const n = points.length;
    const plotW = Math.max(40, width - PAD.l - PAD.r);
    const plotH = height - PAD.t - PAD.b;
    const xs = xPositions(n, PAD.l, PAD.l + plotW);
    const scrub = useScrub(n, (lx) => nearestIndex(xs, lx));
    if (n === 0) return <div ref={ref}><Empty text={emptyText} /></div>;

    const values = points.map((p) => p.value);
    const lo = Math.min(yMin, ...values);
    const hi = Math.max(...values);
    const ticks = niceTicks(lo, hi > lo ? hi * 1.05 : lo + 1, 3);
    const y = scale(ticks[0], ticks[ticks.length - 1], PAD.t + plotH, PAD.t);
    const pts = values.map((v, i) => ({ x: xs[i], y: y(v) }));
    const last = n - 1;
    const focus = scrub.idx ?? last;
    const endLabelY = pts[last].y - 8 < PAD.t + 8 ? pts[last].y + 14 : pts[last].y - 8;

    return (
        <div ref={ref} className="w-full">
            <Readout point={points[focus]} format={format} hint={hint} />
            <svg
                role="img" aria-label={ariaLabel} tabIndex={0} width={width} height={height}
                className="block max-w-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg select-none"
                onKeyDown={scrub.onKeyDown}
            >
                {ticks.map((tk) => (
                    <g key={tk}>
                        <line x1={PAD.l} x2={PAD.l + plotW} y1={y(tk)} y2={y(tk)} style={{ stroke: GRID }} strokeWidth={1} shapeRendering="crispEdges" />
                        <text x={PAD.l - 6} y={y(tk) + 3.5} textAnchor="end" fontSize={10} className="rk-num" style={{ fill: INK_3 }}>{format(tk)}</text>
                    </g>
                ))}
                <path d={areaPath(pts, y(ticks[0]))} style={{ fill: BRAND_WASH }} />
                <path d={linePath(pts)} fill="none" style={{ stroke: BRAND }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {scrub.idx !== null && (
                    <line x1={pts[scrub.idx].x} x2={pts[scrub.idx].x} y1={PAD.t} y2={PAD.t + plotH} style={{ stroke: CROSS }} strokeWidth={1} shapeRendering="crispEdges" />
                )}
                {[last, ...(scrub.idx !== null && scrub.idx !== last ? [scrub.idx] : [])].map((i) => (
                    <circle key={i} cx={pts[i].x} cy={pts[i].y} r={4} style={{ fill: BRAND, stroke: SURFACE }} strokeWidth={2} />
                ))}
                <text
                    x={n === 1 ? pts[last].x : pts[last].x - 6} y={endLabelY} textAnchor={n === 1 ? "middle" : "end"}
                    fontSize={11} fontWeight={600} className="rk-num" style={{ fill: INK_1 }}
                >
                    {format(values[last])}
                </text>
                <text x={PAD.l} y={height - 6} textAnchor={n === 1 ? "middle" : "start"} fontSize={10} style={{ fill: INK_3 }}>{n === 1 ? "" : points[0].label}</text>
                <text x={n === 1 ? xs[0] : PAD.l + plotW} y={height - 6} textAnchor={n === 1 ? "middle" : "end"} fontSize={10} style={{ fill: INK_3 }}>{points[last].label}</text>
                <rect
                    x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="transparent" style={{ touchAction: "pan-y", cursor: "crosshair" }}
                    onPointerMove={scrub.onPointer} onPointerDown={scrub.onPointer} onPointerLeave={scrub.onPointerLeave}
                />
            </svg>
        </div>
    );
}

export interface ColumnsProps extends CommonProps {
    /** 눈금을 직접 줄 때(드릴: [0, 5]). 없으면 0..최댓값의 깔끔한 눈금 */
    readonly ticks?: readonly number[];
    /** x 라벨을 몇 개마다(기본: 8개 이하면 전부, 그 이상이면 처음·끝) */
    readonly labelEvery?: number;
}

export function Columns({ points, format, ariaLabel, emptyText, hint = "", height = 150, ticks: fixedTicks, labelEvery, tableCaption }: ColumnsProps) {
    const [ref, width] = useWidth(320);
    const n = points.length;
    const plotW = Math.max(40, width - PAD.l - PAD.r);
    const plotH = height - PAD.t - PAD.b;
    const layout = columnLayout(n, plotW, 2, 24);
    const scrub = useScrub(n, (lx) => Math.max(0, Math.min(n - 1, Math.floor((lx - PAD.l) / layout.band))));
    if (n === 0) return <div ref={ref}><Empty text={emptyText} /></div>;

    const values = points.map((p) => p.value);
    const maxV = Math.max(0, ...values);
    const ticks = fixedTicks && fixedTicks.length >= 2 ? [...fixedTicks] : niceTicks(0, Math.max(maxV, 1), 3);
    const y = scale(ticks[0], ticks[ticks.length - 1], PAD.t + plotH, PAD.t);
    const base = y(ticks[0]);
    const last = n - 1;
    const focus = scrub.idx ?? last;
    const maxI = values.indexOf(maxV);
    const every = labelEvery ?? (n <= 8 ? 1 : 0);
    const showLabel = (i: number) => (every > 0 ? i % every === 0 : i === 0 || i === last);
    const cx = (i: number) => PAD.l + layout.x(i) + layout.w / 2;

    return (
        <div ref={ref} className="w-full">
            <Readout point={points[focus]} format={format} hint={hint} />
            <svg
                role="img" aria-label={ariaLabel} tabIndex={0} width={width} height={height}
                className="block max-w-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg select-none"
                onKeyDown={scrub.onKeyDown}
            >
                {ticks.map((tk) => (
                    <g key={tk}>
                        <line x1={PAD.l} x2={PAD.l + plotW} y1={y(tk)} y2={y(tk)} style={{ stroke: GRID }} strokeWidth={1} shapeRendering="crispEdges" />
                        <text x={PAD.l - 6} y={y(tk) + 3.5} textAnchor="end" fontSize={10} className="rk-num" style={{ fill: INK_3 }}>{format(tk)}</text>
                    </g>
                ))}
                {values.map((v, i) => {
                    const d = columnPath(PAD.l + layout.x(i), y(v), base, layout.w);
                    return d ? <path key={i} d={d} style={{ fill: BRAND }} fillOpacity={scrub.idx === i ? 0.7 : 1} /> : null;
                })}
                {maxV > 0 && y(maxV) - 6 > PAD.t + 6 && (
                    <text x={cx(maxI)} y={y(maxV) - 6} textAnchor="middle" fontSize={11} fontWeight={600} className="rk-num" style={{ fill: INK_1 }}>{format(maxV)}</text>
                )}
                {points.map((p, i) => showLabel(i) ? (
                    <text
                        key={i} x={every > 0 ? cx(i) : i === 0 ? PAD.l : PAD.l + plotW} y={height - 6}
                        textAnchor={every > 0 ? "middle" : i === 0 ? "start" : "end"} fontSize={10} style={{ fill: INK_3 }}
                    >
                        {p.label}
                    </text>
                ) : null)}
                <rect
                    x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="transparent" style={{ touchAction: "pan-y", cursor: "crosshair" }}
                    onPointerMove={scrub.onPointer} onPointerDown={scrub.onPointer} onPointerLeave={scrub.onPointerLeave}
                />
            </svg>
            {tableCaption && <HiddenTable caption={tableCaption} points={points} format={format} />}
        </div>
    );
}

/** 최근 경기 흐름: 승·패 글자 칩(색만으로 말하지 않는다). */
export function FormStrip({ results, winText, lossText, label }: { results: readonly ("W" | "L")[]; winText: string; lossText: string; label: string }) {
    if (results.length === 0) return null;
    // 한 줄 막대 — 동그라미 열 개는 좁은 화면에서 두 줄로 접혀 흐름이 끊겨 보였다(2026-09-09).
    // 최근 경기가 오른쪽 끝(results 는 최근 순이라 뒤집어 그린다).
    const ordered = [...results].reverse();
    return (
        <ol className="flex items-end gap-1" aria-label={label}>
            {ordered.map((r, i) => (
                <li
                    key={i}
                    title={r === "W" ? winText : lossText}
                    className={cn(
                        // 높이는 같게, 색으로만 가른다 — 높이를 다르게 했더니 진 경기가 사라진 것처럼 보였다(실측)
                        "flex-1 h-2.5 rounded-pill",
                        r === "W" ? "bg-brand" : "bg-ink-4",
                    )}
                >
                    <span className="sr-only">{r === "W" ? winText : lossText}</span>
                </li>
            ))}
        </ol>
    );
}
