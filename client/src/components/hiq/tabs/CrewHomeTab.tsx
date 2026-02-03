import { useState, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideFlag, LucideTent, LucideCalendar, LucideMapPin
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HiqCrew, HiqStore, HiqMember } from "@shared/schema";
import { BilliardsRoomList } from "@/components/hiq/view/BilliardsRoomList";
import { GolfRoomList } from "@/golf/components/GolfRoomList";
import { CrewMemberList } from "@/components/hiq/CrewMemberList";

// Tailwind JIT 호환성을 위한 색상 매핑
const COLOR_VARIANTS: Record<string, { bg: string, border: string, text: string }> = {
    emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/10", text: "text-emerald-500" },
    blue: { bg: "bg-blue-500/5", border: "border-blue-500/10", text: "text-blue-500" },
    pink: { bg: "bg-pink-500/5", border: "border-pink-500/10", text: "text-pink-500" },
};

const StatCard = ({ title, subTitle, children }: { title: string, subTitle?: string, children: React.ReactNode }) => {
    return (
        <div className="rounded-2xl p-5 flex flex-col items-center justify-center text-center relative overflow-hidden group transition-all duration-300">
            <div className="flex flex-col items-center gap-1.5 mb-2 relative z-10 transition-transform duration-300 group-hover:-translate-y-1">
                <span className="text-white/40 text-[12px] font-bold uppercase tracking-[0.2em]">{title}</span>
            </div>
            <div className="relative z-10">
                {children}
            </div>
            {subTitle && (
                <span className="text-white/20 text-[9px] font-semibold mt-2 uppercase tracking-wider relative z-10">{subTitle}</span>
            )}
        </div>
    );
};

interface CrewHomeTabProps {
    crew: HiqCrew;
    baseStore: HiqStore | null;
    members: any[]; // Extended member data with profile info
    isMember: boolean;
    isPending: boolean;
    isNotMember: boolean;
    isAdmin: boolean;
    me: any;
    onJoin: () => void;
    onCreateActivity: () => void;
    onShareToChat: (msg: string) => void;
}

export const CrewHomeTab = memo(({
    crew, baseStore, members, isMember, isPending, isNotMember, isAdmin, me, onJoin, onCreateActivity, onShareToChat
}: CrewHomeTabProps) => {
    const [isRankingInfoOpen, setIsRankingInfoOpen] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [sportTab, setSportTab] = useState<'BILLIARDS' | 'GOLF'>(crew.sportCategory === 'GOLF' ? 'GOLF' : 'BILLIARDS');

    const activeMembers = useMemo(() => members.filter((m: any) => m.role !== 'pending'), [members]);

    // 이미지 에러 핸들러
    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = "https://images.unsplash.com/photo-1544178178-5034a9269043?auto=format&fit=crop&q=80&w=1000";
    };

    const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = "https://images.unsplash.com/photo-1511367461989-f85a21fda181?auto=format&fit=crop&q=80&w=200";
    };

    // 통계 계산 (useMemo 최적화)
    const stats = useMemo(() => {
        const statsMembers = activeMembers.filter((m: any) => m.member);
        const isGolf = crew.sportCategory === 'GOLF';

        const membersWith3c = statsMembers.filter((m: any) => (m.member.avg3c || 0) > 0);
        const membersWith4c = statsMembers.filter((m: any) => (m.member.avg4c || 0) > 0);
        const avg3c = membersWith3c.length > 0
            ? (membersWith3c.reduce((a, b) => a + (b.member.avg3c || 0), 0) / membersWith3c.length).toFixed(2)
            : "0.00";
        const avg4c = membersWith4c.length > 0
            ? (membersWith4c.reduce((a, b) => a + (b.member.avg4c || 0), 0) / membersWith4c.length).toFixed(2)
            : "0.00";

        const membersWithGolfHandy = statsMembers.filter((m: any) => (m.member.golfHandicap || 0) > 0);
        const membersWithGolfAvg = statsMembers.filter((m: any) => (m.member.golfAvgScore || 0) > 0);
        const avgHdcp = membersWithGolfHandy.length > 0
            ? (membersWithGolfHandy.reduce((a, b) => a + (b.member.golfHandicap || 0), 0) / membersWithGolfHandy.length).toFixed(1)
            : "0.0";
        const avgGolfScore = membersWithGolfAvg.length > 0
            ? Math.round(membersWithGolfAvg.reduce((a, b) => a + (b.member.golfAvgScore || 0), 0) / membersWithGolfAvg.length)
            : "0";

        const totalPoints = statsMembers.length * 1240 + 450;
        const totalRounds = statsMembers.reduce((acc, m) => acc + (m.member.totalGolfGames || 0), 0);
        const pointsDisplay = isGolf ? `${totalRounds} 회` : totalPoints.toLocaleString();

        return {
            statsMembers,
            isGolf,
            avg3c,
            avg4c,
            avgHdcp,
            avgGolfScore,
            pointsDisplay
        };
    }, [activeMembers, crew.sportCategory]);

    return (
        <div className="space-y-8 pb-32">
            {/* Hero Section */}
            <div className="relative">
                <div className="relative w-full overflow-hidden">
                    <img
                        src={crew.coverImage || "https://images.unsplash.com/photo-1544178178-5034a9269043?auto=format&fit=crop&q=80&w=1000"}
                        className="w-full h-[240px] object-cover"
                        alt="Crew Cover"
                        onError={handleImageError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] to-transparent opacity-60" />
                </div>

                <div className="px-6 -mt-10 relative z-10 flex items-end gap-4">
                    <div className="w-20 h-20 rounded-[1.8rem] bg-[#141414] border-2 border-[#10B981]/20 overflow-hidden shadow-2xl">
                        <img
                            src={crew.emblem || "https://images.unsplash.com/photo-1511367461989-f85a21fda181?auto=format&fit=crop&q=80&w=200"}
                            className="w-full h-full object-cover"
                            alt="Crew Logo"
                            onError={handleLogoError}
                        />
                    </div>
                    <div className="pb-1">
                        <h1 className="text-2xl font-semibold text-white leading-tight tracking-tight drop-shadow-md">
                            {crew.name}
                        </h1>
                        <p className="text-xs text-[#10B981] font-bold mt-1 drop-shadow-sm uppercase tracking-widest">
                            {crew.shortIntro || crew.region || "광진구 하이큐"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className="px-6 space-y-5">
                <div className="relative">
                    <div className={cn(
                        "text-white/60 text-[15px] leading-relaxed font-normal transition-all duration-300 whitespace-pre-wrap",
                        !isDescriptionExpanded && "line-clamp-3"
                    )}>
                        {crew.description || "크루 소개글이 없습니다."}
                    </div>
                    {(crew.description?.length || 0) > 60 && (
                        <button
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            className="text-[#10B981] text-xs font-semibold mt-3 uppercase tracking-widest hover:text-white transition-colors"
                        >
                            {isDescriptionExpanded ? "접기" : "더 보기 ∨"}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {crew.meetingDay && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/80 text-[11px] font-semibold uppercase tracking-widest">
                            <LucideCalendar className="w-3.5 h-3.5 text-[#10B981]" />
                            {crew.meetingDay} {crew.meetingTime}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/80 text-[11px] font-semibold uppercase tracking-widest">
                        <LucideMapPin className="w-3.5 h-3.5 text-[#10B981]" />
                        {crew.region || "서울 광진"}
                    </div>
                </div>

                {/* Team Performance Dashboard */}
                <div onClick={() => setIsRankingInfoOpen(true)} className="grid grid-cols-2 gap-3 mt-6 relative cursor-pointer">
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/10 -translate-x-1/2" />
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/10 -translate-y-1/2" />

                    <StatCard title="랭킹" subTitle="지역 기준">
                        <span className="text-3xl font-bold text-white tracking-tight">-- <span className="text-lg font-normal text-white/40">위</span></span>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "클럽 평균" : "팀 에버리지"}>
                        <div className="flex items-center gap-3 mt-1 px-2">
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-extrabold text-white leading-none">{stats.isGolf ? stats.avgHdcp : stats.avg3c}</span>
                                <span className="text-[9px] text-white/30 font-semibold mt-1 tracking-tighter">{stats.isGolf ? "HDCP" : "3C"}</span>
                            </div>
                            <div className="h-8 w-px bg-white/10" />
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-extrabold text-white leading-none">{stats.isGolf ? stats.avgGolfScore : stats.avg4c}</span>
                                <span className="text-[9px] text-white/30 font-semibold mt-1 tracking-tighter">{stats.isGolf ? "AVG" : "4B"}</span>
                            </div>
                        </div>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "누적 라운드" : "누적 점수"}>
                        <span className="text-3xl font-extrabold text-white tracking-tight">{stats.pointsDisplay}</span>
                    </StatCard>

                    <StatCard title="활동 멤버">
                        <span className="text-3xl font-bold text-white tracking-tight">{stats.statsMembers.length} <span className="text-lg font-normal text-white/40">명</span></span>
                    </StatCard>
                </div>

                <AnimatePresence>
                    {isRankingInfoOpen && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                            onClick={() => setIsRankingInfoOpen(false)}
                        >
                            <motion.div
                                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                                className="w-full max-w-md bg-[#141414] border border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 space-y-8"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 className="text-xl font-extrabold uppercase tracking-tight text-white mb-6">크루 랭킹 시스템</h2>
                                <div className="space-y-4">
                                    <InfoItem title={stats.isGolf ? "클럽 평균" : "실력 점수 (30%)"} color="emerald" desc={stats.isGolf ? "평균 핸디캡 및 타수입니다." : "멤버들의 평균 에버리지입니다."} />
                                    <InfoItem title={stats.isGolf ? "누적 라운드" : "활동 점수 (50%)"} color="blue" desc={stats.isGolf ? "기록된 총 라운딩 합계입니다." : "월간 누적 득점 포인트입니다."} />
                                    <InfoItem title="규모 점수 (20%)" color="pink" desc="최근 30일간 활동한 실질 멤버 수입니다." />
                                </div>
                                <Button onClick={() => setIsRankingInfoOpen(false)} className="w-full bg-white/5 h-14 rounded-2xl border border-white/10 font-bold uppercase tracking-widest mt-4">확인</Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Activities Section */}
            <div className="px-6 space-y-4">
                {crew.sportCategory === 'MIXED' ? (
                    <div className="flex bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
                        <TabBtn label="🎱 당구" active={sportTab === 'BILLIARDS'} onClick={() => setSportTab('BILLIARDS')} />
                        <TabBtn label="⛳️ 골프" active={sportTab === 'GOLF'} onClick={() => setSportTab('GOLF')} />
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mb-2">
                        <LucideTent className={cn("w-5 h-5", crew.sportCategory === 'GOLF' ? "text-[#84cc16]" : "text-[#10B981]")} />
                        <h2 className="text-lg font-semibold">정모 / 일정</h2>
                    </div>
                )}

                {(crew.sportCategory === 'GOLF' || (crew.sportCategory === 'MIXED' && sportTab === 'GOLF')) ? (
                    <GolfRoomList crewId={crew.id} isMember={isMember} currentMemberId={me?.id} onCreateClick={onCreateActivity} />
                ) : (
                    <BilliardsRoomList crewId={crew.id} isMember={isMember} currentMemberId={me?.id} onCreateClick={onCreateActivity} onShareToChat={onShareToChat} />
                )}
            </div>

            {/* Base Camp Section */}
            <div className="px-6">
                <div className="flex items-center gap-2 mb-4 opacity-40">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-white">베이스 캠프 / BASE CAMP</h2>
                </div>
                {baseStore ? (
                    <Card className="bg-[#141414] border-white/5 rounded-[2rem] overflow-hidden group hover:border-[#10B981]/50 transition-all">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">{baseStore.name}</h3>
                                    <p className="text-xs text-white/40 mt-0.5">{baseStore.address}</p>
                                </div>
                                <span className="bg-[#10B981]/10 text-[#10B981] text-[9px] font-bold px-2.5 py-1 rounded-full border border-[#10B981]/20 uppercase">Official</span>
                            </div>
                            <div className="flex gap-2.5">
                                <Button variant="outline" className="flex-1 rounded-xl text-xs h-10 border-white/10 text-white hover:bg-white/10">전화하기</Button>
                                <Button className="flex-1 rounded-xl text-xs h-10 bg-[#10B981] text-black">위치보기</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="py-14 text-center bg-white/5 rounded-[2.5rem] border border-dashed border-white/10 text-white/20 text-xs font-bold uppercase tracking-widest">
                        베이스 캠프 정보가 없습니다
                    </div>
                )}
            </div>

            {/* Members Section */}
            <div className="px-6 pb-20">
                <div className="flex items-center gap-2 mb-6 opacity-40">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-white">멤버 <span className="ml-1">{members.length}</span></h2>
                </div>
                <CrewMemberList members={activeMembers} currentMemberId={me?.id} sportCategory={crew.sportCategory} />
            </div>

            {/* Join CTA for non-members */}
            {(isNotMember || isPending) && (
                <div className="fixed bottom-[5.5rem] left-0 right-0 px-6 py-2 z-50 pointer-events-none">
                    <Button
                        onClick={onJoin}
                        disabled={isPending}
                        className={cn(
                            "w-full h-14 rounded-[1.5rem] text-base font-black tracking-widest uppercase shadow-[0_8px_30px_rgb(0,0,0,0.5)] transition-all active:scale-95 pointer-events-auto ring-1 ring-white/10",
                            isPending ? "bg-white/5 text-white/20 border border-white/5" : "bg-white text-black hover:bg-neutral-200"
                        )}
                    >
                        {isPending ? "가입 승인 대기 중..." : "크루 가입하기 / JOIN NOW"}
                    </Button>
                </div>
            )}
        </div>
    );
});

const InfoItem = ({ title, color, desc }: { title: string, color: 'emerald' | 'blue' | 'pink', desc: string }) => {
    const theme = COLOR_VARIANTS[color];
    return (
        <div className={cn("p-5 bg-white/5 border rounded-2xl", theme.border, theme.bg)}>
            <h3 className={cn("text-sm font-bold uppercase tracking-widest", theme.text)}>{title}</h3>
            <p className="text-xs text-white/40 mt-1">{desc}</p>
        </div>
    );
};

const TabBtn = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", active ? "bg-[#10B981] text-black shadow-lg" : "text-white/40")}>{label}</button>
);

CrewHomeTab.displayName = "CrewHomeTab";
