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
    LucidePlus, LucideTent, LucideChevronRight, LucideZap, LucideCrown,
    LucideRefreshCw, LucideUser, LucideUsers, LucideShuffle, LucideBrainCircuit,
    LucideLayoutList, LucideMinus, LucideX, LucideMessageCircle
} from "lucide-react";

interface ClubActivityListProps {
    crewId: string;
    isMember: boolean;
    currentMemberId?: string;
    onCreateClick: () => void;
    onShareToChat?: (message: string) => void;
}

// Mock Utility for generating teams
const mockGenerateTeams = (participants: any[], count: number, mode: string) => {
    // Shuffle
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const teams: any[] = Array.from({ length: count }, () => []);

    shuffled.forEach((p, idx) => {
        teams[idx % count].push(p);
    });

    return teams.map((members, idx) => ({
        id: idx,
        name: `Team ${String.fromCharCode(65 + idx)}`, // A, B, C...
        members,
        avg: Math.floor(Math.random() * (250 - 150) + 150),
        color: ['blue', 'red', 'green', 'yellow', 'purple', 'cyan'][idx % 6]
    }));
};

export function BilliardsRoomList({ crewId, isMember, currentMemberId, onCreateClick, onShareToChat }: ClubActivityListProps) {
    const { toast } = useToast();
    // teamData state: Record<activityId, { step: 'setup' | 'result', count: number, mode: 'team' | 'individual', teams: any[] }>
    const [teamData, setTeamData] = useState<Record<string, any>>({});
    const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

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

    // Helper to start setup
    const startTeamSetup = (activityId: string) => {
        if (expandedActivityId === activityId) {
            setExpandedActivityId(null); // Toggle close if already open
        } else {
            setExpandedActivityId(activityId);
            // Initialize setup state if not exists
            if (!teamData[activityId]) {
                setTeamData(prev => ({
                    ...prev,
                    [activityId]: { step: 'setup', count: 2, mode: 'team' }
                }));
            }
        }
    };



    // Helper to reset
    const resetSetup = (activityId: string) => {
        setTeamData(prev => ({
            ...prev,
            [activityId]: { step: 'setup', count: 2, mode: 'team' }
        }));
    };

    if (isLoading) return <div className="text-center py-8 text-white/20">Loading activities...</div>;

    // MOCK DATA INJECTION: Force 24 participants for testing
    const upcomingActivities: any[] = Array.isArray(activities) ? activities.map((activity: any) => ({
        ...activity,
        participants: Array.from({ length: 24 }, (_, i) => ({
            memberId: `test-user-${i}`,
            member: {
                name: `선수 ${i + 1}`,
                profileImageUrl: null,
                gender: i < 6 ? 'F' : 'M' // 6 Females, 18 Males (Fixed for testing)
            }
        })),
        maxParticipants: 24
    })) : [];

    // Helper to run generation
    const runGeneration = async (activityId: number, participants: any[]) => {
        setIsGenerating(true);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const count = teamData[activityId]?.count || 2;
        const genderDist = teamData[activityId]?.genderDist || 'random'; // random, spread, group

        // 1. Prepare Lists
        let females = participants.filter(p => p.member?.gender === 'F');
        let males = participants.filter(p => p.member?.gender !== 'F');

        // Shuffle helpers
        const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5);
        females = shuffle(females);
        males = shuffle(males);

        // 2. Initialize Teams
        const teams: any[] = Array.from({ length: count }, (_, i) => ({
            name: `Team ${String.fromCharCode(65 + i)}`,
            // Premium Sports Palette: Red, Blue, Emerald, Amber, Violet, Orange
            color: ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#F97316'][i % 6],
            members: [],
            avg: 0 // Will calc later
        }));

        // 3. Distribute
        if (genderDist === 'spread') {
            // Spread: Round Robin F, then M
            let tIdx = 0;
            females.forEach(p => {
                teams[tIdx].members.push(p);
                tIdx = (tIdx + 1) % count;
            });
            // Continue M from where we left off (or reset? usually reset to balance count, 
            // but to balance GENDER, we just distributed F. Now to balance SIZE, we distribute M to smallest.)

            // Allow balancing by size for remainder
            males.forEach(p => {
                // Find smallest team
                teams.sort((a, b) => a.members.length - b.members.length);
                teams[0].members.push(p);
            });
            // Re-sort via name for display
            teams.sort((a, b) => a.name.localeCompare(b.name));
        }
        else if (genderDist === 'group') {
            // Group Strategy: Fill teams with Females sequentially up to their calculated capacity.
            // This ensures women are kept together.
            // Example: 6F, 18M, 6 Teams (Size 4) -> T1:[4F], T2:[2F,2M], T3..6:[4M]

            let fIdx = 0;
            let mIdx = 0;
            const total = participants.length;

            teams.forEach((team, idx) => {
                // Calculate exact capacity for this team to ensure even distribution
                const capacity = Math.floor(total / count) + (idx < (total % count) ? 1 : 0);

                // 1. Fill with Females first (Grouping)
                while (team.members.length < capacity && fIdx < females.length) {
                    team.members.push(females[fIdx++]);
                }

                // 2. Fill remaining slots with Males
                while (team.members.length < capacity && mIdx < males.length) {
                    team.members.push(males[mIdx++]);
                }
            });
        }
        else {
            // Random: Shuffle all
            const all = shuffle([...females, ...males]);
            all.forEach((p, i) => {
                teams[i % count].members.push(p);
            });
        }

        // 4. Calc Avgs (Mock)
        teams.forEach(t => {
            t.avg = Math.floor(200 + Math.random() * 100);
        });

        // 5. Update State
        setTeamData(prev => ({
            ...prev,
            [activityId]: {
                ...prev[activityId],
                step: 'result',
                teams: teams
            }
        }));

        // setIsGenerating(false); // This variable is not defined in the provided context.
    };



    return (
        <div className="space-y-4 px-6 pt-0 pb-6">
            <div className="flex items-center gap-2 mb-2">
                <LucideTent className="w-5 h-5 text-[#22c55e]" />
                <h2 className="text-lg font-semibold">정모 / 일정</h2>
            </div>

            {/* Existing Activities */}
            {upcomingActivities.map((activity: any) => {
                const isJoined = activity.participants?.some((p: any) => p.memberId === currentMemberId);
                const isFull = (activity.participants?.length || 0) >= (activity.maxParticipants || 8);
                const currentTeamData = teamData[activity.id];
                const isExpanded = expandedActivityId === activity.id;
                const femalesCount = activity.participants.filter((p: any) => p.member?.gender === 'F').length;
                const malesCount = activity.participants.length - femalesCount;

                // D-Day Calculation
                const diff = differenceInDays(startOfDay(new Date(activity.activityDate)), startOfDay(new Date()));
                const dDayText = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : "종료";
                const dDayColor = diff === 0 ? "bg-red-500 text-white" : diff > 0 && diff <= 3 ? "bg-orange-500 text-white" : "bg-[#22c55e] text-black";

                return (
                    <Card key={activity.id} className="bg-[#1a1a1a]/80 backdrop-blur-xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] group hover:border-[#22c55e]/30 transition-all duration-500">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider shadow-md", dDayColor)}>
                                            {dDayText}
                                        </div>
                                        <h3 className="font-extrabold text-lg text-white tracking-tight">{activity.title}</h3>
                                    </div>
                                    <p className="text-[10px] text-white/20 font-semibold uppercase tracking-[0.2em] ml-0.5">Official Meeting</p>
                                </div>
                                {isJoined && (
                                    <div className="flex items-center gap-1 text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 px-2 py-1 rounded-full border border-[#22c55e]/20">
                                        <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
                                        참여중
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 mb-5 text-[13px]">
                                {/* Info Items */}
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-[10px] font-extrabold text-white/20 uppercase tracking-widest">일시</div>
                                    <div className="font-semibold text-white/80">
                                        {format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko })}
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-10 shrink-0 text-[10px] font-extrabold text-white/20 uppercase tracking-widest mt-0.5">위치</div>
                                    <div className="font-semibold text-white/80">
                                        {activity.locationName || "장소 미정"}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-[10px] font-extrabold text-white/20 uppercase tracking-widest">비용</div>
                                    <div className="font-semibold text-white/80">
                                        {activity.cost || "협의 / n분의 1"}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center w-full">
                                        <div className="w-10 shrink-0 text-[10px] font-extrabold text-white/20 uppercase tracking-widest">참석</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {(activity.participants || []).slice(0, 5).map((p: any, idx: number) => (
                                                    <Avatar key={idx} className="w-6 h-6 border-2 border-[#1a1a1a] shadow-xl transition-transform hover:scale-110 hover:z-20">
                                                        <AvatarImage src={p.member?.profileImageUrl} />
                                                        <AvatarFallback className="bg-[#2a2a2a] text-[9px] font-bold text-white/40">
                                                            {p.member?.name?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(activity.participants?.length || 0) > 5 && (
                                                    <div className="w-6 h-6 rounded-full bg-[#2a2a2a] border-2 border-[#1a1a1a] flex items-center justify-center text-[9px] font-bold text-white/40 shadow-xl relative z-10">
                                                        +{activity.participants.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[12px] font-extrabold text-white/30 tracking-tight">
                                                {activity.participants?.length || 0} / {activity.maxParticipants}명
                                            </span>
                                        </div>

                                        {/* Team Trigger Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startTeamSetup(activity.id);
                                            }}
                                            className="ml-auto text-[11px] bg-[#10B981] text-black px-4 py-2 rounded-full font-black flex items-center gap-1.5 hover:bg-[#059669] hover:scale-105 active:scale-95 transition-all shadow-[0_4px_15px_rgba(16,185,129,0.2)] cursor-pointer z-20"
                                        >
                                            <LucideZap className="w-3.5 h-3.5 fill-current" /> 팀 편성
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {activity.description && (
                                <div className="mb-5 px-3 py-2 bg-white/[0.02] rounded-xl border border-white/[0.05]">
                                    <p className="text-[11px] text-white/40 leading-relaxed italic">
                                        " {activity.description} "
                                    </p>
                                </div>
                            )}

                            {/* WIZARD & RESULT SECTION */}
                            {isExpanded && currentTeamData && (
                                <div className="mb-5 bg-[#141414] rounded-[1.5rem] overflow-hidden border border-white/5 shadow-2xl animate-in slide-in-from-top-4 fade-in duration-500">

                                    {/* STEP 1: WIZARD SETUP */}
                                    {currentTeamData.step === 'setup' && (
                                        <div className="p-5">
                                            <div className="flex items-center justify-between mb-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center">
                                                        <LucideZap className="w-5 h-5 text-[#10B981]" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white leading-tight">팀 편성 마법사</h4>
                                                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Team Generator Pro</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setExpandedActivityId(null)}
                                                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                                                    aria-label="닫기"
                                                >
                                                    <LucideX className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* 1. Dual Control Panel */}
                                            <div className="mb-6">
                                                <div className="bg-[#1c1c1c] rounded-2xl p-5 border border-white/[0.05] space-y-5">
                                                    <div className="flex flex-col items-center gap-1 pb-2 border-b border-white/[0.05]">
                                                        <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">현재 참여 인원</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl font-black text-white">{activity.participants?.length || 0}</span>
                                                            <span className="text-sm font-bold text-[#10B981]">PLAYERS</span>
                                                        </div>
                                                        {(femalesCount > 0 && malesCount > 0) && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">NAM {malesCount}</span>
                                                                <span className="text-[10px] font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full">YEO {femalesCount}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Row 1: Team Count */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-white/60 font-medium">팀 개수</span>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => setTeamData({ ...teamData, [activity.id]: { ...currentTeamData, count: Math.max(1, currentTeamData.count - 1) } })}
                                                                className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
                                                                disabled={currentTeamData.count <= 1}
                                                                aria-label="팀 개수 감소"
                                                            >
                                                                <LucideMinus className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-sm font-black text-white w-14 text-center">{currentTeamData.count}개 팀</span>
                                                            <button
                                                                onClick={() => setTeamData({ ...teamData, [activity.id]: { ...currentTeamData, count: Math.min((activity.participants?.length || 50), currentTeamData.count + 1) } })}
                                                                className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
                                                                aria-label="팀 개수 증가"
                                                            >
                                                                <LucidePlus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Members per Team (Derived Control) */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-white/60 font-medium">팀당 인원</span>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => {
                                                                    const total = activity.participants?.length || 0;
                                                                    const currentM = Math.floor(total / currentTeamData.count) || 1;
                                                                    // To decrease members, we need MORE teams. Find the next count that results in strictly fewer members.
                                                                    let nextCount = currentTeamData.count + 1;
                                                                    while (nextCount <= total) {
                                                                        const nextM = Math.floor(total / nextCount);
                                                                        if (nextM < currentM) break;
                                                                        nextCount++;
                                                                    }
                                                                    if (nextCount <= total) {
                                                                        setTeamData({ ...teamData, [activity.id]: { ...currentTeamData, count: nextCount } });
                                                                    }
                                                                }}
                                                                className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
                                                            >
                                                                <LucideMinus className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-sm font-black text-white w-14 text-center">
                                                                {Math.floor((activity.participants?.length || 0) / currentTeamData.count)}명씩
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    const total = activity.participants?.length || 0;
                                                                    const currentM = Math.floor(total / currentTeamData.count) || 1;
                                                                    // To increase members, we need FEWER teams. Find the next count that results in strictly more members.
                                                                    let nextCount = currentTeamData.count - 1;
                                                                    while (nextCount >= 1) {
                                                                        const nextM = Math.floor(total / nextCount);
                                                                        if (nextM > currentM) break;
                                                                        nextCount--;
                                                                    }
                                                                    if (nextCount >= 1) {
                                                                        setTeamData({ ...teamData, [activity.id]: { ...currentTeamData, count: nextCount } });
                                                                    }
                                                                }}
                                                                className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
                                                            >
                                                                <LucidePlus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Preview Text */}
                                                <div className="mt-3 text-center">
                                                    {(() => {
                                                        const total = activity.participants?.length || 0;
                                                        const count = currentTeamData.count;
                                                        const surplus = total % count;

                                                        return (
                                                            <span className="text-xs text-white/40">
                                                                총 <span className="text-white font-bold">{count}개 팀</span> 생성
                                                                {surplus > 0 ? (
                                                                    <> | <span className="text-[#FF9100] font-bold">{surplus}명</span> 인원 불균형(깍두기)</>
                                                                ) : (
                                                                    <> | <span className="text-[#64DD17] font-bold">인원 딱 맞음!</span></>
                                                                )}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* GENDER CONTROL */}
                                            {femalesCount > 0 && malesCount > 0 && (
                                                <div className="mb-6 bg-[#1a1a1a] rounded-xl p-1 flex relative">
                                                    {['random', 'spread', 'group'].map((mode) => (
                                                        <button
                                                            key={mode}
                                                            onClick={() => setTeamData({ ...teamData, [activity.id]: { ...currentTeamData, genderDist: mode } })}
                                                            className={cn(
                                                                "flex-1 py-2 text-[11px] font-bold rounded-lg transition-all z-10 relative",
                                                                currentTeamData.genderDist === mode || (!currentTeamData.genderDist && mode === 'random')
                                                                    ? "text-black shadow-sm"
                                                                    : "text-white/40 hover:text-white/80"
                                                            )}
                                                        >
                                                            {mode === 'random' && "랜덤"}
                                                            {mode === 'spread' && "성비 균형"}
                                                            {mode === 'group' && "성별 구분"}
                                                        </button>
                                                    ))}
                                                    <div
                                                        className="absolute top-1 bottom-1 rounded-lg bg-[#64DD17] transition-all duration-300"
                                                        style={{
                                                            width: '33.33%',
                                                            left: currentTeamData.genderDist === 'spread' ? '33.33%'
                                                                : currentTeamData.genderDist === 'group' ? '66.66%'
                                                                    : '0%'
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            {/* 3. Method Selection Cards (2 Cols) */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => runGeneration(activity.id, activity.participants)}
                                                    className="bg-[#1a1a1a] hover:bg-[#64DD17] border border-white/5 hover:border-[#64DD17] rounded-xl p-4 flex items-center justify-center transition-all group"
                                                >
                                                    <span className="text-sm font-bold text-white group-hover:text-black">밸런스</span>
                                                </button>
                                                <button
                                                    onClick={() => runGeneration(activity.id, activity.participants)}
                                                    className="bg-[#1a1a1a] hover:bg-[#64DD17] border border-white/5 hover:border-[#64DD17] rounded-xl p-4 flex items-center justify-center transition-all group"
                                                >
                                                    <span className="text-sm font-bold text-white group-hover:text-black">랜덤</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* STEP 2: RESULT DISPLAY (Dynamic Layouts) */}
                                    {currentTeamData.step === 'result' && (
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            {/* Header */}
                                            <div className="bg-[#2C2C2C] px-4 py-2 flex items-center justify-between border-b border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">📢</span>
                                                    <span className="text-xs font-bold text-white">팀 편성 결과 ({currentTeamData.teams.length}팀)</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-[#64DD17] bg-[#64DD17]/10 px-1.5 py-0.5 rounded border border-[#64DD17]/20">AI 밸런스</span>
                                            </div>

                                            {/* Content: Dynamic Layout based on count */}
                                            <div className="p-4 relative">

                                                {/* CASE A: 2 TEAMS (VS MODE) */}
                                                {currentTeamData.teams.length === 2 && (
                                                    <div className="relative">
                                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                                            <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border-2 border-white/10 flex items-center justify-center shadow-xl">
                                                                <span className="text-[10px] font-black text-white/40 italic">VS</span>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {currentTeamData.teams.map((team: any, idx: number) => (
                                                                <div key={idx} className={cn("col-span-1 rounded-xl p-3 border relative", idx === 0 ? "bg-[#3b82f6]/10 border-[#3b82f6]/20" : "bg-[#ef4444]/10 border-[#ef4444]/20")}>
                                                                    <div className="text-center mb-3">
                                                                        <h4 className={cn("text-[11px] font-black", idx === 0 ? "text-[#3b82f6]" : "text-[#ef4444]")}>{team.name}</h4>
                                                                        <span className="text-[9px] text-white/40 font-medium">Avg: {team.avg}</span>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {team.members.map((m: any, mIdx: number) => {
                                                                            const isMeInResult = m.memberId === currentMemberId;
                                                                            return (
                                                                                <div key={mIdx} className={cn("flex items-center gap-2", idx === 1 && "justify-end")}>
                                                                                    {idx === 0 && (
                                                                                        <Avatar className={cn("w-6 h-6 border", isMeInResult ? "border-[#10B981]" : "border-[#3b82f650]")}>
                                                                                            <AvatarImage src={m.member?.profileImageUrl} />
                                                                                            <AvatarFallback className="text-[9px]">{m.member?.name?.[0]}</AvatarFallback>
                                                                                        </Avatar>
                                                                                    )}
                                                                                    <span className={cn(
                                                                                        "text-[10px] font-medium",
                                                                                        isMeInResult ? "text-[#10B981] font-bold" : "text-white/80"
                                                                                    )}>
                                                                                        {m.member?.name}
                                                                                        {isMeInResult && " (나)"}
                                                                                    </span>
                                                                                    {idx === 1 && (
                                                                                        <Avatar className={cn("w-6 h-6 border", isMeInResult ? "border-[#10B981]" : "border-[#ef444450]")}>
                                                                                            <AvatarImage src={m.member?.profileImageUrl} />
                                                                                            <AvatarFallback className="text-[9px]">{m.member?.name?.[0]}</AvatarFallback>
                                                                                        </Avatar>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* CASE B: 3-4 TEAMS (GRID MODE) */}
                                                {(currentTeamData.teams.length === 3 || currentTeamData.teams.length === 4) && (
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {currentTeamData.teams.map((team: any, idx: number) => (
                                                            <div key={idx} className="bg-[#1a1a1a] border border-white/5 rounded-xl p-3 hover:border-white/20 transition-all">
                                                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                                                                    <h4 className="text-[11px] font-black" style={{ color: team.color }}>{team.name}</h4>
                                                                    <span className="text-[9px] text-white/30">{team.avg}pts</span>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {team.members.map((m: any, mIdx: number) => {
                                                                        const isMeInResult = m.memberId === currentMemberId;
                                                                        return (
                                                                            <div key={mIdx} className="flex items-center gap-1.5">
                                                                                <div className={cn("w-1.5 h-1.5 rounded-full", isMeInResult && "animate-pulse")} style={{ backgroundColor: isMeInResult ? '#10B981' : team.color }} />
                                                                                <span className={cn(
                                                                                    "text-[10px]",
                                                                                    isMeInResult ? "text-[#10B981] font-bold" : "text-white/70"
                                                                                )}>
                                                                                    {m.member?.name}
                                                                                    {isMeInResult && " (나)"}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* CASE C: 5+ TEAMS (LIST MODE) */}
                                                {currentTeamData.teams.length >= 5 && (
                                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                                        {currentTeamData.teams.map((team: any, idx: number) => {
                                                            const isExpanded = currentTeamData.expandedTeamIndex === idx;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    onClick={() => setTeamData({
                                                                        ...teamData,
                                                                        [activity.id]: {
                                                                            ...currentTeamData,
                                                                            expandedTeamIndex: isExpanded ? null : idx
                                                                        }
                                                                    })}
                                                                    className={cn(
                                                                        "border border-white/5 p-3 transition-all cursor-pointer hover:border-white/20 hover:bg-[#252525]",
                                                                        "rounded-xl", // Changed from generic rounding to rounded-xl for 'soft square'
                                                                        isExpanded ? "bg-[#222] gap-0" : "bg-[#1a1a1a] flex items-center justify-between"
                                                                    )}
                                                                >
                                                                    {/* Header Section */}
                                                                    <div className={cn("flex items-center gap-3", isExpanded ? "border-b border-white/5 pb-3 mb-3" : "")}>
                                                                        <div className={cn("rounded-full", isExpanded ? "w-1.5 h-6" : "w-1 h-8")} style={{ backgroundColor: team.color }} />
                                                                        <div className="flex-1">
                                                                            <h4 className="text-[13px] font-bold text-white flex items-center gap-2">
                                                                                {team.name}
                                                                                {isExpanded && <span className="text-[9px] font-normal text-white/40 px-1.5 py-0.5 rounded-full border border-white/10">{team.members.length}명</span>}
                                                                            </h4>
                                                                            <span className="text-[10px] text-white/30 hidden sm:inline-block">Avg: {team.avg}</span>
                                                                        </div>

                                                                        {/* Collapsed State: Avatar Stack */}
                                                                        {!isExpanded && (
                                                                            <div className="flex -space-x-2">
                                                                                {team.members.map((m: any, mIdx: number) => (
                                                                                    <Avatar key={mIdx} className="w-7 h-7 border-2 border-[#1a1a1a]">
                                                                                        <AvatarImage src={m.member?.profileImageUrl} />
                                                                                        <AvatarFallback className="text-[9px] bg-[#333] text-white/60">{m.member?.name?.[0]}</AvatarFallback>
                                                                                    </Avatar>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Expanded State: Big Grid View */}
                                                                    {isExpanded && (
                                                                        <div className="grid grid-cols-4 gap-3 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                            {team.members.map((m: any, mIdx: number) => (
                                                                                <div key={mIdx} className="flex flex-col items-center gap-1.5 p-1 rounded-lg hover:bg-white/5 transition-colors">
                                                                                    <Avatar className="w-12 h-12 border-2 border-[#1a1a1a] shadow-lg">
                                                                                        <AvatarImage src={m.member?.profileImageUrl} />
                                                                                        <AvatarFallback className="text-sm bg-[#333] text-white font-bold">{m.member?.name?.[0]}</AvatarFallback>
                                                                                    </Avatar>
                                                                                    <span className="text-[11px] font-medium text-white/90 text-center leading-tight truncate w-full">
                                                                                        {m.member?.name}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                <div className="flex flex-col sm:flex-row justify-center mt-6 gap-3">
                                                    <button
                                                        onClick={() => resetSetup(activity.id)}
                                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/5"
                                                    >
                                                        <LucideRefreshCw className="w-3.5 h-3.5" /> 다시 옵션 설정
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const dateStr = format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko });
                                                            const locStr = activity.locationName || "장소 미정";
                                                            const pCount = activity.participants?.length || 0;

                                                            const tStr = currentTeamData.teams.map((t: any) =>
                                                                `[${t.name}]\n${t.members.map((m: any) => `• ${m.member?.nickname || m.member?.name}`).join('\n')}`
                                                            ).join('\n\n');

                                                            const fullMsg = `[🎱 팀 편성 결과]\n--------------------------\n📌 모임: ${activity.title}\n📅 일시: ${dateStr}\n📍 장소: ${locStr}\n👥 인원: ${pCount}명\n\n--------------------------\n\n${tStr}`;

                                                            if (onShareToChat) {
                                                                onShareToChat(fullMsg);
                                                                toast({ title: "공유 완료!", description: "채팅방에 팀 편성 결과가 전송되었습니다." });
                                                            } else {
                                                                navigator.clipboard.writeText(fullMsg);
                                                                toast({ title: "복사 완료!", description: "팀 결과가 복사되었습니다. 채팅방에 붙여넣으세요!" });
                                                            }
                                                        }}
                                                        className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[12px] bg-[#10B981] text-black hover:bg-[#059669] transition-all font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] shadow-emerald-500/20"
                                                    >
                                                        <LucideMessageCircle className="w-4 h-4" /> 채팅방에 결과 공유하기
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {isMember && !isJoined && (
                                <Button
                                    className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-black font-extrabold h-11 rounded-xl text-xs shadow-lg shadow-[#22c55e]/10 group/btn"
                                    onClick={() => joinMutation.mutate(activity.id)}
                                    disabled={isFull || joinMutation.isPending}
                                >
                                    {isFull ? "인원 마감" : (
                                        <span className="flex items-center gap-2 font-extrabold">
                                            참여하기 <LucideChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                    )}
                                </Button>
                            )}

                            {isMember && isJoined && (
                                <div className="w-full bg-white/5 border border-white/5 py-2.5 rounded-xl text-center text-[10px] font-extrabold text-white/20 uppercase tracking-widest">
                                    참여 중인 정모입니다
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}

            {/* Create Activity Trigger Card */}
            {isMember && (
                <Card
                    className="bg-[#1a1a1a]/50 border-white/5 border-dashed border-2 hover:border-[#22c55e] hover:bg-[#22c55e]/5 transition-all cursor-pointer group rounded-[2rem]"
                    onClick={onCreateClick}
                >
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                        <div className="w-12 h-12 rounded-full bg-[#22c55e]/10 group-hover:bg-[#22c55e] flex items-center justify-center transition-colors">
                            <LucidePlus className="w-6 h-6 text-[#22c55e] group-hover:text-black transition-colors" />
                        </div>
                        <h3 className="text-white font-semibold group-hover:text-[#22c55e] transition-colors">새로운 정모 만들기</h3>
                        <p className="text-xs text-white/40 font-medium">언제든 자유롭게 모임을 시작해보세요!</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
