/**
 * 등산 홈(2026-10-13) — 종목이 등산일 때 /dashboard 가 그리는 화면. 당구 홈(점수판) · 골프 홈(긴급티 · 랭큐매치)과 따로 선 등산의 홈이다.
 *
 * 위에서부터: 머리(종목 바꾸기 · 전체 메뉴) → 표지 위의 내 산행 등급과 진행(오른 산 · 100대 명산) → 가장 가까운 도장첩 → 지금 철의 산 → 내 산 지도(오른 산에 깃발)
 * → 최근에 찍은 도장 → 처음이면 '첫 산 고르기'. 하단 탭은 홈 · 크루 · 산 · 도장첩 · 채팅(HiqNavigation).
 * 등산을 쓸 수 있는 회원만 여기에 온다(SportContext 가 허용되지 않은 사람을 당구로 돌린다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSport } from "@/contexts/SportContext";
import { useGolfVisible } from "@/hooks/useGolfAccess";
import { useState } from "react";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { LucideChevronRight } from "@/lib/icons";
import { hikingMountainPath } from "@shared/hikingMountains";
import { HkSection, HkSkel } from "../components/HikingShell";
import { MountainMap } from "../components/MountainMap";
import { NearMe } from "../components/NearMe";
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

const TILT = [-4, 3, -2, 5];

export default function HikingHome() {
    const s = useHikingStamps();
    const { member } = useAuth();
    const { setSport } = useSport();
    const golfOk = useGolfVisible();
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
    const [inbox, setInbox] = useState(false);
    const unread = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport: "HIKING" }], refetchInterval: 60_000, staleTime: 30_000, enabled: s.mine }).data?.unread ?? 0;
    const trips = useQuery<{ trips: MyTrip[] }>({ queryKey: MY_TRIPS_KEY, enabled: s.mine }).data?.trips ?? [];
    const name = (member as { nickname?: string; name?: string } | undefined)?.nickname ?? (member as { name?: string } | undefined)?.name ?? "";

    return (
        <div className="min-h-screen bg-[#0B1F26] pb-nav font-sans text-[#F4EFE3]" data-hiking="1" data-testid="hiking-home">
            <header className="sticky top-0 z-40 border-b border-[#FFFFFF14] bg-[#0B1F26E6] backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="mx-auto flex h-14 max-w-[720px] items-center gap-2 px-4">
                    <span className="text-[17px] font-semibold tracking-tight">랭큐 등산</span>
                    <span className="flex-1" />
                    {/* 종목 바꾸기 — 당구 · 골프로 */}
                    <div className="flex items-center gap-1 rounded-full bg-[#FFFFFF0F] p-1" role="group" aria-label="종목 바꾸기">
                        <button type="button" onClick={() => setSport("BILLIARDS")} className="h-8 rounded-full px-3 text-[13px] text-[#F4EFE3B3] active:bg-[#FFFFFF14]" data-testid="hk-to-billiards">당구</button>
                        {golfOk && <button type="button" onClick={() => setSport("GOLF")} className="h-8 rounded-full px-3 text-[13px] text-[#F4EFE3B3] active:bg-[#FFFFFF14]" data-testid="hk-to-golf">골프</button>}
                        <span className="flex h-8 items-center rounded-full bg-[#F28C6A] px-3 text-[13px] font-semibold text-[#2A1208]">등산</span>
                    </div>
                    <button type="button" onClick={() => setInbox(true)} aria-label={unread > 0 ? `알림 ${unread}개` : "알림"} className="relative flex h-10 w-10 items-center justify-center rounded-full active:bg-[#FFFFFF14]" data-testid="hk-home-bell">
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></svg>
                        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#F28C6A]" style={{ boxShadow: "0 0 0 2px #0B1F26" }} aria-hidden />}
                    </button>
                    <button type="button" onClick={() => setLocation("/menu")} aria-label="전체 메뉴" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[#FFFFFF14]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-[720px]">
                {/* 표지 위의 내 진행 */}
                <div className="relative overflow-hidden">
                    <img src={HIKING_HERO} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 58%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2633 0%,#0B1F26D9 62%,#0B1F26 100%)" }} aria-hidden />
                    <div className="relative px-5 pb-5 pt-[104px]">
                        <p className="text-[14px] text-[#F4EFE3CC] break-keep">{name ? `${name} 님, ` : ""}{verified.length ? "다음은 어느 산으로 갈까요?" : "첫 산을 골라 볼까요?"}</p>
                        <Link href={HIKING_PACK_PATH} className="mt-3 block active:opacity-80" data-testid="hk-home-grade"><GradeCard state={s.grade} heightSum={s.heightSum} /></Link>
                        <div className="mt-2.5 flex rounded-2xl bg-[#0B1F26B3] py-3.5 backdrop-blur-sm" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="hk-home-summary">
                            {([[verified.length, "오른 산"], [`${kfsGot}/${kfs.length || 100}`, "100대 명산"], [kfsGot + s.awards.filter((a) => a.kind === "patch" || a.kind === "grand").length, "와펜"]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#F4EFE399]">{label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Link href="/hiking" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]" data-track-as="hiking-home-find">산 찾기</Link>
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

                        <NearMe famous={s.famous} done={s.done} />

                        <SeasonNow mountains={s.famous} done={s.done} mine />

                        <HkSection title="내 산 지도" aside={verified.length ? `깃발 ${s.done.size}개` : "오른 산에 깃발이 꽂혀요"}>
                            <MountainMap mountains={s.famous} done={s.done} />
                        </HkSection>

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
                                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
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
            <HiqNavigation />
            <NotificationInbox open={inbox} onClose={() => setInbox(false)} />
        </div>
    );
}
