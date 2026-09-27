/**
 * '길 찾기' 배너(2026-09-27 오너: "검색으로 들어온 매장·선수 페이지에서 온라인게임 길 찾기로 가입을 이끌자").
 * 작은 당구대에서 3쿠션 길이 점선으로 그려지고 수구가 그 길로 굴러가 득점하는 장면 — 길 찾기 기능이 하는 일을 그대로 보여 준다.
 * 누르면 온라인게임 길 찾기(/online-game?path=1)로 바로 간다. 비회원은 3번 무료, 그다음 가입 안내(SimulatorPage).
 *
 * 가볍게: SVG + SMIL 한 벌(라이브러리·캔버스 없음). 화면 밖이면 멈추고, '동작 줄이기' 설정이면 멈춘 그림(길·득점 장면)만.
 * 단계 집계: 화면에 보이면 view, 누르면 click(lib/promo.ts — 하루 한 번).
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { LucideChevronRight } from "@/lib/icons";
import { promoEvent, rememberPromoSrc } from "@/lib/promo";
import type { PromoSrc } from "@shared/promoFunnel";

const fill = (s: string, p: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => p[k] ?? m);

/* 당구대 좌표(viewBox 320×176, 쿠션 안쪽 14~306 × 14~162, 공 반지름 6) — 한 바퀴 도는 3쿠션 */
const RED = { x: 162, y: 140 };
const YEL = { x: 96, y: 118 };
const PATH = "M70 130 L151 136 L300 84 L238 20 L20 70 L86 111";
const LEN = 630;
const T = 6; // 한 바퀴 초
/* 한 바퀴 안의 때(비율) — 길 그리기 0~.27, 굴러가기 .30~.733(경로 길이 비례: 적구 .356 · 1쿠션 .465 · 2쿠션 .526 · 3쿠션 .68) */
const HITS = [{ x: 306, y: 84, t: 0.465 }, { x: 238, y: 14, t: 0.526 }, { x: 14, y: 70, t: 0.68 }];

function useReducedMotion() {
    const [r, setR] = useState(false);
    useEffect(() => {
        const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!m) return;
        setR(m.matches);
        const on = () => setR(m.matches);
        m.addEventListener?.("change", on);
        return () => m.removeEventListener?.("change", on);
    }, []);
    return r;
}

function TableScene({ chip, rate, score, still }: { chip: string; rate: string; score: string; still: boolean }) {
    const kt = (...v: number[]) => v.join(";");
    const anim = (attr: string, values: string, keyTimes: string) =>
        still ? null : <animate attributeName={attr} values={values} keyTimes={keyTimes} dur={`${T}s`} repeatCount="indefinite" />;
    return (
        <>
            <defs>
                <radialGradient id="pfp-felt" cx="50%" cy="45%" r="75%">
                    <stop offset="0%" stopColor="#1c8a57" />
                    <stop offset="100%" stopColor="#0c6440" />
                </radialGradient>
                <linearGradient id="pfp-rail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7a4a26" />
                    <stop offset="100%" stopColor="#5a3418" />
                </linearGradient>
                <radialGradient id="pfp-white" cx="35%" cy="30%"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor="#d9dde2" /></radialGradient>
                <radialGradient id="pfp-yellow" cx="35%" cy="30%"><stop offset="0%" stopColor="#ffe68a" /><stop offset="100%" stopColor="#e5a900" /></radialGradient>
                <radialGradient id="pfp-red" cx="35%" cy="30%"><stop offset="0%" stopColor="#ff7a6e" /><stop offset="100%" stopColor="#c41d12" /></radialGradient>
                {/* 점선 길이 앞에서부터 그려지게 — 실선으로 그려지는 마스크 */}
                <mask id="pfp-draw">
                    <path d={PATH} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={LEN} strokeDashoffset={still ? 0 : LEN}>
                        {anim("stroke-dashoffset", `${LEN};${LEN};0;0;${LEN}`, kt(0, 0.02, 0.27, 0.95, 1))}
                    </path>
                </mask>
            </defs>

            {/* 테이블 */}
            <rect x="0" y="0" width="320" height="176" rx="14" fill="url(#pfp-rail)" />
            <rect x="10" y="10" width="300" height="156" rx="6" fill="#0a5535" />
            <rect x="14" y="14" width="292" height="148" rx="3" fill="url(#pfp-felt)" />
            {[53, 92, 131, 170, 209, 248, 287].map((x) => (
                <g key={x} fill="#f3e3c3" opacity=".85"><circle cx={x - 20} cy="5" r="1.6" /><circle cx={x - 20} cy="171" r="1.6" /></g>
            ))}
            {[51, 88, 125].map((y) => (
                <g key={y} fill="#f3e3c3" opacity=".85"><circle cx="5" cy={y} r="1.6" /><circle cx="315" cy={y} r="1.6" /></g>
            ))}

            {/* 길(점선) */}
            <path d={PATH} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" mask="url(#pfp-draw)" />

            {/* 쿠션 맞는 자리 — 수구가 지날 때 번쩍 */}
            {HITS.map((h, i) => (
                <circle key={i} cx={h.x} cy={h.y} r="7" fill="#fff" opacity={still ? 0.35 : 0}>
                    {anim("opacity", "0;0;.85;0;0", kt(0, h.t, h.t + 0.005, h.t + 0.07, 1))}
                    {anim("r", "4;4;4;13;13", kt(0, h.t, h.t + 0.005, h.t + 0.07, 1))}
                </circle>
            ))}
            {HITS.map((h, i) => (
                <text key={`n${i}`} x={h.x + (h.x > 300 ? -14 : h.x < 20 ? 12 : 0)} y={h.y + (h.y < 20 ? 16 : h.x < 20 ? -8 : 4)} textAnchor="middle"
                    fontSize="10" fontWeight="800" fill="#fff" opacity={still ? 0.9 : 0}>
                    {i + 1}
                    {anim("opacity", "0;0;1;1;0", kt(0, h.t, h.t + 0.01, 0.95, 1))}
                </text>
            ))}

            {/* 적구(빨강) — 수구가 맞히면 살짝 밀린다 */}
            <g>
                {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 0;7 5;7 5;0 0" keyTimes={kt(0, 0.356, 0.42, 0.95, 1)} dur={`${T}s`} repeatCount="indefinite" />}
                <circle cx={RED.x} cy={RED.y} r="6" fill="url(#pfp-red)" />
            </g>
            {/* 둘째 적구(노랑) — 마지막에 맞고 '득점' */}
            <g>
                {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 0;5 3;5 3;0 0" keyTimes={kt(0, 0.733, 0.78, 0.95, 1)} dur={`${T}s`} repeatCount="indefinite" />}
                <circle cx={YEL.x} cy={YEL.y} r="6" fill="url(#pfp-yellow)" />
            </g>
            {/* 수구(흰색) — 길을 따라 */}
            {still ? (
                <circle cx="86" cy="111" r="6" fill="url(#pfp-white)" />
            ) : (
                <circle r="6" fill="url(#pfp-white)">
                    {/* 원(cx·cy 0)을 경로 절대 좌표로 옮긴다. 시작 전·끝난 뒤엔 CUE 자리·마지막 자리에 머문다 */}
                    <animateMotion path={PATH}
                        keyPoints="0;0;1;1;0" keyTimes={kt(0, 0.3, 0.733, 0.95, 1)} calcMode="linear" dur={`${T}s`} repeatCount="indefinite" />
                    {/* 제자리로 돌아가는 동안은 숨긴다 */}
                    <animate attributeName="opacity" values="1;1;0;0;1" keyTimes={kt(0, 0.93, 0.95, 0.995, 1)} dur={`${T}s`} repeatCount="indefinite" />
                </circle>
            )}

            {/* 득점 */}
            <g opacity={still ? 1 : 0}>
                {anim("opacity", "0;0;1;1;0", kt(0, 0.735, 0.76, 0.93, 1))}
                <rect x="104" y="92" width="46" height="18" rx="9" fill="#F5B721" />
                <text x="127" y="104.5" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#3d2c00">{score}</text>
            </g>

            {/* 앱의 '길 찾기' 칩 + 성공률 — 실제 화면처럼 */}
            <g>
                <rect x="22" y="22" width="66" height="20" rx="10" fill="#000" fillOpacity=".55" />
                <text x="55" y="35.5" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{chip}</text>
            </g>
            <g opacity={still ? 1 : 0}>
                {anim("opacity", "0;0;1;1;0", kt(0, 0.22, 0.27, 0.95, 1))}
                <rect x="210" y="138" width="88" height="18" rx="9" fill="#fff" />
                <text x="254" y="150.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#006241">{rate}</text>
            </g>
        </>
    );
}

export function PathFinderPromo({ src, name, className }: { src: PromoSrc; name?: string | null; className?: string }) {
    const { t } = useT();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const reduce = useReducedMotion();
    const ref = useRef<HTMLElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // 화면에 보이면 view 한 번, 화면 밖이면 애니메이션 멈춤
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        let seen = false;
        const io = new IntersectionObserver(([e]) => {
            const svg = svgRef.current as any;
            if (e.isIntersecting) {
                svg?.unpauseAnimations?.();
                if (!seen && e.intersectionRatio >= 0.5) { seen = true; if (!member) promoEvent("view", src); }
            } else svg?.pauseAnimations?.();
        }, { threshold: [0, 0.5] });
        io.observe(el);
        return () => io.disconnect();
    }, [src, member]);

    const go = () => {
        if (!member) { rememberPromoSrc(src); promoEvent("click", src); }
        setLocation(`/online-game?path=1&src=${src}`);
    };
    const eyebrow = name
        ? fill(t(src === "store" ? "promo.path.eyebrowStore" : "promo.path.eyebrowPlayer"), { name })
        : t("promo.path.eyebrow");

    return (
        <section ref={ref} className={`rk-card rounded-card overflow-hidden ${className ?? ""}`} aria-label={t("promo.path.title")}>
            <button type="button" onClick={go} className="block w-full text-left active:opacity-95">
                <div className="bg-[#0b3d28] px-3 pt-3 pb-2.5">
                    <svg ref={svgRef} viewBox="0 0 320 176" className="block w-full h-auto" role="img" aria-label={t("promo.path.sub")}>
                        <TableScene chip={t("promo.path.svgChip")} rate={t("promo.path.svgRate")} score={t("promo.path.svgScore")} still={reduce} />
                    </svg>
                </div>
                <div className="p-4 pt-3.5">
                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-brand/10 text-brand text-[11.5px] font-bold max-w-full truncate">🎱 {eyebrow}</span>
                    <h3 className="mt-2 text-[18px] font-bold leading-snug text-ink-1 break-keep">{t("promo.path.title")}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-3 break-keep">{t("promo.path.sub")}</p>
                    <span className="mt-3.5 flex items-center justify-center gap-1 h-11 rounded-full bg-brand text-brand-fg text-[14.5px] font-bold">
                        {t("promo.path.cta")}<LucideChevronRight className="w-4 h-4" />
                    </span>
                    <span className="block mt-2 text-center text-[11.5px] text-ink-4">{member ? t("promo.path.memberNote") : t("promo.path.guestNote")}</span>
                </div>
            </button>
        </section>
    );
}
