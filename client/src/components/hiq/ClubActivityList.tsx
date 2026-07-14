import { differenceInDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LucidePlus, LucideCalendarDays, LucideChevronRight } from "@/lib/icons";

interface ClubActivityListProps {
    crewId: string;
    isMember: boolean;
    currentMemberId?: string;
    onCreateClick: () => void;
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";

export function ClubActivityList({ crewId, isMember, currentMemberId, onCreateClick }: ClubActivityListProps) {
    const { toast } = useToast();

    const { data: activities, isLoading, isError, refetch } = useQuery({
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

    if (isLoading) return <div className="text-center py-8 text-black/40">활동 불러오는 중...</div>;

    const upcomingActivities: any[] = Array.isArray(activities) ? activities : [];

    return (
        <div className="space-y-4 px-6 pt-0 pb-6">
            <div className="flex items-center gap-2 mb-2">
                <LucideCalendarDays className="w-5 h-5 text-brand" />
                <h2 className="text-lg font-semibold text-ink-1">정모 / 일정</h2>
            </div>

            {/* Existing Activities */}
            {upcomingActivities.map((activity: any) => {
                const isJoined = activity.participants?.some((p: any) => p.memberId === currentMemberId);
                const isFull = (activity.participants?.length || 0) >= (activity.maxParticipants || 8);

                // D-Day Calculation
                const diff = differenceInDays(startOfDay(new Date(activity.activityDate)), startOfDay(new Date()));
                const dDayText = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : "종료";
                const dDayColor = diff === 0 ? "bg-red-500 text-white" : diff > 0 && diff <= 3 ? "bg-orange-500 text-white" : "bg-brand text-brand-fg";

                return (
                    <Card key={activity.id} className="rk-card overflow-hidden rounded-card group hover:border-brand/30 transition-colors">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("px-2 py-0.5 rounded-md text-xs font-bold tabular-nums", dDayColor)}>
                                            {dDayText}
                                        </div>
                                        <h3 className="font-bold text-lg text-ink-1">{activity.title}</h3>
                                    </div>
                                    <p className="text-xs text-black/55 font-medium ml-0.5">공식 모임</p>
                                </div>
                                {isJoined && (
                                    <div className="flex items-center gap-1 text-xs font-semibold text-brand bg-brand/10 px-2 py-1 rounded-pill border border-brand/20">
                                        <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                                        참여중
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 mb-5 text-[13px]">
                                {/* Info Items */}
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-black/55">일시</div>
                                    <div className="font-semibold text-black/70">
                                        {format(new Date(activity.activityDate), "M월 d일 (E) a h:mm", { locale: ko })}
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-black/55 mt-0.5">위치</div>
                                    <div className="font-semibold text-black/70">
                                        {activity.locationName || "장소 미정"}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-10 shrink-0 text-xs font-semibold text-black/55">비용</div>
                                    <div className="font-semibold text-black/70">
                                        {activity.cost || "협의 / n분의 1"}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center">
                                        <div className="w-10 shrink-0 text-xs font-semibold text-black/55">참석</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-1.5">
                                                {(activity.participants || []).slice(0, 3).map((p: any, idx: number) => (
                                                    <Avatar key={idx} className="w-5 h-5 border-2 border-white">
                                                        <AvatarImage src={p.member?.profileImageUrl} />
                                                        <AvatarFallback className="bg-surface-3 text-xs font-medium text-black/55">
                                                            {p.member?.name?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(activity.participants?.length || 0) > 3 && (
                                                    <div className="w-5 h-5 rounded-full bg-surface-3 border-2 border-white flex items-center justify-center text-xs font-medium text-black/55 relative z-10">
                                                        +{activity.participants.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold tabular-nums text-black/55">
                                                {activity.participants?.length || 0} / {activity.maxParticipants}명
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {activity.description && (
                                <div className="mb-5 pl-2 border-l-2 border-black/10">
                                    <p className="text-xs text-black/55 leading-relaxed line-clamp-1">
                                        {activity.description}
                                    </p>
                                </div>
                            )}

                            {isMember && !isJoined && (
                                <Button
                                    className="w-full bg-brand hover:bg-brand text-brand-fg font-bold h-11 rounded-tile text-xs group/btn"
                                    onClick={() => joinMutation.mutate(activity.id)}
                                    disabled={isFull || joinMutation.isPending}
                                >
                                    {isFull ? "인원 마감" : (
                                        <span className="flex items-center gap-2 font-bold">
                                            참여하기 <LucideChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                    )}
                                </Button>
                            )}

                            {isMember && isJoined && (
                                <div className="w-full bg-brand/[0.06] border border-brand/15 py-2.5 rounded-tile text-center text-xs font-semibold text-brand">
                                    참여 중인 정모입니다
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}

            {/* Error State */}
            {isError && (
                <Card className="rk-card rounded-card">
                    <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
                            <LucideCalendarDays className="w-6 h-6 text-black/40" />
                        </div>
                        <p className="text-sm font-semibold text-black/70">일정을 불러오지 못했습니다</p>
                        <Button
                            variant="ghost"
                            onClick={() => refetch()}
                            className="h-10 px-5 rounded-pill bg-surface-3 hover:bg-black/[0.06] text-black/70 text-xs font-semibold"
                        >
                            다시 시도
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {!isError && upcomingActivities.length === 0 && (
                <Card className="rk-card rounded-card">
                    <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center mb-1">
                            <LucideCalendarDays className="w-6 h-6 text-black/40" />
                        </div>
                        <h3 className="text-sm font-semibold text-black/70">예정된 정모가 없습니다</h3>
                        <p className="text-xs text-black/55 font-medium">
                            {isMember ? "첫 정모를 만들어 멤버들과 모여보세요." : "곧 새로운 모임이 열릴 예정이에요."}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Create Activity Trigger Card */}
            {isMember && (
                <Card
                    className="bg-surface-1 border-surface-line border-dashed border-2 hover:border-brand hover:bg-brand/5 transition-colors cursor-pointer group rounded-card"
                    onClick={onCreateClick}
                >
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                        <div className="w-12 h-12 rounded-full bg-brand/10 group-hover:bg-brand flex items-center justify-center transition-colors">
                            <LucidePlus className="w-6 h-6 text-brand group-hover:text-brand-fg transition-colors" />
                        </div>
                        <h3 className="text-ink-1 font-semibold group-hover:text-brand transition-colors">새로운 정모 만들기</h3>
                        <p className="text-xs text-black/55 font-medium">언제든 자유롭게 모임을 시작해보세요!</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
