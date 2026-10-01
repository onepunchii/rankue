/**
 * 설정 → 주 종목(2026-10-01) — 고른 종목으로 앱이 시작한다. 카드를 누르면 바로 저장(서버 + 지금 화면 종목).
 * 큰 카드 대신 두 칸 스위치(SportSegment) — 골프(어두운) 테마에서 흰 카드가 튀던 것(오너 10/1).
 */
import { useState } from "react";
import { LucideFlag } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type { PrimarySport } from "@shared/primarySport";
import { SportSegment, useSavePrimarySport } from "./PrimarySport";

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
            <SportSegment value={value} onChange={(s) => void pick(s)} disabled={busy} />
        </section>
    );
}
