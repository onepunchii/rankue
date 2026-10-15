/**
 * 코치마크 — 화면의 실제 단추를 비추며 하나씩 짚어 주는 첫 안내(2026-10-14 오너: "코치마크 … 어떤 거에 들어가면 좋을까?" →
 * "응 디자인 잘 맞게 해 줘, AI스럽지 않게 각각 카테고리에 잘 맞는 톤으로").
 *
 * 규칙
 *   · 그 기능을 **처음 쓰는 화면에서 한 번**, 3~4단계. 끝냈거나 건너뛰면 다시 뜨지 않는다(localStorage rankue_tour_<id>).
 *     설정의 '도움말 다시 보기'(resetTours)로 다시 볼 수 있다.
 *   · 다른 창(가입 · 설치 팝업 · 확인창 — role=dialog)이 떠 있으면 기다린다. 비출 단추가 화면에 없으면 그 단계는 건너뛴다.
 *   · 아무 데나 눌러도 다음, '건너뛰기'는 늘 보인다. 기기의 '뒤로'는 투어를 닫는다(건너뛴 것으로 센다).
 *   · 시작 · 건너뜀 · 끝을 방문자 발자국에 남긴다(효과를 잰다).
 * 비출 곳은 부르는 쪽이 data-tour="…" 로 단다. 글은 부르는 쪽이 준다(당구 화면은 t() — 다섯 언어).
 *
 * 종목마다 손이 다르다(같은 틀, 다른 종이)
 *   · 골프 — 야디지북의 메모: 미색 종이 · 짙은 초록 먹 · 작은 깃발, 단계는 "HOLE 1/4", 라임 테
 *   · 당구 — 점수판 카드: 흰 판 위 초록 펠트 띠, 단계는 공 네 개(흰 · 노랑 · 빨강 · 빨강)
 *   · 등산 — 이정표: 짙은 숲 판 · 모서리의 산악회 리본 · 단계는 "1 / 4 구간", 산호빛 테
 *   · 낚시 — 한지 메모: 종이 · 먹 · 붉은 낙관으로 찍은 단계
 * ⚠️ 리터럴 색만(골프 테마가 흰 바탕 유틸을 바꿔 끼운다). 글자 12px 이상.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { isLoginSheetOpen } from "@/components/hiq/LoginSheet";
import { useBackToClose } from "@/hooks/useBackToClose";
import { trailOpen } from "@/lib/trail";

export type TourTone = "golf" | "billiards" | "hiking" | "fishing";
/** 종목을 가리지 않는 화면(크루 · 채팅)은 그 종목의 톤을 입는다 — useSport().sport 나 크루의 sportCategory 를 넘긴다. 모르는 값은 당구 */
export const tourToneOf = (sport: string | null | undefined): TourTone =>
    sport === "GOLF" ? "golf" : sport === "HIKING" ? "hiking" : sport === "FISHING" ? "fishing" : "billiards";
export interface TourStep { /** 비출 곳 — data-tour 값 */ target: string; title: string; body: string }

const KEY = (id: string) => `rankue_tour_${id}`;
export const tourDone = (id: string): boolean => { try { return localStorage.getItem(KEY(id)) === "1"; } catch { return true; } };
const markDone = (id: string) => { try { localStorage.setItem(KEY(id), "1"); } catch { /* 저장소를 못 쓰면 이번만 */ } };
/** 설정의 '도움말 다시 보기' — 모든 투어를 다시 */
export function resetTours(): void {
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith("rankue_tour_")) localStorage.removeItem(k); } } catch { /* 저장소를 못 쓰는 환경 */ }
}

interface Look {
    card: React.CSSProperties; title: string; body: string; ring: string; mute: string;
    primary: React.CSSProperties; skip: string; scrim: string;
}
const LOOK: Readonly<Record<TourTone, Look>> = {
    golf: { card: { background: "#F2EFE4", boxShadow: "0 18px 40px #00000073, inset 0 0 0 1px #10210F1F" }, title: "#10210F", body: "#10210FCC", ring: "#64DD17", mute: "#2E5D12", primary: { background: "#64DD17", color: "#0B1A05" }, skip: "#10210F99", scrim: "#000000B8" },
    billiards: { card: { background: "#FFFFFF", boxShadow: "0 18px 40px #0000004D, inset 0 0 0 1px #0B3B2414" }, title: "#0E1A14", body: "#0E1A14B3", ring: "#F5C518", mute: "#0B6B3A", primary: { background: "#0B6B3A", color: "#FFFFFF" }, skip: "#0E1A1499", scrim: "#04110BA6" },
    hiking: { card: { background: "#13302F", boxShadow: "0 18px 40px #00000080, inset 0 0 0 1px #F4EFE31F" }, title: "#F4EFE3", body: "#F4EFE3CC", ring: "#F28C6A", mute: "#F6D9A8", primary: { background: "#F28C6A", color: "#2A0F06" }, skip: "#F4EFE399", scrim: "#020B0EB8" },
    fishing: { card: { background: "#EFE8D8", boxShadow: "0 18px 40px #00000073, inset 0 0 0 1px #0F28381F" }, title: "#1B1B1F", body: "#1B1B1FCC", ring: "#F4A963", mute: "#C8372D", primary: { background: "#F4A963", color: "#2A1606" }, skip: "#1B1B1F99", scrim: "#06121CB8" },
};

/** 단계 표시 — 종목마다 다르게 */
function StepMark({ tone, i, n }: { tone: TourTone; i: number; n: number }) {
    if (tone === "billiards") {
        const balls = ["#FFFFFF", "#F5C518", "#D7263D", "#D7263D"];
        return (
            <span className="flex items-center gap-1.5" aria-label={`${i + 1} / ${n}`}>
                {Array.from({ length: n }, (_, k) => (
                    <span key={k} className="relative inline-block h-4 w-4 rounded-full" style={{ background: k <= i ? balls[k % 4] : "transparent", boxShadow: `inset 0 0 0 1.5px ${k <= i ? "#0E1A1473" : "#0E1A1433"}` }}>
                        {k <= i && <i className="absolute left-[3px] top-[3px] h-[5px] w-[5px] rounded-full" style={{ background: "#FFFFFFB3" }} />}
                    </span>
                ))}
            </span>
        );
    }
    if (tone === "golf") return (
        <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em]" style={{ color: "#2E5D12" }}>
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden><path d="M2 1 V13" stroke="#10210F" strokeWidth="1.4" strokeLinecap="round" /><path d="M2.6 1.4 L10.5 3.8 L2.6 6.4 Z" fill="#D7263D" /></svg>
            HOLE {i + 1}/{n}
        </span>
    );
    if (tone === "hiking") return (
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "#F6D9A8" }}>{i + 1} / {n} 구간</span>
    );
    return (
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[4px] px-1 text-[12px] font-semibold tabular-nums" style={{ background: "#C8372D", color: "#FFF4EC", transform: "rotate(-4deg)" }}>{i + 1}/{n}</span>
    );
}

/** 모서리 장식 — 등산은 산악회 리본, 골프는 연필 자국, 낚시는 접힌 귀 */
function Corner({ tone }: { tone: TourTone }) {
    if (tone === "hiking") return (
        <svg className="pointer-events-none absolute -top-1 right-5" width="22" height="34" viewBox="0 0 22 34" aria-hidden>
            <path d="M3 0 H19 V30 L11 24 L3 30 Z" fill="#F28C6A" /><path d="M3 0 H19 V8 H3 Z" fill="#F6D9A8" opacity="0.9" />
        </svg>
    );
    if (tone === "billiards") return <i aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-[18px]" style={{ background: "#0B6B3A" }} />;
    if (tone === "fishing") return <i aria-hidden className="pointer-events-none absolute right-0 top-0 h-5 w-5 rounded-bl-[6px]" style={{ background: "linear-gradient(225deg,#0B1E2D 50%,#D9CFB8 50%)" }} />;
    return <i aria-hidden className="pointer-events-none absolute left-4 right-4 top-[42px] h-px" style={{ background: "repeating-linear-gradient(90deg,#10210F33 0 6px,transparent 6px 10px)" }} />;
}

const PAD = 6, GAP = 12;
const findTarget = (t: string) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${t}"]`);
    if (!el) return null;
    return el.offsetWidth > 0 && el.offsetHeight > 0 ? el : null;
};
type Box = { left: number; top: number; width: number; height: number };
/**
 * 상자 안의 자리 — 돌려 놓은 상자(당구 점수판: 세로 폰에서 90° 돌린 가로 화면)에서는 화면 좌표가 아니라 상자의 좌표로 잰다.
 * offsetParent 사슬은 transform 의 영향을 받지 않는다.
 */
function localBox(el: HTMLElement, box: HTMLElement): Box {
    let x = 0, y = 0, n: HTMLElement | null = el;
    while (n && n !== box) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

export function CoachTour({ id, steps, tone, when = true, delay = 800, inside, replay }: {
    id: string; steps: readonly TourStep[]; tone: TourTone; /** 띄워도 되는 때(예: 경기 시작 전) */ when?: boolean; delay?: number;
    /** 이 상자 안에 그린다(위치를 가진 상자 — position: relative). 돌려 놓은 화면 · 높은 층의 상자 안에서 쓴다 */
    inside?: React.RefObject<HTMLElement | null>;
    replay?: number;
}) {
    const { t } = useT();
    const [i, setI] = useState(-1);
    const [rect, setRect] = useState<Box | null>(null);
    const [cardH, setCardH] = useState(180);
    const cardRef = useRef<HTMLDivElement>(null);
    const open = i >= 0 && i < steps.length;
    const look = LOOK[tone];
    const seenReplay = useRef(replay ?? 0);

    useEffect(() => {
        if (replay === undefined || replay === seenReplay.current) return;
        seenReplay.current = replay;
        if (!when) return;
        const first = steps.findIndex((s) => findTarget(s.target));
        if (first >= 0) setI(first);
    }, [replay, when, steps]);

    // 시작 — 때가 되고, 처음이고, 다른 창이 없고, 첫 단추가 화면에 있을 때
    useEffect(() => {
        if (!when || tourDone(id) || steps.length === 0) return;
        let alive = true, tries = 0;
        const tick = () => {
            if (!alive) return;
            tries++;
            const busy = isLoginSheetOpen() || !!document.querySelector("[role=dialog]:not([data-testid=coach-tour]), [role=alertdialog]");
            const first = steps.findIndex((s) => findTarget(s.target));
            if (!busy && first >= 0) { setI(first); trailOpen(`도움말 시작 · ${id}`); return; }
            if (tries < 40) window.setTimeout(tick, 500);
        };
        const h = window.setTimeout(tick, delay);
        return () => { alive = false; window.clearTimeout(h); };
    }, [when, id, steps, delay]);

    const finish = useCallback((how: "끝" | "건너뜀") => { markDone(id); trailOpen(`도움말 ${how} · ${id}`); setI(-1); }, [id]);
    useBackToClose(open, () => finish("건너뜀"));

    const go = useCallback((from: number) => {
        // 다음 단계 — 비출 단추가 없는 단계는 건너뛴다
        for (let k = from + 1; k < steps.length; k++) if (findTarget(steps[k].target)) { setI(k); return; }
        finish("끝");
    }, [steps, finish]);

    // 단추로 데려가고 자리를 잰다(스크롤 · 크기 바뀜을 따라간다)
    useLayoutEffect(() => {
        if (!open) return;
        const el = findTarget(steps[i].target);
        if (!el) { go(i); return; }
        const box = inside?.current ?? null;
        if (!box) { const r0 = el.getBoundingClientRect(); if (r0.top < 72 || r0.bottom > window.innerHeight - 220) el.scrollIntoView({ block: "center" }); }
        const measure = () => { const e = findTarget(steps[i].target); if (!e) return; const b = inside?.current; setRect(b ? localBox(e, b) : e.getBoundingClientRect()); };
        measure();
        const h = window.setTimeout(measure, 260);
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => { window.clearTimeout(h); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
    }, [open, i, steps, go, inside]);
    useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); }, [i, rect]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish("건너뜀"); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, finish]);

    const host = inside?.current ?? null;
    if (!open || !rect || typeof document === "undefined" || (inside && !host)) return null;
    const vw = host ? host.clientWidth : window.innerWidth, vh = host ? host.clientHeight : window.innerHeight;
    const hole = { x: Math.max(4, rect.left - PAD), y: Math.max(4, rect.top - PAD), w: Math.min(vw - 8, rect.width + PAD * 2), h: rect.height + PAD * 2 };
    const below = hole.y + hole.h + GAP + cardH < vh - 12 || hole.y < cardH + GAP + 12;
    const cardTop = below ? Math.min(vh - cardH - 12, hole.y + hole.h + GAP) : Math.max(12, hole.y - GAP - cardH);
    const cardW = Math.min(360, vw - 32), cardLeft = Math.max(16, Math.min(vw - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
    const notchX = Math.max(cardLeft + 22, Math.min(cardLeft + cardW - 22, rect.left + rect.width / 2));
    const step = steps[i], last = steps.slice(i + 1).every((s) => !findTarget(s.target));
    const shown = steps.filter((s) => findTarget(s.target)).length, at = steps.slice(0, i + 1).filter((s) => findTarget(s.target)).length - 1;

    return createPortal(
        <div className={host ? "absolute inset-0 z-[70]" : "fixed inset-0 z-[10050]"} role="dialog" aria-modal="true" aria-label={step.title} data-testid="coach-tour" data-tour-id={id} data-step={i}>
            {/* 어두운 막 — 비출 곳만 뚫는다(큰 그림자로 — 돌려 놓은 상자 안에서도 같다). 아무 데나 누르면 다음 */}
            <button type="button" aria-label={t("tour.next")} className="absolute inset-0 h-full w-full cursor-default" onClick={() => go(i)} />
            <span aria-hidden className="pointer-events-none absolute transition-all duration-200" data-testid="coach-hole"
                style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 14, boxShadow: `0 0 0 2.5px ${look.ring}, 0 0 0 7px ${look.ring}40, 0 0 0 200vmax ${look.scrim}` }} />
            {tone === "hiking" && <span aria-hidden className="pointer-events-none absolute" style={{ left: hole.x - 9, top: hole.y - 9, width: hole.w + 18, height: hole.h + 18, borderRadius: 22, border: `1.5px dashed ${look.ring}8C` }} />}
            {/* 카드 */}
            <div ref={cardRef} className="absolute rounded-[18px] px-4 pb-3.5 pt-4" style={{ ...look.card, top: cardTop, left: cardLeft, width: cardW }} data-testid="coach-card">
                <Corner tone={tone} />
                {/* 단추 쪽을 가리키는 꼭지 */}
                <i aria-hidden className="absolute h-3 w-3 rotate-45" style={{ background: look.card.background as string, left: notchX - cardLeft - 6, ...(below ? { top: -6 } : { bottom: -6 }) }} />
                <div className="flex items-center justify-between gap-3">
                    <StepMark tone={tone} i={Math.max(0, at)} n={Math.max(1, shown)} />
                    <button type="button" onClick={() => finish("건너뜀")} className="-mr-1 h-8 px-2 text-[13px] font-medium" style={{ color: look.skip }} data-testid="coach-skip">{t("tour.skip")}</button>
                </div>
                <p className="mt-2.5 text-[17px] font-semibold leading-snug [word-break:keep-all]" style={{ color: look.title }}>{step.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: look.body }}>{step.body}</p>
                <div className="mt-3.5 flex justify-end">
                    <button type="button" onClick={() => go(i)} className="h-11 min-w-[96px] rounded-xl px-4 text-[14.5px] font-semibold active:opacity-85" style={look.primary} data-testid="coach-next">{last ? t("tour.done") : t("tour.next")}</button>
                </div>
            </div>
        </div>,
        host ?? document.body,
    );
}
