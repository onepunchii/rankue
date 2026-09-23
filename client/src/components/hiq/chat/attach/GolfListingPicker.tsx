/**
 * 채팅 + → "조인·부킹 글" 고르기(2026-09-23). 내가 올린 글(?mine=1)과 내가 신청한 글(?applied=1)을 합친다 —
 * 채팅에 올릴 만한 글은 이 둘뿐이다(남의 글을 대신 퍼 나르지 않는다). 같은 글이 둘 다에 있을 수 있어 id 로 중복 제거,
 * 티타임 오름차순, **시각** 기준으로 지난 글은 뺀다(날짜로만 가르면 오늘 지난 티타임이 남는다 — 내 예약 페이지와 같은 기준).
 * 고르면 bookingId 만 넘긴다 — 카드는 서버가 글을 다시 읽어 만든다(비공개 글의 blindName 처리도 서버).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { attachDateTimeLabel } from "./dateLabel";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function GolfListingPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (bookingId: string) => void }) {
    const { t, locale } = useT();
    // 내 예약 페이지(golf/lib/myListings)와 같은 키를 쓴다 — 거기서 받아 둔 목록이 있으면 바로 보인다.
    const mine = useQuery<any[]>({ queryKey: ["/api/hiq/golf/bookings", "mine"], queryFn: () => apiRequest("/api/hiq/golf/bookings?mine=1"), enabled: open, staleTime: 10_000 });
    const applied = useQuery<any[]>({ queryKey: ["/api/hiq/golf/bookings", "applied"], queryFn: () => apiRequest("/api/hiq/golf/bookings?applied=1"), enabled: open, staleTime: 10_000 });
    const rows = useMemo(() => {
        const now = Date.now();
        const byId = new Map<string, any>();
        for (const r of [...(mine.data ?? []), ...(applied.data ?? [])]) if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
        return [...byId.values()]
            // 운영자가 가린 글(isBlinded)은 ?mine=1 응답에 섞여 온다 — 고르면 서버가 404 를 줘서 왜 안 되는지 알 길이 없다.
            .filter((r) => !r.isBlinded && new Date(r.datetime).getTime() > now)
            .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    }, [mine.data, applied.data]);
    const pending = mine.isPending || applied.isPending;
    const failed = mine.isError && applied.isError;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 max-h-[82dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.golfListing.title")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.attach.golfListing.desc")}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {pending ? (
                        <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : failed ? (
                        <p className="py-8 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.loadFailed")}</p>
                    ) : rows.length === 0 ? (
                        <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.golfListing.empty")}</p>
                    ) : (
                        <ul>
                            {rows.map((r) => {
                                const isJoin = r.listingType === "JOIN";
                                const name: string = r.isBlind ? (r.blindName ?? "") : (r.courseName ?? "");
                                return (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => { onPick(String(r.id)); onOpenChange(false); }} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2 text-left">
                                            <span className={cn("shrink-0 px-2 py-0.5 rounded-lg text-[12px] font-semibold", isJoin ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-2")}>{isJoin ? t("chat.attach.golfListing.join") : t("chat.attach.golfListing.booking")}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[14px] font-medium text-ink-1 truncate">{name}</span>
                                                <span className="block text-[12px] font-medium text-ink-3 truncate rk-num">{attachDateTimeLabel(r.datetime, locale)}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
