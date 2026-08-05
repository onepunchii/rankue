import { LucideSwords } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { MatchResult } from "@/components/hiq/ui/FormBadges";

/**
 * 상대전적을 "다음 판을 칠 이유"로 승격시키는 카드.
 * 서버가 이미 내려주는 h2h(승/패/무)를 히어로로 올리고, 최근 흐름과 에버리지를 나란히 붙인다.
 */

export interface RivalryLabel {
    text: string;
    className: string;
}

/**
 * 3승 이상 벌어지면 관계에 이름을 붙인다. 라벨이 붙는 순간 "설욕"이라는 동기가 생긴다.
 * 승패 합이 적을 때 붙이면 우연을 실력처럼 말하게 되므로 최소 표본을 둔다.
 */
export function getRivalryLabel(wins: number, losses: number): RivalryLabel | null {
    const decided = wins + losses;
    if (decided < 3) return null;

    const diff = wins - losses;
    if (diff <= -3) return { text: "천적", className: "bg-red-500/10 text-red-500" };
    if (diff >= 3) return { text: "내가 우세", className: "bg-brand/12 text-brand" };
    if (decided >= 4 && Math.abs(diff) <= 1) return { text: "박빙", className: "bg-black/[0.06] text-black/55" };
    return null;
}

const DOT_STYLE: Record<MatchResult, string> = {
    W: "bg-brand",
    L: "bg-red-500",
    D: "bg-black/20",
};

const DOT_TITLE: Record<MatchResult, string> = { W: "승", L: "패", D: "무" };

/**
 * 최근 5경기 점(dot). 항상 5칸을 그려서 기록이 적어도 줄 높이가 흔들리지 않게 한다.
 * 왼쪽이 최신 — 앱의 다른 폼 배지(FormBadges)와 같은 순서다.
 */
export function FormDots({ results, size = 10 }: { results: MatchResult[]; size?: number }) {
    return (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => {
                const r = results[i];
                return (
                    <span
                        key={i}
                        title={r ? DOT_TITLE[r] : "기록 없음"}
                        style={{ width: size, height: size }}
                        className={cn("rounded-full shrink-0", r ? DOT_STYLE[r] : "bg-black/[0.07]")}
                    />
                );
            })}
        </div>
    );
}

interface HeadToHeadCardProps {
    opponentName: string;
    wins: number;
    losses: number;
    draws: number;
    /** 최신순, 최대 5개 */
    recentForm: MatchResult[];
    myAvg?: number | null;
    opponentAvg?: number | null;
    /** "3쿠션" / "4구" — 에버리지가 어느 종목 기준인지 */
    avgTypeLabel?: string;
}

export const HeadToHeadCard = ({
    opponentName,
    wins,
    losses,
    draws,
    recentForm,
    myAvg,
    opponentAvg,
    avgTypeLabel,
}: HeadToHeadCardProps) => {
    const total = wins + losses + draws;

    if (total === 0) {
        return (
            <div className="rk-card p-8 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-black/[0.04] flex items-center justify-center mb-4">
                    <LucideSwords className="w-7 h-7 text-black/30" />
                </div>
                <p className="text-[15px] font-semibold text-ink-1 tracking-tight">
                    아직 맞대결 기록이 없어요
                </p>
                <p className="text-[13px] font-medium text-black/55 mt-1.5 leading-relaxed">
                    한 판 붙고 나면 여기에 전적이 쌓입니다
                </p>
            </div>
        );
    }

    const label = getRivalryLabel(wins, losses);
    const winRate = Math.round((wins / total) * 100);
    const showAvg = (myAvg ?? 0) > 0 && (opponentAvg ?? 0) > 0;

    return (
        <div className="rk-card p-5">
            {/* 관계 라벨 + 승률 */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] font-semibold text-black/45">상대전적</span>
                <div className="flex items-center gap-2">
                    {label && (
                        <span className={cn("px-2.5 py-1 rounded-full text-[12px] font-semibold leading-none", label.className)}>
                            {label.text}
                        </span>
                    )}
                    <span className="text-[12px] font-semibold text-black/55 tabular-nums">
                        승률 {winRate}%
                    </span>
                </div>
            </div>

            {/* 나 7 : 5 상대 */}
            <div className="flex items-end gap-3">
                <div className="flex-1 min-w-0 text-right">
                    <div className="text-[13px] font-semibold text-black/55 mb-1">나</div>
                    <div className="text-[44px] font-bold text-brand tabular-nums leading-none tracking-tight">
                        {wins}
                    </div>
                </div>
                <div className="text-[26px] font-bold text-black/20 leading-none pb-1.5">:</div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-semibold text-black/55 mb-1 truncate">{opponentName}</div>
                    <div className="text-[44px] font-bold text-ink-1 tabular-nums leading-none tracking-tight">
                        {losses}
                    </div>
                </div>
            </div>

            {/* 줄다리기 바 — 승/무/패 비중 */}
            <div className="mt-4 h-2 rounded-full bg-black/[0.06] overflow-hidden flex">
                <div className="h-full bg-brand" style={{ width: `${(wins / total) * 100}%` }} />
                <div className="h-full bg-black/15" style={{ width: `${(draws / total) * 100}%` }} />
                <div className="h-full bg-black/45" style={{ width: `${(losses / total) * 100}%` }} />
            </div>

            <div className="mt-2 flex items-center justify-between text-[12px] font-medium text-black/45 tabular-nums">
                <span>{wins}승</span>
                {draws > 0 && <span>{draws}무</span>}
                <span>{losses}패</span>
            </div>

            {/* 최근 5경기 */}
            <div className="mt-5 flex items-center justify-between">
                <span className="text-[12px] font-medium text-black/55">
                    최근 5경기 <span className="text-black/35">· 최신순</span>
                </span>
                <FormDots results={recentForm} />
            </div>

            {/* 에버리지 비교 */}
            {showAvg && (
                <>
                    <div className="h-px bg-black/[0.06] my-4" />
                    <div className="flex items-center">
                        <div className="flex-1 text-center">
                            <div className="text-[11px] font-medium text-black/45 mb-1">내 에버리지</div>
                            <div className="text-[19px] font-bold text-brand tabular-nums leading-none">
                                {Number(myAvg).toFixed(3)}
                            </div>
                        </div>
                        <div className="w-px h-9 bg-black/10" />
                        <div className="flex-1 text-center">
                            <div className="text-[11px] font-medium text-black/45 mb-1 truncate px-1">
                                {opponentName} 에버리지
                            </div>
                            <div className="text-[19px] font-bold text-ink-1 tabular-nums leading-none">
                                {Number(opponentAvg).toFixed(3)}
                            </div>
                        </div>
                    </div>
                    {avgTypeLabel && (
                        <div className="mt-2.5 text-center text-[11px] font-medium text-black/35">
                            {avgTypeLabel} 기준
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
