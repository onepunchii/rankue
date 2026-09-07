import { memo } from "react";
import { useT } from "@/lib/i18n";

/**
 * 첫 세션 안내 — 조준·당점·세기 조작법 세 줄. 한 번 닫으면 기기에 저장돼 다시 안 뜬다("rankue.sim.onboarded").
 * 테이블 위에 얹히지만 포인터는 통과시키지 않는다(닫기 전엔 오조작 방지).
 * 카드는 오른쪽 열(툴바·큐 슬라이더·샷, 64 px)을 비우고 세로 가운데에 둔다 — 세 줄이 가리키는 두께 독(왼쪽 아래)·툴바·
 * 큐 슬라이더가 읽는 동안 그대로 보인다(아래 정렬이면 독과 샷을 덮었다, 2026-09-07 리뷰).
 */
interface Props {
    onClose: () => void;
}

export const COACH_PREF_KEY = "rankue.sim.onboarded";

export const CoachHint = memo(function CoachHint({ onClose }: Props) {
    const { t } = useT();
    const tips = [t("sim.coach.aim"), t("sim.coach.spin"), t("sim.coach.power")];
    return (
        <div className="absolute inset-y-0 left-0 right-[64px] z-[4] flex items-center justify-center p-3">
            <div className="w-full max-w-[300px] rounded-card bg-surface-1 border border-surface-line rk-shadow px-4 py-4">
                <p className="text-[14px] font-semibold text-ink-1">{t("sim.coach.title")}</p>
                <ol className="mt-2 flex flex-col gap-1.5">
                    {tips.map((tip, i) => (
                        <li key={i} className="flex gap-2 text-[13px] font-medium text-ink-2">
                            <span className="rk-num w-4 shrink-0 text-ink-3">{i + 1}</span>
                            <span>{tip}</span>
                        </li>
                    ))}
                </ol>
                <button type="button" onClick={onClose} className="mt-3 h-11 w-full rounded-xl bg-brand text-brand-fg text-[14px] font-semibold">
                    {t("sim.coach.start")}
                </button>
            </div>
        </div>
    );
});
