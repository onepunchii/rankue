/**
 * 내역 — 내가 올린 부킹·조인 전부(2026-09-21 오너: "내역 버튼을 눌러도 작동 안 함").
 *
 * 왜 시트인가: 목록은 고른 날짜 **하루치만** 받아온다. 그 안에서 내 글만 걸러 봤자 대부분 비어 "안 되는" 것처럼 보였다.
 * 내 글은 날짜와 무관하게 한 번에 보여야 하고(옛 등록내역이 그랬다), 여기서 바로 내리거나 그 날짜로 옮겨 갈 수 있어야 한다.
 * 다가오는 글이 먼저, 지난 글은 흐리게 아래에.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { JoinTypeBadge, SlotDots, costText, joinTypeOf, slotsOf } from "../join/joinUi";

export const MY_LISTINGS_QUERY_KEY = ["/api/hiq/golf/bookings", "mine"] as const;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 그 글이 있는 날짜·탭으로 목록을 옮기고 카드를 펼친다 */
    onGo: (item: any) => void;
    onDelete: (item: any) => void;
}

function Row({ item, past, onGo, onDelete }: { item: any; past: boolean; onGo: () => void; onDelete: () => void }) {
    const isJoin = item.listingType === "JOIN";
    return (
        <li className={cn("rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 flex items-center gap-3", past && "opacity-50")}>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    {isJoin
                        ? <JoinTypeBadge type={joinTypeOf(item)} />
                        : <span className={cn("px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold", item.sellerType === "PERSONAL" ? "bg-[#4DA3FF]/15 text-[#7CBBFF]" : "bg-[#64DD17]/15 text-[#8BE84A]")}>
                            {item.sellerType === "PERSONAL" ? "개인 양도" : "매장"}
                        </span>}
                    <span className="text-[14px] font-medium text-white truncate">{item.isBlind ? item.blindName : item.courseName}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-white/50">
                    <span>{kstDateLabel(item.datetime)} {kstTime(item.datetime)}</span>
                    <span className="w-0.5 h-2 bg-white/10 rounded-full" />
                    {isJoin
                        ? <span className="inline-flex items-center gap-1.5"><SlotDots slots={slotsOf(item)} filled={Number(item.joinApplied ?? 0)} size={14} />확정 {item.joinApplied ?? 0}{Number(item.joinPending) > 0 && <span className="text-[#FF8A33]"> · 대기 {item.joinPending}</span>}</span>
                        : <span>{item.greenFee ? `${Number(item.greenFee).toLocaleString()}원` : costText(item)}</span>}
                </div>
            </div>
            <button type="button" onClick={onGo} className="h-9 px-3 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/80 shrink-0">보기</button>
            <button type="button" onClick={onDelete} className="h-9 px-3 rounded-full border border-white/10 text-[12.5px] font-medium text-white/55 shrink-0 hover:text-red-400 hover:border-red-500/40">내리기</button>
        </li>
    );
}

export function MyListingsSheet({ open, onOpenChange, onGo, onDelete }: Props) {
    const q = useQuery<any[]>({
        queryKey: MY_LISTINGS_QUERY_KEY,
        queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"),
        enabled: open,
        staleTime: 10_000,
    });
    const todayKey = kstDateKey(Date.now());
    const { upcoming, past } = useMemo(() => {
        const rows = [...(q.data ?? [])].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
        return {
            upcoming: rows.filter((r) => kstDateKey(r.datetime) >= todayKey),
            past: rows.filter((r) => kstDateKey(r.datetime) < todayKey).reverse(),
        };
    }, [q.data, todayKey]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-white/10 rounded-t-2xl p-0 max-h-[80dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white">내가 올린 글</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-white/50">부킹·조인 전부 — 날짜와 상관없이 보여요</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
                    {q.isPending ? (
                        <div className="flex items-center gap-2 py-6 text-white/40"><LucideLoader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">불러오는 중…</span></div>
                    ) : q.isError ? (
                        <p className="py-6 text-[13px] text-white/40">불러오지 못했어요.</p>
                    ) : upcoming.length === 0 && past.length === 0 ? (
                        <p className="py-6 text-[13px] text-white/40">아직 올린 글이 없어요. 아래 "+ 올리기"로 시작해 보세요.</p>
                    ) : (
                        <>
                            {upcoming.length > 0 && (
                                <section className="space-y-2">
                                    <h3 className="text-[12px] font-medium text-white/50">다가오는 {upcoming.length}</h3>
                                    <ul className="space-y-2">{upcoming.map((it) => <Row key={it.id} item={it} past={false} onGo={() => onGo(it)} onDelete={() => onDelete(it)} />)}</ul>
                                </section>
                            )}
                            {past.length > 0 && (
                                <section className="space-y-2">
                                    <h3 className="text-[12px] font-medium text-white/50">지난 {past.length}</h3>
                                    <ul className="space-y-2">{past.map((it) => <Row key={it.id} item={it} past onGo={() => onGo(it)} onDelete={() => onDelete(it)} />)}</ul>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
