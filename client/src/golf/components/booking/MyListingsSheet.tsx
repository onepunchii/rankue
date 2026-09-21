/**
 * 내역 — 내가 올린 글 | 내가 신청한 글(2026-09-21).
 *
 * 왜 시트인가: 목록은 고른 날짜 **하루치만** 받아온다. 내 글·내 신청은 날짜와 무관하게 한 번에 보여야 하고,
 * 여기서 바로 내리거나·취소하거나·그 날짜로 옮겨 갈 수 있어야 한다. 다가오는 글이 먼저, 지난 글은 흐리게 아래에.
 *
 * 신청한 글은 **상태 칩**(대기·확정·거절·안 옴)이 핵심이다 — 확정된 글은 지도·길찾기까지 여기서 바로.
 * 헤더의 "내역" 단추에 빨간 점을 찍는 기준(안 본 확정·거절)도 이 시트가 열릴 때 "봤다"로 정리한다(markRequestsSeen).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { JoinTypeBadge, SlotDots, costText, joinTypeOf, kakaoMapUrl, kakaoRouteUrl, slotsOf } from "../join/joinUi";

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

function Badge({ item }: { item: any }) {
    if (item.listingType === "JOIN") return <JoinTypeBadge type={joinTypeOf(item)} />;
    return (
        <span className={cn("px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold", item.sellerType === "PERSONAL" ? "bg-[#4DA3FF]/15 text-[#7CBBFF]" : "bg-[#64DD17]/15 text-[#8BE84A]")}>
            {item.sellerType === "PERSONAL" ? "개인 양도" : "매장"}
        </span>
    );
}

function Row({ item, past, kind, onGo, onDelete, onCancel }: { item: any; past: boolean; kind: "mine" | "applied"; onGo: () => void; onDelete?: () => void; onCancel?: () => void }) {
    const isJoin = item.listingType === "JOIN";
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
                            ? <span className="inline-flex items-center gap-1.5 truncate"><SlotDots slots={slotsOf(item)} filled={Number(item.joinApplied ?? 0)} size={14} />확정 {item.joinApplied ?? 0}/{item.joinCapacity ?? "?"}{kind === "mine" && Number(item.joinPending) > 0 && <span className="text-[#FF8A33]"> · 대기 {item.joinPending}</span>}</span>
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
            {/* 확정된 글: 가는 길과 연락처를 여기서 바로 */}
            {kind === "applied" && accepted && !past && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {!item.isBlind && <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-white/[0.06] text-[12px] font-medium text-white/80 inline-flex items-center">지도</a>}
                    {!item.isBlind && <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-white/[0.06] text-[12px] font-medium text-white/80 inline-flex items-center">길찾기</a>}
                    {!isJoin && item.managerPhone && <a href={`sms:${item.managerPhone}`} className="h-8 px-3 rounded-full bg-[#64DD17]/15 text-[12px] font-medium text-[#8BE84A] inline-flex items-center">문자 {item.managerPhone}</a>}
                </div>
            )}
        </li>
    );
}

export function MyListingsSheet({ open, onOpenChange, onGo, onDelete, onCancelRequest, initialTab = "mine" }: Props) {
    const [tab, setTab] = useState<"mine" | "applied">(initialTab);
    useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
    const mine = useQuery<any[]>({ queryKey: MY_LISTINGS_QUERY_KEY, queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"), enabled: open, staleTime: 10_000 });
    const applied = useQuery<any[]>({ queryKey: MY_REQUESTS_QUERY_KEY, queryFn: () => apiRequest("/api/hiq/golf/bookings?applied=1"), enabled: open, staleTime: 10_000 });
    // 내 신청 탭을 보면 "봤다" — 헤더 빨간 점의 기준
    useEffect(() => { if (open && tab === "applied" && applied.isSuccess) markRequestsSeen(); }, [open, tab, applied.isSuccess]);

    const q = tab === "mine" ? mine : applied;
    const todayKey = kstDateKey(Date.now());
    const { upcoming, past } = useMemo(() => {
        const rows = [...(q.data ?? [])].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
        return {
            upcoming: rows.filter((r) => kstDateKey(r.datetime) >= todayKey),
            past: rows.filter((r) => kstDateKey(r.datetime) < todayKey).reverse(),
        };
    }, [q.data, todayKey]);

    const render = (rows: any[], isPast: boolean) => rows.map((it) => (
        <Row key={it.id} item={it} past={isPast} kind={tab} onGo={() => onGo(it)} onDelete={() => onDelete(it)} onCancel={() => onCancelRequest(it)} />
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
                            <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex-1 h-9 rounded-full text-[13px] font-medium transition-colors", tab === k ? "bg-white text-black" : "text-white/60")}>
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
