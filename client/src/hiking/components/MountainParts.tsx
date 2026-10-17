/**
 * 등산 화면의 조각(2026-10-13) — 산 한 줄(MountainRow) · 날씨 띠(MountainWeather) · 가입 안내(HikingCta) · 사실 칩(Fact).
 * 글은 shared/hikingPage 의 것을 쓴다(검색용 화면과 같은 글).
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideChevronRight } from "@/lib/icons";
import { WX_LABEL, type CourseWeather, type WxHalf } from "@shared/golfWeather";
import { heightText, hikingMountainPath, mountainPlace } from "@shared/hikingMountains";
import { HIKING_CTA, WEATHER_NOTE, kmRange } from "@shared/hikingPage";
import { SUN_NOTE, kstClock, kstYmd, spanText, sunLine, sunTimes } from "@shared/hikingSun";
import { SUMMIT_WX_COPY, summitFirstDay, summitWx, type SummitBase } from "@shared/hikingSummitWx";
import { obsAdvice, windArrowDeg, windChill, windDirKo, type MountObs } from "@shared/hikingMountObs";
import { mountainWeatherKey, type MountainSummary } from "../lib/api";
import { MountainPatch } from "../stamps/MountainPatch";

/** 작은 산 그림 — 목록의 앞머리 */
export function Peak({ height, done, size = 34 }: { height: number | null; done?: boolean; size?: number }) {
    const snow = (height ?? 0) >= 1200;
    return (
        <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="shrink-0">
            <circle cx="17" cy="17" r="17" fill={done ? "#F28C6A2E" : "#FFFFFF0F"} />
            <path d="M6 25 L15 9 L19.5 16 L22.5 12 L28 25 Z" fill={done ? "#F28C6A" : "#7FA39A"} stroke="#0B1F26" strokeWidth="1" strokeLinejoin="round" />
            {snow && <path d="M12.6 13.2 L15 9 L17.4 12.8 L16 12 L14.6 13.4 Z" fill="#FFF6E3" />}
        </svg>
    );
}

export function MountainRow({ m, km, done }: { m: MountainSummary; km?: number; done?: boolean }) {
    const facts = [heightText(m.heightM), mountainPlace(m), m.courses > 0 ? `코스 ${m.courses}개 ${kmRange(m.minKm, m.maxKm)}` : ""].filter(Boolean).join(" · ");
    return (
        <Link href={hikingMountainPath(m.slug)} className="flex min-h-[58px] items-center gap-3 py-2 active:opacity-70" data-testid={`mountain-row-${m.slug}`}>
            {/* 100대 명산은 그 산의 와펜을 앞머리에 — 오른 산은 산호빛 점을 붙인다 */}
            {m.lists.includes("kfs100") ? (
                <span className="relative shrink-0">
                    <MountainPatch id={m.id} region={m.region} size={36} earned={!!done} preview />
                    {done && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#F28C6A]" style={{ boxShadow: "0 0 0 2px #0B1F26" }} aria-hidden />}
                </span>
            ) : <Peak height={m.heightM} done={done} />}
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15.5px] font-semibold text-[#F4EFE3]">{m.name}</span>
                    {m.lists.includes("kfs100") && <span className="shrink-0 rounded-full bg-[#F6D9A824] px-1.5 py-0.5 text-[12px] leading-none text-[#F6D9A8]">100대 명산</span>}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-[#F4EFE399]">{facts}</span>
            </span>
            {km != null && <span className="shrink-0 text-[13px] tabular-nums text-[#F4EFE38C]">{km}km</span>}
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
        </Link>
    );
}

const WET = ["rain", "sleet", "snow", "shower"];
/** 하늘 그림 — 해 · 구름 · 비 · 눈(작은 선 그림. 글자 그림을 쓰지 않는다 — 기기마다 모양이 다르다) */
function Sky({ h, size = 22 }: { h: WxHalf | null; size?: number }) {
    if (!h) return <span className="block" style={{ width: size, height: size }} />;
    const k = h.kind;
    const cloud = k !== "clear";
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
            {(k === "clear" || k === "partly") && <circle cx={k === "partly" ? 8 : 11} cy={k === "partly" ? 8 : 11} r={k === "partly" ? 4 : 5} fill="#F6D9A8" />}
            {cloud && <path d="M6.5 16.5 a3.6 3.6 0 0 1 0.6-7.1 a4.6 4.6 0 0 1 8.8 0.9 a3.1 3.1 0 0 1-0.3 6.2 Z" fill={WET.includes(k) ? "#8FA9B3" : "#C9D6DA"} />}
            {(k === "rain" || k === "shower" || k === "sleet") && <path d="M8 18 l-1 2.6 M12 18 l-1 2.6 M16 18 l-1 2.6" stroke="#8EC5FF" strokeWidth="1.5" strokeLinecap="round" />}
            {(k === "snow" || k === "sleet") && <g fill="#FFFFFF"><circle cx="8" cy="19.4" r="1.1" /><circle cx="14.5" cy="19.6" r="1.1" /></g>}
        </svg>
    );
}
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 산의 날씨 — 오늘부터 이레. 정상 좌표의 격자 예보다(산 위는 더 춥다는 한 줄을 붙인다) */
export function MountainWeather({ slug }: { slug: string }) {
    // summit: 정상의 날씨를 어림할 바탕(정상 · 들머리의 높이) — 서버가 들머리를 구한 산에만 붙는다. 그때 예보는 들머리 자리의 것이다
    const { data, isLoading } = useQuery<(CourseWeather & { summit?: SummitBase | null; obs?: MountObs | null }) | null>({ queryKey: mountainWeatherKey(slug), staleTime: 10 * 60_000 });
    if (isLoading) return <div className="h-[104px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />;
    if (!data?.days?.length) {
        // 예보는 못 받았어도 산 위에서 잰 값이 있으면 그것만이라도
        if (data?.obs) return <div data-testid="mountain-weather"><MountainObsCard obs={data.obs} /></div>;
        return <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14px] text-[#F4EFE399]">지금은 날씨를 받아 오지 못했어요.</p>;
    }
    const days = data.days.slice(0, 7);
    const today = days[0], rest = days.slice(1);
    const temps = days.flatMap((d) => [d.tmx, d.tmn]).filter((v): v is number => v != null);
    const lo = temps.length ? Math.min(...temps) : 0, hi = temps.length ? Math.max(...temps) : 1;
    const at = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;
    const popOf = (d: (typeof days)[number]) => Math.max(d.am?.pop ?? 0, d.pm?.pop ?? 0);
    const wetOf = (d: (typeof days)[number]) => !!((d.am && WET.includes(d.am.kind)) || (d.pm && WET.includes(d.pm.kind)));
    const words = [today.am, today.pm].filter(Boolean).map((h) => WX_LABEL[h!.kind]);
    return (
        <div data-testid="mountain-weather">
            {/* 오늘 — 크게 */}
            <div className="flex items-center gap-4 rounded-2xl px-4 py-4" style={{ background: "linear-gradient(135deg,#1F556073,#0E2A33)", boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="weather-today">
                <span className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl bg-[#FFFFFF14]" role="img" aria-label={words.join(" → ")}><Sky h={today.pm ?? today.am} size={44} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-[#F6D9A8]">오늘 · 산 아래</p>
                    <p className="mt-0.5 text-[26px] font-semibold tabular-nums leading-none text-[#F4EFE3]">
                        {today.tmx != null ? `${Math.round(today.tmx)}°` : "–"}<span className="ml-1.5 text-[17px] font-normal text-[#F4EFE380]">{today.tmn != null ? `${Math.round(today.tmn)}°` : ""}</span>
                    </p>
                    <p className="mt-1 truncate text-[13.5px] text-[#F4EFE3CC]">{words.filter((w, i, arr) => arr.indexOf(w) === i).join(" → ") || "예보 준비 중"}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[12.5px] text-[#F4EFE399]">비 올 확률</p>
                    <p className="mt-0.5 text-[20px] font-semibold tabular-nums leading-none" style={{ color: wetOf(today) ? "#8EC5FF" : "#F4EFE3" }}>{popOf(today) > 0 ? `${popOf(today)}%` : "0%"}</p>
                </div>
            </div>
            {data.obs && <MountainObsCard obs={data.obs} />}
            {data.summit && <SummitWeather hours={data.hours ?? []} heightM={data.summit.heightM} baseM={data.summit.baseM} />}
            {/* 엿새 — 한 줄씩, 기온의 폭을 막대로 */}
            {rest.length > 0 && (
                <ul className="mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-4" data-testid="weather-days">
                    {rest.map((d, i) => {
                        // 날짜 글자의 요일 — 그날 낮 12시(UTC)의 요일이 곧 그 달력 날짜의 요일이다
                        const dow = DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                        const pop = popOf(d), wet = wetOf(d);
                        const l = d.tmn != null ? at(d.tmn) : 0, r = d.tmx != null ? at(d.tmx) : 100;
                        return (
                            <li key={d.date} className={`flex h-11 items-center gap-2.5 ${i ? "border-t border-[#FFFFFF14]" : ""}`}>
                                <span className="w-7 shrink-0 text-[14px]" style={{ color: dow === "일" ? "#FF9C8A" : dow === "토" ? "#8EC5FF" : "#F4EFE3" }}>{dow}</span>
                                <span className="flex w-7 shrink-0 justify-center" role="img" aria-label={[d.am, d.pm].filter(Boolean).map((h) => WX_LABEL[h!.kind]).join(" → ")}><Sky h={d.pm ?? d.am} /></span>
                                <span className="w-9 shrink-0 text-right text-[12.5px] tabular-nums" style={{ color: wet ? "#8EC5FF" : "#F4EFE366" }}>{pop > 0 ? `${pop}%` : "–"}</span>
                                <span className="w-8 shrink-0 text-right text-[13.5px] tabular-nums text-[#F4EFE399]">{d.tmn != null ? `${Math.round(d.tmn)}°` : ""}</span>
                                <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-[#FFFFFF14]" aria-hidden>
                                    {d.tmn != null && d.tmx != null && <span className="absolute inset-y-0 rounded-full" style={{ left: `${l}%`, right: `${100 - r}%`, minWidth: 6, background: "linear-gradient(90deg,#8EC5FF,#F6D9A8 55%,#F28C6A)" }} />}
                                </span>
                                <span className="w-8 shrink-0 text-[13.5px] tabular-nums text-[#F4EFE3]">{d.tmx != null ? `${Math.round(d.tmx)}°` : "–"}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{WEATHER_NOTE}</p>
        </div>
    );
}

/** 바람이 불어 가는 쪽을 가리키는 화살 — 북이 위 */
function WindArrow({ deg }: { deg: number }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden style={{ transform: `rotate(${deg}deg)` }} className="shrink-0">
            <path d="M8 14 V3 M4 7 L8 3 L12 7" fill="none" stroke="#F6D9A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/**
 * 산 위 관측 · 지금(2026-10-17) — 산림청 산악기상관측소의 실측(10분마다). 이름과 시군이 둘 다 맞는 산에만 서버가 붙인다(shared/hikingMountObs).
 * 어림한 정상 날씨(SummitWeather)와 섞지 않는다 — 관측소 이름 · 잰 때를 그대로 적는다.
 */
function MountainObsCard({ obs }: { obs: MountObs }) {
    const k = new Date(Date.parse(obs.at) + 9 * 3600_000);
    const hhmm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
    const ago = Math.max(0, Math.round((Date.now() - Date.parse(obs.at)) / 60_000));
    const chill = windChill(obs.temp, obs.wind);
    const deg = windArrowDeg(obs.windDir);
    const tip = obsAdvice(obs);
    return (
        <div className="mt-2.5 rounded-2xl px-4 pb-3.5 pt-3.5" style={{ background: "linear-gradient(160deg,#16303A,#0E2A33 70%)", boxShadow: "inset 0 0 0 1px #F28C6A33" }} data-testid="mountain-obs">
            <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F28C6A] opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F28C6A]" />
                </span>
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#F4EFE3]">산 위에서 잰 날씨 <span className="font-normal text-[#F4EFE399]">· 지금</span></p>
                <p className="shrink-0 text-[12.5px] tabular-nums text-[#F4EFE399]">{hhmm}{ago >= 1 ? ` · ${ago}분 전` : ""}</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#FFFFFF0A] px-2 py-2.5 text-center">
                    <p className="text-[12px] text-[#F6D9A8]">기온</p>
                    <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{obs.temp != null ? `${Math.round(obs.temp * 10) / 10}°` : "–"}</p>
                    <p className="mt-1.5 text-[12px] tabular-nums text-[#8EC5FF]">{chill != null && obs.temp != null && chill < obs.temp ? `체감 ${Math.round(chill)}°` : "\u00A0"}</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF0A] px-2 py-2.5 text-center">
                    <p className="text-[12px] text-[#F6D9A8]">바람</p>
                    <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none text-[#F4EFE3]">
                        {obs.wind != null ? obs.wind.toFixed(1) : "–"}<span className="ml-0.5 text-[12.5px] font-normal text-[#F4EFE399]">m/s</span>
                    </p>
                    <p className="mt-1.5 flex items-center justify-center gap-1 truncate text-[12px] text-[#F4EFE3B3]">{deg != null && <WindArrow deg={deg} />}{windDirKo(obs.windDir) ?? "\u00A0"}</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF0A] px-2 py-2.5 text-center">
                    <p className="text-[12px] text-[#F6D9A8]">습도</p>
                    <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{obs.humidity != null ? `${Math.round(obs.humidity)}%` : "–"}</p>
                    <p className="mt-1.5 text-[12px] tabular-nums text-[#F4EFE399]">{obs.rain != null && obs.rain > 0 ? `강수 ${obs.rain}mm` : "\u00A0"}</p>
                </div>
            </div>
            {tip && <p className="mt-2.5 rounded-xl bg-[#F28C6A1F] px-3 py-2 text-[13px] leading-snug text-[#F6D9A8] break-keep" data-testid="mountain-obs-tip">{tip}</p>}
            <p className="mt-2 text-[12px] leading-snug text-[#F4EFE366] break-keep">{obs.station} 관측소에서 10분마다 잰 값이에요 · 산림청 국립산림과학원 산악기상정보</p>
        </div>
    );
}

/**
 * 정상의 날씨(2026-10-13 오너: "날씨에 정상에서의 날씨 추가 · 시간 3개 정도는 정상 온도") — 새벽 6시 · 낮 12시 · 오후 3시의 정상 기온.
 * 잰 값이 아니라 산 아래 예보를 높이 차만큼 낮춰 **어림한 값**이다(shared/hikingSummitWx) — 각주에 셈을 그대로 적는다.
 * 높이 차를 모르거나 작으면, 또는 시간별 예보가 없으면 그리지 않는다.
 */
function SummitWeather({ hours, heightM, baseM }: { hours: CourseWeather["hours"]; heightM: number | null; baseM: number | null }) {
    const wx = summitWx(hours, { heightM, baseM, nowMs: Date.now() });
    const [pick, setPick] = useState<string | null>(null);
    if (!wx) return null;
    const day = wx.days.find((d) => d.date === pick) ?? wx.days[summitFirstDay(wx.days)];
    return (
        <div className="mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-4 pb-3.5 pt-3.5" data-testid="summit-weather">
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[14px] font-semibold text-[#F4EFE3]">
                    <span className="mr-1 text-[#F28C6A]" aria-hidden>▲</span>{SUMMIT_WX_COPY.title} <span className="font-normal tabular-nums text-[#F4EFE399]">{wx.heightM.toLocaleString("ko-KR")}m</span>
                </p>
                {wx.days.length > 1 && (
                    <div className="flex shrink-0 rounded-full bg-[#FFFFFF0F] p-[3px]" role="tablist" aria-label="날짜">
                        {wx.days.map((d) => {
                            const on = d.date === day.date;
                            return (
                                <button key={d.date} type="button" role="tab" aria-selected={on} onClick={() => setPick(d.date)} data-testid={`summit-day-${d.label}`}
                                    className={`h-7 rounded-full px-2.5 text-[12.5px] ${on ? "bg-[#F6D9A8] font-semibold text-[#2A1208]" : "text-[#F4EFE399] active:text-[#F4EFE3]"}`}>{d.label}</button>
                            );
                        })}
                    </div>
                )}
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-2" role="tabpanel">
                {day.slots.map((s) => (
                    <li key={s.hour} className="rounded-xl bg-[#0E2A33] px-2 py-3 text-center" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid={`summit-slot-${s.hour}`}>
                        <p className="text-[12.5px] text-[#F6D9A8]">{s.label}</p>
                        {s.tmp == null ? (
                            <p className="mt-2 pb-[22px] text-[13px] text-[#F4EFE366]">{SUMMIT_WX_COPY.passed}</p>
                        ) : (
                            <>
                                <span className="mt-1.5 flex justify-center" role="img" aria-label={s.kind ? WX_LABEL[s.kind] : undefined}><Sky h={s.kind ? { kind: s.kind, pop: s.pop ?? 0 } : null} size={24} /></span>
                                <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{s.tmp}°</p>
                                <p className="mt-1.5 text-[12px] tabular-nums text-[#F4EFE399]">
                                    {s.feel != null && s.feel < s.tmp ? <span className="text-[#8EC5FF]">{SUMMIT_WX_COPY.feel} {s.feel}°</span> : <>{SUMMIT_WX_COPY.below} {s.below}°</>}
                                </p>
                                <p className="mt-0.5 text-[12px] tabular-nums text-[#F4EFE366]">{s.wsd != null ? `바람 ${Math.round(s.wsd)}m/s` : "\u00A0"}</p>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            <p className="mt-2.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{SUMMIT_WX_COPY.note(wx.riseM, wx.dropC)}</p>
        </div>
    );
}

/** 가입 안내 — 방문자에게는 가입 단추, 회원에게는 '곧 열려요' 한 줄 */
export function HikingCta({ className }: { className?: string }) {
    const { member, isLoading } = useAuth();
    const [, setLocation] = useLocation();
    if (isLoading) return null;
    return (
        <div className={`rounded-2xl px-4 py-4 ${className ?? ""}`} style={{ background: "linear-gradient(135deg,#1F5560,#0E2A33)", boxShadow: "inset 0 0 0 1px #FFFFFF1A" }} data-testid="hiking-cta">
            <p className="text-[16.5px] font-semibold text-[#F4EFE3] break-keep">{HIKING_CTA.title}</p>
            <p className="mt-1.5 text-[13.5px] leading-snug text-[#F4EFE3B3] break-keep">{member ? HIKING_CTA.member : HIKING_CTA.body}</p>
            {!member && (
                <button type="button" onClick={() => goLogin(setLocation)} data-track-as="hiking-join" className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]">
                    {HIKING_CTA.button}
                </button>
            )}
        </div>
    );
}

export const Fact = ({ children }: { children: string }) => <span className="rounded-full bg-[#0B1F2699] px-2.5 py-1 text-[12.5px] text-[#F4EFE3] backdrop-blur-sm" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF24" }}>{children}</span>;

/**
 * 오늘 해 뜨는 시각 · 지는 시각(2026-10-13) — 날씨 띠 아래의 한 줄. 정상의 자리와 오늘 날짜로 셈한다(shared/hikingSun — 밖에 묻지 않는다).
 * 해 지기 전에 내려오라는 안전의 말이다. 자리를 모르는 산에는 그리지 않는다.
 */
export function SunToday({ lat, lng }: { lat: number | null; lng: number | null }) {
    const now = Date.now();
    const st = lat != null && lng != null ? sunTimes(kstYmd(now), lat, lng) : null;
    if (!st) return null;
    // 해의 길 — 왼쪽 끝이 해 뜸, 오른쪽 끝이 해 짐. 지금의 해가 그 위 어디쯤인지 놓는다
    const W = 300, H = 104, X0 = 26, X1 = 274, BASE = 78, RY = 58;
    const f = Math.min(1, Math.max(0, (now - st.rise) / Math.max(1, st.set - st.rise)));
    const up = now >= st.rise && now <= st.set;
    const at = (t: number): [number, number] => { const a = Math.PI * (1 - t); return [(X0 + X1) / 2 + Math.cos(a) * ((X1 - X0) / 2), BASE - Math.sin(a) * RY]; };
    const arc = (t0: number, t1: number) => Array.from({ length: 25 }, (_, i) => at(t0 + ((t1 - t0) * i) / 24)).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const [sx, sy] = at(f);
    const left = (st.set - now) / 60_000;
    const state = !up ? (now < st.rise ? `해 뜨기까지 ${spanText((st.rise - now) / 60_000)}` : "오늘 해는 졌어요") : `해 지기까지 ${spanText(left)}`;
    return (
        <div className="mt-2.5 rounded-2xl px-4 pb-3.5 pt-3" style={{ background: "linear-gradient(180deg,#F6D9A814,#FFFFFF0A)", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="mountain-sun">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14.5px] font-semibold text-[#F4EFE3]">오늘의 해</p>
                <p className="text-[13px] tabular-nums" style={{ color: up && left <= 120 ? "#F28C6A" : "#F6D9A8" }} data-testid="mountain-sun-state">{state}</p>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`오늘 ${sunLine(st)}`} style={{ display: "block", width: "100%" }} className="mt-1">
                <defs><linearGradient id="hk-sun-day" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F6D9A8" stopOpacity="0.3" /><stop offset="100%" stopColor="#F6D9A8" stopOpacity="0" /></linearGradient></defs>
                {/* 지나온 낮 */}
                {up && <path d={`${arc(0, f)} L${sx.toFixed(1)} ${BASE} L${X0} ${BASE} Z`} fill="url(#hk-sun-day)" />}
                <path d={arc(0, 1)} fill="none" stroke="#F4EFE3" strokeOpacity="0.28" strokeWidth="1.6" strokeDasharray="2 5" strokeLinecap="round" />
                {up && <path d={arc(0, f)} fill="none" stroke="#F6D9A8" strokeWidth="2.4" strokeLinecap="round" />}
                <path d={`M8 ${BASE} H${W - 8}`} stroke="#F4EFE3" strokeOpacity="0.3" strokeWidth="1.2" />
                {/* 산 능선(장식) */}
                <path d={`M8 ${BASE} L60 ${BASE - 13} L92 ${BASE - 5} L138 ${BASE - 21} L176 ${BASE - 7} L222 ${BASE - 16} L262 ${BASE - 4} L${W - 8} ${BASE} Z`} fill="#0B1F26" fillOpacity="0.55" />
                <circle cx={X0} cy={BASE} r="3.4" fill="#F6D9A8" /><circle cx={X1} cy={BASE} r="3.4" fill="#F28C6A" />
                {up && (<><circle cx={sx} cy={sy} r="13" fill="#F6D9A8" opacity="0.22" /><circle cx={sx} cy={sy} r="7" fill="#F6D9A8" stroke="#FFF6E3" strokeWidth="1.6" /></>)}
                <text x={X0} y={H - 5} textAnchor="middle" fontSize="12.5" fill="#F4EFE3" fillOpacity="0.72">해 뜸</text>
                <text x={X1} y={H - 5} textAnchor="middle" fontSize="12.5" fill="#F4EFE3" fillOpacity="0.72">해 짐</text>
            </svg>
            <div className="-mt-1 flex items-end justify-between">
                <span className="text-[19px] font-semibold tabular-nums text-[#F4EFE3]">{kstClock(st.rise)}</span>
                <span className="pb-0.5 text-[12.5px] tabular-nums text-[#F4EFE399]">낮 {spanText((st.set - st.rise) / 60_000)}</span>
                <span className="text-[19px] font-semibold tabular-nums text-[#F4EFE3]">{kstClock(st.set)}</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{SUN_NOTE}</p>
        </div>
    );
}
