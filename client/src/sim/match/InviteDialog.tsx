/**
 * 친구에게 초대 보내기(2026-09-08 오너): 고르면 POST /sim/matches/:id/invite → 상대에게 푸시.
 * 받은 쪽이 누르면 `?join=<code>&auto=1` 로 바로 참가한다.
 *
 * 2026-09-23 오너: "친구 목록에 3쿠션·4구 온라인게임 핸디가 안 나오고 디자인이 밋밋하다."
 *  - 예전엔 /api/hiq/opponents 의 handi3c·handi4c(자기가 적는 **실전** 다마수)를 그렸다. 회원 107명 중 값이 있는 사람이
 *    2명·6명뿐이라(실측) 목록이 거의 전부 "–" 였다. 게다가 온라인 대전은 기본이 핸디전이라 실제로 쓰는 값이 아니다.
 *  - 이제 GET /sim/opponents 가 **온라인 기록으로 매긴 에버리지·랭킹**을 준다. 라이벌이 위에 오고 배지가 붙는다.
 *
 * 2026-09-23 오너(2차): "흐리고 밋밋하다. 3쿠션·4구는 차라리 우리 공 모양으로. 누를 수 있는 건 버튼처럼. 시인성이 안 좋다."
 *  - 종목을 글자 대신 **BallDot**(3쿠션=빨강·4구=노랑, 앱의 시각 언어)으로. 공 색은 항상 살려 둔다 — 그게 종목의 뜻이라
 *    흐리게 하면 무슨 종목인지 못 읽는다. '기록 모자람'은 **숫자 쪽**만 흐리게 해서 말한다.
 *  - 글씨에는 브랜드 초록을 안 쓴다. .sim-dark 는 --brand 를 안 덮어 당구 초록(#006241)이 그대로인데,
 *    검은 바탕에서 그 색 **글씨**는 대비가 2:1 도 안 된다(index.css .sim-table 주석이 같은 경고를 한다).
 *    바탕으로 쓰는 '초대' 알약·'라이벌' 배지만 brand 를 쓰고, 숫자·순위·이름 첫 글자는 ink 계열이다.
 *  - 줄마다 '초대' 알약을 오른쪽에 둬서 누를 수 있다는 걸 눈으로 알게 한다(줄 전체가 하나의 버튼이라 알약은 모양만이다).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BallDot } from "@/components/hiq/BallDot";
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
     * 종목 칩 — 공 모양(종목) + 온라인 **에버리지** + **랭킹**.
     * 공은 늘 제 색이다(종목의 뜻). 기록이 모자라면 숫자만 흐려져 "아직 기본값"이라고 말한다.
     */
    const Chip = ({ type, b }: { type: "3c" | "4c"; b: { avg: number; fromRecord: boolean; rank: number | null } }) => (
        <span className="inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-lg bg-surface-3">
            <BallDot type={type} size={12} />
            <span className={cn("rk-num text-[12.5px] font-bold", b.fromRecord ? "text-ink-1" : "text-ink-4")}>{b.avg.toFixed(3)}</span>
            {b.rank !== null && <span className="rk-num text-[11.5px] font-bold text-ink-2">#{b.rank}</span>}
        </span>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sim-dark bg-[var(--surface-1)] bg-surface-1 text-ink-1 max-w-md w-[92%] rounded-card p-5">
                <DialogHeader className="text-left">
                    <DialogTitle className="text-[18px] font-bold text-ink-1">{t("sim.match.inviteTitle")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-2">{t("sim.match.inviteDesc")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3" data-testid="invite-dialog">
                    {sent && (
                        <p className="rounded-tile bg-brand text-brand-fg text-[14px] font-semibold px-3 min-h-11 flex items-center" role="status">
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
                                        className="w-full px-3 py-3 rounded-tile border border-surface-line-strong bg-surface-2 flex items-center gap-3 text-left active:bg-surface-3 disabled:opacity-60"
                                    >
                                        <span className="shrink-0 w-10 h-10 rounded-full bg-surface-3 text-ink-1 text-[15px] font-bold flex items-center justify-center">
                                            {o.name.trim().charAt(0) || "?"}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-[15px] font-bold text-ink-1 truncate">{o.name}</span>
                                                {o.friend && <span className="shrink-0 h-[18px] px-1.5 rounded bg-brand text-brand-fg text-[10px] font-bold flex items-center">{t("sim.match.inviteRival")}</span>}
                                            </span>
                                            <span className="mt-1.5 flex items-center gap-1.5">
                                                <Chip type="3c" b={o.b3c} />
                                                <Chip type="4c" b={o.b4c} />
                                            </span>
                                        </span>
                                        {/* 줄 전체가 버튼이라 이 알약은 '누를 수 있다'는 표시다(중첩 버튼은 안 만든다) */}
                                        <span className={cn(
                                            "shrink-0 h-8 px-3 rounded-pill text-[12.5px] font-bold flex items-center",
                                            sending === o.id ? "bg-surface-3 text-ink-3" : "bg-brand text-brand-fg",
                                        )}>
                                            {sending === o.id ? t("sim.match.inviteSending") : t("sim.match.inviteAction")}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {rows.length > 0 && <p className="text-[11px] font-medium text-ink-3 leading-relaxed">{t("sim.match.inviteHandiNote")}</p>}
                    {error && <p className="text-[12px] font-medium text-ink-2" role="alert">{error}</p>}
                    <button type="button" onClick={() => onOpenChange(false)} className="w-full h-12 rounded-xl border border-surface-line-strong bg-surface-2 text-[14px] font-bold text-ink-1 active:bg-surface-3">
                        {t("sim.common.close")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default InviteDialog;
