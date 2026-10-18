/**
 * /hiking/regions/:id · /hiking/lists/:id — 산의 목록(2026-10-13). 권역 하나, 또는 묶음 하나(공식 목록 · 특성).
 *
 * 권역 화면은 그 권역으로 당겨 들어간 지도를 먼저 보여 준다. 그 아래 이름으로 걸러 볼 수 있는 산의 줄.
 * 권역 하나가 700곳쯤이라 처음에는 앞부분만 그리고 '더 보기'로 늘린다.
 * 로그인 없이 열린다. ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { hikingGroup, hikingRegion } from "@shared/hikingMountains";
import { OSM_NOTE, hikingListSeo, hikingRegionSeo } from "@shared/hikingPage";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { BookCover, hasNotebook, notebookInk } from "../components/BundleNotebook";
import { MountainMap } from "../components/MountainMap";
import { HikingCta, MountainRow } from "../components/MountainParts";
import { hikingCover, hikingListCover } from "../theme";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { mountainsKey, type MountainSummary } from "../lib/api";

const PAGE = 60;

export default function HikingListPage() {
    const [isRegion, rp] = useRoute("/hiking/regions/:id");
    const [, lp] = useRoute("/hiking/lists/:id");
    const region = isRegion ? hikingRegion(rp?.id) : undefined;
    const group = !isRegion ? hikingGroup(lp?.id) : undefined;
    const known = !!region || !!group;
    const { data, isLoading } = useQuery<{ total: number; items: MountainSummary[] }>({
        queryKey: mountainsKey(region ? { region: region.id } : { list: group?.id ?? "" }), enabled: known, staleTime: 10 * 60_000,
    });
    const [q, setQ] = useState("");
    const [n, setN] = useState(PAGE);
    const items = data?.items ?? [];
    const shown = useMemo(() => { const k = q.trim(); return k ? items.filter((m) => m.name.includes(k) || (m.sigungu ?? "").includes(k)) : items; }, [items, q]);
    const title = region ? `${region.name}의 산` : group?.name ?? "산";
    const seo = region ? hikingRegionSeo(region, data?.total ?? 0) : group ? hikingListSeo(group, data?.total ?? 0) : null;
    useSeo(seo && data ? { title: seo.title, description: seo.desc, path: seo.path } : null);
    const famous = useMemo(() => items.filter((m) => m.tier === 1), [items]);
    // 내 진행 — 등산을 쓰는 회원에게만. 이 화면은 묶음의 산을 다 받아 오므로(천 곳까지) 전부를 놓고 센다
    const my = useHikingStamps();
    const progress = my.mine && group && data && data.total > 0 && data.total <= items.length ? { got: items.filter((m) => my.done.has(m.id)).length, total: data.total } : null;

    if (!known) {
        return (
            <HikingShell title="산">
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#F4EFE3B3]">없는 목록이에요.</p>
                    <a href="/hiking" className="mt-4 inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14px] font-semibold text-[#2A1208]">전국 명산 보기</a>
                </div>
            </HikingShell>
        );
    }
    return (
        <HikingShell title={title}>
            <div data-testid="hiking-list" data-kind={region ? "region" : "group"}>
                {group && hasNotebook(group.id) ? (
                    // 묶음의 머리 — 그 수첩을 펼치기 전의 겉모습. 회원에게는 오른 산의 수와 진행 띠
                    <div className="relative overflow-hidden px-5 pb-5 pt-5" style={{ background: `linear-gradient(180deg, ${notebookInk(group.id)}59, #0B1F26 92%)` }} data-testid="hiking-list-book">
                        <div className="flex items-end gap-4">
                            <BookCover id={group.id} name={group.short} count={data?.total ?? 0} progress={progress} width={128} big className="mb-2" />
                            <div className="min-w-0 flex-1 pb-1">
                                <p className="text-[12.5px] text-[#F6D9A8]">산행 수첩</p>
                                <h1 className="mt-0.5 text-[24px] font-semibold leading-tight tracking-tight text-[#F4EFE3] break-keep">{title}</h1>
                                <p className="mt-1.5 text-[13.5px] leading-snug text-[#F4EFE3B3] break-keep">{group.note}</p>
                                {data && <p className="mt-1 text-[13.5px] tabular-nums text-[#F4EFE3B3]">산 {data.total.toLocaleString("en-US")}곳</p>}
                            </div>
                        </div>
                        {progress && (
                            <div className="mt-3.5" data-testid="hiking-list-progress">
                                <div className="flex items-baseline justify-between text-[13px]">
                                    <span className="text-[#F4EFE3CC]">{progress.got >= progress.total ? "이 수첩의 산을 다 올랐어요" : progress.got > 0 ? "정상에서 인증한 산" : "아직 오른 산이 없어요 — 첫 산을 골라 보세요"}</span>
                                    <span className="tabular-nums text-[#F6D9A8]">{progress.got} / {progress.total.toLocaleString("en-US")}</span>
                                </div>
                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#FFFFFF1F]"><div className="h-full rounded-full bg-[#F28C6A]" style={{ width: `${Math.max(progress.got > 0 ? 3 : 0, Math.round((progress.got / Math.max(1, progress.total)) * 100))}%` }} /></div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative h-[168px] overflow-hidden">
                        <img src={region ? hikingCover(region.id) : hikingListCover(group?.id)} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} draggable={false} decoding="async" />
                        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                        <div className="absolute inset-x-5 bottom-3.5">
                            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{title}</h1>
                            <p className="mt-1 text-[13.5px] text-[#F4EFE3B3] break-keep">{region ? region.sidos.join(" · ") : group?.note}{data ? ` · ${data.total.toLocaleString("en-US")}곳` : ""}</p>
                        </div>
                    </div>
                )}

                {isLoading || !data ? (
                    <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-12" /><HkSkel className="h-96" /></div>
                ) : (
                    <>
                        {region && famous.length > 0 && (
                            <HkSection title={`${region.name}의 명산`} aside={`${famous.length}곳 · 산을 눌러 보세요`}>
                                <MountainMap mountains={famous} region={region.id} done={my.done} />
                            </HkSection>
                        )}
                        {/* 묶음(목록 · 특성) — 이 산들이 어디어디에 있는지부터 보여 준다(2026-10-13 오너: "지도를 넣어서 어디어디 산인지 보이게") */}
                        {group && famous.length > 0 && (
                            <HkSection title="어디에 있는 산일까" aside={`명산 ${famous.length}곳 · 산을 눌러 보세요`}>
                                <MountainMap mountains={famous} fit labelAll={famous.length <= 30} done={my.done} />
                                {famous.length < items.length && (
                                    <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep" data-testid="hiking-list-map-note">
                                        이 묶음의 산 {data.total.toLocaleString("en-US")}곳 가운데 명산 {famous.length}곳을 지도에 그렸어요. 나머지는 아래 목록에 있어요.
                                    </p>
                                )}
                            </HkSection>
                        )}
                        <HkSection title={`산 ${shown.length.toLocaleString("en-US")}곳`} aside={group?.id === "kfs100" ? "목록의 순서" : "명산 먼저 · 높은 순"}>
                            <input
                                type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} placeholder="산 이름 · 시군으로 찾기" aria-label="산 이름 · 시군으로 찾기" data-testid="hiking-list-search"
                                className="mb-3 h-12 w-full rounded-xl border border-[#FFFFFF1F] bg-[#FFFFFF0A] px-4 text-[15px] text-[#F4EFE3] outline-none placeholder:text-[#F4EFE399] focus:border-[#F28C6A]"
                            />
                            {shown.length === 0 ? (
                                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px] text-[#F4EFE399]">찾는 산이 없어요.</p>
                            ) : (
                                <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                                    {shown.slice(0, n).map((m, i) => <li key={m.id} className={i ? "border-t border-[#FFFFFF14]" : ""}><MountainRow m={m} done={my.done.has(m.id)} /></li>)}
                                </ul>
                            )}
                            {shown.length > n && (
                                <button type="button" onClick={() => setN(n + PAGE * 2)} className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]" data-testid="hiking-list-more">
                                    {(shown.length - n).toLocaleString("en-US")}곳 더 보기
                                </button>
                            )}
                        </HkSection>
                        <div className="px-5 pt-8"><HikingCta /></div>
                        <p className="px-5 pt-6 text-[12px] leading-relaxed text-[#F4EFE399] break-keep">{OSM_NOTE}</p>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
