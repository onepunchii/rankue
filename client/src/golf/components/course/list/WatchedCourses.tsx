/**
 * 내 예약 › 관심 골프장(2026-09-24) — 관심 등록한 골프장과 그 조건, 지금 올라온 글 수.
 * 조건 한 줄은 상세의 '관심 중' 단추와 같은 말(WatchSheet.watchSummary)을 쓴다.
 */
import { Link } from "wouter";
import { LucideChevronRight, LucideLoader2 } from "@/lib/icons";
import { cityShort, coursePath } from "@shared/golfCourse";
import { useMyWatches } from "../../../lib/courseApi";
import { watchSummary } from "../WatchSheet";
import { LiveBadges } from "./CourseRow";

export function WatchedCourses({ enabled }: { enabled: boolean }) {
    const q = useMyWatches(enabled);
    if (!enabled) return <p className="py-6 text-[13px] text-[#FFFFFF66]">로그인하면 관심 골프장을 볼 수 있어요.</p>;
    if (q.isPending) return <div className="flex items-center gap-2 py-6 text-[#FFFFFF66]"><LucideLoader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">불러오는 중…</span></div>;
    if (q.isError) return <p className="py-6 text-[13px] text-[#FFFFFF66]">불러오지 못했어요.</p>;
    const rows = q.data ?? [];
    if (!rows.length) {
        return (
            <div className="py-8 space-y-4">
                <p className="text-[13px] text-[#FFFFFF66]">관심 골프장이 없어요. 등록하면 취소티가 올라올 때 알려 드려요.</p>
                <Link href="/golf/courses" className="inline-flex h-11 px-5 items-center rounded-full bg-[#64DD17] text-[#051907] text-[14px] font-semibold">
                    골프장 둘러보기
                </Link>
            </div>
        );
    }
    return (
        <section className="space-y-2">
            <h2 className="text-[12px] font-medium text-[#FFFFFF80]">관심 {rows.length}</h2>
            <ul className="rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] overflow-hidden divide-y divide-[#FFFFFF0F]">
                {rows.map((w) => (
                    <li key={w.slug}>
                        <Link href={coursePath(w.slug)} className="flex items-center gap-3 px-3.5 py-3 active:bg-[#FFFFFF08]">
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[14px] font-medium text-[#FFFFFF] truncate">{w.name}</span>
                                    <span className="shrink-0 text-[12px] text-[#FFFFFF66]">{cityShort(w.city) || w.region}</span>
                                </span>
                                <span className="mt-0.5 block text-[12px] text-[#FFFFFF80] truncate">{watchSummary(w.filters) || "모든 티타임"}</span>
                            </span>
                            <LiveBadges counts={w.counts} className="shrink-0" />
                            <LucideChevronRight className="w-4 h-4 text-[#FFFFFF40] shrink-0" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
