/**
 * 잉크 도장 — 골프장 한 곳(2026-10-12 오너 "추천대로": 도장첩 · 볼마커 기획의 '도장').
 *
 * 그림 파일이 아니라 SVG 로 그린다 — 쉰여섯 곳의 이름이 다 달라야 해서다. 권마다 잉크 색과 가운데 무늬가 다르고(bookArt),
 * 이름은 위쪽 고리를 따라, 찍은 날은 아래쪽 고리를 따라 놓인다. 가장자리를 조금 흩뜨리고 군데군데 옅게 해서 찍힌 느낌을 낸다.
 *
 * **늘 종이 위에 둔다**(StampPaper) — 잉크 색이 종이 색에 맞춰져 있다. 어두운 바탕에 바로 올리면 묻힌다.
 *
 * 상태:
 *   on     인증 도장(현장 인증 + 이 규칙 전 옛 기록)
 *   faded  미인증 기록만 있는 골프장 — 흐리게. 칸은 차지 않는다(shared/golfStampBooks bookStates 의 record)
 *   empty  빈 칸 — 점선 원과 흐린 무늬
 *
 * 깊이(depth — shared/golfStampDepth): 다시 갈수록 도장이 진해진다. 인증 도장에만 그린다.
 *   코스 조각  바깥 고리가 코스 수만큼 나뉘고, 돈 코스만큼 채워진다(코스가 셋 이상인 골프장)
 *   금테      바깥 고리가 금색 한 줄로
 *   사철      고리 위의 네 점(봄 · 여름 · 가을 · 겨울) — 다녀온 철이 금색으로 찬다. 두 철부터 보인다
 */
import { useId } from "react";
import type { GolfSeason } from "@shared/golfStampDepth";
import { GLYPH_PATHS, type StampGlyph } from "./bookArt";

export type InkStampState = "on" | "faded" | "empty";

/** 이름 길이에 따른 글자 크기(120 눈금) — 고리 안에 들어가게. 열 자까지 온다(shared 시험이 막는다) */
export function stampNameSize(name: string): number {
    const len = [...name].length;
    return len <= 4 ? 14.5 : len <= 6 ? 12.5 : len <= 8 ? 10.8 : 9.4;
}

/** 글자에서 뽑은 작은 수 — 도장마다 번짐 무늬가 다르되, 다시 그려도 같은 도장은 같은 무늬가 되게 */
export function stampSeed(text: string): number {
    let h = 7;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) % 9973;
    return h % 89;
}

const EMPTY_INK = "#463A2470";
/** 금테 · 사철 점의 색 — 종이(상아색) 위에서 읽히는 짙은 금 */
export const STAMP_GOLD = "#B07D12";
const RING_R = 57.5;
/** 바깥 고리의 한 조각 — 12시에서 시계 방향, 조각 사이에 틈 */
export function ringArc(i: number, total: number, r = RING_R, gapDeg = 7): string {
    const step = (Math.PI * 2) / total, gap = (gapDeg * Math.PI) / 180;
    const a0 = -Math.PI / 2 + i * step + gap / 2, a1 = -Math.PI / 2 + (i + 1) * step - gap / 2;
    const at = (a: number) => `${(60 + r * Math.cos(a)).toFixed(2)},${(60 + r * Math.sin(a)).toFixed(2)}`;
    return `M ${at(a0)} A ${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1)}`;
}
/** 사철 점의 자리 — 봄(왼쪽 위) · 여름(오른쪽 위) · 가을(오른쪽 아래) · 겨울(왼쪽 아래) */
const SEASON_DOTS: readonly [GolfSeason, number][] = [["spring", -135], ["summer", -45], ["autumn", 45], ["winter", 135]];

export interface StampDepthLook {
    nines?: { got: number; total: number } | null;
    gold?: boolean;
    seasons?: readonly GolfSeason[];
}
/** 도장의 접근성 이름에 붙는 깊이 — " · 금테 · 사철 3/4" */
export function depthLabel(d?: StampDepthLook | null): string {
    if (!d) return "";
    const parts: string[] = [];
    if (d.gold) parts.push("금테"); else if (d.nines) parts.push(`코스 ${d.nines.got}/${d.nines.total}`);
    if ((d.seasons?.length ?? 0) >= 2) parts.push(`사철 ${d.seasons!.length}/4`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
}

export function InkStamp({ name, date, ink, glyph, size, state = "on", tilt = 0, className, depth }: {
    /** 도장에 찍히는 이름(칸의 이름) */
    name: string;
    /** 찍은 날 "2026.10.03" — 없으면 아래 고리를 비운다 */
    date?: string | null;
    /** 잉크 색(권의 색) */
    ink: string;
    glyph: StampGlyph;
    /** 한 변(px). 비우면 놓인 칸의 너비에 맞춘다 */
    size?: number;
    state?: InkStampState;
    /** 기울기(도) — 손으로 찍은 것처럼 조금씩 */
    tilt?: number;
    className?: string;
    /** 도장의 깊이 — 인증 도장(on)에만 그린다 */
    depth?: StampDepthLook | null;
}) {
    // useId 는 ":r1:" 꼴이라 url(#…) 안에서 쓰기 좋게 쌍점을 뺀다
    const id = `ink${useId().replace(/:/g, "")}`;
    const empty = state === "empty";
    const seed = stampSeed(name);
    const deep = state === "on" ? depth ?? null : null;
    const seasons = deep?.seasons ?? [];
    return (
        <svg
            viewBox="0 0 120 120" width={size ?? "100%"} height={size ?? "100%"} className={className} role="img"
            aria-label={empty ? `${name} — 아직 없음` : state === "faded" ? `${name} — 미인증 기록` : `${name} 도장${date ? ` ${date}` : ""}${depthLabel(deep)}`}
            data-stamp={state} data-gold={deep?.gold ? "1" : undefined} data-seasons={seasons.length >= 2 ? seasons.length : undefined}
            style={{ display: "block", aspectRatio: "1 / 1", color: empty ? EMPTY_INK : ink, transform: tilt ? `rotate(${tilt}deg)` : undefined, opacity: state === "faded" ? 0.34 : 1 }}
        >
            <defs>
                <path id={`${id}t`} d="M 23,60 A 37,37 0 0 1 97,60" />
                <path id={`${id}b`} d="M 16.5,60 A 43.5,43.5 0 0 0 103.5,60" />
                {!empty && (
                    <>
                        <filter id={`${id}i`} x="-5%" y="-5%" width="110%" height="110%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} result="n" />
                            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.15" />
                        </filter>
                        <filter id={`${id}w`}>
                            <feTurbulence type="fractalNoise" baseFrequency="0.045 0.07" numOctaves="3" seed={seed + 3} />
                            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.25 1.5" />
                        </filter>
                        <mask id={`${id}m`}><rect width="120" height="120" fill="#fff" filter={`url(#${id}w)`} /></mask>
                    </>
                )}
            </defs>
            <g
                filter={empty ? undefined : `url(#${id}i)`} mask={empty ? undefined : `url(#${id}m)`}
                fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
            >
                {empty
                    ? <circle cx="60" cy="60" r="54" strokeWidth="1.4" strokeDasharray="3 4" />
                    : (
                        <>
                            <circle cx="60" cy="60" r="54" strokeWidth="3.2" />
                            <circle cx="60" cy="60" r="48.8" strokeWidth="0.9" />
                            <circle cx="60" cy="60" r="27" strokeWidth="1.2" />
                            <text fontSize={stampNameSize(name)} fontWeight="600" fill="currentColor" stroke="none" letterSpacing="0.6">
                                <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">{name}</textPath>
                            </text>
                            {date && (
                                <text fontSize="9" fontWeight="600" fill="currentColor" stroke="none" letterSpacing="0.8">
                                    <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">{date}</textPath>
                                </text>
                            )}
                            <circle cx="12.5" cy="60" r="1.5" fill="currentColor" stroke="none" />
                            <circle cx="107.5" cy="60" r="1.5" fill="currentColor" stroke="none" />
                            {/* 깊이 — 금테면 금 고리 한 줄, 아니면 코스 조각(돈 코스는 굵게, 남은 코스는 가는 점선) */}
                            {deep?.gold
                                ? <circle cx="60" cy="60" r={RING_R} strokeWidth="2.3" stroke={STAMP_GOLD} data-ring="gold" />
                                : deep?.nines && Array.from({ length: deep.nines.total }, (_, i) => (
                                    i < deep.nines!.got
                                        ? <path key={i} d={ringArc(i, deep.nines!.total)} strokeWidth="2.3" data-ring="on" />
                                        : <path key={i} d={ringArc(i, deep.nines!.total)} strokeWidth="1" strokeDasharray="1.2 2.6" opacity="0.6" data-ring="off" />
                                ))}
                            {seasons.length >= 2 && SEASON_DOTS.map(([s, deg]) => {
                                const a = (deg * Math.PI) / 180, has = seasons.includes(s);
                                return <circle key={s} cx={60 + RING_R * Math.cos(a)} cy={60 + RING_R * Math.sin(a)} r="2.4" fill={has ? STAMP_GOLD : "#F4EFE3"} stroke={STAMP_GOLD} strokeWidth="0.9" data-season={s} data-has={has ? "1" : "0"} />;
                            })}
                        </>
                    )}
                <g transform={`translate(60 60) scale(${empty ? 1.9 : 1.55}) translate(-12 -12)`} strokeWidth={empty ? 1.1 : 1.5}>
                    {GLYPH_PATHS[glyph].map((d) => <path key={d} d={d} />)}
                </g>
            </g>
        </svg>
    );
}

export default InkStamp;
