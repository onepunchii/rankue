/**
 * 코리아둘레길 입구(2026-10-21) — 등산 허브 · 등산 홈의 그림 카드 한 장. 누르면 /hiking/trails.
 * 표지는 우리 그림(해안 길의 등대)이라 잘라 써도 된다. 숫자는 shared/koreaTrails 의 길 넷(두루누비 길 소개 그대로).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { TRAILS_H1, TRAILS_PATH, TRAIL_ROUTES, TRAIL_TOTAL_COURSES, TRAIL_TOTAL_KM, type TrailRouteId } from "@shared/koreaTrails";
import { TrailStampSeal, useMyTrails } from "./TrailStamp";

const COVER = "/hiking/art/cover-trails.webp";

export function TrailsEntry({ className }: { className?: string }) {
    // 내 코스 도장(등산 회원만) — 있으면 최근 셋과 수, 출발 확인만 한 코스가 있으면 그 한 줄(2026-10-21)
    const my = useMyTrails();
    const recent = [...(my?.stamps ?? [])].sort((a, b) => Date.parse(b.doneAt) - Date.parse(a.doneAt)).slice(0, 3);
    const open = my?.open?.length ?? 0;
    return (
        <div className={`px-5 pt-8 ${className ?? ""}`}>
            <Link href={TRAILS_PATH} className="relative block overflow-hidden rounded-2xl active:opacity-90" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="trails-entry">
                <img src={COVER} alt="" width={880} height={880} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 72%" }} />
                <span className="absolute inset-0" style={{ background: "linear-gradient(90deg,#0B1F26F2 0%,#0B1F26B3 55%,#0B1F2633 100%)" }} aria-hidden />
                <span className="relative block px-4 py-4">
                    <span className="text-[12.5px] font-medium text-[#F6D9A8]">국토종주 · 걷기</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[20px] font-semibold tracking-tight text-[#F4EFE3]">{TRAILS_H1}<LucideChevronRight weight="bold" className="h-4 w-4 text-[#F28C6A]" aria-hidden /></span>
                    <span className="mt-1 block text-[13px] tabular-nums text-[#F4EFE3CC]">{TRAIL_TOTAL_COURSES}개 코스 · {TRAIL_TOTAL_KM.toLocaleString("en-US")}km</span>
                    {my && (my.stamps.length > 0 || open > 0) && (
                        <span className="mt-2.5 flex items-center gap-2" data-testid="trails-entry-mine">
                            {recent.map((x) => (
                                <span key={x.courseId} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4EFE3]" aria-hidden><TrailStampSeal route={x.route as TrailRouteId} label={x.key} state="done" size={30} /></span>
                            ))}
                            <span className="text-[13px] font-semibold tabular-nums text-[#F6D9A8]">
                                {my.stamps.length > 0 ? `내 코스 도장 ${my.stamps.length}` : ""}{my.stamps.length > 0 && open > 0 ? " · " : ""}{open > 0 ? `출발 확인 ${open}` : ""}
                            </span>
                        </span>
                    )}
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                        {TRAIL_ROUTES.map((r) => (
                            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-[#0B1F26B3] px-2 py-1 text-[12px] text-[#F4EFE3E6]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />{r.name}</span>
                        ))}
                    </span>
                </span>
            </Link>
        </div>
    );
}
