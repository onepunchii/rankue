/**
 * 골프 홈 — 지금 남은 티(2026-10-13 오너: "골프가 데이터의 변화들이 없어서 유저들이 와도 즐길 거리가 없다 — 골프장 취소티 가져오자").
 *
 * 골프장 공식 예약 화면에 로그인 없이 공개된 티타임을 여러 곳에서 모아 한 줄씩 — 새로 나온 것 먼저, 그다음 가까운 날. 20분마다 달라지는 구역이다.
 * 한 줄을 누르면 그 골프장의 화면으로 간다(거기서 날짜별 전부와 골프장 예약 화면으로 가는 단추를 본다). 예약은 우리가 받지 않는다.
 * 받은 것이 없으면 구역을 그리지 않는다. 로그인 없이 보인다(공개 자료다).
 * 규칙 · 받는 곳: shared/golfOpenTee. ⚠️ 리터럴 색만. 글자 12px 이상.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { coursePath } from "@shared/golfCourse";
import { kstClock, kstDay, teeDayLabel, teePriceText, teeStillAhead } from "@shared/golfOpenTee";
import { useOpenTeeFeed } from "../../lib/courseApi";

/** 홈에 보이는 줄 수 */
const ROWS = 5;
const FRESH_MS = 12 * 3_600_000;

export function OpenTeeHome() {
    const q = useOpenTeeFeed();
    const now = Date.now();
    const rows = useMemo(() => {
        const today = kstDay(now);
        // 기기에 남은 옛 답을 그리지 않게 한 번 더 거른다
        return (q.data ?? []).filter((t) => t.day >= today && now - t.checkedAt <= FRESH_MS && teeStillAhead(t.day, t.time, now)).slice(0, ROWS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q.data]);
    if (!rows.length) return null;
    const checked = Math.max(...rows.map((r) => r.checkedAt));
    const courses = new Set((q.data ?? []).map((r) => r.slug)).size;

    return (
        <section className="relative z-10 mb-4 w-full overflow-hidden rounded-[2rem] bg-[#141414] ring-1 ring-inset ring-[#FFFFFF1A]" data-testid="open-tee-home" aria-label="지금 남은 티">
            <div className="px-6 pt-6">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.12em] text-[#FFFFFFD9]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B00]" />
                    지금 남은 티
                </span>
                <p className="mt-2 text-[22px] font-extrabold leading-tight text-[#FFFFFF]">공식 사이트에<br />열려 있는 티타임</p>
                <p className="mt-1.5 text-[13px] text-[#FFFFFF80]">골프장 {courses}곳 · 확인 {kstClock(checked)}</p>
            </div>
            <ul className="mt-4 divide-y divide-[#FFFFFF0F] px-3">
                {rows.map((t) => (
                    <li key={`${t.slug}|${t.day}|${t.time}|${t.course}`}>
                        <Link href={coursePath(t.slug)} className="flex items-center gap-3 rounded-xl px-3 py-3 active:bg-[#FFFFFF0A]" data-track-as="golf-open-tee-home-row">
                            <span className="w-[62px] shrink-0">
                                <span className="block text-[12px] text-[#FFFFFF80]">{teeDayLabel(t.day, now)}</span>
                                <span className="block text-[17px] font-bold tabular-nums text-[#FFFFFF]">{t.time}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold text-[#FFFFFF]">{t.name}</span>
                                {/* 자리는 줄어들고(…) '새로 나옴'은 줄어들지 않는다 — 한 줄에 같이 넣으면 딱지가 잘린다 */}
                                <span className="flex items-center gap-1.5 text-[12px] text-[#FFFFFF80]">
                                    <span className="min-w-0 truncate">{[t.region, t.city].filter(Boolean).join(" ")}</span>
                                    {t.fresh && <span className="shrink-0 rounded-full bg-[#FF6B0026] px-1.5 font-medium text-[#FF8A33]">새로 나옴</span>}
                                </span>
                            </span>
                            <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[#FFFFFF]">{teePriceText(t.price)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            <p className="px-6 pb-5 pt-3 text-[12px] leading-relaxed text-[#FFFFFF66]">골프장 공식 예약 화면에 공개된 티타임이에요. 예약은 골프장에서 해요.</p>
        </section>
    );
}
