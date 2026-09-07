import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "../setupPresets";
import type { Phase } from "../simReducer";
import { displayAverage, formatAverage, ruleBadge, tableLabel } from "../hudMath";

// 상단 HUD. 한 줄의 규칙·테이블 배지 + 상태 칩 + 소리 토글, 그 아래 선수 카드(점수/다마수 · 이닝 · 에버리지 · 하이런 · 런).
// 에버리지 규약은 hudMath.inningsForAverage 주석 참고(점수판 앱과 같이 진행 중 이닝 포함).
// phi 드래그마다 페이지가 재렌더되므로 memo — HUD 의 props 는 샷 사이에만 바뀐다.
export interface HUDProps {
    session: SessionState | null;
    config: SimSetupConfig | null;
    phase: Phase;
    names: readonly string[];
    record: boolean;
    offline: boolean;
    syncing: boolean;
    queued: number;
    muted: boolean;
    onToggleMute: () => void;
}

export const HUD = memo(function HUD(p: HUDProps) {
    const { t } = useT();
    const s = p.session;
    const playing = s?.status === "playing";

    let status: string | null = null;
    if (!p.record) status = t("sim.hud.practice");
    else if (p.offline) status = t("sim.hud.offline");
    else if (p.queued > 0 || p.syncing) status = t("sim.hud.syncing");

    return (
        <div className="shrink-0 px-3 pt-1 pb-2 flex flex-col gap-1.5 bg-surface-1">
            <div className="flex items-center gap-2 min-h-11">
                {p.config && (
                    <span className="rk-chip bg-surface-3 text-ink-2 truncate">
                        {ruleBadge(p.config, t)} · {tableLabel(p.config, t)}
                    </span>
                )}
                {status && <span className="rk-chip border border-surface-line text-ink-3 truncate">{status}</span>}
                <div className="flex-1" />
                <button
                    type="button"
                    aria-pressed={p.muted}
                    aria-label={p.muted ? t("sim.hud.unmute") : t("sim.hud.mute")}
                    onClick={p.onToggleMute}
                    className={cn(
                        "h-11 px-3 rounded-pill border text-[13px] font-semibold",
                        p.muted ? "border-surface-line text-ink-4" : "border-brand text-brand",
                    )}
                >
                    {p.muted ? t("sim.hud.unmute") : t("sim.hud.mute")}
                </button>
            </div>

            {s && (
                <div className={cn("grid gap-2", s.players.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                    {s.players.map((pl, i) => {
                        const isTurn = s.turn === i;
                        const isWinner = s.status === "finished" && s.winnerIndex === i;
                        const inning = pl.innings + (playing && isTurn ? 1 : 0);
                        return (
                            <div
                                key={pl.id}
                                className={cn(
                                    "rounded-tile border px-3 py-2 flex flex-col gap-1 min-w-0",
                                    isTurn && playing ? "border-brand bg-brand/[0.06]" : "border-surface-line",
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn("text-[13px] font-semibold truncate", isWinner ? "text-gold" : "text-ink-2")}>
                                        {p.names[i] ?? pl.id}
                                    </span>
                                    {isTurn && playing && s.players.length === 2 && (
                                        <span className="rk-chip bg-brand text-brand-fg shrink-0">{t("sim.hud.turn")}</span>
                                    )}
                                    {pl.currentRun > 0 && (
                                        <span className="rk-chip bg-brand/[0.1] text-brand shrink-0 ml-auto rk-num">
                                            {t("sim.hud.run").replace("{n}", String(pl.currentRun))}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1 rk-num">
                                    <span className="text-[26px] font-bold text-ink-1 leading-none">{pl.score}</span>
                                    <span className="text-[13px] font-medium text-ink-4">/ {pl.target}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] font-medium text-ink-3 rk-num">
                                    <span>{t("sim.hud.inning")} {inning}</span>
                                    <span>{t("sim.hud.average")} {formatAverage(displayAverage(pl, p.phase))}</span>
                                    <span>{t("sim.hud.highRun")} {pl.highRun}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
