/**
 * 내역 — 내가 올린 글 | 내가 신청한 글(2026-09-21).
 *
 * ⚠️ 고른 탭에 `bg-white text-black` 을 쓰면 안 된다 — 골프 테마가 .bg-white 만 어두운 면으로 되받고(.index.css 257-261)
 *   .text-black 은 그대로 둬서 검은 글씨가 어두운 바탕에 얹혀 통째로 안 보인다(2026-09-23 오너 제보). 임의값 hex 로 쓴다.
 *
 * 왜 시트인가: 목록은 고른 날짜 **하루치만** 받아온다. 내 글·내 신청은 날짜와 무관하게 한 번에 보여야 하고,
 * 여기서 바로 내리거나·취소하거나·그 날짜로 옮겨 갈 수 있어야 한다. 다가오는 글이 먼저, 지난 글은 흐리게 아래에.
 *
 * 신청한 글은 **상태 칩**(대기·확정·거절·안 옴)이 핵심이다 — 확정된 글은 지도·길찾기까지 여기서 바로.
 * 헤더의 "내역" 단추에 빨간 점을 찍는 기준(안 본 확정·거절)도 이 시트가 열릴 때 "봤다"로 정리한다(markRequestsSeen).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { JoinTypeBadge, SlotDots, costText, hostSeatLabel, joinTypeOf, kakaoMapUrl, kakaoRouteUrl, slotsOf } from "../join/joinUi";

export const MY_LISTINGS_QUERY_KEY = ["/api/hiq/golf/bookings", "mine"] as const;
export const MY_REQUESTS_QUERY_KEY = ["/api/hiq/golf/bookings", "applied"] as const;

const SEEN_KEY = "rankue_golf_requests_seen";
/** 마지막으로 내 신청 탭을 본 시각(epoch ms). 없으면 0. */
export function readRequestsSeen(): number {
    try { return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0; } catch { return 0; }
}
export function markRequestsSeen(): void {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* 저장소를 못 쓰는 환경 */ }
}
/** 안 본 변화가 있나 — 확정·거절이 마지막으로 본 뒤에 바뀐 신청. */
export function hasUnseenRequestChange(rows: readonly any[] | undefined, seenAt: number): boolean {
    return (rows ?? []).some((r) => (r.myJoinStatus === "accepted" || r.myJoinStatus === "rejected") && new Date(r.changedAt ?? 0).getTime() > seenAt);
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 그 글이 있는 날짜·탭으로 목록을 옮기고 카드를 펼친다 */
    onGo: (item: any) => void;
    /** 내가 올린 글 내리기 */
    onDelete: (item: any) => void;
    /** 내가 올린 부킹을 조인으로 전환(2026-09-23 오너: "내가 올린 부킹 내역에서 조인 돌리기 버튼") */
    onToJoin: (item: any) => void;
    /** 내가 한 신청 취소 */
    onCancelRequest: (item: any) => void;
    initialTab?: "mine" | "applied";
}

const STATUS: Record<string, { label: string; cls: string }> = {
    applied: { label: "대기", cls: "bg-[#FF6B00]/15 text-[#FF8A33]" },
    accepted: { label: "확정", cls: "bg-[#64DD17]/15 text-[#8BE84A]" },
    rejected: { label: "거절", cls: "bg-white/[0.06] text-white/45" },
    noshow: { label: "안 옴", cls: "bg-red-500/15 text-red-400" },
};

/**
 * 목록 카드(BookingCard)와 **같은 규칙**이어야 한다 — 두 화면이 같은 글을 다르게 부르면 안 된다.
 * '매장' 은 안 그린다: 부킹은 거의 다 업체가 올려서 모든 줄에 같은 글자가 반복될 뿐이고,
 * '매장' 은 당구 말이라 골프에서 뜻이 안 통했다(2026-09-23 오너). 예외인 '개인 양도'만 알린다.
 */
function Badge({ item }: { item: any }) {
    if (item.listingType === "JOIN") return <JoinTypeBadge type={joinTypeOf(item)} />;
    if (item.sellerType !== "PERSONAL") return null;
    return (
        <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#4DA3FF]/15 text-[#7CBBFF]">
            개인 양도
        </span>
    );
}

function Row({ item, past, kind, onGo, onDelete, onToJoin, onCancel }: { item: any; past: boolean; kind: "mine" | "applied"; onGo: () => void; onDelete?: () => void; onToJoin?: () => void; onCancel?: () => void }) {
    const isJoin = item.listingType === "JOIN";
    /**
     * '조인으로 전환' 이 붙는 자리(2026-09-23). 내가 올린 **부킹**이고, 아직 안 지난 티타임이고,
     * 아직 아무에게도 확정되지 않았을 때만. 확정된 티타임은 팀이 통째로 팔린 것이라 나눌 자리가 없다(서버도 409 로 막는다).
     */
    const canToJoin = kind === "mine" && !isJoin && !past && Number(item.joinApplied ?? 0) === 0;
    const name: string = item.isBlind ? item.blindName : item.courseName;
    const st = kind === "applied" ? STATUS[item.myJoinStatus] : null;
    const accepted = item.myJoinStatus === "accepted";
    return (
        <li className={cn("rounded-xl border bg-white/[0.03] px-3.5 py-3 space-y-2", accepted && !past ? "border-[#64DD17]/30" : "border-white/[0.08]", past && "opacity-50")}>
            <div className="flex items-center gap-3">
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
                            ? <span className="inline-flex items-center gap-1.5 truncate"><SlotDots slots={slotsOf(item)} filled={Number(item.joinApplied ?? 0)} size={14} hostLabel={hostSeatLabel(item)} />확정 {item.joinApplied ?? 0}/{item.joinCapacity ?? "?"}{kind === "mine" && Number(item.joinPending) > 0 && <span className="text-[#FF8A33]"> · 대기 {item.joinPending}</span>}</span>
                            : <span className="truncate">{item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}{kind === "applied" && item.myHeadcount > 1 ? ` · ${item.myHeadcount}명` : ""}{kind === "mine" && Number(item.joinPending) > 0 ? <span className="text-[#FF8A33]"> · 신청 {item.joinPending}</span> : null}</span>}
                    </div>
                </div>
                <button type="button" onClick={onGo} className="h-9 px-3 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/80 shrink-0">보기</button>
                {kind === "mine" && onDelete && (
                    <button type="button" onClick={onDelete} className="h-9 px-3 rounded-full border border-white/10 text-[12.5px] font-medium text-white/55 shrink-0 active:text-red-400">내리기</button>
                )}
                {kind === "applied" && onCancel && !past && (item.myJoinStatus === "applied" || item.myJoinStatus === "accepted") && (
                    <button type="button" onClick={onCancel} className="h-9 px-3 rounded-full border border-white/10 text-[12.5px] font-medium text-white/55 shrink-0 active:text-red-400">취소</button>
                )}
            </div>
            {/* 팔고 남은 자리를 조인으로 — 위 줄은 375px 에서 '보기 · 내리기' 로 이미 꽉 찼다. 한 줄 내려 온전한 이름을 준다. */}
            {canToJoin && onToJoin && (
                <button
                    type="button" onClick={onToJoin}
                    className="w-full h-10 rounded-xl border border-[#FF6B00]/35 bg-[#FF6B00]/10 text-[13px] font-medium text-[#FF8A33] active:bg-[#FF6B00]/20"
                >조인으로 전환</button>
            )}

            {/* 확정된 글: 가는 길과 연락처를 여기서 바로 */}
            {/* 티타임이 지나도 6시간은 남긴다 — 늦어서 연락해야 하는 바로 그때 '지난 글'로 내려가며 번호·길찾기가 사라지면 안 된다 */}
            {kind === "applied" && accepted && Date.now() < new Date(item.datetime).getTime() + 6 * 3_600_000 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {!item.isBlind && <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-white/[0.06] text-[12px] font-medium text-white/80 inline-flex items-center">지도</a>}
                    {!item.isBlind && <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-white/[0.06] text-[12px] font-medium text-white/80 inline-flex items-center">길찾기</a>}
                    {!isJoin && item.managerPhone && <a href={`sms:${item.managerPhone}`} className="h-8 px-3 rounded-full bg-[#64DD17]/15 text-[12px] font-medium text-[#8BE84A] inline-flex items-center">문자 {item.managerPhone}</a>}
                </div>
            )}
        </li>
    );
}

export function MyListingsSheet({ open, onOpenChange, onGo, onDelete, onToJoin, onCancelRequest, initialTab = "mine" }: Props) {
    const [tab, setTab] = useState<"mine" | "applied">(initialTab);
    // 탭은 **열리는 순간에만** 맞춘다 — initialTab 은 폴링으로 바뀌는 값이라, 의존성에 두면 열어 둔 채 새 알림이 올 때 보던 탭이 뒤집혔다.
    const initialTabRef = useRef(initialTab);
    initialTabRef.current = initialTab;
    useEffect(() => { if (open) setTab(initialTabRef.current); }, [open]);
    const mine = useQuery<any[]>({ queryKey: MY_LISTINGS_QUERY_KEY, queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"), enabled: open, staleTime: 10_000, refetchInterval: open ? 15_000 : false });
    const applied = useQuery<any[]>({ queryKey: MY_REQUESTS_QUERY_KEY, queryFn: () => apiRequest("/api/hiq/golf/bookings?applied=1"), enabled: open, staleTime: 10_000, refetchInterval: open ? 15_000 : false });
    // 내 신청 탭을 보면 "봤다" — 헤더 빨간 점의 기준
    useEffect(() => { if (open && tab === "applied" && applied.isSuccess) markRequestsSeen(); }, [open, tab, applied.isSuccess]);

    const q = tab === "mine" ? mine : applied;
    // 열려 있는 동안 30초마다, 그리고 열릴 때마다 시각을 새로 잡는다 — 목록 응답이 같으면(구조 공유) q.data 참조가 그대로라
    // 의존성이 q.data 뿐이면 분류가 처음 계산한 시각에 얼어붙는다.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!open) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, [open]);
    const { upcoming, past } = useMemo(() => {
        const rows = [...(q.data ?? [])].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
        return {
            // **시각** 기준 — 날짜로만 가르면 오늘 이미 지난 티타임이 '다가오는'에 남아 취소 단추가 뜨는데, 서버는 시각으로 막는다(400).
            upcoming: rows.filter((r) => new Date(r.datetime).getTime() > now),
            past: rows.filter((r) => new Date(r.datetime).getTime() <= now).reverse(),
        };
    }, [q.data, now]);

    const render = (rows: any[], isPast: boolean) => rows.map((it) => (
        <Row key={it.id} item={it} past={isPast} kind={tab} onGo={() => onGo(it)} onDelete={() => onDelete(it)} onToJoin={() => onToJoin(it)} onCancel={() => onCancelRequest(it)} />
    ));

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-white/10 rounded-t-2xl p-0 max-h-[82dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white">내역</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-white/50">날짜와 상관없이 전부 보여요</SheetDescription>
                </SheetHeader>
                <div className="px-5 pb-3 shrink-0">
                    <div className="flex rounded-full bg-white/[0.05] border border-white/[0.08] p-0.5">
                        {(["mine", "applied"] as const).map((k) => (
                            <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex-1 h-9 rounded-full text-[13px] font-medium transition-colors", tab === k ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "text-white/70 active:text-white")}>
                                {k === "mine" ? "내가 올린 글" : "내가 신청한 글"}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
                    {q.isPending ? (
                        <div className="flex items-center gap-2 py-6 text-white/40"><LucideLoader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">불러오는 중…</span></div>
                    ) : q.isError ? (
                        <p className="py-6 text-[13px] text-white/40">불러오지 못했어요.</p>
                    ) : upcoming.length === 0 && past.length === 0 ? (
                        <p className="py-6 text-[13px] text-white/40">{tab === "mine" ? "아직 올린 글이 없어요." : "아직 신청한 글이 없어요. 카드에서 '신청'을 누르면 여기에 쌓여요."}</p>
                    ) : (
                        <>
                            {upcoming.length > 0 && (
                                <section className="space-y-2">
                                    <h3 className="text-[12px] font-medium text-white/50">다가오는 {upcoming.length}</h3>
                                    <ul className="space-y-2">{render(upcoming, false)}</ul>
                                </section>
                            )}
                            {past.length > 0 && (
                                <section className="space-y-2">
                                    <h3 className="text-[12px] font-medium text-white/50">지난 {past.length}</h3>
                                    <ul className="space-y-2">{render(past, true)}</ul>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
