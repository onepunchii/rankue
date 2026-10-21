/**
 * 코리아둘레길 입구(2026-10-21) — 등산 허브 · 등산 홈의 그림 카드 한 장. 누르면 /hiking/trails.
 * 표지는 우리 그림(해안 길의 등대)이라 잘라 써도 된다. 숫자는 shared/koreaTrails 의 길 넷(두루누비 길 소개 그대로).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { TRAILS_H1, TRAILS_PATH, TRAIL_ROUTES, TRAIL_TOTAL_COURSES, TRAIL_TOTAL_KM } from "@shared/koreaTrails";

const COVER = "/hiking/art/cover-trails.webp";

export function TrailsEntry({ className }: { className?: string }) {
    return (
        <div className={`px-5 pt-8 ${className ?? ""}`}>
            <Link href={TRAILS_PATH} className="relative block overflow-hidden rounded-2xl active:opacity-90" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="trails-entry">
                <img src={COVER} alt="" width={880} height={880} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 72%" }} />
                <span className="absolute inset-0" style={{ background: "linear-gradient(90deg,#0B1F26F2 0%,#0B1F26B3 55%,#0B1F2633 100%)" }} aria-hidden />
                <span className="relative block px-4 py-4">
                    <span className="text-[12.5px] font-medium text-[#F6D9A8]">국토종주 · 걷기</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[20px] font-semibold tracking-tight text-[#F4EFE3]">{TRAILS_H1}<LucideChevronRight weight="bold" className="h-4 w-4 text-[#F28C6A]" aria-hidden /></span>
                    <span className="mt-1 block text-[13px] tabular-nums text-[#F4EFE3CC]">{TRAIL_TOTAL_COURSES}개 코스 · {TRAIL_TOTAL_KM.toLocaleString("en-US")}km</span>
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
