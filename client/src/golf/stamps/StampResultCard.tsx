/**
 * 결과 화면의 도장첩 카드(2026-10-12) — 방금 끝낸 라운드가 도장첩의 어느 칸을 채웠는지, 그 권이 어디까지 찼는지.
 * 한 권이 이 라운드로 다 찼으면 그 권의 볼마커를 바로 보여 준다. 모으는 재미는 '찍히는 순간'에 생긴다.
 *
 * 그리는 조건: 내 기록이 현장 인증 도장이고(부르는 쪽이 enabled 로 건다), 그 골프장이 도장첩에 있을 때만.
 * 명단 밖 골프장 · 미인증 · 18홀 미완성에서는 아무것도 그리지 않는다(여권 도장 카드 OnSiteStampNote 가 그 이야기를 한다).
 *
 * 도장 통계는 이 화면에 들어올 때 한 번 새로 받는다 — 방장이 아닌 동반자는 끝내기 요청을 보내지 않아 캐시가 옛것일 수 있다.
 * ⚠️ 리터럴 색만(StampParts 머리말).
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight } from "@/lib/icons";
import { bookStates } from "@shared/golfStampBooks";
import { PASSPORT_STATS_KEY, fetchPassportStats, type PassportStatsResponse } from "../hooks/usePassportData";
import { BOOK_ART } from "./bookArt";
import { InkStamp } from "./InkStamp";
import { MarkerArt, SHELF_PATH, StampBar, bookPath } from "./StampParts";
import { stampDate } from "./stampDate";
import { stampMoment } from "./stampMoment";
import { shownStamp } from "./useStampCollection";

export function StampResultCard({ courseId, courseName, finishedAt, enabled }: {
    courseId?: string | null;
    courseName?: string | null;
    /** 라운드를 끝낸 때 — 도장의 날짜와 같으면 '방금 찍힌 도장'이다 */
    finishedAt?: string | Date | null;
    /** 내 기록이 현장 인증 도장일 때만 true */
    enabled: boolean;
}) {
    const { data } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
        enabled,
        refetchOnMount: "always",
    });
    const moment = useMemo(() => {
        if (!enabled || !data) return null;
        return stampMoment(bookStates((data.stamps ?? []).map(shownStamp)), { courseId, courseName });
    }, [enabled, data, courseId, courseName]);
    if (!moment) return null;

    const { state, mine, left } = moment;
    const { book } = state;
    const art = BOOK_ART[book.id];
    // 도장을 얻은 날이 이 라운드를 끝낸 날이면 방금 찍힌 도장, 아니면 예전에 찍어 둔 골프장을 다시 찾은 것
    const fresh = !!finishedAt && mine.stamp.date === stampDate(finishedAt);
    const justDone = fresh && state.done;

    return (
        <section aria-label="도장첩" className="rounded-[1.5rem] px-5 py-4 bg-[#E9B94912] ring-1 ring-inset ring-[#E9B94933]" data-testid="stamp-result" data-fresh={fresh ? "1" : "0"} data-done={state.done ? "1" : "0"}>
            <div className="flex items-center gap-3.5">
                <motion.span
                    className="shrink-0 rounded-[14px] bg-[#F4EFE3] p-1.5"
                    initial={fresh ? { scale: 1.5, opacity: 0, rotate: -14 } : false}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.25 }}
                >
                    <InkStamp name={mine.slot.name} date={mine.stamp.date} ink={art?.ink ?? "#2F6BD6"} glyph={art?.glyph ?? "tree"} size={76} tilt={-6} />
                </motion.span>
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-[#FFD36B] break-keep">{fresh ? "도장첩에 도장이 찍혔어요" : "다시 찾은 골프장이에요"}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[#FFFFFF8C] break-keep">
                        {book.name} 도장첩 · {mine.slot.name}{!fresh && ` · 첫 도장 ${mine.stamp.date}`}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                        <StampBar got={state.got} total={state.total} className="flex-1" />
                        <span className="text-[13px] tabular-nums text-[#FFFFFFCC]"><b className="font-semibold text-[#FFFFFF]">{state.got}</b>/{state.total}</span>
                    </div>
                </div>
            </div>
            {state.done ? (
                <Link href={SHELF_PATH} className="mt-3 flex items-center gap-3 rounded-2xl bg-[#00000040] px-3 py-2.5 active:bg-[#00000066]" data-testid="stamp-result-marker">
                    <MarkerArt bookId={book.id} size={52} earned />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-[#FFFFFF] break-keep">{justDone ? `${book.name} 볼마커를 받았어요` : `${book.name} 볼마커를 가지고 있어요`}</span>
                        <span className="block mt-0.5 text-[12.5px] text-[#FFFFFF8C] break-keep">{justDone ? "도장첩을 다 채웠어요 — 장식장에 놓였어요" : "다 채운 도장첩이에요"}</span>
                    </span>
                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFD36B]" aria-hidden />
                </Link>
            ) : (
                <Link href={bookPath(book.id)} className="mt-3 flex items-center gap-1 text-[13.5px] text-[#FFFFFFCC] active:text-[#FFFFFF]" data-testid="stamp-result-book">
                    <span className="flex-1 break-keep">{left}곳 더 찍으면 {book.name} 볼마커를 받아요</span>
                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                </Link>
            )}
        </section>
    );
}

export default StampResultCard;
