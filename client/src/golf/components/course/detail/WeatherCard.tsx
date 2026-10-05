/**
 * 골프장 날씨(2026-10-05 오너: "기상청 날씨 … 순서대로 하자").
 *
 * 골프장 이름에 붙여 찾는 말 1위가 '날씨'다(네이버 검색량: 날씨 100 · 맛집 30 · 그린피 3) — 그래서 티타임 바로 아래에 둔다.
 * 자료는 기상청 단기예보(그 골프장의 5km 격자, 오늘~3일 뒤)와 중기예보(4~10일 뒤, 권역·시군). 둘은 정밀도가 달라
 * 화면에서도 가른다: 앞 나흘은 고르면 시간별이 펼쳐지고, 그 뒤는 하루 한 줄(오전·오후 하늘 · 강수확률 · 최저·최고)이다.
 * 골퍼가 보는 것만 — 비(확률·양), 바람, 기온, 해 뜨고 지는 시각. 지수·한마디 같은 우리 해석은 얹지 않는다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";
import {
    LucideCloud, LucideCloudMoon, LucideCloudRain, LucideCloudSnow, LucideCloudSun, LucideDrop, LucideMoon, LucideSun, LucideSunHorizon, LucideWind,
} from "@/lib/icons";
import {
    WIND_LEVEL, baseLabel, dayPop, daySky, dowOf, isWet, sunTimes,
    type CourseWeather, type WxDay, type WxHour, type WxKind,
} from "@shared/golfWeather";
import { Card, Section, Skel } from "./ui";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const RAIN = "#4DA3FF";
const KIND_COLOR: Record<WxKind, string> = {
    clear: "#FFC43D", partly: "#E6E6E6", cloudy: "#A6A6A6", rain: RAIN, shower: RAIN, sleet: "#8CC4FF", snow: "#CFE8FF",
};

function WxIcon({ kind, night, className, style }: { kind: WxKind; night?: boolean; className?: string; style?: CSSProperties }) {
    const I = kind === "clear" ? (night ? LucideMoon : LucideSun)
        : kind === "partly" ? (night ? LucideCloudMoon : LucideCloudSun)
        : kind === "cloudy" ? LucideCloud
        : kind === "snow" || kind === "sleet" ? LucideCloudSnow
        : LucideCloudRain;
    const color = night && (kind === "clear" || kind === "partly") ? "#C9D1FF" : KIND_COLOR[kind];
    return <I weight="fill" className={className} style={{ color, ...style }} aria-hidden />;
}

/** 강수확률 색 — 30% 미만은 조용히, 60% 부터는 또렷하게 */
const popColor = (pop: number | null | undefined) => (pop == null || pop < 30 ? "#FFFFFF59" : pop < 60 ? "#8CC4FF" : RAIN);
/** 강수량 글을 좁은 칸에 맞게 — "1.0mm" → "1mm", "1mm 미만" → "~1mm", "50.0mm 이상" → "50mm+" */
const pcpShort = (s: string) => s.replace(/\.0/g, "").replace(/^(\S+?)\s*미만$/, "~$1").replace(/^(\S+?)\s*이상$/, "$1+");
const windText = (d: { wsd: number | null; wq?: number }) => (d.wsd != null ? `${d.wsd}m/s` : d.wq ? WIND_LEVEL[d.wq] : null);
/** 골프에서 바람이 일이 되는 선 — 8m/s 부터 색을 준다(단계 예보는 '강함') */
const windy = (d: { wsd: number | null; wq?: number }) => (d.wsd != null ? d.wsd >= 8 : (d.wq ?? 0) >= 3);
const dowColor = (dow: number) => (dow === 0 ? "#FF7A7A" : dow === 6 ? "#7FB2FF" : undefined);

function dayName(date: string, today: string): string {
    if (date === today) return "오늘";
    const [y, m, d] = today.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
    return date === tomorrow ? "내일" : DOW[dowOf(date)];
}
const md = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;

// ── 고른 날 ───────────────────────────────────────────────────────
function HourStrip({ hours, date, at }: { hours: WxHour[]; date: string; at: { lat: number; lng: number } }) {
    const sun = useMemo(() => sunTimes(at.lat, at.lng, date), [at.lat, at.lng, date]);
    const riseH = sun ? +sun.rise.slice(0, 2) + (+sun.rise.slice(3) > 30 ? 1 : 0) : 6;
    const setH = sun ? +sun.set.slice(0, 2) + (+sun.set.slice(3) > 30 ? 1 : 0) : 18;
    const anyPcp = hours.some((h) => h.pcp);
    // 세 시간 간격인 날(나흘째)은 칸이 몇 개 없다 — 줄을 채워 고르게 편다
    const sparse = hours.length <= 6;
    return (
        <ul className={cn("mt-4 flex overflow-x-auto scrollbar-hide", sparse ? "px-2" : "px-3 gap-0.5")}>
            {hours.map((h) => {
                const hr = +h.t.slice(8, 10);
                const night = hr < riseH || hr >= setH;
                const wind = h.wsd != null ? `${Math.round(h.wsd)}m/s` : h.wq ? WIND_LEVEL[h.wq] : "";
                return (
                    <li key={h.t} className={cn("flex flex-col items-center py-1", sparse ? "flex-1 min-w-[58px]" : "w-[50px] shrink-0")}>
                        <span className="text-[12px] tabular-nums text-[#FFFFFF73]">{hr}시</span>
                        <WxIcon kind={h.kind} night={night} className="mt-2 w-[22px] h-[22px]" />
                        <span className="mt-2 text-[15px] font-semibold tabular-nums text-white">{h.tmp != null ? `${h.tmp}°` : "–"}</span>
                        <span className="mt-1.5 text-[12px] font-medium tabular-nums" style={{ color: popColor(h.pop) }}>{h.pop != null ? `${h.pop}%` : "–"}</span>
                        {anyPcp && <span className="mt-0.5 h-[18px] text-[12px] tabular-nums whitespace-nowrap" style={{ color: RAIN }}>{h.pcp ? pcpShort(h.pcp) : ""}</span>}
                        <span className={cn("mt-1 text-[12px] tabular-nums whitespace-nowrap", windy(h) ? "text-[#FF9F0A] font-medium" : "text-[#FFFFFF59]")}>{wind}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function DayDetail({ day, hours, at }: { day: WxDay; hours: WxHour[]; at: { lat: number; lng: number } }) {
    const sun = useMemo(() => sunTimes(at.lat, at.lng, day.date), [at.lat, at.lng, day.date]);
    const pop = dayPop(day);
    const kind = day.pm && isWet(day.pm.kind) ? day.pm.kind : day.am && isWet(day.am.kind) ? day.am.kind : (day.pm ?? day.am)?.kind ?? "clear";
    const wind = windText(day);
    return (
        <>
            <div className="px-5 pt-1 flex items-center gap-4">
                <WxIcon kind={kind} className="w-11 h-11 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5 tabular-nums">
                        {day.tmx != null && <span className="text-[30px] leading-none font-bold tracking-tight text-white">{day.tmx}°</span>}
                        {day.tmn != null && <span className="text-[17px] font-medium text-[#FFFFFF73]">{day.tmx != null ? "/ " : "최저 "}{day.tmn}°</span>}
                    </p>
                    <p className="mt-1.5 text-[14px] text-[#FFFFFFB3] truncate">{daySky(day)}</p>
                </div>
                <dl className="shrink-0 text-right space-y-1.5">
                    <div className="flex items-center justify-end gap-1.5">
                        <dt className="sr-only">강수확률</dt>
                        <LucideDrop weight="fill" className="w-3.5 h-3.5" style={{ color: popColor(pop) }} aria-hidden />
                        <dd className="text-[14px] font-medium tabular-nums" style={{ color: pop != null && pop >= 30 ? popColor(pop) : "#FFFFFFB3" }}>비 {pop ?? 0}%</dd>
                    </div>
                    {wind && (
                        <div className="flex items-center justify-end gap-1.5">
                            <dt className="sr-only">바람(낮 최대)</dt>
                            <LucideWind weight="bold" className={cn("w-3.5 h-3.5", windy(day) ? "text-[#FF9F0A]" : "text-[#FFFFFF59]")} aria-hidden />
                            <dd className={cn("text-[14px] font-medium tabular-nums", windy(day) ? "text-[#FF9F0A]" : "text-[#FFFFFFB3]")}>{wind}</dd>
                        </div>
                    )}
                </dl>
            </div>
            {hours.length > 0 && <HourStrip hours={hours} date={day.date} at={at} />}
            {sun && (
                <p className="mx-5 mt-3 pt-3 border-t border-[#FFFFFF0F] flex items-center gap-1.5 text-[13px] text-[#FFFFFF80] tabular-nums">
                    <LucideSunHorizon weight="fill" className="w-4 h-4 text-[#FFC43D99]" aria-hidden />
                    해 뜸 {sun.rise} · 해 짐 {sun.set}
                </p>
            )}
        </>
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

export function WeatherCard({ wx }: { wx: CourseWeather }) {
    const today = kstDateKey(new Date());
    const short = wx.days.filter((d) => d.src === "short");
    const [picked, setPicked] = useState<string>(short[0]?.date ?? wx.days[0].date);
    // 자정을 넘기거나 새 예보에서 고른 날이 사라지면 첫 날로
    useEffect(() => { if (!wx.days.some((d) => d.date === picked && d.src === "short")) setPicked(short[0]?.date ?? wx.days[0].date); }, [wx.base, today]); // eslint-disable-line react-hooks/exhaustive-deps
    const day = wx.days.find((d) => d.date === picked) ?? wx.days[0];
    const ymd = day.date.replace(/-/g, "");
    const hours = useMemo(() => {
        const hs = wx.hours.filter((h) => h.t.startsWith(ymd));
        // 라운드하는 시간만(05~21시). 오늘은 남은 시간을 그대로 — 밤에 열어도 지금 날씨는 보여야 한다.
        return day.date === today ? hs : hs.filter((h) => { const hr = +h.t.slice(8, 10); return hr >= 5 && hr <= 21; });
    }, [wx.hours, ymd, day.date, today]);
    const firstMid = wx.days.findIndex((d) => d.src === "mid");

    return (
        <Section
            id="weather" title="날씨"
            aside={<span className="shrink-0 text-[12px] text-[#FFFFFF66] tabular-nums">기상청 · {baseLabel(wx.base)} 발표</span>}
        >
            <Card className="pt-4 pb-4 overflow-hidden">
                {short.length > 1 && (
                    <div className="px-4 pb-4 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist" aria-label="날짜">
                        {short.map((d) => {
                            const on = d.date === day.date;
                            return (
                                <button
                                    key={d.date} type="button" role="tab" aria-selected={on} onClick={() => setPicked(d.date)}
                                    className={cn(
                                        "shrink-0 h-9 px-3.5 rounded-full text-[14px] inline-flex items-center gap-1.5 transition-colors",
                                        on ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]",
                                    )}
                                >
                                    {dayName(d.date, today)}
                                    <span className={cn("text-[12px] tabular-nums", on ? "text-[#0A0A0A99]" : "text-[#FFFFFF59]")}>{md(d.date)}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <DayDetail day={day} hours={hours} at={wx.at} />
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
                                <DayRow day={d} today={today} active={d.date === day.date} onPick={d.src === "short" ? () => setPicked(d.date) : undefined} />
                            </Fragment>
                        ))}
                    </ul>
                </Card>
            )}
            <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-[#FFFFFF59] break-keep">
                자료: 기상청 단기·중기예보.{wx.approx ? ` 골프장 좌표가 없어 ${wx.approx} 기준으로 보여 드려요.` : " 앞 나흘은 이 골프장 자리(5km 격자) 예보예요."}
            </p>
        </Section>
    );
}
