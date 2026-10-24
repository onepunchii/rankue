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

/** 주 종목 둘(당구 | 골프) 밖의 칸 — 그 종목을 쓸 수 있는 회원에게만 */
type Extra = "HIKING" | "FISHING";
const EXTRA: Record<Extra, { label: string; saved: string; on: { bg: string; fg: string }; icon: JSX.Element }> = {
    HIKING: {
        label: "primarySport.hiking", saved: "primarySport.savedHiking", on: { bg: "#F28C6A", fg: "#2A1208" },
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 19 L9.5 7 L13 13 L15.5 9.5 L21 19 Z" /></svg>,
    },
    FISHING: {
        label: "primarySport.fishing", saved: "primarySport.savedFishing", on: { bg: "#F4A963", fg: "#2A1606" },
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12 C6 8 11 8 15 12 C11 16 6 16 3 12 Z" /><path d="M15 12 L20 8.5 V15.5 Z" /></svg>,
    },
};

export function PrimarySportSetting({ current, hiking, fishing }: { current: string | null; /** 등산을 쓸 수 있는 회원 — '등산으로 시작' 칸을 더 보여 준다 */ hiking?: boolean; /** 낚시를 쓸 수 있는 회원 — '낚시로 시작' 칸(2026-10-24) */ fishing?: boolean }) {
    const { t } = useT();
    const { toast } = useToast();
    const save = useSavePrimarySport();
    const qc = useQueryClient();
    const { setSport } = useSport();
    const [value, setValue] = useState<PrimarySport | null>(current === "GOLF" || current === "BILLIARDS" ? current : null);
    const [extra, setExtra] = useState<Extra | null>(current === "HIKING" || current === "FISHING" ? current : null);
    const [busy, setBusy] = useState(false);
    // 등산(2026-10-13) · 낚시(2026-10-24)로 시작하기 — 주 종목 둘과 따로 선 칸. 서버가 그 종목을 쓸 수 있는 회원인지 확인한다
    const pickExtra = async (x: Extra) => {
        if (busy || extra === x) return;
        setBusy(true);
        try {
            await apiRequest("/api/hiq/me/primary-sport", { method: "POST", body: { sport: x } });
            try { sessionStorage.setItem("rankue_primary_sport_applied", "1"); } catch { /* 저장소를 못 쓰는 환경 */ }
            qc.setQueryData(["/api/hiq/me"], (old: any) => (old ? { ...old, primarySport: x, suggestedSport: null } : old));
            setSport(x);
            setExtra(x); setValue(null);
            toast({ title: t(EXTRA[x].saved) });
        } catch {
            toast({ title: t("primarySport.saveFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };
    const pick = async (s: PrimarySport) => {
        if (busy || (s === value && !extra)) return;
        const prev = value;
        setValue(s);
        setBusy(true);
        try {
            await save(s);
            setExtra(null);
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
            <SportSegment value={extra ? null : value} onChange={(s) => void pick(s)} disabled={busy} />
            {(["HIKING", "FISHING"] as const).filter((x) => (x === "HIKING" ? hiking : fishing)).map((x) => {
                const on = extra === x;
                return (
                    <button key={x} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => void pickExtra(x)} data-testid={`primary-sport-${x.toLowerCase()}`}
                        className={cn("mt-1.5 h-12 w-full rounded-[10px] flex items-center justify-center gap-2 text-[14.5px] font-semibold transition-colors disabled:opacity-60", !on && "bg-black/[0.05] text-black/55")}
                        style={on ? { backgroundColor: EXTRA[x].on.bg, color: EXTRA[x].on.fg } : undefined}>
                        {EXTRA[x].icon}
                        {t(EXTRA[x].label)}
                    </button>
                );
            })}
        </section>
    );
}
