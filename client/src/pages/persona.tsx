import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import PersonalityAnalysisCard from "@/components/personality-analysis-card";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, TrendingUp } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { motion } from "framer-motion";

export default function Persona() {
  const [showPointSend, setShowPointSend] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [politicalAnalysis, setPoliticalAnalysis] = useState<any>(null);

  const { user } = useAuth();

  // 정치 성향 분석 결과 불러오기 (복구됨)
  useEffect(() => {
    if (user && !user.isGuest) {
      const userId = (user as any).auth_id || user.id;
      const saved = localStorage.getItem(`political_analysis_${userId}`);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          setPoliticalAnalysis(data.result);
        } catch (e) {
          console.error('Failed to load political analysis:', e);
        }
      }
    }
  }, [user]);

  // 레이더 차트 데이터 변환 (복구됨)
  const politicalRadarData = useMemo(() => {
    if (!politicalAnalysis?.axisScores) return [];

    const axisNames: { [key: string]: string } = {
      Economy: '경제관',
      Social: '사회관',
      Diplomacy: '외교안보',
      Governance: '국가관',
      Participation: '정치참여'
    };

    return Object.entries(politicalAnalysis.axisScores).map(([axis, score]: [string, any]) => ({
      subject: axisNames[axis] || axis,
      value: typeof score === 'number' ? score : 0,
      fullMark: 100
    }));
  }, [politicalAnalysis]);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <SEOHead
        title="페르소나 - Polli"
        description="나의 투표 성향과 관심사를 분석합니다"
        keywords="페르소나,성향분석,투표패턴"
      />

      {/* Background Blobs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] bg-blue-600/10 blur-[100px] rounded-full animate-pulse blur-delay-2000"></div>
      </div>

      <MobileHeader />

      <main className="relative z-10 max-w-md mx-auto pb-24 px-6 pt-8">
        {/* 헤더 */}
        <section className="mb-10">
          <div className="text-center">
            <h1 className="text-3xl font-black text-white mb-2 tracking-tighter">
              페르소나
            </h1>
            <p className="text-sm text-white/40 font-bold uppercase tracking-widest">
              My Identity & Performance
            </p>
          </div>
        </section>

        {/* AI 성향 분석 */}
        <section className="mb-8">
          {user ? (
            <PersonalityAnalysisCard userId={(user as any).auth_id || user.id} />
          ) : (
            <div className="glass-card p-12 border border-white/10 text-center">
              <div className="animate-spin w-10 h-10 border-4 border-white/5 border-t-purple-500 rounded-full mx-auto mb-6"></div>
              <p className="text-sm text-white/40 font-bold uppercase tracking-widest">Loading Identity Data...</p>
            </div>
          )}
        </section>

        {/* 정치 성향 분석 요약 (복구됨) */}
        <section className="mb-8">
          {politicalAnalysis ? (
            <div className="glass-card p-6 border border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none" style={{ backgroundColor: politicalAnalysis.color }} />

              <div className="text-center mb-8 relative z-10">
                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                  당신은 <span style={{ color: politicalAnalysis.color }}>{politicalAnalysis.classification}</span> 성향입니다
                </h2>
                <p className="text-white/60 text-sm font-medium leading-relaxed max-w-xs mx-auto">
                  {politicalAnalysis.description}
                </p>
              </div>

              <div className="flex justify-center mb-8 relative z-10">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-center w-full max-w-[300px] aspect-square">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={politicalRadarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Tendency"
                        dataKey="value"
                        stroke={politicalAnalysis.color}
                        fill={politicalAnalysis.color}
                        fillOpacity={0.4}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-4 relative z-10">
                <h3 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Detailed Scores</h3>
                {politicalRadarData.map((item: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-white/80">
                      <span>{item.subject}</span>
                      <span>{item.value}점</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: politicalAnalysis.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : user && !user.isGuest ? (
            <div className="glass-card p-10 border border-white/10 text-center">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Target className="w-10 h-10 text-white/20" />
              </div>
              <h3 className="text-xl font-black text-white mb-2 tracking-tight">
                정치 성향 분석 데이터 없음
              </h3>
              <p className="text-sm text-white/40 font-medium mb-8 leading-relaxed">
                15개의 문항을 통해 당신의 정치적 위치를<br />정확하게 분석해드립니다.
              </p>
              <Link href="/category/politics">
                <Button className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black shadow-lg shadow-purple-500/20 transition-all">
                  <Target className="w-5 h-5 mr-3" />
                  분석 시작하기
                </Button>
              </Link>
            </div>
          ) : null}
        </section>

        {/* Points & Rewards Section */}
        <section className="mb-6">
          <section className="mb-8">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-white italic tracking-tight flex items-center">
                <i className="fas fa-coins mr-3 text-purple-500"></i>
                REWARDS
              </h3>
              <button className="text-[10px] text-white/40 font-black uppercase tracking-widest hover:text-white transition-colors">
                Store All
              </button>
            </div>

            {/* User Points Display */}
            <div className="glass-card border border-white/10 p-6 mb-4">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Current Balance</h4>
                  <div className="text-4xl font-black text-white flex items-baseline gap-1">
                    {(user as any)?.personal_points || 0}<span className="text-sm text-purple-500 italic">P</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-white/60 uppercase tracking-widest mb-2">
                    Level {(user as any)?.level_number || 1}
                  </div>
                  <div className="text-lg font-black text-white italic">
                    {(user as any)?.experience_points || 0} <span className="text-[10px] text-white/30 uppercase tracking-tighter not-italic">EXP</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: 'fa-paper-plane', label: 'Send', onClick: () => setShowPointSend(true) },
                  { icon: 'fa-gift', label: 'Shop', onClick: () => setShowRewards(true) },
                  { icon: 'fa-history', label: 'Log', onClick: () => setShowPointHistory(true) }
                ].map((action, idx) => (
                  <button
                    key={idx}
                    onClick={action.onClick}
                    className="group flex flex-col items-center justify-center p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    <i className={`fas ${action.icon} text-lg mb-2 text-white/40 group-hover:text-purple-500 transition-colors`}></i>
                    <span className="text-[10px] font-black text-white/40 group-hover:text-white uppercase tracking-widest">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Popular Rewards Preview */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: 'fa-coffee', brand: 'STARBUCKS', menu: 'Americano', price: '1,000', tag: 'POPULAR' },
                { icon: 'fa-ice-cream', brand: 'BASKIN ROBBINS', menu: 'Single Regular', price: '800', tag: 'RECOMMEND' },
                { icon: 'fa-burger', brand: 'MCDONALDS', menu: 'Big Mac Set', price: '1,500', tag: 'NEW' },
                { icon: 'fa-film', brand: 'CGV', menu: 'Movie Ticket', price: '2,000', tag: 'HOT' }
              ].map((reward, idx) => (
                <div key={idx} className="glass-card p-5 border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                      <i className={`fas ${reward.icon} text-white/20 group-hover:text-purple-500/60 transition-colors`}></i>
                    </div>
                    <span className="text-[8px] font-black bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">
                      {reward.tag}
                    </span>
                  </div>
                  <h4 className="font-black text-xs text-white uppercase tracking-wider mb-1">{reward.brand}</h4>
                  <p className="text-[10px] text-white/40 font-bold mb-4">{reward.menu}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-sm font-black text-white italic">{reward.price}<span className="text-[10px] text-purple-500 ml-0.5">P</span></span>
                    <button
                      aria-label={`${reward.brand} ${reward.menu} 교환`}
                      className="w-8 h-8 rounded-full bg-white text-black text-xs flex items-center justify-center hover:bg-purple-500 hover:text-white transition-all"
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
