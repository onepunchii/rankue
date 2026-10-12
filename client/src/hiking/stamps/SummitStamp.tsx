/**
 * 정상 도장 — 산 한 곳(2026-10-13). 정상석 모양의 잉크 도장이다: 돌에 산 이름을 세로로 새기고, 받침에 높이, 그 아래 오른 날.
 *
 * 그림 파일이 아니라 SVG 로 그린다 — 산마다 이름이 달라야 해서다. 골프의 도장(둥근 잉크 도장)과 모양이 다르다:
 * 등산의 도장은 **정상석**이다. 권역마다 잉크 색이 다르고(REGION_INK), 가장자리를 조금 흩뜨려 찍힌 느낌을 낸다.
 * **늘 종이 위에 둔다** — 잉크 색이 종이색(theme.HK.paper)에 맞춰져 있다.
 *
 * 상태: on(정상에서 인증한 산) · faded(인증 없이 적은 산 — 흐리게) · empty(아직 — 점선 윤곽)
 */
import { useId } from "react";
import { heightText } from "@shared/hikingMountains";

export type SummitStampState = "on" | "faded" | "empty";

/** 권역의 잉크 색 — 종이 위에서 읽히는 짙은 색 */
export const REGION_INK: Readonly<Record<string, string>> = {
    capital: "#2F5FB8", gangwon: "#1F5560", chungcheong: "#3E7D2A", jeonbuk: "#B8502E", jeonnam: "#1C7A8A", gyeongbuk: "#7A5A2B", gyeongnam: "#A87A12", jeju: "#3A3A3A",
};
export const regionInk = (region: string | null | undefined) => REGION_INK[region ?? ""] ?? "#1F5560";

/** 글자에서 뽑은 작은 수 — 도장마다 번짐이 다르되 다시 그려도 같은 산은 같은 무늬 */
export function summitSeed(text: string): number {
    let h = 11;
    for (const ch of text) h = (h * 33 + ch.codePointAt(0)!) % 9973;
    return h % 83;
}
/** 돌에 새기는 이름 — 괄호 안은 뺀다("가리산(홍천)" → "가리산"). 일곱 자까지 */
export const stoneName = (name: string) => [...name.replace(/\(.*?\)/g, "").replace(/\s+/g, "")].slice(0, 7);
/** 세로로 새길 때의 글자 크기 — 돌 안(세로 62)에 들어가게 */
export const stoneFont = (len: number) => Math.min(17, Math.floor(62 / Math.max(len, 1)));

export function SummitStamp({ name, heightM, date, ink, size, state = "on", tilt = 0, className }: {
    name: string;
    heightM?: number | null;
    /** 오른 날 "2026.10.03" */
    date?: string | null;
    ink: string;
    /** 가로(px). 비우면 놓인 칸의 너비에 맞춘다 */
    size?: number;
    state?: SummitStampState;
    tilt?: number;
    className?: string;
}) {
    const id = `ss${useId().replace(/:/g, "")}`;
    const empty = state === "empty";
    const chars = stoneName(name);
    const fs = stoneFont(chars.length);
    const startY = 50 - ((chars.length - 1) * fs) / 2;
    const seed = summitSeed(name);
    const color = empty ? "#463A2470" : ink;
    return (
        <svg
            viewBox="0 0 100 124" width={size ?? "100%"} className={className} role="img"
            aria-label={empty ? `${name} — 아직 없음` : state === "faded" ? `${name} — 인증 없는 기록` : `${name} 정상 도장${date ? ` ${date}` : ""}`}
            data-summit={state}
            style={{ display: "block", aspectRatio: "100 / 124", color, transform: tilt ? `rotate(${tilt}deg)` : undefined, opacity: state === "faded" ? 0.36 : 1 }}
        >
            {!empty && (
                <defs>
                    <filter id={`${id}i`} x="-5%" y="-5%" width="110%" height="110%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} result="n" />
                        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" />
                    </filter>
                    <filter id={`${id}w`}>
                        <feTurbulence type="fractalNoise" baseFrequency="0.05 0.08" numOctaves="3" seed={seed + 5} />
                        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.25 1.5" />
                    </filter>
                    <mask id={`${id}m`}><rect width="100" height="124" fill="#fff" filter={`url(#${id}w)`} /></mask>
                </defs>
            )}
            <g filter={empty ? undefined : `url(#${id}i)`} mask={empty ? undefined : `url(#${id}m)`} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
                {empty ? (
                    <>
                        <path d="M27 92 L31 26 Q50 8 69 26 L73 92 Z" strokeWidth="1.3" strokeDasharray="3 4" />
                        <path d="M38 70 L47 54 L52 61 L56 56 L64 70 Z" strokeWidth="1.1" />
                    </>
                ) : (
                    <>
                        {/* 돌 — 겹선. 받침 한 줄 */}
                        <path d="M26 92 L30 25 Q50 6 70 25 L74 92 Z" strokeWidth="3" />
                        <path d="M31.5 87 L35 28.5 Q50 14 65 28.5 L68.5 87 Z" strokeWidth="0.9" />
                        <path d="M14 92 H86" strokeWidth="3" />
                        <path d="M20 97.5 H80" strokeWidth="1" />
                        {chars.map((ch, i) => (
                            <text key={i} x="50" y={startY + i * fs} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight="700" fill="currentColor" stroke="none">{ch}</text>
                        ))}
                        {heightText(heightM) && <text x="50" y="109" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="currentColor" stroke="none" letterSpacing="0.4">{heightText(heightM)}</text>}
                        {date && <text x="50" y="120.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor" stroke="none" letterSpacing="0.5">{date}</text>}
                    </>
                )}
            </g>
        </svg>
    );
}

export default SummitStamp;
