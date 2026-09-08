import { Fragment, memo } from "react";
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
    /** 대전 40초 룰 시계: 남은 초와 누구 차례인지. 없으면 안 그린다. 10초 이하는 진한 칩. */
    clock?: { readonly seconds: number; readonly mine: boolean } | null;
}

const SCORE = "rk-num text-[16px] font-bold text-ink-1 leading-none";
const TARGET = "rk-num text-[12px] font-medium text-ink-3";
/** 요약 칩: 32 px 알약 버튼(44 px 띠 안). 값은 rk-num, 라벨은 작은 잉크. */
const CHIP = "h-8 px-2.5 rounded-pill border bg-surface-1 flex items-baseline gap-1 shrink-0 whitespace-nowrap active:bg-surface-3";
const LABEL = "text-[11px] font-medium text-ink-3 leading-none";
const VALUE = "rk-num text-[14px] font-bold text-ink-1 leading-none";

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
            {/* 규칙·테이블 배지는 시계가 없을 때만 — 40초 시계가 서면 자리를 내줘 두 선수 이름이 잘리지 않게 한다 */}
            {p.config && !p.clock && (
                <span className="rk-chip bg-surface-3 text-ink-2 min-w-0 truncate whitespace-nowrap">
                    {ruleBadge(p.config, t)} · {tableLabel(p.config, t)}
                </span>
            )}
            {status && <span className="rk-chip border border-surface-line text-ink-3 shrink-0 whitespace-nowrap">{status}</span>}
            {p.clock && (
                <span
                    role="timer" aria-live="polite" aria-label={t("sim.match.shotClockLabel")}
                    className={cn(
                        "rk-chip rk-num shrink-0 whitespace-nowrap min-w-[44px] justify-center",
                        p.clock.seconds <= 10 ? "bg-ink-1 text-surface-1" : p.clock.mine ? "border border-brand text-brand" : "border border-surface-line text-ink-3",
                    )}
                >
                    {t("sim.match.shotClock").replace("{n}", String(p.clock.seconds))}
                </span>
            )}
            <div className="flex-1 min-w-0" />
            {/* 요약은 항목별 독립 칩 버튼(2026-09-08 오너): 1인 = 점수 · 이닝 · 에버, 2인 = 선수마다 [이름 점수/다마수](차례는 brand 테두리 + 점). 어느 칩이든 이닝 시트. */}
            {s && p.drillName && (
                <button type="button" onClick={p.onSummary} aria-label={t("sim.controls.innings")} title={t("sim.controls.innings")} className={cn(CHIP, "border-surface-line min-w-0")}>
                    <span className="text-[12px] font-semibold text-ink-1 truncate">{p.drillName}</span>
                </button>
            )}
            {s && !p.drillName && (
                <div className="flex items-center gap-1.5 min-w-0 -mr-1">
                    {twoPlayers
                        ? s.players.map((pl, i) => {
                            const isTurn = playing && s.turn === i;
                            const isWinner = s.status === "finished" && s.winnerIndex === i;
                            return (
                                <button
                                    key={pl.id} type="button" onClick={p.onSummary}
                                    aria-label={`${p.names[i] ?? pl.id} · ${t("sim.controls.innings")}`} title={t("sim.controls.innings")}
                                    className={cn(CHIP, "min-w-0", isTurn ? "border-brand" : "border-surface-line")}
                                >
                                    {isTurn && (
                                        <span className="self-center inline-block w-1.5 h-1.5 rounded-pill bg-brand shrink-0">
                                            <span className="sr-only">{t("sim.hud.turn")}</span>
                                        </span>
                                    )}
                                    <span className={cn("text-[12px] font-semibold truncate max-w-[64px]", isWinner ? "text-gold" : "text-ink-1")}>{p.names[i] ?? pl.id}</span>
                                    <span className={cn("rk-num text-[14px] font-bold leading-none shrink-0", isWinner ? "text-gold" : "text-ink-1")}>
                                        {pl.score}<span className={TARGET}>/{pl.target}</span>
                                    </span>
                                </button>
                            );
                        })
                        : s.players.map((pl, i) => {
                            const isWinner = s.status === "finished" && s.winnerIndex === i;
                            const inning = pl.innings + (playing ? 1 : 0);
                            return (
                                <Fragment key={pl.id}>
                                    <button type="button" onClick={p.onSummary} aria-label={t("sim.top.score")} title={t("sim.top.score")} className={cn(CHIP, "border-surface-line")}>
                                        <span className={cn(SCORE, isWinner && "text-gold")}>{pl.score}<span className={TARGET}>/{pl.target}</span></span>
                                    </button>
                                    <button type="button" onClick={p.onSummary} aria-label={t("sim.controls.innings")} title={t("sim.controls.innings")} className={cn(CHIP, "border-surface-line")}>
                                        <span className={LABEL}>{t("sim.hud.inning")}</span>
                                        <span className={VALUE}>{inning}</span>
                                    </button>
                                    <button type="button" onClick={p.onSummary} aria-label={t("sim.top.avg")} title={t("sim.top.avg")} className={cn(CHIP, "border-surface-line")}>
                                        <span className={LABEL}>{t("sim.top.avg")}</span>
                                        <span className={VALUE}>{formatAverage(displayAverage(pl, p.phase))}</span>
                                    </button>
                                </Fragment>
                            );
                        })}
                </div>
            )}
        </div>
    );
});
