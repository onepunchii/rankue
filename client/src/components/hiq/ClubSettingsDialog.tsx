import { LucideSettings2, LucideUsers2 } from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CrewMember } from '@/types/crew';
import { useClubSettings } from '@/hooks/useClubSettings';
import { ClubGeneralTab } from './club-settings/ClubGeneralTab';
import { ClubMemberTab } from './club-settings/ClubMemberTab';
import { ClubIntroTemplateTab } from './club-settings/ClubIntroTemplateTab';
import { LucideFileText } from 'lucide-react';

interface ClubSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crew: any;
    members?: CrewMember[];
    me: any;
}

export function ClubSettingsDialog({ open, onOpenChange, crew, members: initialMembers, me }: ClubSettingsDialogProps) {
    const {
        members,
        updateCrew,
        updateRole,
        approveMember,
        kickMember,
        deleteCrew
    } = useClubSettings(crew?.id, initialMembers);

    const myMemberInfo = members.find((m) => m.member.id === me?.id);
    const isLeader = myMemberInfo?.role === 'leader';
    const pendingMembers = members.filter((m) => m.role === 'pending');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#141416] border-white/10 rounded-card text-white max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 custom-scrollbar">
                <div className="p-5 pb-0">
                    <DialogHeader className="mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-tile flex items-center justify-center border bg-brand/10 border-brand/20 transition-colors">
                                <LucideSettings2 className="w-5 h-5 text-brand" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <DialogTitle className="text-lg font-bold text-white leading-none">크루 관리</DialogTitle>
                                <DialogDescription className="text-xs font-medium text-white/55 leading-none">
                                    크루 정보와 멤버를 관리합니다
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 bg-surface-2 border border-surface-line p-1 mb-5 rounded-tile h-10 relative overflow-hidden">
                            <TabsTrigger
                                value="general"
                                className="rounded-lg h-full text-xs font-semibold transition-colors z-10 data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideSettings2 className="w-3.5 h-3.5 mr-1" />
                                정보
                            </TabsTrigger>
                            <TabsTrigger
                                value="template"
                                className="rounded-lg h-full text-xs font-semibold transition-colors z-10 data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideFileText className="w-3.5 h-3.5 mr-1" />
                                양식
                            </TabsTrigger>
                            <TabsTrigger
                                value="members"
                                className="rounded-lg h-full text-xs font-semibold transition-colors z-10 relative data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideUsers2 className="w-3.5 h-3.5 mr-1" />
                                멤버
                                {pendingMembers.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold tabular-nums border-2 border-[#141416]">
                                        {pendingMembers.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="focus-visible:outline-none outline-none border-none">
                            <ClubGeneralTab
                                crew={crew}
                                isLeader={isLeader}
                                onUpdate={(data) => updateCrew.mutate(data)}
                                onDelete={() => deleteCrew.mutate()}
                                isUpdating={updateCrew.isPending}
                                isDeleting={deleteCrew.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="template" className="focus-visible:outline-none outline-none border-none">
                            <ClubIntroTemplateTab
                                crew={crew}
                                isLeader={isLeader}
                                onUpdate={(data) => updateCrew.mutate(data)}
                                isUpdating={updateCrew.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="members" className="focus-visible:outline-none outline-none border-none">
                            <ClubMemberTab
                                crew={crew}
                                members={members}
                                me={me}
                                onUpdateRole={(memberId, role) => updateRole.mutateAsync({ memberId, role })}
                                onKick={(id) => kickMember.mutateAsync(id)}
                                onApprove={(id) => approveMember.mutateAsync(id)}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog >
    );
}
