import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideZap, LucideChevronRight, LucidePlus, LucideUsers } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { DATE_STRIP_DAYS } from "../../constants/booking";

/**
 * 홈 맨 위의 **긴급티**. 티타임 등록에서 '특가 상품(Hot Deal)' 을 켠 매물만 흐른다(2026-09-10 오너).
 *
 * 예전 헤더 티커를 대신한다. 그쪽은 두 가지가 문제였다:
 *  1. 매물이 없으면 코드에 박아 둔 가짜('기흥CC', '스카이72')를 보여 줬다. 작게 흐를 땐 안 보였지만
 *     가로를 다 쓰는 자리로 올리면 거짓말이 커진다 — 없애고, 없으면 없다고 말한다.
 *  2. 30일치 조인을 **전부** 흘렸다. 그건 긴급이 아니라 그냥 목록이다.
 *
 * 끊임없이 흐르는 대신 한 장씩 넘긴다. 눌러야 의미가 있는 카드인데 움직이는 걸 손가락으로 맞히기는
 * 어렵다. 손을 대면 멈추고, 기기가 '동작 줄이기' 를 켜 뒀으면 아예 안 넘긴다.
 */

const ROTATE_MS = 4000;

interface Deal {
    id: string;
    courseName: string;
    blindName?: string | null;
    isBlind?: boolean;
    datetime: string;
    greenFee: number;
    listingType?: string | null;
    joinHeadcount?: number | null;
    joinApplied?: number;
    region?: string | null;
}

/** '오늘' · '내일' · 'D-3'. 급한 것일수록 눈에 띄어야 한다. */
function urgency(datetime: string): { label: string; hot: boolean } {
    const today = kstDateKey(Date.now());
    const day = kstDateKey(datetime);
    if (day === today) return { label: "오늘", hot: true };
    const tomorrow = kstDateKey(Date.now() + 24 * 3600_000);
    if (day === tomorrow) return { label: "내일", hot: true };
    const days = Math.round(
        (Date.parse(`${day}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86_400_000,
    );
    return { label: `D-${days}`, hot: days <= 3 };
}

export function HotDealTicker() {
    const [, setLocation] = useLocation();
    const [idx, setIdx] = useState(0);
    const paused = useRef(false);

    const { data, isLoading } = useQuery<Deal[]>({
        queryKey: ["/api/hiq/golf/bookings", "hot-deals"],
        queryFn: () => {
            const params = new URLSearchParams({
                startDate: kstDateKey(Date.now()),
                endDate: kstDateKey(Date.now() + (DATE_STRIP_DAYS - 1) * 24 * 3600_000),
                hotDeal: "1",
                upcoming: "1",
            });
            return apiRequest(`/api/hiq/golf/bookings?${params.toString()}`);
        },
        refetchInterval: 60_000,
    });

    // 급한 것부터
    const deals = useMemo(
        () => [...(data ?? [])].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime)).slice(0, 10),
        [data],
    );

    useEffect(() => { setIdx(0); }, [deals.length]);

    useEffect(() => {
        if (deals.length < 2) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const t = window.setInterval(() => {
            if (!paused.current) setIdx((i) => (i + 1) % deals.length);
        }, ROTATE_MS);
        return () => window.clearInterval(t);
    }, [deals.length]);

    const open = useCallback((d: Deal) => {
        const q = new URLSearchParams({
            date: kstDateKey(d.datetime),
            view: d.listingType === "JOIN" ? "JOIN" : "BOOKING",
            highlight: d.id,
        });
        setLocation(`/golf/booking-list?${q.toString()}`);
    }, [setLocation]);

    if (isLoading) {
        return <div className="mb-4 h-[76px] rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />;
    }

    // 비었으면 비었다고 말하고, 그 자리를 '만들기' 로 쓴다.
    if (deals.length === 0) {
        return (
            <button
                onClick={() => setLocation("/golf/booking-list?view=JOIN")}
                className="mb-4 w-full rounded-2xl bg-white/[0.03] border border-white/5 px-5 py-4 flex items-center justify-between text-left hover:border-[#64DD17]/30 transition-colors group"
            >
                <div>
                    <p className="text-[13px] font-bold text-white/70">지금 열린 긴급티가 없어요</p>
                    <p className="text-[11px] font-medium text-white/30 mt-0.5">특가로 올린 티타임이 여기에 뜹니다</p>
                </div>
                <span className="shrink-0 h-9 px-4 rounded-pill bg-[#64DD17]/10 text-[#64DD17] text-[12px] font-black flex items-center gap-1.5 group-hover:bg-[#64DD17] group-hover:text-[#051907] transition-colors">
                    <LucidePlus className="w-3.5 h-3.5" />조인 만들기
                </span>
            </button>
        );
    }

    const d = deals[idx] ?? deals[0];
    const u = urgency(d.datetime);
    const isJoin = d.listingType === "JOIN";
    const name = d.isBlind ? (d.blindName || "비공개 골프장") : d.courseName;
    const capacity = Number(d.joinHeadcount) > 0 ? Number(d.joinHeadcount) : null;
    const left = capacity != null ? Math.max(0, capacity - Number(d.joinApplied ?? 0)) : null;

    return (
        <div
            className="mb-4 relative z-10"
            onPointerEnter={() => { paused.current = true; }}
            onPointerLeave={() => { paused.current = false; }}
            onTouchStart={() => { paused.current = true; }}
        >
            <button
                onClick={() => open(d)}
                className={cn(
                    "w-full rounded-2xl px-5 py-4 flex items-center gap-4 text-left transition-colors border",
                    u.hot
                        ? "bg-[#FF3D00]/[0.07] border-[#FF3D00]/25 hover:border-[#FF3D00]/50"
                        : "bg-white/[0.03] border-white/5 hover:border-[#64DD17]/30",
                )}
            >
                <span className={cn(
                    "shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black",
                    u.hot ? "bg-[#FF3D00]/15 text-[#FF6E40]" : "bg-[#64DD17]/10 text-[#64DD17]",
                )}>
                    <LucideZap className="w-3.5 h-3.5" />
                    <span className="text-[9px] leading-none mt-0.5">{u.label}</span>
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className={cn(
                            "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black",
                            isJoin ? "bg-[#FF6B00]/20 text-[#FF6B00]" : "bg-[#64DD17]/20 text-[#64DD17]",
                        )}>
                            {isJoin ? "조인" : "부킹"}
                        </span>
                        <span className="text-[14px] font-black text-white truncate">{name}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] font-bold text-white/40">
                        <span className="tabular-nums">
                            {kstDateLabel(d.datetime, { month: "numeric", day: "numeric" })} {kstTime(d.datetime)}
                        </span>
                        <span className="w-0.5 h-2 bg-white/10 rounded-full" />
                        <span className="tabular-nums text-white/70">{Number(d.greenFee).toLocaleString()}원</span>
                        {isJoin && left != null && (
                            <>
                                <span className="w-0.5 h-2 bg-white/10 rounded-full" />
                                <span className={cn("flex items-center gap-1", left === 0 ? "text-white/30" : "text-[#FF6B00]")}>
                                    <LucideUsers className="w-3 h-3" />
                                    {left === 0 ? "마감" : `${left}자리`}
                                </span>
                            </>
                        )}
                    </span>
                </span>

                <LucideChevronRight className="shrink-0 w-5 h-5 text-white/20" />
            </button>

            {deals.length > 1 && (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                    {deals.map((x, i) => (
                        <button
                            key={x.id}
                            onClick={() => { paused.current = true; setIdx(i); }}
                            aria-label={`${i + 1}번째 긴급티 보기`}
                            className={cn(
                                "h-1.5 rounded-full transition-all",
                                i === idx ? "w-4 bg-[#64DD17]" : "w-1.5 bg-white/15 hover:bg-white/30",
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default HotDealTicker;
