import { useState, useMemo } from 'react';
import { LucideCrown, LucideShield, LucideUserX, LucideCheck, LucideLoader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CrewMember, CrewData } from '@/types/crew';
import { useT } from "@/lib/i18n";
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
    const { t } = useT();
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
                                {t("clubMemberTab.pendingTitle")} ({pendingMembers.length})
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
                                                className="h-10 w-10 p-0 text-black/55 hover:text-red-500 hover:bg-red-500/10 rounded-tile"
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
                    <div className="w-1.5 h-1.5 rounded-full bg-black/25" />
                    <h3 className="text-xs font-semibold text-black/55">
                        {t("clubMemberTab.activeTitle")} ({activeMembers.length})
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
                                                    "h-9 px-4 text-xs font-semibold rounded-tile transition-colors ",
                                                    m.role === 'manage' ? "bg-brand/10 text-brand border-brand/20 hover:bg-brand/15" : "bg-black/[0.04] text-black/55 hover:bg-black/[0.06] hover:text-[rgba(0,0,0,0.87)]"
                                                )}
                                                onClick={() => {
                                                    const newRole = m.role === 'manage' ? 'member' : 'manage';
                                                    handleAction(m.member.id, () => onUpdateRole(m.member.id, newRole));
                                                }}
                                            >
                                                {processingMemberId === m.member.id ? <LucideLoader2 className="w-3.5 h-3.5 animate-spin" /> : (m.role === 'manage' ? t("clubMemberTab.demote") : t("clubMemberTab.appointManager"))}
                                            </Button>
                                        )}
                                        {canKick && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={processingMemberId === m.member.id}
                                                className="h-10 w-10 p-0 text-black/55 hover:text-red-500 hover:bg-red-500/10 rounded-tile"
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
                <AlertDialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-card">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("clubMemberTab.kickTitle")}</AlertDialogTitle>
                        <AlertDialogDescription className="text-black/60">
                            {t("clubMemberTab.kickConfirm")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06]">{t("clubMemberTab.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => kickConfirmId && handleAction(kickConfirmId, () => onKick(kickConfirmId))}
                            className="bg-red-500 text-white hover:bg-red-600"
                        >
                            {t("clubMemberTab.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function MemberItem({ member, crew, isMe, action }: { member: CrewMember, crew: CrewData, isMe?: boolean, action?: React.ReactNode }) {
    const { t } = useT();
    const themeText = 'text-brand';

    return (
        <motion.div
            layout
            className="flex items-center justify-between p-4 rounded-tile bg-surface-2 hover:bg-surface-3 hover:border-brand/20 transition-colors group"
        >
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-tile bg-black/[0.04] flex items-center justify-center text-sm font-medium text-black/55 overflow-hidden">
                    {member.member.profileImageUrl ? (
                        <img src={member.member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        member.member.nickname?.[0]
                    )}
                </div>

                <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                        <span className={cn(isMe ? themeText : "text-[rgba(0,0,0,0.87)]")}>
                            {member.member.nickname}
                        </span>
                        {member.role === 'leader' && <RoleBadge icon={LucideCrown} color="text-[#cba258]" label={t("clubMemberTab.leaderBadge")} />}
                        {member.role === 'manage' && <RoleBadge icon={LucideShield} color="text-brand" label={t("clubMemberTab.managerBadge")} />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="px-2 py-0.5 rounded-lg bg-black/[0.04] text-xs font-medium text-black/55 tabular-nums">
                            {crew.sportCategory === "GOLF" ? `${t("clubMemberTab.handicapPrefix")} ${(member.member.golfAvgScore || 0).toFixed(1)}` : `${t("clubMemberTab.avgPrefix")} ${(member.member.avg4c || 0).toFixed(1)}`}
                        </div>
                        {isMe && <span className={cn("text-xs font-semibold", themeText)}>{t("clubMemberTab.me")}</span>}
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
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 bg-black/[0.04] rounded-lg", color)}>
        <Icon className="w-3 h-3 fill-current" />
        <span className="text-xs font-semibold">{label}</span>
    </div>
);

