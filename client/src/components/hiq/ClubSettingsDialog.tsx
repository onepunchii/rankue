import { LucideSettings2, LucideUsers2 } from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CrewMember } from '@/types/crew';
import { useClubSettings } from '@/hooks/useClubSettings';
import { ClubGeneralTab } from './club-settings/ClubGeneralTab';
import { ClubMemberTab } from './club-settings/ClubMemberTab';

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
            <DialogContent className="bg-[#121212] border-white/5 text-white max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 custom-scrollbar shadow-2xl">
                <div className="p-5 pb-0">
                    <DialogHeader className="mb-4">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm transition-colors",
                                crew?.sportCategory === "GOLF" ? "bg-[#84cc16]/10 border-[#84cc16]/20" : "bg-[#10b981]/10 border-[#10b981]/20"
                            )}>
                                <LucideSettings2 className={cn("w-5 h-5", crew?.sportCategory === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]")} />
                            </div>
                            <div className="flex flex-col">
                                <DialogTitle className="text-lg font-bold text-white tracking-tight leading-none">크루 관리</DialogTitle>
                                <DialogDescription className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1 leading-none">
                                    Crew Center
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-white/[0.03] border border-white/5 p-1 mb-5 rounded-xl h-10 relative overflow-hidden">
                            <TabsTrigger
                                value="general"
                                className={cn(
                                    "rounded-lg h-full text-[11px] font-bold uppercase tracking-wider transition-all duration-300 z-10",
                                    "data-[state=active]:text-black",
                                    crew?.sportCategory === "GOLF" ? "data-[state=active]:bg-[#84cc16]" : "data-[state=active]:bg-[#10b981]"
                                )}
                            >
                                <LucideSettings2 className="w-3.5 h-3.5 mr-1.5" />
                                기본 정보
                            </TabsTrigger>
                            <TabsTrigger
                                value="members"
                                className={cn(
                                    "rounded-lg h-full text-[11px] font-bold uppercase tracking-wider transition-all duration-300 z-10 relative",
                                    "data-[state=active]:text-black",
                                    crew?.sportCategory === "GOLF" ? "data-[state=active]:bg-[#84cc16]" : "data-[state=active]:bg-[#10b981]"
                                )}
                            >
                                <LucideUsers2 className="w-3.5 h-3.5 mr-1.5" />
                                멤버 관리
                                {pendingMembers.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold border-2 border-[#121212]">
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

                        <TabsContent value="members" className="focus-visible:outline-none outline-none border-none">
                            <ClubMemberTab
                                crew={crew}
                                members={members}
                                me={me}
                                onUpdateRole={(memberId, role) => updateRole.mutate({ memberId, role })}
                                onKick={(id) => kickMember.mutate(id)}
                                onApprove={(id) => approveMember.mutate(id)}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog >
    );
}
