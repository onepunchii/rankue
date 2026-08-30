import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";
import { LucideTrophy, LucideChevronRight } from "@/lib/icons";

// 크루 명예의 전당 — 끝난 대회만 모아 보여준다.
//
// 왜 필요한가(오너 결정 2026-08-30): "대회는 명예도 중요하다". 대진표는 그 대회가 끝나면
// 아무도 안 보는데, 누가 몇 번 먹었는지가 남아야 다음 대회에 나갈 이유가 생긴다.
//
// 새로 저장하는 데이터는 없다 — 대회의 championId 와 참가자의 finalRank 를 집계만 한다.
// 우승자만 남기면 참가자 대부분에게 아무것도 안 남으므로 준우승·4강까지 같이 센다.
//
// 종목을 나누는 이유: 3쿠션과 4구는 실력 스케일이 달라서 한 줄로 세우면 한 사람이 모든
// 왕관을 쓴다. 종목별로 왕을 따로 두면 크루 안에 자랑거리가 늘어난다.
//
// 금색은 앱 전체에서 등급·시상 의례에만 쓰는 색이라 여기서만 쓴다(승패는 초록·흐림).

interface Honor {
    memberId: string; nickname: string; gameType: "3c" | "4c";
    wins: number; runnerUp: number; semi: number; played: number;
}
interface Past {
    id: string; title: string; gameType: "3c" | "4c"; format: "knockout" | "league";
    championId: string | null; championName: string | null; endedAt: string;
}
interface Data { current: Past | null; honors: Honor[]; history: Past[] }

export function HallOfFame({ crewId, isMember, onOpenTournament, className }: {
    crewId: string;
    isMember: boolean;
    /** 역대 대회를 누르면 그 대진표로 보낸다 — "그때 결승에서 졌지"가 남는다. */
    onOpenTournament?: (tournamentId: string) => void;
    className?: string;
}) {
    const { t } = useT();
    const { data, isLoading } = useQuery<Data>({
        queryKey: [`/api/hiq/crews/${crewId}/tournaments/hall-of-fame`],
        enabled: !!crewId && isMember,
    });

    if (isLoading) return <div className={cn("h-24 bg-black/[0.04] rounded-card animate-pulse", className)} />;

    // 끝난 대회가 없으면 빈 왕좌를 보여준다 — 매장 명예의 전당과 같은 결.
    if (!data || data.history.length === 0) {
        return (
            <div className={cn("p-8 text-center bg-black/[0.04] border border-dashed border-black/10 rounded-card", className)}>
                <LucideTrophy className="w-7 h-7 mx-auto text-ink-4 mb-2" />
                <p className="text-xs font-medium text-ink-3">{t("hallOfFame.empty")}</p>
            </div>
        );
    }

    return (
        <div className={cn("space-y-3", className)}>
            {/* 현 챔피언 */}
            {data.current?.championName && (
                <div className="rounded-card border border-gold bg-[var(--gold-soft)] px-5 py-4 flex items-center gap-3.5">
                    <TrophyMark />
                    <div className="min-w-0 flex-1">
                        <span className="block text-[10px] font-semibold tracking-[0.14em] text-gold rk-num">
                            {t("hallOfFame.currentChampion")}
                        </span>
                        <span className="block text-[17px] font-semibold text-ink-1 truncate">{data.current.championName}</span>
                        <span className="block text-[12px] text-ink-3 truncate mt-0.5">{data.current.title}</span>
                    </div>
                    <BallDot type={data.current.gameType} size={13} />
                </div>
            )}

            {/* 우승 횟수 순위 — 종목별(3쿠션 왕과 4구 왕을 따로 둔다).
                회원 × 종목이라 줄이 금방 늘어나므로 홈에서는 위 5줄만. */}
            {data.honors.length > 0 && (
                <div className="rk-card overflow-hidden">
                    {data.honors.slice(0, 5).map((h, i) => (
                        <div key={`${h.memberId}:${h.gameType}`} className={cn("flex items-center gap-2.5 px-4 py-3", i > 0 && "border-t border-surface-line")}>
                            <BallDot type={h.gameType} size={11} />
                            <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium text-ink-1">{h.nickname}</span>
                            {h.wins > 0 && (
                                <span className="flex items-center gap-1 text-[12.5px] font-semibold text-gold rk-num">
                                    <LucideTrophy className="w-3.5 h-3.5" />
                                    {h.wins}
                                </span>
                            )}
                            {/* 우승 못 해도 볼 게 있어야 한다 — 준우승·4강까지 센다.
                                다만 둘 다 0 이면 "준 0 · 4강 0" 은 빈 정보라 안 적는다. */}
                            {(h.runnerUp > 0 || h.semi > 0) && (
                                <span className="text-[11.5px] text-ink-4 rk-num shrink-0">
                                    {t("hallOfFame.record")
                                        .replace("{r}", String(h.runnerUp))
                                        .replace("{s}", String(h.semi))}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 역대 대회 */}
            <div className="rk-card overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-line text-[11px] text-ink-4 rk-num">
                    {t("hallOfFame.past").replace("{n}", String(data.history.length))}
                </div>
                {data.history.slice(0, 6).map((p, i) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenTournament?.(p.id)}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-4 py-3 text-left active:opacity-70",
                            i > 0 && "border-t border-surface-line",
                        )}
                    >
                        <BallDot type={p.gameType} size={11} />
                        <span className="flex-1 min-w-0 truncate text-[13px] text-ink-2">{p.title}</span>
                        {p.championName && (
                            <span className="flex items-center gap-1 text-[12.5px] font-semibold text-ink-1 shrink-0">
                                <LucideTrophy className="w-3 h-3 text-gold" />
                                {p.championName}
                            </span>
                        )}
                        <LucideChevronRight className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                    </button>
                ))}
            </div>
        </div>
    );
}

function TrophyMark() {
    return (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-gold" aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17" />
            <path d="M7 5H4.5a2.5 2.5 0 0 0 0 5H7" />
            <path d="M12 14v4" />
            <path d="M8.5 20h7" />
            <path d="M10 18h4l1 2H9l1-2Z" />
        </svg>
    );
}
