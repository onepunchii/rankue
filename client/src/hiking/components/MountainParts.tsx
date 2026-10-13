/**
 * 등산 화면의 조각(2026-10-13) — 산 한 줄(MountainRow) · 날씨 띠(MountainWeather) · 가입 안내(HikingCta) · 사실 칩(Fact).
 * 글은 shared/hikingPage 의 것을 쓴다(검색용 화면과 같은 글).
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideChevronRight } from "@/lib/icons";
import { WX_LABEL, type CourseWeather, type WxHalf } from "@shared/golfWeather";
import { heightText, hikingMountainPath, mountainPlace } from "@shared/hikingMountains";
import { HIKING_CTA, WEATHER_NOTE, kmRange } from "@shared/hikingPage";
import { SUN_NOTE, kstClock, kstYmd, spanText, sunLine, sunTimes } from "@shared/hikingSun";
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
function Sky({ h }: { h: WxHalf | null }) {
    if (!h) return <span className="block h-[22px] w-[22px]" />;
    const k = h.kind;
    const cloud = k !== "clear";
    return (
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
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
    const { data, isLoading } = useQuery<CourseWeather | null>({ queryKey: mountainWeatherKey(slug), staleTime: 10 * 60_000 });
    if (isLoading) return <div className="h-[104px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />;
    if (!data?.days?.length) return <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14px] text-[#F4EFE399]">지금은 날씨를 받아 오지 못했어요.</p>;
    return (
        <div data-testid="mountain-weather">
            <ul className="flex gap-0.5 overflow-x-auto rounded-2xl bg-[#FFFFFF0A] px-1.5 py-3" style={{ scrollbarWidth: "none" }}>
                {data.days.slice(0, 7).map((d, i) => {
                    // 날짜 글자의 요일 — 그날 낮 12시(UTC)의 요일이 곧 그 달력 날짜의 요일이다
                    const dow = DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                    const wet = (d.am && WET.includes(d.am.kind)) || (d.pm && WET.includes(d.pm.kind));
                    const pop = Math.max(d.am?.pop ?? 0, d.pm?.pop ?? 0);
                    return (
                        <li key={d.date} className="flex min-w-[42px] flex-1 flex-col items-center gap-1 rounded-xl py-1.5" style={{ background: i === 0 ? "#FFFFFF14" : undefined }}>
                            <span className="text-[12.5px] text-[#F4EFE3B3]">{i === 0 ? "오늘" : dow}</span>
                            <span className="flex" role="img" aria-label={[d.am, d.pm].filter(Boolean).map((h) => WX_LABEL[h!.kind]).join(" → ")}><Sky h={d.pm ?? d.am} /></span>
                            <span className="text-[13px] tabular-nums text-[#F4EFE3]">{d.tmx != null ? `${Math.round(d.tmx)}°` : "–"}<span className="text-[#F4EFE380]"> {d.tmn != null ? `${Math.round(d.tmn)}°` : ""}</span></span>
                            <span className="text-[12px] tabular-nums" style={{ color: wet ? "#8EC5FF" : "#F4EFE366" }}>{pop > 0 ? `${pop}%` : "–"}</span>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{WEATHER_NOTE}</p>
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
    const st = lat != null && lng != null ? sunTimes(kstYmd(Date.now()), lat, lng) : null;
    if (!st) return null;
    return (
        <div className="mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-4 py-3" data-testid="mountain-sun">
            <p className="flex items-center gap-2 text-[14px] tabular-nums text-[#F4EFE3]">
                <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0 text-[#F6D9A8]" aria-hidden>
                    <path d="M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M6.5 18a5.5 5.5 0 0 1 11 0" fill="currentColor" />
                    <path d="M12 6.5V9M5.2 9.6l1.7 1.7M18.8 9.6l-1.7 1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="min-w-0 whitespace-nowrap" aria-label={`오늘 ${sunLine(st)}`}>오늘 해 뜸 {kstClock(st.rise)} · 해 짐 {kstClock(st.set)}</span>
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">낮 {spanText((st.set - st.rise) / 60_000)} · {SUN_NOTE}</p>
        </div>
    );
}
