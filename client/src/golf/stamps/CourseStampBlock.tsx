/**
 * 골프장 공개 페이지의 도장 구역(2026-10-12).
 * 오너: "골프 코스도 해당 우리가 만든 이미지 같이 들어가면 너무 좋을 거 같은데" → "골프장 상세에도 해당 지역에 이미지와 도장 볼마커 등등이 들어가면 좋을 거 같고".
 *
 * **모든 골프장**에 붙는다 — 그 골프장 권역의 표지 그림 위에, 여기서 받는 도장과 그 권역의 볼마커:
 *   도장첩의 골프장(엘리트)   그 권의 표지 · 그 권의 색으로 찍힌 도장(또는 빈 칸) · 그 권의 볼마커와 진행. 전체가 그 권으로 가는 링크.
 *   그 밖의 골프장             권역의 표지 · 먹색 깃대 도장(골프 여권의 도장) · 아래에 그 권역 도장첩으로 가는 한 줄.
 *
 * 내 도장은 회원일 때만 부른다(방문자는 401 만 돌아온다). 방문자에게는 받는 것의 모습만 보여 준다.
 *   엘리트: 공개 페이지의 줄 번호(courseIds)로 칸을 찾고, 그 칸의 원장 번호로 내 도장을 찾는다 — 정확하다.
 *   그 밖: 페이지 이름과 도장 이름의 꼬리(CC · 컨트리클럽)를 떼고 글자가 같을 때만 '찍었어요'. 못 찾으면 '아직'이라고 하지 않고
 *          어떻게 찍히는지만 말한다(이름이 달라 못 찾은 것일 수 있다).
 *
 * 공개 페이지라 검색으로 들어온 사람도 본다. ⚠️ 리터럴 색만(CourseShell 머리말), 글자 12px 이상.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { LucideChevronRight } from "@/lib/icons";
import { bookStates, slotForCourseIds, stampBook, type StampBook } from "@shared/golfStampBooks";
import { PASSPORT_STATS_KEY, fetchPassportStats, type PassportStatsResponse } from "../hooks/usePassportData";
import { BOOK_ART, PLAIN_STAMP, coverSrc } from "./bookArt";
import { InkStamp } from "./InkStamp";
import { MarkerArt, STAMPS_PATH, StampBar, bookPath } from "./StampParts";
import { regionBookId } from "./regionBook";
import { stampLabel } from "./stampLabel";
import { shownStamp } from "./useStampCollection";

/** 이름의 꼬리를 떼고 공백 · 대소문자를 무시한 알맹이 — 도장첩 밖 골프장의 내 도장을 찾을 때 */
const core = (v: string) => stampLabel(v).replace(/\s+/g, "").toLowerCase();

export function CourseStampBlock({ courseIds, name, region, city, className }: {
    courseIds: readonly number[] | null | undefined;
    name: string;
    region?: string | null;
    city?: string | null;
    className?: string;
}) {
    const at = useMemo(() => slotForCourseIds(courseIds), [courseIds]);
    const { member } = useAuth();
    const { data } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
        // 회원일 때만 부른다 — 방문자는 받는 것의 모습만 본다
        enabled: !!member,
    });
    // 이 골프장이 든 권(엘리트) 또는 이 권역의 권(그 밖). 권이 없는 권역이면 null
    const book: StampBook | null = at?.book ?? stampBook(regionBookId(region, city) ?? "") ?? null;
    const mine = useMemo(() => {
        if (!data) return null;
        const stamps = (data.stamps ?? []).map(shownStamp), records = (data.recordStamps ?? []).map(shownStamp);
        const state = book ? bookStates(stamps, records).find((s) => s.book.id === book.id) ?? null : null;
        if (at) {
            const slot = state?.slots.find((s) => s.slot.key === at.slot.key);
            return { state, stamp: slot?.stamp ?? null, record: slot?.record ?? null };
        }
        const key = core(name);
        return { state, stamp: stamps.find((s) => core(s.name) === key) ?? null, record: records.find((s) => core(s.name) === key) ?? null };
    }, [data, at, book, name]);

    const art = (at && BOOK_ART[at.book.id]) || PLAIN_STAMP;
    const stampName = at ? at.slot.name : stampLabel(name);
    const stamp = mine?.stamp ?? null, record = mine?.record ?? null;
    const where = at ? `${at.book.name} 도장첩` : "골프 여권";
    const line = stamp
        ? `도장을 찍었어요 · ${stamp.date}`
        : record
            ? "현장 인증 없이 적은 기록만 있어요 — 여기서 끝내면 도장이 또렷해져요"
            : `여기서 18홀을 끝내면 ${where}에 도장이 찍혀요`;
    // 엘리트의 빈 칸은 '아직'이 맞다(번호로 찾았다). 그 밖은 못 찾았다고 빈 칸으로 그리지 않는다 — 받는 도장의 모습으로
    const state = stamp ? "on" : record ? "faded" : at && member ? "empty" : "on";
    // 받는 도장의 모습(아직 내 도장이 아니다)은 조금 옅게 그린다
    const preview = !stamp && !record && state === "on";
    const cover = coverSrc(book?.id ?? "gyeonggi");
    const dark = !!BOOK_ART[book?.id ?? "gyeonggi"]?.darkSky;
    const done = !!mine?.state?.done;

    const top = (
        <>
            <div className="relative h-[92px] overflow-hidden">
                <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 30%" }} loading="lazy" decoding="async" draggable={false} />
                <div className="absolute inset-0" style={{ background: dark ? "linear-gradient(90deg,#00000099,#00000026 60%,#00000000)" : "linear-gradient(90deg,#FFF6DED9,#FFF6DE59 42%,#FFF6DE00 72%)" }} aria-hidden />
                <div className="absolute left-3.5 top-3 right-24" style={{ color: dark ? "#FFFFFF" : "#17324A" }}>
                    <p className="text-[12px] opacity-80">{at ? "랭큐 도장첩" : "골프 여권"}</p>
                    <p className="mt-0.5 text-[17px] font-semibold leading-tight tracking-tight break-keep">{at ? `${at.book.name} 도장첩의 한 칸` : `${stampName} 도장`}</p>
                </div>
                {book && <MarkerArt bookId={book.id} size={60} earned={member ? done : true} className="absolute right-3.5 top-4" />}
            </div>
            <div className="flex items-center gap-3 p-3">
                <span className="shrink-0 rounded-[12px] bg-[#F4EFE3] p-1" style={preview ? { opacity: 0.6 } : undefined} data-preview={preview ? "1" : "0"}>
                    <InkStamp name={stampName} date={(stamp ?? record)?.date} ink={art.ink} glyph={art.glyph} size={64} state={state} tilt={stamp ? -6 : 0} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug text-[#FFFFFFCC] break-keep">{line}</p>
                    {at && mine?.state && (
                        <div className="mt-2 flex items-center gap-2">
                            <StampBar got={mine.state.got} total={mine.state.total} className="flex-1" />
                            <span className="text-[12px] tabular-nums text-[#FFFFFFB3]">{mine.state.got}/{mine.state.total}</span>
                        </div>
                    )}
                    {at && <p className="mt-1.5 text-[12px] text-[#FFD36B] break-keep">{done ? `${at.book.name} 볼마커를 가지고 있어요` : `다 채우면 ${at.book.name} 볼마커`}</p>}
                </div>
                {at && <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />}
            </div>
        </>
    );

    return (
        <div className={className} data-testid="course-stamp-block" data-book={at?.book.id ?? ""} data-region-book={book?.id ?? ""} data-state={stamp ? "on" : record ? "record" : "empty"}>
            <div className="overflow-hidden rounded-2xl bg-[#FFFFFF08]">
                {at
                    ? <Link href={bookPath(at.book.id)} className="block active:bg-[#FFFFFF0F]">{top}</Link>
                    : (
                        <>
                            {top}
                            {/* 도장첩 밖의 골프장 — 이 권역의 도장첩으로 가는 한 줄(권이 없는 권역이면 책장으로) */}
                            <Link href={book ? bookPath(book.id) : STAMPS_PATH} className="flex items-center gap-2 border-t border-[#FFFFFF0F] px-3.5 py-2.5 text-[13px] text-[#FFFFFFB3] active:bg-[#FFFFFF0F]" data-testid="course-stamp-region">
                                <span className="min-w-0 flex-1 break-keep">
                                    {book ? `이 권역의 도장첩 — ${book.name}${mine?.state ? ` ${mine.state.got}/${mine.state.total}` : ` ${book.slots.length}곳`}` : "도장첩 책장 보기"}
                                </span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                            </Link>
                        </>
                    )}
            </div>
        </div>
    );
}

export default CourseStampBlock;
