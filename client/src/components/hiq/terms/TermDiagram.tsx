/**
 * 당구 용어 그림(2026-10-19) — 위에서 내려다본 캐롬 당구대(나무 레일 · 다이아몬드 긴 쪽 일곱 · 짧은 쪽 셋 · 펠트) 위에
 * 본문 예시의 길을 그린다. 자료는 shared/billiardsTermDiagrams(예시 글을 옮긴 개념도 — 새 사실을 더하지 않는다).
 *  · 수구의 길 = 상아색 굵은 점선 + 쿠션에 닿은 차례 번호(금색 동그라미) · 적구의 길 = 가는 점선
 *  · 키스는 부딪힌 자리에서 수구 길을 끊고 그 뒤를 옅게
 *  · 글자는 화면 픽셀로 그린다(SVG 를 키우고 줄이지 않는다) — 폭을 재서 그 폭의 좌표로 그려 글자가 늘 12px 이상
 */
import { useEffect, useRef, useState } from "react";
import { BALL_R, cushionMarks, inset, type DiagramBall, type TableDiagram, type TermDiagram as Diagram } from "@shared/billiardsTermDiagrams";

const FELT_A = "#18875A", FELT_B = "#0A5134";
const RAIL = ["#7A4E2B", "#3E2614"] as const;
const IVORY = "#F6F1E3";
const BALL: Record<DiagramBall, { fill: string; edge: string }> = {
    white: { fill: IVORY, edge: "#9C9480" },
    yellow: { fill: "#F4C542", edge: "#7A5A08" },
    red: { fill: "#D8352A", edge: "#6E120B" },
    red2: { fill: "#D8352A", edge: "#6E120B" },
};

function useWidth(fallback = 320) {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(fallback);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => { if (e?.contentRect.width) setW(Math.round(e.contentRect.width)); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, w] as const;
}

function TableFigure({ d }: { d: TableDiagram }) {
    const [ref, w] = useWidth();
    const rail = Math.max(12, Math.round(w * 0.045));
    const fw = w - rail * 2, fh = fw / 2, H = fh + rail * 2;
    const X = (x: number) => rail + (x / 2) * fw, Y = (y: number) => rail + y * fh;
    const P = (p: readonly [number, number]) => { const [x, y] = inset(p); return `${X(x).toFixed(1)},${Y(y).toFixed(1)}`; };
    const r = BALL_R * fh;
    const diamonds = [
        ...[1, 2, 3, 4, 5, 6, 7].flatMap((k) => [[X(k * 0.25), rail / 2], [X(k * 0.25), H - rail / 2]]),
        ...[0.25, 0.5, 0.75].flatMap((k) => [[rail / 2, Y(k)], [w - rail / 2, Y(k)]]),
    ];
    // 화살표 — 수구 길 마디마다 가운데에 작은 갈매기표
    const chevrons = d.paths.filter((p) => p.by === "cue").flatMap((p) => p.points.slice(1).map((b, i) => {
        if (p.cutAt != null && i >= p.cutAt) return null;
        const [ax, ay] = inset(p.points[i]), [bx, by] = inset(b);
        const mx = X((ax + bx) / 2), my = Y((ay + by) / 2);
        const ang = (Math.atan2(Y(by) - Y(ay), X(bx) - X(ax)) * 180) / Math.PI;
        return { mx, my, ang, key: `${i}` };
    }).filter(Boolean)) as { mx: number; my: number; ang: number; key: string }[];
    return (
        <div ref={ref} className="w-full" data-testid="term-diagram-table">
            <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={d.caption} className="block">
                <defs>
                    <linearGradient id="td-rail" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={RAIL[0]} /><stop offset="100%" stopColor={RAIL[1]} /></linearGradient>
                    <radialGradient id="td-felt" cx="50%" cy="38%" r="75%"><stop offset="0%" stopColor={FELT_A} /><stop offset="100%" stopColor={FELT_B} /></radialGradient>
                </defs>
                <rect x={0} y={0} width={w} height={H} rx={rail * 0.9} fill="url(#td-rail)" />
                <rect x={rail} y={rail} width={fw} height={fh} rx={4} fill="url(#td-felt)" />
                {diamonds.map(([x, y], i) => <rect key={i} x={x - 2.5} y={y - 2.5} width={5} height={5} transform={`rotate(45 ${x} ${y})`} fill={IVORY} opacity={0.85} />)}
                {/* 적구의 길 */}
                {d.paths.filter((p) => p.by === "object").map((p, i) => (
                    <polyline key={`o${i}`} points={p.points.map(P).join(" ")} fill="none" stroke="#F4A79F" strokeWidth={1.6} strokeDasharray="2 4" strokeLinecap="round" />
                ))}
                {/* 수구의 길 — 끊긴 뒤는 옅게 */}
                {d.paths.filter((p) => p.by === "cue").map((p, i) => {
                    const cut = p.cutAt ?? p.points.length - 1;
                    return (
                        <g key={`c${i}`}>
                            <polyline points={p.points.slice(0, cut + 1).map(P).join(" ")} fill="none" stroke={IVORY} strokeWidth={2.4} strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
                            {cut < p.points.length - 1 && (
                                <polyline points={p.points.slice(cut).map(P).join(" ")} fill="none" stroke={IVORY} strokeOpacity={0.28} strokeWidth={2} strokeDasharray="3 6" strokeLinecap="round" />
                            )}
                        </g>
                    );
                })}
                {chevrons.map((c) => (
                    <path key={c.key} d="M-4,-4 L1,0 L-4,4" transform={`translate(${c.mx.toFixed(1)} ${c.my.toFixed(1)}) rotate(${c.ang.toFixed(1)})`} fill="none" stroke={IVORY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {/* 공 */}
                {d.balls.map((b) => {
                    const c = BALL[b.id];
                    return (
                        <g key={b.id}>
                            <circle cx={X(b.x) + r * 0.25} cy={Y(b.y) + r * 0.35} r={r} fill="#00000040" />
                            <circle cx={X(b.x)} cy={Y(b.y)} r={r} fill={c.fill} stroke={c.edge} strokeWidth={1} />
                            <circle cx={X(b.x) - r * 0.32} cy={Y(b.y) - r * 0.35} r={r * 0.3} fill="#FFFFFF" opacity={0.55} />
                        </g>
                    );
                })}
                {/* 쿠션 차례 번호 */}
                {d.paths.filter((p) => p.by === "cue").flatMap((p) => cushionMarks(p)).map((m) => (
                    <g key={`n${m.n}-${m.at[0]}`}>
                        <circle cx={X(m.at[0])} cy={Y(m.at[1])} r={9} fill="#F6D9A8" stroke="#5A381E" strokeWidth={1.2} />
                        <text x={X(m.at[0])} y={Y(m.at[1])} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={700} fill="#3E2614">{m.n}</text>
                    </g>
                ))}
                {/* 표시 — 점 위쪽에 판으로(판 밖으로 나가면 안쪽으로) */}
                {d.marks?.map((m) => {
                    const tw = [...m.text].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? 12.5 : 7), 0) + 14;
                    const cx = Math.min(Math.max(X(m.x), rail + tw / 2 + 2), w - rail - tw / 2 - 2);
                    const cy = m.below ? Math.min(Y(m.y) + r + 16, H - rail - 11) : Math.max(Y(m.y) - r - 15, rail + 11);
                    return (
                        <g key={m.text}>
                            <rect x={cx - tw / 2} y={cy - 10.5} width={tw} height={21} rx={10.5} fill={m.tone === "warn" ? "#7A1610E6" : "#062B1CE6"} />
                            <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={600} fill={IVORY}>{m.text}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

/** 당점 — 수구를 정면에서 본 모습. 1팁 · 2팁 고리(팁 폭 ≈ 반지름의 0.39 — 팁 12mm · 공 61.5mm) */
function TipFigure({ caption }: { caption: string }) {
    const S = 172, c = S / 2, R = 74, tip = R * 0.39;
    const dot = (x: number, y: number, fill: string) => <circle cx={c + x} cy={c + y} r={7} fill={fill} stroke="#3E2614" strokeWidth={1.2} />;
    // 고리 이름은 점이 없는 오른쪽 위(−40°) 고리 선 위에, 가운데 맞춤 — 공 밖으로 나가지 않게
    const ring = (k: number) => { const a = (-40 * Math.PI) / 180; return { x: c + Math.cos(a) * tip * k, y: c + Math.sin(a) * tip * k - 4 }; };
    const items = [
        { color: "#3D6FB5", head: "위", body: "밀어치기(앞 회전)" },
        { color: "#D8352A", head: "아래", body: "끌어치기(역회전)" },
        { color: "#F4C542", head: "좌우", body: "옆 회전 — 쿠션에서 꺾이는 각" },
        { color: "#5A381E", head: "중앙", body: "회전 없이" },
    ];
    return (
        <div className="rounded-2xl bg-[#0A5134] px-4 pb-4 pt-3" data-testid="term-diagram-tip">
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={caption} className="mx-auto block">
                <defs><radialGradient id="td-cue" cx="38%" cy="32%" r="75%"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="70%" stopColor={IVORY} /><stop offset="100%" stopColor="#CFC6B0" /></radialGradient></defs>
                <circle cx={c + 3} cy={c + 4} r={R} fill="#00000040" />
                <circle cx={c} cy={c} r={R} fill="url(#td-cue)" stroke="#9C9480" strokeWidth={1.2} />
                <circle cx={c} cy={c} r={tip} fill="none" stroke="#5A381E" strokeOpacity={0.5} strokeDasharray="3 4" />
                <circle cx={c} cy={c} r={tip * 2} fill="none" stroke="#5A381E" strokeOpacity={0.5} strokeDasharray="3 4" />
                <path d={`M${c - R} ${c} H${c + R} M${c} ${c - R} V${c + R}`} stroke="#5A381E" strokeOpacity={0.18} />
                <text x={ring(1).x} y={ring(1).y} textAnchor="middle" fontSize={12} fontWeight={600} fill="#5A381E" stroke={IVORY} strokeWidth={3} paintOrder="stroke">1팁</text>
                <text x={ring(2).x} y={ring(2).y} textAnchor="middle" fontSize={12} fontWeight={600} fill="#5A381E" stroke={IVORY} strokeWidth={3} paintOrder="stroke">2팁</text>
                {dot(0, -tip * 1.4, "#3D6FB5")}
                {dot(0, tip * 1.4, "#D8352A")}
                {dot(-tip * 2, 0, "#F4C542")}
                {dot(tip * 2, 0, "#F4C542")}
                {dot(0, 0, "#5A381E")}
            </svg>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] leading-snug text-[#F6F1E3E6] break-keep">
                {items.map((it) => (
                    <li key={it.head} className="flex items-start gap-2">
                        <span className="mt-[3px] h-3 w-3 shrink-0 rounded-full ring-1 ring-[#00000040]" style={{ background: it.color }} aria-hidden />
                        <span><b className="font-semibold text-[#F6F1E3]">{it.head}</b> {it.body}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 두께 — 겨냥한 수구(점선 원)와 적구의 겹침. 정면 · 반 · 얇게 */
function ThicknessFigure({ caption }: { caption: string }) {
    const cases = [{ label: "두껍게(정면)", off: 0 }, { label: "반(1/2)", off: 1 }, { label: "얇게", off: 1.7 }];
    const r = 20;
    return (
        <div className="grid grid-cols-3 gap-2" role="img" aria-label={caption} data-testid="term-diagram-thickness">
            {cases.map((k) => (
                <div key={k.label} className="flex flex-col items-center rounded-xl bg-[#0A5134] py-3">
                    <svg width={96} height={64} viewBox="0 0 96 64" aria-hidden>
                        {/* 치는 사람 자리에서 본 모습 — 적구(빨간 공) 위에 겨냥한 수구의 윤곽(점선)이 off×r 만큼 비켜 겹친다 */}
                        <circle cx={62} cy={32} r={r} fill="#D8352A" stroke="#6E120B" />
                        <circle cx={62 - k.off * r} cy={32} r={r} fill="#F6F1E31F" stroke={IVORY} strokeWidth={1.8} strokeDasharray="4 3" />
                        <path d={`M${62 - k.off * r} 6 V58`} stroke={IVORY} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="2 3" />
                    </svg>
                    <span className="mt-1 text-[12px] font-semibold text-[#F6F1E3]">{k.label}</span>
                </div>
            ))}
        </div>
    );
}

export function TermDiagram({ d }: { d: Diagram }) {
    return (
        <figure className="mt-4" data-testid="term-diagram">
            {d.kind === "table" ? <TableFigure d={d} /> : d.kind === "tip" ? <TipFigure caption={d.caption} /> : <ThicknessFigure caption={d.caption} />}
            <figcaption className="mt-2 text-[12.5px] leading-relaxed text-ink-3 break-keep">
                {d.caption}{d.kind === "table" && <span className="text-ink-4"> · 길을 보여 주는 개념도예요(회전 · 힘에 따른 휨은 빼고 그렸어요)</span>}
            </figcaption>
        </figure>
    );
}
