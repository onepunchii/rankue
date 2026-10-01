/**
 * 설정 → 주 종목(2026-10-01) — 고른 종목으로 앱이 시작한다. 카드를 누르면 바로 저장(서버 + 지금 화면 종목).
 * 고르기 화면과 같은 카드(SportChoiceCards)라 어디서 보든 같은 모양이다.
 */
import { useState } from "react";
import { LucideFlag } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type { PrimarySport } from "@shared/primarySport";
import { SportChoiceCards, useSavePrimarySport } from "./PrimarySport";

export function PrimarySportSetting({ current }: { current: string | null }) {
    const { t } = useT();
    const { toast } = useToast();
    const save = useSavePrimarySport();
    const [value, setValue] = useState<PrimarySport | null>(current === "GOLF" || current === "BILLIARDS" ? current : null);
    const [busy, setBusy] = useState(false);
    const pick = async (s: PrimarySport) => {
        if (busy || s === value) return;
        const prev = value;
        setValue(s);
        setBusy(true);
        try {
            await save(s);
            toast({ title: t(s === "GOLF" ? "primarySport.savedGolf" : "primarySport.savedBilliards") });
        } catch {
            setValue(prev);
            toast({ title: t("primarySport.saveFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="rk-card p-5">
            <div className="flex items-center gap-2 mb-1">
                <LucideFlag className="w-4 h-4 text-brand" />
                <h2 className="text-[15px] font-bold">{t("primarySport.settingsTitle")}</h2>
            </div>
            <p className="text-[12px] text-black/45 mb-4">{t("primarySport.settingsDesc")}</p>
            <SportChoiceCards value={value} onChange={(s) => void pick(s)} />
        </section>
    );
}
