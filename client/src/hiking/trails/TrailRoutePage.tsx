/**
 * /hiking/trails/:route — 길 하나(해파랑 · 남파랑 · 서해랑 · DMZ 평화의 길, 2026-10-21).
 * 위에서부터: 길의 이름 · 한 줄 · 시작→끝 · 공개 코스 수 → 길로 당겨 들어간 지도(코스 번호 · 선을 누르면 그 코스) → 소개(두루누비 글 그대로)
 * → 코스 목록(번호 · 붙은 말 · 거리 · 시간 · 난이도 · 선 그림) → 공개 자료에 없는 코스 수 · 출처.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { TRAILS_PATH, TRAILS_SOURCE, trailCoursePath, trailRouteOf, trailRouteSeo } from "@shared/koreaTrails";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { TrailMap } from "./TrailMap";
import { TrailRow } from "./TrailParts";
import { TRAILS_KEY, type TrailsData } from "./api";

export default function TrailRoutePage() {
    const [, params] = useRoute("/hiking/trails/:route");
    const route = trailRouteOf(params?.route);
    const { data, isLoading } = useQuery<TrailsData>({ queryKey: TRAILS_KEY, staleTime: 60 * 60_000 });
    const [, setLocation] = useLocation();
    const [open, setOpen] = useState(false);
    const info = data?.routes.find((r) => r.id === route?.id) ?? null;
    const courses = useMemo(() => (data?.courses ?? []).filter((c) => c.route === route?.id), [data, route?.id]);
    const seo = route ? trailRouteSeo(route, { courses: info?.have ?? courses.length, km: info?.haveKm ?? 0 }) : null;
    useSeo(seo && data ? { title: seo.title, description: seo.desc, path: seo.path } : null);

    if (!route) {
        return <HikingShell title="코리아둘레길" backTo={TRAILS_PATH}><p className="px-5 pt-16 text-center text-[16px] text-[#F4EFE3B3]">없는 길이에요.</p></HikingShell>;
    }
    const missing = route.total - courses.length;
    return (
        <HikingShell title={route.name} backTo={TRAILS_PATH}>
            <div data-testid="trail-route-page">
                <header className="px-5 pt-5" style={{ boxShadow: `inset 0 3px 0 ${route.color}` }}>
                    <p className="pt-3 text-[13px] font-medium text-[#F4EFE399]">코리아둘레길</p>
                    <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight" style={{ color: route.color }}>{route.name}</h1>
                    {info?.line && <p className="mt-1 text-[15px] text-[#F4EFE3E6] break-keep">{info.line}</p>}
                    <p className="mt-2 text-[13.5px] text-[#F4EFE3B3] break-keep">{route.from} → {route.to}</p>
                    <div className="mt-3 flex rounded-2xl bg-[#FFFFFF0A] py-3" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF12" }}>
                        {([[`${route.total}`, "전체 코스"], [`${route.km.toLocaleString("en-US")}km`, "전체 거리"], [`${courses.length}`, "공개 코스"]] as const).map(([n, l]) => (
                            <div key={l} className="flex-1 text-center">
                                <div className="text-[20px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{n}</div>
                                <div className="mt-1.5 text-[12px] text-[#F4EFE399]">{l}</div>
                            </div>
                        ))}
                    </div>
                </header>

                {isLoading || !data ? (
                    <div className="space-y-4 px-5 pt-6" aria-busy="true"><HkSkel className="h-[440px]" /><HkSkel className="h-40" /></div>
                ) : (
                    <>
                        <HkSection title="길 지도" aside="번호는 코스 시작점">
                            <TrailMap courses={data.courses} focus={route.id} numbers onPick={(c) => setLocation(trailCoursePath(c.route, c.key))} label={`${route.name} 지도`} />
                        </HkSection>

                        {info?.desc && (
                            <HkSection title="소개" aside={`글 ${TRAILS_SOURCE}`}>
                                <p className={`whitespace-pre-line text-[15px] leading-[1.75] text-[#F4EFE3E6] break-keep ${open ? "" : "line-clamp-5"}`}>{info.desc}</p>
                                {info.desc.length > 160 && <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 h-10 rounded-xl px-1 text-[14px] font-medium text-[#F6D9A8] active:opacity-70">{open ? "접기" : "더 읽기"}</button>}
                            </HkSection>
                        )}

                        <HkSection title="코스" aside={`${courses.length}개 · ${Math.round(courses.reduce((a, c) => a + c.km, 0)).toLocaleString("en-US")}km`}>
                            <ul className="divide-y divide-[#FFFFFF12]" data-testid="trail-list">
                                {courses.map((c) => <TrailRow key={c.id} c={c} />)}
                            </ul>
                            {missing > 0 && (
                                <p className="mt-3 rounded-xl bg-[#FFFFFF0A] px-3.5 py-3 text-[13px] leading-relaxed text-[#F4EFE3B3] break-keep">
                                    {route.name} {route.total}개 코스 중 {missing}개는 두루누비 공개 자료에 아직 없어요 — 공개되면 여기에 채워져요.
                                </p>
                            )}
                        </HkSection>

                        <div className="px-5 pb-6 pt-8">
                            <p className="text-[12px] leading-relaxed text-[#F4EFE366]">자료 {TRAILS_SOURCE} · 코스 선은 두루누비 GPX 를 줄여 그렸어요.</p>
                        </div>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
