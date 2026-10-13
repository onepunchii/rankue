/**
 * 이닝 제한이 있는 판의 한 줄(2026-10-13 오너: "이닝 제한 시 게임에서 남은 이닝 표시") — 머리줄 바로 밑.
 *
 * "이닝 제한 3/20 · 남은 17". 지금 칠 사람의 이닝을 기준으로 센다(선공이 먼저 치므로 같은 이닝 안에서는 둘이 같다).
 * 마지막 이닝이면 '마지막 이닝'으로 바꿔 눈에 띄게 한다 — 이 이닝을 마치면 달성률로 승패가 갈린다.
 * 후구 중에도 '마지막 이닝'이다(제한이 남아 있어도 이 이닝이 끝).
 * 이닝 제한이 없거나 판이 끝났으면 그리지 않는다(자리를 차지하지 않는다). 누를 수 없다.
 */
import type { SessionState } from "@shared/sim/rules";
import { currentInning, inningsLeft, isLastInning } from "@shared/sim/rules";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function InningCapBar({ session }: { session: SessionState | null | undefined }) {
    const { t } = useT();
    if (!session || session.inningCap <= 0 || session.status !== "playing") return null;
    const current = currentInning(session);
    // 후구 중이면 제한이 남아 있어도 이 이닝이 끝이다
    const last = isLastInning(session);
    const left = last ? 0 : inningsLeft(session.inningCap, current) ?? 0;
    return (
        <div className="shrink-0 h-[22px] px-3 flex items-center justify-center gap-1.5 bg-surface-1 border-t border-surface-line pointer-events-none" role="status" data-testid="sim-inning-cap" data-left={left}>
            <span className="text-[11px] font-semibold text-ink-3 leading-none">
                {t("sim.setup.inningCap")} <span className="rk-num text-ink-2">{current}/{session.inningCap}</span>
            </span>
            <span className="text-[11px] text-ink-3 leading-none" aria-hidden="true">·</span>
            <span className={cn("text-[11px] font-semibold leading-none", last ? "text-brand" : left <= 3 ? "text-ink-1" : "text-ink-2")}>
                {last ? t("sim.hud.lastInning") : t("sim.hud.inningsLeft").replace("{n}", String(left))}
            </span>
        </div>
    );
}
