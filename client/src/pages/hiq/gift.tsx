/**
 * 선물 도착(2026-10-16) — 어드민이 증정한 굿즈의 '받은 화면'(/gift/:id). 알림을 누르면 온다(GET /api/hiq/gifts/:id — 본인 것만).
 * 2차(같은 날 오너: "디자인을 더 완벽하게 · 지금 너무 디자인적이지 않아") — 네 종목이 색만 다른 카드였던 것을 **언박싱**으로:
 *  1. 포장된 선물 — 종목마다 그 세계의 재질(당구 가죽 큐 케이스 · 놋쇠 걸쇠 / 골프 초록 상자 · 금박 봉인 / 등산 크라프트 상자 · 웨빙 끈 버클 / 낚시 한지 상자 · 봉함지와 낙관)
 *  2. 누르면 잠금이 풀리고(3차 — 리본 대신 종목마다의 잠금, 아래 Closure) 뚜껑이 날아가며 굿즈가 빛과 함께 떠오른다
 *  3. 그 종목의 진열 — 당구 벨벳 판과 놋쇠 명판 · 골프 공단 쿠션의 볼마커 상자 · 등산 바느질한 캔버스 카드와 끈 달린 꼬리표 · 낚시 족자와 붉은 낙관
 * 운영팀의 한마디는 테이프로 붙인 쪽지. 동작 줄이기면 처음부터 열린 모습. 그림 · 글자는 코드로 그린다(그림 파일은 굿즈 그림 하나뿐).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useT } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { caseItem, type CaseLocale } from "@shared/cueCase";
import type { GiftView, GoodsSport } from "@shared/goods";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];
const serialText = (n: number) => `No.${String(n).padStart(3, "0")}`;
const dateText = (iso: string) => { const d = new Date(new Date(iso).getTime() + 9 * 3_600_000); return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}`; };

/** 종목마다의 세계 — 바탕 · 포장 · 강조 */
const WORLD: Readonly<Record<GoodsSport, { ink: string; soft: string; accent: string; button: CSSProperties; buttonInk: string; spark: string }>> = {
    billiards: { ink: "#F4EAD6", soft: "#F4EAD6A6", accent: "#E8C46A", button: { background: "linear-gradient(180deg,#F6DFA8 0%,#D6A956 48%,#B0823A 62%,#E2BF78 100%)", boxShadow: "0 6px 18px #00000066, inset 0 1px 0 #FFF6DD" }, buttonInk: "#3A230F", spark: "#F6DFA8" },
    golf: { ink: "#173523", soft: "#173523A6", accent: "#2F6B3A", button: { background: "linear-gradient(180deg,#3E8A4B,#245B2F)", boxShadow: "0 6px 16px #1F4A2A55, inset 0 1px 0 #FFFFFF33" }, buttonInk: "#FFFFFF", spark: "#FFFFFF" },
    hiking: { ink: "#173F3C", soft: "#173F3CA6", accent: "#D9694C", button: { background: "linear-gradient(180deg,#E8836A,#C9583C)", boxShadow: "0 6px 16px #8A3A2655, inset 0 1px 0 #FFFFFF40" }, buttonInk: "#FFFFFF", spark: "#FFF4E6" },
    fishing: { ink: "#1B1B1F", soft: "#1B1B1FA6", accent: "#C8372D", button: { background: "#1B1B1F", boxShadow: "0 6px 16px #00000040" }, buttonInk: "#F6F0E2", spark: "#C8372D" },
};

/* ── 바탕 ── */
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
const FIBERS = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.28' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.25  0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23f)'/></svg>")`;

function Backdrop({ sport }: { sport: GoodsSport }) {
    if (sport === "billiards") return (
        <div aria-hidden className="absolute inset-0">
            {/* 당구대 천 · 위에서 비추는 등 */}
            <div className="absolute inset-0" style={{ background: "radial-gradient(130% 70% at 50% 0%, #2E6B4F 0%, #134232 38%, #082419 72%, #04130D 100%)" }} />
            <div className="absolute inset-0 opacity-[0.35] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
            <div className="gift-lamp absolute left-1/2 top-[-12%] h-[78%] w-[150%] -translate-x-1/2" style={{ background: "radial-gradient(ellipse 45% 62% at 50% 0%, #FFE2AA4D 0%, #FFE2AA14 45%, transparent 70%)" }} />
            <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(transparent, #020A06CC)" }} />
        </div>
    );
    if (sport === "golf") return (
        <div aria-hidden className="absolute inset-0">
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#F7F1DF 0%,#EAF0D8 38%,#CFE0B7 62%,#9DC386 100%)" }} />
            <div className="absolute left-1/2 top-[14%] h-56 w-56 -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle,#FFF6D8 0%,#FFF6D800 70%)" }} />
            <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 360 260" preserveAspectRatio="none" style={{ height: "46%" }}>
                <path d="M0 120 C70 90 130 110 190 96 C250 82 300 100 360 88 L360 260 L0 260Z" fill="#B7D49C" />
                <path d="M0 160 C80 132 150 150 220 138 C280 128 320 142 360 134 L360 260 L0 260Z" fill="#8DB874" />
                <path d="M0 205 C90 180 170 200 250 188 C300 182 330 190 360 186 L360 260 L0 260Z" fill="#6E9F58" />
                <g transform="translate(286 82)"><line x1="0" y1="0" x2="0" y2="30" stroke="#3B4A33" strokeWidth="1.4" /><path d="M0 0 L13 4.5 L0 9Z" fill="#C8372D" /></g>
            </svg>
            <div className="absolute inset-0 opacity-[0.18] mix-blend-multiply" style={{ backgroundImage: NOISE }} />
        </div>
    );
    if (sport === "hiking") return (
        <div aria-hidden className="absolute inset-0">
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#F6DCC7 0%,#E9E4D8 34%,#CFE1DC 64%,#9FC2BB 100%)" }} />
            <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 360 300" preserveAspectRatio="none" style={{ height: "60%" }}>
                <path d="M0 150 L40 112 L72 132 L118 76 L160 118 L200 92 L246 128 L290 84 L330 112 L360 100 L360 300 L0 300Z" fill="#B6D0CA" opacity="0.8" />
                <path d="M0 190 L52 150 L96 172 L140 128 L184 166 L232 136 L278 170 L322 140 L360 156 L360 300 L0 300Z" fill="#88AFA7" />
                <path d="M0 236 L60 204 L108 222 L160 190 L214 220 L262 198 L316 222 L360 206 L360 300 L0 300Z" fill="#5D8C84" />
                <rect x="0" y="196" width="360" height="30" fill="#FFFFFF" opacity="0.18" />
            </svg>
            <div className="gift-mist absolute inset-x-[-20%] top-[52%] h-20 opacity-60" style={{ background: "linear-gradient(90deg,transparent,#FFFFFFAA,transparent)" }} />
        </div>
    );
    return (
        <div aria-hidden className="absolute inset-0">
            {/* 한지 · 옅은 먹 물결 */}
            <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 30%, #F8F2E4 0%, #EFE6D2 60%, #E2D5BB 100%)" }} />
            <div className="absolute inset-0 opacity-90" style={{ backgroundImage: FIBERS }} />
            <svg className="absolute inset-x-0 bottom-0 w-full opacity-[0.22]" viewBox="0 0 360 200" preserveAspectRatio="none" style={{ height: "36%" }}>
                {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M0 ${40 + i * 34} C60 ${24 + i * 34} 120 ${56 + i * 34} 180 ${40 + i * 34} S300 ${24 + i * 34} 360 ${40 + i * 34}`} fill="none" stroke="#1B1B1F" strokeWidth={1.4 - i * 0.15} />)}
            </svg>
        </div>
    );
}

/* ── 포장(닫힌 선물) ── */
/*
 * 3차(10/17 오너: "리본이 어색 · 전체 리본 · 어려우면 다른 디자인으로") — 리본 · 매듭을 걷고, 종목마다 그 세계의 잠금을 단다.
 * 뚜껑과 몸통의 이음매에 걸쳐 있어 뚜껑이 들리면 실제처럼 풀린다:
 *  당구 = 큐 케이스의 놋쇠 걸쇠(단추가 눌리고 혀가 젖혀진다) · 골프 = 금박 봉인 스티커(이음매에서 갈라진다)
 *  등산 = 배낭 덮개의 웨빙 끈과 버클(딸깍 풀려 끈이 젖혀진다) · 낚시 = 한지 봉함지와 붉은 물고기 낙관(이음매에서 찢어진다)
 * 잠금 그림은 64 × 110 한 틀(이음매 y = 46)에 그리고, 뚜껑 쪽 · 몸통 쪽을 따로 놓는다(뚜껑 쪽은 뚜껑과 함께 날아간다).
 */
const SEAM = 46;
/** 이음매에서 찢어진 금 — 낚시 봉함지 · 골프 봉인이 위아래로 갈라질 때(처음에는 맞물려 한 장으로 보인다) */
const TEAR = "0,0 64,0 64,45 58,47 52,44.5 46,47.5 40,44.8 34,47.2 28,44.6 22,47.4 16,44.9 10,47 4,45 0,46.5";
const TEAR_BELOW = "0,46.5 4,45 10,47 16,44.9 22,47.4 28,44.6 34,47.2 40,44.8 46,47.5 52,44.5 58,47 64,45 64,110 0,110";
const scallop = (cx: number, cy: number, r: number, n: number, d: number) =>
    Array.from({ length: n * 4 }, (_, i) => { const a = (i / (n * 4)) * Math.PI * 2; const rr = r + d * Math.cos(a * n); return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join(" ");

function ClosureDefs({ id }: { id: string }) {
    return (
        <defs>
            <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF1C8" /><stop offset="0.32" stopColor="#E8C46A" /><stop offset="0.68" stopColor="#B0823A" /><stop offset="1" stopColor="#7A5320" /></linearGradient>
            <linearGradient id={`${id}-brassH`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8E6427" /><stop offset="0.45" stopColor="#FFF1C8" /><stop offset="1" stopColor="#9C7030" /></linearGradient>
            <linearGradient id={`${id}-foil`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset="0.28" stopColor="#D9B25A" /><stop offset="0.5" stopColor="#F7E3A2" /><stop offset="0.74" stopColor="#A9802F" /><stop offset="1" stopColor="#E9C977" /></linearGradient>
            <radialGradient id={`${id}-ball`} cx="0.38" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFF9E2" /><stop offset="0.6" stopColor="#E9CD82" /><stop offset="1" stopColor="#B38A36" /></radialGradient>
            <linearGradient id={`${id}-plastic`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4A504E" /><stop offset="0.5" stopColor="#2B302F" /><stop offset="1" stopColor="#171A19" /></linearGradient>
            <pattern id={`${id}-weave`} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#D9694C" /><path d="M0 4 L4 0" stroke="#B9523A" strokeWidth="1.1" /><path d="M-1 1 L1 -1 M3 5 L5 3" stroke="#B9523A" strokeWidth="1.1" /></pattern>
            <pattern id={`${id}-fiber`} width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#FBF6EA" /><path d="M1 3 q3 -1 6 0 M5 8 q2 1 5 0 M2 10.5 q1.5 -0.6 3 0" stroke="#D9CCB0" strokeWidth="0.5" fill="none" /></pattern>
            <clipPath id={`${id}-up`}><polygon points={TEAR} /></clipPath>
            <clipPath id={`${id}-down`}><polygon points={TEAR_BELOW} /></clipPath>
            <filter id={`${id}-drop`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" floodColor="#000" floodOpacity="0.38" /></filter>
        </defs>
    );
}

/** 골프 봉인 스티커 한 장(금박 · 톱니 가장자리 · 딤플 공) — 위아래 반쪽으로 잘라 쓴다 */
function GolfSeal({ id }: { id: string }) {
    const dimples: [number, number][] = [];
    for (let y = -7; y <= 7; y += 2.6) for (let x = -7; x <= 7; x += 2.6) { const ox = x + (Math.round((y + 7) / 2.6) % 2 ? 1.3 : 0); if (ox * ox + y * y < 44) dimples.push([32 + ox, SEAM + y]); }
    return (
        <g filter={`url(#${id}-drop)`}>
            <polygon points={scallop(32, SEAM, 23, 26, 1.1)} fill={`url(#${id}-foil)`} stroke="#8A6A26" strokeWidth="0.6" />
            <circle cx="32" cy={SEAM} r="17.6" fill="none" stroke="#8A6A26" strokeWidth="0.7" />
            <circle cx="32" cy={SEAM} r="16.2" fill="none" stroke="#FFF6D6" strokeOpacity="0.55" strokeWidth="0.6" />
            <circle cx="32" cy={SEAM} r="9.4" fill="none" stroke="#6E5118" strokeOpacity="0.35" strokeWidth="1.6" />
            <circle cx="32" cy={SEAM} r="8.6" fill={`url(#${id}-ball)`} stroke="#6E5118" strokeWidth="0.7" />
            {dimples.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.9" fill="#7E5F22" fillOpacity="0.7" />)}
            <path d={`M27.4 ${SEAM - 4.6} q2.6 -2.2 5.6 -1.8`} fill="none" stroke="#FFFBEA" strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.85" />
            <path d={`M19 ${SEAM + 12} q13 -5 26 0`} fill="none" stroke="#8A6A26" strokeWidth="0.7" strokeOpacity="0.7" />
        </g>
    );
}

/** 낚시 봉함지(한지 띠) + 붉은 물고기 낙관 */
function FishSeal({ id }: { id: string }) {
    return (
        <g>
            <path d="M19.5 10 L44.5 9.3 L45.4 30 L44.6 60 L45.5 100 L19 100.6 L18.4 70 L19.2 40 Z" fill={`url(#${id}-fiber)`} filter={`url(#${id}-drop)`} />
            <path d="M19.5 10 L44.5 9.3" stroke="#E6DBC4" strokeWidth="0.6" />
            <g transform={`rotate(-4 32 ${SEAM}) translate(32 ${SEAM}) scale(1.3) translate(-32 -${SEAM})`}>
                <path d={`M22.6 ${SEAM - 9.6} L41.2 ${SEAM - 9.2} L41.6 ${SEAM + 9.4} L22.4 ${SEAM + 9.8} Z`} fill="#C8372D" />
                <rect x="24.2" y={SEAM - 7.8} width="15.6" height="15.6" fill="none" stroke="#FFF4EC" strokeWidth="0.9" />
                <path d={`M26.6 ${SEAM} q4.4 -4.6 9.6 0 q-5.2 4.6 -9.6 0 Z`} fill="none" stroke="#FFF4EC" strokeWidth="1" />
                <path d={`M36.2 ${SEAM} l3 -2.6 v5.2 Z`} fill="#FFF4EC" />
                <circle cx="28.9" cy={SEAM - 0.7} r="0.7" fill="#FFF4EC" />
            </g>
        </g>
    );
}

/** part: lid · body = 이음매 위 · 아래 조각, whole = 닫혀 있는 동안 한 장(봉인 · 봉함지 — 이음매에 금이 비치지 않게. 뚜껑이 들리는 순간 반쪽들로 바뀐다) */
function Closure({ sport, part }: { sport: GoodsSport; part: "lid" | "body" | "whole" }) {
    const id = `gc-${sport}-${part}`;
    const split = sport === "golf" || sport === "fishing";
    if (part === "whole" && !split) return null;
    const style: CSSProperties = part !== "body"
        // 뚜껑 틀에서 이음매 = 뚜껑 아래 끝(70) · 몸통 틀에서 이음매 = 뚜껑이 덮은 6px 아래
        ? { left: "50%", top: 70 - SEAM, marginLeft: -32 }
        : { left: "50%", top: 6 - SEAM, marginLeft: -32 };
    let body: ReactNode = null;
    if (sport === "billiards") body = part === "lid" ? (
        <g filter={`url(#${id}-drop)`}>
            {/* 경첩 판 · 경첩 · 젖혀지는 혀 */}
            <rect x="15" y="22" width="34" height="18" rx="4" fill={`url(#${id}-brass)`} stroke="#5C3C14" strokeWidth="0.7" />
            <rect x="17.4" y="24.4" width="29.2" height="13.2" rx="2.6" fill="none" stroke="#FFF1C8" strokeOpacity="0.5" strokeWidth="0.6" />
            {[[19.5, 26.5], [44.5, 26.5], [19.5, 35.5], [44.5, 35.5]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="1.5" fill="#7A5320" /><path d={`M${x - 0.9} ${y} h1.8`} stroke="#FFF1C8" strokeWidth="0.45" /></g>)}
            <g className="gift-flip">
                <rect x="21" y="37" width="22" height="6" rx="3" fill={`url(#${id}-brassH)`} stroke="#5C3C14" strokeWidth="0.6" />
                <path d="M24 41 H40 V66 Q40 72 32 72 Q24 72 24 66 Z" fill={`url(#${id}-brass)`} stroke="#5C3C14" strokeWidth="0.7" />
                <path d="M26.4 43 V65.5 Q26.4 69.4 32 69.4" fill="none" stroke="#FFF1C8" strokeOpacity="0.6" strokeWidth="0.7" />
            </g>
        </g>
    ) : (
        <g filter={`url(#${id}-drop)`}>
            {/* 몸통 쪽 받침판 · 누름단추 */}
            <rect x="13" y="58" width="38" height="34" rx="6" fill={`url(#${id}-brass)`} stroke="#5C3C14" strokeWidth="0.7" />
            <rect x="15.5" y="60.5" width="33" height="29" rx="4.4" fill="none" stroke="#FFF1C8" strokeOpacity="0.45" strokeWidth="0.6" />
            {[[18, 87], [46, 87]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="1.5" fill="#7A5320" /><path d={`M${x - 0.9} ${y} h1.8`} stroke="#FFF1C8" strokeWidth="0.45" /></g>)}
            <g className="gift-press"><circle cx="32" cy="80" r="5.4" fill={`url(#${id}-brassH)`} stroke="#5C3C14" strokeWidth="0.7" /><circle cx="30.6" cy="78.6" r="1.6" fill="#FFF8DE" fillOpacity="0.7" /></g>
        </g>
    );
    if (split) {
        const seal = sport === "golf" ? <GolfSeal id={id} /> : <FishSeal id={id} />;
        body = part === "whole" ? seal : <g clipPath={`url(#${id}-${part === "lid" ? "up" : "down"})`}>{seal}</g>;
    }
    if (sport === "hiking") body = part === "lid" ? (
        <g className="gift-flip" filter={`url(#${id}-drop)`}>
            {/* 덮개에서 내려오는 웨빙 끈 + 버클 수(꽂는 쪽) */}
            <rect x="21" y="10" width="22" height="50" fill={`url(#${id}-weave)`} />
            <path d="M21 10 V60 M43 10 V60" stroke="#9E4430" strokeWidth="1" />
            <path d="M23 16 H41" stroke="#FFE7DC" strokeWidth="0.7" strokeDasharray="1.6 1.4" />
            <path d="M20 58 H44 L42 66 H40 L41 72 H37 L36 66 H28 L27 72 H23 L24 66 H22 Z" fill={`url(#${id}-plastic)`} stroke="#0E100F" strokeWidth="0.6" />
            <path d="M23 60 H41" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="0.8" />
        </g>
    ) : (
        <g filter={`url(#${id}-drop)`}>
            {/* 몸통에 박은 짧은 끈(상자 X 바느질) + 버클 암(받는 쪽) */}
            <rect x="22" y="86" width="20" height="22" fill={`url(#${id}-weave)`} />
            <rect x="24.5" y="90" width="15" height="14" fill="none" stroke="#FFE7DC" strokeWidth="0.7" strokeDasharray="1.5 1.2" />
            <path d="M24.5 90 L39.5 104 M39.5 90 L24.5 104" stroke="#FFE7DC" strokeWidth="0.7" strokeDasharray="1.5 1.2" />
            <path d="M17 70 Q17 67 20 67 H44 Q47 67 47 70 V84 Q47 89 42 89 H22 Q17 89 17 84 Z" fill={`url(#${id}-plastic)`} stroke="#0E100F" strokeWidth="0.6" />
            <path d="M19.6 72 V84 M44.4 72 V84" stroke="#69706D" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M24 69.6 H40" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="0.8" />
            <path d="M27 78 H37" stroke="#0E100F" strokeWidth="1.2" strokeLinecap="round" />
        </g>
    );
    return (
        <svg aria-hidden className={`pointer-events-none absolute overflow-visible ${split ? (part === "whole" ? "gift-whole" : "gift-half") : ""}`} width="64" height="110" viewBox="0 0 64 110" style={style}>
            <ClosureDefs id={id} />
            {body}
        </svg>
    );
}

function Wrapped({ sport, opening, onOpen, label }: { sport: GoodsSport; opening: boolean; onOpen: () => void; label: string }) {
    // 입체 상자 — 앞면 · 윗면(사다리꼴) · 뚜껑 띠 · 바닥 그림자. 재질은 종목마다(가죽 · 공단 광택 · 크라프트 섬유 · 한지). 잠금은 Closure
    const M: Record<GoodsSport, { front: string; top: string; lidFront: string; lidTop: string; tex?: string; texBlend?: CSSProperties["mixBlendMode"]; edge: string; stitch?: string; shadow: string }> = {
        billiards: {
            front: "linear-gradient(180deg,#5A2C1A 0%,#3B1B10 70%,#2A120A 100%)", top: "linear-gradient(180deg,#8A4A2E,#6A3520)",
            lidFront: "linear-gradient(180deg,#6E3822 0%,#4A2315 100%)", lidTop: "linear-gradient(180deg,#9A5636,#743D25)",
            tex: NOISE, texBlend: "overlay", edge: "#E8C46A", stitch: "#E8C46A80", shadow: "#000000B3",
        },
        golf: {
            front: "linear-gradient(180deg,#2E6B3A 0%,#1E4A27 100%)", top: "linear-gradient(180deg,#4C9258,#357A42)",
            lidFront: "linear-gradient(180deg,#3A7F47,#25562F)", lidTop: "linear-gradient(180deg,#5AA466,#3F8A4C)",
            tex: "linear-gradient(115deg,transparent 30%,#FFFFFF1F 45%,transparent 60%)", edge: "#F4EBCF", stitch: "#FFFFFF33", shadow: "#1F4A2A80",
        },
        hiking: {
            front: "linear-gradient(180deg,#B88E60 0%,#9C7448 100%)", top: "linear-gradient(180deg,#D7B68C,#C29C6E)",
            lidFront: "linear-gradient(180deg,#C59D70,#A88053)", lidTop: "linear-gradient(180deg,#E0C29A,#CBA77A)",
            tex: FIBERS, texBlend: "multiply", edge: "#7A5A36", shadow: "#5B4A3266",
        },
        fishing: {
            front: "linear-gradient(180deg,#F3EBD8 0%,#E4D6BA 100%)", top: "linear-gradient(180deg,#FFFBF1,#F1E7D2)",
            lidFront: "linear-gradient(180deg,#F8F1E2,#E9DCC2)", lidTop: "linear-gradient(180deg,#FFFDF6,#F5ECD9)",
            tex: FIBERS, texBlend: "multiply", edge: "#1B1B1F", shadow: "#5A4A2A55",
        },
    };
    const m = M[sport];
    const face = (bg: string, extra: CSSProperties = {}): CSSProperties => ({ backgroundImage: m.tex ? `${m.tex}, ${bg}` : bg, backgroundBlendMode: m.tex && m.texBlend ? `${m.texBlend}, normal` : undefined, ...extra });
    const W = 200, BODY_H = 128, TOP_H = 34, LID_H = 36;
    return (
        <button type="button" onClick={onOpen} disabled={opening} aria-label={label} className={`gift-wrap relative mx-auto block ${opening ? "gift-wrap-opening" : "gift-wrap-idle"}`} style={{ width: W + 40, height: BODY_H + LID_H + TOP_H + 70 }} data-testid="gift-wrapped">
            {/* 바닥 그림자 */}
            <span aria-hidden className="absolute bottom-[-6px] left-1/2 h-[26px] w-[230px] -translate-x-1/2 rounded-[50%]" style={{ background: `radial-gradient(ellipse at center, ${m.shadow} 0%, transparent 70%)` }} />
            {/* 몸통 앞면 + 잠금의 몸통 쪽 */}
            <span className="absolute bottom-[8px] left-1/2 -translate-x-1/2 overflow-hidden rounded-b-[10px]" style={face(m.front, { width: W, height: BODY_H, boxShadow: "inset 0 -10px 18px #00000026, inset 0 1px 0 #FFFFFF14" })}>
                {m.stitch && <span className="absolute inset-[7px] rounded-[6px]" style={{ border: `1.5px dashed ${m.stitch}` }} />}
                {sport === "billiards" && ["left-0 rounded-bl-[10px]", "right-0 rounded-br-[10px]"].map((c, i) => (
                    <span key={i} className={`absolute bottom-0 ${c} h-[18px] w-[18px]`} style={{ background: "linear-gradient(180deg,#F6DFA8,#B0823A 60%,#7A5320)", clipPath: i === 0 ? "polygon(0 0,38% 0,38% 62%,100% 62%,100% 100%,0 100%)" : "polygon(62% 0,100% 0,100% 100%,0 100%,0 62%,62% 62%)" }} />
                ))}
                <Closure sport={sport} part="body" />
            </span>
            {/* 뚜껑 — 윗면(사다리꼴) + 앞 띠 + 잠금의 뚜껑 쪽(뚜껑과 함께 날아간다) */}
            <span className="gift-lid absolute left-1/2 -translate-x-1/2" style={{ bottom: BODY_H + 2, width: W + 14, height: LID_H + TOP_H }}>
                <span className="absolute inset-x-0 top-0" style={face(m.lidTop, { height: TOP_H, clipPath: "polygon(7% 0, 93% 0, 100% 100%, 0 100%)" })}>
                    {sport === "billiards" && (
                        // 큐 케이스 손잡이 — 가죽 띠 고리와 놋쇠 고정쇠
                        <svg aria-hidden className="absolute left-1/2 top-[3px] -translate-x-1/2" width="96" height="28" viewBox="0 0 96 28">
                            <path d="M14 24 C18 4 78 4 82 24" fill="none" stroke="#2A120A" strokeWidth="9" strokeLinecap="round" />
                            <path d="M14 24 C18 4 78 4 82 24" fill="none" stroke="#5E2F1C" strokeWidth="6.5" strokeLinecap="round" />
                            <path d="M20 19 C26 8 70 8 76 19" fill="none" stroke="#E8C46A" strokeOpacity="0.55" strokeWidth="0.7" strokeDasharray="2 1.6" />
                            {[10, 78].map((x) => <rect key={x} x={x} y="19" width="8" height="7" rx="1.6" fill="#D6A956" stroke="#5C3C14" strokeWidth="0.6" />)}
                        </svg>
                    )}
                </span>
                <span className="absolute inset-x-0 bottom-0 rounded-[4px]" style={face(m.lidFront, { height: LID_H, boxShadow: `0 6px 10px #00000033, inset 0 1px 0 #FFFFFF2A, inset 0 -6px 10px #00000026, inset 0 -1.5px 0 ${m.edge}55` })} />
                <Closure sport={sport} part="lid" />
                <Closure sport={sport} part="whole" />
            </span>
            {/* 열 때 터지는 빛 */}
            <span aria-hidden className="gift-burst pointer-events-none absolute left-1/2 top-[55%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </button>
    );
}

/* ── 진열(열린 뒤) ── */
function Showcase({ g, name }: { g: GiftView; name: string }) {
    const img = g.image;
    const serial = g.serial != null ? serialText(g.serial) : null;
    const limit = g.limit ? ` / ${g.limit}` : "";
    if (g.sport === "billiards") return (
        <div className="gift-rise relative mx-auto w-full max-w-[340px] rounded-[26px] p-[10px]" style={{ background: "linear-gradient(160deg,#6A3520,#2A120B)", boxShadow: "0 30px 60px #000000B3, inset 0 1px 0 #FFFFFF22" }}>
            <div className="relative rounded-[18px] px-4 pb-5 pt-4" style={{ background: "radial-gradient(120% 90% at 50% 0%, #1D2C48 0%, #0E1729 60%, #080E1A 100%)", boxShadow: "inset 0 4px 18px #000000CC", outline: "1.5px dashed #E8C46A55", outlineOffset: "-6px" }}>
                <div className="mx-auto w-fit rounded-[6px] px-5 py-1.5" style={{ background: "linear-gradient(180deg,#F6DFA8,#D6A956 45%,#B0823A 60%,#E2BF78)", boxShadow: "0 3px 10px #00000080" }}>
                    <p className="text-[14px] font-bold tracking-[0.04em]" style={{ color: "#3A230F", textShadow: "0 1px 0 #FFF4D6" }}>{name}</p>
                </div>
                <div className="relative mt-5 h-[64px] rounded-full" style={{ background: "linear-gradient(180deg,#050A13,#0C1626 70%,#13203A)", boxShadow: "inset 0 3px 8px #000000" }}>
                    {img && <img src={img} alt={name} draggable={false} className="gift-cue absolute inset-x-3 top-1/2 w-[calc(100%-24px)] -translate-y-1/2 object-contain" style={{ height: 40, filter: "drop-shadow(0 6px 6px #000000AA)" }} />}
                </div>
                {serial && <p className="mt-4 text-center"><span className="inline-block rounded-[4px] px-3 py-1 text-[15px] font-bold tabular-nums" style={{ background: "linear-gradient(180deg,#F6DFA8,#C99A4B)", color: "#3A230F", boxShadow: "0 2px 6px #00000080" }}>{serial}<span className="text-[12px] opacity-70">{limit}</span></span></p>}
            </div>
        </div>
    );
    if (g.sport === "golf") return (
        <div className="gift-rise relative mx-auto w-[270px]">
            <div className="rounded-[22px] p-[12px]" style={{ background: "linear-gradient(160deg,#2F6B3A,#173D20)", boxShadow: "0 26px 50px #1F4A2A66, inset 0 1px 0 #FFFFFF2A" }}>
                <div className="relative flex h-[230px] items-center justify-center rounded-[14px]" style={{ background: "radial-gradient(70% 70% at 50% 40%, #FFFDF6 0%, #F1EAD6 70%, #E2D7BC 100%)", boxShadow: "inset 0 6px 16px #6B5A3A55" }}>
                    {/* 공단 주름 */}
                    <div className="absolute inset-0 rounded-[14px] opacity-40" style={{ background: "repeating-radial-gradient(circle at 50% 46%, transparent 0 14px, #FFFFFF66 15px, transparent 18px)" }} />
                    <div className="relative h-[156px] w-[156px] rounded-full" style={{ boxShadow: "inset 0 8px 16px #5A4A2A55, 0 1px 0 #FFFFFF" }}>
                        {img && <img src={img} alt={name} draggable={false} className="gift-pop absolute inset-[8px] h-[140px] w-[140px] object-contain" style={{ filter: "drop-shadow(0 8px 8px #3B2E1A66)" }} />}
                    </div>
                </div>
            </div>
            {serial && <div className="mx-auto -mt-3 w-fit rounded-[4px] px-3 py-1 text-[14px] font-bold tabular-nums" style={{ background: "linear-gradient(180deg,#F6DFA8,#C99A4B)", color: "#3A230F", boxShadow: "0 3px 8px #00000055" }}>{serial}<span className="text-[12px] opacity-70">{limit}</span></div>}
        </div>
    );
    if (g.sport === "hiking") return (
        <div className="gift-rise relative mx-auto w-[280px]">
            <div className="relative rounded-[10px] px-6 pb-8 pt-7" style={{ backgroundImage: `${FIBERS}, linear-gradient(160deg,#EFE2C8,#DCC8A4)`, boxShadow: "0 24px 46px #5B4A3255" }}>
                <div className="absolute inset-[10px] rounded-[6px]" style={{ border: "2px dashed #8A6A44AA" }} />
                <p className="relative text-center text-[12px] font-semibold tracking-[0.18em]" style={{ color: "#6E5232" }}>RANKUE TRAIL</p>
                <div className="relative mx-auto mt-3 flex h-[170px] w-[170px] items-center justify-center">
                    {img && <img src={img} alt={name} draggable={false} className="gift-pop h-[166px] w-[166px] object-contain" style={{ filter: "drop-shadow(0 5px 4px #4B3A2266)", transform: "rotate(-4deg)", ["--r" as string]: "-4deg" }} />}
                </div>
            </div>
            {serial && (
                <div className="gift-tag absolute -right-3 top-6 origin-top rotate-[9deg]">
                    <span className="mx-auto block h-6 w-px" style={{ background: "#6E5232" }} />
                    <span className="block rounded-[6px] px-3 py-2 text-center" style={{ background: "#F7F1E3", boxShadow: "0 6px 12px #4B3A2244", border: "1px solid #CDB894" }}>
                        <span className="block text-[12px] font-semibold" style={{ color: "#8A6A44" }}>번호</span>
                        <span className="block text-[15px] font-bold tabular-nums" style={{ color: "#173F3C" }}>{serial}</span>
                    </span>
                </div>
            )}
        </div>
    );
    return (
        // 낚시 — 족자
        <div className="gift-unroll relative mx-auto w-[250px]">
            <div className="relative z-10 mx-[-14px] h-[14px] rounded-full" style={{ background: "linear-gradient(180deg,#8A5A32,#5A3418)", boxShadow: "0 3px 6px #00000055" }} />
            <div className="gift-scroll relative overflow-hidden px-[14px] pb-[16px] pt-[12px]" style={{ background: "linear-gradient(90deg,#2B3550,#3A4566 50%,#2B3550)" }}>
                <div className="relative flex h-[250px] flex-col items-center justify-center px-4" style={{ backgroundImage: `${FIBERS}, linear-gradient(180deg,#FBF6EA,#EFE5CF)` }}>
                    {img && <img src={img} alt={name} draggable={false} className="max-h-[190px] max-w-full object-contain" style={{ mixBlendMode: "multiply" }} />}
                    {serial && (
                        <span className="absolute bottom-3 right-3 flex h-[54px] w-[54px] rotate-[-4deg] flex-col items-center justify-center rounded-[4px] text-center leading-none" style={{ background: "#C8372D", color: "#FFF4EC", boxShadow: "inset 0 0 0 2.5px #C8372D, inset 0 0 0 4px #FFF4EC" }}>
                            <span className="text-[12px] font-semibold">No.</span>
                            <span className="mt-0.5 text-[16px] font-bold tabular-nums">{serial.slice(3)}</span>
                            {g.limit ? <span className="mt-0.5 text-[12px] font-semibold opacity-85">/{g.limit}</span> : null}
                        </span>
                    )}
                </div>
            </div>
            <div className="relative z-10 mx-[-14px] h-[16px] rounded-full" style={{ background: "linear-gradient(180deg,#8A5A32,#5A3418)", boxShadow: "0 4px 8px #00000066" }} />
        </div>
    );
}

function Sparkles({ color }: { color: string }) {
    const pts = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (i * 37.3) % 100, y: (i * 61.7) % 70 + 6, s: 6 + (i % 4) * 3, d: (i % 7) * 0.35 })), []);
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            {pts.map((p, i) => (
                <svg key={i} className="gift-spark absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }} viewBox="0 0 10 10">
                    <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4Z" fill={color} />
                </svg>
            ))}
        </div>
    );
}

export default function GiftPage() {
    const { t, locale } = useT();
    const l: CaseLocale = (LOCALES as readonly string[]).includes(locale) ? (locale as CaseLocale) : "en";
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const q = useQuery<GiftView>({ queryKey: ["/api/hiq/gifts", id], queryFn: () => apiRequest(`/api/hiq/gifts/${encodeURIComponent(id)}`), retry: false });
    const g = q.data;
    const sport: GoodsSport = g?.sport ?? "billiards";
    const w = WORLD[sport];
    const name = g ? (g.sport === "billiards" ? caseItem(g.key)?.name[l] ?? g.name : g.name) : "";
    const still = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    const [stage, setStage] = useState<"wrapped" | "opening" | "open">(still ? "open" : "wrapped");
    useEffect(() => { if (stage !== "opening") return; const h = window.setTimeout(() => setStage("open"), 1150); return () => window.clearTimeout(h); }, [stage]);

    return (
        <div className="relative flex min-h-[100dvh] flex-col overflow-hidden" style={{ color: w.ink, paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)" }} data-testid="gift-page" data-sport={g?.sport ?? ""} data-stage={stage}>
            <Backdrop sport={sport} />
            {g && stage !== "wrapped" && <Sparkles color={w.spark} />}
            <div className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col px-6">
                {q.isError ? (
                    <div className="m-auto text-center" data-testid="gift-missing">
                        <p className="text-[17px] font-semibold">{t("gift.missing")}</p>
                        <button type="button" onClick={() => setLocation("/dashboard")} className="mt-5 h-12 rounded-full px-6 text-[15px] font-semibold" style={{ ...w.button, color: w.buttonInk }}>{t("gift.close")}</button>
                    </div>
                ) : !g ? (
                    <p className="m-auto text-[14px]" style={{ color: w.soft }} role="status">…</p>
                ) : (
                    <>
                        <header className="pt-10 text-center">
                            <p className="flex items-center justify-center gap-2.5 text-[12px] font-semibold tracking-[0.14em]" style={{ color: w.accent }}>
                                <span className="h-px w-8" style={{ background: w.accent }} />{t("gift.from")}<span className="h-px w-8" style={{ background: w.accent }} />
                            </p>
                            {stage === "open" ? (
                                <>
                                    <h1 className="gift-fade mt-3 text-[28px] font-bold leading-tight tracking-[-0.02em] break-keep" data-testid="gift-name">{name}</h1>
                                    <p className="gift-fade mt-1.5 text-[13px]" style={{ color: w.soft }}>{g.groupName} · {dateText(g.at)}</p>
                                </>
                            ) : (
                                <>
                                    <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.02em]">{t("gift.title")}</h1>
                                    <p className="mt-1.5 text-[13px]" style={{ color: w.soft }}>{t("gift.tap")}</p>
                                </>
                            )}
                        </header>

                        <div className="relative flex flex-1 items-center justify-center py-8">
                            {stage === "open" ? (
                                <div className="w-full">
                                    <div aria-hidden className="gift-halo pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${w.spark}55 0%, transparent 65%)` }} />
                                    <Showcase g={g} name={name} />
                                </div>
                            ) : (
                                <Wrapped sport={sport} opening={stage === "opening"} onOpen={() => setStage("opening")} label={t("gift.tap")} />
                            )}
                        </div>

                        {stage === "open" && (
                            <div className="gift-fade">
                                {g.message && (
                                    <div className="relative mx-auto mb-6 max-w-[300px] -rotate-[1.5deg] rounded-[4px] px-5 pb-4 pt-5 text-left" style={{ background: "#FFFDF6", color: "#2A2620", boxShadow: "0 10px 22px #00000033" }} data-testid="gift-message">
                                        <span aria-hidden className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 rotate-[2deg]" style={{ background: "#F3E6B8CC", boxShadow: "0 1px 2px #00000022" }} />
                                        <p className="text-[14.5px] leading-relaxed break-keep">{g.message}</p>
                                        <p className="mt-2 text-right text-[12px] font-semibold" style={{ color: "#8A8274" }}>— {t("gift.sign")}</p>
                                    </div>
                                )}
                                <button type="button" onClick={() => setLocation(g.url)} className="h-[52px] w-full rounded-full text-[15.5px] font-bold" style={{ ...w.button, color: w.buttonInk }} data-testid="gift-open">{t("gift.open")}</button>
                                <button type="button" onClick={() => setLocation("/dashboard")} className="mt-1.5 h-11 w-full rounded-full text-[14px] font-semibold" style={{ color: w.soft }}>{t("gift.close")}</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
