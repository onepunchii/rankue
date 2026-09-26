import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LucideChevronRight, LucideCopy, LucidePiggyBank, LucideCheckCircle2, LucideUsers, LucideX } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CREW_BTN, CREW_CARD, CREW_TEXT, IconButton } from "@/components/hiq/crew-ui";
import { formatKst } from "@/components/hiq/poll/crewTimeFormat";
import { computeTransfers, splitAmount } from "@shared/crewSettlement";

// 정산 상세(2026-09-26 크루 정비).
//  - 1인 금액은 1원 단위로 정확히(shared/crewSettlement). 예전엔 10원 단위 올림이라 계산한 사람이 더 받았다.
//  - 송금은 각 차수를 **계산한 사람**에게 간다. 그런데 화면은 모든 송금 아래에 총무(정산을 만든 사람) 계좌만 보여 줘서
//    2차를 계산한 사람에게 보낼 돈을 총무 계좌로 보내게 만들었다. 지금은 송금마다 받는 사람을 적고,
//    총무 계좌는 받는 사람이 총무일 때만 붙인다. 다른 사람에게 보낼 때는 "계좌를 물어보세요"로 안내한다.

interface SettlementDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    settlement: any; // Full detail with items and participants (+ creator {id,name})
    meId?: string;
}

export function SettlementDetailDialog({ open, onOpenChange, settlement, meId }: SettlementDetailDialogProps) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<"my" | "all">("my");

    const calc = useMemo(() => {
        if (!settlement) return null;
        const names: Record<string, string> = {};
        const items = (settlement.items ?? []).map((item: any) => {
            if (item.payerId && item.payer?.name) names[item.payerId] = item.payer.name;
            for (const p of item.participants ?? []) if (p.member?.name) names[p.memberId] = p.member.name;
            return { amount: Number(item.amount) || 0, payerId: item.payerId ?? null, participants: item.participants ?? [] };
        });
        if (settlement.creator?.id && settlement.creator?.name) names[settlement.creator.id] = settlement.creator.name;
        return { names, ...computeTransfers(items) };
    }, [settlement]);

    if (!settlement || !calc) return null;

    const nameOf = (id: string) => calc.names[id] || t("settlementDetail.unknown");
    const creatorId: string | undefined = settlement.creatorId ?? settlement.creator?.id;
    const hasAccount = !!(settlement.accountBank || settlement.accountNumber);
    const myTransfers = calc.transfers.filter((tr) => tr.fromId === meId || tr.toId === meId);
    const totalAmount = (settlement.items ?? []).reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    const won = (n: number) => t("crewSettle.won").replace("{n}", n.toLocaleString("ko-KR"));

    const copyAccount = () => {
        if (!hasAccount) return;
        const text = `${settlement.accountBank ?? ""} ${settlement.accountNumber ?? ""}`.trim();
        navigator.clipboard?.writeText(text).then(
            () => toast({ title: t("settlementDetail.accountCopied") }),
            () => toast({ title: text }),
        );
    };

    const accountBox = (
        <button type="button" onClick={copyAccount} className="w-full min-h-14 flex items-center justify-between gap-3 rounded-tile bg-surface-2 border border-surface-line px-3 py-2 text-left active:bg-surface-3">
            <span className="min-w-0">
                <span className={cn(CREW_TEXT.caption, "block")}>
                    {t("crewSettle.accountOf").replace("{name}", creatorId ? nameOf(creatorId) : t("settlementDetail.unknown"))}
                </span>
                <span className="block text-[15px] font-semibold text-ink-1 break-all">
                    {settlement.accountBank} <span className="rk-num">{settlement.accountNumber}</span>
                    {settlement.accountHolder && <span className="text-ink-3 font-medium"> ({settlement.accountHolder})</span>}
                </span>
            </span>
            <LucideCopy className="w-5 h-5 text-ink-3 shrink-0" aria-label={t("crewSettle.copy")} />
        </button>
    );

    const tabCls = (on: boolean) => cn(
        "flex-1 h-11 rounded-pill text-[13px] font-semibold transition-colors",
        on ? "bg-surface-1 text-ink-1 rk-shadow" : "text-ink-3",
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="bg-surface-0 text-ink-1 max-w-sm max-h-[90dvh] overflow-y-auto p-0 gap-0 rounded-card">
                <div className="relative px-4 pt-4 pb-5">
                    <IconButton label={t("crewPoll.close")} onClick={() => onOpenChange(false)} className="absolute right-2 top-2"><LucideX /></IconButton>
                    <div className="text-center pt-4 pb-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand/10 mb-2">
                            <LucidePiggyBank className="w-6 h-6 text-brand" />
                        </div>
                        <DialogTitle className={cn(CREW_TEXT.section, "break-words")}>{settlement.title}</DialogTitle>
                        <DialogDescription className={cn(CREW_TEXT.caption, "rk-num mt-0.5")}>
                            {formatKst(settlement.createdAt, locale, { year: true })}
                            {creatorId && ` · ${t("crewSettle.byName").replace("{name}", nameOf(creatorId))}`}
                        </DialogDescription>
                    </div>

                    <div className="flex rounded-pill bg-surface-3 p-1 mb-4" role="tablist">
                        <button type="button" role="tab" aria-selected={activeTab === "my"} className={tabCls(activeTab === "my")} onClick={() => setActiveTab("my")}>
                            {t("settlementDetail.myTab")}
                        </button>
                        <button type="button" role="tab" aria-selected={activeTab === "all"} className={tabCls(activeTab === "all")} onClick={() => setActiveTab("all")}>
                            {t("settlementDetail.allTab")}
                        </button>
                    </div>

                    {activeTab === "my" ? (
                        <div className="flex flex-col gap-3">
                            {myTransfers.length > 0 ? myTransfers.map((tr, idx) => {
                                const sending = tr.fromId === meId;
                                const toCreator = tr.toId === creatorId;
                                return (
                                    <div key={idx} className={cn(CREW_CARD, "flex flex-col gap-2 text-center")}>
                                        <span className={cn("self-center rk-chip text-[12px]", sending ? "bg-destructive/10 text-destructive" : "bg-brand/10 text-brand")}>
                                            {sending ? t("settlementDetail.amountToSend") : t("settlementDetail.amountToReceive")}
                                        </span>
                                        <p className="text-[15px] font-semibold text-ink-1">
                                            {sending
                                                ? t("crewSettle.sendTo").replace("{name}", nameOf(tr.toId))
                                                : t("crewSettle.receiveFrom").replace("{name}", nameOf(tr.fromId))}
                                        </p>
                                        <p className="text-[22px] font-semibold text-ink-1 rk-num">{won(tr.amount)}</p>
                                        {/* 계좌는 받는 사람이 총무일 때만 — 다른 사람에게 보낼 돈을 총무 계좌로 보내지 않게 */}
                                        {sending && (toCreator && hasAccount
                                            ? accountBox
                                            : <p className={CREW_TEXT.caption}>{t("crewSettle.askAccount").replace("{name}", nameOf(tr.toId))}</p>)}
                                    </div>
                                );
                            }) : (
                                <div className="py-6 text-center">
                                    <LucideCheckCircle2 className="w-12 h-12 text-brand mx-auto mb-2" />
                                    <p className={CREW_TEXT.section}>{t("settlementDetail.allSettled")}</p>
                                    <p className={CREW_TEXT.sub}>{t("settlementDetail.nothingToExchange")}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-end border-b border-surface-line pb-3">
                                <span className="text-[15px] font-semibold text-ink-1">{t("settlementDetail.totalSpent")}</span>
                                <span className="text-[17px] font-semibold text-ink-1 rk-num">{won(totalAmount)}</span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {(settlement.items ?? []).map((item: any) => {
                                    const ids = (item.participants ?? []).map((p: any) => p.memberId as string);
                                    const split = splitAmount(Number(item.amount) || 0, ids, item.payerId);
                                    return (
                                        <div key={item.id} className="flex flex-col gap-1 border-b border-dashed border-surface-line pb-3 last:border-0">
                                            <div className="flex justify-between gap-2">
                                                <span className="text-[15px] font-semibold text-ink-1 min-w-0 break-words">{item.title}</span>
                                                <span className="text-[15px] font-semibold text-ink-1 rk-num shrink-0">{won(Number(item.amount) || 0)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink-3">
                                                <span className="rk-chip text-[12px] bg-surface-3 text-ink-2">
                                                    {t("crewSettle.paidBy").replace("{name}", item.payer?.name || t("settlementDetail.payerFallback"))}
                                                </span>
                                                <span className="flex items-center gap-1 rk-num">
                                                    <LucideUsers className="w-3.5 h-3.5" />
                                                    {t("crewSettle.peopleN").replace("{n}", String(ids.length))}
                                                    {ids.length > 0 && ` · ${t("crewSettle.perPerson").replace("{n}", split.base.toLocaleString("ko-KR"))}`}
                                                </span>
                                            </div>
                                            {split.remainder > 0 && (
                                                <p className={cn(CREW_TEXT.caption, "text-right")}>{t("crewSettle.remainderNote").replace("{n}", String(split.remainder))}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex flex-col gap-2 pt-3 border-t border-surface-line">
                                <p className={cn(CREW_TEXT.caption, "text-center")}>{t("settlementDetail.transferList")}</p>
                                {calc.transfers.length === 0 && <p className={cn(CREW_TEXT.sub, "text-center")}>{t("settlementDetail.nothingToExchange")}</p>}
                                {calc.transfers.map((tr, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-2 min-h-11 rounded-tile bg-surface-2 px-3">
                                        <span className="flex items-center gap-1.5 min-w-0 text-[13px] font-semibold text-ink-1">
                                            <span className="truncate">{nameOf(tr.fromId)}</span>
                                            <LucideChevronRight className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                                            <span className="truncate">{nameOf(tr.toId)}</span>
                                        </span>
                                        <span className="text-[13px] font-semibold text-ink-2 rk-num shrink-0">{won(tr.amount)}</span>
                                    </div>
                                ))}
                                {hasAccount && (
                                    <div className="flex flex-col gap-1 pt-1">
                                        {accountBox}
                                        <p className={CREW_TEXT.caption}>{t("crewSettle.accountOnlyFor").replace("{name}", creatorId ? nameOf(creatorId) : "-")}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-4 pb-4">
                    <button type="button" className={cn(CREW_BTN.primary, "w-full h-12")} onClick={() => onOpenChange(false)}>
                        {t("settlementDetail.confirm")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
