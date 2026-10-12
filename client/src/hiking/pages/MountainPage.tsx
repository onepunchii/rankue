/**
 * /hiking/mountains/:slug — 산 한 곳(2026-10-13 오너: "우리가 가장 잘하는 산에 대한 정보를 페이지 만들어서 … 정보 + 가입 유도").
 *
 * 위에서부터: 권역 표지 위의 이름 · 높이 · 위치 → 이 산의 도장(정상에서 받는 것 — 가입으로 가는 길) → 등산 코스(높낮이 · 길의 모양 · 길 위의 지점)
 * → 산의 날씨 → 산 이야기(소개 글) → 가까운 산.
 * 로그인 없이 열린다. 글은 shared/hikingPage · hikingGuide 의 것 — 검색용 화면(server/seo/hiking)과 같다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 형제 key 는 구역마다 다르게.
 */
import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronDown } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { heightText, hikingRegion, hikingRegionPath, mountainPlace } from "@shared/hikingMountains";
import { GUIDE_COURSE_SOURCE, GUIDE_LABEL, GUIDE_NOTE } from "@shared/hikingGuide";
import { HIKING_POI_NAME, hikingPoiTitle, type HikingPoiKind } from "@shared/hikingPois";
import { COURSE_SOURCE_NOTE, COURSE_TIME_NOTE, MOUNTAIN_LABEL, OSM_NOTE, courseFacts, courseShape, listNames, mountainSeo } from "@shared/hikingPage";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { CourseProfile, CourseTrace } from "../components/CourseParts";
import { Fact, HikingCta, MountainRow, MountainWeather } from "../components/MountainParts";
import { SummitStamp, regionInk } from "../stamps/SummitStamp";
import { POI_COLOR, hikingCover } from "../theme";
import { mountainKey, type MountainCourse, type MountainDetail, type MountainPoi } from "../lib/api";

/** 코스의 지점을 처음에 보여 주는 수 */
const POI_FIRST = 6;
/** 길 위의 지점을 고르는 칩 — 갈림길은 수가 많아 맨 뒤 */
const POI_ORDER: readonly HikingPoiKind[] = ["DANGER", "SHELTER", "WILD", "CULTURAL", "GRID", "MARK", "SIGN"];

function CourseCard({ c, pois }: { c: MountainCourse; pois: readonly MountainPoi[] }) {
    const f = courseFacts(c);
    const on = useMemo(() => pois.filter((p) => p.courseId === c.id && p.km != null).sort((a, b) => a.km! - b.km!), [pois, c.id]);
    const kinds = POI_ORDER.filter((k) => on.some((p) => p.kind === k));
    const [kind, setKind] = useState<HikingPoiKind | null>(null);
    const [all, setAll] = useState(false);
    const shown = on.filter((p) => (kind ? p.kind === kind : p.kind !== "SIGN" || on.length <= POI_FIRST));
    const list = all ? shown : shown.slice(0, POI_FIRST);
    return (
        <div className="rounded-2xl bg-[#F4EFE3] p-3.5 text-[#0E2A33]" data-testid={`course-${c.id}`}>
            <ul className="flex divide-x divide-[#0E2A331F] text-center">
                {([[f.km, "거리"], [f.gain, "오르막"], [f.time, "걷는 시간"]] as const).map(([v, k]) => (
                    <li key={k} className="flex-1 px-1">
                        <span className="block text-[17px] font-semibold tabular-nums leading-tight">{v}</span>
                        <span className="text-[12px] text-[#0E2A3399]">{k}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-3"><CourseProfile line={c.line} pois={on} summitKm={c.summitKm} /></div>
            <div className="mt-2 flex items-center gap-3">
                <div className="w-[96px] shrink-0 rounded-xl bg-[#0E2A330D]"><CourseTrace line={c.line} summitKm={c.summitKm} /></div>
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#0E2A33B3]">
                    <p className="text-[14.5px] font-semibold text-[#0E2A33]">{courseShape(c)}</p>
                    <p>해발 {c.minM.toLocaleString("en-US")}~{c.maxM.toLocaleString("en-US")}m</p>
                    <p className="break-keep">흰 점에서 출발해 검은 점까지 · 위가 북쪽{c.summitKm != null ? " · 세모가 정상" : ""}</p>
                </div>
            </div>
            {on.length > 0 && (
                <div className="mt-3 border-t border-[#0E2A331A] pt-3">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="길 위의 지점 고르기">
                        {kinds.map((k) => {
                            const n = on.filter((p) => p.kind === k).length, sel = kind === k;
                            return (
                                <button key={k} type="button" onClick={() => { setKind(sel ? null : k); setAll(false); }} aria-pressed={sel}
                                    className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px]" style={{ background: sel ? "#0E2A33" : "#0E2A3312", color: sel ? "#F4EFE3" : "#0E2A33" }}>
                                    <span className="h-2 w-2 rounded-full" style={{ background: POI_COLOR[k] }} aria-hidden />{HIKING_POI_NAME[k]} {n}
                                </button>
                            );
                        })}
                    </div>
                    {list.length > 0 && (
                        <ul className="mt-2.5">
                            {list.map((p) => (
                                <li key={p.id} className="flex items-center gap-2.5 border-t border-[#0E2A3312] py-2 first:border-t-0">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: POI_COLOR[p.kind] }} aria-hidden />
                                    <span className="min-w-0 flex-1 truncate text-[14px]">{hikingPoiTitle(p)}</span>
                                    <span className="shrink-0 text-[12.5px] tabular-nums text-[#0E2A3399]">{p.km!.toFixed(1)}km{p.altM != null ? ` · ${p.altM.toLocaleString("en-US")}m` : ""}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {shown.length > POI_FIRST && !all && (
                        <button type="button" onClick={() => setAll(true)} className="mt-1 flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-[#0E2A330F] text-[13.5px] text-[#0E2A33]">
                            {shown.length - POI_FIRST}곳 더 보기<LucideChevronDown weight="bold" className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Courses({ d }: { d: MountainDetail }) {
    const [i, setI] = useState(0);
    const c = d.courseList[Math.min(i, d.courseList.length - 1)];
    if (!c) return <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14px] leading-relaxed text-[#F4EFE3B3] break-keep">{MOUNTAIN_LABEL.noCourse}</p>;
    return (
        <div>
            {d.courseList.length > 1 && (
                <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="코스 고르기">
                    {d.courseList.map((x, k) => (
                        <button key={x.id} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)} data-testid={`course-tab-${k + 1}`}
                            className="h-10 shrink-0 rounded-full px-3.5 text-[13.5px]" style={{ background: k === i ? "#F28C6A" : "#FFFFFF14", color: k === i ? "#2A1208" : "#F4EFE3", fontWeight: k === i ? 600 : 400 }}>
                            코스 {x.seq} · {courseFacts(x).km}
                        </button>
                    ))}
                </div>
            )}
            <CourseCard key={`card:${c.id}`} c={c} pois={d.pois} />
            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{COURSE_TIME_NOTE} {COURSE_SOURCE_NOTE}</p>
        </div>
    );
}

function About({ d }: { d: MountainDetail }) {
    const g = d.guide!;
    const [more, setMore] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    const rest = g.sections.length > 1 || g.highlights.length > 0 || !!g.access || g.officialCourses.length > 0 || g.faq.length > 0;
    const H = ({ children }: { children: string }) => <h3 className="text-[13px] font-semibold text-[#F6D9A8]">{children}</h3>;
    const P = ({ children }: { children: string }) => <p className="mt-1.5 text-[15px] leading-[1.7] text-[#F4EFE3D9] break-keep">{children}</p>;
    return (
        <div className="rounded-2xl bg-[#FFFFFF0A] p-4" data-testid="mountain-about" data-open={more ? "1" : "0"}>
            {g.intro && <p className="text-[15px] leading-[1.7] text-[#F4EFE3D9] break-keep">{g.intro}</p>}
            {g.selectionReason && <div className="mt-4 border-t border-[#FFFFFF14] pt-4"><H>{GUIDE_LABEL.why}</H><P>{g.selectionReason}</P></div>}
            {g.sections[0] && <div className="mt-4 border-t border-[#FFFFFF14] pt-4"><H>{g.sections[0].heading}</H><P>{g.sections[0].body}</P></div>}
            {rest && !more && (
                <button type="button" onClick={() => setMore(true)} className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-[#FFFFFF0F] text-[14px] font-medium text-[#F4EFE3CC] active:bg-[#FFFFFF1F]" data-testid="mountain-about-more">
                    {d.name} 이야기 더 보기<LucideChevronDown weight="bold" className="h-4 w-4" aria-hidden />
                </button>
            )}
            {more && (
                <div className="mt-4 space-y-4 border-t border-[#FFFFFF14] pt-4">
                    {g.sections.slice(1).map((s) => <div key={`sec:${s.heading}`}><H>{s.heading}</H><P>{s.body}</P></div>)}
                    {g.highlights.length > 0 && (
                        <div>
                            <H>{GUIDE_LABEL.highlights}</H>
                            <ul className="mt-2 space-y-2">
                                {g.highlights.map((h) => (
                                    <li key={`hl:${h.name}`} className="text-[14.5px] leading-[1.65] text-[#F4EFE3D9] break-keep"><span className="font-semibold text-[#F4EFE3]">{h.name}</span>{h.note ? ` — ${h.note}` : ""}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {g.access && <div><H>{GUIDE_LABEL.access}</H><P>{g.access}</P></div>}
                    {g.officialCourses.length > 0 && (
                        <div>
                            <H>{GUIDE_LABEL.officialCourses}</H>
                            <ul className="mt-2 space-y-2">
                                {g.officialCourses.map((c, k) => (
                                    <li key={`oc:${k}`} className="rounded-xl bg-[#FFFFFF0A] px-3 py-2.5 text-[14px] leading-[1.6] text-[#F4EFE3D9] break-keep">
                                        {c.waypoints.join(" → ")}{c.duration && <span className="ml-1.5 text-[13px] text-[#F6D9A8]">{c.duration}</span>}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-1.5 text-[12.5px] text-[#F4EFE380] break-keep">{GUIDE_COURSE_SOURCE}</p>
                        </div>
                    )}
                    {g.faq.length > 0 && (
                        <div>
                            <H>{GUIDE_LABEL.faq}</H>
                            <ul className="mt-1.5">
                                {g.faq.map((f, k) => (
                                    <li key={`faq:${k}`} className={k ? "border-t border-[#FFFFFF14]" : ""}>
                                        <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} className="flex min-h-11 w-full items-center gap-2 py-2 text-left">
                                            <span className="flex-1 text-[14.5px] font-medium text-[#F4EFE3] break-keep">{f.q}</span>
                                            <LucideChevronDown weight="bold" className={`h-4 w-4 shrink-0 text-[#F4EFE380] transition-transform ${open === k ? "rotate-180" : ""}`} aria-hidden />
                                        </button>
                                        {open === k && <p className="pb-3 text-[14px] leading-[1.65] text-[#F4EFE3B3] break-keep">{f.a}</p>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <p className="text-[12.5px] leading-relaxed text-[#F4EFE373] break-keep">{GUIDE_NOTE}</p>
                </div>
            )}
        </div>
    );
}

export default function MountainPage() {
    const [, params] = useRoute("/hiking/mountains/:slug");
    const slug = params?.slug ? decodeURIComponent(params.slug) : "";
    const { data: d, isLoading, isError } = useQuery<MountainDetail>({ queryKey: mountainKey(slug), enabled: !!slug, retry: false });
    const seo = d ? mountainSeo(d) : null;
    useSeo(seo ? { title: seo.title, description: seo.desc, path: seo.path } : null);
    const region = hikingRegion(d?.region);

    if (isLoading) return <HikingShell title="산"><div className="space-y-4 px-5 pt-5" aria-busy="true"><HkSkel className="h-52" /><HkSkel className="h-28" /><HkSkel className="h-72" /></div></HikingShell>;
    if (isError || !d) {
        return (
            <HikingShell title="산">
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#F4EFE3B3]">없는 산이에요.</p>
                    <a href="/hiking" className="mt-4 inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14px] font-semibold text-[#2A1208]">전국 명산 보기</a>
                </div>
            </HikingShell>
        );
    }
    const lists = listNames(d.lists);
    return (
        <HikingShell title={d.name} backTo={region ? hikingRegionPath(region.id) : undefined}>
            <div data-testid="mountain-page" data-slug={d.slug}>
                {/* 표지 — 권역의 그림 위에 이름. 그림은 장식이다(실제 그 산의 모습이 아니다) */}
                <div className="relative overflow-hidden">
                    <img src={hikingCover(d.region)} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 40%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 18%,#0B1F26CC 62%,#0B1F26F5 97%)" }} aria-hidden />
                    {/* 칩이 두 줄이 되어도 잘리지 않게 높이를 내용에 맡긴다 */}
                    <div className="relative px-5 pb-4 pt-[124px]">
                        {d.guide?.subtitle && <p className="text-[13px] text-[#F6D9A8] break-keep">{d.guide.subtitle}</p>}
                        <h1 className="mt-0.5 text-[30px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{d.name}</h1>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {[heightText(d.heightM) ? `높이 ${heightText(d.heightM)}` : "", mountainPlace(d), ...lists].filter(Boolean).map((t) => <Fact key={`fact:${t}`}>{t}</Fact>)}
                        </div>
                    </div>
                </div>

                {/* 이 산의 도장 — 정상에서 받는 것. 방문자를 가입으로 잇는다 */}
                <div className="px-5 pt-4">
                    <div className="flex items-center gap-3.5 rounded-2xl bg-[#F4EFE3] px-3.5 py-3 text-[#0E2A33]" data-testid="mountain-stamp">
                        <div className="w-[88px] shrink-0"><SummitStamp name={d.name} heightM={d.heightM} ink={regionInk(d.region)} tilt={-4} /></div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] text-[#8A5E00]">{MOUNTAIN_LABEL.stamp}</p>
                            <p className="mt-0.5 text-[15.5px] font-semibold leading-snug break-keep">정상에서 인증하면 {d.name} 도장이 찍혀요</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-[#0E2A3399] break-keep">{region ? `${region.name} 도장첩의 한 칸이에요. 다 채우면 와펜을 받아요.` : "오른 산을 도장으로 모아요."}</p>
                        </div>
                    </div>
                </div>

                <HkSection title={MOUNTAIN_LABEL.courses} aside={d.courseList.length ? `${d.courseList.length}개` : undefined} id="sec-courses">
                    <Courses key={`courses:${d.slug}`} d={d} />
                </HkSection>

                <HkSection title={MOUNTAIN_LABEL.weather} aside="오늘부터 이레" id="sec-weather">
                    <MountainWeather key={`wx:${d.slug}`} slug={d.slug} />
                </HkSection>

                {d.guide && (
                    <HkSection title={MOUNTAIN_LABEL.about} id="sec-about">
                        <About key={`about:${d.slug}`} d={d} />
                    </HkSection>
                )}

                <div className="px-5 pt-8"><HikingCta /></div>

                {d.nearby.length > 0 && (
                    <HkSection title={MOUNTAIN_LABEL.nearby} id="sec-nearby">
                        <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                            {d.nearby.map((m, i) => <li key={`near:${m.id}`} className={i ? "border-t border-[#FFFFFF14]" : ""}><MountainRow m={m} km={m.km} /></li>)}
                        </ul>
                    </HkSection>
                )}

                <p className="px-5 pt-6 text-[12px] leading-relaxed text-[#F4EFE366] break-keep">{OSM_NOTE}</p>
            </div>
        </HikingShell>
    );
}
