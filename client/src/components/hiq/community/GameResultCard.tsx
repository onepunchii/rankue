import { useT } from "@/lib/i18n";
import type { CommunityGameCard } from "./types";

// 자랑 글의 경기결과 카드 — 서버가 전적 DB에서 스냅샷을 뜬 것이라 수정·위조 불가.
// "전적 연동 카드"라는 신뢰가 랭큐 커뮤니티만의 차별점이므로 눈에 띄게 그린다.
export const GameResultCard = ({ card, compact }: { card: CommunityGameCard; compact?: boolean }) => {
    const { t } = useT();
    const gameLabel = card.gameType === "3c" ? t("community.threeBall") : t("community.fourBall");
    const date = new Date(card.playedAt);
    const dateLabel = `${date.getMonth() + 1}.${date.getDate()}`;

    return (
        <div className="rounded-2xl bg-brand/[0.06] border border-brand/15 p-4">
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-bold leading-none ${card.isWinner ? "bg-brand text-white" : "bg-black/[0.08] text-black/55"}`}>
                        {card.isWinner ? t("community.win") : t("community.loss")}
                    </span>
                    <span className="text-[12px] font-semibold text-ink-2">{gameLabel}</span>
                    {card.opponentName && (
                        <span className="text-[12px] font-medium text-black/45">vs {card.opponentName}</span>
                    )}
                </div>
                <span className="text-[11px] font-medium text-black/40">{dateLabel} · {t("community.verifiedRecord")}</span>
            </div>
            <div className={`grid ${compact ? "grid-cols-3" : "grid-cols-4"} gap-2`}>
                <div>
                    <div className="text-[11px] font-medium text-black/45">{t("community.score")}</div>
                    <div className="text-[17px] font-bold text-ink-1 tabular-nums">{card.score}</div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-black/45">{t("community.innings")}</div>
                    <div className="text-[17px] font-bold text-ink-1 tabular-nums">{card.innings}</div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-black/45">{t("community.avg")}</div>
                    <div className="text-[17px] font-bold text-brand tabular-nums">{card.average}</div>
                </div>
                {!compact && (
                    <div>
                        <div className="text-[11px] font-medium text-black/45">{t("community.highRun")}</div>
                        <div className="text-[17px] font-bold text-ink-1 tabular-nums">{card.highRun}</div>
                    </div>
                )}
            </div>
        </div>
    );
};
