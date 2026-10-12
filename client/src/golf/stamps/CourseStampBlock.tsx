/**
 * 골프장 공개 페이지의 도장첩 띠(2026-10-12 오너: "골프 코스도 해당 우리가 만든 이미지 같이 들어가면 너무 좋을 거 같은데").
 *
 * 이 골프장이 도장첩의 한 칸이면 그 권의 표지 · 내 도장(또는 빈 칸)을 보여 주고, 누르면 그 권으로 간다.
 * 엘리트 명단 밖의 골프장에서는 아무것도 그리지 않는다.
 *
 *   회원 · 도장 있음   또렷한 도장 + 찍은 날
 *   회원 · 미인증만     흐린 도장 + '현장 인증이 없어요'
 *   회원 · 아직          빈 칸 + 그 권의 진행(3/7)
 *   방문자               빈 칸 + 어떻게 찍히는지 한 줄(내 것을 부르지 않는다 — 401 만 돌아온다)
 *
 * 공개 페이지라 검색으로 들어온 사람도 본다. ⚠️ 리터럴 색만(CourseShell 머리말), 글자 12px 이상.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LucideChevronRight } from "@/lib/icons";
import { bookStates, slotForCourseIds } from "@shared/golfStampBooks";
import { PASSPORT_STATS_KEY, fetchPassportStats, type PassportStatsResponse } from "../hooks/usePassportData";
import { BOOK_ART, coverSrc } from "./bookArt";
import { InkStamp } from "./InkStamp";
import { StampBar, bookPath } from "./StampParts";
import { shownStamp } from "./useStampCollection";

export function CourseStampBlock({ courseIds, className }: { courseIds: readonly number[] | null | undefined; className?: string }) {
    const at = useMemo(() => slotForCourseIds(courseIds), [courseIds]);
    const { member } = useAuth();
    const { data } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
        // 도장첩의 골프장일 때만, 회원일 때만 부른다
        enabled: !!member && !!at,
    });
    const mine = useMemo(() => {
        if (!at || !data) return null;
        const state = bookStates((data.stamps ?? []).map(shownStamp), (data.recordStamps ?? []).map(shownStamp)).find((s) => s.book.id === at.book.id)!;
        return { state, slot: state.slots.find((s) => s.slot.key === at.slot.key)! };
    }, [at, data]);
    if (!at) return null;

    const { book, slot } = at;
    const art = BOOK_ART[book.id];
    const stamp = mine?.slot.stamp ?? null, record = mine?.slot.record ?? null;
    const line = stamp
        ? `도장을 찍었어요 · ${stamp.date}`
        : record
            ? "현장 인증 없이 적은 기록만 있어요 — 여기서 끝내면 도장이 또렷해져요"
            : `여기서 18홀을 끝내면 ${book.name} 도장첩에 도장이 찍혀요`;

    return (
        <div className={className} data-testid="course-stamp-block" data-book={book.id} data-state={stamp ? "on" : record ? "record" : "empty"}>
            <Link href={bookPath(book.id)} className="flex items-center gap-3 rounded-2xl bg-[#FFFFFF08] p-3 active:bg-[#FFFFFF14]">
                <div className="relative w-[58px] shrink-0 aspect-[3/4] overflow-hidden rounded-[8px] bg-[#1A1A1A]">
                    <img src={coverSrc(book.id)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[#FFD36B]">랭큐 도장첩</p>
                    <p className="mt-0.5 text-[15px] font-semibold leading-tight text-[#FFFFFF] break-keep">{book.name} 도장첩의 한 칸</p>
                    <p className="mt-1 text-[13px] leading-snug text-[#FFFFFF99] break-keep">{line}</p>
                    {mine && (
                        <div className="mt-2 flex items-center gap-2">
                            <StampBar got={mine.state.got} total={mine.state.total} className="flex-1" />
                            <span className="text-[12px] tabular-nums text-[#FFFFFFB3]">{mine.state.got}/{mine.state.total}</span>
                        </div>
                    )}
                </div>
                <span className={cn("shrink-0 rounded-[12px] bg-[#F4EFE3] p-1")}>
                    <InkStamp name={slot.name} date={(stamp ?? record)?.date} ink={art?.ink ?? "#2F6BD6"} glyph={art?.glyph ?? "tree"} size={62} state={stamp ? "on" : record ? "faded" : "empty"} tilt={stamp ? -6 : 0} />
                </span>
                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
            </Link>
        </div>
    );
}

export default CourseStampBlock;
