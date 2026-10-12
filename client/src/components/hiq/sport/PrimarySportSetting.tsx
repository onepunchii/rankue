/**
 * 설정 → 주 종목(2026-10-01) — 고른 종목으로 앱이 시작한다. 카드를 누르면 바로 저장(서버 + 지금 화면 종목).
 * 큰 카드 대신 두 칸 스위치(SportSegment) — 골프(어두운) 테마에서 흰 카드가 튀던 것(오너 10/1).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LucideFlag } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type { PrimarySport } from "@shared/primarySport";
import { SportSegment, useSavePrimarySport } from "./PrimarySport";

export function PrimarySportSetting({ current, hiking }: { current: string | null; /** 등산을 쓸 수 있는 회원 — '등산으로 시작' 칸을 더 보여 준다 */ hiking?: boolean }) {
    const { t } = useT();
    const { toast } = useToast();
    const save = useSavePrimarySport();
    const qc = useQueryClient();
    const { setSport } = useSport();
    const [value, setValue] = useState<PrimarySport | null>(current === "GOLF" || current === "BILLIARDS" ? current : null);
    const [onHiking, setOnHiking] = useState(current === "HIKING");
    const [busy, setBusy] = useState(false);
    // 등산으로 시작하기(2026-10-13) — 주 종목 둘과 따로 선 세 번째 칸. 서버가 등산을 쓸 수 있는 회원인지 확인한다
    const pickHiking = async () => {
        if (busy || onHiking) return;
        setBusy(true);
        try {
            await apiRequest("/api/hiq/me/primary-sport", { method: "POST", body: { sport: "HIKING" } });
            try { sessionStorage.setItem("rankue_primary_sport_applied", "1"); } catch { /* 저장소를 못 쓰는 환경 */ }
            qc.setQueryData(["/api/hiq/me"], (old: any) => (old ? { ...old, primarySport: "HIKING", suggestedSport: null } : old));
            setSport("HIKING");
            setOnHiking(true); setValue(null);
            toast({ title: t("primarySport.savedHiking") });
        } catch {
            toast({ title: t("primarySport.saveFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };
    const pick = async (s: PrimarySport) => {
        if (busy || (s === value && !onHiking)) return;
        const prev = value;
        setValue(s);
        setBusy(true);
        try {
            await save(s);
            setOnHiking(false);
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
            <SportSegment value={onHiking ? null : value} onChange={(s) => void pick(s)} disabled={busy} />
            {hiking && (
                <button type="button" role="radio" aria-checked={onHiking} disabled={busy} onClick={() => void pickHiking()} data-testid="primary-sport-hiking"
                    className={cn("mt-1.5 h-12 w-full rounded-[10px] flex items-center justify-center gap-2 text-[14.5px] font-semibold transition-colors disabled:opacity-60", !onHiking && "bg-black/[0.05] text-black/55")}
                    style={onHiking ? { backgroundColor: "#F28C6A", color: "#2A1208" } : undefined}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 19 L9.5 7 L13 13 L15.5 9.5 L21 19 Z" /></svg>
                    {t("primarySport.hiking")}
                </button>
            )}
        </section>
    );
}
