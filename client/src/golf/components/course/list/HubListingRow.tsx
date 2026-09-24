/**
 * 허브(부킹·조인·긴급)의 글 한 줄(2026-09-24) — 공개 요약이라 연락처·글쓴이가 없다.
 * 읽는 순서: 언제(날짜·시각·부) → 어디(골프장·시군) → 얼마 → 조인이면 남은 자리.
 */
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { cityShort, teePart, wonShort } from "@shared/golfCourse";
import type { HubListing } from "../../../lib/courseApi";
import { SlotDots, dayLabel, hostSeatLabel, slotsOf } from "../../join/joinUi";

/** 티오프까지 남은 시간(긴급은 날짜가 아니라 시간이 문제다). */
function timeLeft(iso: string, now: number): string {
    const min = Math.round((Date.parse(iso) - now) / 60_000);
    if (!Number.isFinite(min) || min <= 0) return "곧 시작";
    if (min < 60) return `${min}분 뒤`;
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? `${h}시간 뒤` : `${h}시간 ${m}분 뒤`;
}

export function HubListingRow({ l, now, onOpen }: { l: HubListing; now: number; onOpen: (l: HubListing) => void }) {
    const isJoin = l.listingType === "JOIN";
    const key = kstDateKey(l.datetime);
    const rel = dayLabel(key, kstDateKey(now));
    const [, mm, dd] = key.split("-").map(Number);
    const left = isJoin ? Math.max(0, l.joinCapacity - l.joinApplied) : null;
    const price = l.costMode === "SPLIT" ? "1/N" : l.greenFee ? wonShort(l.greenFee) : "";
    const accent = l.isUrgent ? "#FF3B30" : isJoin ? "#FF6B00" : "#64DD17";

    return (
        <li>
            <button
                type="button" onClick={() => onOpen(l)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-[#FFFFFF08] transition-colors"
            >
                {/* 날짜 칸 — 오늘·내일이면 그 말이, 아니면 월/일이 크게 */}
                <span className="w-[52px] shrink-0 rounded-xl border py-1.5 text-center" style={{ borderColor: `${accent}40`, backgroundColor: `${accent}14` }}>
                    <span className="block text-[15px] font-semibold leading-tight tabular-nums" style={{ color: rel === "오늘" || rel === "내일" ? accent : "#FFFFFF" }}>
                        {rel === "오늘" || rel === "내일" ? rel : `${mm}/${dd}`}
                    </span>
                    <span className="block text-[12px] leading-tight text-[#FFFFFF73]">
                        {kstDateLabel(l.datetime, { month: undefined, day: undefined, weekday: "short" })}
                    </span>
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                        {l.isUrgent && <span className="shrink-0 h-5 px-1.5 rounded-md bg-[#FF3B3024] text-[#FF6B63] text-[12px] font-semibold leading-5">긴급</span>}
                        <span className="text-[15px] font-semibold text-[#FFFFFF] truncate">{l.courseName}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[#FFFFFF80] truncate tabular-nums">
                        {kstTime(l.datetime)} · {teePart(l.datetime)}부{l.city ? ` · ${cityShort(l.city)}` : ""}
                        {l.isUrgent ? <span className="text-[#FF6B63]"> · {timeLeft(l.datetime, now)}</span> : null}
                    </span>
                </span>

                <span className="shrink-0 text-right">
                    {price && <span className="block text-[15px] font-semibold text-[#FFFFFF] tabular-nums whitespace-nowrap">{price}</span>}
                    {isJoin ? (
                        <span className="mt-1 flex items-center justify-end gap-1.5">
                            <SlotDots slots={slotsOf(l)} filled={l.joinApplied} size={14} hostLabel={hostSeatLabel(l)} />
                            <span className={cn("text-[12px] whitespace-nowrap", left ? "text-[#FF8A33]" : "text-[#FFFFFF59]")}>{left ? `${left}자리` : "마감"}</span>
                        </span>
                    ) : (
                        <span className="mt-0.5 block text-[12px] text-[#FFFFFF66] whitespace-nowrap">{l.sellerType === "PERSONAL" ? "개인 양도" : "1팀"}</span>
                    )}
                </span>
            </button>
        </li>
    );
}
