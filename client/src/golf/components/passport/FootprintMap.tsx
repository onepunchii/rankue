/**
 * 도장깨기 발자국 지도(2026-09-30 오너: "내가 어디 구장 순서로 갔는지 귀엽게 나오게").
 *
 * 골프장 점 지도(CourseDotMap — 윤곽선 없이 골프장 좌표로만 그린 한반도) **안에** 겹쳐 그린다. 같은 <svg>, 같은
 * viewBox 라서 점과 발자국이 어긋날 수가 없다(투영은 shared/golfDotMap 하나). 연도를 바꾸면 지도가 새 틀로
 * 미끄러져 들어가고 발자국도 한 몸으로 따라간다.
 *
 *  - 처음 간 순서대로 살짝 휜 점선 길 → 좌우 번갈아 걷는 발자국(오래된 건 라임, 최근일수록 주황) → 번호 배지.
 *  - 열면 길이 그려지며 발자국이 하나씩 찍힌다. 동작 줄이기(prefers-reduced-motion)면 끝난 그림을 바로 보여 준다.
 *  - 배지를 누르면 이름 · 첫 방문 · 횟수 말풍선. 가장 최근 곳은 주황 + 잔잔한 파동.
 *  - 크기는 **화면 px 기준**(지도 폭을 재서 지도 좌표로 바꾼다) — 태블릿에서 발자국이 커지지 않고 더 촘촘해진다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { kstDateLabel } from "@/lib/kst";
import { coursePath } from "@shared/golfCourse";
import {
    buildTrail, fitFootprintBox, labelsClear, placeFootprints, placedStops, spreadBadges, mixHex, FOOT, FOOT_COLORS, type FootprintStop,
} from "@shared/golfFootprints";
import { CourseDotMap, type MapDot } from "../course/list/CourseDotMap";

/** 지도 칸 비율(너비/높이) — 바깥 틀(aspect-[0.82])과 같아야 말풍선 자리가 맞는다 */
export const FOOTPRINT_MAP_ASPECT = 0.82;
/** 번호 배지 반지름(화면 px) */
const R = 12;

// 애니메이션은 CSS 로 — 발자국 수백 개를 JS 로 돌리면 저가 폰에서 끊긴다. 지연(animation-delay)만 발자국마다 다르다.
const CSS = `
@keyframes fp-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes fp-pop { 0% { opacity: 0; transform: scale(.35); } 65% { opacity: 1; transform: scale(1.18); } 100% { opacity: 1; transform: scale(1); } }
@keyframes fp-pulse { 0% { opacity: .6; transform: scale(1); } 100% { opacity: 0; transform: scale(2.3); } }
.fp-reveal { stroke-dasharray: 1 1; stroke-dashoffset: 1; animation: fp-draw var(--fp-dur) linear forwards; }
.fp-pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: fp-pop .42s cubic-bezier(.3,1.35,.5,1) forwards; }
.fp-pulse { opacity: 0; transform-box: fill-box; transform-origin: center; animation: fp-pulse 2.2s ease-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .fp-reveal { animation: none; stroke-dashoffset: 0; }
  .fp-pop { animation: none; opacity: 1; }
  .fp-pulse { animation: none; display: none; }
}`;

const dateLabel = (iso: string) => kstDateLabel(iso, { year: "numeric", month: "long", day: "numeric" });

export function FootprintMap({ stops, dots, playKey, selected, onSelect }: {
    /** 처음 간 순서 */
    stops: FootprintStop[];
    /** 바탕 점(전국 골프장 좌표) */
    dots: MapDot[];
    /** 바뀌면 발자국이 처음부터 다시 걷는다(연도 바꾸기) */
    playKey: string;
    /** 고른 도장 번호(1부터) */
    selected: number | null;
    onSelect: (n: number | null) => void;
}) {
    const [, setLocation] = useLocation();
    const wrapRef = useRef<HTMLDivElement>(null);
    const maskId = `fp-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // 지도 폭(px) — 발자국 크기를 화면 기준으로 잡으려고 잰다. 8px 안쪽 변화는 무시(다시 계산할 만큼이 아니다).
    const [w, setW] = useState(340);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const set = () => { const cw = el.clientWidth; if (cw > 0) setW((p) => (Math.abs(p - cw) > 8 ? cw : p)); };
        set();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(set);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const placed = useMemo(() => placedStops(stops), [stops]);
    const box = useMemo(() => fitFootprintBox(placed, FOOTPRINT_MAP_ASPECT), [placed]);
    const u = box[2] / Math.max(200, w); // 화면 1px = 지도 u
    const geo = useMemo(() => {
        const pts = placed.map((s) => ({ x: s.x, y: s.y }));
        const trail = buildTrail(pts);
        // 붙어 있는 골프장(용인·이천)은 배지를 떼어 놓고 원래 자리까지 선을 긋는다
        const spread = spreadBadges(pts, (2 * R + 4) * u);
        const marks = placeFootprints(trail, pts, 15 * u, 3.4 * u, (R + 5) * u);
        return {
            trail,
            marks,
            spread,
            // 이름 글자(11.5px 두 자 ≈ 24×12px)에 발자국 한 짝 크기(≈12px)만큼 여유 — 가운데만 재면 발끝이 글자를 덮는다.
            // 길(점선) 자체도 피한다. 표본을 건너뛰면 태블릿의 긴 구간에서 표본 사이로 길이 글자를 지나갔다 — 전부 본다.
            labels: labelsClear(box, spread, (R + 16) * u, [...marks, ...trail.samples], 26 * u, 18 * u),
        };
    }, [placed, u, box]);
    const lastN = stops.length;
    // 점 격자 칸 수도 화면 폭에 맞춘다 — 36칸 고정이면 태블릿에서 점이 발자국보다 굵어졌다(폰 340px ≈ 36칸 = 점 지름 약 5.6px)
    const cols = Math.round(Math.min(64, Math.max(30, w / 9.5)));
    // 길이 그려지는 시간 — 도장이 많을수록 조금 길게, 3.4초를 넘기지 않는다
    const dur = Math.min(3.4, 1 + 0.5 * Math.max(0, placed.length - 1));
    const s = u * 0.95;
    const toes = FOOT.toes.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />);

    const sel = selected != null ? placed.findIndex((p) => p.n === selected) : -1;
    const key = (n: number) => (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === n ? null : n); }
    };

    return (
        <div ref={wrapRef} className="absolute inset-0" onClick={() => onSelect(null)}>
            <style>{CSS}</style>
            <CourseDotMap dots={dots} focus={null} box={box} aspect={FOOTPRINT_MAP_ASPECT} cols={cols} bg="#0F0F0F" muted className="absolute inset-0 w-full h-full">
                <g key={playKey} style={{ "--fp-dur": `${dur}s` } as CSSProperties}>
                    {/* 흐린 지역 이름 — 절반쯤 당겨 들어간 지도에서 "여기가 어디쯤"을 알려 준다 */}
                    {geo.labels.map((l) => (
                        <text key={l.name} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={11.5 * u} fontWeight={600} fill="#FFFFFF" fillOpacity={0.3} aria-hidden="true">
                            {l.name}
                        </text>
                    ))}
                    {geo.trail.d && (
                        <>
                            <defs>
                                <mask id={maskId} maskUnits="userSpaceOnUse" x={box[0] - box[2]} y={box[1] - box[3]} width={box[2] * 3} height={box[3] * 3}>
                                    <path d={geo.trail.d} fill="none" stroke="#FFFFFF" strokeWidth={12 * u} strokeLinecap="round" pathLength={1} className="fp-reveal" />
                                </mask>
                            </defs>
                            <path d={geo.trail.d} mask={`url(#${maskId})`} fill="none" stroke="#FFFFFF" strokeOpacity={0.32} strokeWidth={1.7 * u} strokeLinecap="round" strokeDasharray={`${0.1 * u} ${5.2 * u}`} />
                        </>
                    )}
                    {geo.marks.map((m, i) => (
                        <g key={i} transform={`translate(${m.x} ${m.y}) rotate(${m.angle + 90}) scale(${m.side * s} ${s})`}>
                            <g className="fp-pop" style={{ animationDelay: `${(m.t * dur).toFixed(3)}s` }} fill={mixHex(FOOT_COLORS.old, FOOT_COLORS.recent, m.t)}>
                                <path d={FOOT.sole} />
                                {toes}
                            </g>
                        </g>
                    ))}
                    {/* 떼어 놓은 배지 → 원래 자리 */}
                    {placed.map((st, i) => {
                        const b = geo.spread[i];
                        if (Math.hypot(b.x - st.x, b.y - st.y) < R * u * 0.3) return null;
                        return (
                            <g key={`l${st.n}`} className="fp-pop" style={{ animationDelay: `${(geo.trail.stopAt[i] * dur).toFixed(3)}s` }}>
                                <line x1={st.x} y1={st.y} x2={b.x} y2={b.y} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.2 * u} />
                                <circle cx={st.x} cy={st.y} r={2.2 * u} fill="#FFFFFF" fillOpacity={0.85} />
                            </g>
                        );
                    })}
                    {placed.map((st, i) => {
                        const b = geo.spread[i];
                        const latest = st.n === lastN;
                        const on = selected === st.n;
                        const c = latest ? FOOT_COLORS.latest : FOOT_COLORS.stop;
                        return (
                            <g
                                key={st.n}
                                role="button"
                                tabIndex={0}
                                aria-label={`${st.n}번째 발자국 ${st.name}, 첫 방문 ${dateLabel(st.firstVisitedAt)}, ${st.visits}회`}
                                aria-pressed={on}
                                onClick={(e) => { e.stopPropagation(); onSelect(on ? null : st.n); }}
                                onKeyDown={key(st.n)}
                                className="cursor-pointer outline-none"
                            >
                                {/* 손가락 크기 누르는 자리(보이지 않음) */}
                                <circle cx={b.x} cy={b.y} r={22 * u} fill="transparent" />
                                {latest && <circle className="fp-pulse" cx={b.x} cy={b.y} r={R * u} fill="none" stroke={c} strokeWidth={2 * u} style={{ animationDelay: `${dur.toFixed(2)}s` }} />}
                                <g className="fp-pop" style={{ animationDelay: `${(geo.trail.stopAt[i] * dur).toFixed(3)}s` }}>
                                    <circle cx={b.x} cy={b.y} r={R * u * (latest ? 1.6 : 1.42)} fill={c} fillOpacity={latest ? 0.24 : 0.16} />
                                    {on && <circle cx={b.x} cy={b.y} r={(R + 3.4) * u} fill="none" stroke="#FFFFFF" strokeWidth={2 * u} />}
                                    <circle cx={b.x} cy={b.y} r={R * u} fill={c} stroke="#0F0F0F" strokeWidth={2 * u} />
                                    <text
                                        x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                                        fontSize={(st.n >= 10 ? 10 : 12.5) * u} fontWeight={800}
                                        fill={latest ? "#FFFFFF" : FOOT_COLORS.stopInk}
                                        style={{ fontVariantNumeric: "tabular-nums" }}
                                    >
                                        {st.n}
                                    </text>
                                </g>
                            </g>
                        );
                    })}
                </g>
            </CourseDotMap>

            {sel >= 0 && (() => {
                const st = placed[sel];
                const b = geo.spread[sel];
                const lx = ((b.x - box[0]) / box[2]) * 100;
                const ty = ((b.y - box[1]) / box[3]) * 100;
                const tx = lx < 28 ? "-14%" : lx > 72 ? "-86%" : "-50%";
                const above = ty > 34;
                const latest = st.n === lastN;
                return (
                    <div
                        className="absolute z-10 w-max max-w-[230px]"
                        style={{ left: `${lx}%`, top: `${ty}%`, transform: `translate(${tx}, ${above ? `calc(-100% - ${R + 12}px)` : `${R + 12}px`})` }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="rounded-2xl bg-[#FFFFFF] px-3.5 py-2.5 shadow-xl shadow-[#00000066]">
                            <p className={latest ? "text-[11.5px] font-semibold text-[#E85200]" : "text-[11.5px] font-semibold text-[#3F8F0F]"}>
                                {st.n}번째 발자국{latest ? " · 최근" : ""}
                            </p>
                            <p className="mt-0.5 text-[15px] font-bold leading-snug text-[#0A0A0A] truncate">{st.name}</p>
                            <p className="mt-0.5 text-[12.5px] text-[#0A0A0A99] tabular-nums whitespace-nowrap">
                                첫 방문 {dateLabel(st.firstVisitedAt)} · {st.visits}회
                            </p>
                            {st.slug && (
                                <button
                                    type="button"
                                    onClick={() => setLocation(coursePath(st.slug!))}
                                    className="mt-1.5 -mb-0.5 inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[#0A0A0A] active:opacity-60"
                                >
                                    골프장 보기 <LucideChevronRight weight="bold" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
