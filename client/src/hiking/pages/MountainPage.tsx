/**
 * /hiking/mountains/:slug — 산 한 곳(2026-10-13 오너: "우리가 가장 잘하는 산에 대한 정보를 페이지 만들어서 … 정보 + 가입 유도").
 *
 * 위에서부터: 권역 표지 위의 이름 · 위치 · 한눈 숫자(높이 · 코스 수 · 가장 짧은 코스) → 이 산의 도장(정상에서 받는 것 — 가입으로 가는 길) → 구역 줄
 * → 등산 코스(높낮이 · 길의 모양 · 길 위의 지점) → 이 산의 사진(회원이 올린 공개 사진 — 누구에게나) → 내 산행 사진(등산을 쓰는 회원만 — 올리기 · 공개/비공개)
 * → 산의 날씨 → 산 이야기(소개 글) → 위치 · 들머리 → 근처 맛집(네이버) → 가까운 산(이 산을 가운데 둔 판 + 목록).
 * 로그인 없이 열린다. 글은 shared/hikingPage · hikingGuide 의 것 — 검색용 화면(server/seo/hiking)과 같다.
 *
 * 2026-10-13 오너: "골프 CC 상세 페이지 기능을 등산에도, 산 상세 페이지에 접목할 수 있는 거 접목해줘" — 골프장 상세(GolfCoursePage)에서 옮긴 것:
 *   공유 단추(머리줄) · "내 위치에서 N km"(기기에서만 센다) · 한눈 숫자 띠 · 붙박이 구역 줄 · 위치(카카오맵 · 길찾기 — 고른 코스의 들머리로)
 *   · 근처 맛집(네이버 지역 검색 — 저장 · 가공 없이 그대로, 검색용 화면에는 없다) · 가까운 산의 판 · 구조화 자료(Mountain)와 권역 카드 그림.
 *   관심 등록 · 알림처럼 등산에 없는 기능은 옮기지 않았다. 셈과 글은 shared/hikingAround.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 형제 key 는 구역마다 다르게.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronDown, LucideChevronRight, LucideLocateFixed, LucideShare2 } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { useToast } from "@/hooks/use-toast";
import { hikingMountainCardUrl } from "@shared/ogCards";
import { heightText, hikingMountainPath, hikingRegion, hikingRegionPath, mountainPlace, sigunguText } from "@shared/hikingMountains";
import { GUIDE_COURSE_SOURCE, GUIDE_LABEL, GUIDE_NOTE } from "@shared/hikingGuide";
import { HIKING_POI_NAME, HIKING_POI_ORDER, dedupeCoursePois, hikingPoiTitle, type HikingPoiKind } from "@shared/hikingPois";
import { SURFACE_COPY, surfaceNote, surfaceShares } from "@shared/hikingSurface";
import { COURSE_MAP_COPY } from "@shared/hikingCourseMap";
import { COURSE_SOURCE_NOTE, COURSE_TIME_NOTE, MOUNTAIN_LABEL, OSM_NOTE, courseFacts, courseShape, courseViaNote, kmRange, listNames, mountainSeo } from "@shared/hikingPage";
import { MOUNTAIN_AROUND_LABEL, MOUNTAIN_SECTIONS, NEARBY_DIAL_MIN, fromMeText, nearbyDialItems, shortestCourse } from "@shared/hikingAround";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { HkSectionNav, hkJumpTo, type HkNavItem } from "../components/HkSectionNav";
import { MountainLocation } from "../components/MountainLocation";
import { MountainNearbyPlaces } from "../components/MountainNearbyPlaces";
import { NearDial } from "../components/NearMe";
import { CourseMap } from "../components/CourseMap";
import { CourseProfile, CourseTrace, SLOPE_COLOR } from "../components/CourseParts";
import { SLOPE_LABEL, compareCourses, courseLevel, courseSlopes, type CourseLevelId } from "@shared/hikingCourseLook";
import { Fact, HikingCta, MountainRow, MountainWeather, SunToday } from "../components/MountainParts";
import { SummitStamp, regionInk } from "../stamps/SummitStamp";
import { SummitCheckin } from "../stamps/SummitCheckin";
import { MountainPatch } from "../stamps/MountainPatch";
import { hikingBookPath } from "../stamps/StampParts";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { trailPath } from "../trail/useTrail";
import { MyPhotos } from "../photos/MyPhotos";
import { WishButton } from "../wish/WishParts";
import { summitReach, summitRewards } from "@shared/hikingStamps";
import { MountainPhotos } from "../photos/MountainPhotos";
import { HIKING_PHOTOS_ANCHOR, HIKING_PHOTO_LABEL } from "@shared/hikingPhotos";
import { stampDate } from "../lib/date";
import { POI_COLOR, SURFACE_COLOR, hikingCover } from "../theme";
import { mountainKey, type MountainCourse, type MountainDetail, type MountainPoi } from "../lib/api";
import { useMyLocation, type MyLocation } from "../lib/useMyLocation";
import { TourPhotos } from "@/components/TourPhotos";
import { festivalDateKo } from "@shared/tourFestivals";

const ORIGIN = "https://www.rankue.co.kr";
/**
 * 구역 줄의 후보 — 순서와 이름은 shared/hikingAround. 줄은 이 가운데 화면에 실제로 있는 구역만 보여 준다(HkSectionNav).
 * '사진'은 이 산의 사진(MountainPhotos 가 그리는 구역 — 사진이 있을 때만)으로, 없으면 내 산행 사진(등산을 쓰는 회원만)으로 간다.
 */
const NAV_ITEMS: readonly HkNavItem[] = MOUNTAIN_SECTIONS.map((s) => (s.id === "photos" ? { ...s, els: ["sec-mountain-photos", HIKING_PHOTOS_ANCHOR] } : s));

/** 코스의 지점을 처음에 보여 주는 수 */
const POI_FIRST = 6;
/** 힘든 정도의 색 — 종이 위의 작은 딱지 */
const LEVEL_STYLE: Readonly<Record<CourseLevelId, { background: string; color: string }>> = {
    easy: { background: "#2F6B4F1F", color: "#245A40" },
    moderate: { background: "#C98A1E26", color: "#7A5208" },
    hard: { background: "#D8492F24", color: "#A2321C" },
};

/** 길 위의 지점을 고르는 칩의 차례 — 조심할 곳 · 채비(들머리 · 주차 · 화장실 · 물) · 쉬고 보는 곳 · 그 밖, 갈림길은 수가 많아 맨 뒤(shared/hikingPois) */
const POI_ORDER = HIKING_POI_ORDER;
/** 처음에는 접어 두는 종류 — 수가 많고 이름이 비슷하다(갈림길 · 쉼터 · 표지). 칩을 누르면 그 종류만 보인다 */
const POI_QUIET: readonly HikingPoiKind[] = ["SIGN", "REST", "MARK", "GRID"];

function CourseCard({ c, pois }: { c: MountainCourse; pois: readonly MountainPoi[] }) {
    const f = courseFacts(c);
    const level = courseLevel(c);
    const slopes = useMemo(() => courseSlopes(c.line), [c.line]);
    const on = useMemo(() => dedupeCoursePois(pois.filter((p) => p.courseId === c.id && p.km != null).sort((a, b) => a.km! - b.km!)), [pois, c.id]);
    const kinds = POI_ORDER.filter((k) => on.some((p) => p.kind === k));
    const [kind, setKind] = useState<HikingPoiKind | null>(null);
    const [all, setAll] = useState(false);
    const shown = on.filter((p) => (kind ? p.kind === kind : !POI_QUIET.includes(p.kind) || on.length <= POI_FIRST));
    const surface = useMemo(() => surfaceShares(c.surface), [c.surface]);
    const surfaceTip = surfaceNote(surface);
    const list = all ? shown : shown.slice(0, POI_FIRST);
    return (
        <div className="overflow-hidden rounded-[20px] bg-[#F4EFE3] text-[#0E2A33]" style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.28)" }} data-testid={`course-${c.id}`}>
            {/* 머리 — 코스의 이름과 힘든 정도 */}
            <div className="flex items-start gap-3 px-4 pb-3 pt-3.5" style={{ background: "linear-gradient(180deg,#E9E2D0,#F4EFE3)" }}>
                <div className="min-w-0 flex-1">
                    <p className="text-[16.5px] font-semibold leading-tight tracking-tight">코스 {c.seq} · {courseShape(c)}</p>
                    <p className="mt-0.5 text-[13px] tabular-nums text-[#0E2A33B3]">해발 {c.minM.toLocaleString("en-US")}~{c.maxM.toLocaleString("en-US")}m</p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold leading-none" style={LEVEL_STYLE[level.id]} title={level.note} data-testid="course-level" data-level={level.id}>{level.label}</span>
            </div>
            {c.via && <p className="px-4 pb-2 text-[13px] leading-snug text-[#8A5E00] break-keep" data-testid="course-via">{courseViaNote(c.via)}</p>}
            {/* 숫자 셋 */}
            <ul className="mx-4 flex divide-x divide-[#0E2A331F] rounded-2xl bg-[#0E2A330A] py-2.5 text-center">
                {([[f.km, "거리", "M4 18 L9 8 L13 14 L16 10 L20 18 Z"], [f.gain, "오르막", "M5 17 L12 6 L19 17 M12 6 V3 M9.5 5.5 L12 3 L14.5 5.5"], [f.time, "걷는 시간(어림)", "M12 4 a8 8 0 1 0 0.01 0 Z M12 8 V12 L15 14"]] as const).map(([v, k, icon]) => (
                    <li key={k} className="flex-1 px-1">
                        <svg width="18" height="18" viewBox="0 0 24 24" className="mx-auto text-[#1F5560]" aria-hidden><path d={icon} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span className="mt-0.5 block whitespace-nowrap text-[16.5px] font-semibold tabular-nums leading-tight">{v}</span>
                        <span className="text-[12px] text-[#0E2A33B3]">{k}</span>
                    </li>
                ))}
            </ul>
            {/* 높낮이 */}
            <div className="px-3 pt-3"><CourseProfile line={c.line} pois={on} summitKm={c.summitKm} /></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-1.5 text-[12px] text-[#0E2A33B3]" aria-label="선의 색">
                {SLOPE_LABEL.map((label, k) => (k === 0 || (k === 1 ? slopes.steepKm > 0 : slopes.veryKm > 0)) && (
                    <span key={label} className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ background: SLOPE_COLOR[k] }} aria-hidden />{label}{k === 1 && slopes.steepKm > 0 ? ` ${slopes.steepKm}km` : k === 2 && slopes.veryKm > 0 ? ` ${slopes.veryKm}km` : ""}</span>
                ))}
            </div>
            {/* 길의 모양과 한눈 사실 */}
            <div className="mt-3 flex items-stretch gap-3 px-4">
                <div className="w-[112px] shrink-0 self-start rounded-2xl bg-[#0E2A330D] p-1" style={{ boxShadow: "inset 0 0 0 1px #0E2A3314" }}><CourseTrace line={c.line} summitKm={c.summitKm} /></div>
                <dl className="min-w-0 flex-1 self-center text-[13px]">
                    {([["내리막", `${slopes.lossM.toLocaleString("en-US")}m`], ["가장 높은 곳", `${c.maxM.toLocaleString("en-US")}m`], ["출발하는 높이", `${Math.round(c.line[0]?.[2] ?? c.minM).toLocaleString("en-US")}m`], ...(c.summitKm != null ? [["정상까지", `${(Math.round(c.summitKm * 10) / 10).toString()}km`]] : [])] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2 border-b border-[#0E2A3312] py-1.5 last:border-b-0">
                            <dt className="text-[#0E2A33B3]">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd>
                        </div>
                    ))}
                </dl>
            </div>
            <p className="px-4 pt-1.5 text-[12px] leading-snug text-[#0E2A33A6] break-keep">흰 점에서 출발해 검은 점까지 · 위가 북쪽{c.summitKm != null ? " · 세모가 정상" : ""}</p>
            {surface.length > 0 && (
                // 어떤 길을 걷나 — 조사한 구간의 종류를 길이의 몫으로. 색 옆에 이름과 퍼센트를 늘 적는다
                <div className="mt-3 border-t border-[#0E2A331A] px-4 pt-3" data-testid="course-surface">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[14.5px] font-semibold">{SURFACE_COPY.title}</p>
                        <p className="shrink-0 text-[12px] text-[#0E2A33A6]">{SURFACE_COPY.source}</p>
                    </div>
                    <div className="mt-2 flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={surface.map((s) => `${s.label} ${s.pct}%`).join(", ")}>
                        {surface.map((s) => <span key={s.id} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${s.pct}%`, minWidth: 3, background: SURFACE_COLOR[s.id] }} />)}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px]">
                        {surface.map((s) => (
                            <li key={s.id} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SURFACE_COLOR[s.id] }} aria-hidden />
                                <span className="text-[#0E2A33CC]">{s.label}</span><span className="font-semibold tabular-nums">{s.pct}%</span>
                            </li>
                        ))}
                    </ul>
                    {surfaceTip && <p className="mt-2 rounded-xl bg-[#0E2A330D] px-3 py-2 text-[13px] leading-snug text-[#0E2A33] break-keep" data-testid="course-surface-tip">{surfaceTip}</p>}
                </div>
            )}
            {on.length > 0 ? (
                <div className="mt-3 border-t border-[#0E2A331A] px-4 pb-3.5 pt-3">
                    <p className="text-[14.5px] font-semibold">길 위에서 만나는 것</p>
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="길 위의 지점 고르기">
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
                        // 걷는 차례대로 — 왼쪽은 출발부터의 거리, 가운데 줄이 길
                        <ol className="relative mt-3" data-testid="course-timeline">
                            <span className="absolute bottom-3 top-3 w-[2px] rounded-full bg-[#0E2A331F]" style={{ left: 55 }} aria-hidden />
                            {list.map((p) => (
                                <li key={p.id} className="relative flex items-center gap-0 py-1.5">
                                    <span className="w-[46px] shrink-0 text-right text-[12.5px] tabular-nums text-[#0E2A33B3]">{p.km!.toFixed(1)}km</span>
                                    <span className="relative z-[1] mx-[5px] h-[10px] w-[10px] shrink-0 rounded-full" style={{ background: POI_COLOR[p.kind], boxShadow: "0 0 0 2.5px #F4EFE3" }} aria-hidden />
                                    <span className="ml-1.5 min-w-0 flex-1 truncate text-[14px]">{hikingPoiTitle(p)}</span>
                                    {p.altM != null && <span className="shrink-0 pl-2 text-[12.5px] tabular-nums text-[#0E2A33B3]">{p.altM.toLocaleString("en-US")}m</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                    {shown.length > POI_FIRST && !all && (
                        <button type="button" onClick={() => setAll(true)} className="mt-1.5 flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-[#0E2A330F] text-[13.5px] text-[#0E2A33]">
                            {shown.length - POI_FIRST}곳 더 보기<LucideChevronDown weight="bold" className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            ) : <div className="h-3.5" />}
        </div>
    );
}

/**
 * 코스 한눈에 견주기(2026-10-19) — 칩을 하나씩 눌러 보던 것(이번 주 검색 방문자 72명이 224번)을 한 판에.
 * 줄마다 작은 높이 그림(모든 코스가 같은 눈금 — 길이 · 오르막이 그림으로 견줘진다) · 거리 · 시간 · 오르막 · 힘든 정도. 줄을 누르면 그 코스.
 */
const COMPARE_FIRST = 5;
const LEVEL_DOT: Readonly<Record<CourseLevelId, string>> = { easy: "#6FBF8F", moderate: "#E4AE45", hard: "#E8694F" };
function CourseCompare({ d, i, onPick }: { d: MountainDetail; i: number; onPick: (i: number) => void }) {
    const rows = useMemo(() => compareCourses(d.courseList, 112, 30), [d.courseList]);
    const [all, setAll] = useState(false);
    const shown = all ? rows : rows.slice(0, Math.max(COMPARE_FIRST, i + 1));
    return (
        <div className="mb-3 overflow-hidden rounded-2xl bg-[#FFFFFF0A]" role="tablist" aria-label="코스 고르기" data-testid="course-compare">
            {shown.map((r) => {
                const c = d.courseList[r.index], f = courseFacts(c), level = courseLevel(c), on = r.index === i;
                return (
                    <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(r.index)} data-testid={`course-tab-${r.index + 1}`}
                        className="block w-full px-3.5 pb-2.5 pt-2 text-left" style={{ background: on ? "#F28C6A1F" : undefined, borderTop: r.index ? "1px solid #FFFFFF10" : undefined, boxShadow: on ? "inset 3px 0 0 #F28C6A" : undefined }}>
                        {/* 윗줄 — 이름 · 힘든 정도 · 꼬리표 */}
                        <span className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-[14px] font-semibold" style={{ color: on ? "#F28C6A" : "#F4EFE3" }}>{c.summitKm != null && <span className="mr-0.5 text-[12px]" aria-label="정상을 지나는 코스">▲</span>}코스 {c.seq}</span>
                            <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-[#F4EFE3B3]"><i aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_DOT[level.id] }} />{level.label}</span>
                            {r.tags.length > 0 && <span className="ml-auto whitespace-nowrap rounded-full bg-[#F2B36A24] px-2 py-0.5 text-[12px] font-semibold text-[#F2B36A]">{r.tags.map((t) => (t === "shortest" ? "가장 짧음" : "오르막 가장 적음")).join(" · ")}</span>}
                        </span>
                        {/* 아랫줄 — 같은 눈금의 높이 그림 · 숫자 */}
                        <span className="mt-1 flex items-end gap-3">
                            <svg viewBox="0 0 112 30" preserveAspectRatio="none" className="h-[30px] min-w-0 flex-1" aria-hidden>
                                <line x1="0" y1="29.5" x2="112" y2="29.5" stroke="#F4EFE31F" vectorEffect="non-scaling-stroke" />
                                <path d={r.area} fill={on ? "#F28C6A40" : "#F4EFE31A"} />
                                <path d={r.path} fill="none" stroke={on ? "#F28C6A" : "#F4EFE3B3"} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                            </svg>
                            {/* 숫자 칸 폭을 고정 — 그림 폭이 줄마다 같아야 같은 눈금이다 */}
                            <span className="w-[124px] shrink-0 whitespace-nowrap text-right leading-tight">
                                <span className="block text-[15px] font-semibold tabular-nums text-[#F4EFE3]">{f.km}</span>
                                <span className="block text-[12px] tabular-nums text-[#F4EFE399]">{f.time.replace("약 ", "")} · ↑{f.gain}</span>
                            </span>
                        </span>
                    </button>
                );
            })}
            {rows.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="flex h-11 w-full items-center justify-center gap-1 text-[13px] font-semibold text-[#F4EFE3CC]" style={{ borderTop: "1px solid #FFFFFF10" }} data-testid="course-compare-more">
                    코스 {rows.length - shown.length}개 더 보기 <LucideChevronDown className="h-4 w-4" />
                </button>
            )}
            <p className="px-3.5 pb-2.5 pt-1 text-[12px] text-[#F4EFE380] break-keep" style={{ borderTop: "1px solid #FFFFFF10" }}>그림은 모든 코스가 같은 눈금이에요 — 넓을수록 길고, 높을수록 많이 올라요.</p>
        </div>
    );
}

/** 코스 구역 — 고른 코스(i)는 산 화면이 들고 있는다: '위치 · 들머리' 구역이 그 코스의 들머리를 쓴다 */
function Courses({ d, canStart, i, onPick, loc }: { d: MountainDetail; canStart?: boolean; i: number; onPick: (i: number) => void; loc: MyLocation }) {
    const c = d.courseList[Math.min(i, d.courseList.length - 1)];
    if (!c) return <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14px] leading-relaxed text-[#F4EFE3B3] break-keep">{MOUNTAIN_LABEL.noCourse}</p>;
    return (
        <div>
            {d.courseList.length > 1 && <CourseCompare d={d} i={i} onPick={onPick} />}
            {/* 코스가 많은 산(북한산 36 · 금정산 37)은 정상을 지나지 않는 길이 더 많다 — 세모의 뜻을 한 줄로 */}
            {d.courseList.length > 1 && d.courseList.some((x) => x.summitKm != null) && d.courseList.some((x) => x.summitKm == null) && (
                <p className="-mt-1 mb-3 text-[12.5px] text-[#F4EFE399]" data-testid="course-summit-legend">▲ 정상을 지나는 코스 {d.courseList.filter((x) => x.summitKm != null).length}개 · 나머지는 능선 · 계곡 · 둘레를 걷는 길</p>
            )}
            {/* 코스 지도 — 이 산의 코스 전부와 내 위치를 한 장에(바깥 지도 없이 우리 자료로 그린다) */}
            <div className="mb-3" data-testid="course-map-wrap">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="text-[15px] font-semibold text-[#F4EFE3]">{COURSE_MAP_COPY.title}</p>
                    <p className="shrink-0 text-[12.5px] text-[#F4EFE380]">{COURSE_MAP_COPY.aside}</p>
                </div>
                <CourseMap courses={d.courseList} index={i} onPick={onPick} pois={d.pois} summit={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null} here={loc.here} ask={loc.ask} asking={loc.asking} />
            </div>
            <CourseCard key={`card:${c.id}`} c={c} pois={d.pois} />
            {canStart && (
                <Link href={trailPath(d.slug, c.id)} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]" data-track-as="hiking-trail-open" data-testid="course-start">
                    이 코스로 산행 시작
                </Link>
            )}
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

/** 한눈 숫자의 한 칸 */
interface Stat { key: string; label: string; value: string; sub?: string; small?: boolean; onClick: () => void }

/**
 * 한눈 숫자 — 이름 밑의 띠(높이 · 코스 수 · 가장 짧은 코스). 누르면 그 구역으로 내려간다(골프장 상세 머리의 띠와 같은 쓰임).
 * 높이는 여기에 있으므로 위의 칩에는 다시 적지 않는다. 높이를 모르는 산은 그 칸이 없다.
 */
function StatStrip({ d, onCourses, onShortest, onMap }: { d: MountainDetail; onCourses: () => void; onShortest: (index: number) => void; onMap: () => void }) {
    const h = heightText(d.heightM);
    const n = d.courseList.length;
    const short = shortestCourse(d.courseList);
    const stats: Stat[] = [];
    if (h) stats.push({ key: "height", label: "높이", value: h, sub: "해발", onClick: onMap });
    // 거리의 폭은 아래 코스 구역에 실제로 놓인 코스들로 센다(이웃 봉우리에서 이어 온 코스까지) — 옆 칸의 '가장 짧은 코스'와 어긋나지 않게
    const kms = d.courseList.map((c) => c.km);
    stats.push({ key: "courses", label: "코스", value: `${n}개`, sub: n > 1 ? kmRange(Math.min(...kms), Math.max(...kms)) : undefined, onClick: onCourses });
    if (short) {
        const f = courseFacts(short.course);
        stats.push({ key: "shortest", label: "가장 짧은 코스", value: f.km, sub: f.time, onClick: () => onShortest(short.index) });
    } else {
        stats.push({ key: "shortest", label: "가장 짧은 코스", value: MOUNTAIN_AROUND_LABEL.coursesSoon, small: true, onClick: onCourses });
    }
    return (
        <div className="mt-3 flex divide-x divide-[#FFFFFF1F] rounded-2xl bg-[#0B1F26B8] backdrop-blur-sm" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF24" }} data-testid="mountain-stats">
            {stats.map((t) => (
                <button key={`stat:${t.key}`} type="button" onClick={t.onClick} data-testid={`mountain-stat-${t.key}`} className="min-w-0 flex-1 px-2.5 py-3 text-left first:rounded-l-2xl last:rounded-r-2xl active:bg-[#FFFFFF14]">
                    <span className="block truncate text-[12px] text-[#F4EFE399]">{t.label}</span>
                    <span className={`mt-0.5 block truncate font-semibold leading-[24px] tabular-nums text-[#F4EFE3] ${t.small ? "text-[14px]" : "text-[19px]"}`}>{t.value}</span>
                    {t.sub && <span className="mt-0.5 block truncate text-[12px] tabular-nums text-[#F6D9A8]">{t.sub}</span>}
                </button>
            ))}
        </div>
    );
}

export default function MountainPage() {
    const [, params] = useRoute("/hiking/mountains/:slug");
    const slug = params?.slug ? decodeURIComponent(params.slug) : "";
    const { data: d, isLoading, isError } = useQuery<MountainDetail>({ queryKey: mountainKey(slug), enabled: !!slug, retry: false });
    const { toast } = useToast();
    // 두 줄로 실렸던 산의 옛 주소(shared/hikingTwins)로 들어오면 서버가 남은 산을 준다 — 주소 줄도 그 산의 것으로 바꿔 끼운다(뒤로 가기에 옛 주소가 남지 않게)
    const [, setLocation] = useLocation();
    useEffect(() => { if (d && slug && d.slug !== slug) setLocation(hikingMountainPath(d.slug), { replace: true }); }, [d, slug, setLocation]);
    const region = hikingRegion(d?.region);
    // 검색: 제목 · 설명은 검색용 화면(server/seo/hiking)과 같은 함수. 구조화 자료는 참조가 바뀌면 다시 심으므로 memo
    const seo = useMemo(() => {
        if (!d) return null;
        const s = mountainSeo(d);
        const where = [d.sido, sigunguText(d.sigungu)].filter(Boolean).join(" ");
        // 검색용 화면의 Mountain 과 같은 사실(이름 · 자리 · 높이 · 시도/시군구)에 '어디에 든 산인가'를 보탠다.
        // 그림(image)은 넣지 않는다 — 권역 카드는 장식이지 이 산의 모습이 아니다
        const jsonLd: Record<string, unknown> = {
            "@context": "https://schema.org", "@type": "Mountain", name: d.name, url: `${ORIGIN}${s.path}`, description: s.desc,
            ...(d.lat != null && d.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng, ...(d.heightM ? { elevation: `${d.heightM} m` } : {}) } } : {}),
            ...(d.sido ? { address: { "@type": "PostalAddress", addressCountry: "KR", addressRegion: d.sido, ...(d.sigungu ? { addressLocality: d.sigungu } : {}) } } : {}),
            ...(where ? { containedInPlace: { "@type": "AdministrativeArea", name: where } } : {}),
        };
        // 미리보기 그림 — 이 산의 카드(검색용 화면 · 사이트맵과 같은 주소 — shared/ogCards hikingMountainCardUrl)
        return { title: s.title, description: s.desc, path: s.path, image: hikingMountainCardUrl(ORIGIN, d.slug), jsonLd };
    }, [d]);
    useSeo(seo);
    // 내 도장 — 등산을 쓸 수 있는 회원만(그 밖의 사람에게는 받는 것의 모습만 보여 준다)
    const my = useHikingStamps();
    const mine = d ? my.stampOf(d.id) : undefined;
    // 고른 코스 — 코스 구역의 칩과 '위치 · 들머리'가 같이 쓴다. 다른 산으로 건너가면 첫 코스로 돌아간다
    const [pick, setPick] = useState<{ slug: string; i: number }>({ slug: "", i: 0 });
    // 내 위치 — 이 기기에서만 쓴다(거리와 방향을 여기서 센다. 서버로 보내지 않고 적어 두지도 않는다)
    const loc = useMyLocation();
    // 다른 산으로 건너가면(가까운 산의 판 · 목록) 맨 위에서 시작한다. 처음 들어올 때는 손대지 않는다(#sec-photos 로 온 알림이 제자리로 간다)
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        window.scrollTo(0, 0);
    }, [slug]);
    // 가까운 산의 판 — 이 산이 가운데(방향은 여기서 센다)
    const dial = useMemo(() => (d ? nearbyDialItems(d, d.nearby) : []), [d]);
    const nearId = useMemo(() => new Map((d?.nearby ?? []).map((m) => [m.slug, m.id])), [d]);

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
    const kfs = d.lists.includes("kfs100");
    const books = my.states.filter((x) => x.slots.some((sl) => sl.m.id === d.id));
    const ci = pick.slug === d.slug ? Math.min(pick.i, Math.max(0, d.courseList.length - 1)) : 0;
    const course = d.courseList[ci] ?? null;
    const pickCourse = (i: number) => setPick({ slug: d.slug, i });
    const fromMe = fromMeText(loc.here, d);
    // 도장 카드의 '정상까지' — 기기에서만 잰다
    const reach = summitReach(loc.here, d);

    // 공유 — 기기의 공유 창, 없으면 주소 복사(골프장 상세와 같은 순서)
    const share = async () => {
        const url = `${ORIGIN}${hikingMountainPath(d.slug)}`;
        try {
            if (navigator.share) { await navigator.share({ title: `${d.name} | 랭큐 등산`, url }); return; }
        } catch (e: any) { if (e?.name === "AbortError") return; }
        try { await navigator.clipboard.writeText(url); toast({ title: "주소를 복사했어요" }); }
        catch { toast({ title: url }); }
    };
    const shareBtn = (
        <button type="button" onClick={share} aria-label="공유" data-track-as="hiking-mountain-share" data-testid="mountain-share" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#F4EFE3] active:bg-[#FFFFFF14]">
            <LucideShare2 className="h-[22px] w-[22px]" aria-hidden />
        </button>
    );

    return (
        <HikingShell title={d.name} backTo={region ? hikingRegionPath(region.id) : undefined} right={shareBtn}>
            <div data-testid="mountain-page" data-slug={d.slug}>
                {/* 표지 — 권역의 그림 위에 이름. 그림은 장식이다(실제 그 산의 모습이 아니다) */}
                <div className="relative overflow-hidden">
                    <img src={hikingCover(d.region)} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 40%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 18%,#0B1F26CC 62%,#0B1F26F5 97%)" }} aria-hidden />
                    {/* 칩이 두 줄이 되어도 잘리지 않게 높이를 내용에 맡긴다 */}
                    {/* 100대 명산은 그 산의 와펜을 표지에 건다 — 정상에서 인증하면 배낭에 달린다 */}
                    {kfs && (
                        <div className="absolute right-5 top-[58px] flex flex-col items-center" data-testid="mountain-patch">
                            <MountainPatch id={d.id} region={d.region} size={78} earned={!!mine?.verified} preview />
                            <span className="mt-1.5 rounded-full bg-[#0B1F26B3] px-2 py-0.5 text-[12px] text-[#F6D9A8]">{mine?.verified ? "받은 와펜" : "이 산의 와펜"}</span>
                        </div>
                    )}
                    <div className="relative px-5 pb-4 pt-[124px]">
                        {/* 와펜이 걸린 산은 한 줄 소개와 이름이 그 밑으로 들어가지 않게 오른쪽을 비운다 */}
                        {d.guide?.subtitle && <p className={`text-[13px] text-[#F6D9A8] break-keep ${kfs ? "pr-[92px]" : ""}`}>{d.guide.subtitle}</p>}
                        <h1 className={`mt-0.5 text-[30px] font-semibold leading-tight tracking-tight text-[#F4EFE3] ${kfs ? "pr-[92px]" : ""}`}>{d.name}</h1>
                        {/* 어디 · 어느 목록의 산인가 · 내 위치에서 얼마나 먼가 — 높이는 아래 띠에 있다(높이를 모르는 산은 어디에도 적지 않는다) */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {[mountainPlace(d), ...lists].filter(Boolean).map((t) => <Fact key={`fact:${t}`}>{t}</Fact>)}
                            {fromMe ? (
                                <span className="inline-flex" data-testid="mountain-from-me" title="직선 거리"><Fact>{fromMe}</Fact></span>
                            ) : loc.ask ? (
                                // 들어오자마자 권한을 묻지 않는다 — 눌렀을 때 한 번 묻는다(lib/useMyLocation)
                                <button type="button" onClick={loc.ask} data-track-as="hiking-mountain-distance" data-testid="mountain-ask-distance"
                                    className="inline-flex h-8 items-center gap-1 rounded-full bg-[#0B1F2699] px-2.5 text-[12.5px] text-[#F6D9A8] backdrop-blur-sm active:bg-[#0B1F26CC]" style={{ boxShadow: "inset 0 0 0 1px #F6D9A866" }}>
                                    <LucideLocateFixed className="h-3.5 w-3.5 shrink-0" aria-hidden />{MOUNTAIN_AROUND_LABEL.askDistance}
                                </button>
                            ) : loc.asking ? (
                                <Fact>위치를 받는 중이에요</Fact>
                            ) : null}
                        </div>
                        <StatStrip d={d} onCourses={() => hkJumpTo("sec-courses")} onShortest={(i) => { pickCourse(i); hkJumpTo("sec-courses"); }} onMap={() => hkJumpTo("sec-map")} />
                    </div>
                </div>

                {/* 이 산의 실제 모습(2026-10-21) — 한국관광공사 사진(공공누리). 표지 그림은 장식이라, 바로 밑에 진짜 사진을 둔다. 없으면 칸이 없다 */}
                <TourPhotos key={`tour:${d.slug}`} photos={d.tourPhotos} name={d.name} className="px-5 pt-3" tone={{ frame: "#FFFFFF0A", line: "#F4EFE31F", credit: "#F4EFE380" }} />

                {/* 이 산의 도장 — 정상에서 받는 것. 방문자를 가입으로 잇는다.
                    카드 하나에 다 있다(2026-10-13 오너: "요기 기능을 넣으면 어때? 디자인도 살짝"): 받는 것 · 정상까지 얼마나 남았나 · 인증 · 가고 싶은 산 */}
                <div className="px-5 pt-4">
                    <div className="overflow-hidden rounded-[22px] bg-[#F4EFE3] text-[#0E2A33]" style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.28)" }} data-testid="mountain-stamp" data-done={mine?.verified ? "1" : "0"}>
                        {/* 머리띠 — 무엇의 카드인지와 지금의 상태 */}
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: mine?.verified ? "linear-gradient(90deg,#F28C6A,#E8A27E)" : "linear-gradient(90deg,#1F5560,#2F6F7A)" }}>
                            <span className="text-[13px] font-semibold" style={{ color: mine?.verified ? "#2A1208" : "#F4EFE3" }}>{MOUNTAIN_LABEL.stamp}</span>
                            {mine?.verified ? (
                                <span className="rounded-full bg-[#2A120826] px-2 py-1 text-[12px] font-medium leading-none text-[#2A1208]">{stampDate(new Date(mine.firstAt))} 인증</span>
                            ) : my.mine ? (
                                <WishButton key={`wish:${d.id}`} slug={d.slug} mountainId={d.id} compact />
                            ) : null}
                        </div>
                        <div className="flex items-center gap-3.5 px-4 pt-3.5">
                            <div className="relative w-[92px] shrink-0">
                                <span className="absolute inset-[-6px] rounded-full" style={{ border: "1.5px dashed #0E2A3326" }} aria-hidden />
                                <SummitStamp name={d.name} heightM={d.heightM} ink={regionInk(d.region)} tilt={-4} state={mine ? (mine.verified ? "on" : "faded") : "on"} date={mine ? stampDate(new Date(mine.firstAt)) : null} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[16px] font-semibold leading-snug break-keep">{mine?.verified ? `${d.name} 도장을 찍었어요` : `정상에서 인증하면 ${d.name} 도장이 찍혀요`}</p>
                                {/* 받는 것 */}
                                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={mine?.verified ? "받은 것" : "받는 것"} data-testid="mountain-stamp-rewards">
                                    {summitRewards({ patch: kfs, books: books.length, gradeLeft: my.grade.left, nextGrade: my.mine ? my.grade.next?.name ?? null : null, done: !!mine?.verified }).map((r, i) => (
                                        <li key={`reward:${r}`} className="rounded-full px-2.5 py-1.5 text-[12.5px] font-medium leading-none" style={i === 0 ? { background: "#0E2A33", color: "#F4EFE3" } : { background: "#0E2A3312", color: "#0E2A33" }}>{r}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        {/* 정상까지 얼마나 남았나 — 위치를 받을 수 있을 때만(묻지 않고), 아니면 눌러서 */}
                        {!mine?.verified && d.lat != null && d.lng != null && (reach ? (
                            <p className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-medium leading-snug break-keep" style={reach.ready ? { background: "#2F6B4F24", color: "#1E5238" } : { background: "#0E2A330D", color: "#0E2A33" }} role="status" data-testid="mountain-stamp-reach" data-ready={reach.ready ? "1" : "0"}>
                                <LucideLocateFixed className="h-4 w-4 shrink-0" aria-hidden />{reach.text}
                            </p>
                        ) : loc.ask ? (
                            <button type="button" onClick={loc.ask} data-track-as="hiking-stamp-distance" data-testid="mountain-stamp-ask"
                                className="mx-4 mt-3 flex h-10 w-[calc(100%-2rem)] items-center justify-center gap-1.5 rounded-xl bg-[#0E2A330D] text-[13.5px] text-[#0E2A33] active:bg-[#0E2A331F]">
                                <LucideLocateFixed className="h-4 w-4 shrink-0" aria-hidden />정상까지 얼마나 남았는지 보기
                            </button>
                        ) : null)}
                        <div className="px-4 pb-3.5">
                            {my.mine
                                ? <SummitCheckin key={`checkin:${d.id}`} mountainId={d.id} name={d.name} stamp={mine} hasSummit={d.lat != null && d.lng != null} region={d.region} patch={kfs} />
                                : <p className="mt-3 border-t border-[#0E2A331A] pt-3 text-[13px] leading-snug text-[#0E2A33B3] break-keep">{kfs ? "인증하면 이 산의 와펜이 배낭에 달리고, 산행 등급이 올라요." : d.tier === 1 && region ? `${region.name} 도장첩의 한 칸이에요. 다 채우면 와펜을 받아요.` : "오른 산이 늘수록 산행 등급이 올라요."}</p>}
                        </div>
                    </div>
                </div>

                {/* 이 산이 칸으로 든 도장첩 — 한 산으로 여러 권이 같이 찬다는 것을 보여 준다 */}
                {books.length > 0 && (
                    <div className="px-5 pt-3.5" data-testid="mountain-books">
                        <p className="text-[12.5px] text-[#F4EFE380]">{MOUNTAIN_LABEL.books}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {books.map((b) => (
                                <Link key={`book:${b.book.id}`} href={hikingBookPath(b.book.id)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FFFFFF14] px-3 text-[13px] text-[#F4EFE3] active:bg-[#FFFFFF24]">
                                    {b.book.kind === "plus" ? `${b.book.name} 플러스` : b.book.name}
                                    {my.mine && <span className="tabular-nums text-[#F6D9A8]">{b.got}/{b.total}</span>}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 구역 줄 — 머리줄 밑에 붙는다. 화면에 실제로 있는 구역만, 지금 보는 구역에 불이 들어온다 */}
                <HkSectionNav key={`secnav:${d.slug}`} items={NAV_ITEMS} className="mt-6" />

                <HkSection title={MOUNTAIN_LABEL.courses} aside={d.courseList.length ? `${d.courseList.length}개` : undefined} sec="courses">
                    <Courses key={`courses:${d.slug}`} d={d} canStart={my.mine} i={ci} onPick={pickCourse} loc={loc} />
                </HkSection>

                {/* 이 산의 사진 — 회원이 올린 공개 사진. 방문자에게도 보인다(한 장도 없으면 구역이 없다) */}
                <MountainPhotos key={`mountain-photos:${d.slug}`} slug={d.slug} name={d.name} />

                {/* 내 산행 사진 — 내가 올린 것(공개 · 비공개 · 가려진 것까지). 올리기와 공개 여부는 여기서 */}
                {my.mine && (
                    <HkSection title={HIKING_PHOTO_LABEL.title} aside={HIKING_PHOTO_LABEL.aside} id={HIKING_PHOTOS_ANCHOR} sec="photos">
                        <MyPhotos key={`photos:${d.id}`} mountainId={d.id} name={d.name} />
                    </HkSection>
                )}

                <HkSection title={MOUNTAIN_LABEL.weather} aside="오늘부터 이레" sec="weather">
                    <MountainWeather key={`wx:${d.slug}`} slug={d.slug} />
                    <SunToday lat={d.lat} lng={d.lng} />
                </HkSection>

                {d.guide && (
                    <HkSection title={MOUNTAIN_LABEL.about} sec="about">
                        <About key={`about:${d.slug}`} d={d} />
                    </HkSection>
                )}

                {!my.mine && <div className="px-5 pt-8"><HikingCta /></div>}

                {/* 위치 · 들머리 — 나라의 어디쯤인지, 위에서 고른 코스의 들머리로 가는 지도 · 길찾기 */}
                <HkSection title={MOUNTAIN_AROUND_LABEL.map} aside={MOUNTAIN_AROUND_LABEL.mapAside} sec="map">
                    <MountainLocation key={`location:${d.slug}`} d={d} course={course} fromMe={fromMe} ask={loc.ask} asking={loc.asking} />
                </HkSection>

                {/* 이 근처 축제 · 행사(2026-10-21 — 단풍철) — 한국관광공사 축제 중 20km 안, 열렸거나 45일 안에 여는 것. 이름 · 날짜 · 자리 · 거리만, 없으면 칸이 없다 */}
                {(d.festivals?.length ?? 0) > 0 && (
                    <HkSection title="이 근처 축제" aside="한국관광공사" className="" sec="festivals">
                        <ul className="space-y-2" data-testid="mountain-festivals">
                            {d.festivals!.map((f) => (
                                <li key={f.id}>
                                    <a href={`https://search.naver.com/search.naver?query=${encodeURIComponent(f.title)}`} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-3 rounded-2xl px-3.5 py-3 active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                                        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none" style={f.state === "now" ? { background: "#F28C6A", color: "#2A1208" } : { background: "#FFFFFF14", color: "#F4EFE3" }}>
                                            <span className="text-[12px] font-semibold">{f.state === "now" ? "진행" : `${Number(f.start.slice(4, 6))}월`}</span>
                                            <span className="mt-0.5 text-[15px] font-semibold tabular-nums">{f.state === "now" ? "중" : Number(f.start.slice(6, 8))}</span>
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[15px] font-semibold text-[#F4EFE3]">{f.title}</span>
                                            <span className="mt-0.5 block truncate text-[12.5px] text-[#F4EFE399] tabular-nums">{festivalDateKo(f)} · {f.km < 1 ? "1km 안" : `${f.km.toFixed(f.km < 10 ? 1 : 0)}km`}</span>
                                        </span>
                                        <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
                                    </a>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2 text-[12px] text-[#F4EFE366]">축제 정보 한국관광공사 · 날짜와 운영은 바뀔 수 있어요 — 가기 전에 확인해 주세요.</p>
                    </HkSection>
                )}

                {/* 근처 맛집 · 카페 — 네이버 지역 검색을 그 자리에서(구역이 화면에 들어올 때). 위치 바로 아래(내려와서 어디서 먹을지) */}
                <MountainNearbyPlaces key={`food:${d.slug}`} slug={d.slug} name={d.name} />

                {d.nearby.length > 0 && (
                    <HkSection title={MOUNTAIN_LABEL.nearby} aside={`${d.nearby.length}곳`} sec="nearby">
                        {/* 이 산을 가운데 둔 판 — 가까운 산의 방향과 거리. 오른 산에는 깃발(등산을 쓰는 회원) */}
                        {dial.length >= NEARBY_DIAL_MIN && (
                            <div className="mb-2.5" data-testid="mountain-near-dial">
                                <NearDial key={`dial:${d.slug}`} items={dial} done={(m) => { const id = nearId.get(m.slug); return !!id && my.done.has(id); }}
                                    centre={MOUNTAIN_AROUND_LABEL.dialCentre} label={`${d.name}에서 가까운 산 ${dial.length}곳`} />
                                <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{MOUNTAIN_AROUND_LABEL.dial}</p>
                            </div>
                        )}
                        <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                            {d.nearby.map((m, i) => <li key={`near:${m.id}`} className={i ? "border-t border-[#FFFFFF14]" : ""}><MountainRow m={m} km={m.km} /></li>)}
                        </ul>
                    </HkSection>
                )}

                <p className="px-5 pt-6 text-[12px] leading-relaxed text-[#F4EFE399] break-keep">{OSM_NOTE}</p>
            </div>
        </HikingShell>
    );
}
