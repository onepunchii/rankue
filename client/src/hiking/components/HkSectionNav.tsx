/**
 * 산 화면의 구역 줄(2026-10-13) — 머리줄 밑에 붙는 줄. 골프장 상세의 섹션 줄(SectionNav)을 등산의 색으로 옮겼다.
 * 긴 화면이라서다: 날씨만 보러 온 사람이 코스 · 사진을 스크롤로 넘지 않아도 된다. 지금 보고 있는 구역에 불이 들어온다.
 *
 * 골프와 다른 점 — **화면에 실제로 있는 구역만** 보여 준다(문서를 본다). 등산의 구역은 이 줄이 모르는 사정으로 생기고 사라진다:
 * '이 산의 사진'은 사진이 한 장이라도 있을 때만, '내 산행 사진'은 등산을 쓰는 회원에게만 그려진다. 그 사정을 받는 쪽에서 다시 셈하면
 * 두 군데가 어긋난다 — 그래서 후보(items)를 순서대로 받고, 그 가운데 문서에 있는 것만 줄에 올린다. 뒤늦게 생기는 구역은 지켜보다가 올린다.
 * 한 이름이 구역 여럿을 가리킬 수 있다(els — 사진: '이 산의 사진', 없으면 '내 산행 사진'). 누르면 그 가운데 화면에 있는 첫 구역으로 간다.
 * 구역이 셋보다 적으면 줄을 그리지 않는다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SECTION_NAV_MIN } from "@shared/hikingAround";
import { HK_SCROLL_MARGIN } from "./HikingShell";

export interface HkNavItem {
    id: string;
    label: string;
    /** 건너갈 구역의 id 들(앞의 것이 먼저) — 안 주면 "sec-<id>" 하나 */
    els?: readonly string[];
}
const elIds = (it: HkNavItem): readonly string[] => it.els ?? [`sec-${it.id}`];

/** 그 구역으로 내려간다 — 붙박이 줄 밑에 멈춘다. 제 여백이 없는 구역(다른 파일이 그리는 구역)에는 여기서 붙인다 */
export function hkJumpTo(elId: string): void {
    const el = typeof document !== "undefined" ? document.getElementById(elId) : null;
    if (!el) return;
    if (!el.style.scrollMarginTop) el.style.scrollMarginTop = HK_SCROLL_MARGIN;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HkSectionNav({ items, className }: { items: readonly HkNavItem[]; className?: string }) {
    const wrap = useRef<HTMLDivElement>(null);
    const bar = useRef<HTMLElement>(null);
    // 문서에 있는 구역 — "courses=sec-courses|photos=sec-mountain-photos+sec-photos|…". 글자로 들고 있어야 같은 답에 다시 그리지 않는다
    const [sig, setSig] = useState("");
    const [active, setActive] = useState<string | null>(null);

    // ① 어느 구역이 문서에 있는가 — 사진처럼 늦게 생기는 구역이 있어 이 화면(이 줄의 부모)을 지켜본다.
    //    그리기 전에 한 번 센다(layout) — 줄이 한 박자 늦게 생기면 그 밑의 구역들이 눈앞에서 밀려 내려간다
    useLayoutEffect(() => {
        let raf = 0;
        const scan = () => {
            raf = 0;
            setSig(items.map((it) => { const on = elIds(it).filter((id) => document.getElementById(id)); return on.length ? `${it.id}=${on.join("+")}` : ""; }).filter(Boolean).join("|"));
        };
        scan();
        if (typeof MutationObserver === "undefined") return;
        const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
        mo.observe(wrap.current?.parentElement ?? document.body, { childList: true, subtree: true });
        return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [items]);

    const shown = useMemo(() => (sig ? sig.split("|").map((s) => {
        const [id, els] = s.split("=");
        return { id, els: els.split("+"), label: items.find((it) => it.id === id)?.label ?? id };
    }) : []), [sig, items]);
    const on = shown.length >= SECTION_NAV_MIN;

    // ② 지금 보고 있는 구역 — 위에서부터 처음으로 화면의 윗부분에 걸린 구역
    useEffect(() => {
        if (!on || typeof IntersectionObserver === "undefined") return;
        const inView = new Set<string>();
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) { if (e.isIntersecting) inView.add(e.target.id); else inView.delete(e.target.id); }
            const first = shown.find((s) => s.els.some((id) => inView.has(id)));
            if (first) setActive(first.id);
        }, { rootMargin: "-120px 0px -55% 0px" });
        for (const s of shown) for (const id of s.els) { const el = document.getElementById(id); if (el) io.observe(el); }
        return () => io.disconnect();
    }, [shown, on]);

    // 불 들어온 이름이 줄 밖이면 보이게 민다
    useEffect(() => {
        const b = bar.current;
        if (!active || !b) return;
        const el = Array.from(b.querySelectorAll<HTMLElement>("[data-nav]")).find((x) => x.dataset.nav === active);
        if (!el) return;
        const left = el.offsetLeft - 16, right = el.offsetLeft + el.offsetWidth + 16;
        if (left < b.scrollLeft) b.scrollTo({ left, behavior: "smooth" });
        else if (right > b.scrollLeft + b.clientWidth) b.scrollTo({ left: right - b.clientWidth, behavior: "smooth" });
    }, [active]);

    // 누른 순간의 문서에서 갈 곳을 찾는다 — 방금 생긴 구역(사진)이 ①에 아직 안 잡혔어도 그 구역으로 간다
    const jump = (id: string) => {
        const it = items.find((x) => x.id === id);
        const el = it ? elIds(it).find((x) => document.getElementById(x)) : undefined;
        if (el) hkJumpTo(el);
    };

    // 줄을 안 그릴 때도 자리 표시는 남긴다 — ①이 이 줄의 부모를 지켜보는 손잡이다
    if (!on) return <div ref={wrap} hidden />;
    return (
        <div ref={wrap} className={`sticky z-30 border-b border-[#FFFFFF14] bg-[#0B1F26F2] backdrop-blur-md ${className ?? ""}`} style={{ top: "calc(56px + env(safe-area-inset-top))" }} data-testid="hk-secnav">
            <nav ref={bar} aria-label="이 화면의 구역" className="scrollbar-hide relative flex gap-5 overflow-x-auto px-5">
                {shown.map((s) => {
                    const sel = active === s.id;
                    return (
                        <button key={`secnav:${s.id}`} type="button" data-nav={s.id} aria-current={sel ? "true" : undefined} onClick={() => jump(s.id)}
                            className="relative h-11 shrink-0 text-[14px] transition-colors" style={{ color: sel ? "#F4EFE3" : "#F4EFE38C", fontWeight: sel ? 600 : 500 }}>
                            {s.label}
                            {/* 밑줄 — 지금 어디인지를 조용히 말한다 */}
                            <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full" style={{ background: sel ? "#F28C6A" : "transparent" }} aria-hidden />
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

export default HkSectionNav;
