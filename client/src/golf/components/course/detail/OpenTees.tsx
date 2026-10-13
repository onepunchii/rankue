/**
 * 공식 사이트의 남은 티(2026-10-13 오너: "골프장 취소티 가져오자") — 그 골프장의 공식 예약 화면에 로그인 없이 공개된 티타임.
 *
 * 날짜를 고르면 그 날의 남은 티(시간 · 코스 · 요금)가 나온다. 예약은 우리가 받지 않는다 — 맨 아래 단추가 그 골프장의 예약 화면으로 보낸다.
 * 받는 곳이 아니거나(대부분의 골프장은 로그인 뒤에만 보여 준다) 받은 것이 없으면 구역을 그리지 않는다.
 * 받은 값은 조금 전의 것이다 — 확인한 시각을 같이 적고, 오래된 날 · 이미 지난 시각은 화면에서도 한 번 더 거른다(기기에 남은 옛 답을 그리지 않게).
 * 규칙 · 받는 곳: shared/golfOpenTee. ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { LucideArrowUpRight } from "@/lib/icons";
import { OPEN_TEE_COPY, kstClock, kstDay, teeBookingUrl, teeDayLabel, teePriceText, teeSource, teeStillAhead, type OpenTeeDay } from "@shared/golfOpenTee";
import { outsideLinkClick } from "@/lib/openOutside";
import { useCourseOpenTees } from "../../../lib/courseApi";
import { Card } from "./ui";

/** 처음에 보이는 줄 수 — 넘으면 '더 보기' */
const FIRST = 6;
/** 이보다 오래 확인하지 못한 날은 그리지 않는다(서버와 같은 기준) */
const FRESH_MS = 12 * 3_600_000;

export function OpenTees({ slug, className }: { slug: string; className?: string }) {
    const q = useCourseOpenTees(slug);
    const [pick, setPick] = useState<string | null>(null);
    const [all, setAll] = useState(false);
    const now = Date.now();
    const days: OpenTeeDay[] = useMemo(() => {
        const today = kstDay(now);
        return (q.data?.days ?? []).filter((d) => d.day >= today && now - d.checkedAt <= FRESH_MS)
            .map((d) => ({ ...d, tees: d.tees.filter((t) => teeStillAhead(d.day, t.time, now)) }));
        // now 는 그릴 때마다 달라진다 — 답이 바뀔 때만 다시 거른다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q.data]);
    const total = days.reduce((n, d) => n + d.tees.length, 0);
    if (!q.data || !days.length) return null;

    const day = days.find((d) => d.day === pick) ?? days.find((d) => d.tees.length) ?? days[0];
    // 골프장 예약 화면 — 그 사이트가 날짜를 받으면 고른 날이 열린 화면으로(달력에서 다시 찾지 않게)
    const source = teeSource(slug);
    const go = source ? teeBookingUrl(source, day.day) : q.data.page;
    const rows = all ? day.tees : day.tees.slice(0, FIRST);
    const more = day.tees.length - rows.length;

    return (
        <section className={className} data-testid="open-tees" aria-label={OPEN_TEE_COPY.title}>
            <Card className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
                    <h3 className="text-[15px] font-semibold text-[#FFFFFF]">{OPEN_TEE_COPY.title}</h3>
                    <span className="shrink-0 text-[12px] text-[#FFFFFF80]">이레 동안 {total}개</span>
                </div>

                {/* 날짜 — 옆으로 민다. 남은 티가 없는 날은 흐리게(눌러 볼 수는 있다) */}
                <div className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="날짜">
                    {days.map((d) => {
                        const on = d.day === day.day;
                        return (
                            <button key={d.day} type="button" role="tab" aria-selected={on} onClick={() => { setPick(d.day); setAll(false); }}
                                className={cn("shrink-0 rounded-full px-3 h-9 text-[13px] transition-colors", on ? "bg-[#FF6B00] font-semibold text-[#1A0A00]" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] active:bg-[#FFFFFF1F]", !on && !d.tees.length && "text-[#FFFFFF59]")}
                                data-testid={`open-tee-day-${d.day}`}>
                                {teeDayLabel(d.day, now)}
                                <span className={cn("ml-1.5 tabular-nums", on ? "text-[#1A0A00B3]" : "text-[#FFFFFF59]")}>{d.tees.length}</span>
                            </button>
                        );
                    })}
                </div>

                {day.tees.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[13px] text-[#FFFFFF80]">{OPEN_TEE_COPY.empty}</p>
                ) : (
                    <ul className="mt-2 divide-y divide-[#FFFFFF0F] px-4" role="tabpanel">
                        {rows.map((t) => (
                            <li key={`${t.time}|${t.course}`} className="flex items-center gap-3 py-2.5">
                                <span className="w-[52px] shrink-0 text-[16px] font-semibold tabular-nums text-[#FFFFFF]">{t.time}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] text-[#FFFFFFD9]">{[t.course, t.holes ? `${t.holes}홀` : ""].filter(Boolean).join(" · ") || "코스 표시 없음"}</span>
                                    {t.fresh && <span className="mt-0.5 inline-block rounded-full bg-[#FF6B0026] px-1.5 text-[12px] font-medium text-[#FF8A33]">{OPEN_TEE_COPY.fresh}</span>}
                                </span>
                                <span className="shrink-0 text-right">
                                    {t.listPrice != null && <span className="block text-[12px] text-[#FFFFFF59] line-through tabular-nums">{teePriceText(t.listPrice)}</span>}
                                    <span className="block text-[14px] font-semibold tabular-nums text-[#FFFFFF]">{teePriceText(t.price) || "요금은 골프장에서"}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {more > 0 && (
                    <button type="button" onClick={() => setAll(true)} className="mx-4 mt-1 h-10 w-[calc(100%-2rem)] rounded-xl bg-[#FFFFFF0A] text-[13px] text-[#FFFFFFB3] active:bg-[#FFFFFF14]" data-testid="open-tee-more">
                        {more}개 더 보기
                    </button>
                )}

                <div className="mt-3 border-t border-[#FFFFFF0F] px-4 py-3.5">
                    <p className="text-[12px] leading-relaxed text-[#FFFFFF80]">{OPEN_TEE_COPY.note} <span className="whitespace-nowrap">확인 {kstClock(day.checkedAt)}</span></p>
                    {/* 앱에서는 앱 안 브라우저 창으로 연다 — 닫으면 보던 화면이고, 휴대폰에 저장된 비밀번호 · 자동 채움이 그대로 듣는다(lib/openOutside) */}
                    <a href={go} target="_blank" rel="noopener noreferrer nofollow" onClick={outsideLinkClick(go)} data-track-as="golf-open-tee-go"
                        className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#FFFFFF14] text-[14px] font-semibold text-[#FFFFFF] active:bg-[#FFFFFF24]" data-testid="open-tee-go">
                        {OPEN_TEE_COPY.go}
                        <LucideArrowUpRight className="h-4 w-4" aria-hidden />
                    </a>
                </div>
            </Card>
        </section>
    );
}
