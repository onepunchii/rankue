import { Fragment, memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmojiBar, EMOJI_GLYPH } from "../match/EmojiBar";
import type { SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "../setupPresets";
import type { Phase } from "../simReducer";
import { displayAverage, formatAverage, ruleBadge, tableLabel } from "../hudMath";
import { BackIcon } from "./railIcons";
import { ShotClock } from "./ShotClock";

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
    /** 대전 40초 룰 시계: 남은 초와 누구 차례인지. 없으면 안 그린다. */
    clock?: { readonly seconds: number; readonly mine: boolean } | null;
    /** 상태 칩(연습 / 기록되지 않음 / 동기화)을 감춘다 — 길 찾기 화면은 연습이 아니다. */
    hideStatus?: boolean;
    /** drillName 을 누를 수 없는 이름표로 그린다(길 찾기: 여긴 이닝 시트가 없다). */
    drillNameStatic?: boolean;
    /** 오른쪽 요약(점수·이닝·에버)을 감춘다 — 길 찾기는 점수를 세는 화면이 아니다. */
    hideSummary?: boolean;
    /** 오른쪽 닫기 알약(길 찾기: 툴바의 X 대신 여기). */
    onClose?: () => void;
    /**
     * 이모지 인사(대전). 보내기 버튼은 상대 이름표 옆에 두고, 받은 인사는 그 자리에서 말풍선으로 띄운다
     * — 테이블 위에는 절대 그리지 않는다(공 궤적을 가린다).
     */
    emoji?: {
        readonly onSend: (code: string) => void;
        readonly busy: boolean;
        readonly received: { readonly code: string; readonly bubble: boolean } | null;
    } | null;
    /** 쓰리아웃: 지금 차례인 사람의 시간 초과 횟수(used/total). 대전에서만. */
    strikes?: { readonly used: number; readonly total: number; readonly mine: boolean } | null;
    /** 관전자 수(대전, 2026-09-12). 0 이면 안 그린다 — 보는 사람이 있을 때만 알린다. */
    watchers?: number;
    /** 후구(마지막 동점 이닝) 진행 중(2026-09-12). 지금 치는 사람이 따라붙으면 무승부다. */
    finalInning?: boolean;
}

const SCORE = "rk-num text-[14px] font-bold text-ink-1 leading-none mt-1";
const TARGET = "rk-num text-[11px] font-medium text-ink-3";
/** 요약 칩: 36 px 타일 버튼(44 px 띠 안), 라벨(위 10 px) · 값(아래 rk-num 14 px) 두 줄을 가운데 정렬(2026-09-08 오너: 중앙 정렬·디자인 개선). */
const CHIP = "h-9 min-w-[52px] px-2.5 rounded-xl border bg-surface-1 flex flex-col items-center justify-center text-center shrink-0 whitespace-nowrap active:bg-surface-3";
const LABEL = "text-[10px] font-medium text-ink-3 leading-none";
const VALUE = "rk-num text-[14px] font-bold text-ink-1 leading-none mt-1";

export const TopBar = memo(function TopBar(p: TopBarProps) {
    const { t } = useT();
    const s = p.session;
    const playing = s?.status === "playing";
    const twoPlayers = (s?.players.length ?? 0) === 2;

    let status: string | null = null;
    if (p.hideStatus) status = null;
    else if (!p.record) status = t("sim.top.practice");
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
            {p.clock && <ShotClock seconds={p.clock.seconds} mine={p.clock.mine} size={34} />}
            {/* 후구: 선공이 목표에 닿아 후공에게 마지막 이닝이 간 상태. 지금 치는 사람이 따라붙으면 무승부. */}
            {p.finalInning && (
                <span className="rk-chip bg-ball-yellow text-ink-1 font-bold shrink-0 whitespace-nowrap" title={t("sim.match.finalInningHint")}>
                    {t("sim.match.finalInning")}
                </span>
            )}
            {/* 관전자(2026-09-12 오너: "관전자가 몇 명인지 표기"): 보고 있는 사람이 있을 때만 뜬다. 누가 보는지는 안 보인다. */}
            {(p.watchers ?? 0) > 0 && (
                <span className="rk-chip bg-surface-3 text-brand font-bold shrink-0 whitespace-nowrap" title={t("sim.watch.viewers").replace("{n}", String(p.watchers))}>
                    {t("sim.watch.viewers").replace("{n}", String(p.watchers))}
                </span>
            )}
            {/* 쓰리아웃(2026-09-08 오너): 지금 차례인 사람이 넘긴 횟수 — 채워진 점이 아웃. 3개째면 실격패 */}
            {p.strikes && p.strikes.total > 0 && (
                <span
                    className="flex items-center gap-1 shrink-0"
                    aria-label={t("sim.match.strikes").replace("{n}", String(p.strikes.used)).replace("{total}", String(p.strikes.total))}
                    title={t("sim.match.strikes").replace("{n}", String(p.strikes.used)).replace("{total}", String(p.strikes.total))}
                >
                    {Array.from({ length: p.strikes.total }, (_, i) => (
                        <span
                            key={i}
                            className={cn(
                                "w-2 h-2 rounded-pill",
                                i < p.strikes!.used ? (p.strikes!.mine ? "bg-ink-1" : "bg-ink-3") : "border border-surface-line-strong",
                            )}
                        />
                    ))}
                </span>
            )}
            {/* 받은 인사: 보내기 버튼 옆 칩으로. 절대 위치 말풍선은 화면 오른쪽 밖으로 잘렸다(실측) */}
            {p.emoji?.received && (
                <span
                    role="status" aria-live="polite"
                    className={cn(
                        "shrink-0 inline-flex items-center justify-center rounded-pill bg-surface-3 select-none",
                        p.emoji.received.bubble
                            ? "h-9 w-9 text-[20px] animate-in fade-in zoom-in-75 duration-200"
                            : "h-7 w-7 text-[14px] opacity-70",
                    )}
                >
                    {EMOJI_GLYPH[p.emoji.received.code as keyof typeof EMOJI_GLYPH] ?? "🙂"}
                </span>
            )}
            {p.emoji && <EmojiBar onSend={p.emoji.onSend} disabled={p.emoji.busy} className="shrink-0" />}
            <div className="flex-1 min-w-0" />
            {p.onClose && (
                <button
                    type="button" onClick={p.onClose} aria-label={t("sim.common.close")}
                    className="h-9 px-3.5 shrink-0 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2 active:bg-surface-3"
                >
                    {t("sim.common.close")}
                </button>
            )}
            {/* 요약은 항목별 독립 칩 버튼(2026-09-08 오너): 1인 = 점수 · 이닝 · 에버, 2인 = 선수마다 [이름 점수/다마수](차례는 brand 테두리 + 점). 어느 칩이든 이닝 시트. */}
            {s && p.drillName && (p.drillNameStatic ? (
                <span className="h-9 px-3 rounded-xl bg-surface-3 flex items-center shrink-0">
                    <span className="text-[12px] font-semibold text-ink-2 truncate max-w-[160px]">{p.drillName}</span>
                </span>
            ) : (
                <button type="button" onClick={p.onSummary} aria-label={t("sim.controls.innings")} title={t("sim.controls.innings")} className={cn(CHIP, "border-surface-line min-w-0 justify-center")}>
                    <span className="text-[12px] font-semibold text-ink-1 truncate max-w-[160px]">{p.drillName}</span>
                </button>
            ))}
            {s && !p.drillName && !p.hideSummary && (
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
                                    <span className="flex items-center gap-1 min-w-0">
                                        {isTurn && (
                                            <span className="inline-block w-1.5 h-1.5 rounded-pill bg-brand shrink-0">
                                                <span className="sr-only">{t("sim.hud.turn")}</span>
                                            </span>
                                        )}
                                        <span className={cn(LABEL, "truncate max-w-[72px]", isTurn && "text-ink-1")}>{p.names[i] ?? pl.id}</span>
                                    </span>
                                    <span className={cn(SCORE, isWinner && "text-gold")}>
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
                                        <span className={LABEL}>{t("sim.top.score")}</span>
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
