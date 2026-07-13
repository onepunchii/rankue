import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HiqMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LucideUser, LucideX, LucideChevronDown, LucideCalendar, LucideUsers, LucideSettings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MemberSelectionDialog } from "./MemberSelectionDialog";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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

    // Pending applicants never attended, so they must not be seeded into any round's
    // participant set (they corrupt the per-person split). Declared before the useState
    // initializer that reads it to avoid a temporal-dead-zone ReferenceError.
    const activeMembers = members.filter(m => m.role !== 'pending');

    // Rounds: [{ id: 1, title: '1차', amount: 0, payerId: '...', participants: ['id1', 'id2'] }]
    const [rounds, setRounds] = useState<any[]>([
        { id: 1, title: "1차", amount: "", payerId: "", participants: activeMembers.map(m => m.member.id) }
    ]);
    const [isMemberSelectOpen, setIsMemberSelectOpen] = useState(false);
    const [activeRoundId, setActiveRoundId] = useState<number | null>(null);

    const { data: activities } = useQuery({
        queryKey: [`/api/hiq/crews/${crewId}/activities`],
        enabled: open && !!crewId,
    });

    const recentActivities = Array.isArray(activities)
        ? [...activities].sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()).slice(0, 5)
        : [];

    const handleImportActivity = (activityId: string, roundId: number) => {
        if (!Array.isArray(activities)) return;
        const activity = activities.find((a: any) => a.id === activityId);
        if (activity && activity.participants) {
            const participantIds = activity.participants.map((p: any) => p.memberId);
            setRounds(rounds.map(r => r.id === roundId ? { ...r, participants: participantIds } : r));
        }
    };

    const handleAddRound = () => {
        const nextId = rounds.length + 1;
        setRounds([...rounds, {
            id: nextId,
            title: `${nextId}차`,
            amount: "",
            payerId: "", // Default empty, user selects
            participants: activeMembers.map(m => m.member.id) // Default all active members
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
        // Guard against any non-active (e.g. pending) ids sneaking into a round's participant
        // set — via the "모임 가져오기" import path or a stale seed — before they reach the server.
        const activeIds = new Set(activeMembers.map(m => m.member.id));
        const sanitizedRounds = rounds.map(r => ({
            ...r,
            participants: r.participants.filter((mid: string) => activeIds.has(mid))
        }));
        const payload = {
            title,
            accountBank,
            accountNumber,
            accountHolder,
            items: sanitizedRounds.map((r, idx) => {
                // The payer must be one of the round's participants. If the selected payer was
                // removed from the participant set (e.g. via "모임 가져오기" or toggling members),
                // fall back to the first participant rather than an arbitrary non-participant.
                const payerId = (r.payerId && r.participants.includes(r.payerId))
                    ? r.payerId
                    : (r.participants[0] || activeMembers[0]?.member.id);
                return {
                    roundOrder: idx + 1,
                    title: r.title,
                    amount: Number(r.amount),
                    payerId
                };
            }),
            participants: sanitizedRounds.flatMap((r, idx) => r.participants.map((mid: string) => ({
                roundOrder: idx + 1,
                memberId: mid
            }))),
            sendToChat: true
        };
        onSubmit(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="bg-[#141416] border-white/10 text-white max-w-md max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden rounded-card">
                <div className="shrink-0 bg-[#141416] border-b border-white/5 p-4 flex items-center justify-between z-10">
                    <DialogTitle className="font-bold text-[19px] tracking-tight">새 정산 만들기</DialogTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/45" onClick={() => onOpenChange(false)}>
                        <LucideX className="w-5 h-5" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white/55">정산 제목</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-surface-2 border-surface-line h-12 rounded-tile font-bold"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2 col-span-1">
                                <Label className="text-xs font-semibold text-white/55">은행</Label>
                                <Input
                                    value={accountBank}
                                    onChange={(e) => setAccountBank(e.target.value)}
                                    placeholder="은행명"
                                    className="bg-surface-2 border-surface-line h-12 rounded-tile text-base"
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label className="text-xs font-semibold text-white/55">계좌번호</Label>
                                <Input
                                    value={accountNumber}
                                    onChange={(e) => setAccountNumber(e.target.value)}
                                    placeholder="- 없이 입력"
                                    className="bg-surface-2 border-surface-line h-12 rounded-tile text-base"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white/55">예금주</Label>
                            <Input
                                value={accountHolder}
                                onChange={(e) => setAccountHolder(e.target.value)}
                                placeholder="예금주명"
                                className="bg-surface-2 border-surface-line h-12 rounded-tile text-base"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/5 my-2" />

                    {/* Rounds */}
                    <div className="space-y-6">
                        {rounds.map((round, index) => (
                            <div key={round.id} className="relative rk-card-2 p-4">
                                <div className="absolute top-4 right-4 text-[12px] font-semibold text-brand bg-brand/12 px-2.5 py-1 rounded-full">
                                    {index + 1}단계
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-white/55">차수 이름</Label>
                                        <Input
                                            value={round.title}
                                            onChange={(e) => handleRoundChange(round.id, 'title', e.target.value)}
                                            className="bg-surface-2 border-surface-line h-12 rounded-tile text-base font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-white/55">결제 금액</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={round.amount}
                                                onChange={(e) => handleRoundChange(round.id, 'amount', e.target.value)}
                                                placeholder="0"
                                                className="bg-surface-2 border-surface-line h-12 rounded-tile text-lg font-bold pl-4 pr-8"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white/40">원</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center justify-between px-1">
                                            <Label className="text-xs font-semibold text-white/55">참석자 관리</Label>
                                            <div className="flex items-center gap-2">
                                                {recentActivities.length > 0 && (
                                                    <Select onValueChange={(val) => handleImportActivity(val, round.id)}>
                                                        <SelectTrigger className="h-8 bg-white/5 border-white/10 text-[12px] font-semibold text-brand px-3 rounded-full w-auto gap-1">
                                                            <LucideCalendar className="w-3 h-3" />
                                                            모임 가져오기
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-[#141416] border-white/10 text-white rounded-tile">
                                                            {recentActivities.map((act: any) => (
                                                                <SelectItem key={act.id} value={act.id} className="text-xs">
                                                                    {format(new Date(act.activityDate), "MM/dd")} {act.title}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setActiveRoundId(round.id);
                                                        setIsMemberSelectOpen(true);
                                                    }}
                                                    className="flex items-center gap-1 h-8 text-[12px] font-semibold text-white bg-white/10 px-3 rounded-full hover:bg-white/20 transition-colors"
                                                >
                                                    <LucideSettings2 className="w-3 h-3" />
                                                    멤버 편집
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            onClick={() => {
                                                setActiveRoundId(round.id);
                                                setIsMemberSelectOpen(true);
                                            }}
                                            className="bg-black/40 border border-white/5 rounded-tile p-4 flex items-center justify-between cursor-pointer hover:border-white/20 transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex -space-x-2">
                                                    {round.participants.slice(0, 5).map((mid: string) => {
                                                        const m = activeMembers.find(am => am.member.id === mid);
                                                        return (
                                                            <Avatar key={mid} className="w-8 h-8 border-2 border-[#202020]">
                                                                <AvatarImage src={m?.member.profileImageUrl} />
                                                                <AvatarFallback className="bg-[#333] text-[12px] font-semibold">{m?.member.name[0]}</AvatarFallback>
                                                            </Avatar>
                                                        );
                                                    })}
                                                    {round.participants.length > 5 && (
                                                        <div className="w-8 h-8 rounded-full bg-[#333] border-2 border-[#202020] flex items-center justify-center text-[12px] font-medium text-white/45 relative z-10">
                                                            +{round.participants.length - 5}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[15px] font-semibold text-white group-hover:text-brand transition-colors tabular-nums">
                                                        {round.participants.length}명 선택됨
                                                    </span>
                                                    <p className="text-[12px] text-white/55 font-medium">참석자 목록을 편집하려면 클릭하세요</p>
                                                </div>
                                            </div>
                                            <LucideChevronDown className="w-5 h-5 text-white/45 group-hover:text-white transition-colors" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-white/55">계산한 사람</Label>
                                        <Select
                                            value={round.payerId}
                                            onValueChange={(val) => handleRoundChange(round.id, 'payerId', val)}
                                        >
                                            <SelectTrigger
                                                aria-label="Payer select"
                                                className="w-full h-12 bg-surface-2 border-surface-line rounded-tile px-3 text-base font-bold text-white"
                                            >
                                                <SelectValue placeholder="선택하세요" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#141416] border-white/10 text-white rounded-tile">
                                                {activeMembers
                                                    .filter(m => round.participants.includes(m.member.id))
                                                    .map(m => (
                                                        <SelectItem key={m.member.id} value={m.member.id} className="text-base">
                                                            {m.member.name}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        variant="outline"
                        className="w-full border-dashed border-white/20 h-12 text-white/55 hover:text-white hover:bg-white/5 rounded-tile"
                        onClick={handleAddRound}
                    >
                        + 차수 추가하기 (2차, 3차...)
                    </Button>
                </div>

                {/* Member Selection Sub-modal */}
                <MemberSelectionDialog
                    open={isMemberSelectOpen}
                    onOpenChange={setIsMemberSelectOpen}
                    members={activeMembers}
                    selectedIds={rounds.find(r => r.id === activeRoundId)?.participants || []}
                    onConfirm={(selectedIds) => {
                        if (activeRoundId) {
                            handleRoundChange(activeRoundId, 'participants', selectedIds);
                        }
                    }}
                />

                <div className="shrink-0 p-4 bg-[#141416] border-t border-white/10 z-20">
                    <Button
                        className="w-full h-14 rk-btn-primary text-[16px] rounded-tile"
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
