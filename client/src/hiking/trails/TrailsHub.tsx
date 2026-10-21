/**
 * /hiking/trails — 코리아둘레길(2026-10-21, 오너 결정: 국토종주는 걸어서 · 등산 안에).
 *
 * 위에서부터: 표지(해안 길의 등대) → 길 고르기 칩 → 둘레길 지도(한반도 둘레의 길 넷 — 고르면 그 길로 당겨 들어가 코스 번호, 선을 누르면 그 코스)
 * → 길 넷(두루누비 공개 코스 수 / 전체) → 처음 걷기 좋은 코스(쉬움 · 짧은 순) → 출처.
 * 공개 자료(170코스)만 그린다 — 빈 데는 '아직 공개되지 않은 코스'라고 적는다. 글은 shared/koreaTrails(검색용 화면과 같다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import { TRAILS_H1, TRAILS_SOURCE, TRAILS_TAGLINE, TRAIL_ROUTES, TRAIL_TOTAL_COURSES, trailCoursePath, trailRoutePath, trailTimeText, trailsHubSeo, type TrailRouteId } from "@shared/koreaTrails";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { TrailMap } from "./TrailMap";
import { TrailSketch, shortCourseName } from "./TrailParts";
import { TRAILS_COVER, TRAILS_KEY, type TrailsData } from "./api";

export default function TrailsHub() {
    const { data, isLoading } = useQuery<TrailsData>({ queryKey: TRAILS_KEY, staleTime: 60 * 60_000 });
    const [, setLocation] = useLocation();
    const [focus, setFocus] = useState<TrailRouteId | null>(null);
    const courses = useMemo(() => (Array.isArray(data?.courses) ? data!.courses : []), [data]);
    const seo = trailsHubSeo({ courses: courses.length || 170 });
    useSeo(data ? { title: seo.title, description: seo.desc, path: seo.path } : null);
    // 처음 걷기 좋은 코스 — 쉬움(1) · 본 코스 · 짧은 순
    const easy = useMemo(() => courses.filter((c) => c.level === 1 && c.sub == null && !c.tags.some((t) => t.includes("예약"))).sort((a, b) => a.km - b.km).slice(0, 10), [courses]);
    const color = (id: TrailRouteId) => TRAIL_ROUTES.find((r) => r.id === id)?.color ?? "#F4EFE3";

    return (
        <HikingShell title="코리아둘레길" backTo="/hiking">
            <div data-testid="trails-hub">
                <div className="relative h-[248px] overflow-hidden">
                    <img src={TRAILS_COVER} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 70%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 30%,#0B1F26F2 96%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-4">
                        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{TRAILS_H1}</h1>
                        <p className="mt-1 text-[14px] text-[#F4EFE3CC] break-keep">{TRAILS_TAGLINE}</p>
                        <p className="mt-2 text-[13px] tabular-nums text-[#F6D9A8]">길 4 · {TRAIL_TOTAL_COURSES}개 코스 · 두루누비 공개 {courses.length || "…"}코스</p>
                    </div>
                </div>

                {isLoading || !data ? (
                    <div className="space-y-4 px-5 pt-6" aria-busy="true"><HkSkel className="h-10" /><HkSkel className="h-[440px]" /><HkSkel className="h-40" /></div>
                ) : (
                    <>
                        <div className="-mx-0 flex gap-1.5 overflow-x-auto px-5 pb-1 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="길 고르기">
                            {[null, ...TRAIL_ROUTES.map((r) => r.id)].map((id) => {
                                const on = focus === id;
                                const r = id ? TRAIL_ROUTES.find((x) => x.id === id)! : null;
                                return (
                                    <button key={id ?? "all"} type="button" onClick={() => setFocus(id)} aria-pressed={on} data-testid="trail-route-chip"
                                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium active:opacity-80"
                                        style={on ? { background: r?.color ?? "#F4EFE3", color: "#0B1F26" } : { background: "#FFFFFF0F", color: "#F4EFE3CC" }}>
                                        {r && <span className="h-2 w-2 rounded-full" style={{ background: on ? "#0B1F26" : r.color }} />}{r?.name ?? "전체"}
                                    </button>
                                );
                            })}
                        </div>

                        <HkSection title="둘레길 지도" aside="선을 누르면 그 코스">
                            <TrailMap courses={courses} focus={focus} numbers onPick={(c) => setLocation(trailCoursePath(c.route, c.key))} />
                            <p className="mt-2.5 text-[12.5px] text-[#F4EFE380] break-keep">선은 두루누비 공개 코스 {courses.length}개 — 빈 데는 아직 공개되지 않은 코스예요</p>
                        </HkSection>

                        <HkSection title="길 넷" aside="공개 코스 / 전체">
                            <div className="space-y-2.5">
                                {data.routes.map((r) => (
                                    <Link key={r.id} href={trailRoutePath(r.id)} className="block rounded-2xl px-4 py-3.5 active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: `inset 3px 0 0 ${r.color}` }} data-testid="trail-route-card">
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="text-[17px] font-semibold" style={{ color: r.color }}>{r.name}</span>
                                            <LucideChevronRight weight="bold" className="h-4 w-4 text-[#F4EFE366]" aria-hidden />
                                        </span>
                                        {r.line && <span className="mt-0.5 block text-[13.5px] text-[#F4EFE3CC] break-keep">{r.line}</span>}
                                        <span className="mt-1 block text-[12.5px] text-[#F4EFE380] break-keep">{r.from} → {r.to} · {r.km.toLocaleString("en-US")}km</span>
                                        <span className="mt-2.5 flex items-center gap-2.5">
                                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#FFFFFF14]"><span className="block h-full rounded-full" style={{ width: `${Math.round((r.have / r.total) * 100)}%`, background: r.color }} /></span>
                                            <span className="shrink-0 text-[12.5px] tabular-nums text-[#F4EFE3B3]">{r.have} / {r.total}코스</span>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </HkSection>

                        {easy.length > 0 && (
                            <HkSection title="처음 걷기 좋은 코스" aside="쉬움 · 짧은 순">
                                <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="trail-easy">
                                    {easy.map((c) => (
                                        <Link key={c.id} href={trailCoursePath(c.route, c.key)} className="block w-[148px] shrink-0 rounded-2xl p-3 active:opacity-80" style={{ background: "#FFFFFF0A" }}>
                                            <TrailSketch coarse={c.coarse} color={color(c.route)} w={124} h={76} />
                                            <span className="mt-2 block truncate text-[12.5px] font-medium" style={{ color: color(c.route) }}>{TRAIL_ROUTES.find((r) => r.id === c.route)?.name}</span>
                                            <span className="block truncate text-[15px] font-semibold text-[#F4EFE3]">{shortCourseName(c)}</span>
                                            <span className="block text-[12.5px] tabular-nums text-[#F4EFE399]">{c.km}km · {trailTimeText(c.minutes)}</span>
                                        </Link>
                                    ))}
                                </div>
                            </HkSection>
                        )}

                        <div className="px-5 pb-6 pt-8">
                            <p className="text-[12px] leading-relaxed text-[#F4EFE366]">자료 {TRAILS_SOURCE} · 코스 선은 두루누비 GPX 를 줄여 그렸어요. 공개 자료에 없는 코스는 두루누비가 공개하면 채워져요.</p>
                        </div>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
