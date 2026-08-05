
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { LucideFlag, LucideSword, LucideSwords, LucideCalendar } from "@/lib/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { HiqGame, HiqMember, HiqGameHistory } from "@shared/schema";
import { HiqMemberWithH2H } from "./types";
import { HeadToHeadCard } from "./HeadToHeadCard";
import { MatchResult } from "@/components/hiq/ui/FormBadges";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { useT } from "@/lib/i18n";

interface VsHistoryDialogProps {
    friendId: string | null;
    friend: HiqMemberWithH2H | undefined;
    onClose: () => void;
    currentSport: string;
    vsGames: HiqGame[] | undefined;
    isLoading: boolean;
    me: HiqMember | undefined;
}

const avgOf = (m: any, type: "3c" | "4c"): number | null => {
    const v = type === "3c" ? m?.avg3c : m?.avg4c;
    return typeof v === "number" && v > 0 ? v : null;
};

export const VsHistoryDialog = ({
    friendId,
    friend,
    onClose,
    currentSport,
    vsGames,
    isLoading,
    me
}: VsHistoryDialogProps) => {
    const { t } = useT();
    const myId = me?.id;
    const games = vsGames ?? [];
    const isGolf = currentSport === "GOLF";

    // "한 판 더" — 기존 대결 생성 흐름(GameCreationModal)을 그대로 띄운다. 서버는 슬롯2~4에
    // "내 핀에 동의해 들어온 회원"만 허용하므로 상대를 코드로 미리 앉힐 수는 없다. 대신 핀이
    // 뜬 대결 로비까지 한 번에 데려다주는 게 현재 구조에서 가능한 최단 경로다.
    const [rematchOpen, setRematchOpen] = useState(false);

    // 대시보드와 같은 키 → 캐시 공유. 로비가 목표 점수를 계산할 때 쓴다.
    const { data: history } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history"],
        enabled: !isGolf && (!!friendId || rematchOpen),
    });

    // /games/vs 는 최근 10경기만 준다. 전체 승패는 친구 목록이 들고 온 h2h(서버 전수 집계)가
    // 정답이다 — 이걸 안 쓰면 11경기째부터 "나 7:5"가 조용히 틀린 숫자가 된다.
    const computed = useMemo(() => {
        const wins = games.filter((g) => g.winnerId === myId).length;
        const losses = games.filter((g) => g.winnerId === friendId).length;
        return { wins, losses, draws: games.length - wins - losses };
    }, [games, myId, friendId]);

    const record = friend?.h2h ?? computed;

    // vsGames is newest-first
    const vsForm: MatchResult[] = useMemo(
        () => games.slice(0, 5).map((g) => (g.winnerId === myId ? "W" : g.winnerId === friendId ? "L" : "D")),
        [games, myId, friendId]
    );

    // 3쿠션과 4구는 평균 스케일이 완전히 달라 섞으면 안 된다. 둘이 실제로 많이 친 종목을 기준으로.
    const avgType: "3c" | "4c" = useMemo(() => {
        const c3 = games.filter((g) => g.gameType === "3c").length;
        const c4 = games.filter((g) => g.gameType === "4c").length;
        if (c3 || c4) return c3 >= c4 ? "3c" : "4c";
        return avgOf(me, "3c") ? "3c" : "4c";
    }, [games, me]);

    const hasRecord = record.wins + record.losses + record.draws > 0;

    const handleRematch = () => {
        onClose();
        // 같은 틱에 다음 다이얼로그를 열면 Radix가 닫히는 다이얼로그의 body 잠금(pointer-events)을
        // 아직 안 풀어 로비가 먹통이 되는 경우가 있다. 닫힘 애니메이션(200ms)만큼 비켜준다.
        window.setTimeout(() => setRematchOpen(true), 220);
    };

    return (
        <>
            <Dialog open={!!friendId} onOpenChange={(open) => !open && onClose()}>
                {/* 헤더/본문/푸터 3행 — 히어로 카드가 붙어 길어졌으므로 본문만 스크롤시킨다
                    (그냥 두면 작은 화면에서 '한 판 더' 버튼이 화면 밖으로 밀린다) */}
                <DialogContent className="bg-white text-ink-1 max-w-lg w-[95%] rounded-card p-0 overflow-hidden gap-0 max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto]">
                    <DialogHeader className="p-6 border-b border-black/10">
                        <DialogTitle className="text-[20px] font-bold tracking-tight flex items-center gap-2 text-brand">
                            {isGolf ? <LucideFlag className="w-5 h-5 text-brand" /> : <LucideSword className="w-5 h-5 text-brand" />}
                            VS {friend?.name}
                        </DialogTitle>
                        <DialogDescription className="text-black/55 text-[13px] font-medium mt-1">
                            {t("vsHistoryDialog.description")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 overflow-y-auto scrollbar-hide">
                        {/* 상대전적 히어로 */}
                        {(!isLoading || hasRecord) && (
                            <div className="px-4 pt-5">
                                <HeadToHeadCard
                                    opponentName={friend?.name || "상대"}
                                    wins={record.wins}
                                    losses={record.losses}
                                    draws={record.draws}
                                    recentForm={vsForm}
                                    myAvg={isGolf ? null : avgOf(me, avgType)}
                                    opponentAvg={isGolf ? null : avgOf(friend, avgType)}
                                    avgTypeLabel={avgType === "3c" ? "3쿠션" : "4구"}
                                />
                            </div>
                        )}

                        <div className="p-4 space-y-3">
                            {isLoading ? (
                                <div className="py-12 flex justify-center">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1 }}
                                        className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full"
                                    />
                                </div>
                            ) : vsGames && vsGames.length > 0 ? (
                                vsGames.map((game) => {
                                    const myScore = game.player1Id === myId ? game.player1Score :
                                        game.player2Id === myId ? game.player2Score :
                                            game.player3Id === myId ? game.player3Score :
                                                game.player4Score;

                                    const friendScore = game.player1Id === friendId ? game.player1Score :
                                        game.player2Id === friendId ? game.player2Score :
                                            game.player3Id === friendId ? game.player3Score :
                                                game.player4Score;

                                    const isWin = game.winnerId === myId;
                                    const isLoss = game.winnerId === friendId;
                                    const resultLabel = isWin ? t("vsHistoryDialog.win") : (isLoss ? t("vsHistoryDialog.loss") : t("vsHistoryDialog.draw"));
                                    const resultColor = isWin ? 'text-brand' : (isLoss ? 'text-red-500' : 'text-black/40');
                                    const resultBg = isWin ? 'bg-brand/12' : (isLoss ? 'bg-red-500/12' : 'bg-black/[0.06]');

                                    return (
                                        <div key={game.id} className="rk-card p-4 flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg ${resultBg} ${resultColor}`}>
                                                        {resultLabel}
                                                    </span>
                                                    <span className="text-[12px] font-medium text-black/55 flex items-center gap-1">
                                                        <LucideCalendar className="w-3 h-3" />
                                                        {format(new Date(game.playedAt), "yyyy.MM.dd", { locale: ko })}
                                                    </span>
                                                </div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[13px] font-semibold text-black/60">{game.gameType === '3c' ? t("vsHistoryDialog.threeCushion") : t("vsHistoryDialog.fourBall")}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-[12px] font-medium text-black/55">{t("vsHistoryDialog.scoreLabel")}</p>
                                                    <p className="text-[20px] font-bold text-ink-1 tabular-nums">
                                                        {myScore} : {friendScore}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-12 text-center text-black/55">
                                    <p className="text-[13px] font-medium">{t("vsHistoryDialog.noRecords")}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-5 border-t border-black/10 flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 h-14 rounded-full bg-black/[0.05] text-[15px] font-semibold text-black/60 active:scale-[0.98] transition-transform shrink-0"
                        >
                            {t("vsHistoryDialog.close")}
                        </button>
                        {!isGolf && (
                            <button
                                onClick={handleRematch}
                                disabled={!me}
                                className="flex-1 h-14 rounded-full bg-brand text-white text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                            >
                                <LucideSwords className="w-5 h-5" />
                                한 판 더
                            </button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* 대결 로비 — VS 다이얼로그 밖(형제)으로 빼서 다이얼로그 중첩을 피한다 */}
            {!isGolf && (
                <GameCreationModal
                    open={rematchOpen}
                    onOpenChange={setRematchOpen}
                    member={me}
                    history={history}
                    initialMode="match"
                />
            )}
        </>
    );
};
