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
import { LucidePlus, LucideTent, LucideChevronRight, LucideZap, LucideCrown, LucideRefreshCw } from "lucide-react";

interface ClubActivityListProps {
    crewId: string;
    isMember: boolean;
    currentMemberId?: string;
    onCreateClick: () => void;
}

export function GolfRoomList({ crewId, isMember, currentMemberId, onCreateClick }: ClubActivityListProps) {
    const { toast } = useToast();
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

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

    if (isLoading) return <div className="text-center py-8 text-white/20">Loading activities...</div>;

    const upcomingActivities: any[] = Array.isArray(activities) ? activities : [];

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
                                            <div className="flex -space-x-1.5">
                                                {(activity.participants || []).slice(0, 3).map((p: any, idx: number) => (
                                                    <Avatar key={idx} className="w-5 h-5 border-2 border-[#1a1a1a] shadow-lg">
                                                        <AvatarImage src={p.member?.profileImageUrl} />
                                                        <AvatarFallback className="bg-[#2a2a2a] text-[9px] font-semibold text-white/40">
                                                            {p.member?.name?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(activity.participants?.length || 0) > 3 && (
                                                    <div className="w-5 h-5 rounded-full bg-[#2a2a2a] border-2 border-[#1a1a1a] flex items-center justify-center text-[8px] font-semibold text-white/40 shadow-lg relative z-10">
                                                        +{activity.participants.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[11px] font-extrabold text-white/40">
                                                {activity.participants?.length || 0} / {activity.maxParticipants}명
                                            </span>
                                        </div>

                                        {/* Team Building Trigger (Force visible for testing) */}
                                        {true && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Toggle logic for demo: In real app, this would open a dialog
                                                    setExpandedTeamId(expandedTeamId === activity.id ? null : activity.id);
                                                }}
                                                className="ml-auto text-[10px] bg-[#64DD17] text-[#051907] px-2.5 py-1.5 rounded-full font-black flex items-center gap-1 hover:bg-[#76ff03] hover:scale-105 transition-all shadow-[0_0_10px_rgba(100,221,23,0.3)] cursor-pointer z-50"
                                            >
                                                <LucideZap className="w-3 h-3 fill-current" /> 팀 편성
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {activity.description && (
                                <div className="mb-5 pl-2 border-l-2 border-white/5">
                                    <p className="text-[11px] text-white/50 leading-relaxed line-clamp-1">
                                        {activity.description}
                                    </p>
                                </div>
                            )}

                            {/* Team Matchup Result Card (Dynamic Display) */}
                            {expandedTeamId === activity.id && (
                                <div className="mb-5 bg-[#252525] rounded-xl overflow-hidden border border-white/5 animate-in slide-in-from-top-4 fade-in duration-300">
                                    {/* Header */}
                                    <div className="bg-[#2C2C2C] px-4 py-2 flex items-center justify-between border-b border-white/5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📢</span>
                                            <span className="text-xs font-bold text-white">팀 편성 결과</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-[#64DD17] bg-[#64DD17]/10 px-1.5 py-0.5 rounded border border-[#64DD17]/20">
                                            AI 밸런스 적용됨
                                        </span>
                                    </div>

                                    {/* Matchup Content */}
                                    <div className="p-4 relative">
                                        {/* VS Badge */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                            <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border-2 border-white/10 flex items-center justify-center shadow-xl">
                                                <span className="text-[10px] font-black text-white/40 italic">VS</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Team A */}
                                            <div className="bg-[#3b82f6]/10 col-span-1 rounded-xl p-3 border border-[#3b82f6]/20 relative">
                                                <div className="text-center mb-3">
                                                    <h4 className="text-[11px] font-black text-[#3b82f6]">BLUE TEAM</h4>
                                                    <span className="text-[9px] text-white/40 font-medium">Avg: 88.5</span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="w-6 h-6 border border-[#3b82f6]/30"><AvatarFallback className="text-[9px]">김</AvatarFallback></Avatar>
                                                        <span className="text-[10px] font-bold text-white">김철수 <LucideCrown className="w-2.5 h-2.5 inline text-yellow-500 ml-0.5" /></span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="w-6 h-6 border border-[#3b82f6]/30"><AvatarFallback className="text-[9px]">박</AvatarFallback></Avatar>
                                                        <span className="text-[10px] font-medium text-white/80">박민수</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Team B */}
                                            <div className="bg-[#ef4444]/10 col-span-1 rounded-xl p-3 border border-[#ef4444]/20">
                                                <div className="text-center mb-3">
                                                    <h4 className="text-[11px] font-black text-[#ef4444]">RED TEAM</h4>
                                                    <span className="text-[9px] text-white/40 font-medium">Avg: 89.0</span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        <span className="text-[10px] font-bold text-white">이영희</span>
                                                        <Avatar className="w-6 h-6 border border-[#ef4444]/30"><AvatarFallback className="text-[9px]">이</AvatarFallback></Avatar>
                                                    </div>
                                                    <div className="flex items-center gap-2 justify-end">
                                                        <span className="text-[10px] font-medium text-white/80">최정환</span>
                                                        <Avatar className="w-6 h-6 border border-[#ef4444]/30"><AvatarFallback className="text-[9px]">최</AvatarFallback></Avatar>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Re-shuffle */}
                                        <div className="flex justify-center mt-3">
                                            <button className="flex items-center gap-1 text-[9px] text-white/30 hover:text-white transition-colors">
                                                <LucideRefreshCw className="w-3 h-3" /> 다시 편성하기
                                            </button>
                                        </div>
                                    </div>
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
