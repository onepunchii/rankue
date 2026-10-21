/**
 * /hiking/trails/:route/:key — 코리아둘레길 코스 한 곳(2026-10-21).
 * 위에서부터: 길 이름 · 코스 이름 · 붙은 말(예약노선 · 우회로) → 거리 · 시간 · 난이도 · 오르막 → 코스 지도(등산의 CourseMap — 앞 · 뒤 코스는 옅게, 누르면 그 코스)
 * → 높낮이 → 시작 · 끝(길찾기) → 시작점 날씨 → 코스 소개 · 볼거리(두루누비 글 그대로) → 코스 근처 볼거리(관광공사 사진) → 가는 길 → 근처 축제 → 앞 · 뒤 코스 → GPX · 출처.
 * 글은 받은 그대로(지어 쓰지 않는다) · 선은 두루누비 GPX 를 줄인 것. ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideChevronRight, LucideNavigation } from "@/lib/icons";
import { canOpenInApp, openInAppBrowser } from "@/lib/openOutside";
import type { LinePoint } from "@shared/hikingGeo";
import { festivalWeatherDays, kstToday } from "@shared/festivals";
import { TRAILS_PATH, TRAILS_SOURCE, TRAIL_LEVEL_NAME, trailCoursePath, trailCourseSeo, trailRoutePath, trailRouteOf, trailTimeShort } from "@shared/koreaTrails";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { CourseMap } from "../components/CourseMap";
import { CourseProfile } from "../components/CourseParts";
import type { MountainCourse } from "../lib/api";
import { NearbyFestivalList, HIKING_FESTIVAL_TONE } from "@/festivals/components/NearbyFestivalList";
import { WeatherDays } from "@/festivals/components/WeatherDays";
import { trailCardUrl } from "@shared/ogCards";
import { TRAIL_SPOT_CREDIT } from "@shared/trailSpots";
import { shortCourseName } from "./TrailParts";
import { trailCourseKey, trailWeatherKey, type TrailCourseData, type TrailWeather } from "./api";
import { TrailStampCard } from "./TrailStamp";

const kakaoRoute = (name: string, lat: number, lng: number) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
const outside = (url: string) => async (e: React.MouseEvent) => { if (canOpenInApp()) { e.preventDefault(); await openInAppBrowser(url); } };
/** 둘레길 코스 → 등산의 코스 지도가 받는 꼴 */
const asCourse = (id: string, seq: number, line: number[][], km: number, loop: boolean, gainM = 0, maxM = 0): MountainCourse => {
    const pts = line as unknown as LinePoint[];
    const eles = pts.map((p) => p[2]);
    return { id, seq, km, gainM, lossM: 0, minM: eles.length ? Math.min(...eles) : 0, maxM: maxM || (eles.length ? Math.max(...eles) : 0), loop, summitKm: null, line: pts };
};
function Lines({ text }: { text: string }) {
    return <div className="space-y-1.5">{text.split(/\n+/).map((l, i) => <p key={i} className="text-[14.5px] leading-relaxed text-[#F4EFE3E6] break-keep">{l.replace(/^-\s*/, "· ")}</p>)}</div>;
}

export default function TrailCoursePage() {
    const [, params] = useRoute("/hiking/trails/:route/:key");
    const routeId = params?.route ?? "", key = decodeURIComponent(params?.key ?? "");
    const route = trailRouteOf(routeId);
    const [, setLocation] = useLocation();
    const { data, isLoading, isError } = useQuery<TrailCourseData>({ queryKey: trailCourseKey(routeId, key), enabled: !!route && !!key, staleTime: 60 * 60_000, retry: 1 });
    const wx = useQuery<TrailWeather | null>({ queryKey: trailWeatherKey(routeId, key), enabled: !!data, staleTime: 10 * 60_000, retry: 0 });
    const [open, setOpen] = useState(false);
    const c = data?.course;
    const seo = c ? trailCourseSeo(c) : null;
    useSeo(seo && c ? { title: seo.title, description: seo.desc, path: seo.path, image: trailCardUrl("https://www.rankue.co.kr", c.route, c.key) } : null);

    if (!route || isError || (!isLoading && !c)) {
        return (
            <HikingShell title="코리아둘레길" backTo={TRAILS_PATH}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[17px] font-semibold text-[#F4EFE3]">없는 코스예요</p>
                    <Link href={TRAILS_PATH} className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#F28C6A] px-5 text-[15px] font-semibold text-[#2A1208]">코리아둘레길 보기</Link>
                </div>
            </HikingShell>
        );
    }
    if (!c || !data) {
        return <HikingShell title={route.name} backTo={trailRoutePath(route.id)}><div className="space-y-4 px-5 pt-5" aria-busy="true"><HkSkel className="h-24" /><HkSkel className="h-[360px]" /><HkSkel className="h-40" /></div></HikingShell>;
    }

    const courses = [asCourse(c.id, 0, c.line, c.km, c.loop, c.gainM, c.maxM), ...(data.prev ? [asCourse(data.prev.id, 1, data.prev.line, data.prev.km, data.prev.loop)] : []), ...(data.next ? [asCourse(data.next.id, 2, data.next.line, data.next.km, data.next.loop)] : [])];
    const sideOf = (id: string) => (data.prev?.id === id ? data.prev : data.next?.id === id ? data.next : null);
    const today = kstToday();
    const wxDays = wx.data?.days?.length ? festivalWeatherDays(wx.data.days, { start: today, end: "99991231" }) : [];
    const stats: [string, string][] = [["거리", `${c.km}km`], ["시간", trailTimeShort(c.minutes) || "—"], ["난이도", c.level ? TRAIL_LEVEL_NAME[c.level] : "—"], ["오르막", `${c.gainM.toLocaleString("en-US")}m`]];
    const reserve = c.tags.some((t) => t.includes("예약"));

    return (
        <HikingShell title={c.name} backTo={trailRoutePath(route.id)}>
            <article data-testid="trail-course-page">
                <header className="px-5 pt-5">
                    <Link href={trailRoutePath(route.id)} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium active:opacity-70" style={{ color: route.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: route.color }} />{route.name}
                    </Link>
                    <h1 className="mt-1 text-[27px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{shortCourseName(c)}</h1>
                    <p className="mt-1 text-[14px] text-[#F4EFE3B3] break-keep">{[c.sigun, c.loop ? "순환 코스" : "한 방향 코스", ...c.tags].filter(Boolean).join(" · ")}</p>
                    {reserve && <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed break-keep" style={{ background: "#F28C6A26", color: "#F6B08F" }}>예약해야 걸을 수 있는 코스예요 — 걷기 전에 두루누비에서 예약 방법을 확인해 주세요.</p>}
                    <div className="mt-4 grid grid-cols-4 rounded-2xl bg-[#FFFFFF0A] py-3" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF12" }} data-testid="trail-stats">
                        {stats.map(([l, v]) => (
                            <div key={l} className="text-center">
                                <div className="whitespace-nowrap text-[17px] font-semibold tabular-nums leading-none tracking-tight text-[#F4EFE3]">{v}</div>
                                <div className="mt-1.5 text-[12px] text-[#F4EFE399]">{l}</div>
                            </div>
                        ))}
                    </div>
                    {/* 코스 도장 — 두 끝에서 위치 확인(shared/trailStamps). 등산이 막힌 회원에게는 없다 */}
                    <TrailStampCard c={c} />
                </header>

                <HkSection title="코스 지도" aside="위가 북쪽 · 참고용">
                    <CourseMap courses={courses} index={0} pois={[]} summit={null} here={null} words={{ wide: "앞 · 뒤 코스까지", others: "옅은 선은 앞 · 뒤 코스 — 누르면 그 코스로 가요" }}
                        onPick={(i) => { const s = sideOf(courses[i]?.id ?? ""); if (s) setLocation(trailCoursePath(s.route, s.key)); }} />
                    <CourseProfile line={c.line as unknown as LinePoint[]} className="mt-3" />
                </HkSection>

                <HkSection title="시작 · 끝">
                    <div className="grid grid-cols-2 gap-2">
                        {([["시작", c.startName, c.start], ["끝", c.endName, c.end]] as const).map(([l, name, at]) => (
                            <a key={l} href={kakaoRoute(name ?? `${c.name} ${l}`, at[0], at[1])} target="_blank" rel="noopener noreferrer" onClick={outside(kakaoRoute(name ?? `${c.name} ${l}`, at[0], at[1]))}
                                className="rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3 active:opacity-80" data-testid={`trail-${l === "시작" ? "start" : "end"}`}>
                                <span className="text-[12.5px] text-[#F4EFE399]">{l}</span>
                                <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-[#F4EFE3] break-keep">{name ?? (l === "시작" ? "코스 시작점" : "코스 끝점")}</span>
                                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#F28C6A]"><LucideNavigation weight="bold" className="h-3.5 w-3.5" aria-hidden />길찾기</span>
                            </a>
                        ))}
                    </div>
                </HkSection>

                {wxDays.length > 0 && (
                    <HkSection title="시작점 날씨" aside={wx.data?.area ? `기상청 · ${wx.data.area}` : "기상청 예보"}>
                        <WeatherDays days={wxDays} today={today} accent="#F28C6A" soon="#F6D9A8" text="#F4EFE3" testId="trail-weather" />
                    </HkSection>
                )}

                {(c.summary || c.contents) && (
                    <HkSection title="코스 소개" aside={`글 ${TRAILS_SOURCE}`}>
                        {c.summary && <Lines text={c.summary} />}
                        {c.contents && (
                            <>
                                <p className={`mt-3 whitespace-pre-line text-[15px] leading-[1.75] text-[#F4EFE3E6] break-keep ${open ? "" : "line-clamp-5"}`}>{c.contents}</p>
                                {c.contents.length > 160 && <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 h-10 rounded-xl px-1 text-[14px] font-medium text-[#F6D9A8] active:opacity-70">{open ? "접기" : "더 읽기"}</button>}
                            </>
                        )}
                    </HkSection>
                )}
                {c.tour && <HkSection title="볼거리"><Lines text={c.tour} /></HkSection>}

                {/* 코스 근처 볼거리(10/21) — 관광공사 관광지 가운데 코스 선 2km 안 · 사진(제3유형은 자르지 않는다 — 원본 비율). 누르면 카카오맵 길찾기 */}
                {!!data.spots?.length && (
                    <HkSection title="코스 근처 볼거리" aside="코스 선 2km 안">
                        <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="trail-spots">
                            {data.spots.map((sp) => (
                                <a key={sp.id} href={kakaoRoute(sp.title, sp.lat, sp.lng)} target="_blank" rel="noopener noreferrer" onClick={outside(kakaoRoute(sp.title, sp.lat, sp.lng))}
                                    className="block shrink-0 active:opacity-80" data-track-as="trail-spot" data-testid="trail-spot">
                                    <span className="block overflow-hidden rounded-xl" style={{ background: "#FFFFFF0A" }}>
                                        <img src={sp.thumb ?? sp.image} alt={`${sp.title} 사진`} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-[104px] w-auto max-w-none" />
                                    </span>
                                    <span className="mt-1.5 block max-w-[180px] truncate text-[14.5px] font-semibold text-[#F4EFE3]">{sp.title}</span>
                                    <span className="block text-[12.5px] tabular-nums text-[#F4EFE399]">{sp.dist < 0.5 ? "코스 바로 옆" : `코스에서 ${sp.dist}km`}</span>
                                </a>
                            ))}
                        </div>
                        <p className="mt-2 text-[12px] text-[#F4EFE366] break-keep">{TRAIL_SPOT_CREDIT} 제{data.spots.some((x) => x.lic === "Type3") ? "1 · 3" : "1"}유형 · 누르면 카카오맵 길찾기</p>
                    </HkSection>
                )}
                {c.traveler && <HkSection title="가는 길 · 편의"><Lines text={c.traveler} /></HkSection>}

                {data.festivals.length > 0 && (
                    <HkSection title="코스 근처 축제" aside="20km 안">
                        <NearbyFestivalList items={data.festivals} tone={HIKING_FESTIVAL_TONE} sport="HIKING" />
                    </HkSection>
                )}

                <HkSection title="이어 걷기">
                    <div className="grid grid-cols-2 gap-2">
                        {data.prev ? (
                            <Link href={trailCoursePath(data.prev.route, data.prev.key)} className="flex items-center gap-2 rounded-2xl bg-[#FFFFFF0A] px-3 py-3 active:opacity-80" data-testid="trail-prev">
                                <LucideChevronLeft weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
                                <span className="min-w-0"><span className="block text-[12.5px] text-[#F4EFE399]">앞 코스</span><span className="block truncate text-[14.5px] font-semibold text-[#F4EFE3]">{shortCourseName(data.prev)}</span></span>
                            </Link>
                        ) : <span />}
                        {data.next ? (
                            <Link href={trailCoursePath(data.next.route, data.next.key)} className="flex items-center justify-end gap-2 rounded-2xl bg-[#FFFFFF0A] px-3 py-3 text-right active:opacity-80" data-testid="trail-next">
                                <span className="min-w-0"><span className="block text-[12.5px] text-[#F4EFE399]">다음 코스</span><span className="block truncate text-[14.5px] font-semibold text-[#F4EFE3]">{shortCourseName(data.next)}</span></span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
                            </Link>
                        ) : <span />}
                    </div>
                    <p className="mt-2 text-[12px] text-[#F4EFE366]">공개 자료에 있는 코스끼리 이어요 — 사이의 코스가 빠져 있을 수 있어요</p>
                </HkSection>

                <div className="px-5 pb-6 pt-8">
                    {c.gpx && (
                        <a href={c.gpx} target="_blank" rel="noopener noreferrer" onClick={outside(c.gpx)} className="flex h-12 items-center justify-center rounded-xl bg-[#FFFFFF0D] text-[14.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF17]" data-testid="trail-gpx">GPX 받기(두루누비)</a>
                    )}
                    <p className="mt-4 text-[12px] leading-relaxed text-[#F4EFE366]">자료 {TRAILS_SOURCE} · 거리 · 시간 · 난이도는 두루누비가 적은 값, 오르막은 GPX 로 잰 값이에요.</p>
                </div>
            </article>
        </HikingShell>
    );
}
