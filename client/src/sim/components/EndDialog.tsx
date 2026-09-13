import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SessionState } from "@shared/sim/rules";
import type { Phase } from "../simReducer";
import { displayAverage, endTitle, formatAverage, inningsForAverage } from "../hudMath";

// 종료 다이얼로그. 승자(gold — 우승 의례 전용 색, 이름에만)·점수/다마수·이닝·에버리지·하이런, (공유: 마지막 샷 카드 + 세션 통계)·다시하기(같은 설정으로 새 세션)·나가기.
// 초록은 나가기(주 동작) 하나뿐 — 승자 카드 테두리까지 초록이면 색이 두 가지 뜻을 갖는다.
// 닫아도(바깥 탭) 화면은 finished 상태로 남는다 — 연습 모드는 되돌리기로 이어서 칠 수 있다.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    session: SessionState | null;
    phase: Phase;
    names: readonly string[];
    record: boolean;
    offline: boolean;
    mismatches: number;
    busy: boolean;
    onRestart: () => void;
    onExit: () => void;
    /** 대전 종료 사유 등 부제 아래 한 줄 */
    subtitle?: string | null;
    /** 대전에는 다시하기가 없다 */
    hideRestart?: boolean;
    /** 마지막 샷 공유(카드 PNG + 리플레이 링크). 없으면 버튼을 그리지 않는다(대전·샷 없음) */
    onShare?: () => void;
}

export const EndDialog = memo(function EndDialog(p: Props) {
    const { t } = useT();
    const s = p.session;
    return (
        <Dialog open={p.open} onOpenChange={p.onOpenChange}>
            <DialogContent className="max-w-[420px] rounded-card p-0 gap-0 flex flex-col">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3 text-left">
                    <DialogTitle>{t("sim.end.title")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">
                        {s ? endTitle(s, p.names, t) : ""}
                        {p.subtitle ? <span className="block mt-0.5">{p.subtitle}</span> : null}
                    </DialogDescription>
                </DialogHeader>
                <div className="px-6 space-y-2">
                    {s?.players.map((pl, i) => {
                        const winner = s.winnerIndex === i;
                        return (
                            <div key={pl.id} className="rounded-tile border border-surface-line px-4 py-3">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className={cn("text-[14px] font-semibold truncate", winner ? "text-gold" : "text-ink-1")}>{p.names[i] ?? pl.id}</span>
                                    <span className="rk-num text-[22px] font-bold text-ink-1 leading-none">
                                        {pl.score}<span className="text-[13px] font-medium text-ink-4"> / {pl.target}</span>
                                    </span>
                                </div>
                                <div className="mt-1.5 flex gap-4 text-[12px] font-medium text-ink-3 rk-num">
                                    <span>{t("sim.hud.inning")} {inningsForAverage(pl, p.phase)}</span>
                                    <span>{t("sim.hud.average")} {formatAverage(displayAverage(pl, p.phase, p.session?.rules.gameType))}</span>
                                    <span>{t("sim.hud.highRun")} {pl.highRun}</span>
                                </div>
                            </div>
                        );
                    })}
                    {(!p.record || p.offline) && (
                        <p className="text-[12px] font-medium text-ink-4">{t("sim.end.notRecorded")}</p>
                    )}
                    {p.record && !p.offline && p.mismatches > 0 && (
                        <p className="text-[12px] font-medium text-ink-4">{t("sim.end.mismatches").replace("{n}", String(p.mismatches))}</p>
                    )}
                </div>
                <DialogFooter className="shrink-0 px-6 pb-6 pt-4 flex-row gap-2">
                    {p.onShare && (
                        <Button
                            type="button" variant="outline" onClick={p.onShare} disabled={p.busy}
                            className="flex-1 h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                        >
                            {t("sim.share.button")}
                        </Button>
                    )}
                    {!p.hideRestart && (
                        <Button
                            type="button" variant="outline" onClick={p.onRestart} disabled={p.busy}
                            className="flex-1 h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                        >
                            {t("sim.end.restart")}
                        </Button>
                    )}
                    <Button
                        type="button" onClick={p.onExit} disabled={p.busy}
                        className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {t("sim.end.exit")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
