import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LucideUndo2, LucideRedo2, LucideMoon, LucideSun } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface Props {
    innings: number;
    onExit: () => void;
    /**
     * 종료(버리기)나 FINISH 요청이 가는 중 — 종료 단추를 잠그고 흐리게 한다(2026-10-06).
     * 예전엔 눌러도 화면이 그대로라 '안 눌린다'로 보였다. 문구는 바꾸지 않는다(자리가 흔들리지 않게).
     */
    exiting?: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    /**
     * PBA 룰 경기의 뱅크샷 +2 — 지금 차례인 선수에게 들어간다. 없으면 버튼을 안 그린다.
     * 카드 안에 두면 차례가 바뀔 때마다 위치가 옮겨 다니고, 4인이면 카드 폭(약 210px)을 넘쳤다(2026-09-24).
     * 여기 두면 늘 같은 자리이고, 잘못 눌렀을 때 되돌리기가 바로 옆이다.
     */
    onBankShot?: () => void;
    /** 지금 차례인 선수의 공 색 — 누구 점수인지 버튼에서 보인다. */
    bankColor?: string;
    /** 목표 도달 뒤(마무리·FINISH)엔 잠근다. 숨기지 않는 건 버튼 자리가 흔들리지 않게 하려는 것이다. */
    bankDisabled?: boolean;
    /**
     * 경기를 시작한 시각(ISO — 경기 행의 playedAt). 진행 시간은 여기서부터 센다(2026-10-23).
     * 예전엔 화면이 뜬 순간부터 세어, 새로고침 · 홈의 '이어서'로 다시 들어오면 00:00:00 으로 돌아갔다.
     */
    startedAt?: string | null;
    /** 어두운 점수판인가 · 바꾸기(2026-10-23 오너: "다크버젼") — 없으면 단추를 안 그린다 */
    dark?: boolean;
    onToggleDark?: () => void;
    /** 보내지 못한 점수가 기기에 보관돼 있다(오프라인) — '진행 시간' 자리에 알린다(자리가 흔들리지 않게) */
    unsaved?: boolean;
    /** 이닝 공을 누르면 이닝별 득점표 — 없으면 공은 표시만 */
    onInnings?: () => void;
}

/** 진행 시간(초) — 시작 시각이 있으면 지금까지, 없거나 깨졌으면 null(화면이 뜬 때부터 센다). 기기 시계가 늦어도 0 아래로는 안 간다. */
export function elapsedSince(startedAt: string | null | undefined, now: number): number | null {
    const t = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : null;
}

export function ScoreboardBottomBar({ innings, onExit, exiting, canUndo, canRedo, onUndo, onRedo, onBankShot, bankColor, bankDisabled, startedAt, dark, onToggleDark, unsaved, onInnings }: Props) {
    const { t } = useT();
    // 시계는 여기서만 돈다(부모가 1초마다 다시 그려지지 않게)
    const [mountedAt] = useState(() => Date.now());
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const elapsedTime = elapsedSince(startedAt, now) ?? Math.max(0, Math.floor((now - mountedAt) / 1000));

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="rk-board-bar h-16 bg-surface-1 border-t border-surface-line flex items-center justify-between px-8 shrink-0 z-50">
            {/* Left Section: 밝게/어둡게 + 진행 시간(보내지 못한 점수가 있으면 그 자리에 '기기에 보관 중') */}
            <div className="flex items-center gap-3 w-1/4 min-w-0">
                {onToggleDark && (
                    <button
                        type="button"
                        onClick={onToggleDark}
                        aria-label={dark ? t("scoreboardBottomBar.lightMode") : t("scoreboardBottomBar.darkMode")}
                        aria-pressed={!!dark}
                        className="shrink-0 w-10 h-10 rounded-full bg-surface-3 text-ink-2 flex items-center justify-center active:scale-95 transition-transform"
                        data-testid="board-theme"
                    >
                        {dark ? <LucideSun className="w-5 h-5" /> : <LucideMoon className="w-5 h-5" />}
                    </button>
                )}
                <div className="flex flex-col min-w-0">
                    {unsaved ? (
                        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 whitespace-nowrap" role="status" data-testid="board-unsaved">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{t("scoreboardBottomBar.keptOnDevice")}
                        </span>
                    ) : (
                        <span className="text-[12px] font-medium text-ink-4">{t("scoreboardBottomBar.elapsedTime")}</span>
                    )}
                    <span className="text-xl font-bold text-ink-1 tabular-nums">{formatTime(elapsedTime)}</span>
                </div>
            </div>

            {/* Center Section: Inning + Undo/Redo */}
            <div className="flex items-center justify-center gap-12 flex-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    data-tour="bb-undo"
                    className={`w-14 h-14 rounded-2xl bg-surface-3 ${canUndo ? 'text-ink-1 hover:bg-surface-3' : 'text-ink-4 opacity-60'}`}
                >
                    <LucideUndo2 className="w-6 h-6" />
                </Button>

                {/* 이닝 공 — 누르면 이닝별 득점표(2026-10-23 오너). 낮은 점수판(폰 가로)에선 index.css 의 rk-inning-ball 규칙이 공을 바 안으로 넣는다 */}
                <div className="relative group">
                    <button
                        type="button"
                        onClick={onInnings}
                        disabled={!onInnings}
                        aria-label={t("inningHistoryModal.title")}
                        className="rk-inning-ball w-24 h-24 rounded-full border-4 border-brand flex flex-col items-center justify-center -mt-16 bg-surface-1 z-50 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 transition-transform disabled:active:scale-100"
                        data-testid="board-inning-ball"
                    >
                        <span className="rk-inning-label text-[12px] font-medium text-ink-3 leading-none mb-1">{t("scoreboardBottomBar.inning")}</span>
                        <span className="rk-inning-num text-4xl font-bold text-brand tabular-nums leading-none">{innings}</span>
                    </button>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={`w-14 h-14 rounded-2xl bg-surface-3 ${canRedo ? 'text-ink-1 hover:bg-surface-3' : 'text-ink-4 opacity-60'}`}
                >
                    <LucideRedo2 className="w-6 h-6" />
                </Button>
            </div>

            {/* Right Section: Controls */}
            <div className="flex items-center justify-end gap-6 w-1/4 min-w-fit">
                {onBankShot && (
                    <button
                        type="button"
                        onClick={onBankShot}
                        disabled={bankDisabled}
                        className="h-12 px-4 rounded-2xl border-2 bg-surface-1 flex items-center gap-2 whitespace-nowrap active:scale-95 transition-transform disabled:opacity-35"
                        style={{ borderColor: bankColor ?? "#0f6b4f", color: bankColor ?? "#0f6b4f" }}
                    >
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: bankColor ?? "#0f6b4f" }} />
                        <span className="text-sm font-semibold">{t("playerCard.bankShot")}</span>
                        <span className="text-xl font-bold tabular-nums">+2</span>
                    </button>
                )}
                <Button
                    onClick={onExit}
                    disabled={exiting}
                    data-tour="bb-exit"
                    aria-busy={exiting || undefined}
                    className="h-12 px-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-semibold disabled:opacity-40"
                >
                    {t("scoreboardBottomBar.exit")}
                </Button>
            </div>
        </div>
    );
}
