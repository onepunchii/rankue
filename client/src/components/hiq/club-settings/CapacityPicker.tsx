import { useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CAPACITY_MAX, CAPACITY_PRESETS, capacityOptions, isValidCapacity } from "@shared/crewManage";
import { FIELD_INPUT, optionClass } from "./formKit";

/**
 * 크루 정원 — 프리셋(10·20·30·50·100) + 무제한 + 직접 입력(2026-09-26).
 *
 * 예전엔 프리셋 다섯 개뿐이라 무제한 크루(정원 null/0)를 열면 50 이 선택된 척했고, 크루원이 50명을 넘으면
 * 서버가 '현재 인원보다 작게'(maxBelowCurrent)로 거절해 어떤 설정도 저장되지 않았다. 이제 현재 인원보다 작은
 * 프리셋은 처음부터 끄고, 무제한(0)을 고를 수 있다. value 0 = 무제한.
 */
export function CapacityPicker({ value, onChange, activeCount = 1, disabled }: {
    value: number;
    onChange: (v: number) => void;
    activeCount?: number;
    disabled?: boolean;
}) {
    const { t } = useT();
    const isPreset = value === 0 || (CAPACITY_PRESETS as readonly number[]).includes(value);
    const [customOpen, setCustomOpen] = useState(!isPreset);
    const [draft, setDraft] = useState(isPreset ? "" : String(value));
    const draftNum = Number(draft);
    const draftInvalid = draft !== "" && !isValidCapacity(draftNum, activeCount);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" role="group">
                {capacityOptions(activeCount).map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        disabled={disabled || o.disabled}
                        aria-pressed={!customOpen && value === o.value}
                        onClick={() => { setCustomOpen(false); setDraft(""); onChange(o.value); }}
                        className={optionClass(!customOpen && value === o.value, "rk-num")}
                    >
                        {o.value === 0 ? t("crewMgmt.capacityUnlimited") : `${o.value}${t("createClub.memberUnit")}`}
                    </button>
                ))}
                <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={customOpen}
                    onClick={() => setCustomOpen(true)}
                    className={optionClass(customOpen)}
                >
                    {t("crewMgmt.capacityCustom")}
                </button>
            </div>
            {customOpen && (
                <input
                    type="number"
                    inputMode="numeric"
                    min={Math.max(1, activeCount)}
                    max={CAPACITY_MAX}
                    disabled={disabled}
                    autoFocus={isPreset}
                    value={draft}
                    aria-label={t("crewMgmt.capacityCustom")}
                    placeholder={t("crewMgmt.capacityCustomPlaceholder").replace("{min}", String(Math.max(1, activeCount))).replace("{max}", String(CAPACITY_MAX))}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        const n = Number(e.target.value);
                        if (isValidCapacity(n, activeCount)) onChange(n);
                    }}
                    className={cn(FIELD_INPUT, "rk-num", draftInvalid && "border-destructive focus-visible:border-destructive")}
                />
            )}
            <p className={cn("text-[12px] font-medium", draftInvalid ? "text-destructive" : "text-ink-3")}>
                {draftInvalid
                    ? t("crewMgmt.capacityInvalid").replace("{min}", String(Math.max(1, activeCount))).replace("{max}", String(CAPACITY_MAX))
                    : activeCount > 1
                        ? t("crewMgmt.capacityHint").replace("{n}", String(activeCount))
                        : t("createClub.capacityHint")}
            </p>
        </div>
    );
}
