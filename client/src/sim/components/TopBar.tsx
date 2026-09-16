import { Fragment, memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
// 상대 경로로 가져온다 — vitest 에는 "@" 별칭이 없어서, 별칭으로 쓰면 TopBar 를 거치는 테스트
// (TopBar·SimulatorPage·WatchPage)가 전부 "Cannot find package" 로 죽는다. 앱 빌드만 통과해 놓치기 쉽다.
import { flagEmoji } from "../../lib/flag";
import { SHOT_CLOCK_STRIKES, type SessionState } from "@shared/sim/rules";
import type { SimSetupConfig } from "../setupPresets";
import type { Phase } from "../simReducer";
import { displayAverage, formatAverage, ruleBadge, tableLabel } from "../hudMath";
import { BackIcon, PauseIcon } from "./railIcons";
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
     * 대전 전용 헤더(2026-09-16 오너). 있으면 **이 레이아웃만** 그린다:
     * [나: 국기·이름 / 공·점수·게이지·쓰리아웃] [40초 시계] [상대: 같은 것] [멈춤].
     * 규칙 배지·관전자·후구·동기화 같은 그때그때 뜨는 알림은 왼쪽 칩 열로 옮겼다 — 헤더는
     * "누가 치고 있고 시간이 얼마 남았나" 하나만 말한다. 연습·드릴 화면은 아래 기존 레이아웃 그대로다.
     */
    matchHeader?: {
        /** 화면에 그릴 순서대로 — 왼쪽이 나, 오른쪽이 상대. */
        readonly players: readonly [MatchHeaderPlayer, MatchHeaderPlayer];
        readonly onExit: () => void;
    } | null;
}

/**
 * 대전 헤더 한 선수. 위: 국기 + 이름 / 아래: 공 색 · 점수 · 게이지 · 쓰리아웃 점.
 *
 * 참고 화면의 점 다섯 개는 5판 선취라 그렇다. 우리는 다마수가 15·20·25 라 점으로 그리면 스무 개가 필요해서,
 * 점수는 숫자로 두고 그 아래 얇은 게이지로 남은 거리를 보여 준다. 점 세 개는 **쓰리아웃**이 가져갔다
 * — 마침 정확히 세 개이고, 세 번째가 차면 실격패라 눈에 띄어야 하는 정보다.
 */
export interface MatchHeaderPlayer {
    readonly name: string;
    /** ISO alpha-2. 없으면 국기 없이 이름만(가입할 때 IP 로 잡히므로 없는 사람이 많다). */
    readonly country: string | null;
    readonly cueBallId: "white" | "yellow";
    readonly score: number;
    readonly target: number;
    /** 40초를 넘긴 횟수 */
    readonly timeouts: number;
    readonly turn: boolean;
    readonly winner: boolean;
}

const SCORE = "rk-num text-[14px] font-bold text-ink-1 leading-none mt-1";
const TARGET = "rk-num text-[11px] font-medium text-ink-3";
/** 요약 칩: 36 px 타일 버튼(44 px 띠 안), 라벨(위 10 px) · 값(아래 rk-num 14 px) 두 줄을 가운데 정렬(2026-09-08 오너: 중앙 정렬·디자인 개선). */
const CHIP = "h-9 min-w-[52px] px-2.5 rounded-xl border bg-surface-1 flex flex-col items-center justify-center text-center shrink-0 whitespace-nowrap active:bg-surface-3";
const LABEL = "text-[10px] font-medium text-ink-3 leading-none";
const VALUE = "rk-num text-[14px] font-bold text-ink-1 leading-none mt-1";

/** 대전 헤더의 한 쪽. mirror = 오른쪽(상대) — 같은 정보를 거울로 놓아 가운데 시계가 축이 된다. */
function HeaderSide({ p: pl, mirror, onSummary, label }: {
    p: MatchHeaderPlayer;
    mirror: boolean;
    onSummary: () => void;
    label: string;
}) {
    const flag = flagEmoji(pl.country);          // 없으면 빈 문자열 — 국기를 그리지 않는다
    const pct = pl.target > 0 ? Math.max(0, Math.min(1, pl.score / pl.target)) * 100 : 0;
    const name = (
        <span className={cn("text-[11.5px] font-semibold leading-none truncate max-w-[78px]", pl.turn ? "text-ink-1" : "text-ink-3")}>
            {pl.name}
        </span>
    );
    const ball = <span className={cn("w-[9px] h-[9px] rounded-pill shrink-0", pl.cueBallId === "white" ? "bg-ball-white border border-surface-line-strong" : "bg-ball-yellow")} />;
    const score = (
        <span className={cn("rk-num text-[14px] font-bold leading-none", pl.winner ? "text-gold" : "text-ink-1")}>
            {pl.score}<span className="rk-num text-[11px] font-medium text-ink-3">/{pl.target}</span>
        </span>
    );
    // 게이지는 남는 폭을 먹고, 좁아지면 먼저 줄어든다 — 100/100 처럼 자릿수가 긴 점수에서 띠가 넘치지 않게.
    const gauge = (
        <span className="flex-1 min-w-[14px] max-w-[34px] h-[3px] rounded-pill bg-surface-3 overflow-hidden">
            <span className="block h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
        </span>
    );
    // 쓰리아웃: 채워진 점이 넘긴 횟수. 세 개째면 실격패라 차례와 상관없이 늘 보인다.
    const strikes = (
        <span className="inline-flex gap-[3px] shrink-0">
            {Array.from({ length: SHOT_CLOCK_STRIKES }, (_, i) => (
                <span key={i} className={cn("w-[5px] h-[5px] rounded-pill", i < pl.timeouts ? "bg-ball-red" : "border border-surface-line-strong")} />
            ))}
        </span>
    );
    return (
        <button
            type="button" onClick={onSummary} aria-label={label} title={label}
            className={cn("flex-1 min-w-0 h-11 px-1 flex flex-col justify-center gap-[3px] active:bg-surface-3 rounded-lg", mirror ? "items-end" : "items-start")}
        >
            <span className={cn("flex items-center gap-1 min-w-0 max-w-full", mirror && "flex-row-reverse")}>
                {flag && <span className="text-[13px] leading-none shrink-0" aria-hidden="true">{flag}</span>}
                {name}
            </span>
            <span className={cn("w-full min-w-0 flex items-center gap-[5px]", mirror && "flex-row-reverse")}>
                {ball}{score}{gauge}{strikes}
            </span>
        </button>
    );
}

export const TopBar = memo(function TopBar(p: TopBarProps) {
    const { t } = useT();
    const s = p.session;
    const playing = s?.status === "playing";
    const twoPlayers = (s?.players.length ?? 0) === 2;

    /*
     * 대전 헤더(2026-09-16). 한 줄 44 px 안에 [나][시계][상대][멈춤] 만 둔다.
     * 왼쪽 뒤로 화살표를 없애고 오른쪽 끝 멈춤이 그 일을 한다 — 왼쪽이 통째로 비어야 이름이 들어간다.
     */
    if (p.matchHeader) {
        const [me, opp] = p.matchHeader.players;
        return (
            <div className="shrink-0 h-11 px-2 flex items-center gap-1.5 bg-surface-1">
                <HeaderSide p={me} mirror={false} onSummary={p.onSummary} label={`${me.name} · ${t("sim.controls.innings")}`} />
                {p.clock
                    ? <ShotClock seconds={p.clock.seconds} mine={p.clock.mine} size={34} />
                    : <span className="w-[34px] shrink-0" aria-hidden="true" />}
                <HeaderSide p={opp} mirror onSummary={p.onSummary} label={`${opp.name} · ${t("sim.controls.innings")}`} />
                <button
                    type="button" onClick={p.matchHeader.onExit}
                    aria-label={t("sim.controls.exit")} title={t("sim.controls.exit")}
                    className="h-9 w-9 -mr-1 shrink-0 rounded-pill flex items-center justify-center text-ink-2 active:bg-surface-3"
                >
                    <PauseIcon />
                </button>
            </div>
        );
    }

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
                                        <span className={VALUE}>{formatAverage(displayAverage(pl, p.phase, s?.rules.gameType))}</span>
                                    </button>
                                </Fragment>
                            );
                        })}
                </div>
            )}
        </div>
    );
});
