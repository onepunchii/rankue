/**
 * 내 예약 — 내가 올린 글 | 내가 신청한 글(2026-09-23 오너: "라운드 를 부킹/조인 내역 (내예약) 으로",
 * "조인에 있는 내역 상세를 해당 페이지로 만들어서 자세하게 볼 수 있게").
 *
 * 시트(MyListingsSheet)를 대신한다. 페이지여야 하는 이유는 셋이다:
 *  1. **주소가 생긴다** — 푸시 알림이 "내 신청이 어떻게 됐나"를 보여 줄 곳으로 여기를 가리킬 수 있다.
 *     예전엔 그럴 주소가 없어 거절 알림조차 글 상세로 보냈고, 거절은 재신청이 막힌 최종 상태라 그 화면엔 할 일이 없었다.
 *  2. **뒤로가기가 자연스럽다** — 시트 안에서 또 시트를 열던 구조(내역 → 조인 전환)의 포커스 덫이 사라진다.
 *  3. **높이 제한이 없다** — 시트는 82dvh 라 접어 둬야 했던 것(신청자 명단·자리 그림·다음에 할 일)을 펼친다.
 *
 * ⚠️ `bg-white`·`text-black/*` 를 쓰면 안 된다 — 골프 테마가 `.bg-white` 만 어두운 면으로 되받고
 *   `.text-black` 은 그대로 둬서 검은 글씨가 어두운 바탕에 얹힌다(index.css). 리터럴 hex·white/알파만 쓴다.
 *
 * 다가오는 글이 먼저, 지난 글은 흐리게 아래에. 신청한 글은 **상태 칩**(대기·확정·거절·안 옴)과
 * "다음에 무슨 일이 일어나는지" 한 줄이 핵심이다 — 대기 중인 사람이 가장 많이 묻는 게 그거다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronLeft, LucideChevronDown, LucideLoader2 } from "lucide-react";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { JoinApplicants } from "../components/booking/JoinApplicants";
import { ToJoinSheet } from "../components/booking/ToJoinSheet";
import {
    JoinTypeBadge, SlotDots, costText, hostSeatLabel, joinTypeOf,
    kakaoMapUrl, kakaoRouteUrl, slotLegend, slotsOf,
} from "../components/join/joinUi";
import {
    MY_LISTINGS_QUERY_KEY, MY_REQUESTS_QUERY_KEY,
    hasUnseenRequestChange, markRequestsSeen, readRequestsSeen,
} from "../lib/myListings";

type Tab = "mine" | "applied";

const STATUS: Record<string, { label: string; cls: string }> = {
    applied: { label: "대기", cls: "bg-[#FF6B00]/15 text-[#FF8A33]" },
    accepted: { label: "확정", cls: "bg-[#64DD17]/15 text-[#8BE84A]" },
    rejected: { label: "거절", cls: "bg-white/[0.06] text-white/45" },
    noshow: { label: "안 옴", cls: "bg-red-500/15 text-red-400" },
};

/**
 * 내 신청이 지금 어디쯤인지 **한 줄**로. 시트에서는 상태 칩 네 글자가 전부라 대기 중인 사람은
 * 뭘 기다리는지 몰랐다 — 그래서 한 줄을 붙인다.
 *
 * ⚠️ 한 줄을 넘기지 말 것(2026-09-23 오너: "의미없는 내용들이 너무 많아 … 다 빼줘").
 * "승인되면 알림이 오고 채팅방이 열려요", "라운드는 잘 하셨나요?" 같은 뒷문장은 읽는 사람이
 * 이미 아는 말이거나 아무것도 바꾸지 않는 말이다. 정보가 아니면 적지 않는다.
 */
function nextStepText(status: string | undefined, past: boolean, isJoin: boolean): string {
    if (past) {
        if (status === "noshow") return "올린 분이 '안 옴'으로 표시했어요.";
        return "지난 티타임이에요.";
    }
    switch (status) {
        case "applied":
            return "올린 분의 승인을 기다리는 중이에요.";
        case "accepted":
            return isJoin
                ? "확정됐어요. 채팅방에서 약속을 정하세요."
                : "확정됐어요. 채팅방에 연락처가 열렸어요.";
        case "rejected":
            return "거절돼서 이 글에는 다시 신청할 수 없어요.";
        case "noshow":
            return "안 옴으로 표시된 신청이에요.";
        default:
            return "";
    }
}

function Badge({ item }: { item: any }) {
    if (item.listingType === "JOIN") return <JoinTypeBadge type={joinTypeOf(item)} />;
    if (item.sellerType !== "PERSONAL") return null;
    return (
        <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#4DA3FF]/15 text-[#7CBBFF]">
            개인 양도
        </span>
    );
}

const PILL = "h-9 px-3.5 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/80 inline-flex items-center shrink-0";
const PILL_OUTLINE = "h-9 px-3.5 rounded-full border border-white/10 text-[12.5px] font-medium text-white/55 inline-flex items-center shrink-0 active:text-red-400";

interface RowProps {
    item: any;
    kind: Tab;
    past: boolean;
    open: boolean;
    onToggle: () => void;
    onGo: () => void;
    onDelete: () => void;
    onToJoin: () => void;
    onCancel: () => void;
    onChat: () => void;
}

function Row({ item, kind, past, open, onToggle, onGo, onDelete, onToJoin, onCancel, onChat }: RowProps) {
    const isJoin = item.listingType === "JOIN";
    const name: string = item.isBlind ? item.blindName : item.courseName;
    const st = kind === "applied" ? STATUS[item.myJoinStatus] : null;
    const accepted = item.myJoinStatus === "accepted";
    /**
     * '조인으로 전환' 이 붙는 자리(2026-09-23). 내가 올린 **부킹**이고, 아직 안 지난 티타임이고,
     * 아직 아무에게도 확정되지 않았을 때만 — 확정된 티타임은 팀이 통째로 팔린 것이라 나눌 자리가 없다(서버도 409 로 막는다).
     */
    const canToJoin = kind === "mine" && !isJoin && !past && Number(item.joinApplied ?? 0) === 0;
    // 채팅방은 확정된 사람과 올린 사람만 들어간다(서버가 명단으로 막는다) — 못 들어갈 사람에게 단추를 보여 주지 않는다.
    const canChat = kind === "mine" ? Number(item.joinApplied ?? 0) > 0 : accepted;
    const slots = isJoin ? slotsOf(item) : null;

    return (
        <li className={cn(
            "rounded-2xl border bg-white/[0.03] overflow-hidden",
            accepted && !past ? "border-[#64DD17]/30" : "border-white/[0.08]",
            past && "opacity-50",
        )}>
            {/* 머리줄 전체가 펼치기 단추다 — 375px 에서 화살표만 노리게 하면 아무도 못 편다. */}
            <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-3.5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Badge item={item} />
                        <span className="text-[14px] font-medium text-white truncate">{name}</span>
                        {st && <span className={cn("shrink-0 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold", st.cls)}>{st.label}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-white/50 min-w-0">
                        <span className="shrink-0">{kstDateLabel(item.datetime)} {kstTime(item.datetime)}</span>
                        <span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" />
                        {isJoin
                            ? (
                                <span className="inline-flex items-center gap-1.5 truncate">
                                    <SlotDots slots={slotsOf(item)} filled={Number(item.joinApplied ?? 0)} size={14} hostLabel={hostSeatLabel(item)} />
                                    확정 {item.joinApplied ?? 0}/{item.joinCapacity ?? "?"}
                                    {kind === "mine" && Number(item.joinPending) > 0 && <span className="text-[#FF8A33]"> · 대기 {item.joinPending}</span>}
                                </span>
                            )
                            : (
                                <span className="truncate">
                                    {item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}
                                    {kind === "applied" && item.myHeadcount > 1 ? ` · ${item.myHeadcount}명` : ""}
                                    {kind === "mine" && Number(item.joinPending) > 0 ? <span className="text-[#FF8A33]"> · 신청 {item.joinPending}</span> : null}
                                </span>
                            )}
                    </div>
                </div>
                <LucideChevronDown className={cn("w-5 h-5 text-white/30 shrink-0 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.06] pt-3">
                    {/* 내 신청: 지금 어디쯤인지 · 다음에 무슨 일이 일어나는지 */}
                    {kind === "applied" && (
                        <p className="text-[12.5px] leading-relaxed text-white/60">
                            {nextStepText(item.myJoinStatus, past, isJoin)}
                        </p>
                    )}

                    {/* 글의 속살 — 시트에서는 높이가 없어 접어 뒀던 것들 */}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                        <dt className="text-white/35">비용</dt>
                        <dd className="text-white/75">{item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}</dd>
                        {(item.region || item.venueName) && (
                            <>
                                <dt className="text-white/35">장소</dt>
                                <dd className="text-white/75 truncate">{[item.region, item.venueName].filter(Boolean).join(" · ")}</dd>
                            </>
                        )}
                        {slots && (
                            <>
                                <dt className="text-white/35">자리</dt>
                                <dd className="text-white/75">{slotLegend(slots, hostSeatLabel(item)).join(" · ")}</dd>
                            </>
                        )}
                        {kind === "applied" && Number(item.myHeadcount) > 1 && (
                            <>
                                <dt className="text-white/35">신청 인원</dt>
                                <dd className="text-white/75">{item.myHeadcount}명</dd>
                            </>
                        )}
                    </dl>

                    {/* 확정된 글: 가는 길과 연락처.
                        티타임이 지나도 6시간은 남긴다 — 늦어서 연락해야 하는 바로 그때 '지난 글'로 내려가며 번호·길찾기가 사라지면 안 된다. */}
                    {kind === "applied" && accepted && Date.now() < new Date(item.datetime).getTime() + 6 * 3_600_000 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {!item.isBlind && <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className={PILL}>지도</a>}
                            {!item.isBlind && <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className={PILL}>길찾기</a>}
                            {!isJoin && item.managerPhone && <a href={`sms:${item.managerPhone}`} className="h-9 px-3.5 rounded-full bg-[#64DD17]/15 text-[12.5px] font-medium text-[#8BE84A] inline-flex items-center shrink-0">문자 {item.managerPhone}</a>}
                        </div>
                    )}

                    {/* 내가 올린 글: 누가 신청했는지 · 승인/거절 · (티타임 뒤) 노쇼 표시.
                        시트에서는 자리가 없어 못 넣었고, 글쓴이는 목록 화면의 카드를 펼쳐야만 볼 수 있었다. */}
                    {kind === "mine" && <JoinApplicants bookingId={item.id} enabled />}

                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={onGo} className={PILL}>글 보기</button>
                        {canChat && <button type="button" onClick={onChat} className={PILL}>채팅방</button>}
                        {canToJoin && (
                            <button
                                type="button" onClick={onToJoin}
                                className="h-9 px-3.5 rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 text-[12.5px] font-medium text-[#FF8A33] inline-flex items-center shrink-0 active:bg-[#FF6B00]/20"
                            >조인으로 전환</button>
                        )}
                        {kind === "mine" && <button type="button" onClick={onDelete} className={PILL_OUTLINE}>내리기</button>}
                        {kind === "applied" && !past && (item.myJoinStatus === "applied" || item.myJoinStatus === "accepted") && (
                            <button type="button" onClick={onCancel} className={PILL_OUTLINE}>신청 취소</button>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
}

export default function GolfMyBookings() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { member } = useAuth();

    // 탭은 주소에 실린다 — 알림이 /golf/my-bookings?tab=applied 로 바로 내 신청을 열 수 있어야 한다(페이지로 옮긴 첫째 이유).
    const tabParam = new URLSearchParams(search).get("tab");
    const tab: Tab = tabParam === "applied" ? "applied" : "mine";
    const setTab = useCallback((next: Tab) => setLocation(`/golf/my-bookings?tab=${next}`, { replace: true }), [setLocation]);

    const mine = useQuery<any[]>({
        queryKey: MY_LISTINGS_QUERY_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"),
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: tab === "mine" ? 15_000 : false,
    });
    const applied = useQuery<any[]>({
        queryKey: MY_REQUESTS_QUERY_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/bookings?applied=1"),
        // 보고 있지 않아도 한 번은 받는다 — 탭 위 빨간 점(안 본 확정·거절)이 그 답을 보고 찍힌다.
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: tab === "applied" ? 15_000 : false,
    });
    const q = tab === "mine" ? mine : applied;

    // 주소로 바로 들어왔을 때 어느 탭에 소식이 있는지 알려 준다(내 신청 탭에 있으면 방금 지워진다).
    // ⚠️ 이 시각은 **상태로 들고 있어야 한다**. 처음 한 번만 읽으면, 내 신청 탭을 보고 나서 다시 '내가 올린 글'로
    //    돌아왔을 때 방금 읽은 소식에 빨간 점이 또 찍힌다(저장소는 갱신됐는데 화면이 옛 시각을 계속 본다).
    const [seenAt, setSeenAt] = useState(readRequestsSeen);
    // 내 신청 탭을 보면 "봤다" — 목록 화면 헤더 '내 예약' 빨간 점의 기준이기도 하다.
    useEffect(() => {
        if (tab === "applied" && applied.isSuccess) { markRequestsSeen(); setSeenAt(readRequestsSeen()); }
    }, [tab, applied.isSuccess]);
    const unseenApplied = tab === "mine" && hasUnseenRequestChange(applied.data, seenAt);

    // 30초마다 시각을 새로 잡는다 — 응답이 같으면(구조 공유) q.data 참조가 그대로라 분류가 처음 계산한 시각에 얼어붙는다.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    const { upcoming, past } = useMemo(() => {
        const rows = [...(q.data ?? [])].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
        return {
            // **시각** 기준 — 날짜로만 가르면 오늘 이미 지난 티타임이 '다가오는'에 남아 취소 단추가 뜨는데, 서버는 시각으로 막는다(400).
            upcoming: rows.filter((r) => new Date(r.datetime).getTime() > now),
            past: rows.filter((r) => new Date(r.datetime).getTime() <= now).reverse(),
        };
    }, [q.data, now]);

    /**
     * 펼친 줄 하나. 한 번에 하나만 여는 이유는 신청자 명단(JoinApplicants)이 8초마다 폴링하기 때문이다 —
     * 전부 펼쳐 두면 글 수만큼 요청이 나간다.
     * 기본값은 **다가오는 첫 줄**: 이 화면에 온 사람이 보러 온 건 다음 라운드다.
     */
    const [openId, setOpenId] = useState<string | null>(null);
    const [autoTab, setAutoTab] = useState<Tab | null>(null);
    useEffect(() => {
        if (autoTab === tab || upcoming.length === 0) return;
        setAutoTab(tab);
        setOpenId(upcoming[0].id);
    }, [tab, autoTab, upcoming]);

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "내렸어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] }); // mine·applied·신청자 명단을 접두로 함께
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
        },
        onError: (e: any) => toast({ title: e?.message || "내리지 못했어요", variant: "destructive" }),
    });
    const cancelMutation = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}/apply`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "신청을 취소했어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
        },
        onError: (e: any) => toast({ title: e?.message || "취소하지 못했어요", variant: "destructive" }),
    });

    /** 부킹 → 조인 전환. 시트 안 시트였던 것이 이제 페이지 위의 시트 하나다(포커스 덫이 없다). */
    const [toJoinItem, setToJoinItem] = useState<any | null>(null);

    /** '글 보기' — 딥링크 주소로 보낸다. 목록이 id 로 날짜를 되짚어 그 카드를 펼친다(BookingList useDeepLink). */
    const goToListing = useCallback((item: any) => {
        setLocation(`/golf/booking-list/${item.id}?view=${item.listingType === "JOIN" ? "JOIN" : "BOOKING"}`);
    }, [setLocation]);

    const render = (rows: any[], isPast: boolean) => rows.map((it) => (
        <Row
            key={it.id} item={it} kind={tab} past={isPast}
            open={openId === it.id}
            onToggle={() => setOpenId((prev) => (prev === it.id ? null : it.id))}
            onGo={() => goToListing(it)}
            onChat={() => setLocation(`/chat/listing/${it.id}`)}
            onToJoin={() => setToJoinItem(it)}
            onDelete={() => { if (window.confirm("이 글을 내릴까요? 되돌릴 수 없어요.")) deleteMutation.mutate(it.id); }}
            onCancel={() => { if (window.confirm("신청을 취소할까요?")) cancelMutation.mutate(it.id); }}
        />
    ));

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans selection:bg-[#64DD17]/30">
            <div className="sticky top-0 z-40 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-5 h-16 flex items-center gap-2.5">
                    {/* 알림을 눌러 앱이 **막 켜진** 경우엔 돌아갈 데가 없다 — 그냥 back() 하면 앱 밖으로 나간다.
                        이 화면은 푸시가 직접 가리키는 곳이라(거절·자리 참) 그 길이 실제로 자주 열린다. 채팅방과 같은 방식. */}
                    <button onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/golf/booking-list"))} className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors" title="뒤로가기">
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-[17px] font-semibold text-white leading-tight">내 예약</h1>
                    </div>
                </div>
                <div className="px-5 pb-3">
                    <div className="flex rounded-full bg-white/[0.05] border border-white/[0.08] p-0.5">
                        {(["mine", "applied"] as const).map((k) => (
                            <button
                                key={k} type="button" onClick={() => setTab(k)}
                                className={cn(
                                    "relative flex-1 h-9 rounded-full text-[13px] font-medium transition-colors",
                                    // ⚠️ 고른 탭에 `bg-white text-black` 을 쓰면 안 된다 — 골프 테마가 .bg-white 만 어두운 면으로 되받아
                                    //    검은 글씨가 어두운 바탕에 얹힌다. 리터럴 hex 로 쓴다.
                                    tab === k ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "text-white/70 active:text-white",
                                )}
                            >
                                {k === "mine" ? "내가 올린 글" : "내가 신청한 글"}
                                {k === "applied" && unseenApplied && <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-red-500" aria-label="새 소식" />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="px-5 pt-4 pb-8 space-y-5">
                {!member ? (
                    <p className="py-6 text-[13px] text-white/40">로그인하면 내가 올린 글과 신청한 글을 볼 수 있어요.</p>
                ) : q.isPending ? (
                    <div className="flex items-center gap-2 py-6 text-white/40"><LucideLoader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">불러오는 중…</span></div>
                ) : q.isError ? (
                    <p className="py-6 text-[13px] text-white/40">불러오지 못했어요.</p>
                ) : upcoming.length === 0 && past.length === 0 ? (
                    <div className="py-8 space-y-4">
                        <p className="text-[13px] text-white/40 leading-relaxed">
                            {tab === "mine"
                                ? "아직 올린 글이 없어요."
                                : "아직 신청한 글이 없어요."}
                        </p>
                        <button
                            type="button"
                            onClick={() => setLocation(`/golf/booking-list?view=${tab === "mine" ? "BOOKING" : "JOIN"}`)}
                            className="h-11 px-5 rounded-full bg-[#64DD17] text-[#051907] text-[13.5px] font-semibold"
                        >{tab === "mine" ? "부킹 목록 열기" : "조인 찾아보기"}</button>
                    </div>
                ) : (
                    <>
                        {upcoming.length > 0 && (
                            <section className="space-y-2">
                                <h2 className="text-[12px] font-medium text-white/50">다가오는 {upcoming.length}</h2>
                                <ul className="space-y-2">{render(upcoming, false)}</ul>
                            </section>
                        )}
                        {past.length > 0 && (
                            <section className="space-y-2">
                                <h2 className="text-[12px] font-medium text-white/50">지난 {past.length}</h2>
                                <ul className="space-y-2">{render(past, true)}</ul>
                            </section>
                        )}
                    </>
                )}
            </div>

            {/* 부킹 → 조인 전환. 시트 안 시트였던 구조가 사라져 이 화면이 그냥 들고 있으면 된다.
                끝나면 그 글로 옮겨 간다 — 방금 바꾼 글이 어떻게 보이는지가 다음에 궁금한 것이다. */}
            <ToJoinSheet
                item={toJoinItem}
                onClose={() => setToJoinItem(null)}
                onConverted={(converted) => goToListing(converted ?? { ...toJoinItem, listingType: "JOIN" })}
            />

            <HiqNavigation />
        </div>
    );
}
