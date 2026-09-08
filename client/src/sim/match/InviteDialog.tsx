/**
 * 친구에게 초대 보내기(2026-09-08 오너): 같은 매장 회원 목록(실전 매칭과 같은 GET /api/hiq/opponents)에서 고르면
 * POST /sim/matches/:id/invite → 상대에게 푸시. 받은 쪽이 누르면 `?join=<code>&auto=1` 로 바로 참가한다.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { MatchApi, OpponentLite } from "../matchApi";

export interface InviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    api: MatchApi;
    matchId: string;
}

export function InviteDialog({ open, onOpenChange, api, matchId }: InviteDialogProps) {
    const { t } = useT();
    const [list, setList] = useState<readonly OpponentLite[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [q, setQ] = useState("");
    const [sending, setSending] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let stop = false;
        setList(null); setFailed(false); setSent(null); setError(null); setQ("");
        api.listOpponents().then(
            (l) => { if (!stop) setList(l); },
            () => { if (!stop) setFailed(true); },
        );
        return () => { stop = true; };
    }, [open, api]);

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return (list ?? []).filter((o) => needle === "" || o.name.toLowerCase().includes(needle)).slice(0, 50);
    }, [list, q]);

    const send = async (o: OpponentLite) => {
        if (sending) return;
        setSending(o.id);
        setError(null);
        try {
            const r = await api.invite(matchId, o.id);
            setSent(r.name || o.name);
        } catch {
            setError(t("sim.match.inviteFailed"));
        } finally {
            setSending(null);
        }
    };

    const handi = (o: OpponentLite) => `${t("sim.setup.type3c")} ${o.handi3c ?? "–"} · ${t("sim.setup.type4c")} ${o.handi4c ?? "–"}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-surface-1 text-ink-1 max-w-md w-[92%] rounded-card p-5">
                <DialogHeader className="text-left">
                    <DialogTitle className="text-[18px] font-bold text-ink-1">{t("sim.match.inviteTitle")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">{t("sim.match.inviteDesc")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3" data-testid="invite-dialog">
                    {sent && (
                        <p className="rounded-tile bg-brand/[0.08] text-brand text-[14px] font-semibold px-3 min-h-11 flex items-center" role="status">
                            {t("sim.match.inviteSent").replace("{name}", sent)}
                        </p>
                    )}
                    <Input
                        value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sim.match.inviteSearch")} aria-label={t("sim.match.inviteSearch")}
                        className="h-11 rounded-xl"
                    />
                    {list === null && !failed && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.match.inviteLoading")}</p>}
                    {failed && <p className="text-[13px] font-medium text-ink-2 min-h-11 flex items-center">{t("sim.match.inviteFailed")}</p>}
                    {list !== null && rows.length === 0 && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.match.inviteEmpty")}</p>}
                    {rows.length > 0 && (
                        <ul className="max-h-[40vh] overflow-y-auto space-y-1.5" aria-label={t("sim.match.inviteTitle")}>
                            {rows.map((o) => (
                                <li key={o.id}>
                                    <button
                                        type="button" disabled={sending !== null} onClick={() => { void send(o); }}
                                        className="w-full min-h-11 px-3 py-2 rounded-tile border border-surface-line bg-surface-1 flex items-center justify-between gap-2 text-left active:bg-surface-3 disabled:opacity-60"
                                    >
                                        <span className="text-[14px] font-semibold text-ink-1 truncate">{o.name}</span>
                                        <span className="rk-num text-[12px] font-medium text-ink-3 shrink-0">{sending === o.id ? t("sim.match.inviteSending") : handi(o)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {error && <p className="text-[12px] font-medium text-ink-2" role="alert">{error}</p>}
                    <button type="button" onClick={() => onOpenChange(false)} className="w-full h-11 rounded-xl bg-surface-3 text-[14px] font-semibold text-ink-2 active:bg-surface-line">
                        {t("sim.common.close")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default InviteDialog;
