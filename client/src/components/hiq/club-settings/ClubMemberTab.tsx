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
    onUpdateRole: (memberId: string, role: string) => Promise<any> | void;
    onKick: (memberId: string) => Promise<any> | void;
    onApprove: (memberId: string) => Promise<any> | void;
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
        } catch {
            /* surfaced via mutation onError toast */
        } finally {
            setProcessingMemberId(null);
        }
    };

    const themeColor = 'text-brand';
    const themeBg = 'bg-brand';

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
                            <h3 className={cn("text-xs font-semibold", themeColor)}>
                                가입 대기 ({pendingMembers.length})
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
                                                className="h-10 w-10 p-0 text-white/55 hover:text-red-400 hover:bg-red-400/10 rounded-tile"
                                                onClick={() => handleAction(m.member.id, () => onKick(m.member.id))}
                                            >
                                                <LucideUserX className="w-5 h-5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={processingMemberId === m.member.id}
                                                className={cn("h-10 w-10 p-0 text-brand-fg rounded-tile transition-colors", themeBg)}
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
                <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/25" />
                    <h3 className="text-xs font-semibold text-white/55">
                        활동 중인 멤버 ({activeMembers.length})
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
                                                    "h-9 px-4 text-xs font-semibold rounded-tile transition-colors border border-surface-line",
                                                    m.role === 'manage' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
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
                                                className="h-10 w-10 p-0 text-white/55 hover:text-red-400 hover:bg-red-400/10 rounded-tile"
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
                <AlertDialogContent className="bg-[#141416] border-white/10 text-white rounded-card">
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
    const themeText = 'text-brand';

    return (
        <motion.div
            layout
            className="flex items-center justify-between p-4 rounded-tile bg-surface-2 border border-surface-line hover:bg-surface-3 hover:border-brand/20 transition-colors group"
        >
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-tile bg-white/5 border border-surface-line flex items-center justify-center text-sm font-medium text-white/55 overflow-hidden">
                    {member.member.profileImageUrl ? (
                        <img src={member.member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        member.member.nickname?.[0]
                    )}
                </div>

                <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                        <span className={cn(isMe ? themeText : "text-white/90")}>
                            {member.member.nickname}
                        </span>
                        {member.role === 'leader' && <RoleBadge icon={LucideCrown} color="text-yellow-500" label="크루장" />}
                        {member.role === 'manage' && <RoleBadge icon={LucideShield} color="text-blue-400" label="운영진" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="px-2 py-0.5 rounded-lg bg-white/5 text-xs font-medium text-white/55 tabular-nums">
                            {crew.sportCategory === "GOLF" ? `핸디 ${(member.member.golfAvgScore || 0).toFixed(1)}` : `평균 ${(member.member.avg4c || 0).toFixed(1)}`}
                        </div>
                        {isMe && <span className={cn("text-xs font-semibold", themeText)}>나</span>}
                    </div>
                </div>
            </div>

            <div className="md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                {action}
            </div>
        </motion.div>
    );
}

const RoleBadge = ({ icon: Icon, color, label }: any) => (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-surface-line rounded-lg", color)}>
        <Icon className="w-3 h-3 fill-current" />
        <span className="text-xs font-semibold">{label}</span>
    </div>
);

