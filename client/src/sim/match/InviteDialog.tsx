/**
 * 친구에게 초대 보내기(2026-09-08 오너): 고르면 POST /sim/matches/:id/invite → 상대에게 푸시.
 * 받은 쪽이 누르면 `?join=<code>&auto=1` 로 바로 참가한다.
 *
 * 2026-09-23 오너: "친구 목록에 3쿠션·4구 온라인게임 핸디가 안 나오고 디자인이 밋밋하다."
 *  - 예전엔 /api/hiq/opponents 의 handi3c·handi4c(자기가 적는 **실전** 다마수)를 그렸다. 회원 107명 중 값이 있는 사람이
 *    2명·6명뿐이라(실측) 목록이 거의 전부 "–" 였다. 게다가 온라인 대전은 기본이 핸디전이라 실제로 쓰는 값이 아니다.
 *  - 이제 GET /sim/opponents 가 **온라인 기록으로 매긴 다마수**를 준다. 기록이 모자라면(fromRecord=false) 기본값이라
 *    흐리게 그려 "아직 기록 없음"을 숨기지 않는다. 라이벌이 위에 오고 배지가 붙는다.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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

    /**
     * 종목 칩 — 온라인 대전 **에버리지**(핸디전의 근거)와 **랭킹**(2026-09-23 오너).
     * 기록이 모자라면 흐리게: 그 값은 아직 기본값이라 실제 실력이 아니다. 배치 전이면 순위를 안 적는다.
     */
    const Chip = ({ label, b }: { label: string; b: { avg: number; fromRecord: boolean; rank: number | null } }) => (
        <span className={cn(
            "inline-flex items-baseline gap-1 h-6 px-2 rounded-md text-[11.5px] font-semibold",
            b.fromRecord ? "bg-brand/12 text-brand" : "bg-surface-3 text-ink-4",
        )}>
            {label}
            <span className="rk-num font-bold">{b.avg.toFixed(3)}</span>
            {b.rank !== null && <span className="rk-num font-bold opacity-70">#{b.rank}</span>}
        </span>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sim-dark bg-[var(--surface-1)] bg-surface-1 text-ink-1 max-w-md w-[92%] rounded-card p-5">
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
                                        className="w-full px-3 py-2.5 rounded-tile border border-surface-line bg-surface-1 flex items-center gap-3 text-left active:bg-surface-3 disabled:opacity-60"
                                    >
                                        <span className="shrink-0 w-9 h-9 rounded-full bg-surface-3 text-ink-2 text-[13px] font-bold flex items-center justify-center">
                                            {o.name.trim().charAt(0) || "?"}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-[14px] font-semibold text-ink-1 truncate">{o.name}</span>
                                                {o.friend && <span className="shrink-0 h-4 px-1.5 rounded bg-brand/15 text-brand text-[10px] font-bold flex items-center">{t("sim.match.inviteRival")}</span>}
                                            </span>
                                            <span className="mt-1 flex items-center gap-1">
                                                <Chip label={t("sim.setup.type3c")} b={o.b3c} />
                                                <Chip label={t("sim.setup.type4c")} b={o.b4c} />
                                            </span>
                                        </span>
                                        {sending === o.id && <span className="shrink-0 text-[12px] font-medium text-ink-3">{t("sim.match.inviteSending")}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {rows.length > 0 && <p className="text-[11px] font-medium text-ink-4">{t("sim.match.inviteHandiNote")}</p>}
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
