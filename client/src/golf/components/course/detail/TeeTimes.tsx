/**
 * "지금 이 골프장" — 앞으로의 부킹·조인·긴급(2026-09-24). 오늘 / 내일 / 이번 주 / 그 뒤.
 *
 * 줄을 누르면 앱의 목록 화면(/golf/booking-list/:id)으로 간다 — 로그인이 필요한 화면이라 비로그인이면 로그인 뒤 그 줄로.
 * 주소에 날짜(date)를 같이 싣는다: 목록 화면은 고른 날짜 하루치만 불러와서, 날짜가 없으면 다음 주 글이 안 보인다(useShare 머리말).
 *
 * 비었으면 한 줄 + 관심 단추 — 여기가 "알림 받기"로 넘어가는 지점이다.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LucideChevronDown, LucideChevronRight } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { goLogin } from "@/components/hiq/LoginGate";
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { JOIN_OPTIONS } from "@shared/golfJoin";
import { teePart, wonShort, type PublicListing } from "@shared/golfCourse";
import { SlotDots, costText, hostSeatLabel, joinTypeOf, slotsOf, JoinTypeBadge } from "../../join/joinUi";
import type { WatchFilters } from "@/golf/lib/courseApi";
import { WatchButton } from "../WatchSheet";
import { Card, Section, dayDiff, kstWeekday, todayKey } from "./ui";

type Group = { key: string; title: string; showDate: boolean; items: PublicListing[] };

function groupListings(ls: PublicListing[]): Group[] {
    const today = todayKey();
    // 이번 주 = 오늘부터 이번 일요일까지(한국 달력). 목요일이면 금·토·일.
    const toSunday = (7 - kstWeekday(new Date())) % 7;
    const g: Record<string, Group> = {
        today: { key: "today", title: "오늘", showDate: false, items: [] },
        tomorrow: { key: "tomorrow", title: "내일", showDate: false, items: [] },
        week: { key: "week", title: "이번 주", showDate: true, items: [] },
        later: { key: "later", title: "그 뒤", showDate: true, items: [] },
    };
    for (const l of ls) {
        const d = dayDiff(today, kstDateKey(l.datetime));
        if (d < 0) continue;
        (d === 0 ? g.today : d === 1 ? g.tomorrow : d <= toSunday ? g.week : g.later).items.push(l);
    }
    for (const k of ["today", "tomorrow"] as const) {
        const first = g[k].items[0];
        if (first) g[k].title = `${g[k].title} · ${kstDateLabel(first.datetime, { weekday: "short" })}`;
    }
    return Object.values(g).filter((x) => x.items.length > 0);
}

const optionLabel = (id: string) => JOIN_OPTIONS.find((o) => o.id === id)?.label;

function priceOf(l: PublicListing): string {
    if (l.costMode === "SPLIT") return costText(l);
    return wonShort(l.greenFee ?? null);
}

function Row({ l, showDate, onOpen }: { l: PublicListing; showDate: boolean; onOpen: (l: PublicListing) => void }) {
    const join = l.listingType === "JOIN";
    const kind = l.isUrgent ? { label: "긴급", cls: "bg-[#FF3B30] text-white" }
        : join ? { label: "조인", cls: "bg-[#FF6B001F] text-[#FF8A33]" }
        : { label: "부킹", cls: "bg-[#64DD171F] text-[#8BE84A]" };
    const left = Math.max(0, l.joinCapacity - l.joinApplied);
    const price = priceOf(l);
    const opts = (l.options ?? []).map(optionLabel).filter(Boolean).slice(0, 2) as string[];
    const part = teePart(l.datetime);
    return (
        <li>
            <button
                type="button" onClick={() => onOpen(l)}
                className={cn("w-full flex items-center gap-3 pl-3.5 pr-2.5 py-3 text-left active:bg-[#FFFFFF0A] relative", l.isUrgent && "bg-[#FF3B300D]")}
            >
                {l.isUrgent && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#FF3B30]" />}
                <span className="w-[58px] shrink-0">
                    <span className="block text-[18px] font-semibold text-white tabular-nums leading-tight">{kstTime(l.datetime)}</span>
                    <span className="mt-0.5 inline-flex items-center text-[12px] text-[#FFFFFF80]">{part}부</span>
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("shrink-0 px-1.5 h-[22px] inline-flex items-center rounded-md text-[12px] font-semibold", kind.cls)}>{kind.label}</span>
                        {join && joinTypeOf(l) !== "FIELD" && <JoinTypeBadge type={joinTypeOf(l)} className="text-[12px]" />}
                        {showDate && <span className="text-[13px] text-[#FFFFFFB3] truncate">{kstDateLabel(l.datetime, { weekday: "short" })}</span>}
                    </span>
                    {join ? (
                        <span className="mt-1.5 flex items-center gap-2">
                            <SlotDots slots={slotsOf(l)} filled={l.joinApplied} size={18} hostLabel={hostSeatLabel(l)} />
                            <span className={cn("text-[12.5px] font-medium", left > 0 ? "text-[#FF8A33]" : "text-[#FFFFFF66]")}>{left > 0 ? `${left}자리 남음` : "마감"}</span>
                        </span>
                    ) : opts.length > 0 ? (
                        <span className="mt-1 block text-[12.5px] text-[#FFFFFF80] truncate">{opts.join(" · ")}</span>
                    ) : null}
                </span>
                <span className="shrink-0 flex items-center gap-0.5">
                    {price && <span className={cn("text-[16px] font-semibold tabular-nums", l.isUrgent ? "text-[#FF6B61]" : "text-white")}>{price}</span>}
                    <LucideChevronRight weight="bold" className="w-4 h-4 text-[#FFFFFF4D]" />
                </span>
            </button>
        </li>
    );
}

const FIRST = 8;

export function TeeTimes({ slug, name, listings, counts, myWatch, watchers }: {
    slug: string; name: string; listings: PublicListing[];
    counts: { booking: number; join: number; urgent: number };
    myWatch: { filters: WatchFilters } | null; watchers: number;
}) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const golfOk = useGolfAccess();
    const [all, setAll] = useState(false);
    const groups = useMemo(() => groupListings(listings), [listings]);

    const open = (l: PublicListing) => {
        const to = `/golf/booking-list/${encodeURIComponent(l.id)}?date=${kstDateKey(l.datetime)}&view=${l.listingType === "JOIN" ? "JOIN" : "BOOKING"}`;
        if (isLoading) return;                         // 로그인 확인 전에 누르면 로그인한 사람도 로그인 화면으로 갔다
        if (!member) { goLogin(setLocation, to); return; }
        // 로그인했지만 골프를 못 쓰는 회원(앱 언어가 한국어가 아닌 경우 등)은 목록 화면(GolfOnly)이 /dashboard 로 튕긴다 — 보내지 않는다.
        if (!golfOk) return;
        setLocation(to);
    };

    // 처음엔 FIRST 줄까지만 — 묶음 순서를 지키며 자른다.
    let budget = all ? Infinity : FIRST;
    const shown = groups.map((g) => { const items = g.items.slice(0, Math.max(0, budget)); budget -= items.length; return { ...g, items }; }).filter((g) => g.items.length);
    const hidden = listings.length - shown.reduce((n, g) => n + g.items.length, 0);

    const aside = listings.length > 0 ? (
        <span className="flex items-center gap-2 text-[12.5px] text-[#FFFFFF80] tabular-nums">
            {counts.booking > 0 && <span><span className="text-[#8BE84A]">부킹</span> {counts.booking}</span>}
            {counts.join > 0 && <span><span className="text-[#FF8A33]">조인</span> {counts.join}</span>}
            {counts.urgent > 0 && <span><span className="text-[#FF6B61]">긴급</span> {counts.urgent}</span>}
        </span>
    ) : undefined;

    return (
        <Section id="tee" title="지금 이 골프장" aside={aside}>
            {listings.length === 0 ? (
                <Card className="px-4 py-4">
                    <p className="text-[14px] text-[#FFFFFFB3]">지금 올라온 티타임이 없어요</p>
                    {/* 관심 단추는 바로 위 머리에 하나만 — 첫 화면에 같은 단추가 두 번 보였다(2026-09-24) */}
                    {myWatch && <p className="mt-1 text-[13px] text-[#FFD266]">관심 등록돼 있어요 — 올라오면 바로 알려 드려요</p>}
                </Card>
            ) : (
                <div className="space-y-4">
                    {shown.map((g) => (
                        <div key={g.key}>
                            <h3 className="px-1 mb-1.5 text-[13px] font-medium text-[#FFFFFF99]">{g.title}<span className="ml-1.5 text-[#FFFFFF4D] tabular-nums">{groups.find((x) => x.key === g.key)!.items.length}</span></h3>
                            <Card className="overflow-hidden">
                                <ul className="divide-y divide-[#FFFFFF0F]">
                                    {g.items.map((l) => <Row key={l.id} l={l} showDate={g.showDate} onOpen={open} />)}
                                </ul>
                            </Card>
                        </div>
                    ))}
                    {hidden > 0 && (
                        <button type="button" onClick={() => setAll(true)} className="w-full h-11 rounded-xl bg-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFB3] inline-flex items-center justify-center gap-1 active:bg-[#FFFFFF14]">
                            {hidden}건 더 보기<LucideChevronDown weight="bold" className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </Section>
    );
}
