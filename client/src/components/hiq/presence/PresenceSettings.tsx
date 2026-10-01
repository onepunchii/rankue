/**
 * 설정 → 친구 접속(2026-10-01) — 앱 안 배너만이라 폰을 울리지 않는다(shared/presence).
 *  - 친구가 들어오면 알려 주기(받기) · 내 접속 알리기(보내기). 둘 다 기본 켜짐, 끈 사람만 저장된다.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideUsers } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const KEY = ["/api/hiq/presence/settings"] as const;
type Prefs = { share: boolean; receive: boolean };

export function PresenceSettings() {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data } = useQuery<Prefs>({ queryKey: KEY, gcTime: 0 });
    const [busy, setBusy] = useState(false);
    if (!data) return null;

    const flip = async (k: keyof Prefs) => {
        if (busy) return;
        const next = !data[k];
        setBusy(true);
        qc.setQueryData(KEY, { ...data, [k]: next });
        try {
            await apiRequest(KEY[0], { method: "PATCH", body: { [k]: next } });
        } catch {
            qc.setQueryData(KEY, data);
            toast({ title: t("settings.notifPrefFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };

    const rows: { k: keyof Prefs; title: string; desc: string }[] = [
        { k: "receive", title: t("presence.receive"), desc: t("presence.receiveDesc") },
        { k: "share", title: t("presence.share"), desc: t("presence.shareDesc") },
    ];
    return (
        <section className="rk-card p-5">
            <div className="flex items-center gap-2 mb-1">
                <LucideUsers className="w-4 h-4 text-brand" />
                <h2 className="text-[15px] font-bold">{t("presence.settingsTitle")}</h2>
            </div>
            <p className="text-[12px] text-black/45 mb-4">{t("presence.settingsDesc")}</p>
            <div className="space-y-2">
                {rows.map((r) => (
                    <button
                        key={r.k} type="button" onClick={() => void flip(r.k)} disabled={busy} aria-pressed={data[r.k]}
                        className="w-full flex items-center justify-between gap-3 min-h-[56px] px-4 py-2.5 bg-black/[0.03] rounded-tile text-left disabled:opacity-60"
                    >
                        <span className="min-w-0">
                            <span className="block text-[14px] font-medium">{r.title}</span>
                            <span className="block text-[11.5px] text-black/45 mt-0.5 break-keep">{r.desc}</span>
                        </span>
                        <span className="relative w-11 h-6 rounded-full shrink-0 transition-colors" style={{ backgroundColor: data[r.k] ? "#12805C" : "rgba(120,120,128,0.32)" }} aria-hidden>
                            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-[#ffffff] shadow transition-all", data[r.k] ? "left-[22px]" : "left-0.5")} />
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
