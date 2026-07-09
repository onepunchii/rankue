import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { differenceInDays, startOfDay, format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
    LucidePlus, LucideChevronRight, LucideZap, LucideCrown,
    LucideRefreshCw, LucideX, LucideMessageCircle, LucideShare2,
    LucideMinus, LucidePencil, LucideTrash2
} from "lucide-react";
import { generateTeams, getSportTerminology, SportType, GenderDist } from "@/lib/teamGenerator";
import { CreateActivityDialog } from "../CreateActivityDialog";

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

    const { data: activities, isLoading } = useQuery({
        queryKey: [`/api/hiq/crews/${crewId}/activities`],
        enabled: !!crewId,
    });

    const joinMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}/join`, {
                method: "POST"
            });
        },
        onSuccess: () => {
            toast({ title: "참여 완료", description: "정모에 참여했습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: "참여 실패", description: err.message, variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "삭제 완료", description: "정모가 삭제되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
        }
    });

    const leaveMutation = useMutation({
        mutationFn: async (activityId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${activityId}/join`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "참여 취소", description: "정모 참여를 취소했습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
        },
        onError: (err: Error) => {
            toast({ title: "취소 실패", description: err.message, variant: "destructive" });
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
        setIsGenerating(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 800));
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

    if (isLoading) return <div className="text-center py-8 text-white/55">데이터를 불러오는 중...</div>;

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
                const dDayText = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : "종료";
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
                                    <p className="text-xs text-ink-3 font-medium ml-0.5">공식 모임</p>
                                </div>
                                {isJoined && (
                                    <div className="flex items-center gap-1 text-xs font-semibold text-brand bg-brand/10 px-2 py-1 rounded-full border border-brand/20">
                                        <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                                        참여중
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 mb-5 text-[13px]">
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">일시</div>
                                    <div className="font-medium text-ink-2">
                                        {format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko })}
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-ink-3 mt-0.5">위치</div>
                                    <div className="font-medium text-ink-2">{activity.locationName || "장소 미정"}</div>
                                </div>
                                {activity.cost && (
                                    <div className="flex items-center">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">비용</div>
                                        <div className="font-medium text-ink-2 text-sm">{activity.cost}</div>
                                    </div>
                                )}
                                {activity.description && (
                                    <div className="flex items-start mt-1 pt-2 border-t border-surface-line">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3 mt-0.5">메모</div>
                                        <div className="font-medium text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                                            {activity.description}
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center w-full">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-ink-3">참석</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {(activity.participants || []).slice(0, 5).map((p: any, idx: number) => (
                                                    <Avatar key={idx} className="w-6 h-6 border-2 border-surface-1 transition-transform hover:scale-110 hover:z-20">
                                                        <AvatarImage src={p.member?.profileImageUrl} />
                                                        <AvatarFallback className="bg-surface-3 text-xs font-medium text-white/55">
                                                            {p.member?.name?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(activity.participants?.length || 0) > 5 && (
                                                    <div className="w-6 h-6 rounded-full bg-surface-3 border-2 border-surface-1 flex items-center justify-center text-xs font-medium text-white/55 relative z-10">
                                                        +{activity.participants.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold tabular-nums text-white/55">
                                                {activity.participants?.length || 0} / {activity.maxParticipants}명
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
                                                <LucideZap className="w-3.5 h-3.5 fill-current" /> 팀 편성
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isExpanded && currentTeamData && (
                                <div className="mb-5 bg-surface-2 rounded-2xl overflow-hidden border border-surface-line animate-in slide-in-from-top-4 fade-in duration-500">
                                    {currentTeamData.step === 'setup' ? (
                                        <div className="p-5">
                                            <div className="flex items-center justify-between mb-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-tile bg-brand/10 flex items-center justify-center">
                                                        <LucideZap className="w-5 h-5 text-brand" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-ink-1 leading-tight">{terms.teamLabel} 편성 마법사</h4>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setExpandedActivityId(null)}
                                                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                                                    title="닫기"
                                                    aria-label="Close"
                                                >
                                                    <LucideX className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="mb-6 space-y-4">
                                                <div className="bg-surface-3 rounded-2xl p-5 border border-surface-line space-y-5">
                                                    <div className="flex flex-col items-center gap-1 pb-2 border-b border-surface-line">
                                                        <span className="text-xs font-medium text-white/55">현재 참여 인원</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl font-bold tabular-nums text-ink-1">{totalCount}</span>
                                                            <span className="text-sm font-semibold text-brand">참가자</span>
                                                        </div>
                                                        {(totalCount > 0) && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs font-semibold tabular-nums text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">남 {malesCount}</span>
                                                                <span className="text-xs font-semibold tabular-nums text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full">여 {femalesCount}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Manual Name Input Feature */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between px-1">
                                                            <label className="text-xs font-medium text-white/55">명단 직접 입력 (붙여넣기)</label>
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], showManualInput: !prev[activity.id].showManualInput } }))}
                                                                className="text-xs font-semibold text-brand hover:underline"
                                                            >
                                                                {currentTeamData.showManualInput ? "숨기기" : "열기"}
                                                            </button>
                                                        </div>
                                                        {currentTeamData.showManualInput && (
                                                            <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                                <textarea
                                                                    value={currentTeamData.manualInput}
                                                                    onChange={(e) => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], manualInput: e.target.value } }))}
                                                                    placeholder="이름을 입력하세요 (엔터나 콤마로 구분)&#13;&#10;예: 김철수, 이영희(여), 박지민여, 유니♀"
                                                                    className="w-full h-32 bg-black/40 border border-surface-line rounded-tile p-3 text-xs text-white placeholder:text-white/45 focus:border-brand/50 focus:outline-none transition-all"
                                                                />
                                                                <p className="text-xs text-white/45 px-1">
                                                                    * 이름 뒤에 ♀ 또는 '여'를 붙이면 여성으로 인식됩니다. (예: 영희여, 영희(여))
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Quick Setup Buttons */}
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs font-medium text-white/45 ml-1">빠른 설정 (추천)</label>
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
                                                                    className="bg-white/5 hover:bg-white/10 border border-surface-line py-2 rounded-tile text-xs font-semibold text-white/60 hover:text-white transition-all"
                                                                >
                                                                    {n}인 {terms.teamLabel}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-white/60 font-medium">{terms.teamLabel} 개수</span>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], count: Math.max(1, prev[activity.id].count - 1) } }))}
                                                                className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center hover:bg-white/10 text-white"
                                                                title="감소"
                                                                aria-label="Decrease"
                                                            >
                                                                <LucideMinus className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-sm font-semibold tabular-nums text-white w-14 text-center">{currentTeamData.count}개 {terms.teamLabel}</span>
                                                            <button
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], count: Math.min(activity.participants?.length || 50, prev[activity.id].count + 1) } }))}
                                                                className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center hover:bg-white/10 text-white"
                                                                title="증가"
                                                                aria-label="Increase"
                                                            >
                                                                <LucidePlus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {femalesCount > 0 && (
                                                    <div className="bg-surface-2 rounded-tile p-1 flex relative">
                                                        {(['random', 'spread', 'group'] as GenderDist[]).map((mode) => (
                                                            <button
                                                                key={mode}
                                                                onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], genderDist: mode } }))}
                                                                className={cn(
                                                                    "flex-1 py-2 text-xs font-semibold rounded-tile transition-all z-10 relative",
                                                                    currentTeamData.genderDist === mode ? "text-brand-fg" : "text-white/55 hover:text-white/80"
                                                                )}
                                                            >
                                                                {mode === 'random' && "랜덤"}
                                                                {mode === 'spread' && "여성 균등"}
                                                                {mode === 'group' && "여성 구분"}
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
                                                        className="bg-surface-2 hover:bg-brand border border-surface-line hover:border-brand rounded-tile p-4 flex items-center justify-center transition-all group"
                                                    >
                                                        <span className="text-sm font-semibold text-white group-hover:text-brand-fg">실력 밸런스</span>
                                                    </button>
                                                    <button
                                                        onClick={() => runGeneration(activity.id, activity.participants, true)}
                                                        className="bg-surface-2 hover:bg-brand border border-surface-line hover:border-brand rounded-tile p-4 flex items-center justify-center transition-all group"
                                                    >
                                                        <span className="text-sm font-semibold text-white group-hover:text-brand-fg">완전 랜덤</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="bg-surface-3 px-4 py-2 flex items-center justify-between border-b border-surface-line">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{terms.emoji}</span>
                                                    <span className="text-xs font-bold text-ink-1">{terms.teamLabel} 편성 결과 ({currentTeamData.teams.length}개 {terms.teamLabel})</span>
                                                </div>
                                                <span className="text-xs font-semibold text-brand bg-brand/10 px-1.5 py-0.5 rounded-pill border border-brand/20">AI 최적화</span>
                                            </div>

                                            <div className="p-4 relative">
                                                {/* Results Display */}
                                                <div className={cn(
                                                    "grid gap-3",
                                                    currentTeamData.teams.length === 2 ? "grid-cols-2" : "grid-cols-2"
                                                )}>
                                                    {currentTeamData.teams.map((team, idx) => (
                                                        <div key={idx} className="bg-surface-3 border border-surface-line rounded-tile p-3">
                                                            <div className="flex items-center justify-between mb-2 pb-2 border-b border-surface-line">
                                                                <h4 className="text-xs font-semibold" style={{ color: team.color }}>{team.name}</h4>
                                                                <span className="text-xs tabular-nums text-white/55">{team.avg} {terms.unit}</span>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {team.members.map((m: any, mIdx: number) => {
                                                                    const isMe = m.memberId === currentMemberId;
                                                                    return (
                                                                        <div key={mIdx} className="flex items-center gap-1.5">
                                                                            <div className={cn("w-1.5 h-1.5 rounded-full", isMe && "animate-pulse")} style={{ backgroundColor: isMe ? 'rgb(var(--brand))' : team.color }} />
                                                                            <span className={cn("text-xs", isMe ? "text-brand font-bold" : "text-white/70")}>
                                                                                {m.member?.name} {m.member?.gender === 'F' && <span className="text-rose-400 text-xs">♀</span>}
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
                                                        <label htmlFor={`result-text-${activity.id}`} className="text-xs font-medium text-white/55">편성 전체 결과 (텍스트)</label>
                                                        <span className="text-xs text-white/45">채팅방 공유 전 수정 가능합니다</span>
                                                    </div>
                                                    <textarea
                                                        readOnly={false}
                                                        defaultValue={(() => {
                                                            const dateStr = format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko });
                                                            const locStr = activity.locationName || "장소 미정";
                                                            const tStr = currentTeamData.teams.map((t: any) => `[${t.name} (${terms.avgLabel}: ${+Number(t.avg).toFixed(2)})]\n${t.members.map((m: any) => {
                                                                const score = sportType === 'GOLF' ? (m.member?.golfAvgScore || 0) : (m.member?.avg4c || 0);
                                                                return `• ${m.member?.name}${m.member?.gender === 'F' ? '(여)' : ''} (${+Number(score).toFixed(2)}${terms.unit})`;
                                                            }).join('\n')}`).join('\n\n');
                                                            return `[${terms.emoji} ${terms.teamLabel} 편성 결과]\n--------------------------\n📌 모임: ${activity.title}\n📅 일시: ${dateStr}\n📍 장소: ${locStr}\n--------------------------\n\n${tStr}`;
                                                        })()}
                                                        id={`result-text-${activity.id}`}
                                                        className="w-full h-32 bg-black/40 border border-surface-line rounded-tile p-3 text-xs text-white/70 focus:outline-none focus:border-brand/30 transition-all font-mono leading-relaxed"
                                                    />
                                                </div>

                                                <div className="flex flex-col sm:flex-row justify-center mt-6 gap-3">
                                                    <button
                                                        onClick={() => setTeamData(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], step: 'setup' } }))}
                                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-tile text-xs text-white/55 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-surface-line"
                                                    >
                                                        <LucideRefreshCw className="w-3.5 h-3.5" /> 다시 설정
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const textElement = document.getElementById(`result-text-${activity.id}`) as HTMLTextAreaElement;
                                                            const fullMsg = textElement?.value || "";
                                                            if (onShareToChat) {
                                                                onShareToChat(fullMsg);
                                                            } else {
                                                                navigator.clipboard.writeText(fullMsg);
                                                                toast({ title: "복사 완료", description: "클립보드에 결과가 저장되었습니다." });
                                                            }
                                                        }}
                                                        className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-tile text-xs bg-brand text-brand-fg hover:bg-brand-strong transition-all font-semibold"
                                                    >
                                                        <LucideMessageCircle className="w-4 h-4" /> 채팅방 공유
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
                                        {isFull ? "인원 마감" : <span className="flex items-center gap-2 font-bold">참여하기 <LucideChevronRight className="w-3.5 h-3.5" /></span>}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-11 h-11 p-0 border-surface-line bg-white/5 hover:bg-white/10 text-white/60 rounded-tile"
                                        onClick={() => {
                                            const dateStr = format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko });
                                            const fullMsg = `[${terms.emoji} 정모 안내]\n--------------------------\n📍 장소: ${activity.locationName || "장소 미정"}\n📅 일시: ${dateStr}\n👥 인원: ${activity.participants?.length || 0} / ${activity.maxParticipants}명\n--------------------------`;
                                            if (onShareToChat) onShareToChat(fullMsg); else navigator.clipboard.writeText(fullMsg);
                                            toast({ title: "공유 정보 복사 완료" });
                                        }}
                                        title="공유하기"
                                    >
                                        <LucideShare2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}

                            {isJoined && (
                                <div className="mt-2">
                                    <Button
                                        variant="ghost"
                                        className="w-full text-white/55 hover:text-red-500 hover:bg-red-500/5 text-xs font-semibold h-8"
                                        onClick={() => { if (confirm("정모 참여를 취소하시겠습니까?")) leaveMutation.mutate(activity.id); }}
                                        disabled={leaveMutation.isPending}
                                    >
                                        참여 취소하기
                                    </Button>
                                </div>
                            )}

                            {isAdmin && (
                                <div className="mt-4 pt-4 border-t border-surface-line flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 bg-white/5 border-surface-line text-white/55 hover:text-white hover:bg-white/10 text-xs font-semibold h-9 rounded-tile"
                                        onClick={() => {
                                            setEditingActivity(activity);
                                            setIsEditOpen(true);
                                        }}
                                    >
                                        <LucidePencil className="w-3 h-3 mr-1.5" /> 수정하기
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 bg-white/5 border-surface-line text-white/55 hover:text-red-500 hover:bg-red-500/10 text-xs font-semibold h-9 rounded-tile"
                                        onClick={() => {
                                            if (confirm("정말 이 정모를 삭제하시겠습니까?")) {
                                                deleteMutation.mutate(activity.id);
                                            }
                                        }}
                                    >
                                        <LucideTrash2 className="w-3 h-3 mr-1.5" /> 삭제하기
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card >
                );
            })}

            {
                isMember && (
                    <Card
                        className="bg-surface-2 border-surface-line border-dashed border hover:border-brand hover:bg-brand/5 transition-all cursor-pointer group rounded-card"
                        onClick={onCreateClick}
                    >
                        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                            <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-brand flex items-center justify-center transition-colors">
                                <LucidePlus className="w-6 h-6 text-white/55 group-hover:text-brand-fg transition-colors" />
                            </div>
                            <h3 className="text-ink-1 font-semibold group-hover:text-brand transition-colors">새로운 정모 만들기</h3>
                            <p className="text-xs text-white/55 font-medium">언제든 자유롭게 모임을 시작해보세요!</p>
                        </CardContent>
                    </Card>
                )
            }

            <CreateActivityDialog
                open={isEditOpen}
                onOpenChange={(open) => {
                    setIsEditOpen(open);
                    if (!open) setEditingActivity(null);
                }}
                crewId={crewId}
                sportCategory={sportType === 'GOLF' ? 'GOLF' : 'BILLIARDS'}
                initialData={editingActivity}
            />
        </div >
    );
}
