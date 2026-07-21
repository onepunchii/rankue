import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { differenceInDays, startOfDay, format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
    LucidePlus, LucideChevronRight, LucideZap, LucideCrown,
    LucideRefreshCw, LucideX, LucideMessageCircle, LucideShare2,
    LucideMinus, LucidePencil, LucideTrash2, LucideCalendarDays
} from "@/lib/icons";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateTeams, getSportTerminology, SportType, GenderDist } from "@/lib/teamGenerator";
import { CreateActivityDialog } from "../CreateActivityDialog";
import { CreateGolfActivityModal } from "../club/activity/CreateGolfActivityModal";

interface ClubActivityListProps {
    crewId: string;
    isMember: boolean;
    currentMemberId?: string;
    sportType: SportType;
    onCreateClick: () => void;
    onShareToChat?: (message: string) => void;
    isAdmin?: boolean;
}

export function ClubActivityList({
    crewId,
    isMember,
    currentMemberId,
    sportType,
    onCreateClick,
    onShareToChat,
    isAdmin
}: ClubActivityListProps) {
    const { toast } = useToast();
    const { t } = useT();
    const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingActivity, setEditingActivity] = useState<any | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [teamData, setTeamData] = useState<Record<string, {
        step: 'setup' | 'result',
        count: number,
        genderDist: GenderDist,
        teams: any[],
        expandedTeamIndex?: number | null,
        manualInput: string,
        showManualInput: boolean
    }>>({});

    const terms = getSportTerminology(sportType);

    const { data: activities, isLoading, isError, refetch } = useQuery({
        queryKey: [`/api/hiq/crews/${crewId}/activities`],
        enabled: !!crewId,
    });

    const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const joinMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}/join`, {
                method: "POST"
            });
        },
        onSuccess: () => {
            toast({ title: t("clubActivityListView.joinSuccessTitle"), description: t("clubActivityListView.joinSuccessDesc") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: t("clubActivityListView.joinFailTitle"), description: err.message, variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: t("clubActivityListView.deleteSuccessTitle"), description: t("clubActivityListView.deleteSuccessDesc") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: t("clubActivityListView.deleteFailTitle"), description: err.message, variant: "destructive" });
        }
    });

    const leaveMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}/join`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: t("clubActivityListView.leaveSuccessTitle"), description: t("clubActivityListView.leaveSuccessDesc") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: t("clubActivityListView.leaveFailTitle"), description: err.message, variant: "destructive" });
        }
    });

    const startTeamSetup = (activityId: string) => {
        if (expandedActivityId === activityId) {
            setExpandedActivityId(null);
        } else {
            setExpandedActivityId(activityId);
            if (!teamData[activityId]) {
                setTeamData(prev => ({
                    ...prev,
                    [activityId]: {
                        step: 'setup',
                        count: sportType === 'GOLF' ? 4 : 2,
                        genderDist: 'spread',
                        teams: [],
                        manualInput: '',
                        showManualInput: false
                    }
                }));
            }
        }
    };

    const runGeneration = async (activityId: string, participants: any[], isRandom: boolean = false) => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const config = teamData[activityId];

            // Parse manual names
            const manualNames = config.manualInput
                .split(/[\n,\s]+/)
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .map((name, idx) => ({
                    id: `manual-${idx}`,
                    memberId: `manual-${idx}`,
                    isManual: true,
                    member: {
                        id: `manual-${idx}`,
                        name: name,
                        gender: name.includes('♀') || name.endsWith('여') || name.includes('(여)') ? 'F' : 'M',
                        golfAvgScore: 0,
                        avg4c: 0
                    }
                }));

            const combinedParticipants = [...participants, ...manualNames];

            const resultTeams = generateTeams(
                combinedParticipants,
                config.count,
                sportType,
                config.genderDist,
                isRandom
            );
            setTeamData(prev => ({
                ...prev,
                [activityId]: { ...prev[activityId], step: 'result', teams: resultTeams }
            }));
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) return <div className="text-center py-8 text-black/55">{t("clubActivityListView.loading")}</div>;

    const allActivities: any[] = Array.isArray(activities) ? activities : [];
    const filteredActivities = allActivities.filter(a => a.sportCategory === sportType || (!a.sportCategory && sportType === 'BILLIARDS'));

    return (
        <div className="space-y-4 pt-0 pb-6">
            {filteredActivities.map((activity: any) => {
                const isJoined = activity.participants?.some((p: any) => p.memberId === currentMemberId);
                const isFull = (activity.participants?.length || 0) >= (activity.maxParticipants || 8);
                const currentTeamData = teamData[activity.id];
                const isExpanded = expandedActivityId === activity.id;

                let femalesCount = activity.participants.filter((p: any) => p.member?.gender === 'F' || p.member?.gender === 'female').length;
                let malesCount = activity.participants.length - femalesCount;

                // Include manual input counts if available
                if (currentTeamData?.manualInput) {
                    const manualEntries = currentTeamData.manualInput.split(/[\n,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
                    const manualFemales = manualEntries.filter(s => s.includes('♀') || s.endsWith('여') || s.includes('(여)')).length;
                    femalesCount += manualFemales;
                    malesCount += (manualEntries.length - manualFemales);
                }

                const totalCount = malesCount + femalesCount;

                const diff = differenceInDays(startOfDay(new Date(activity.activityDate)), startOfDay(new Date()));
                const dDayText = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : t("clubActivityListView.ended");
                const dDayColor = diff === 0 ? "bg-red-500 text-white" : diff > 0 && diff <= 3 ? "bg-orange-500 text-white" : "bg-brand text-brand-fg";

                return (
                    <Card key={activity.id} className="rk-card overflow-hidden rounded-card group hover:border-brand/30 transition-colors">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("px-2 py-0.5 rounded-pill text-xs font-bold tabular-nums", dDayColor)}>
                                            {dDayText}
                                        </div>
                                        <h3 className="font-bold text-lg text-ink-1">{activity.title}</h3>

                                        {/* Admin Actions moved to bottom */}
                                    </div>
                                    <p className="text-xs text-ink-3 font-medium ml-0.5">{t("clubActivityListView.officialMeeting")}</p>
                                </div>
                                {isJoined && (
                                    <div className="flex items-center gap-1 text-xs font-semibold text-brand bg-brand/10 px-2 py-1 rounded-full border border-brand/20">
                                        <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                                        {t("clubActivityListView.joinedBadge")}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 mb-5 text-[13px]">
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">{t("clubActivityListView.dateLabel")}</div>
                                    <div className="font-medium text-ink-2">
                                        {format(new Date(activity.activityDate), t("clubActivityListView.dateTimeFormat"), { locale: ko })}
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-ink-3 mt-0.5">{t("clubActivityListView.locationLabel")}</div>
                                    <div className="font-medium text-ink-2">{activity.locationName || t("clubActivityListView.locationTbd")}</div>
                                </div>
                                {activity.cost && (
                                    <div className="flex items-center">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">{t("clubActivityListView.costLabel")}</div>
                                        <div className="font-medium text-ink-2 text-sm">{activity.cost}</div>
                                    </div>
                                )}
                                {activity.description && (
                                    <div className="flex items-start mt-1 pt-2 border-t border-surface-line">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3 mt-0.5">{t("clubActivityListView.memoLabel")}</div>
                                        <div className="font-medium text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                                            {activity.description}
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center w-full">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">{t("clubActivityListView.attendLabel")}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {(activity.participants || []).slice(0, 5).map((p: any, idx: number) => (
                                                    <Avatar key={idx} className="w-6 h-6 border-2 border-surface-1 transition-transform hover:scale-110 hover:z-20">
                                                        <AvatarImage src={p.member?.profileImageUrl} />
                                                        <AvatarFallback className="bg-surface-3 text-xs font-medium text-black/55">
                                                            {p.member?.name?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(activity.participants?.length || 0) > 5 && (
                                                    <div className="w-6 h-6 rounded-full bg-surface-3 border-2 border-surface-1 flex items-center justify-center text-xs font-medium text-black/55 relative z-10">
                                                        +{activity.participants.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold tabular-nums text-black/55">
                                                {activity.participants?.length || 0} / {activity.maxParticipants}{t("clubActivityListView.personSuffix")}
                                            </span>
                                        </div>



                                        {isAdmin && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startTeamSetup(activity.id);
                                                }}
                                                className="ml-auto text-xs bg-brand text-brand-fg px-4 py-2 rounded-pill font-semibold flex items-center gap-1.5 hover:bg-brand-strong active:scale-95 transition-all cursor-pointer z-20"
                                            >
                                                <LucideZap className="w-3.5 h-3.5 fill-current" /> {t("clubActivityListView.teamAssignButton")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isExpanded && currentTeamData && (
                                <div className="mb-5 bg-surface-3 rounded-2xl overflow-hidden animate-in slide-in-from-top-4 fade-in duration-500">
                                    {currentTeamData.step === 'setup' ? (
                                        <div className="p-5">
                                            <div className="flex items-center justify-between mb-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-tile bg-brand/10 flex items-center justify-center">
                                                        <LucideZap className="w-5 h-5 text-brand" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-ink-1 leading-tight">{terms.teamLabel}{t("clubActivityListView.wizardTitleSuffix")}</h4>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setExpandedActivityId(null)}
                                                    className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center text-black/40 hover:text-ink-1 transition-colors"
                                                    title={t("clubActivityListView.close")}
                                                    aria-label="Close"
                                                >
                                                    <LucideX className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="mb-6 space-y-4">
                                                <div className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-5">
                                                    <div className="flex flex-col items-center gap-1 pb-2 border-b border-black/10">
                                                        <span className="text-xs font-medium text-black/55">{t("clubActivityListView.currentParticipants")}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl font-bold tabular-nums text-ink-1">{totalCount}</span>
                                                            <span className="text-sm font-semibold text-brand">{t("clubActivityListView.participantsWord")}</span>
                                                        </div>
                                                        {(totalCount > 0) && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs font-semibold tabular-nums text-brand bg-brand/10 px-2 py-0.5 rounded-full">{t("clubActivityListView.malePrefix")}{malesCount}</span>
                                                                <span className="text-xs font-semibold tabular-nums text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">{t("clubActivityListView.femalePrefix")}{femalesCount}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Manual Name Input Feature */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between px-1">
                                                            <label className="text-xs font-medium text-black/55">{t("clubActivityListView.manualInputLabel")}</label>
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], showManualInput: !prev[activity.id].showManualInput } }))}
                                                                className="text-xs font-semibold text-brand hover:underline"
                                                            >
                                                                {currentTeamData.showManualInput ? t("clubActivityListView.hide") : t("clubActivityListView.open")}
                                                            </button>
                                                        </div>
                                                        {currentTeamData.showManualInput && (
                                                            <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                                <textarea
                                                                    value={currentTeamData.manualInput}
                                                                    onChange={(e) => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], manualInput: e.target.value } }))}
                                                                    placeholder={t("clubActivityListView.manualInputPlaceholder")}
                                                                    className="w-full h-32 bg-surface-3 rounded-tile p-3 text-xs text-ink-1 placeholder:text-black/40 focus:border-brand/50 focus:outline-none transition-all"
                                                                />
                                                                <p className="text-xs text-black/45 px-1">
                                                                    {t("clubActivityListView.manualInputHint")}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Quick Setup Buttons */}
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs font-medium text-black/45 ml-1">{t("clubActivityListView.quickSetupLabel")}</label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {[2, 3, 4].map(n => (
                                                                <button
                                                                    key={n}
                                                                    onClick={() => {
                                                                        const total = activity.participants?.length || 0;
                                                                        const count = Math.ceil(total / n);
                                                                        setTeamData(prev => ({
                                                                            ...prev,
                                                                            [activity.id]: { ...prev[activity.id], count }
                                                                        }));
                                                                    }}
                                                                    className="bg-black/[0.04] hover:bg-black/[0.06] py-2 rounded-tile text-xs font-semibold text-black/60 hover:text-ink-1 transition-all"
                                                                >
                                                                    {n}{t("clubActivityListView.nPersonSuffix")} {terms.teamLabel}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-black/60 font-medium">{terms.teamLabel}{t("clubActivityListView.countSuffix")}</span>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], count: Math.max(1, prev[activity.id].count - 1) } }))}
                                                                className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center hover:bg-black/[0.1] text-ink-1"
                                                                title={t("clubActivityListView.decrease")}
                                                                aria-label="Decrease"
                                                            >
                                                                <LucideMinus className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-sm font-semibold tabular-nums text-ink-1 w-14 text-center">{currentTeamData.count}{t("clubActivityListView.unitSuffix")} {terms.teamLabel}</span>
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], count: Math.min(activity.participants?.length || 50, prev[activity.id].count + 1) } }))}
                                                                className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center hover:bg-black/[0.1] text-ink-1"
                                                                title={t("clubActivityListView.increase")}
                                                                aria-label="Increase"
                                                            >
                                                                <LucidePlus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {femalesCount > 0 && (
                                                    <div className="bg-surface-3 rounded-tile p-1 flex relative">
                                                        {(['random', 'spread', 'group'] as GenderDist[]).map((mode) => (
                                                            <button
                                                                key={mode}
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], genderDist: mode } }))}
                                                                className={cn(
                                                                    "flex-1 py-2 text-xs font-semibold rounded-tile transition-all z-10 relative",
                                                                    currentTeamData.genderDist === mode ? "text-brand-fg" : "text-black/55 hover:text-black/80"
                                                                )}
                                                            >
                                                                {mode === 'random' && t("clubActivityListView.random")}
                                                                {mode === 'spread' && t("clubActivityListView.spreadFemale")}
                                                                {mode === 'group' && t("clubActivityListView.groupFemale")}
                                                            </button>
                                                        ))}
                                                        <div
                                                            className="absolute top-1 bottom-1 rounded-tile bg-brand transition-all duration-300"
                                                            style={{
                                                                width: '33.33%',
                                                                left: currentTeamData.genderDist === 'spread' ? '33.33%' : currentTeamData.genderDist === 'group' ? '66.66%' : '0%'
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        onClick={() => runGeneration(activity.id, activity.participants)}
                                                        disabled={isGenerating}
                                                        className="bg-surface-3 hover:bg-brand hover:border-brand rounded-tile p-4 flex items-center justify-center transition-all group disabled:opacity-50 disabled:pointer-events-none"
                                                    >
                                                        {isGenerating ? (
                                                            <span className="flex items-center gap-1.5 text-sm font-semibold text-black/55">
                                                                <LucideRefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("clubActivityListView.generating")}
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm font-semibold text-ink-1 group-hover:text-brand-fg">{t("clubActivityListView.balanceButton")}</span>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => runGeneration(activity.id, activity.participants, true)}
                                                        disabled={isGenerating}
                                                        className="bg-surface-3 hover:bg-brand hover:border-brand rounded-tile p-4 flex items-center justify-center transition-all group disabled:opacity-50 disabled:pointer-events-none"
                                                    >
                                                        {isGenerating ? (
                                                            <span className="flex items-center gap-1.5 text-sm font-semibold text-black/55">
                                                                <LucideRefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("clubActivityListView.generating")}
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm font-semibold text-ink-1 group-hover:text-brand-fg">{t("clubActivityListView.fullRandomButton")}</span>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-black/10">
                                                <div className="flex items-center gap-2">
                                                    <LucideZap className="w-4 h-4 text-brand" />
                                                    <span className="text-xs font-bold text-ink-1">{terms.teamLabel}{t("clubActivityListView.resultTitleSuffix")} ({currentTeamData.teams.length}{t("clubActivityListView.unitSuffix")} {terms.teamLabel})</span>
                                                </div>
                                                <span className="text-xs font-semibold text-brand bg-brand/10 px-1.5 py-0.5 rounded-pill border border-brand/20">{t("clubActivityListView.aiOptimized")}</span>
                                            </div>

                                            <div className="p-4 relative">
                                                {/* Results Display */}
                                                <div className="grid gap-3 grid-cols-2">
                                                    {currentTeamData.teams.map((team, idx) => (
                                                        <div key={idx} className="bg-white rounded-tile p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                                            <div className="flex items-center justify-between mb-2 pb-2 border-b border-black/10">
                                                                <h4 className="text-xs font-semibold" style={{ color: team.color }}>{team.name}</h4>
                                                                <span className="text-xs tabular-nums text-black/55">{team.avg} {terms.unit}</span>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {team.members.map((m: any, mIdx: number) => {
                                                                    const isMe = m.memberId === currentMemberId;
                                                                    return (
                                                                        <div key={mIdx} className="flex items-center gap-1.5">
                                                                            <div className={cn("w-1.5 h-1.5 rounded-full", isMe && "animate-pulse")} style={{ backgroundColor: isMe ? 'rgb(var(--brand))' : team.color }} />
                                                                            <span className={cn("text-xs", isMe ? "text-brand font-bold" : "text-black/70")}>
                                                                                {m.member?.name} {m.member?.gender === 'F' && <span className="text-rose-500 text-xs">♀</span>}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-6 space-y-3">
                                                    <div className="px-1 flex items-center justify-between">
                                                        <label htmlFor={`result-text-${activity.id}`} className="text-xs font-medium text-black/55">{t("clubActivityListView.resultTextLabel")}</label>
                                                        <span className="text-xs text-black/45">{t("clubActivityListView.resultTextHint")}</span>
                                                    </div>
                                                    <textarea
                                                        readOnly={false}
                                                        defaultValue={(() => {
                                                            const dateStr = format(new Date(activity.activityDate), t("clubActivityListView.dateTimeFormat"), { locale: ko });
                                                            const locStr = activity.locationName || t("clubActivityListView.locationTbd");
                                                            const tStr = currentTeamData.teams.map((team: any) => `[${team.name} (${terms.avgLabel}: ${+Number(team.avg).toFixed(2)})]\n${team.members.map((m: any) => {
                                                                const score = sportType === 'GOLF' ? (m.member?.golfAvgScore || 0) : (m.member?.avg4c || 0);
                                                                return `• ${m.member?.name}${m.member?.gender === 'F' ? t("clubActivityListView.femaleMark") : ''} (${+Number(score).toFixed(2)}${terms.unit})`;
                                                            }).join('\n')}`).join('\n\n');
                                                            return `[${terms.emoji} ${terms.teamLabel}${t("clubActivityListView.resultTitleSuffix")}]\n--------------------------\n${t("clubActivityListView.shareMeetupLabel")}${activity.title}\n${t("clubActivityListView.shareDateLabel")}${dateStr}\n${t("clubActivityListView.shareLocationLabel")}${locStr}\n--------------------------\n\n${tStr}`;
                                                        })()}
                                                        id={`result-text-${activity.id}`}
                                                        className="w-full h-32 bg-white rounded-tile p-3 text-xs text-black/70 focus:outline-none focus:border-brand/30 transition-all font-mono leading-relaxed"
                                                    />
                                                </div>

                                                <div className="flex flex-col sm:flex-row justify-center mt-6 gap-3">
                                                    <button
                                                        onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], step: 'setup' } }))}
                                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-tile text-xs text-black/55 hover:text-ink-1 bg-black/[0.04] hover:bg-black/[0.06] transition-all "
                                                    >
                                                        <LucideRefreshCw className="w-3.5 h-3.5" /> {t("clubActivityListView.resetButton")}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const textElement = document.getElementById(`result-text-${activity.id}`) as HTMLTextAreaElement;
                                                            const fullMsg = textElement?.value || "";
                                                            if (onShareToChat) {
                                                                onShareToChat(fullMsg);
                                                            } else {
                                                                navigator.clipboard.writeText(fullMsg);
                                                                toast({ title: t("clubActivityListView.copySuccessTitle"), description: t("clubActivityListView.copySuccessDesc") });
                                                            }
                                                        }}
                                                        className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-tile text-xs bg-brand text-brand-fg hover:bg-brand-strong transition-all font-semibold"
                                                    >
                                                        <LucideMessageCircle className="w-4 h-4" /> {t("clubActivityListView.shareToChat")}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                            }

                            {isMember && !isJoined && (
                                <div className="flex gap-2">
                                    <Button
                                        className="flex-1 bg-brand hover:bg-brand-strong text-brand-fg font-bold h-11 rounded-tile text-xs"
                                        onClick={() => joinMutation.mutate(activity.id)}
                                        disabled={isFull || joinMutation.isPending}
                                    >
                                        {isFull ? t("clubActivityListView.full") : <span className="flex items-center gap-2 font-bold">{t("clubActivityListView.joinButton")} <LucideChevronRight className="w-3.5 h-3.5" /></span>}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-11 h-11 p-0 border-black/10 bg-black/[0.04] hover:bg-black/[0.06] text-black/60 rounded-tile"
                                        onClick={() => {
                                            const dateStr = format(new Date(activity.activityDate), t("clubActivityListView.dateTimeFormat"), { locale: ko });
                                            const fullMsg = `[${terms.emoji} ${t("clubActivityListView.shareNoticeTitle")}]\n--------------------------\n${t("clubActivityListView.shareLocationLabel")}${activity.locationName || t("clubActivityListView.locationTbd")}\n${t("clubActivityListView.shareDateLabel")}${dateStr}\n${t("clubActivityListView.shareParticipantsLabel")}${activity.participants?.length || 0} / ${activity.maxParticipants}${t("clubActivityListView.personSuffix")}\n--------------------------`;
                                            if (onShareToChat) onShareToChat(fullMsg); else navigator.clipboard.writeText(fullMsg);
                                            toast({ title: t("clubActivityListView.shareCopied") });
                                        }}
                                        title={t("clubActivityListView.shareTitle")}
                                    >
                                        <LucideShare2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}

                            {isJoined && (
                                <div className="mt-2">
                                    <Button
                                        variant="ghost"
                                        className="w-full text-black/55 hover:text-red-500 hover:bg-red-500/5 text-xs font-semibold h-8"
                                        onClick={() => setLeaveConfirmId(activity.id)}
                                        disabled={leaveMutation.isPending}
                                    >
                                        {t("clubActivityListView.leaveButton")}
                                    </Button>
                                </div>
                            )}

                            {isAdmin && (
                                <div className="mt-4 pt-4 border-t border-black/10 flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 bg-black/[0.04] border-black/10 text-black/55 hover:text-ink-1 hover:bg-black/[0.06] text-xs font-semibold h-9 rounded-tile"
                                        onClick={() => {
                                            setEditingActivity(activity);
                                            setIsEditOpen(true);
                                        }}
                                    >
                                        <LucidePencil className="w-3 h-3 mr-1.5" /> {t("clubActivityListView.editButton")}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 bg-black/[0.04] border-black/10 text-black/55 hover:text-red-500 hover:bg-red-500/10 text-xs font-semibold h-9 rounded-tile"
                                        onClick={() => setDeleteConfirmId(activity.id)}
                                    >
                                        <LucideTrash2 className="w-3 h-3 mr-1.5" /> {t("clubActivityListView.deleteButton")}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card >
                );
            })}

            {isError && (
                <Card className="rk-card rounded-card">
                    <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
                            <LucideCalendarDays className="w-6 h-6 text-black/40" />
                        </div>
                        <p className="text-sm font-semibold text-black/70">{t("clubActivityListView.loadError")}</p>
                        <Button
                            variant="ghost"
                            onClick={() => refetch()}
                            className="h-10 px-5 rounded-pill bg-surface-3 hover:bg-black/[0.06] text-black/70 text-xs font-semibold"
                        >
                            <LucideRefreshCw className="w-3.5 h-3.5 mr-1.5" /> {t("clubActivityListView.retry")}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!isError && filteredActivities.length === 0 && (
                <Card className="rk-card rounded-card">
                    <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center mb-1">
                            <LucideCalendarDays className="w-6 h-6 text-black/40" />
                        </div>
                        <h3 className="text-sm font-semibold text-black/70">{t("clubActivityListView.emptyTitle")}</h3>
                        <p className="text-xs text-black/55 font-medium">
                            {isMember ? t("clubActivityListView.emptyMemberDesc") : t("clubActivityListView.emptyGuestDesc")}
                        </p>
                    </CardContent>
                </Card>
            )}

            {
                isMember && (
                    <Card
                        className="bg-surface-1 border-black/10 border-dashed border hover:border-brand hover:bg-brand/5 transition-all cursor-pointer group rounded-card"
                        onClick={onCreateClick}
                    >
                        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                            <div className="w-12 h-12 rounded-full bg-brand/10 group-hover:bg-brand flex items-center justify-center transition-colors">
                                <LucidePlus className="w-6 h-6 text-brand group-hover:text-brand-fg transition-colors" />
                            </div>
                            <h3 className="text-ink-1 font-semibold group-hover:text-brand transition-colors">{t("clubActivityListView.createTitle")}</h3>
                            <p className="text-xs text-black/55 font-medium">{t("clubActivityListView.createDesc")}</p>
                        </CardContent>
                    </Card>
                )
            }

            {sportType === 'GOLF' ? (
                <CreateGolfActivityModal
                    open={isEditOpen}
                    onOpenChange={(open) => {
                        setIsEditOpen(open);
                        if (!open) setEditingActivity(null);
                    }}
                    crewId={crewId}
                    initialData={editingActivity}
                />
            ) : (
                <CreateActivityDialog
                    open={isEditOpen}
                    onOpenChange={(open) => {
                        setIsEditOpen(open);
                        if (!open) setEditingActivity(null);
                    }}
                    crewId={crewId}
                    sportCategory={'BILLIARDS'}
                    initialData={editingActivity}
                />
            )}

            <AlertDialog open={!!leaveConfirmId} onOpenChange={(open) => !open && setLeaveConfirmId(null)}>
                <AlertDialogContent className="bg-white border-black/[0.08] text-ink-1 rounded-card">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-ink-1">{t("clubActivityListView.leaveDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription className="text-black/60">
                            {t("clubActivityListView.leaveDialogDesc")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-surface-3 border-black/10 text-ink-1 hover:bg-black/[0.06]">{t("clubActivityListView.goBack")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (leaveConfirmId) leaveMutation.mutate(leaveConfirmId); }}
                            className="bg-red-500 text-white hover:bg-red-600"
                        >
                            {t("clubActivityListView.leaveDialogTitle")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <AlertDialogContent className="bg-white border-black/[0.08] text-ink-1 rounded-card">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-ink-1">{t("clubActivityListView.deleteDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription className="text-black/60">
                            {t("clubActivityListView.deleteDialogDesc")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-surface-3 border-black/10 text-ink-1 hover:bg-black/[0.06]">{t("clubActivityListView.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
                            className="bg-red-500 text-white hover:bg-red-600"
                        >
                            {t("clubActivityListView.deleteButton")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
