import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LucideUser, LucideX, LucideChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CreateSettlementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    members: any[]; // Crew members
    me?: HiqMember; // Current user for default account info
    onSubmit: (data: any) => void;
    isPending: boolean;
}

export function CreateSettlementDialog({ open, onOpenChange, crewId, members, me, onSubmit, isPending }: CreateSettlementDialogProps) {
    const [title, setTitle] = useState(`${new Date().getMonth() + 1}/${new Date().getDate()} 모임 정산`);
    const [accountBank, setAccountBank] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");

    // Initialize with default account info
    useEffect(() => {
        if (open && me) {
            if (me.defaultAccountBank) setAccountBank(me.defaultAccountBank);
            if (me.defaultAccountNumber) setAccountNumber(me.defaultAccountNumber);
            if (me.defaultAccountHolder) setAccountHolder(me.defaultAccountHolder);
        }
    }, [open, me]);

    // Rounds: [{ id: 1, title: '1차', amount: 0, payerId: '...', participants: ['id1', 'id2'] }]
    const [rounds, setRounds] = useState<any[]>([
        { id: 1, title: "1차", amount: "", payerId: "", participants: members.map(m => m.member.id) }
    ]);

    const activeMembers = members.filter(m => m.role !== 'pending');

    const handleAddRound = () => {
        const nextId = rounds.length + 1;
        setRounds([...rounds, {
            id: nextId,
            title: `${nextId}차`,
            amount: "",
            payerId: "", // Default empty, user selects
            participants: members.map(m => m.member.id) // Default all
        }]);
    };

    const handleRoundChange = (id: number, field: string, value: any) => {
        setRounds(rounds.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const toggleParticipant = (roundId: number, memberId: string) => {
        setRounds(rounds.map(r => {
            if (r.id !== roundId) return r;
            const newParticipants = r.participants.includes(memberId)
                ? r.participants.filter((id: string) => id !== memberId)
                : [...r.participants, memberId];
            return { ...r, participants: newParticipants };
        }));
    };

    const handleSubmit = () => {
        const payload = {
            title,
            accountBank,
            accountNumber,
            accountHolder,
            items: rounds.map((r, idx) => ({
                roundOrder: idx + 1,
                title: r.title,
                amount: Number(r.amount),
                payerId: r.payerId || activeMembers[0]?.member.id // Fallback to first if empty
            })),
            participants: rounds.flatMap((r, idx) => r.participants.map((mid: string) => ({
                roundOrder: idx + 1,
                memberId: mid
            }))),
            sendToChat: true
        };
        onSubmit(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                <div className="shrink-0 bg-[#1a1a1a] border-b border-white/5 p-4 flex items-center justify-between z-10">
                    <h2 className="font-bold text-lg">새 정산 만들기</h2>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40" onClick={() => onOpenChange(false)}>
                        <LucideX className="w-5 h-5" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-white/40 uppercase">정산 제목</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-black/20 border-white/10 h-12 font-bold"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2 col-span-1">
                                <Label className="text-xs font-bold text-white/40 uppercase">은행</Label>
                                <Input
                                    value={accountBank}
                                    onChange={(e) => setAccountBank(e.target.value)}
                                    placeholder="은행명"
                                    className="bg-black/20 border-white/10 h-12 text-base"
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label className="text-xs font-bold text-white/40 uppercase">계좌번호</Label>
                                <Input
                                    value={accountNumber}
                                    onChange={(e) => setAccountNumber(e.target.value)}
                                    placeholder="- 없이 입력"
                                    className="bg-black/20 border-white/10 h-12 text-base"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-white/40 uppercase">예금주</Label>
                            <Input
                                value={accountHolder}
                                onChange={(e) => setAccountHolder(e.target.value)}
                                placeholder="예금주명"
                                className="bg-black/20 border-white/10 h-12 text-base"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/5 my-2" />

                    {/* Rounds */}
                    <div className="space-y-6">
                        {rounds.map((round, index) => (
                            <div key={round.id} className="relative bg-white/5 rounded-2xl p-4 border border-white/5">
                                <div className="absolute top-4 right-4 text-xs font-bold text-[#22c55e] bg-[#22c55e]/10 px-2 py-1 rounded-full">
                                    STEP {index + 1}
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-white/40 uppercase">차수 이름</Label>
                                        <Input
                                            value={round.title}
                                            onChange={(e) => handleRoundChange(round.id, 'title', e.target.value)}
                                            className="bg-black/20 border-white/10 h-12 text-base font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-white/40 uppercase">결제 금액</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={round.amount}
                                                onChange={(e) => handleRoundChange(round.id, 'amount', e.target.value)}
                                                placeholder="0"
                                                className="bg-black/20 border-white/10 h-12 text-lg font-bold pl-4 pr-8"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40">원</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-white/40 uppercase">계산한 사람</Label>
                                        <div className="relative">
                                            <select
                                                className="w-full h-12 bg-black/20 border border-white/10 rounded-md pl-3 pr-10 text-base font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#22c55e] appearance-none"
                                                value={round.payerId}
                                                onChange={(e) => handleRoundChange(round.id, 'payerId', e.target.value)}
                                                aria-label="Payer select"
                                            >
                                                <option value="" disabled className="text-black bg-white text-base">선택하세요</option>
                                                {activeMembers.map(m => (
                                                    <option key={m.member.id} value={m.member.id} className="text-black bg-white text-base">
                                                        {m.member.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <LucideChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-white/40 uppercase">참석자 ({round.participants.length})</Label>
                                            <button
                                                className="text-[10px] text-[#22c55e] font-bold"
                                                onClick={() => {
                                                    const allIds = activeMembers.map(m => m.member.id);
                                                    handleRoundChange(round.id, 'participants',
                                                        round.participants.length === allIds.length ? [] : allIds
                                                    );
                                                }}
                                            >
                                                {round.participants.length === activeMembers.length ? "전체 해제" : "전체 선택"}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {activeMembers.map(m => {
                                                const isSelected = round.participants.includes(m.member.id);
                                                return (
                                                    <button
                                                        key={m.member.id}
                                                        onClick={() => toggleParticipant(round.id, m.member.id)}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                                                            isSelected
                                                                ? "bg-[#22c55e] border-[#22c55e] text-black"
                                                                : "bg-transparent border-white/10 text-white/40 hover:border-white/20"
                                                        )}
                                                    >
                                                        {m.member.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        variant="outline"
                        className="w-full border-dashed border-white/20 h-12 text-white/40 hover:text-white hover:bg-white/5"
                        onClick={handleAddRound}
                    >
                        + 차수 추가하기 (2차, 3차...)
                    </Button>
                </div>

                <div className="shrink-0 p-4 bg-[#1a1a1a] border-t border-white/10 z-20">
                    <Button
                        className="w-full h-14 bg-[#22c55e] hover:bg-[#16a34a] text-black text-lg font-bold rounded-xl"
                        onClick={handleSubmit}
                        disabled={isPending}
                    >
                        {isPending ? "생성 중..." : "정산 등록 및 채팅방 전송"}
                    </Button>
                </div>

            </DialogContent>
        </Dialog>
    );
}
