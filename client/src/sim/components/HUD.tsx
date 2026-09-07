import { memo } from "react";
import { Diamond, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "../setupPresets";
import type { Phase } from "../simReducer";
import { displayAverage, formatAverage, ruleBadge, tableLabel } from "../hudMath";

// 상단 HUD. 한 줄의 규칙·테이블 배지 + 상태 칩 + 아이콘 토글(3쿠션이면 다이아몬드 시스템 · 소리), 그 아래 선수 카드(점수/다마수 · 이닝 · 에버리지 · 하이런 · 런).
// 토글은 44px 아이콘 버튼 — 글자 알약("다이아몬드"·"소리 끄기")은 375px 폰에서 두 줄로 꺾이고 왼쪽 칩을 잘라먹었다(실측 2026-09-07).
// 초록은 '켜짐'을 말할 때만(다이아몬드 on · 2인 대전의 차례 카드). 1인 세션의 카드는 차례 강조가 뜻이 없어 중립.
// 에버리지 규약은 hudMath.inningsForAverage 주석 참고(점수판 앱과 같이 진행 중 이닝 포함).
// phi 드래그마다 페이지가 재렌더되므로 memo — HUD 의 props 는 샷 사이에만 바뀐다(diamond 객체는 페이지가 useMemo 로 고정).
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
    /** 다이아몬드 시스템 오버레이 토글. 없으면(4구 등) 버튼을 그리지 않는다. */
    diamond?: { on: boolean; onToggle: () => void };
}

const TOGGLE = "h-11 w-11 shrink-0 rounded-pill border flex items-center justify-center active:bg-surface-3";

export const HUD = memo(function HUD(p: HUDProps) {
    const { t } = useT();
    const s = p.session;
    const playing = s?.status === "playing";
    const twoPlayers = (s?.players.length ?? 0) === 2;

    let status: string | null = null;
    if (!p.record) status = t("sim.hud.practice");
    else if (p.offline) status = t("sim.hud.offline");
    else if (p.queued > 0 || p.syncing) status = t("sim.hud.syncing");

    const muteLabel = p.muted ? t("sim.hud.unmute") : t("sim.hud.mute");

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
                {p.diamond && (
                    <button
                        type="button"
                        aria-pressed={p.diamond.on}
                        aria-label={t("sim.diamond.toggleLabel")}
                        title={t("sim.diamond.toggleLabel")}
                        onClick={p.diamond.onToggle}
                        className={cn(TOGGLE, p.diamond.on ? "border-brand bg-brand/[0.06] text-brand" : "border-surface-line text-ink-2")}
                    >
                        <Diamond className="w-5 h-5" aria-hidden="true" />
                        <span className="sr-only">{t("sim.diamond.toggle")}</span>
                    </button>
                )}
                <button
                    type="button"
                    aria-pressed={p.muted}
                    aria-label={muteLabel}
                    title={muteLabel}
                    onClick={p.onToggleMute}
                    className={cn(TOGGLE, "border-surface-line", p.muted ? "text-ink-3" : "text-ink-2")}
                >
                    {p.muted ? <SpeakerSlash className="w-5 h-5" aria-hidden="true" /> : <SpeakerHigh className="w-5 h-5" aria-hidden="true" />}
                </button>
            </div>

            {s && (
                <div className={cn("grid gap-2", twoPlayers ? "grid-cols-2" : "grid-cols-1")}>
                    {s.players.map((pl, i) => {
                        const isTurn = s.turn === i;
                        const isWinner = s.status === "finished" && s.winnerIndex === i;
                        const inning = pl.innings + (playing && isTurn ? 1 : 0);
                        return (
                            <div
                                key={pl.id}
                                className={cn(
                                    "rounded-tile border px-3 py-2 flex flex-col gap-1 min-w-0",
                                    twoPlayers && isTurn && playing ? "border-brand bg-brand/[0.06]" : "border-surface-line",
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn("text-[13px] font-semibold truncate", isWinner ? "text-gold" : "text-ink-2")}>
                                        {p.names[i] ?? pl.id}
                                    </span>
                                    {isTurn && playing && twoPlayers && (
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
