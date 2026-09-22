/**
 * 채팅 + → "경기 결과" 고르기(2026-09-23). 내 당구 기록(GET /history?sport=BILLIARDS) 중
 * **대전(match) 이고 gameId 가 있는** 행만 최근 15개 보여 준다 — 연습·대회 행은 카드로 만들 경기 행이 없다.
 * 한 경기가 여러 행(회원마다 한 줄)으로 잡히지 않게 gameId 로 중복을 걷어낸다.
 * 고르면 gameId 만 넘긴다 — 카드는 서버가 경기 행을 다시 읽어 만든다(가짜 카드 방지).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { attachDateLabel } from "./dateLabel";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Row { id: string; gameId: string; gameType: "3c" | "4c" | "golf"; opponentName: string | null; score: number; innings: number; isWinner?: boolean | null; createdAt: string }

export function RecentGamesPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (gameId: string) => void }) {
    const { t, locale } = useT();
    const q = useQuery<any[]>({ queryKey: ["/api/hiq/history", { sport: "BILLIARDS" }], queryFn: () => apiRequest("/api/hiq/history?sport=BILLIARDS"), enabled: open });
    const rows = useMemo<Row[]>(() => {
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const r of q.data ?? []) {
            if (r?.gameMode !== "match" || !r?.gameId || seen.has(r.gameId)) continue;
            seen.add(r.gameId);
            out.push(r);
            if (out.length >= 15) break;
        }
        return out;
    }, [q.data]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 max-h-[82dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.recentGames.title")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.attach.recentGames.desc")}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {q.isPending ? (
                        <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : q.isError ? (
                        <p className="py-8 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.loadFailed")}</p>
                    ) : rows.length === 0 ? (
                        <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.attach.recentGames.empty")}</p>
                    ) : (
                        <ul>
                            {rows.map((r) => (
                                <li key={r.gameId}>
                                    <button type="button" onClick={() => { onPick(r.gameId); onOpenChange(false); }} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2 text-left">
                                        <span className="shrink-0 px-2 py-0.5 rounded-lg bg-surface-2 text-[12px] font-semibold text-ink-2">{r.gameType === "3c" ? t("chat.attach.threeBall") : t("chat.attach.fourBall")}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[14px] font-medium text-ink-1 truncate">{r.opponentName ? t("chat.attach.vs").replace("{name}", r.opponentName) : t("chat.attach.noOpponent")}</span>
                                            <span className="block text-[12px] font-medium text-ink-3 truncate rk-num">{attachDateLabel(r.createdAt, locale)} · {t("chat.attach.inningsN").replace("{n}", String(r.innings))}</span>
                                        </span>
                                        <span className={cn("shrink-0 text-[18px] font-bold tabular-nums", r.isWinner ? "text-brand" : "text-ink-1")}>{r.score}</span>
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
