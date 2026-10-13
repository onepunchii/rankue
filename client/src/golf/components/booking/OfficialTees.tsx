/**
 * 부킹 목록의 '골프장 홈페이지 예약 티'(2026-10-13 오너: "지금 남은 티 섹션 넣지 말고 부킹에 넣어줘 — 시간이랑 이런 거 자동화해서.
 * 부킹에서 누르면 '해당 부킹은 홈페이지 예약 티입니다'라고 안내하고 연결되게. 우리는 조인 · 부킹을 활성화해야 돼").
 *
 * 서버가 부킹 목록에 섞어 준 줄(sellerType "OFFICIAL" — shared/golfOpenTee OfficialListing)을 회원이 올린 부킹 **아래에** 골프장별로 묶어 보인다.
 * 한 골프장이 하루에 수십 줄이라 늘 묶는다(골프장별 보기를 꺼도). 골프장을 펼치면 티타임이 한 줄씩, 한 줄을 누르면 그 자리에서
 * 안내("이 부킹은 골프장 홈페이지 예약 티예요")와 골프장 홈페이지로 가는 단추가 펼쳐진다 — 신청 · 채팅 · 공유 · 삭제는 없다(우리가 받는 예약이 아니다).
 * 시트를 띄우지 않고 그 자리에서 펼친다 — 이 화면의 '부킹 올리기' 단추(fixed z-60)가 시트의 막 위로 떠오르는 일을 만들지 않으려고.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { LucideArrowUpRight, LucideChevronDown } from "@/lib/icons";
import { coursePath } from "@shared/golfCourse";
import { OFFICIAL_LISTING_COPY as COPY, kstClock, teePriceText, type OfficialListing } from "@shared/golfOpenTee";
import { kstTime } from "@/lib/kst";

/** 한 골프장을 펼쳤을 때 처음 보이는 줄 수 — 넘으면 '더 보기' */
const FIRST = 8;

interface Group { slug: string; name: string; region: string; items: OfficialListing[]; minFee: number | null; first: string; last: string; fresh: number }

function groupOf(items: readonly OfficialListing[]): Group[] {
    const by = new Map<string, Group>();
    for (const it of items) {
        const time = kstTime(it.datetime);
        let g = by.get(it.official.slug);
        if (!g) { g = { slug: it.official.slug, name: it.courseName, region: it.region, items: [], minFee: null, first: time, last: time, fresh: 0 }; by.set(g.slug, g); }
        g.items.push(it);
        if (it.official.price != null && (g.minFee == null || it.official.price < g.minFee)) g.minFee = it.official.price;
        if (time < g.first) g.first = time;
        if (time > g.last) g.last = time;
        if (it.official.fresh) g.fresh++;
    }
    // 받은 순서(이른 티타임부터)가 곧 골프장의 순서다 — 가장 이른 티를 가진 곳이 먼저
    return [...by.values()];
}

export function OfficialTees({ items, className }: { items: readonly OfficialListing[]; className?: string }) {
    const groups = useMemo(() => groupOf(items), [items]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [all, setAll] = useState<Record<string, boolean>>({});
    const [picked, setPicked] = useState<string | null>(null);
    if (!groups.length) return null;

    return (
        <section className={className} data-testid="official-tees" aria-label={COPY.title}>
            <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-[15px] font-semibold text-[#FFFFFF]">{COPY.title}</h2>
                <span className="shrink-0 text-[12px] tabular-nums text-[#FFFFFF80]">골프장 {groups.length}곳 · {items.length}개</span>
            </div>
            <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-[#FFFFFF80]">{COPY.sub} {COPY.how}</p>

            <ul className="space-y-2.5">
                {groups.map((g) => {
                    const on = !!open[g.slug];
                    const rows = all[g.slug] ? g.items : g.items.slice(0, FIRST);
                    const more = g.items.length - rows.length;
                    return (
                        <li key={g.slug} className="overflow-hidden rounded-2xl bg-[#141414] ring-1 ring-inset ring-[#FFFFFF14]" data-testid={`official-group-${g.slug}`}>
                            <button type="button" onClick={() => setOpen((p) => ({ ...p, [g.slug]: !on }))} aria-expanded={on} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[#FFFFFF0A]">
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="min-w-0 truncate text-[15px] font-semibold text-[#FFFFFF]">{g.name}</span>
                                        <span className="shrink-0 rounded-full bg-[#64DD1726] px-1.5 text-[12px] font-medium text-[#9BE85A]">{COPY.badge}</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12.5px] text-[#FFFFFF80]">
                                        {g.region} · {g.first === g.last ? g.first : `${g.first} ~ ${g.last}`}{g.fresh > 0 ? ` · 새로 나옴 ${g.fresh}` : ""}
                                    </span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block text-[14px] font-semibold tabular-nums text-[#FFFFFF]">{g.items.length}팀</span>
                                    {g.minFee != null && <span className="block text-[12px] tabular-nums text-[#FFFFFF80]">{teePriceText(g.minFee)}부터</span>}
                                </span>
                                <LucideChevronDown className={cn("h-4 w-4 shrink-0 text-[#FFFFFF59] transition-transform", on && "rotate-180")} aria-hidden />
                            </button>

                            {on && (
                                <div className="border-t border-[#FFFFFF0F] px-3 pb-3 pt-1">
                                    <ul className="divide-y divide-[#FFFFFF0F]">
                                        {rows.map((it) => {
                                            const sel = picked === it.id;
                                            const o = it.official;
                                            return (
                                                <li key={it.id}>
                                                    <button type="button" onClick={() => setPicked(sel ? null : it.id)} aria-expanded={sel} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left active:bg-[#FFFFFF0A]" data-testid="official-tee-row">
                                                        <span className="w-[50px] shrink-0 text-[16px] font-semibold tabular-nums text-[#FFFFFF]">{kstTime(it.datetime)}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[13px] text-[#FFFFFFD9]">{[o.course, o.holes ? `${o.holes}홀` : ""].filter(Boolean).join(" · ") || "코스 표시 없음"}</span>
                                                            {o.fresh && <span className="mt-0.5 inline-block rounded-full bg-[#FF6B0026] px-1.5 text-[12px] font-medium text-[#FF8A33]">새로 나옴</span>}
                                                        </span>
                                                        <span className="shrink-0 text-right">
                                                            {o.listPrice != null && <span className="block text-[12px] tabular-nums text-[#FFFFFF59] line-through">{teePriceText(o.listPrice)}</span>}
                                                            <span className="block text-[14px] font-semibold tabular-nums text-[#FFFFFF]">{teePriceText(o.price) || "요금은 골프장에서"}</span>
                                                        </span>
                                                    </button>
                                                    {sel && (
                                                        <div className="mb-2.5 rounded-xl bg-[#64DD170F] px-3.5 py-3.5 ring-1 ring-inset ring-[#64DD1733]" data-testid="official-tee-notice" role="note">
                                                            <p className="text-[14px] font-semibold text-[#FFFFFF]">{COPY.notice}</p>
                                                            <p className="mt-1 text-[12.5px] leading-relaxed text-[#FFFFFFB3]">{COPY.how} {COPY.stale} <span className="whitespace-nowrap">확인 {kstClock(o.checkedAt)}</span></p>
                                                            {/* 단추는 위아래로 — 옆으로 나란히 두면 폭 320 에서 '골프장 홈페이지에서 예약'이 잘린다 */}
                                                            <a href={o.page} target="_blank" rel="noopener noreferrer nofollow" data-track-as="golf-official-tee-go" data-testid="official-tee-go"
                                                                className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#64DD17] text-[14px] font-semibold text-[#051907] active:bg-[#57C713]">
                                                                {COPY.go}
                                                                <LucideArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                                                            </a>
                                                            <Link href={coursePath(o.slug)} className="mt-2 flex h-10 items-center justify-center rounded-xl bg-[#FFFFFF14] text-[13px] text-[#FFFFFF] active:bg-[#FFFFFF24]" data-track-as="golf-official-tee-course">
                                                                {COPY.info}
                                                            </Link>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {more > 0 && (
                                        <button type="button" onClick={() => setAll((p) => ({ ...p, [g.slug]: true }))} className="mt-1 h-10 w-full rounded-xl bg-[#FFFFFF0A] text-[13px] text-[#FFFFFFB3] active:bg-[#FFFFFF14]" data-testid="official-more">
                                            {more}개 더 보기
                                        </button>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
