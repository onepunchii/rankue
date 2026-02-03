import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HiqSettlement, HiqSettlementItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideChevronRight, LucideCopy, LucidePiggyBank, LucideShare2, LucideCheckCircle2, LucideUsers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettlementDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    settlement: any; // Full detail with items and participants
    meId?: string;
}

export function SettlementDetailDialog({ open, onOpenChange, settlement, meId }: SettlementDetailDialogProps) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');

    if (!settlement) return null;

    // --- Smart Settlement Logic ---
    const calculateTransfers = () => {
        const balances: Record<string, number> = {};
        const memberNames: Record<string, string> = {};

        // 1. Initialize
        settlement.items.forEach((item: any) => {
            // Register Payer
            if (item.payerId) {
                balances[item.payerId] = (balances[item.payerId] || 0) + item.amount;
                // If payer relation exists (which we added), use it. Fallback to participant search.
                if (item.payer?.name) {
                    memberNames[item.payerId] = item.payer.name;
                }
            }

            // Register Attendees
            const count = item.participants.length;
            if (count > 0) {
                const costPerPerson = Math.ceil((item.amount / count) / 10) * 10;
                item.participants.forEach((p: any) => {
                    balances[p.memberId] = (balances[p.memberId] || 0) - costPerPerson;
                    if (p.member?.name) memberNames[p.memberId] = p.member.name;
                });
            }
        });

        // 2. Separate Debtors and Creditors
        let debtors = Object.entries(balances)
            .filter(([_, bal]) => bal < -10) // Tolerance for rounding errors
            .map(([id, bal]) => ({ id, amount: -bal })) // Amount they OWE (positive value)
            .sort((a, b) => b.amount - a.amount);

        let creditors = Object.entries(balances)
            .filter(([_, bal]) => bal > 10)
            .map(([id, bal]) => ({ id, amount: bal })) // Amount they GET
            .sort((a, b) => b.amount - a.amount);

        const transfers: Array<{
            fromId: string;
            fromName: string;
            toId: string;
            toName: string;
            amount: number;
        }> = [];

        // 3. Match (Greedy)
        let i = 0;
        let j = 0;

        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const amount = Math.min(debtor.amount, creditor.amount);

            if (amount > 0) {
                transfers.push({
                    fromId: debtor.id,
                    fromName: memberNames[debtor.id] || "알 수 없음",
                    toId: creditor.id,
                    toName: memberNames[creditor.id] || "알 수 없음",
                    amount: amount
                });
            }

            debtor.amount -= amount;
            creditor.amount -= amount;

            if (debtor.amount < 10) i++;
            if (creditor.amount < 10) j++;
        }

        return transfers;
    };

    const allTransfers = calculateTransfers();
    const myTransfers = allTransfers.filter(t => t.fromId === meId || t.toId === meId);

    // Total spent (for 'All' tab)
    const totalAmount = settlement.items.reduce((sum: number, item: any) => sum + item.amount, 0);

    const handleCopyAccount = () => {
        if (!settlement.accountBank && !settlement.accountNumber) return;
        const text = `${settlement.accountBank} ${settlement.accountNumber}`;
        navigator.clipboard.writeText(text);
        toast({ title: "계좌번호가 복사되었습니다" });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-sm max-h-[90vh] overflow-y-auto p-0 gap-0">
                {/* Header Receipt Style */}
                <div className="bg-white text-black p-6 rounded-t-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-[linear-gradient(45deg,transparent,transparent,2px,#0f0f0f,4px)] opacity-10"></div>

                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-black/5 mb-3">
                            <LucidePiggyBank className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-black mb-1">{settlement.title}</h2>
                        <p className="text-xs text-black/40 font-bold uppercase tracking-widest">
                            {format(new Date(settlement.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
                        </p>
                    </div>

                    <div className="flex bg-black/5 rounded-xl p-1 mb-6">
                        <button
                            className={cn(
                                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                                activeTab === 'my' ? "bg-white shadow-sm text-black" : "text-black/40"
                            )}
                            onClick={() => setActiveTab('my')}
                        >
                            내 정산
                        </button>
                        <button
                            className={cn(
                                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                                activeTab === 'all' ? "bg-white shadow-sm text-black" : "text-black/40"
                            )}
                            onClick={() => setActiveTab('all')}
                        >
                            전체 내역
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'my' ? (
                            <motion.div
                                key="my"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="text-center"
                            >
                                {myTransfers.length > 0 ? (
                                    <div className="space-y-4">
                                        {myTransfers.map((t, idx) => {
                                            const isSending = t.fromId === meId;
                                            return (
                                                <div key={idx} className="bg-black/5 p-4 rounded-xl">
                                                    <p className="text-xs font-bold text-black/40 mb-1">
                                                        {isSending ? `에게 보낼 금액` : `에게 받을 금액`}
                                                    </p>
                                                    <div className="flex items-center justify-center gap-2 mb-2">
                                                        <span className="font-bold text-lg">{isSending ? t.toName : t.fromName}</span>
                                                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", isSending ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600")}>
                                                            {isSending ? "송금" : "입금"}
                                                        </span>
                                                    </div>
                                                    <div className="text-3xl font-black tracking-tighter">
                                                        {t.amount.toLocaleString()}
                                                        <span className="text-lg font-bold text-black/40 ml-1">원</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="py-8">
                                        <LucideCheckCircle2 className="w-12 h-12 text-[#22c55e] mx-auto mb-3" />
                                        <p className="font-bold text-lg">정산 완료!</p>
                                        <p className="text-xs text-black/40">주고 받을 돈이 없습니다.</p>
                                    </div>
                                )}

                                {(settlement.accountBank || settlement.accountNumber) && (
                                    <div
                                        onClick={handleCopyAccount}
                                        className="flex items-center justify-between bg-black/5 p-4 rounded-xl cursor-pointer active:scale-95 transition-transform mt-4"
                                    >
                                        <div className="text-left">
                                            <div className="text-[10px] font-bold text-black/40 mb-0.5">총무 계좌 (참고용)</div>
                                            <div className="font-bold text-sm flex items-center gap-1.5">
                                                <span>{settlement.accountBank}</span>
                                                <span className="tabular-nums tracking-tight">{settlement.accountNumber}</span>
                                                {settlement.accountHolder && <span className="text-black/60 font-medium ml-1">({settlement.accountHolder})</span>}
                                            </div>
                                        </div>
                                        <LucideCopy className="w-4 h-4 text-black/40" />
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="all"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <div className="flex justify-between items-end border-b border-black/10 pb-4">
                                    <span className="font-bold text-sm">총 지출 금액</span>
                                    <span className="font-black text-xl">{totalAmount.toLocaleString()}원</span>
                                </div>
                                <div className="space-y-3">
                                    {settlement.items.map((item: any) => (
                                        <div key={item.id} className="text-sm border-b border-dashed border-black/10 pb-3 last:border-0">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-bold">{item.title}</span>
                                                <span className="font-bold">{item.amount.toLocaleString()}원</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-black/50">
                                                <div className="flex items-center gap-1">
                                                    <span className="bg-black text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        {item.payer?.name || "결제자"} 결제
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <LucideUsers className="w-3 h-3" />
                                                    <span>{item.participants.length}명 (인당 {Math.ceil((item.amount / item.participants.length) / 10) * 10}원)</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 pt-4 border-t-2 border-black">
                                    <p className="text-xs font-bold text-black/40 mb-3 uppercase tracking-widest text-center">전체 송금 리스트</p>
                                    <div className="space-y-2">
                                        {allTransfers.map((t, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs bg-black/5 px-3 py-2 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{t.fromName}</span>
                                                    <LucideChevronRight className="w-3 h-3 text-black/30" />
                                                    <span className="font-bold">{t.toName}</span>
                                                </div>
                                                <span className="font-black tabular-nums">{t.amount.toLocaleString()}원</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Receipt Jagged Edge Bottom */}
                    <div className="absolute bottom-0 left-0 w-full h-3 bg-[#0f0f0f] [clip-path:polygon(0%_0%,5%_100%,10%_0%,15%_100%,20%_0%,25%_100%,30%_0%,35%_100%,40%_0%,45%_100%,50%_0%,55%_100%,60%_0%,65%_100%,70%_0%,75%_100%,80%_0%,85%_100%,90%_0%,95%_100%,100%_0%)]"></div>
                </div>

                <div className="p-6">
                    <Button className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-black h-14 text-lg font-bold rounded-xl" onClick={() => onOpenChange(false)}>
                        확인
                    </Button>
                </div>

            </DialogContent>
        </Dialog>
    );
}
