/**
 * 등산 홈(2026-10-13) — 종목이 등산일 때 /dashboard 가 그리는 화면. 당구 홈(점수판) · 골프 홈(긴급티 · 랭큐매치)과 따로 선 등산의 홈이다.
 *
 * 위에서부터: 머리(종목 바꾸기 · 전체 메뉴) → 표지 위의 내 산행 등급과 진행(오른 산 · 100대 명산) → 가장 가까운 도장첩 → 지금 철의 산 → 내 산 지도(오른 산에 깃발)
 * → 최근에 찍은 도장 → 처음이면 '첫 산 고르기'. 하단 탭은 홈 · 크루 · 산 · 도장첩 · 채팅(HiqNavigation).
 * 등산을 쓸 수 있는 회원만 여기에 온다(SportContext 가 허용되지 않은 사람을 당구로 돌린다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { AlertAppStrip } from "@/components/hiq/AlertAppStrip";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { SportHeader } from "@/components/hiq/SportHeader";
import { LucideChevronRight } from "@/lib/icons";
import { hikingMountainPath } from "@shared/hikingMountains";
import { HkSection, HkSkel } from "../components/HikingShell";
import { MountainMap } from "../components/MountainMap";
import { SummitsNow } from "../components/SummitsNow";
import { NearMe } from "../components/NearMe";
import { WishShelf } from "../wish/WishParts";
import { MountainRow } from "../components/MountainParts";
import { SeasonNow } from "../components/SeasonNow";
import { GradeCard } from "../stamps/GradeParts";
import { stampDate } from "../lib/date";
import { HIKING_PACK_PATH, HIKING_STAMPS_PATH, HkBar, HkPaper, PatchArt, hikingBookPath } from "../stamps/StampParts";
import { SummitStamp, regionInk } from "../stamps/SummitStamp";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { MY_TRIPS_KEY, type MyTrip } from "../trail/useTrail";
import { durationText } from "@shared/hikingGeo";
import { HIKING_HERO } from "../theme";
import { CoachTour } from "@/components/hiq/CoachTour";
import { ProfileNudge } from "@/components/hiq/profile/ProfileBasics";
import { FeaturedPhotos } from "../components/FeaturedPhotos";
import { FestivalPicks } from "@/festivals/components/FestivalPicks";
import { TrailsEntry } from "../trails/TrailsEntry";

const TILT = [-4, 3, -2, 5];

export default function HikingHome() {
    const s = useHikingStamps();
    const { member } = useAuth();
    const [, setLocation] = useLocation();
    const byId = new Map(s.famous.map((m) => [m.id, m]));
    const verified = s.stamps.filter((x) => x.verified);
    const kfs = s.famous.filter((m) => m.lists.includes("kfs100"));
    const kfsGot = kfs.filter((m) => s.done.has(m.id)).length;
    // 가장 가까운 권 — 시작한 100대 명산 권 가운데 남은 칸이 가장 적은 것. 없으면 칸이 가장 적은 권(시작하기 쉬운 권)
    const kfsBooks = s.states.filter((x) => x.book.kind === "kfs" && !x.done);
    const near = [...kfsBooks].filter((x) => x.got > 0).sort((a, b) => (a.total - a.got) - (b.total - b.got))[0] ?? [...kfsBooks].filter((x) => x.total > 1).sort((a, b) => a.total - b.total)[0];
    const recent = [...verified].sort((a, b) => b.firstAt - a.firstAt).slice(0, 3);
    // 등산 알림함 — 산악회의 알림만 모인다(server/storage/notification.repo 의 sportWhere)
    const trips = useQuery<{ trips: MyTrip[] }>({ queryKey: MY_TRIPS_KEY, enabled: s.mine }).data?.trips ?? [];
    const name = (member as { nickname?: string; name?: string } | undefined)?.nickname ?? (member as { name?: string } | undefined)?.name ?? "";

    return (
        <div className="min-h-screen bg-[#0B1F26] pb-nav font-sans text-[#F4EFE3]" data-hiking="1" data-testid="hiking-home">
            {/* 머리줄 — 세 종목이 같이 쓰는 것(워드마크 · 종목 전환 · 알림 · 전체 메뉴) */}
            <SportHeader sport="HIKING" />

            <main className="mx-auto max-w-[720px]">
                {/* 크루 채팅 · 모임 알림이 웹에서는 울리지 않는다는 한 줄(2026-10-14) — 앱 밖 · 푸시가 닿지 않는 회원만 */}
                <div className="px-5 empty:hidden [&:has(>*)]:pt-3"><AlertAppStrip /></div>
                {/* 표지 위의 내 진행 */}
                <div className="relative overflow-hidden">
                    <img src={HIKING_HERO} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 58%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2633 0%,#0B1F26D9 62%,#0B1F26 100%)" }} aria-hidden />
                    <div className="relative px-5 pb-5 pt-[104px]">
                        <p className="text-[14px] text-[#F4EFE3CC] break-keep">{name ? `${name} 님, ` : ""}{verified.length ? "다음은 어느 산으로 갈까요?" : "첫 산을 골라 볼까요?"}</p>
                        <Link href={HIKING_PACK_PATH} className="mt-3 block active:opacity-80" data-testid="hk-home-grade" data-tour="hh-grade"><GradeCard state={s.grade} heightSum={s.heightSum} /></Link>
                        <div className="mt-2.5 flex rounded-2xl bg-[#0B1F26B3] py-3.5 backdrop-blur-sm" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="hk-home-summary">
                            {([[verified.length, "오른 산"], [`${kfsGot}/${kfs.length || 100}`, "100대 명산"], [kfsGot + s.awards.filter((a) => a.kind === "patch" || a.kind === "grand").length, "와펜"]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#F4EFE399]">{label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Link href="/hiking" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]" data-track-as="hiking-home-find" data-tour="hh-find">산 찾기</Link>
                            <Link href={HIKING_STAMPS_PATH} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium active:bg-[#FFFFFF2E]">도장첩</Link>
                            <Link href={HIKING_PACK_PATH} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium active:bg-[#FFFFFF2E]">배낭</Link>
                        </div>
                    </div>
                </div>

                {s.isLoading ? (
                    <div className="space-y-4 px-5 pt-4" aria-busy="true"><HkSkel className="h-24" /><HkSkel className="h-[420px]" /></div>
                ) : (
                    <>
                        {near && (
                            <div className="px-5 pt-2">
                                <Link href={hikingBookPath(near.book.id)} className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #F28C6A66" }} data-testid="hk-home-near">
                                    <PatchArt art={near.book.art} size={60} earned={false} preview />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15.5px] font-semibold break-keep">{near.book.name} 도장첩{near.got > 0 ? `, ${near.total - near.got}곳 남았어요` : ` — ${near.total}곳`}</p>
                                        <p className="mt-0.5 text-[13px] text-[#F4EFE399] break-keep">다 채우면 {near.book.name} 와펜을 받아요</p>
                                        <HkBar got={near.got} total={near.total} className="mt-2" />
                                    </div>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F28C6A]" aria-hidden />
                                </Link>
                            </div>
                        )}
                        {/* 프로필 기본 두 가지(성별 · 나이대, 2026-10-20) — 비었을 때만. 산악회 회원 목록 · 조 나누기에 쓴다.
                            가장 가까운 도장첩 다음(2026-10-21 화면 확인: 표지 바로 밑이면 도장첩 카드를 밀어 냈다) */}
                        <div className="px-5 empty:hidden [&:has(>*)]:pt-2"><ProfileNudge sport="HIKING" /></div>

                        <NearMe famous={s.famous} done={s.done} />

                        <WishShelf done={s.done} />

                        <SeasonNow mountains={s.famous} done={s.done} mine />

                        {/* 오늘의 명산(2026-10-21) — 100대 명산의 실제 사진(한국관광공사 · 공공누리). 날마다 다른 여덟 산 */}
                        <FeaturedPhotos />

                        {/* 산행 길에 들를 축제(2026-10-21 — 전국 축제의 등산 줄. 명산 5km 안에서 열리는 축제, 꽃 · 단풍 · 억새 축제가 앞) */}
                        <FestivalPicks sport="HIKING" />

                        <HkSection title="내 산 지도" aside={verified.length ? `깃발 ${s.done.size}개` : "오른 산에 깃발이 꽂혀요"}>
                            <div data-tour="hh-map"><MountainMap mountains={s.famous} done={s.done} /></div>
                        </HkSection>

                        <SummitsNow />

                        {/* 코리아둘레길(2026-10-21 — 국토종주는 걸어서 · 등산 안에) */}
                        <TrailsEntry />

                        {trips.length > 0 && (
                            <HkSection title="최근 산행" aside={`${trips.length}번`}>
                                <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5" data-testid="hk-home-trips">
                                    {trips.slice(0, 4).map((t, i) => {
                                        const m = byId.get(t.mountainId);
                                        const min = Math.max(1, Math.round((Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 60_000));
                                        return (
                                            <li key={t.id} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                                                <Link href={m ? hikingMountainPath(m.slug) : "/hiking"} className="flex min-h-[56px] items-center gap-3 py-2 active:opacity-70">
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[15.5px] font-semibold text-[#F4EFE3]">{m?.name ?? "산행"}{t.reachedSummit && <span className="ml-1.5 text-[12.5px] font-medium text-[#F6D9A8]">정상</span>}</span>
                                                        <span className="mt-0.5 block text-[13px] tabular-nums text-[#F4EFE399]">{stampDate(new Date(t.startedAt))} · {durationText(min)} · {t.km.toFixed(1)}km · 오른 높이 {t.gainM.toLocaleString("en-US")}m</span>
                                                    </span>
                                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE399]" aria-hidden />
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </HkSection>
                        )}

                        {recent.length > 0 ? (
                            <HkSection title="최근에 찍은 도장" aside={<Link href={HIKING_STAMPS_PATH} className="text-[#F6D9A8]">도장첩 보기</Link>}>
                                <HkPaper className="px-2 pb-3.5 pt-4">
                                    <div className="grid grid-cols-3 gap-x-1">
                                        {recent.map((st, i) => {
                                            const m = byId.get(st.mountainId);
                                            if (!m) return null;
                                            return (
                                                <Link key={st.mountainId} href={hikingMountainPath(m.slug)} className="flex flex-col items-center gap-1 text-center active:opacity-70">
                                                    <div className="w-full max-w-[96px] px-1"><SummitStamp name={m.name} heightM={m.heightM} ink={regionInk(m.region)} date={stampDate(new Date(st.firstAt))} tilt={TILT[i % TILT.length]} /></div>
                                                    <span className="text-[13px] font-semibold text-[#0E2A33]">{m.name}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </HkPaper>
                            </HkSection>
                        ) : (
                            <HkSection title="처음이라면 이런 산부터" aside="100대 명산 가운데 낮은 산">
                                <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                                    {[...kfs].filter((m) => (m.heightM ?? 0) > 0 && m.courses > 0).sort((a, b) => (a.heightM ?? 0) - (b.heightM ?? 0)).slice(0, 5).map((m, i) => (
                                        <li key={m.id} className={i ? "border-t border-[#FFFFFF14]" : ""}><MountainRow m={m} /></li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-[12.5px] text-[#F4EFE380] break-keep">산을 고르면 코스의 높낮이와 날씨, 길 위의 갈림길을 볼 수 있어요.</p>
                            </HkSection>
                        )}
                    </>
                )}
            </main>
            {/* 등산 홈의 첫 안내(2026-10-15) — 산 찾기 · 내 등급 · 내 산 지도. 지도는 불러온 뒤에 그려져서 다 불러온 다음에 띄운다 */}
            <CoachTour id="hiking-home" tone="hiking" when={!s.isLoading} steps={[
                { target: "hh-find", title: "산 찾기", body: "가 볼 산을 골라요. 산을 열면 코스의 높낮이와 날씨, 길 위의 갈림길을 볼 수 있어요." },
                { target: "hh-grade", title: "내 산행 등급", body: "오른 산과 높이가 쌓이면 등급이 올라가요. 누르면 배낭이 열려요." },
                { target: "hh-map", title: "내 산 지도", body: "오른 산마다 지도에 깃발이 꽂혀요. 100대 명산을 하나씩 채워 가요." },
            ]} />
            <HiqNavigation />
        </div>
    );
}
