/**
 * 채팅 + → "라운드 결과" 고르기(2026-09-23). 내 골프 기록(GET /history?sport=GOLF) 중 **golfSessionId 가 있는** 행만
 * 최근 15개 — 카드의 '열기'가 그 세션의 결과 화면으로 가야 해서 세션 없는(수기) 행은 뺀다.
 * 고르면 historyId 를 넘긴다 — 서버가 내 행인지 확인하고 카드를 만든다.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { attachDateLabel } from "./dateLabel";
import { useT } from "@/lib/i18n";

interface Row { id: string; golfSessionId: string; locationName: string | null; score: number; createdAt: string }

export function GolfRoundsPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (historyId: string) => void }) {
    const { t, locale } = useT();
    const q = useQuery<any[]>({ queryKey: ["/api/hiq/history", { sport: "GOLF" }], queryFn: () => apiRequest("/api/hiq/history?sport=GOLF"), enabled: open });
    const rows = useMemo<Row[]>(() => (q.data ?? []).filter((r) => r?.id && r?.golfSessionId).slice(0, 15), [q.data]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 max-h-[82dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.golfRounds.title")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.attach.golfRounds.desc")}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {q.isPending ? (
                        <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : q.isError ? (
                        <p className="py-8 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.loadFailed")}</p>
                    ) : rows.length === 0 ? (
                        <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.golfRounds.empty")}</p>
                    ) : (
                        <ul>
                            {rows.map((r) => (
                                <li key={r.id}>
                                    <button type="button" onClick={() => { onPick(r.id); onOpenChange(false); }} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2 text-left">
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[14px] font-medium text-ink-1 truncate">{r.locationName || t("chat.attach.golfRounds.noCourse")}</span>
                                            <span className="block text-[12px] font-medium text-ink-3 truncate rk-num">{attachDateLabel(r.createdAt, locale)}</span>
                                        </span>
                                        <span className="shrink-0 text-[15px] font-bold tabular-nums text-ink-1">{t("chat.attach.strokesN").replace("{n}", String(r.score))}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
