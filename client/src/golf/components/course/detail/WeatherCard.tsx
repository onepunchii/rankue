/**
 * 골프장 날씨 — 라운드 브리핑(2026-10-05).
 *
 * 처음 판(같은 날 오전): 기상청 예보를 날짜별·시간별로 그대로 보여 줬다. 정확했지만 일반 날씨 앱과 같았다.
 * 오너: "골퍼들이 좋아할 만한 UI/UX" → 제안 → "응 진행". 골퍼가 궁금한 건 '오늘 날씨'가 아니라
 * **내 티오프부터 끝날 때까지** 어떤가, 뭘 챙기나, 해는 언제 지나 — 그래서 날짜 다음에 티오프 시각을 고르게 하고
 * 그 라운드 다섯 시간(여섯 칸)만 잘라 전반·후반으로 보여 준다. 위에 한 줄 평, 아래에 챙길 것과 해.
 *   · 한 줄 평·챙길 것은 규칙이다(shared/golfRoundBrief) — 늘 근거 숫자(비·바람·기온)를 같이 적는다. 점수·AI 없음.
 *   · 로그인한 사람이 이 골프장에서 치는 티타임(내가 올린 조인·확정된 신청)이 있으면 그 날·그 시각으로 맞춰 연다.
 *   · 자료는 그대로 기상청 단기예보(그 골프장의 5km 격자, 오늘~3일 뒤 — 나흘째는 세 시간 간격)와 중기예보(권역·시군).
 *     넓은 지역 예보는 시간별이 없어 아래 열흘 목록에만 한 줄로 나온다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";
import { LucideChevronLeft, LucideChevronRight, LucideMoon, LucideSunHorizon, LucideWind } from "@/lib/icons";
import {
    WIND_LEVEL, baseLabel, dayPop, daySky, dowOf, kstParts, sunTimes,
    type CourseWeather, type WxDay, type WxHour, type WxKind,
} from "@shared/golfWeather";
import {
    PART_TEE_HOUR, briefReason, lastTee18, nearestTee, partOfHour, roundBrief, teeHours, type RoundBrief,
} from "@shared/golfRoundBrief";
import { WX_RAIN, WxIcon, popColor } from "../TeeWx";
import { Card, Section, Skel } from "./ui";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const RAIN = WX_RAIN;

/** 강수량 글을 좁은 칸에 맞게 — "1.0mm" → "1mm", "1mm 미만" → "~1mm", "50.0mm 이상" → "50mm+" */
const pcpShort = (s: string) => s.replace(/\.0/g, "").replace(/^(\S+?)\s*미만$/, "~$1").replace(/^(\S+?)\s*이상$/, "$1+");
/** 골프에서 바람이 일이 되는 선 — 8m/s 부터 색을 준다(단계 예보는 '강함') */
const windy = (d: { wsd: number | null; wq?: number }) => (d.wsd != null ? d.wsd >= 8 : (d.wq ?? 0) >= 3);
const dowColor = (dow: number) => (dow === 0 ? "#FF7A7A" : dow === 6 ? "#7FB2FF" : undefined);
const pad = (n: number) => String(n).padStart(2, "0");

function dayName(date: string, today: string): string {
    if (date === today) return "오늘";
    const [y, m, d] = today.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    const tomorrow = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    return date === tomorrow ? "내일" : DOW[dowOf(date)];
}
const md = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;
const hourOf = (h: WxHour) => +h.t.slice(8, 10);
/** 해 뜨기 전·해 진 뒤인 시각인가 — 그 한 시간의 대부분이 어두우면 밤 */
function nightAt(hr: number, sun: { rise: string; set: string } | null): boolean {
    if (!sun) return hr < 6 || hr >= 19;
    const riseH = +sun.rise.slice(0, 2) + (+sun.rise.slice(3) > 30 ? 1 : 0);
    const setH = +sun.set.slice(0, 2) + (+sun.set.slice(3) > 30 ? 1 : 0);
    return hr < riseH || hr >= setH;
}

// ── 시간 칸 ───────────────────────────────────────────────────────
function HourCols({ hours, sun, anyPcp }: { hours: WxHour[]; sun: { rise: string; set: string } | null; anyPcp: boolean }) {
    return (
        <>
            {hours.map((h) => {
                const hr = hourOf(h);
                const wind = h.wsd != null ? `${Math.round(h.wsd)}m/s` : h.wq ? WIND_LEVEL[h.wq] : "";
                return (
                    <li key={h.t} className="flex-1 min-w-0 flex flex-col items-center py-1">
                        <span className="text-[12px] tabular-nums text-[#FFFFFF73]">{hr}시</span>
                        <WxIcon kind={h.kind} night={nightAt(hr, sun)} className="mt-2 w-[22px] h-[22px]" />
                        <span className="mt-2 text-[15px] font-semibold tabular-nums text-white">{h.tmp != null ? `${h.tmp}°` : "–"}</span>
                        <span className="mt-1.5 text-[12px] font-medium tabular-nums" style={{ color: popColor(h.pop) }}>{h.pop != null ? `${h.pop}%` : "–"}</span>
                        {anyPcp && <span className="mt-0.5 h-[18px] text-[12px] tabular-nums whitespace-nowrap" style={{ color: RAIN }}>{h.pcp ? pcpShort(h.pcp) : ""}</span>}
                        <span className={cn("mt-1 text-[12px] tabular-nums whitespace-nowrap", windy(h) ? "text-[#FF9F0A] font-medium" : "text-[#FFFFFF59]")}>{wind}</span>
                    </li>
                );
            })}
        </>
    );
}

// ── 라운드 브리핑 ─────────────────────────────────────────────────
/** 한 줄 평 옆 그림 — 바람·밤은 그 그림, 나머지는 라운드 중 하늘(비·눈이 있으면 그것) */
function BriefIcon({ b }: { b: RoundBrief }) {
    const cls = "w-11 h-11 shrink-0";
    if (b.tone === "wind") return <LucideWind weight="bold" className={cls} style={{ color: "#FF9F0A" }} aria-hidden />;
    if (b.tone === "night") return <LucideMoon weight="fill" className={cls} style={{ color: "#C9D1FF" }} aria-hidden />;
    if (b.wet) return <WxIcon kind={b.wet} className={cls} />;
    const count: Partial<Record<WxKind, number>> = {};
    for (const h of b.hours) count[h.kind] = (count[h.kind] ?? 0) + 1;
    const kind = (["clear", "partly", "cloudy"] as WxKind[]).reduce((best, k) => ((count[k] ?? 0) > (count[best] ?? 0) ? k : best), "clear" as WxKind);
    return <WxIcon kind={b.tone === "good" ? "clear" : kind} className={cls} />;
}

function Brief({ b, sun }: { b: RoundBrief; sun: { rise: string; set: string } | null }) {
    const anyPcp = b.hours.some((h) => h.pcp);
    const back = b.hours.length - b.frontCount;
    return (
        <>
            <div className="px-5 pt-1 flex items-center gap-3.5">
                <BriefIcon b={b} />
                <div className="min-w-0">
                    <p className="text-[21px] leading-tight font-bold tracking-tight text-white break-keep">{b.verdict}</p>
                    <p className="mt-1.5 text-[14px] text-[#FFFFFFB3] tabular-nums break-keep">{briefReason(b)}</p>
                </div>
            </div>
            <ul className="mt-4 px-3 flex">
                <HourCols hours={b.hours} sun={sun} anyPcp={anyPcp} />
            </ul>
            {/* 전반·후반 — 칸 수대로 폭을 나눈다(한 시간 간격이면 셋·셋, 세 시간 간격이면 하나·하나) */}
            <div className="mt-1.5 px-4 flex gap-2 text-[12px] text-[#FFFFFF59]" aria-hidden>
                <span className="pt-1.5 border-t border-[#FFFFFF24] text-center" style={{ flex: b.frontCount }}>전반 9홀</span>
                {back > 0 && <span className="pt-1.5 border-t border-[#FFFFFF24] text-center" style={{ flex: back }}>후반 9홀</span>}
            </div>
            {b.gear.length > 0 && (
                <div className="mt-4 px-5 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 text-[12.5px] text-[#FFFFFF66]">챙길 것</span>
                    {b.gear.map((g) => (
                        <span key={g} className="h-7 px-2.5 rounded-full bg-[#FFFFFF0F] text-[12.5px] font-medium text-[#FFFFFFCC] inline-flex items-center whitespace-nowrap">{g}</span>
                    ))}
                </div>
            )}
        </>
    );
}

/** 해 — 골프 말로. 라운드가 해 진 뒤까지 가면 마지막 티 시각에 색을 준다 */
function SunRow({ sun, dusk }: { sun: { rise: string; set: string }; dusk: boolean }) {
    return (
        <p className="mx-5 mt-4 pt-3 border-t border-[#FFFFFF0F] flex items-start gap-1.5 text-[13px] leading-relaxed text-[#FFFFFF80] tabular-nums break-keep">
            <LucideSunHorizon weight="fill" className="mt-[3px] w-4 h-4 shrink-0 text-[#FFC43D99]" aria-hidden />
            <span>
                해 뜸 {sun.rise} · 해 짐 {sun.set} · <span className={dusk ? "text-[#FFC43D] font-medium" : undefined}>18홀은 {lastTee18(sun.set)} 전에 티오프</span>
            </span>
        </p>
    );
}

// ── 열흘 ──────────────────────────────────────────────────────────
function DayRow({ day, today, active, onPick }: { day: WxDay; today: string; active: boolean; onPick?: () => void }) {
    const pop = dayPop(day);
    const dow = dowOf(day.date);
    const body = (
        <>
            <span className="w-[62px] shrink-0 flex items-baseline gap-1.5">
                <span className="text-[15px] font-medium" style={{ color: dowColor(dow) ?? "#FFFFFFE6" }}>{dayName(day.date, today)}</span>
                <span className="text-[12px] tabular-nums text-[#FFFFFF59]">{md(day.date)}</span>
            </span>
            <span className="w-[54px] shrink-0 flex items-center gap-1.5" aria-label={daySky(day)}>
                {day.am ? <WxIcon kind={day.am.kind} className="w-5 h-5" /> : <span className="w-5 text-center text-[12px] text-[#FFFFFF33]">–</span>}
                {day.pm ? <WxIcon kind={day.pm.kind} className="w-5 h-5" /> : <span className="w-5 text-center text-[12px] text-[#FFFFFF33]">–</span>}
            </span>
            <span className="w-[44px] shrink-0 text-right text-[13px] font-medium tabular-nums" style={{ color: popColor(pop) }}>{pop != null ? `${pop}%` : ""}</span>
            <span className="flex-1 min-w-0 text-right text-[15px] tabular-nums">
                <span className="text-[#FFFFFF73]">{day.tmn != null ? `${day.tmn}°` : "–"}</span>
                <span className="mx-1.5 text-[#FFFFFF33]">/</span>
                <span className="font-semibold text-white">{day.tmx != null ? `${day.tmx}°` : "–"}</span>
            </span>
        </>
    );
    const cls = "w-full h-[46px] px-5 flex items-center gap-2 text-left";
    return (
        <li>
            {onPick
                ? <button type="button" onClick={onPick} aria-pressed={active} className={cn(cls, "transition-colors", active ? "bg-[#FFFFFF0A]" : "active:bg-[#FFFFFF0A]")}>{body}</button>
                : <div className={cls}>{body}</div>}
        </li>
    );
}

export function WeatherSkeleton() {
    return (
        <Section id="weather" title="날씨">
            <Card className="p-5">
                <div aria-hidden>
                    <div className="flex gap-2"><Skel className="h-9 w-16 rounded-full" /><Skel className="h-9 w-16 rounded-full" /><Skel className="h-9 w-12 rounded-full" /></div>
                    <Skel className="mt-5 h-11 w-2/3" />
                    <Skel className="mt-5 h-[104px]" />
                </div>
            </Card>
        </Section>
    );
}

const chip = (on: boolean) => cn(
    "shrink-0 h-9 rounded-full text-[14px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-35",
    on ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]",
);

export interface MyTee { id: string; datetime: string }

export function WeatherCard({ wx, myTees }: { wx: CourseWeather; myTees?: MyTee[] }) {
    const today = kstDateKey(new Date());
    const short = useMemo(() => wx.days.filter((d) => d.src === "short"), [wx.days]);
    const hoursOf = (date: string) => { const ymd = date.replace(/-/g, ""); return wx.hours.filter((h) => h.t.startsWith(ymd)); };

    // 내 티타임 — 시간별 예보가 있는 날(앞 나흘)의 것만. 그 시각의 예보가 있어야 맞춰 줄 수 있다.
    const mine = useMemo(() => (myTees ?? []).map((t) => {
        const k = kstParts(Date.parse(t.datetime));
        return { id: t.id, date: k.key, hour: k.h, label: `${pad(k.h)}:${pad(k.min)}` };
    }).filter((m) => short.some((d) => d.date === m.date) && teeHours(hoursOf(m.date)).length > 0), [myTees, short, wx.hours]); // eslint-disable-line react-hooks/exhaustive-deps

    /** 그 날 처음 잡아 줄 티오프 — 오늘은 지금부터 가장 가까운 부(없으면 지금), 다른 날은 1부 */
    const defaultTee = (date: string): number => {
        const avail = teeHours(hoursOf(date));
        if (!avail.length) return PART_TEE_HOUR[1];
        if (date !== today) return nearestTee(avail, PART_TEE_HOUR[1])!;
        return [PART_TEE_HOUR[1], PART_TEE_HOUR[2], PART_TEE_HOUR[3]].find((h) => avail.includes(h)) ?? avail[0];
    };
    const firstDay = short[0]?.date ?? wx.days[0].date;
    const [picked, setPicked] = useState<string>(() => mine[0]?.date ?? firstDay);
    const [tee, setTee] = useState<number>(() => mine[0]?.hour ?? defaultTee(mine[0]?.date ?? firstDay));
    // 자정을 넘기거나 새 예보에서 고른 날이 사라지면 첫 날로
    useEffect(() => { if (!short.some((d) => d.date === picked)) { setPicked(firstDay); setTee(defaultTee(firstDay)); } }, [wx.base, today]); // eslint-disable-line react-hooks/exhaustive-deps
    // 내 티타임은 상세가 온 뒤에 올 수 있다 — 아직 아무것도 고르지 않았을 때만 그리로 옮긴다
    const [touched, setTouched] = useState(false);
    // 티오프 시각을 **직접** 골랐나. 안 골랐으면 날을 바꿀 때 그 날의 기본(1부)으로 — 저녁에 열면 오늘은 17시가 잡히는데,
    // 그걸 내일로 끌고 가면 내일이 '야간 라운드'로 열린다.
    const [teeChosen, setTeeChosen] = useState(() => !!mine[0]);
    const mineKey = mine.map((m) => m.id).join(",");
    useEffect(() => { if (!touched && mine[0]) { setPicked(mine[0].date); setTee(mine[0].hour); setTeeChosen(true); } }, [mineKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const day = wx.days.find((d) => d.date === picked && d.src === "short") ?? short[0] ?? wx.days[0];
    const dayHours = useMemo(() => hoursOf(day.date), [wx.hours, day.date]); // eslint-disable-line react-hooks/exhaustive-deps
    const avail = useMemo(() => teeHours(dayHours), [dayHours]);
    const teeSel = nearestTee(avail, tee);
    const sun = useMemo(() => sunTimes(wx.at.lat, wx.at.lng, day.date), [wx.at.lat, wx.at.lng, day.date]);
    const brief = teeSel != null ? roundBrief(dayHours, teeSel, sun) : null;
    const idx = teeSel != null ? avail.indexOf(teeSel) : -1;
    const mineHere = mine.find((m) => m.date === day.date && nearestTee(avail, m.hour) === teeSel) ?? null;
    const firstMid = wx.days.findIndex((d) => d.src === "mid");

    const pickDay = (date: string) => {
        setTouched(true); setPicked(date);
        setTee(teeChosen ? (nearestTee(teeHours(hoursOf(date)), tee) ?? defaultTee(date)) : defaultTee(date));
    };
    const pickPart = (p: 1 | 2 | 3) => { setTouched(true); const h = nearestTee(avail.filter((x) => partOfHour(x) === p), PART_TEE_HOUR[p]); if (h != null) { setTee(h); setTeeChosen(true); } };
    const step = (d: -1 | 1) => { setTouched(true); const h = avail[idx + d]; if (h != null) { setTee(h); setTeeChosen(true); } };

    return (
        <Section
            id="weather" title="날씨"
            aside={<span className="shrink-0 text-[12px] text-[#FFFFFF66] tabular-nums">기상청 · {baseLabel(wx.base)} 발표</span>}
        >
            <Card className="pt-4 pb-4 overflow-hidden">
                {mine.length > 0 && (
                    <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {mine.map((m) => {
                            const on = mineHere?.id === m.id;
                            return (
                                <button
                                    key={m.id} type="button" aria-pressed={on} onClick={() => { setTouched(true); setPicked(m.date); setTee(m.hour); setTeeChosen(true); }}
                                    className={cn(
                                        "shrink-0 h-9 px-3.5 rounded-full text-[14px] inline-flex items-center gap-1.5 transition-colors",
                                        on ? "bg-[#FFC43D] text-[#1F1500] font-semibold" : "bg-[#FFC43D14] text-[#FFD266] font-medium ring-1 ring-inset ring-[#FFC43D4D]",
                                    )}
                                >
                                    내 티타임
                                    <span className="tabular-nums">{dayName(m.date, today)} {m.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {short.length > 1 && (
                    <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist" aria-label="날짜">
                        {short.map((d) => {
                            const on = d.date === day.date;
                            return (
                                <button key={d.date} type="button" role="tab" aria-selected={on} onClick={() => pickDay(d.date)} className={cn(chip(on), "px-3.5")}>
                                    {dayName(d.date, today)}
                                    <span className={cn("text-[12px] tabular-nums", on ? "text-[#0A0A0A99]" : "text-[#FFFFFF59]")}>{md(d.date)}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {teeSel != null && brief ? (
                    <>
                        {/* 티오프 시각 — 부를 누르면 그 부의 대표 시각, 옆 화살표로 한 칸씩(나흘째는 세 시간씩) */}
                        <div className="px-4 pb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                            {([1, 2, 3] as const).map((p) => (
                                <button
                                    key={p} type="button" aria-pressed={partOfHour(teeSel) === p} onClick={() => pickPart(p)}
                                    disabled={!avail.some((h) => partOfHour(h) === p)} className={cn(chip(partOfHour(teeSel) === p), "px-3")}
                                >
                                    {p}부
                                </button>
                            ))}
                            <div className="ml-auto h-9 px-0.5 rounded-full bg-[#FFFFFF0F] inline-flex items-center" role="group" aria-label="티오프 시각">
                                <button type="button" onClick={() => step(-1)} disabled={idx <= 0} aria-label="더 이른 시각" className="w-7 h-8 rounded-full flex items-center justify-center text-[#FFFFFFB3] disabled:opacity-30 active:bg-[#FFFFFF1A]">
                                    <LucideChevronLeft weight="bold" className="w-4 h-4" />
                                </button>
                                {/* 내 티타임을 고른 채면 그 시각 그대로(08:40) — 예보는 그 시(8시)부터 본다 */}
                                <span className="min-w-[66px] px-0.5 text-center text-[13.5px] font-semibold text-white tabular-nums whitespace-nowrap" aria-live="polite">{mineHere ? mineHere.label : `${teeSel}시`} 티오프</span>
                                <button type="button" onClick={() => step(1)} disabled={idx < 0 || idx >= avail.length - 1} aria-label="더 늦은 시각" className="w-7 h-8 rounded-full flex items-center justify-center text-[#FFFFFFB3] disabled:opacity-30 active:bg-[#FFFFFF1A]">
                                    <LucideChevronRight weight="bold" className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <Brief b={brief} sun={sun} />
                    </>
                ) : dayHours.length > 0 ? (
                    // 오늘 라운드 시간이 다 지났다(19시 넘어 열었다) — 한 줄 평 없이 남은 시간만
                    <>
                        <p className="px-5 text-[14px] text-[#FFFFFF99]">오늘 라운드 시간은 지났어요. 남은 시간 예보예요.</p>
                        <ul className="mt-3 px-3 flex"><HourCols hours={dayHours.slice(0, 6)} sun={sun} anyPcp={dayHours.slice(0, 6).some((h) => h.pcp)} /></ul>
                    </>
                ) : null}
                {sun && <SunRow sun={sun} dusk={!!brief?.dusk} />}
            </Card>

            {wx.days.length > 1 && (
                <Card className="mt-2.5 py-1.5 overflow-hidden">
                    <ul className="divide-y divide-[#FFFFFF0A]">
                        {wx.days.map((d, i) => (
                            <Fragment key={d.date}>
                                {i === firstMid && firstMid > 0 && (
                                    <li className="px-5 pt-3 pb-1.5 text-[12px] text-[#FFFFFF59] break-keep" aria-hidden>
                                        여기부터는 넓은 지역 예보예요{wx.midArea ? ` · ${wx.midArea}` : ""}
                                    </li>
                                )}
                                <DayRow day={d} today={today} active={d.date === day.date} onPick={d.src === "short" ? () => pickDay(d.date) : undefined} />
                            </Fragment>
                        ))}
                    </ul>
                </Card>
            )}
            <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-[#FFFFFF59] break-keep">
                자료: 기상청 단기·중기예보.{wx.approx ? ` 골프장 좌표가 없어 ${wx.approx} 기준으로 보여 드려요.` : " 앞 나흘은 이 골프장 자리(5km 격자) 예보예요."} 한 줄 평은 비·바람·기온으로 정해요.
            </p>
        </Section>
    );
}
