/**
 * 축제 달력(2026-10-21) — 한 달을 가로 한 줄로 펴고 축제마다 기간 막대를 긋는다. 주말(토 · 일) 칸은 옅게 칠하고, 이번 달이면 오늘에 산호색 세로줄.
 * 달은 위의 칩으로 고른다(올해 1월부터 자료가 있는 마지막 달까지 — 지난 달은 올해 날짜 그대로, 다음 해 날짜가 나오면 바뀐다).
 * 막대를 누르면 그 축제. 열두 줄까지 보이고 '더 보기'.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { festivalPath, festivalState, overlaps, weekdayKo, type FestivalRow } from "@shared/festivals";

const nextMonth = (ym: string) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); return m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, "0")}`; };
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)), 0)).getUTCDate();
const SHOW = 12;

export function FestivalCalendar({ items, today }: { items: readonly FestivalRow[]; today: string }) {
    const thisMonth = today.slice(0, 6);
    const months = useMemo(() => {
        const set = new Set<string>([thisMonth]);
        const first = `${today.slice(0, 4)}01`;
        for (const f of items) for (let m = f.start.slice(0, 6), i = 0; m <= f.end.slice(0, 6) && i < 3; m = nextMonth(m), i++) if (m >= first) set.add(m);
        return [...set].sort();
    }, [items, today, thisMonth]);
    const [month, setMonth] = useState(thisMonth);
    const [more, setMore] = useState(false);
    useEffect(() => setMore(false), [month]);

    // 이번 달 칩이 보이게 — scrollIntoView 는 화면 전체를 끌어내리므로 칩 줄만 옮긴다
    const chipsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const box = chipsRef.current, chip = box?.querySelector<HTMLElement>(`[data-month="${thisMonth}"]`);
        if (box && chip) box.scrollLeft = chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2;
    }, [thisMonth, months.length]);

    const n = daysIn(month);
    const from = `${month}01`, to = `${month}${String(n).padStart(2, "0")}`;
    // 이번 달은 끝난 축제를 아래로(2026-10-21 화면 확인: 흐린 줄이 열린 축제 사이에 끼어 어수선했다). 다른 달은 시작한 날 순서
    const rows = useMemo(() => items.filter((f) => overlaps(f, from, to)).sort((a, b) =>
        (month === thisMonth ? (a.end < today ? 1 : 0) - (b.end < today ? 1 : 0) : 0) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title, "ko")), [items, from, to, month, thisMonth, today]);
    const shown = more ? rows : rows.slice(0, SHOW);
    const pct = (ymd: string, edge: "start" | "end") => {
        const d = ymd < from ? 1 : ymd > to ? n : Number(ymd.slice(6, 8));
        return ((edge === "start" ? d - 1 : d) / n) * 100;
    };
    const weekends = Array.from({ length: n }, (_, i) => i + 1).filter((d) => { const w = weekdayKo(`${month}${String(d).padStart(2, "0")}`); return w === "토" || w === "일"; });
    const ticks = [1, 5, 10, 15, 20, 25, n].filter((d, i, a) => a.indexOf(d) === i && !(d === 25 && n - 25 < 3));
    const todayPct = month === thisMonth ? ((Number(today.slice(6, 8)) - 0.5) / n) * 100 : null;

    return (
        <div data-testid="festival-calendar">
            <div ref={chipsRef} className="-mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="달 고르기">
                {months.map((m) => {
                    const on = m === month;
                    const label = `${m.slice(0, 4) !== today.slice(0, 4) ? `${m.slice(2, 4)}년 ` : ""}${Number(m.slice(4, 6))}월`;
                    return (
                        <button key={m} type="button" data-month={m} onClick={() => setMonth(m)} aria-pressed={on}
                            className="h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-medium tabular-nums active:opacity-80"
                            style={on ? { background: "#F4EFE3", color: "#0B1F26" } : { background: "#FFFFFF0F", color: "#F4EFE3CC" }}>
                            {label}{m === thisMonth ? " · 이번 달" : ""}
                        </button>
                    );
                })}
            </div>

            {rows.length === 0 ? (
                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px] text-[#F4EFE399]">이 달에 열리는 축제가 아직 없어요</p>
            ) : (
                <div className="rounded-2xl bg-[#FFFFFF08] px-3.5 pb-2 pt-3" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF12" }}>
                    {/* 날짜 눈금 */}
                    <div className="relative mb-1 h-5 text-[12px] tabular-nums text-[#F4EFE380]">
                        {ticks.map((d) => <span key={d} className="absolute -translate-x-1/2" style={{ left: `${((d - 0.5) / n) * 100}%` }}>{d}</span>)}
                    </div>
                    <div className="relative">
                        {/* 주말 칸 · 오늘 줄 */}
                        <div className="pointer-events-none absolute inset-0" aria-hidden>
                            {weekends.map((d) => <span key={d} className="absolute inset-y-0 bg-[#F4EFE30A]" style={{ left: `${((d - 1) / n) * 100}%`, width: `${100 / n}%` }} />)}
                            {todayPct != null && <span className="absolute inset-y-0 w-[1.5px] bg-[#F28C6A]" style={{ left: `${todayPct}%`, boxShadow: "0 0 6px #F28C6A" }} />}
                        </div>
                        <ul className="relative">
                            {shown.map((f) => {
                                const st = festivalState(f, today).state;
                                const left = pct(f.start, "start"), right = pct(f.end, "end");
                                const bar = st === "now" ? "linear-gradient(90deg,#F28C6A,#F6B08F)" : st === "soon" ? "#F6D9A8CC" : "#F4EFE340";
                                return (
                                    <li key={f.id}>
                                        <Link href={festivalPath(f.id)} className="block py-1.5 active:opacity-70" data-testid="festival-calendar-row">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className={`truncate text-[13.5px] ${st === "ended" ? "text-[#F4EFE399]" : "text-[#F4EFE3]"}`}>{f.title}</span>
                                                <span className="shrink-0 text-[12px] text-[#F4EFE380]">{f.region}</span>
                                            </span>
                                            <span className="relative mt-1 block h-[7px]">
                                                <span className="absolute inset-y-0" style={{ left: `${left}%`, width: `${Math.max(right - left, 100 / n)}%`, background: bar, borderRadius: `${f.start < from ? 0 : 99}px ${f.end > to ? 0 : 99}px ${f.end > to ? 0 : 99}px ${f.start < from ? 0 : 99}px` }} />
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    {rows.length > SHOW && (
                        <button type="button" onClick={() => setMore((v) => !v)} className="mt-1 h-10 w-full rounded-xl text-[13.5px] font-medium text-[#F6D9A8] active:bg-[#FFFFFF0A]">
                            {more ? "접기" : `${rows.length - SHOW}곳 더 보기`}
                        </button>
                    )}
                </div>
            )}
            <p className="mt-2 text-[12px] text-[#F4EFE366]">옅은 칸은 주말 · 산호색 줄은 오늘 — 지난 달은 올해 열린 날짜예요</p>
        </div>
    );
}
