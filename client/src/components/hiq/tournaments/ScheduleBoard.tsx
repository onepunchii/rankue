/**
 * 일정판 — 앞으로 몇 주의 대회를 리그별 줄에 막대로(2026-10-19 디자이너 리뷰: 27줄 목록만으로는 '언제 뭐가 겹치는지'가 안 보였다).
 * 당구대 한 장: 위는 나무 레일 + 주마다 다이아몬드(포인트), 바닥은 펠트. 막대 색은 공 — PBA 흰 공 · LPBA 노란 공 · UMB 빨간 공 · 팀리그 초크 파랑 · 드림투어 빈 공.
 * 폭에 맞춰 주 수를 고른다(막대 하루 ≈ 4px 이상 — 폰 8주, 넓은 화면 13주까지). 이름은 막대 안 → 옆 빈자리 → 생략(shared/tourBoard).
 * 막대를 누르면 목록 줄과 같은 곳(우리 대회 페이지 또는 공식 안내)으로.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import type { Locale } from "@/lib/i18n";
import { boardLabel, boardLayout, labelPx, labelSpot, type BoardBar, type BoardLabel, type BoardLane } from "@shared/tourBoard";
import { cityKo, type UpcomingEvent } from "@shared/tournamentMeta";
import { TOUR_TEXT, countryLabel, leagueLabel, rangeLabel } from "./parts";

const LANE_W = 58;
const LANE_H = 32;
const RAIL_H = 26;
/** 공 색 — fill · 글자 · 테두리 */
const BALL: Record<BoardLane, { bg: string; fg: string; ring?: string }> = {
    PBA: { bg: "#F6F1E3", fg: "#2A1A0C" },
    LPBA: { bg: "#E8C46A", fg: "#2A1A0C" },
    TEAM: { bg: "#8EC3EE", fg: "#0B2A44" },
    DREAM: { bg: "transparent", fg: "#F6F1E3", ring: "#F6F1E3B3" },
    CHALLENGE: { bg: "transparent", fg: "#F6F1E3", ring: "#F6F1E380" },
    UMB: { bg: "#D9472F", fg: "#FFFFFF" },
};
const IVORY = "#F6F1E3";

export function ScheduleBoard({ events, today, locale }: { events: readonly UpcomingEvent[]; today: string; locale: Locale }) {
    const L = TOUR_TEXT[locale] ?? TOUR_TEXT.en;
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        setW(Math.round(el.getBoundingClientRect().width));
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => { if (e?.contentRect.width) setW(Math.round(e.contentRect.width)); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const area = Math.max(0, w - LANE_W - 10);
    const weeks = Math.min(13, Math.max(6, Math.floor(area / 28)));
    const b = boardLayout(events, today, weeks);

    const text = (l: BoardLabel): string => {
        switch (l.k) {
            case "leg": return L.boardLeg(l.n);
            case "round": return L.boardRound(l.n);
            case "final": return L.boardFinal;
            case "post": return L.boardPost;
            case "world": return L.boardWorld;
            case "sponsor": return l.text;
            case "city": return locale === "ko" ? cityKo(l.city) : l.city;
            case "country": return countryLabel(l.code, null, locale);
            default: return "";
        }
    };
    const monthName = (m: number, y: number) => {
        if (locale === "ko") return `${m}월`;
        try { return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))); } catch { return String(m); }
    };
    // 줄 이름 — 58px 칸이라 한국어 밖은 짧게('Team League' → Team)
    const laneName = (l: BoardLane) => l === "UMB" ? "UMB" : locale === "ko" ? leagueLabel(l, locale) : ({ TEAM: "Team", DREAM: "Dream", CHALLENGE: "Chall." } as Partial<Record<BoardLane, string>>)[l] ?? l;
    // 달 이름 자리(px) — 오른쪽 끝에서 넘치면 끝에 붙이고, 그 밑에 깔리는 다이아몬드는 빼서 반쪽이 삐져나오지 않게
    const months = b.months.map((m) => {
        const name = monthName(m.month, m.year);
        const wPx = labelPx(name) + 8;
        const left = Math.min(m.x * area + 3, area - wPx);
        return { ...m, name, left, right: left + wPx };
    });
    const ticks = b.ticks.filter((x) => !months.some((m) => x * area > m.left - 6 && x * area < m.right + 6));

    return (
        <div ref={ref} className="mb-3 overflow-hidden rounded-2xl" data-testid="tour-board"
            style={{ background: "radial-gradient(ellipse 100% 90% at 50% 30%, #146B48 0%, #0C4A31 65%, #083624 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
            {w > 0 && (
                <>
                    {/* 레일 — 나무 + 주마다 다이아몬드, 달 이름 */}
                    <div className="relative flex" style={{ height: RAIL_H, background: "linear-gradient(180deg, #6B4428 0%, #4A2D18 100%)", boxShadow: "inset 0 -2px 0 #2E1B0D" }}>
                        <div className="shrink-0" style={{ width: LANE_W }} />
                        <div className="relative flex-1 mr-2.5">
                            {ticks.map((x) => (
                                <span key={x} aria-hidden className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45"
                                    style={{ left: `${x * 100}%`, background: "#EDE3C8", boxShadow: "0 0 0 1px #2E1B0D55" }} />
                            ))}
                            {months.map((m) => (
                                <span key={`${m.year}-${m.month}`} className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1 text-[12px] font-bold leading-none tabular-nums"
                                    style={{ left: m.left, color: IVORY }}>
                                    {m.name}
                                </span>
                            ))}
                        </div>
                    </div>
                    {/* 줄 */}
                    <div className="relative py-1.5">
                        {b.lanes.map((lane, li) => {
                            const bars = b.bars.filter((x) => x.lane === lane);
                            return (
                                <div key={lane} className="flex items-center" style={{ height: LANE_H, borderTop: li ? "1px solid #FFFFFF12" : undefined }}>
                                    <div className="shrink-0 truncate pl-3 text-[12px] font-semibold" style={{ width: LANE_W, color: "#F6F1E3D9" }}>
                                        {laneName(lane)}
                                    </div>
                                    <div className="relative h-full flex-1 mr-2.5">
                                        {bars.map((bar, i) => (
                                            <Bar key={`${bar.event.startDate}-${i}`} bar={bar} area={area} next={bars[i + 1]?.from ?? 1}
                                                label={text(boardLabel(bar.event, locale))} locale={locale} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {/* 오늘 — 큐 끝처럼 얇은 흰 선 */}
                        <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LANE_W, right: 10 }}>
                            <div className="absolute inset-y-0 w-0 border-l-[1.5px] border-dashed" style={{ left: `${b.todayX * 100}%`, borderColor: "#FFFFFFB3" }} />
                        </div>
                    </div>
                    <p className="flex items-center gap-1.5 px-3 pb-2.5 text-[12px] font-medium" style={{ color: "#F6F1E3B3" }}>
                        <span aria-hidden className="inline-block h-3 w-0 border-l-[1.5px] border-dashed" style={{ borderColor: "#FFFFFFB3" }} />{L.today}
                        <span aria-hidden className="mx-1">·</span>
                        <span aria-hidden className="inline-block h-[7px] w-[7px] rotate-45" style={{ background: "#EDE3C8" }} />{L.boardWeek}
                        <span className="ml-auto tabular-nums">{L.boardWeeks(weeks)}</span>
                    </p>
                </>
            )}
        </div>
    );
}

function Bar({ bar, area, next, label, locale }: { bar: BoardBar; area: number; next: number; label: string; locale: Locale }) {
    const ball = BALL[bar.lane];
    const barPx = (bar.to - bar.from) * area;
    const spot = labelSpot(label, barPx, (next - bar.to) * area);
    const e = bar.event;
    const aria = `${e.title} · ${rangeLabel(e.startDate, e.endDate, locale)}`;
    const radius = `${bar.cutL ? 2 : 7}px ${bar.cutR ? 2 : 7}px ${bar.cutR ? 2 : 7}px ${bar.cutL ? 2 : 7}px`;
    const inner = (
        <>
            <span className="absolute top-1/2 flex h-[22px] -translate-y-1/2 items-center justify-center overflow-hidden"
                style={{
                    left: 0, right: 0, background: ball.bg, borderRadius: radius,
                    boxShadow: ball.ring ? `inset 0 0 0 1.5px ${ball.ring}` : bar.live ? "0 0 0 2px #FFFFFF66, 0 1px 2px rgba(0,0,0,0.3)" : "0 1px 2px rgba(0,0,0,0.3)",
                }}>
                {spot === "in" && <span className="whitespace-nowrap px-1 text-[12px] font-bold leading-none" style={{ color: ball.fg }}>{label}</span>}
            </span>
            {spot === "right" && (
                <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-[12px] font-semibold leading-none" style={{ left: "100%", color: IVORY }}>{label}</span>
            )}
        </>
    );
    const style = { left: `${bar.from * 100}%`, width: `${(bar.to - bar.from) * 100}%` };
    const cls = "absolute inset-y-0 block min-w-[6px]";
    return e.href
        ? <Link href={e.href} aria-label={aria} className={cls} style={style} data-testid="tour-board-bar">{inner}</Link>
        : <a href={e.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={aria} className={cls} style={style} data-testid="tour-board-bar">{inner}</a>;
}
