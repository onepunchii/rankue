/**
 * 우리 산악회가 가고 싶은 산(2026-10-13) — 산악회 홈(공용 크루 화면)에 놓이는 등산의 조각. '함께 오른 산'(CrewSummits) 바로 아래.
 *
 * 산악회 회원 여럿(shared/hikingWish 의 CREW_WISH_MIN 명 이상)이 '가고 싶은 산'에 담아 둔 산 — 다음 정기 산행을 고를 때 본다.
 * **누가 담았는지는 보여 주지 않는다 — 산과 사람 수뿐이다**(서버가 이름을 싣지 않는다). 사람 사이의 순위도 없다.
 * 산악회 회원만 본다(서버가 회원이 아니면 403) — 받는 동안 · 못 받았을 때 · 한 곳도 없을 때는 아무것도 그리지 않는다(홈을 빈 칸으로 늘리지 않는다).
 * 공용 크루 화면 안에 놓이지만 색은 등산의 것(리터럴)이다 — 제 바탕을 가진 한 칸이다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { duplicateNames, heightText, hikingMountainPath, mountainLabel } from "@shared/hikingMountains";
import { CREW_WISH_LABEL, CREW_WISH_MIN, crewWishAside, crewWishChip } from "@shared/hikingWish";
import { MountainPatch } from "../stamps/MountainPatch";
import { hikingCover } from "../theme";

interface CrewWish { mountainId: string; count: number; name: string; slug: string; heightM: number | null; region: string | null; kfs100: boolean }
export const crewWishesKey = (crewId: string) => [`/api/hiq/hiking/crews/${crewId}/wishes`] as const;

/** 담아 둔 산의 깃발 — 머리줄의 표시 */
const WishFlag = ({ className }: { className?: string }) => (
    <svg width="20" height="24" viewBox="0 0 20 24" className={className} aria-hidden>
        <path d="M4 22V3" stroke="#F6D9A8" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M4 3.5h12l-2.6 3.75L16 11H4Z" fill="#F6D9A8" stroke="#F6D9A8" strokeWidth="1" strokeLinejoin="round" />
    </svg>
);

export function CrewWishes({ crewId }: { crewId: string }) {
    // 등산이 열린 회원만 묻는다 — 안 열린 회원은 서버가 어차피 거절한다
    const mine = useHikingAccess();
    // 올 때마다 다시 받는다(내가 방금 담은 산이 바로 세어지게). 회원이 아니면 403 — 다시 묻지 않는다
    const { data, isLoading, isError } = useQuery<{ min: number; mountains: CrewWish[] }>({ queryKey: crewWishesKey(crewId), enabled: mine, staleTime: 0, retry: false });
    const list = data?.mountains ?? [];
    if (!mine || isLoading || isError || list.length === 0) return null;
    const dup = duplicateNames(list);
    return (
        <section className="overflow-hidden rounded-[22px] text-[#F4EFE3]" style={{ background: "#0E2A33", boxShadow: "inset 0 0 0 1px #FFFFFF14, 0 6px 16px rgba(0,0,0,0.25)" }} aria-label={CREW_WISH_LABEL.title}>
            <div className="flex items-center gap-3 px-4 pb-3 pt-3.5" style={{ background: "linear-gradient(135deg,#1F556099,#0E2A33)" }}>
                <WishFlag className="shrink-0" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16.5px] font-semibold tracking-tight break-keep">{CREW_WISH_LABEL.title}</h2>
                    <p className="mt-0.5 truncate text-[12.5px] text-[#F4EFE399]">{crewWishAside(data?.min ?? CREW_WISH_MIN)}</p>
                </div>
            </div>
            {/* 많이 담은 산부터 — 옆으로 넘겨 본다 */}
            <ul className="flex gap-2.5 overflow-x-auto px-4 pb-4 pt-1" style={{ scrollbarWidth: "none" }} data-testid="hk-crew-wishes" data-count={list.length} data-track-as="hiking-crew-wishes">
                {list.map((m) => (
                    <li key={m.mountainId} className="w-[132px] shrink-0">
                        <Link href={hikingMountainPath(m.slug)} className="relative block overflow-hidden rounded-2xl active:opacity-80" style={{ background: "#FFFFFF0F" }} data-testid={`hk-crew-wish-${m.mountainId}`}>
                            {/* 테두리는 그림 위에 얹는다 — 카드에 두면 그림에 가려 아래쪽에만 남는다 */}
                            <span className="pointer-events-none absolute inset-0 z-10 rounded-2xl" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} aria-hidden />
                            <span className="relative flex h-[84px] items-end justify-center overflow-hidden" style={{ background: "#0B1F26" }}>
                                <img src={hikingCover(m.region)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%" }} />
                                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2640,#0B1F2600 45%,#0E2A33F2)" }} aria-hidden />
                                {m.kfs100 && <MountainPatch id={m.mountainId} region={m.region} size={54} earned={false} preview className="relative mb-1" />}
                            </span>
                            <span className="block px-2.5 pb-2.5 pt-2">
                                <span className="block truncate text-[14.5px] font-semibold text-[#F4EFE3]">{mountainLabel(m, dup)}</span>
                                <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{heightText(m.heightM) || "산"}</span>
                                <span className="mt-2 inline-block max-w-full truncate rounded-full px-2 py-1 align-top text-[12px] font-medium tabular-nums leading-none" style={{ background: "#F6D9A824", color: "#F6D9A8" }}>{crewWishChip(m.count)}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
