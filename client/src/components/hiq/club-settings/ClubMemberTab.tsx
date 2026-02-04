import { useState, useMemo } from 'react';
import { LucideCrown, LucideShield, LucideUserX, LucideCheck, LucideLoader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CrewMember, CrewData } from '@/types/crew';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClubMemberTabProps {
    crew: CrewData;
    members: CrewMember[];
    me: any;
    onUpdateRole: (memberId: string, role: string) => void;
    onKick: (memberId: string) => void;
    onApprove: (memberId: string) => void;
}

export function ClubMemberTab({ crew, members, me, onUpdateRole, onKick, onApprove }: ClubMemberTabProps) {
    const [processingMemberId, setProcessingMemberId] = useState<string | null>(null);
    const [kickConfirmId, setKickConfirmId] = useState<string | null>(null);

    const pendingMembers = useMemo(() => members.filter(m => m.role === 'pending'), [members]);
    const activeMembers = useMemo(() => {
        return members
            .filter(m => m.role !== 'pending')
            .sort((a, b) => {
                const order = { leader: 0, manage: 1, member: 2, pending: 3 };
                return order[a.role as keyof typeof order] - order[b.role as keyof typeof order];
            });
    }, [members]);

    const myMemberInfo = useMemo(() => members.find(m => m.member.id === me?.id), [members, me]);
    const isLeader = myMemberInfo?.role === 'leader';
    const amIManager = myMemberInfo?.role === 'manage';

    const handleAction = async (memberId: string, action: () => Promise<any> | void) => {
        setProcessingMemberId(memberId);
        try {
            await action();
        } finally {
            setProcessingMemberId(null);
        }
    };

    const themeColor = crew.sportCategory === 'GOLF' ? 'text-[#84cc16]' : 'text-[#10b981]';
    const themeBg = crew.sportCategory === 'GOLF' ? 'bg-[#84cc16]' : 'bg-[#10b981]';

    return (
        <div className="space-y-8 pb-10 pt-2">
            <AnimatePresence>
                {pendingMembers.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4"
                    >
                        <div className="flex items-center gap-2 px-1">
                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", themeBg)} />
                            <h3 className={cn("text-[10px] font-black uppercase tracking-[0.2em]", themeColor)}>
                                Pending Requests ({pendingMembers.length})
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {pendingMembers.map((m) => (
                                <MemberItem
                                    key={m.member.id}
                                    member={m}
                                    crew={crew}
                                    action={
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={processingMemberId === m.member.id}
                                                className="h-10 w-10 p-0 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                                                onClick={() => handleAction(m.member.id, () => onKick(m.member.id))}
                                            >
                                                <LucideUserX className="w-5 h-5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={processingMemberId === m.member.id}
                                                className={cn("h-10 w-10 p-0 text-black rounded-xl shadow-lg transition-all", themeBg)}
                                                onClick={() => handleAction(m.member.id, () => onApprove(m.member.id))}
                                            >
                                                {processingMemberId === m.member.id ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : <LucideCheck className="w-5 h-5" />}
                                            </Button>
                                        </div>
                                    }
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-5">
                <div className="px-1">
                    <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                        Active Members ({activeMembers.length})
                    </h3>
                </div>
                <div className="space-y-3">
                    {activeMembers.map((m) => {
                        const isTargetMe = m.member.id === me?.id;
                        const canKick = !isTargetMe && (
                            (isLeader && m.role !== 'leader') ||
                            (amIManager && m.role === 'member')
                        );

                        return (
                            <MemberItem
                                key={m.member.id}
                                member={m}
                                crew={crew}
                                isMe={isTargetMe}
                                action={
                                    <div className="flex items-center gap-2">
                                        {isLeader && !isTargetMe && (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={processingMemberId === m.member.id}
                                                className={cn(
                                                    "h-9 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-white/5",
                                                    m.role === 'manage' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                                                )}
                                                onClick={() => {
                                                    const newRole = m.role === 'manage' ? 'member' : 'manage';
                                                    handleAction(m.member.id, () => onUpdateRole(m.member.id, newRole));
                                                }}
                                            >
                                                {processingMemberId === m.member.id ? <LucideLoader2 className="w-3.5 h-3.5 animate-spin" /> : (m.role === 'manage' ? "권한 해제" : "운영진 임명")}
                                            </Button>
                                        )}
                                        {canKick && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={processingMemberId === m.member.id}
                                                className="h-10 w-10 p-0 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                                                onClick={() => setKickConfirmId(m.member.id)}
                                            >
                                                <LucideUserX className="w-5 h-5" />
                                            </Button>
                                        )}
                                    </div>
                                }
                            />
                        );
                    })}
                </div>
            </div>

            <AlertDialog open={!!kickConfirmId} onOpenChange={(open) => !open && setKickConfirmId(null)}>
                <AlertDialogContent className="bg-[#121212] border-white/10 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>멤버 내보내기</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/60">
                            정말로 이 멤버를 크루에서 내보내시겠습니까?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">취소</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => kickConfirmId && handleAction(kickConfirmId, () => onKick(kickConfirmId))}
                            className="bg-red-500 text-white hover:bg-red-600"
                        >
                            확인
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function MemberItem({ member, crew, isMe, action }: { member: CrewMember, crew: CrewData, isMe?: boolean, action?: React.ReactNode }) {
    const themeHoverBorder = crew.sportCategory === 'GOLF' ? 'hover:border-[#84cc16]/20' : 'hover:border-[#10b981]/20';
    const themeText = crew.sportCategory === 'GOLF' ? 'text-[#84cc16]' : 'text-[#10b981]';

    return (
        <motion.div
            layout
            className={cn(
                "flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all duration-500 group",
                themeHoverBorder
            )}
        >
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-black text-white/30 overflow-hidden shadow-sm shadow-black/40">
                    {member.member.profileImageUrl ? (
                        <img src={member.member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        member.member.nickname?.[0]
                    )}
                </div>

                <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                        <span className={cn("tracking-tight", isMe ? themeText : "text-white/90")}>
                            {member.member.nickname}
                        </span>
                        {member.role === 'leader' && <RoleBadge icon={LucideCrown} color="text-yellow-500" label="크루장" />}
                        {member.role === 'manage' && <RoleBadge icon={LucideShield} color="text-blue-400" label="부크루장" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="px-2 py-0.5 rounded-lg bg-white/5 text-[9px] font-black text-white/30 uppercase tracking-[0.1em]">
                            {crew.sportCategory === "GOLF" ? `H ${member.member.golfHandicap || 0}` : `AVG ${(member.member.avg4c || 0).toFixed(1)}`}
                        </div>
                        {isMe && <span className={cn("text-[9px] font-black uppercase tracking-widest", themeText)}>YOU</span>}
                    </div>
                </div>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                {action}
            </div>
        </motion.div>
    );
}

const RoleBadge = ({ icon: Icon, color, label }: any) => (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg", color)}>
        <Icon className="w-2.5 h-2.5 fill-current" />
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </div>
);

