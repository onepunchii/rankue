import { memo } from "react";
import { useT } from "@/lib/i18n";

/**
 * 리얼리티 모드 첫 안내 — 스쿼트·스로우·커브 세 줄. 한 번 닫으면 기기에 저장돼 다시 안 뜬다("rankue.sim.reality-hint").
 * CoachHint 와 같은 카드 배치(오른쪽 열을 비우고 세로 가운데). 코치 힌트가 열려 있으면 그 뒤에 뜬다(페이지가 순서를 정한다).
 */
interface Props {
    onClose: () => void;
}

export const REALITY_PREF_KEY = "rankue.sim.reality-hint";

export const RealityHint = memo(function RealityHint({ onClose }: Props) {
    const { t } = useT();
    const tips = [t("sim.reality.squirt"), t("sim.reality.throw"), t("sim.reality.curve")];
    return (
        <div className="absolute inset-y-0 left-0 right-[64px] z-[4] flex items-center justify-center p-3">
            <div className="w-full max-w-[300px] rounded-card bg-surface-1 border border-surface-line rk-shadow px-4 py-4">
                <p className="text-[14px] font-semibold text-ink-1">{t("sim.reality.title")}</p>
                <ol className="mt-2 flex flex-col gap-1.5">
                    {tips.map((tip, i) => (
                        <li key={i} className="flex gap-2 text-[13px] font-medium text-ink-2">
                            <span className="rk-num w-4 shrink-0 text-ink-3">{i + 1}</span>
                            <span>{tip}</span>
                        </li>
                    ))}
                </ol>
                <button type="button" onClick={onClose} className="mt-3 h-11 w-full rounded-xl bg-brand text-brand-fg text-[14px] font-semibold">
                    {t("sim.reality.start")}
                </button>
            </div>
        </div>
    );
});
