import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideZap, LucideChevronRight, LucidePlus, LucideUsers } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateKey, kstTime } from "@/lib/kst";
import { DATE_STRIP_DAYS } from "../../constants/booking";

/**
 * 홈 맨 위의 **긴급티**.
 *
 * 2026-09-23 오너: "긴급 조인 = 오늘인데 사람이 안 구해져서 10만원짜리 그린피를 천원·만원에 올리는 것.
 * 1명만 채우면 카트·캐디피를 N빵하니까." → 그 글(shared/golfJoin isUrgentJoin)을 **먼저** 흘린다.
 * 없을 때만 예전처럼 '특가 상품(Hot Deal)' 매물로 떨어진다 — 자리를 비워 두지 않으려고.
 *
 * 예전 헤더 티커를 대신한다. 그쪽은 두 가지가 문제였다:
 *  1. 매물이 없으면 코드에 박아 둔 가짜('기흥CC', '스카이72')를 보여 줬다. 작게 흐를 땐 안 보였지만
 *     가로를 다 쓰는 자리로 올리면 거짓말이 커진다 — 없애고, 없으면 없다고 말한다.
 *  2. 30일치 조인을 **전부** 흘렸다. 그건 긴급이 아니라 그냥 목록이다.
 *
 * 끊임없이 흐르는 대신 한 장씩 넘긴다. 눌러야 의미가 있는 카드인데 움직이는 걸 손가락으로 맞히기는
 * 어렵다. 손을 대면 멈추고, 기기가 '동작 줄이기' 를 켜 뒀으면 아예 안 넘긴다.
 *
 * ── 2026-09-23 재디자인(오너: "티커 디자인 색감 등 다 별로다") ───────────────────────────
 * 고친 것은 **얼굴이 매번 바뀌던 것**이다. 예전엔 한 컴포넌트가 강조색 셋(긴급 앰버 #FF8A00 ·
 * 오늘/내일 #FF3D00 · 그 밖 라임)을 쓰고 매물 종류에 따라 카드 바탕과 테두리까지 통째로 갈렸다.
 * 4초마다 넘어가는 자리라 홈 맨 위가 넘길 때마다 다른 물건처럼 보였다.
 *
 * 이제 **뼈대는 하나**다 — 로딩·빈 상태·긴급·일반·마감 다섯 가지가 같은 바탕(white/3.5),
 * 같은 테두리, 같은 자리에 같은 것을 놓는다(①값 ②남은 시간 ③어디 ④자리). 급한 정도는
 * 바탕색이 아니라 **내용**(배지·남은 시간·값)이 말한다. 카드 한 장에 강조색은 **하나**뿐이다:
 * 긴급이면 앰버, 아니면 라임. 둘이 한 화면에 같이 뜨는 일은 없다.
 */

/**
 * 긴급 앰버는 #FFB020 이다(아래 클래스에 리터럴로 박혀 있다). 예전 #FF8A00 은 순수 주황이라 #0A0A0A 위에서
 * 채도만 높고 '경고 스티커'처럼 싸구려로 보였다. 어두운 바탕에서는 채도를 조금 내리고 명도를 올린 금빛이
 * 더 비싸 보인다 — 흰 글씨(본문)와 밝기가 가까워 카드가 한 덩어리로 읽히고, 라임(#64DD17)과도
 * 색상환에서 충분히 떨어져 다른 신호로 구분된다.
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
    isUrgent?: boolean;
}

/** 티오프까지 남은 시간 — 긴급 조인은 '오늘/내일' 이 아니라 시간이 문제다. */
function timeLeft(datetime: string): string {
    const min = Math.round((Date.parse(datetime) - Date.now()) / 60_000);
    if (!Number.isFinite(min) || min <= 0) return "곧 시작";
    if (min < 60) return `${min}분 뒤`;
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? `${h}시간 뒤` : `${h}시간 ${m}분 뒤`;
}

/** 오늘이면 남은 시간, 아니면 '내일'·'D-3'. 카드의 ② 자리에 들어가는 한 줄. */
function whenLabel(datetime: string): string {
    const today = kstDateKey(Date.now());
    const day = kstDateKey(datetime);
    if (day === today) return timeLeft(datetime);
    if (day === kstDateKey(Date.now() + 24 * 3600_000)) return "내일";
    const days = Math.round(
        (Date.parse(`${day}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86_400_000,
    );
    return `D-${days}`;
}

/** 다섯 가지 상태가 나눠 쓰는 **하나뿐인** 뼈대. 크기·바탕·테두리는 여기서만 정한다. */
// 홈 맨 위에서 4초마다 넘어가는 자리다 — 여백을 넉넉히 주면 화면의 5분의 1을 먹는다(첫 시안 156px).
const SHELL = "w-full rounded-2xl bg-white/[0.035] border border-white/[0.07] px-4 py-3 text-left transition-colors";

/** 카드 맨 위 줄: 왼쪽 배지 · 오른쪽 '언제'. */
function TopRow({ badge, when, tone }: { badge: ReactNode; when?: string; tone: "urgent" | "lime" | "muted" }) {
    return (
        <span className="flex items-center gap-2 h-[22px]">
            {badge}
            {when && (
                <span
                    className={cn(
                        "ml-auto text-[12px] font-extrabold tabular-nums",
                        tone === "urgent" ? "text-[#FFB020]" : tone === "lime" ? "text-white/60" : "text-white/30",
                    )}
                >
                    {when}
                </span>
            )}
        </span>
    );
}

/**
 * 매물 한 장. 긴급이든 아니든 **같은 순서**로 읽힌다: 값 → 남은 시간 → 어디 → 몇 자리.
 * 값(그린피)이 후킹 포인트다 — 10만원짜리를 만원에 던지는 글이라 숫자가 가장 크다.
 * 다만 숫자까지 알람색으로 칠하지 않는다: 흰 숫자가 더 크게 읽히고, 급한 건 배지와 남은 시간이 말한다.
 */
export function DealCard({ deal, onOpen }: { deal: Deal; onOpen: (d: Deal) => void }) {
    const isUrgent = !!deal.isUrgent;
    const isJoin = deal.listingType === "JOIN";
    const name = deal.isBlind ? (deal.blindName || "비공개 골프장") : deal.courseName;
    const capacity = Number(deal.joinHeadcount) > 0 ? Number(deal.joinHeadcount) : null;
    const left = capacity != null ? Math.max(0, capacity - Number(deal.joinApplied ?? 0)) : null;
    const closed = left === 0;
    /* 마감된 글은 급할 게 없다 — 뼈대는 그대로 두고 색만 빼서 '지나간 것'으로 읽히게 한다. */
    const tone: "urgent" | "lime" | "muted" = closed ? "muted" : isUrgent ? "urgent" : "lime";

    return (
        <button
            onClick={() => onOpen(deal)}
            className={cn(
                SHELL,
                "active:scale-[0.995]",
                tone === "urgent" ? "hover:border-[#FFB020]/40" : tone === "lime" ? "hover:border-[#64DD17]/30" : "hover:border-white/15",
            )}
        >
            <TopRow
                tone={tone}
                /* 긴급은 날짜가 아니라 남은 시간이다 — 자정을 넘긴 티오프라도 '내일'이라고 쓰면 '긴급' 배지와 말이 어긋난다. */
                when={closed ? undefined : isUrgent ? timeLeft(deal.datetime) : whenLabel(deal.datetime)}
                badge={
                    tone === "urgent" ? (
                        <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-[#FFB020] text-[#2A1800] text-[10.5px] font-black">
                            <LucideZap className="w-3 h-3" />긴급
                        </span>
                    ) : tone === "lime" ? (
                        <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md bg-[#64DD17]/[0.14] text-[#64DD17] text-[10.5px] font-black">
                            {isJoin ? "조인" : "부킹"}
                        </span>
                    ) : (
                        <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md bg-white/[0.07] text-white/40 text-[10.5px] font-black">
                            마감
                        </span>
                    )
                }
            />

            <span className="mt-1.5 flex items-baseline gap-1">
                <span className={cn("text-[28px] font-black leading-none tabular-nums", closed ? "text-white/35" : "text-white")}>
                    {Number(deal.greenFee).toLocaleString()}
                </span>
                <span className={cn("text-[15px] font-extrabold", closed ? "text-white/25" : "text-white/55")}>원</span>
            </span>
            {/* 값이 싼 이유를 설명하는 줄이라 값 바로 밑에 붙인다 — 이게 없으면 '너무 싼데 뭔가 있나' 가 된다. */}
            <span className="mt-1 block text-[11px] font-bold text-white/35 break-keep">
                그린피 1인{isUrgent && " · 카트·캐디피는 현장에서 N빵이에요"}
            </span>

            <span className="mt-2.5 block h-px bg-white/[0.06]" />

            {/* 이름만 줄어들고 잘린다. 시각·자리는 물론 **지역도** 안 줄인다 —
                이름과 지역을 한 truncate 덩어리로 묶으면 "사우스스프링스 컨트리클럽 경…" 처럼
                지역이 한 글자만 남아 고장 난 것처럼 보였다. 2시간 뒤 티오프에서 갈지 말지를 정하는 건 지역이다. */}
            <span className="mt-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
                    <span className={cn("min-w-0 truncate text-[12.5px] font-black", closed ? "text-white/40" : "text-white/85")}>{name}</span>
                    {deal.region && <span className="shrink-0 text-[11px] font-bold text-white/30">{deal.region}</span>}
                </span>
                <span className="shrink-0 flex items-center gap-2">
                    <span className="text-[11.5px] font-bold text-white/40 tabular-nums">{kstTime(deal.datetime)} 티오프</span>
                    {left != null && !closed && (
                        <span className="flex items-center gap-1 text-[11.5px] font-extrabold text-white/55">
                            <LucideUsers className="w-3 h-3" />{left}자리
                        </span>
                    )}
                    <LucideChevronRight className="w-4 h-4 text-white/20" />
                </span>
            </span>
        </button>
    );
}

export function HotDealTicker() {
    const [, setLocation] = useLocation();
    const [idx, setIdx] = useState(0);
    const paused = useRef(false);

    // 긴급 조인(오늘·떨이 그린피)이 먼저다. 서버가 isUrgentJoin 과 같은 조건으로 거른다(urgent=1).
    const urgentQ = useQuery<Deal[]>({
        queryKey: ["/api/hiq/golf/bookings", "urgent-joins"],
        queryFn: () => apiRequest(`/api/hiq/golf/bookings?${new URLSearchParams({ urgent: "1", upcoming: "1" }).toString()}`),
        refetchInterval: 60_000,
    });
    // 긴급이 없을 때만 예전 특가 매물로 떨어진다 — 자리를 비워 두지 않는다.
    const hasUrgent = (urgentQ.data?.length ?? 0) > 0;
    const dealQ = useQuery<Deal[]>({
        queryKey: ["/api/hiq/golf/bookings", "hot-deals"],
        enabled: !urgentQ.isPending && !hasUrgent,
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
    const isLoading = urgentQ.isPending || (!hasUrgent && dealQ.isPending);

    // 급한 것부터
    const deals = useMemo(() => {
        const rows = hasUrgent
            ? (urgentQ.data ?? []).map((d) => ({ ...d, isUrgent: true }))
            : (dealQ.data ?? []);
        return [...rows].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime)).slice(0, 10);
    }, [hasUrgent, urgentQ.data, dealQ.data]);

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

    // 로딩 — 다른 얼굴을 만들지 않는다. 같은 뼈대 안에서 글자 자리만 비워 둔다.
    if (isLoading) {
        return (
            <div className={cn(SHELL, "mb-4 animate-pulse")} aria-hidden>
                <span className="flex items-center h-[22px]"><span className="block w-12 h-[22px] rounded-md bg-white/[0.06]" /></span>
                <span className="mt-2 block w-28 h-[30px] rounded-md bg-white/[0.06]" />
                <span className="mt-1.5 block w-40 h-3 rounded bg-white/[0.045]" />
                <span className="mt-3 block h-px bg-white/[0.06]" />
                <span className="mt-2.5 block w-48 h-3.5 rounded bg-white/[0.045]" />
            </div>
        );
    }

    // 비었으면 비었다고 말하고, 그 자리를 '만들기' 로 쓴다 — 역시 같은 뼈대다.
    if (deals.length === 0) {
        return (
            <button
                onClick={() => setLocation("/golf/booking-list?view=JOIN")}
                className={cn(SHELL, "mb-4 group hover:border-[#64DD17]/30")}
            >
                <span className="flex items-center h-[22px]">
                    <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-white/[0.07] text-white/40 text-[10.5px] font-black">
                        <LucideZap className="w-3 h-3" />긴급티
                    </span>
                </span>
                <span className="mt-2 block text-[15px] font-black text-white/75 leading-none break-keep">지금 열린 긴급티가 없어요</span>
                <span className="mt-1.5 block text-[11px] font-bold text-white/35 break-keep">오늘 급하게 나온 자리가 여기에 떠요</span>

                <span className="mt-3 block h-px bg-white/[0.06]" />

                <span className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-white/30">내가 먼저 올려도 돼요</span>
                    <span className="ml-auto shrink-0 flex items-center gap-1 text-[12px] font-black text-[#64DD17]">
                        <LucidePlus className="w-3.5 h-3.5" />조인 만들기
                        <LucideChevronRight className="w-4 h-4 text-[#64DD17]/50" />
                    </span>
                </span>
            </button>
        );
    }

    const d = deals[idx] ?? deals[0];

    return (
        <div
            className="mb-4 relative z-10"
            onPointerEnter={() => { paused.current = true; }}
            onPointerLeave={() => { paused.current = false; }}
            onTouchStart={() => { paused.current = true; }}
        >
            <DealCard deal={d} onOpen={open} />

            {deals.length > 1 && (
                /* 점은 색을 쓰지 않는다 — 카드 한 장에 강조색은 하나뿐이고, 그 하나는 배지가 이미 쓰고 있다. */
                <div className="mt-2 flex items-center justify-center gap-1.5">
                    {deals.map((x, i) => (
                        <button
                            key={x.id}
                            onClick={() => { paused.current = true; setIdx(i); }}
                            aria-label={`${i + 1}번째 긴급티 보기`}
                            className={cn(
                                "h-1.5 rounded-full transition-all",
                                i === idx ? "w-4 bg-white/70" : "w-1.5 bg-white/15 hover:bg-white/30",
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default HotDealTicker;
