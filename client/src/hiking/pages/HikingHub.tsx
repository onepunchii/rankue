/**
 * /hiking — 등산 허브(2026-10-13). 전국 명산을 지도와 권역 · 목록으로 찾는 곳.
 *
 * 위에서부터: 표지(새벽 능선) → 내 산 지도(권역을 고르면 당겨 들어간다) → 권역 여덟 → 목록 · 특성 → 산림청 100대 명산 앞부분 → 가입 안내.
 * 로그인 없이 열린다. 글은 shared/hikingPage — 검색용 화면(server/seo/hiking)과 같다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { HIKING_REGIONS, hikingGroup, hikingListPath, hikingRegionPath, inHikingGroup } from "@shared/hikingMountains";
import { HIKING_H1, HIKING_TAGLINE, OSM_NOTE, hikingHubSeo } from "@shared/hikingPage";
import { HIKING_CHECKLIST_H1, HIKING_CHECKLIST_PATH, HIKING_TERMS, HIKING_TERMS_H1, HIKING_TERMS_PATH } from "@shared/hikingTerms";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { BundleNotebook } from "../components/BundleNotebook";
import { MountainMap } from "../components/MountainMap";
import { HikingCta, MountainRow } from "../components/MountainParts";
import { SeasonNow } from "../components/SeasonNow";
import { HIKING_HERO, hikingCover } from "../theme";
import { HIKING_HUB_KEY, type HikingHubData } from "../lib/api";
import { useHikingStamps } from "../stamps/useHikingStamps";

const TOP = 8;

export default function HikingHub() {
    const { data, isLoading } = useQuery<HikingHubData>({ queryKey: HIKING_HUB_KEY, staleTime: 10 * 60_000 });
    const [region, setRegion] = useState<string | null>(null);
    // 내 깃발 — 등산을 쓸 수 있는 회원만
    const my = useHikingStamps();
    const seo = hikingHubSeo(data?.counts ?? { total: 3800, famous: 300, courses: 5400 });
    useSeo(data ? { title: seo.title, description: seo.desc, path: seo.path } : null);
    const kfs = (data?.famous ?? []).filter((m) => m.lists.includes("kfs100"));
    const picked = HIKING_REGIONS.find((r) => r.id === region);

    return (
        <HikingShell title="랭큐 등산" backTo="/">
            <div data-testid="hiking-hub">
                <div className="relative h-[236px] overflow-hidden">
                    <img src={HIKING_HERO} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 28%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-4">
                        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{HIKING_H1.replace("랭큐 등산 — ", "")}</h1>
                        <p className="mt-1 text-[14.5px] text-[#F4EFE3CC] break-keep">{HIKING_TAGLINE}</p>
                        {data && (
                            <p className="mt-2 text-[13px] tabular-nums text-[#F6D9A8]">산 {data.counts.total.toLocaleString("en-US")}곳 · 등산 코스 {data.counts.courses.toLocaleString("en-US")}개 · 명산 {data.counts.famous}곳</p>
                        )}
                    </div>
                </div>

                {isLoading || !data ? (
                    <div className="space-y-4 px-5 pt-6" aria-busy="true"><HkSkel className="h-[420px]" /><HkSkel className="h-40" /></div>
                ) : (
                    <>
                        <HkSection title="명산 지도" aside={picked ? `${picked.name} · 산을 눌러 보세요` : "권역을 골라 보세요"}>
                            <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5" style={{ scrollbarWidth: "none" }} role="group" aria-label="권역 고르기">
                                {[{ id: null as string | null, name: "전국" }, ...HIKING_REGIONS.map((r) => ({ id: r.id as string | null, name: r.name }))].map((r) => {
                                    const on = region === r.id;
                                    return (
                                        <button key={r.id ?? "all"} type="button" onClick={() => setRegion(r.id)} aria-pressed={on} data-testid={`hub-region-${r.id ?? "all"}`}
                                            className="h-10 shrink-0 rounded-full px-4 text-[14px]" style={{ background: on ? "#F28C6A" : "#FFFFFF14", color: on ? "#2A1208" : "#F4EFE3", fontWeight: on ? 600 : 400 }}>
                                            {r.name}
                                        </button>
                                    );
                                })}
                            </div>
                            <MountainMap mountains={data.famous} region={region} done={my.done} />
                            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">큰 산 그림은 산림청 100대 명산, 작은 산 그림은 그 밖의 명산이에요. 높을수록 크게 그렸어요.</p>
                            {picked && (
                                <Link href={hikingRegionPath(picked.id)} className="mt-3 flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]" data-testid="hub-region-link">
                                    {picked.name}의 산 {data.regions.find((x) => x.id === picked.id)?.total.toLocaleString("en-US")}곳 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                                </Link>
                            )}
                        </HkSection>

                        <SeasonNow mountains={data.famous} done={my.done} mine={my.mine} />

                        <HkSection title="권역으로 찾기" aside="여덟 권역">
                            <ul className="grid grid-cols-2 gap-2.5">
                                {data.regions.map((r) => (
                                    <li key={r.id}>
                                        <Link href={hikingRegionPath(r.id as never)} className="relative block h-[92px] overflow-hidden rounded-2xl bg-[#0E2A33] active:opacity-80" data-testid={`hub-region-card-${r.id}`}>
                                            <img src={hikingCover(r.id)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} loading="lazy" decoding="async" draggable={false} />
                                            <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2633,#0B1F26D9)" }} aria-hidden />
                                            <span className="absolute inset-x-3 bottom-2.5">
                                                <span className="block text-[16.5px] font-semibold text-[#F4EFE3]">{r.name}</span>
                                                <span className="block text-[12.5px] tabular-nums text-[#F4EFE3B3]">산 {r.total.toLocaleString("en-US")}곳 · 명산 {r.famous}</span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </HkSection>

                        <HkSection title="묶어서 찾기" aside={`수첩 ${data.lists.length + data.traits.length}권`}>
                            {/* 책장 — 묶음 하나가 수첩 한 권. 누르면 그 산들의 지도와 목록이 열린다. 회원에게는 표지에 오른 산의 수가 찍힌다 */}
                            <ul className="grid grid-cols-3 gap-x-3.5 gap-y-6 pb-2 pr-1" data-testid="hub-notebooks">
                                {[...data.lists.map((l) => ({ id: l.id, name: l.short, count: l.count })), ...data.traits.map((t) => ({ id: t.id, name: t.name, count: t.count }))].map((g) => {
                                    const group = hikingGroup(g.id);
                                    const members = group ? data.famous.filter((m) => inHikingGroup(group, m)) : [];
                                    // 진행은 그 묶음의 산을 다 알 때만 찍는다(명산만으로 이루어진 묶음) — 산이 천 곳 넘는 묶음은 수만 적는다
                                    const progress = my.mine && members.length === g.count && g.count > 0 ? { got: members.filter((m) => my.done.has(m.id)).length, total: g.count } : null;
                                    return <li key={g.id}><BundleNotebook id={g.id} name={g.name} count={g.count} progress={progress} /></li>;
                                })}
                            </ul>
                            <p className="mt-3 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">수첩을 누르면 그 산들이 어디에 있는지 지도로 보여요.{my.mine ? " 정상에서 인증한 산이 표지에 세어져요." : ""}</p>
                        </HkSection>

                        <HkSection title="산림청 100대 명산" aside={`${kfs.length}곳`}>
                            <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                                {kfs.slice(0, TOP).map((m, i) => <li key={m.id} className={i ? "border-t border-[#FFFFFF14]" : ""}><MountainRow m={m} done={my.done.has(m.id)} /></li>)}
                            </ul>
                            <Link href={hikingListPath("kfs100")} className="mt-3 flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">
                                100곳 다 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                            </Link>
                        </HkSection>

                        <HkSection title="산행 길잡이" aside="읽을거리">
                            <ul className="grid grid-cols-2 gap-2.5" data-testid="hub-guides">
                                {[{ href: HIKING_CHECKLIST_PATH, name: HIKING_CHECKLIST_H1, sub: "철마다 배낭에 넣을 것", art: "/hiking/art/cover-checklist.webp", pos: "50% 80%" },
                                    { href: HIKING_TERMS_PATH, name: HIKING_TERMS_H1, sub: `들머리 · 안부 · 알바 … ${HIKING_TERMS.length}가지`, art: "/hiking/art/cover-terms.webp", pos: "30% 62%" }].map((c) => (
                                    <li key={c.href}>
                                        <Link href={c.href} className="relative block h-[104px] overflow-hidden rounded-2xl bg-[#0E2A33] active:opacity-80">
                                            <img src={c.art} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: c.pos }} loading="lazy" decoding="async" draggable={false} />
                                            <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2626,#0B1F26E6)" }} aria-hidden />
                                            <span className="absolute inset-x-3 bottom-2.5">
                                                <span className="block text-[16px] font-semibold text-[#F4EFE3]">{c.name}</span>
                                                <span className="block truncate text-[12.5px] text-[#F4EFE3B3]">{c.sub}</span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </HkSection>

                        {!my.mine && <div className="px-5 pt-8"><HikingCta /></div>}
                        <p className="px-5 pt-6 text-[12px] leading-relaxed text-[#F4EFE366] break-keep">{OSM_NOTE}</p>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
