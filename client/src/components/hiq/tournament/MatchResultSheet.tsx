import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CREW_TEXT, IconButton } from "@/components/hiq/crew-ui";
import { LucideTrophy, LucideX } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BracketMatch, BracketPlayer } from "./TournamentBracket";

// 대진 카드를 눌렀을 때의 결과 보기(내 경기가 아닐 때). 예전엔 끝난 경기·남의 경기 카드가 버튼처럼 눌리는데
// 아무 일도 안 일어났다(2026-09-26 검토 P1). /game/:id 는 점수판 화면이라 관전자에게 열면 점수를 건드릴 수 있어
// 보내지 않는다 — 대진에 남은 결과(승수·마지막 판 점수·승자)만 여기서 보여 준다.

export function MatchResultSheet({ match, players, bestOf, roundLabel, onOpenChange }: {
    match: BracketMatch | null;
    players: Record<string, BracketPlayer>;
    bestOf: number;
    roundLabel: string;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useT();
    const name = (id: string | null) => (id && players[id]?.nickname) || "-";
    const series = bestOf > 1;
    const live = match?.status === "playing";

    const row = (side: "p1" | "p2") => {
        if (!match) return null;
        const id = side === "p1" ? match.p1Id : match.p2Id;
        const wins = side === "p1" ? match.p1Wins ?? 0 : match.p2Wins ?? 0;
        const score = side === "p1" ? match.p1Score : match.p2Score;
        const won = !!match.winnerId && match.winnerId === id;
        return (
            <div className={cn("flex items-center gap-3 min-h-12 px-4 border-l-[3px]", won ? "border-l-brand bg-brand/[0.06]" : "border-l-transparent")}>
                <span className={cn("flex-1 min-w-0 truncate text-[15px]", won ? "font-semibold text-ink-1" : "font-medium text-ink-2")}>{name(id)}</span>
                {won && <LucideTrophy className="w-4 h-4 text-gold shrink-0" />}
                <span className={cn("rk-num text-[22px] font-semibold", won ? "text-brand" : "text-ink-2")}>
                    {series ? wins : score ?? "-"}
                </span>
            </div>
        );
    };

    return (
        <Sheet open={!!match} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-1 text-ink-1 border-surface-line rounded-t-card p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <IconButton label={t("crewPoll.close")} onClick={() => onOpenChange(false)} className="absolute right-2 top-2">
                    <LucideX />
                </IconButton>
                <SheetHeader className="px-4 pt-5 pb-3 pr-14 text-left">
                    <SheetTitle className={CREW_TEXT.section}>{roundLabel}</SheetTitle>
                    <SheetDescription className={CREW_TEXT.sub}>
                        {live ? t("tournament.match.playing") : t("tournament.match.done")}
                        {series && ` · ${t("crewTournament.bestOfWin").replace("{n}", String(bestOf)).replace("{w}", String(Math.ceil(bestOf / 2)))}`}
                    </SheetDescription>
                </SheetHeader>
                <div className="mx-4 rk-card overflow-hidden divide-y divide-surface-line">
                    {row("p1")}
                    {row("p2")}
                </div>
                {series && match?.p1Score != null && match?.p2Score != null && (
                    <p className={cn(CREW_TEXT.sub, "px-4 pt-3 rk-num")}>
                        {t("crewTourney.lastGame").replace("{a}", String(match.p1Score)).replace("{b}", String(match.p2Score))}
                    </p>
                )}
            </SheetContent>
        </Sheet>
    );
}
