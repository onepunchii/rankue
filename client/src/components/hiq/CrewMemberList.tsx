
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiqMember } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetTrigger
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LucideCrown, LucideShield, LucideFlame, LucideSnowflake, LucideSwords, LucideMessageCircle, LucideTrophy, LucideTrendingUp, LucideClock, LucideChevronRight, LucideStar } from "lucide-react";
import { cn } from "@/lib/utils";

// Extended interface to include joined fields from Profile
interface EnhancedHiqMember extends HiqMember {
    nickname?: string;
    profileImageUrl?: string;
}

interface CrewMemberListProps {
    members: {
        member: EnhancedHiqMember;
        role: "owner" | "admin" | "member" | "leader" | "manage" | "pending";
        joinedAt: string;
    }[];
    currentMemberId?: string;
    currentUserGender?: string;
    sportCategory?: "BILLIARDS" | "GOLF" | "MIXED";
}

export function CrewMemberList({ members, currentMemberId, sportCategory = "BILLIARDS" }: CrewMemberListProps) {
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Sort: Leader first, then admins, then joinedAt
    const sortedMembers = useMemo(() => {
        return [...members].sort((a, b) => {
            const roleOrder = { leader: 3, manage: 2, member: 1, pending: 0 } as any;
            const scoreA = roleOrder[a.role] || 0;
            const scoreB = roleOrder[b.role] || 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        });
    }, [members]);

    const handleMemberClick = (memberItem: any) => {
        setSelectedMember(memberItem);
        setIsSheetOpen(true);
    };



    // Query for Vs Me Stats (H2H)
    const { data: vsMeStats } = useQuery<any>({
        queryKey: [`/api/hiq/stats/h2h/${selectedMember?.member?.id}`],
        enabled: isSheetOpen && !!selectedMember && !!currentMemberId && selectedMember.member.id !== currentMemberId
    });

    // Query for Analysis (Trend)
    const { data: analysis } = useQuery<any>({
        queryKey: [`/api/hiq/stats/analysis`, { memberId: selectedMember?.member?.id, type: '4c' }],
        enabled: isSheetOpen && !!selectedMember
    });

    const trend = useMemo(() => {
        if (!analysis?.summary) return null;
        const overall = parseFloat(analysis.summary.overallAvg || "0");
        const recent = parseFloat(analysis.summary.recentAvg || "0");
        const matchCount = analysis.summary.matchCount || 0;

        if (matchCount === 0) return { label: "신규 멤버", color: "text-blue-400", icon: <LucideTrophy className="w-4 h-4 text-blue-400" /> };
        if (overall === 0) return { label: "기록 없음", color: "text-white/40", icon: <LucideClock className="w-4 h-4 text-white/40" /> };

        if (recent > overall * 1.05) return { label: "HOT (상승세)", color: "text-red-400", icon: <LucideFlame className="w-4 h-4 text-red-500" /> };
        if (recent < overall * 0.95) return { label: "COLD (하락세)", color: "text-blue-300", icon: <LucideSnowflake className="w-4 h-4 text-blue-300" /> };

        return { label: "STABLE (유지)", color: "text-green-400", icon: <LucideTrendingUp className="w-4 h-4 text-green-400" /> };
    }, [analysis]);

    return (
        <>
            <div className="flex flex-col gap-2">
                {sortedMembers.map((item) => {
                    const m = item.member;
                    const isLeader = item.role === "leader";
                    const isAdmin = item.role === "manage";
                    const isMe = m.id === currentMemberId;

                    // Newbie Logic: Joined within 7 days
                    const joinedDate = new Date(item.joinedAt);
                    const daysSinceJoined = (Date.now() - joinedDate.getTime()) / (1000 * 3600 * 24);
                    const isNewbie = daysSinceJoined < 7;

                    // Calculate both 3C and 4C averages (Directly from DB only)
                    const avg3c = m.avg3c && m.avg3c > 0
                        ? m.avg3c.toFixed(3)
                        : "0.000";

                    const avg4c = m.avg4c && m.avg4c > 0
                        ? m.avg4c.toFixed(3)
                        : "0.000";

                    return (
                        <div
                            key={m.id}
                            onClick={() => handleMemberClick(item)}
                            className={cn(
                                "flex items-center justify-between p-4 mb-2 rounded-[1.25rem] border transition-all duration-300 cursor-pointer group",
                                isMe
                                    ? "bg-gradient-to-br from-[#1c1c1c] to-[#121212] border-emerald-500/20"
                                    : "bg-[#1a1a1a] border-white/5 hover:border-white/10"
                            )}
                        >
                            {/* Left: Avatar + Info */}
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <Avatar className={cn(
                                        "w-14 h-14 border-2 transition-transform duration-500 group-hover:scale-105",
                                        isMe ? "border-emerald-500/30" : "border-[#262626]"
                                    )}>
                                        <AvatarImage src={m.profileImageUrl || undefined} className="object-cover" />
                                        <AvatarFallback className="bg-[#262626] text-white/40 text-lg font-semibold">
                                            {m.nickname?.[0] || m.name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    {isMe && (
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#10B981] rounded-full border-2 border-[#1a1a1a] flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col justify-center gap-1.5">
                                    {/* Row 1: Name + Role + Badges */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white font-semibold text-[17px] leading-tight tracking-tight">
                                            {m.nickname || m.name}
                                        </span>

                                        {/* Roles */}
                                        {isLeader && (
                                            <span className="text-sm drop-shadow-md" title="크루장">👑</span>
                                        )}
                                        {isAdmin && (
                                            <span className="text-sm drop-shadow-md" title="운영진">⭐️</span>
                                        )}

                                        {/* Status Badges */}
                                        <div className="flex items-center gap-1 ml-1">
                                            {isMe && (
                                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-extrabold uppercase tracking-tighter relative overflow-hidden">
                                                    나
                                                    <span className="absolute inset-0 bg-emerald-500/10 animate-pulse" />
                                                </span>
                                            )}
                                            {isNewbie && (
                                                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-extrabold uppercase tracking-tighter">New</span>
                                            )}
                                            {m.gender === 'female' ? (
                                                <span className="px-1.5 py-0.5 rounded-md bg-pink-500/10 text-pink-500 text-[10px] font-extrabold tracking-tighter">여</span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-extrabold tracking-tighter">남</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Row 2: Stats (Simplified & Clean) */}
                                    <div className="flex items-center gap-1.5">
                                        {sportCategory === 'GOLF' ? (
                                            <>
                                                <div className="bg-white/[0.03] border border-white/5 rounded-lg px-2 py-1 flex items-center gap-1.5">
                                                    <span className="text-[9px] font-extrabold text-white/30 uppercase tracking-widest">H</span>
                                                    <span className="text-xs font-semibold text-[#10B981] tabular-nums">{(m.golfHandicap || 0).toFixed(1)}</span>
                                                </div>
                                                <div className="bg-white/[0.03] border border-white/5 rounded-lg px-2 py-1 flex items-center gap-1.5">
                                                    <span className="text-[9px] font-extrabold text-white/30 uppercase tracking-widest">B</span>
                                                    <span className="text-xs font-semibold text-blue-400 tabular-nums">{Math.round(m.golfBestScore || 0)}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-1 flex items-center gap-2 group-hover:bg-white/[0.05] transition-colors">
                                                    <span className="text-[10px] font-extrabold text-emerald-500/60 tracking-wider">3C</span>
                                                    <span className="text-[13px] font-bold text-white tabular-nums tracking-tight">{avg3c}</span>
                                                </div>
                                                <div className="bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-1 flex items-center gap-2 group-hover:bg-white/[0.05] transition-colors">
                                                    <span className="text-[10px] font-extrabold text-blue-500/60 tracking-wider">4C</span>
                                                    <span className="text-[13px] font-bold text-white tabular-nums tracking-tight">{avg4c}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Action */}
                            <div className="text-white/10 group-hover:text-white/30 transition-colors">
                                <LucideChevronRight className="w-5 h-5" />
                            </div>
                        </div>
                    );
                })}
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="bottom" className="h-[85vh] rounded-t-[2rem] bg-[#0f0f0f] border-t border-white/10 p-0 overflow-hidden">
                    {selectedMember && (
                        <div className="h-full flex flex-col overflow-y-auto pb-safe">
                            <div className="relative pt-12 pb-8 px-6 flex flex-col items-center bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f]">
                                <div className="absolute top-3 w-12 h-1 bg-white/10 rounded-full left-1/2 -translate-x-1/2" />

                                <Avatar className={cn(
                                    "w-24 h-24 mb-4 border-4 shadow-2xl",
                                    selectedMember.member.gender === 'female' ? "border-pink-500/30" : "border-white/5"
                                )}>
                                    <AvatarImage src={selectedMember.member.profileImageUrl || undefined} />
                                    <AvatarFallback className="text-2xl font-semibold bg-[#262626] text-white/20">
                                        {selectedMember.member.nickname?.[0]}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-2xl font-extrabold text-white">{selectedMember.member.nickname}</h2>
                                    {selectedMember.member.gender === 'female' && <span className="text-lg">🌸</span>}
                                    {selectedMember.role === 'leader' && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                                            <span className="text-sm">👑</span>
                                            <span className="text-[10px] font-extrabold text-yellow-500 uppercase tracking-widest">크루장</span>
                                        </div>
                                    )}
                                    {selectedMember.role === 'manage' && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md">
                                            <span className="text-sm">⭐️</span>
                                            <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest">운영진</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-white/40 mb-6">
                                    {selectedMember.member.birthYear ? `${Math.floor((new Date().getFullYear() - selectedMember.member.birthYear) / 10) * 10}대` : '연령 미입력'}
                                    {' • '}
                                    {selectedMember.member.gender === 'female' ? '여성' : '남성'}
                                </p>

                                <div className="flex items-center justify-center gap-8 w-full max-w-sm py-4">
                                    {sportCategory === 'GOLF' ? (
                                        <>
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-[10px] text-[#10B981] font-extrabold uppercase tracking-widest bg-[#10B981]/10 px-2 py-0.5 rounded-full mb-1">Handicap</span>
                                                <span className="text-4xl font-extrabold text-white tracking-tighter">
                                                    {selectedMember.member.golfHandicap ? selectedMember.member.golfHandicap.toFixed(1) : "0.0"}
                                                </span>
                                                <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">HDCP</span>
                                            </div>
                                            <div className="w-px h-16 bg-white/10" />
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full mb-1">Best Score</span>
                                                <span className="text-4xl font-extrabold text-white tracking-tighter">
                                                    {selectedMember.member.golfBestScore || "0"}
                                                </span>
                                                <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">BEST</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-[10px] text-[#10B981] font-extrabold uppercase tracking-widest bg-[#10B981]/10 px-2 py-0.5 rounded-full mb-1">3-Cushion</span>
                                                <span className="text-4xl font-extrabold text-white tracking-tighter">
                                                    {selectedMember.member.avg3c ? selectedMember.member.avg3c.toFixed(2) : "0.00"}
                                                </span>
                                                <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">Average</span>
                                            </div>
                                            <div className="w-px h-16 bg-white/10" />
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full mb-1">4-Ball</span>
                                                <span className="text-4xl font-extrabold text-white tracking-tighter">
                                                    {selectedMember.member.avg4c ? selectedMember.member.avg4c.toFixed(2) : "0.00"}
                                                </span>
                                                <span className="text-[10px] text-white/20 font-semibold uppercase tracking-widest">Average</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="px-6 pb-6 space-y-6">
                                <div className="bg-[#1a1a1a] rounded-2xl p-0 border border-white/5 overflow-hidden">
                                    <div className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors cursor-default">
                                        <span className="text-xs text-white/40 font-semibold">마지막 접속</span>
                                        <span className="text-xs text-white font-semibold">
                                            {selectedMember.member.lastVisitedAt
                                                ? formatDistanceToNow(new Date(selectedMember.member.lastVisitedAt), { addSuffix: true, locale: ko })
                                                : "정보 없음"}
                                        </span>
                                    </div>
                                    <div className="w-full h-px bg-white/5" />
                                    <div className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors cursor-default">
                                        <span className="text-xs text-white/40 font-semibold">최근 5경기 추세</span>
                                        <div className="flex items-center gap-2">
                                            {trend ? (
                                                <span className={cn("text-xs font-extrabold", trend.color)}>{trend.label}</span>
                                            ) : (
                                                <span className="text-xs text-white/20">데이터 없음</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* VS Me Section */}
                                {currentMemberId !== selectedMember.member.id && (
                                    <div className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-semibold text-white/80">상대 전적 (Vs Me)</h3>
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-white/60">전체 기간</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-white">{vsMeStats?.wins || 0}</div>
                                                <div className="text-[10px] text-white/40 uppercase">Wins</div>
                                            </div>
                                            <div className="h-8 w-px bg-white/10" />
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-white">{vsMeStats?.losses || 0}</div>
                                                <div className="text-[10px] text-white/40 uppercase">Losses</div>
                                            </div>
                                            <div className="h-8 w-px bg-white/10" />
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-white">
                                                    {(vsMeStats?.wins + vsMeStats?.losses) > 0
                                                        ? Math.round((vsMeStats.wins / (vsMeStats.wins + vsMeStats.losses)) * 100)
                                                        : 0}%
                                                </div>
                                                <div className="text-[10px] text-white/40 uppercase">Win Rate</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions (Sticky Bottom) */}
                            <div className="mt-auto p-6 bg-[#0f0f0f] border-t border-white/5 flex gap-3">
                                <Button className="flex-1 h-12 bg-[#22c55e] text-black font-semibold hover:bg-[#16a34a] rounded-xl">
                                    <LucideSwords className="w-4 h-4 mr-2" />
                                    대결 신청
                                </Button>
                                <Button variant="outline" className="h-12 w-12 rounded-xl border-white/10 bg-white/5 p-0 hover:bg-white/10 hover:text-white">
                                    <LucideMessageCircle className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}

// Utility for recommended handicap
export function getRecommendedHandicap(member: HiqMember) {
    if (!member) return 20; // default
    let handi = member.handi4c || 20;

    // Gender Logic: If Female, -1 (Standard Mixed Rule)
    if (member.gender === 'female') {
        handi = Math.max(10, handi - 1); // Minimum 10? Adjustable.
    }
    return handi;
}
