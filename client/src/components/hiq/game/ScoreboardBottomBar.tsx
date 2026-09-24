import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LucideUndo2, LucideRedo2 } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface Props {
    innings: number;
    onExit: () => void;
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
}

export function ScoreboardBottomBar({ innings, onExit, canUndo, canRedo, onUndo, onRedo, onBankShot, bankColor, bankDisabled }: Props) {
    const { t } = useT();
    // Timer State moved here to prevent re-rendering of parent
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-16 bg-white border-t border-black/10 flex items-center justify-between px-8 shrink-0 z-50">
            {/* Left Section: Time */}
            <div className="flex items-center gap-6 w-1/4">
                <div className="flex flex-col">
                    <span className="text-[12px] font-medium text-black/40">{t("scoreboardBottomBar.elapsedTime")}</span>
                    <span className="text-xl font-bold text-[rgba(0,0,0,0.87)] tabular-nums">{formatTime(elapsedTime)}</span>
                </div>
            </div>

            {/* Center Section: Inning + Undo/Redo */}
            <div className="flex items-center justify-center gap-12 flex-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={`w-14 h-14 rounded-2xl bg-black/[0.04] ${canUndo ? 'text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06]' : 'text-black/25'}`}
                >
                    <LucideUndo2 className="w-6 h-6" />
                </Button>

                {/* Billiard Ball Style Inning Display */}
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full border-4 border-brand flex flex-col items-center justify-center -mt-16 bg-white z-50 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        <span className="text-[12px] font-medium text-black/55 leading-none mb-1">{t("scoreboardBottomBar.inning")}</span>
                        <span className="text-4xl font-bold text-brand tabular-nums leading-none">{innings}</span>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={`w-14 h-14 rounded-2xl bg-black/[0.04] ${canRedo ? 'text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06]' : 'text-black/25'}`}
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
                        className="h-12 px-4 rounded-2xl border-2 bg-white flex items-center gap-2 whitespace-nowrap active:scale-95 transition-transform disabled:opacity-35"
                        style={{ borderColor: bankColor ?? "#0f6b4f", color: bankColor ?? "#0f6b4f" }}
                    >
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: bankColor ?? "#0f6b4f" }} />
                        <span className="text-sm font-semibold">{t("playerCard.bankShot")}</span>
                        <span className="text-xl font-bold tabular-nums">+2</span>
                    </button>
                )}
                <Button
                    onClick={onExit}
                    className="h-12 px-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-semibold"
                >
                    {t("scoreboardBottomBar.exit")}
                </Button>
            </div>
        </div>
    );
}
