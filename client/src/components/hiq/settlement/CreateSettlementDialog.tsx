import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LucideX, LucideChevronRight, LucideCalendar, LucideSettings2, LucideTrash2, LucidePlus } from "@/lib/icons";
import { MemberSelectionDialog } from "./MemberSelectionDialog";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { CREW_BTN, CREW_TEXT, CrewAvatar, IconButton } from "@/components/hiq/crew-ui";
import { checkSettlementRound, splitAmount } from "@shared/crewSettlement";
import { kstParts } from "@shared/crewTime";

// 정산 만들기(2026-09-26 크루 정비).
//  - 차수를 지울 수 있다(예전엔 늘리기만 됐다).
//  - 금액·계산한 사람을 확인한다 — 빈 금액이 0원으로, 고르지 않은 계산한 사람이 '첫 참석자'로 조용히 바뀌던 것을 막는다.
//    서버도 같은 함수(shared/crewSettlement.checkSettlementRound)로 한 번 더 거절한다.
//  - 1인 금액은 1원 단위로 정확히 나누고, 나누어떨어지지 않는 나머지는 계산한 사람이 부담한다고 적는다.
//    예전엔 10원 단위 올림이라 계산한 사람이 매번 조금씩 더 걷었다.
//  - 창을 열 때마다 새로 채운다(제목의 날짜가 전날 것으로 남던 문제). 크루장 전용 가정이 없다 — 서버는 크루원 누구나 받는다.

interface CreateSettlementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    members: any[]; // Crew members
    me?: HiqMember; // Current user for default account info
    onSubmit: (data: any) => void;
    isPending: boolean;
}

interface Round {
    key: number;
    title: string;
    amount: string;
    payerId: string;
    participants: string[];
}

export function CreateSettlementDialog({ open, onOpenChange, crewId, members, me, onSubmit, isPending }: CreateSettlementDialogProps) {
    const { t } = useT();
    const { toast } = useToast();

    // 승인 대기자는 모임에 온 적이 없다 — 어느 차수의 참석자로도 넣지 않는다(1인 금액이 틀어진다).
    const activeMembers = members.filter((m) => m.role !== "pending");
    const allIds = () => activeMembers.map((m) => m.member.id as string);
    const roundName = (n: number) => t("crewSettle.roundN").replace("{n}", String(n));
    const defaultTitle = () => {
        const p = kstParts(Date.now());
        return t("crewSettle.defaultTitle").replace("{m}", String(p.m)).replace("{d}", String(p.d));
    };
    const newRound = (key: number, n: number): Round => ({
        key, title: roundName(n), amount: "",
        // 대개 정산을 만드는 사람이 계산했다 — 참석자면 기본값으로 둔다(바꿀 수 있다).
        payerId: me?.id && activeMembers.some((m) => m.member.id === me.id) ? me.id : "",
        participants: allIds(),
    });

    const [title, setTitle] = useState("");
    const [accountBank, setAccountBank] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");
    const [rounds, setRounds] = useState<Round[]>([]);
    const [nextKey, setNextKey] = useState(2);
    const [errors, setErrors] = useState<Record<number, string>>({});
    const [isMemberSelectOpen, setIsMemberSelectOpen] = useState(false);
    const [activeRoundKey, setActiveRoundKey] = useState<number | null>(null);

    // 열 때마다 새 양식 — 제출 뒤 다시 열면 지난 내용·어제 날짜가 남아 있었다.
    useEffect(() => {
        if (!open) return;
        setTitle(defaultTitle());
        setAccountBank(me?.defaultAccountBank ?? "");
        setAccountNumber(me?.defaultAccountNumber ?? "");
        setAccountHolder(me?.defaultAccountHolder ?? "");
        setRounds([newRound(1, 1)]);
        setNextKey(2);
        setErrors({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const { data: activities } = useQuery({
        queryKey: [`/api/hiq/crews/${crewId}/activities`],
        enabled: open && !!crewId,
    });
    const recentActivities = Array.isArray(activities)
        ? [...activities].sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()).slice(0, 5)
        : [];

    const patchRound = (key: number, patch: Partial<Round>) => {
        setRounds((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    };

    const handleImportActivity = (activityId: string, key: number) => {
        if (!Array.isArray(activities)) return;
        const activity = activities.find((a: any) => a.id === activityId);
        if (activity?.participants) {
            const active = new Set(allIds());
            patchRound(key, { participants: activity.participants.map((p: any) => p.memberId).filter((id: string) => active.has(id)) });
        }
    };

    const addRound = () => {
        setRounds((rs) => [...rs, newRound(nextKey, rs.length + 1)]);
        setNextKey((k) => k + 1);
    };
    const removeRound = (key: number) => setRounds((rs) => rs.filter((r) => r.key !== key));

    const handleSubmit = () => {
        if (!title.trim()) {
            toast({ title: t("crewSettle.titleRequired"), variant: "destructive" });
            return;
        }
        const active = new Set(allIds());
        const clean = rounds.map((r) => ({ ...r, participants: r.participants.filter((id) => active.has(id)) }));
        const errs: Record<number, string> = {};
        for (const r of clean) {
            const e = checkSettlementRound({ amount: r.amount, payerId: r.payerId, participants: r.participants });
            if (e) errs[r.key] = e === "amount" ? t("crewSettle.errAmount") : e === "participants" ? t("crewSettle.errParticipants") : t("crewSettle.errPayer");
        }
        setErrors(errs);
        if (Object.keys(errs).length > 0) {
            toast({ title: t("crewSettle.fixRounds"), variant: "destructive" });
            return;
        }
        onSubmit({
            title: title.trim(),
            accountBank: accountBank.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolder.trim(),
            items: clean.map((r, idx) => ({ roundOrder: idx + 1, title: r.title.trim() || roundName(idx + 1), amount: Number(r.amount), payerId: r.payerId })),
            participants: clean.flatMap((r, idx) => r.participants.map((memberId) => ({ roundOrder: idx + 1, memberId }))),
            sendToChat: true,
        });
    };

    const fieldCls = "h-12 text-[15px] bg-surface-2 border-surface-line rounded-tile";
    const labelCls = "text-[13px] font-semibold text-ink-2";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="bg-surface-1 text-ink-1 max-w-md max-h-[90dvh] p-0 gap-0 flex flex-col overflow-hidden rounded-card">
                <div className="shrink-0 flex items-center justify-between gap-2 pl-4 pr-2 pt-3 pb-2 border-b border-surface-line">
                    <div className="min-w-0">
                        <DialogTitle className={CREW_TEXT.section}>{t("createSettlementDialog.title")}</DialogTitle>
                        <DialogDescription className={CREW_TEXT.caption}>{t("crewSettle.dialogDesc")}</DialogDescription>
                    </div>
                    <IconButton label={t("crewPoll.close")} onClick={() => onOpenChange(false)}><LucideX /></IconButton>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
                    {/* 기본 정보 */}
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="st-title" className={labelCls}>{t("createSettlementDialog.titleLabel")}</Label>
                            <Input id="st-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col gap-1.5 col-span-1">
                                <Label htmlFor="st-bank" className={labelCls}>{t("createSettlementDialog.bankLabel")}</Label>
                                <Input id="st-bank" value={accountBank} onChange={(e) => setAccountBank(e.target.value)} placeholder={t("createSettlementDialog.bankPlaceholder")} className={fieldCls} />
                            </div>
                            <div className="flex flex-col gap-1.5 col-span-2">
                                <Label htmlFor="st-account" className={labelCls}>{t("createSettlementDialog.accountLabel")}</Label>
                                <Input id="st-account" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={t("createSettlementDialog.accountPlaceholder")} className={fieldCls} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="st-holder" className={labelCls}>{t("createSettlementDialog.holderLabel")}</Label>
                            <Input id="st-holder" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder={t("createSettlementDialog.holderPlaceholder")} className={fieldCls} />
                        </div>
                        <p className={CREW_TEXT.caption}>{t("crewSettle.accountNote")}</p>
                    </div>

                    {/* 차수 */}
                    {rounds.map((round, index) => {
                        const amount = Number(round.amount);
                        const split = Number.isInteger(amount) && amount > 0 && round.participants.length > 0
                            ? splitAmount(amount, round.participants, round.payerId || null)
                            : null;
                        const err = errors[round.key];
                        return (
                            <section key={round.key} className={cn("rk-card-2 p-4 flex flex-col gap-3", err && "ring-1 ring-destructive")}>
                                <div className="flex items-center justify-between gap-2 -mt-1 -mr-2">
                                    <span className="rk-chip text-[12px] bg-brand/10 text-brand">{t("crewSettle.stepN").replace("{n}", String(index + 1))}</span>
                                    {rounds.length > 1 && (
                                        <IconButton label={t("crewSettle.removeRound")} onClick={() => removeRound(round.key)} tone="danger">
                                            <LucideTrash2 />
                                        </IconButton>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className={labelCls}>{t("createSettlementDialog.roundNameLabel")}</Label>
                                    <Input value={round.title} maxLength={30} onChange={(e) => patchRound(round.key, { title: e.target.value })} className={fieldCls} />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className={labelCls}>{t("createSettlementDialog.amountLabel")}</Label>
                                    <div className="relative">
                                        <Input
                                            type="number" inputMode="numeric" min={1} step={1}
                                            value={round.amount}
                                            onChange={(e) => patchRound(round.key, { amount: e.target.value })}
                                            placeholder="0"
                                            className={cn(fieldCls, "text-[17px] font-semibold pr-10 rk-num")}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-ink-3">{t("createSettlementDialog.currencyUnit")}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className={labelCls}>{t("createSettlementDialog.participantsLabel")}</Label>
                                        {recentActivities.length > 0 && (
                                            <Select onValueChange={(val) => handleImportActivity(val, round.key)}>
                                                <SelectTrigger className="h-11 w-auto gap-1 px-3 rounded-pill border-surface-line bg-surface-1 text-[13px] font-semibold text-brand">
                                                    <LucideCalendar className="w-4 h-4" />
                                                    {t("createSettlementDialog.importActivity")}
                                                </SelectTrigger>
                                                <SelectContent className="bg-surface-1 border-surface-line text-ink-1 rounded-tile">
                                                    {recentActivities.map((act: any) => (
                                                        <SelectItem key={act.id} value={act.id} className="min-h-11 text-[15px]">
                                                            {new Date(act.activityDate).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" })} {act.title}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setActiveRoundKey(round.key); setIsMemberSelectOpen(true); }}
                                        className="w-full min-h-14 rounded-tile bg-surface-2 border border-surface-line px-3 py-2 flex items-center justify-between gap-3 text-left active:bg-surface-3"
                                    >
                                        <span className="flex items-center gap-3 min-w-0">
                                            <span className="flex -space-x-2 shrink-0">
                                                {round.participants.slice(0, 5).map((mid) => {
                                                    const m = activeMembers.find((am) => am.member.id === mid);
                                                    return <CrewAvatar key={mid} src={m?.member.profileImageUrl} name={m?.member.name} size={28} className="ring-2 ring-[var(--surface-2)]" />;
                                                })}
                                            </span>
                                            <span className="flex flex-col min-w-0">
                                                <span className="text-[15px] font-semibold text-ink-1 rk-num">{t("crewSettle.peopleN").replace("{n}", String(round.participants.length))}</span>
                                                <span className={CREW_TEXT.caption}>{t("createSettlementDialog.editMembers")}</span>
                                            </span>
                                        </span>
                                        <LucideSettings2 className="w-5 h-5 text-ink-3 shrink-0" />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className={labelCls}>{t("createSettlementDialog.payerLabel")}</Label>
                                    <Select value={round.payerId} onValueChange={(val) => patchRound(round.key, { payerId: val })}>
                                        <SelectTrigger aria-label={t("createSettlementDialog.payerLabel")} className={cn(fieldCls, "px-3 font-semibold text-ink-1")}>
                                            <SelectValue placeholder={t("createSettlementDialog.payerPlaceholder")} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-surface-1 border-surface-line text-ink-1 rounded-tile">
                                            {activeMembers
                                                .filter((m) => round.participants.includes(m.member.id))
                                                .map((m) => (
                                                    <SelectItem key={m.member.id} value={m.member.id} className="min-h-11 text-[15px]">{m.member.name}</SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* 1인 금액 미리보기 — 1원 단위, 나머지는 계산한 사람 */}
                                {split && (
                                    <p className="text-[13px] font-medium text-ink-2 rk-num">
                                        {t("crewSettle.perPerson").replace("{n}", split.base.toLocaleString("ko-KR"))}
                                        {split.remainder > 0 && (
                                            <span className="text-ink-3"> · {t("crewSettle.remainderNote").replace("{n}", String(split.remainder))}</span>
                                        )}
                                    </p>
                                )}
                                {err && <p className="text-[13px] font-medium text-destructive" role="alert">{err}</p>}
                            </section>
                        );
                    })}

                    <button type="button" onClick={addRound} disabled={rounds.length >= 20} className={cn(CREW_BTN.secondary, "w-full border-dashed")}>
                        <LucidePlus className="w-4 h-4" />
                        {t("crewSettle.addRound")}
                    </button>
                </div>

                {/* 참석자 고르기 */}
                <MemberSelectionDialog
                    open={isMemberSelectOpen}
                    onOpenChange={setIsMemberSelectOpen}
                    members={activeMembers}
                    selectedIds={rounds.find((r) => r.key === activeRoundKey)?.participants || []}
                    onConfirm={(selectedIds) => {
                        if (activeRoundKey == null) return;
                        const r = rounds.find((x) => x.key === activeRoundKey);
                        // 계산한 사람이 빠지면 선택을 비운다 — 조용히 다른 사람으로 바꾸지 않는다.
                        patchRound(activeRoundKey, {
                            participants: selectedIds,
                            payerId: r && selectedIds.includes(r.payerId) ? r.payerId : "",
                        });
                    }}
                />

                <div className="shrink-0 px-4 pt-3 pb-4 border-t border-surface-line">
                    <button type="button" className={cn(CREW_BTN.primary, "w-full h-12")} onClick={handleSubmit} disabled={isPending}>
                        {isPending ? t("createSettlementDialog.creating") : t("createSettlementDialog.submit")}
                        {!isPending && <LucideChevronRight className="w-4 h-4" />}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
