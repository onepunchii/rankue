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
import { useT } from '@/lib/i18n';

interface ClubSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crew: any;
    members?: CrewMember[];
    me: any;
}

export function ClubSettingsDialog({ open, onOpenChange, crew, members: initialMembers, me }: ClubSettingsDialogProps) {
    const { t } = useT();
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
    // 정보 수정은 리더+매니저 (서버 PATCH 정책과 일치, 오너 확정 2026-08-05). 크루 폐쇄만 리더 전용.
    const canEdit = isLeader || myMemberInfo?.role === 'manage';
    const pendingMembers = members.filter((m) => m.role === 'pending');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] rounded-card text-[rgba(0,0,0,0.87)] max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 custom-scrollbar">
                <div className="p-5 pb-0">
                    <DialogHeader className="mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-tile flex items-center justify-center border bg-brand/10 border-brand/20 transition-colors">
                                <LucideSettings2 className="w-5 h-5 text-brand" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <DialogTitle className="text-lg font-bold text-[rgba(0,0,0,0.87)] leading-none">{t("clubSettings.title")}</DialogTitle>
                                <DialogDescription className="text-xs font-medium text-black/55 leading-none">
                                    {t("clubSettings.description")}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 bg-surface-3 p-1 mb-5 rounded-tile h-10 relative overflow-hidden">
                            <TabsTrigger
                                value="general"
                                className="rounded-lg h-full text-xs font-semibold text-black/55 transition-colors z-10 data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideSettings2 className="w-3.5 h-3.5 mr-1" />
                                {t("clubSettings.tabGeneral")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="template"
                                className="rounded-lg h-full text-xs font-semibold text-black/55 transition-colors z-10 data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideFileText className="w-3.5 h-3.5 mr-1" />
                                {t("clubSettings.tabTemplate")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="members"
                                className="rounded-lg h-full text-xs font-semibold text-black/55 transition-colors z-10 relative data-[state=active]:text-brand-fg data-[state=active]:bg-brand"
                            >
                                <LucideUsers2 className="w-3.5 h-3.5 mr-1" />
                                {t("clubSettings.tabMembers")}
                                {pendingMembers.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold tabular-nums border-2 border-white">
                                        {pendingMembers.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="focus-visible:outline-none outline-none border-none">
                            <ClubGeneralTab
                                crew={crew}
                                isLeader={isLeader}
                                canEdit={canEdit}
                                onUpdate={(data) => updateCrew.mutate(data)}
                                onDelete={() => deleteCrew.mutate()}
                                isUpdating={updateCrew.isPending}
                                isDeleting={deleteCrew.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="template" className="focus-visible:outline-none outline-none border-none">
                            {/* 가입 질문 편집도 리더+매니저 (prop 이름만 isLeader로 남음) */}
                            <ClubIntroTemplateTab
                                crew={crew}
                                isLeader={canEdit}
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
