
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PartyLogo from "@/components/PartyLogo";
import LightPillar from "@/components/ui/light-pillar";
import { motion } from "framer-motion";
import { ArrowLeft, Crown, Activity, FileText, UserCheck, TrendingUp, Shield, Zap, History as HistoryIcon } from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, PolarRadiusAxis } from 'recharts';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export default function AssemblyRankings() {
  const [, setLocation] = useLocation();

  // 국회의원 랭킹 데이터 가져오기 (Client-side sorting to bypass server route issue)
  const { data: rankingData = null, isLoading, isError, error } = useQuery({
    queryKey: ["/api/assembly/members?limit=300"],
    queryFn: async () => {
      const response = await fetch("/api/assembly/members?limit=300");
      if (!response.ok) {
        throw new Error("Failed to fetch assembly members");
      }
      const json = await response.json();
      const allMembers = json.success ? json.data : json;

      // Process rankings client-side
      const activityRanking = [...allMembers].sort((a: any, b: any) => (b.activityScore || 0) - (a.activityScore || 0));
      const billsRanking = [...allMembers].sort((a: any, b: any) => (b.billsProposed || 0) - (a.billsProposed || 0));
      const attendanceRanking = [...allMembers].sort((a: any, b: any) => {
        const rateA = a.attendanceRate ? parseFloat(a.attendanceRate) : 0;
        const rateB = b.attendanceRate ? parseFloat(b.attendanceRate) : 0;
        return rateB - rateA;
      });

      return {
        activityRanking,
        billsRanking,
        attendanceRanking
      };
    }
  });

  // Monthly champion computed from rankingData
  const monthlyChampion = rankingData?.activityRanking?.[0] || null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-cyan-400 animate-pulse font-bold">국회 데이터를 분석 중입니다... 📡</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center pt-24 text-white">
        <Activity className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">데이터 로딩 실패</h2>
        <p className="text-white/50 mb-4">{(error as Error).message}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="border-white/20">
          다시 시도
        </Button>
      </div>
    );
  }

  // Old query removed.


  // 레이더 차트 데이터 생성 (월간 챔피언용)
  const championRadarData = monthlyChampion ? [
    { subject: '성실도', A: monthlyChampion.attendanceRate ? Number(monthlyChampion.attendanceRate) * 1 : 85, fullMark: 100 },
    { subject: '법안발의', A: Math.min((monthlyChampion.billsProposed || 0) * 5, 100), fullMark: 100 }, // 예: 20건이면 100점
    { subject: '가결률', A: 75, fullMark: 100 }, // 임시 데이터
    { subject: '소통', A: 90, fullMark: 100 }, // 임시 데이터
    { subject: '전투력', A: monthlyChampion.activityScore || 88, fullMark: 100 },
  ] : [];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-orange-500/30 pb-24">
      <SEOHead
        title="국회 ON 랭킹 - 국회의원 활동 순위"
        description="국회의원들의 종합 전투력, 티어, 활동 지수를 실시간으로 확인하세요."
      />

      {/* Background Effects */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor="#F59E0B" // Amber-500
          bottomColor="#EA580C" // Orange-600
          intensity={0.8}
          rotationSpeed={0.2}
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/90 to-transparent backdrop-blur-md border-b border-white/5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setLocation('/home')}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-lg font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]">
            RANKING SYSTEM
          </span>
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0"
          >
            <HistoryIcon className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="relative z-10 max-w-md mx-auto px-5 pt-24">

        {/* Monthly Champion Section */}
        {monthlyChampion && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />
              <h2 className="text-sm font-bold text-yellow-400 tracking-wider">THIS MONTH'S MVP</h2>
            </div>

            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-[2rem] blur opacity-40 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-[#121212] border border-white/10 p-6 rounded-[1.8rem] shadow-2xl overflow-hidden">

                {/* Champion Header */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 p-[2px] shadow-lg">
                        <div className="w-full h-full bg-[#1a1a1a] rounded-[14px] flex items-center justify-center overflow-hidden">
                          <DotLottieReact
                            src="https://lottie.host/cf598b05-7b3e-49d8-ad6b-f96754f1651c/CUv1G5wTha.lottie"
                            loop
                            autoplay
                            className="w-full h-full scale-125" // Slightly scale up to fill
                          />
                        </div>
                      </div>
                      <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-black rounded-full border-2 border-yellow-500 flex items-center justify-center shadow-lg z-10">
                        <span className="text-xs font-black text-yellow-500">S+</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-black text-white">{monthlyChampion.name}</h3>
                        <PartyLogo party={monthlyChampion.party} size="sm" />
                      </div>
                      <p className="text-xs text-white/50 font-medium">{monthlyChampion.constituency}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Total Score</div>
                    <div className="text-3xl font-black text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                      {monthlyChampion.activityScore}
                    </div>
                  </div>
                </div>

                {/* Radar Chart & Stats */}
                <div className="flex flex-col gap-6 mt-4">
                  <div className="h-64 relative w-full flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={championRadarData}>
                        <PolarGrid stroke="#ffffff20" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#ffffff80', fontSize: 12, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Stats" dataKey="A" stroke="#FBBF24" strokeWidth={3} fill="#FBBF24" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 gap-3 w-full">
                    <StatRow
                      label="성실도 (출석)"
                      value={monthlyChampion.attendanceRate || "95%"}
                      color="text-blue-400"
                      comment={Number(monthlyChampion.attendanceRate) >= 90 ? "성실 아이콘! 거의 모든 회의에 참석했습니다." : "준수한 출석률로 의정활동을 이어가고 있습니다."}
                    />
                    <StatRow
                      label="입법활동 (발의)"
                      value={`${monthlyChampion.billsProposed || 0}건`}
                      color="text-green-400"
                      comment={(monthlyChampion.billsProposed || 0) > 10 ? "걸어다니는 입법부! 왕성한 법안 발의 중입니다." : "꾸준한 입법 활동을 보여주고 있습니다."}
                    />
                    <StatRow
                      label="전투력 (활동)"
                      value={`${monthlyChampion.activityScore}점`}
                      color="text-red-400"
                      comment="종합 점수 1위! 이달의 가장 뜨거운 국회의원입니다."
                    />
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}

        {/* Rankings List */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="w-full bg-white/5 p-1 rounded-xl border border-white/5 mb-6 backdrop-blur-sm">
            <StyledTabTrigger value="activity" label="종합전투력" color="text-orange-400" bg="data-[state=active]:bg-orange-600" shadow="data-[state=active]:shadow-[0_0_20px_rgba(234,88,12,0.4)]" />
            <StyledTabTrigger value="bills" label="입법활동" color="text-red-400" bg="data-[state=active]:bg-red-600" shadow="data-[state=active]:shadow-[0_0_20px_rgba(220,38,38,0.4)]" />
            <StyledTabTrigger value="attendance" label="성실도" color="text-amber-400" bg="data-[state=active]:bg-amber-600" shadow="data-[state=active]:shadow-[0_0_20px_rgba(217,119,6,0.4)]" />
          </TabsList>

          <TabsContent value="activity" className="space-y-3">
            <RankingList data={rankingData?.activityRanking || []} type="activity" />
          </TabsContent>
          <TabsContent value="bills" className="space-y-3">
            <RankingList data={rankingData?.billsRanking || []} type="bills" />
          </TabsContent>
          <TabsContent value="attendance" className="space-y-3">
            <RankingList data={rankingData?.attendanceRanking || []} type="attendance" />
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
}

// Helper Components

function RankingList({ data, type }: { data: any[], type: string }) {
  if (!data) return <div className="text-center py-10 text-white/30 text-xs">Loading data...</div>;

  return (
    <>
      {data.map((member, index) => (
        <RankingCard
          key={member.id}
          member={member}
          rank={index + 1}
          type={type}
          total={data.length}
        />
      ))}
    </>
  );
}

function RankingCard({ member, rank, type, total }: { member: any, rank: number, type: string, total: number }) {
  const isTop3 = rank <= 3;
  const tier = getTier(rank, total);

  // Value formatting based on type
  let valueDisplay = "";
  let subValueDisplay = "";

  if (type === 'activity') {
    valueDisplay = `${member.activityScore}점`;
    subValueDisplay = "전투력";
  } else if (type === 'bills') {
    valueDisplay = `${member.billsProposed}건`;
    subValueDisplay = "발의";
  } else if (type === 'attendance') {
    valueDisplay = `${member.attendanceRate}%`;
    subValueDisplay = "출석률";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      className={`relative group container-type-size`}
    >
      <div className={`
         absolute inset-0 rounded-[20px] transition-all duration-300
         ${isTop3 ? 'bg-gradient-to-r from-white/10 to-transparent opacity-100' : 'opacity-0 group-hover:opacity-100 bg-white/5'}
      `}></div>

      <div className="relative p-4 flex items-center gap-4 bg-[#121212]/50 border border-white/5 rounded-[20px] backdrop-blur-sm">

        {/* Rank & Tier */}
        <div className="flex flex-col items-center gap-1 min-w-[3rem]">
          <div className={`text-lg font-black italic ${rank <= 3 ? 'text-white scale-110 drop-shadow-md' : 'text-white/40'}`}>
            #{rank}
          </div>
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border h-4 flex items-center justify-center ${tier.color}`}>
            {tier.label}
          </Badge>
        </div>

        {/* Member Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-white truncate">{member.name}</h3>
            <PartyLogo party={member.party} size="sm" />
          </div>
          <p className="text-xs text-white/40 truncate">{member.constituency}</p>
        </div>

        {/* Score */}
        <div className="text-right">
          <div className={`text-base font-black ${type === 'activity' ? 'text-amber-400' : 'text-white'} ${isTop3 ? 'scale-110 origin-right' : ''}`}>
            {valueDisplay}
          </div>
          <div className="text-[9px] text-white/30 font-medium uppercase tracking-wider">
            {subValueDisplay}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatRow({ label, value, color, comment }: { label: string, value: string, color: string, comment?: string }) {
  return (
    <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5 flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/50 font-medium">{label}</span>
        <span className={`text-sm font-black ${color}`}>{value}</span>
      </div>
      {comment && (
        <p className="text-[10px] text-white/40 leading-tight">
          {comment}
        </p>
      )}
    </div>
  );
}

function StyledTabTrigger({ value, label, color, bg, shadow }: { value: string, label: string, color: string, bg: string, shadow: string }) {
  return (
    <TabsTrigger
      value={value}
      className={`flex-1 rounded-lg text-xs font-bold text-white/40 transition-all duration-300 data-[state=active]:text-white ${bg} ${shadow}`}
    >
      {label}
    </TabsTrigger>
  );
}

function getTier(rank: number, total: number) {
  const percentile = (rank / total) * 100;

  if (rank === 1) return { label: 'GOD', color: 'text-purple-300 border-purple-500/50 bg-purple-500/20' };
  if (percentile <= 5) return { label: 'S+', color: 'text-amber-300 border-amber-500/50 bg-amber-500/20' };
  if (percentile <= 15) return { label: 'S', color: 'text-amber-400/80 border-amber-500/30 bg-amber-500/10' };
  if (percentile <= 30) return { label: 'A', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' };
  if (percentile <= 60) return { label: 'B', color: 'text-green-400 border-green-500/30 bg-green-500/10' };
  if (percentile <= 80) return { label: 'C', color: 'text-white/50 border-white/20 bg-white/5' };
  return { label: 'F', color: 'text-red-400/70 border-red-500/30 bg-red-500/5' };
}