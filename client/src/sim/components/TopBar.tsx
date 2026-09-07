import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "../setupPresets";
import type { Phase } from "../simReducer";
import { displayAverage, formatAverage, ruleBadge, tableLabel } from "../hudMath";
import { BackIcon } from "./railIcons";

/**
 * 상단 띠(44 px, 한 줄). 왼쪽: (대전이면 뒤로 = 나가기) · 규칙·테이블 배지 · 상태 칩(연습 / 기록되지 않음 / 동기화 중).
 * 오른쪽: 선수 요약 — 누르면 이닝 시트(자세한 통계는 거기).
 *  - 1인: 점수/다마수 · "이닝 n · 에버 x.xx" — 이름은 두지 않는다(본인 이름이라 정보가 없고, 360 px 에선 규칙 칩·연습 칩과
 *    함께 두면 "ran…" 으로 잘렸다, 2026-09-07 리뷰). 승자 색은 점수에 준다.
 *  - 2인(대전·로컬): "이름 0/15 · 이름 0/3" + 차례인 선수 앞 brand 점
 *  - 드릴: 드릴 이름
 * 이름은 truncate(360 px 폰에서 칩과 함께 한 줄에 들어가게). 승자는 gold(우승 의례 전용).
 */
export interface TopBarProps {
    session: SessionState | null;
    config: SimSetupConfig | null;
    phase: Phase;
    names: readonly string[];
    record: boolean;
    offline: boolean;
    syncing: boolean;
    queued: number;
    /** 드릴 이름(드릴 모드). 있으면 요약 대신 이 이름을 보인다. */
    drillName?: string | null;
    onSummary: () => void;
    /** 대전에서만: 툴바 X 가 기권이 되므로 나가기는 여기 뒤로 화살표. */
    onBack?: () => void;
}

const SCORE = "rk-num text-[16px] font-bold text-ink-1 leading-none";
const TARGET = "rk-num text-[12px] font-medium text-ink-3";

export const TopBar = memo(function TopBar(p: TopBarProps) {
    const { t } = useT();
    const s = p.session;
    const playing = s?.status === "playing";
    const twoPlayers = (s?.players.length ?? 0) === 2;

    let status: string | null = null;
    if (!p.record) status = t("sim.top.practice");
    else if (p.offline) status = t("sim.hud.offline");
    else if (p.queued > 0 || p.syncing) status = t("sim.hud.syncing");

    return (
        <div className="shrink-0 h-11 px-2 flex items-center gap-2 bg-surface-1">
            {p.onBack && (
                <button
                    type="button" onClick={p.onBack} aria-label={t("sim.controls.exit")} title={t("sim.controls.exit")}
                    className="h-11 w-11 -ml-1 shrink-0 rounded-pill flex items-center justify-center text-ink-2 active:bg-surface-3"
                >
                    <BackIcon />
                </button>
            )}
            {p.config && (
                <span className="rk-chip bg-surface-3 text-ink-2 shrink-0 whitespace-nowrap">
                    {ruleBadge(p.config, t)} · {tableLabel(p.config, t)}
                </span>
            )}
            {status && <span className="rk-chip border border-surface-line text-ink-3 shrink-0 whitespace-nowrap">{status}</span>}
            <div className="flex-1 min-w-0" />
            {s && (
                <button
                    type="button" onClick={p.onSummary} aria-label={t("sim.controls.innings")} title={t("sim.controls.innings")}
                    className="h-11 min-w-0 px-1.5 -mr-1 flex items-center gap-1.5 rounded-tile text-left active:bg-surface-3"
                >
                    {p.drillName ? (
                        <span className="text-[12px] font-semibold text-ink-1 truncate">{p.drillName}</span>
                    ) : twoPlayers ? (
                        s.players.map((pl, i) => {
                            const isTurn = playing && s.turn === i;
                            const isWinner = s.status === "finished" && s.winnerIndex === i;
                            return (
                                <span key={pl.id} className="flex items-center gap-1 min-w-0">
                                    {i > 0 && <span className="text-[12px] text-ink-4" aria-hidden="true">·</span>}
                                    {isTurn && (
                                        <span className="inline-block w-1.5 h-1.5 rounded-pill bg-brand shrink-0" title={t("sim.hud.turn")}>
                                            <span className="sr-only">{t("sim.hud.turn")}</span>
                                        </span>
                                    )}
                                    <span className={cn("text-[12px] font-semibold truncate max-w-[64px]", isWinner ? "text-gold" : "text-ink-1")}>
                                        {p.names[i] ?? pl.id}
                                    </span>
                                    <span className="rk-num text-[14px] font-bold text-ink-1 leading-none shrink-0">
                                        {pl.score}<span className={TARGET}>/{pl.target}</span>
                                    </span>
                                </span>
                            );
                        })
                    ) : (
                        s.players.map((pl, i) => {
                            const isWinner = s.status === "finished" && s.winnerIndex === i;
                            const inning = pl.innings + (playing ? 1 : 0);
                            return (
                                <span key={pl.id} className="flex items-center gap-1.5 min-w-0">
                                    <span className={cn(SCORE, "shrink-0", isWinner && "text-gold")}>
                                        {pl.score}<span className={TARGET}>/{pl.target}</span>
                                    </span>
                                    <span className="rk-num text-[12px] font-medium text-ink-3 whitespace-nowrap shrink-0">
                                        {t("sim.hud.inning")} {inning} · {t("sim.top.avg")} {formatAverage(displayAverage(pl, p.phase))}
                                    </span>
                                </span>
                            );
                        })
                    )}
                </button>
            )}
        </div>
    );
});
