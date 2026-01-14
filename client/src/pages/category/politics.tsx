import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import PoliticsResultsModal from "@/components/PoliticsResultsModal";
import { Input } from "@/components/ui/input";
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area
} from 'recharts';
import { politicalQuestions, type PoliticalQuestion } from "@/data/political-questions";
import {
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  User,
  Users,
  MapPin,
  Vote,
  Gavel,
  History,
  Search,
  Plus
} from "lucide-react";
import PartyLogo from "@/components/PartyLogo";
import InteractiveChartCard, { type ChartDataPoint } from "@/components/political/InteractiveChartCard";
import { CheckSquare, Briefcase, MessageCircle, RefreshCw, Scale, Zap } from "lucide-react";
import LightPillar from "@/components/ui/light-pillar";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { motion, AnimatePresence } from "framer-motion";

const RADIAN = Math.PI / 180;

type Needle = {
  value: number;
  data: { name: string; value: number; color: string }[];
  cx: number;
  cy: number;
  iR: number;
  oR: number;
  color: string;
};

const needle = ({ value, data, cx, cy, iR, oR, color }: Needle) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const ang = 180.0 * (1 - value / total);
  const length = (iR + 2 * oR) / 3;
  const sin = Math.sin(-RADIAN * ang);
  const cos = Math.cos(-RADIAN * ang);
  const r = 5;
  const x0 = cx + 5;
  const y0 = cy + 5;
  const xba = x0 + r * sin;
  const yba = y0 - r * cos;
  const xbb = x0 - r * sin;
  const ybb = y0 + r * cos;
  const xp = x0 + length * cos;
  const yp = y0 + length * sin;

  return [
    <circle key="needle-circle" cx={x0} cy={y0} r={r} fill={color} stroke="none" />,
    <path
      key="needle-path"
      d={`M${xba} ${yba}L${xbb} ${ybb} L${xp} ${yp} L${xba} ${yba}`}
      stroke="none"
      fill={color}
    />,
  ];
};

interface SurveyResult {
  survey: {
    id: number;
    title: string;
    description: string;
    votingStartDate: string;
    votingEndDate: string;
    isActive: boolean;
    isAnonymous: boolean;
  };
  totalParticipants: number;
  questionResults: {
    questionId: number;
    question: string;
    type: string;
    totalResponses: number;
    optionStats: {
      option: string;
      count: number;
      percentage: number;
    }[];
  }[];
}

export default function PoliticsCategory() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // URL query parameter for tab
  const getInitialTab = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || "dashboard";
    }
    return "dashboard";
  };

  const [tab, setTab] = useState(getInitialTab);

  const handleTabChange = (val: string) => {
    setTab(val);
  };

  const [showResults, setShowResults] = useState<number | null>(null);
  const [surveyResults, setSurveyResults] = useState<SurveyResult | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [showPastSurveys, setShowPastSurveys] = useState(false);
  const [showMoreBills, setShowMoreBills] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [trendType, setTrendType] = useState<'presidential' | 'party' | 'priority'>('party');
  const [selectedWeekData, setSelectedWeekData] = useState<any>(null);

  const { data: politicsSurveys, isLoading } = useQuery({
    queryKey: ['/api/auth/politics-surveys'],
    queryFn: async () => {
      const response = await fetch('/api/auth/politics-surveys');
      if (!response.ok) throw new Error('Failed to fetch politics surveys');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: presidentialData } = useQuery({
    queryKey: ['/api/political/presidential-approval'],
    queryFn: async () => {
      const response = await fetch('/api/political/presidential-approval');
      if (!response.ok) throw new Error('Failed to fetch presidential data');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: partyData } = useQuery({
    queryKey: ['/api/political/party-support'],
    queryFn: async () => {
      const response = await fetch('/api/political/party-support');
      if (!response.ok) throw new Error('Failed to fetch party data');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: candidateData } = useQuery({
    queryKey: ['/api/political/candidate-support'],
    queryFn: async () => {
      const response = await fetch('/api/political/candidate-support');
      if (!response.ok) throw new Error('Failed to fetch candidate data');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: currentStats } = useQuery({
    queryKey: ['/api/political/current-stats'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: weeklyTrends } = useQuery({
    queryKey: ['/api/political/weekly-trends', user?.gender, (user as any)?.ageGroup, user?.region],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.gender === 'male') params.append('gender', '남성');
      else if (user?.gender === 'female') params.append('gender', '여성');
      if ((user as any)?.ageGroup) params.append('ageGroup', (user as any).ageGroup);
      if (user?.region) params.append('region', user.region);

      const response = await fetch(`/api/political/weekly-trends?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch weekly trends');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: assemblyBills = [] } = useQuery({
    queryKey: ['/api/assembly-bills'],
    queryFn: async () => {
      const response = await fetch('/api/assembly-bills');
      if (!response.ok) throw new Error('Failed to fetch assembly bills');
      return response.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const allCurrentSurveys = politicsSurveys?.currentSurveys || [];
  const allPastSurveys = politicsSurveys?.pastSurveys || [];

  const surveys = allCurrentSurveys.filter((survey: any) => {
    const isSystemSurvey = survey.createdBy === 'system' || !survey.createdBy;
    // Safer Filter: Show any ACTIVE regular weekly poll
    // This avoids client-side date calculation mismatches (e.g. timezone differences)
    const isWeeklyPoll = survey.title.includes('정기 여론조사') && survey.isActive;

    return isSystemSurvey && isWeeklyPoll;
  });

  const pastSurveys = allPastSurveys.filter((survey: any) => {
    const isSystemSurvey = survey.createdBy === 'system' || !survey.createdBy;
    const isBillSurvey = survey.title.includes('법률안') ||
      survey.description.includes('발의한 법률안') ||
      survey.description.includes('의원이 발의한');
    return isSystemSurvey && !isBillSurvey;
  });

  const { data: userParticipations = [] } = useQuery({
    queryKey: ['/api/auth/user/participations'],
    enabled: !!user && !user.isGuest,
    staleTime: 1 * 60 * 1000,
  });

  const participatedSurveyIds = Array.isArray(userParticipations) ? userParticipations.map((p: any) => p.surveyId || p.survey_id) : [];

  const getCurrentWeekInfo = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const firstDay = new Date(year, now.getMonth(), 1);
    const currentDate = now.getDate();
    const firstMonday = 1 + ((8 - firstDay.getDay()) % 7);
    let weekNumber = 1;
    if (currentDate >= firstMonday) {
      weekNumber = Math.ceil((currentDate - firstMonday + 1) / 7) + 1;
    }
    return `${String(year).slice(-2)}년 ${month}월 ${weekNumber}주차`;
  };

  // --- Data Processors ---
  const processApprovalData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    const colorMap: Record<string, string> = {
      '매우 잘하고 있다': '#10b981',
      '잘하는 편이다': '#34d399',
      '잘못하는 편이다': '#f87171',
      '매우 잘못하고 있다': '#ef4444',
      '잘 모름': '#fbbf24',
    };
    return data.map(item => ({
      name: item.label,
      value: item.value,
      color: colorMap[item.label] || '#94a3b8'
    }));
  };

  const calculateApprovalSummary = (data: any[]) => {
    if (!data) return [];
    const positive = data.filter(d => d.label.includes('잘하고')).reduce((acc, curr) => acc + curr.value, 0);
    const negative = data.filter(d => d.label.includes('잘못하고')).reduce((acc, curr) => acc + curr.value, 0);
    const neutral = data.find(d => d.label.includes('모름'))?.value || 0;

    return [
      { label: 'Positive', value: positive, color: 'text-emerald-400' },
      { label: 'Neutral', value: neutral, color: 'text-amber-400' },
      { label: 'Negative', value: negative, color: 'text-red-400' }
    ];
  };

  const processPartyData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    const partyColors: Record<string, string> = {
      '더불어민주당': '#004EA2',
      '국민의힘': '#E61E2B',
      '조국혁신당': '#0073CF',
      '개혁신당': '#FF7920',
      '진보당': '#D6001C',
      '기타 정당': '#9CA3AF',
      '지지 정당 없음': '#6B7280',
      '무당층': '#6B7280'
    };
    return data.map(item => ({
      name: item.label,
      value: item.value,
      color: partyColors[item.label] || '#9CA3AF'
    })).sort((a, b) => b.value - a.value);
  };

  const processCandidateData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    return data.map(item => ({
      name: item.label,
      value: item.value + '%',
      opacity: 'opacity-100', // Dynamic opacity based on rank?
      rawValue: item.value
    })).sort((a, b) => b.rawValue - a.rawValue).slice(0, 9); // Top 9
  }


  const handleSurveyClick = (surveyId: number) => {
    if (!user || user.isGuest) {
      toast({ title: "로그인 필요", description: "투표 참여 시 경험치 50EXP가 지급됩니다!", variant: "default" });
      return;
    }
    if (participatedSurveyIds.includes(surveyId)) {
      toast({ title: "이미 참여했습니다", description: "이 설문에 이미 참여하셨습니다.", variant: "destructive" });
      return;
    }
    setLocation(`/survey/${surveyId}`);
  };

  const handleViewResults = async (surveyId: number) => {
    setLoadingResults(true);
    try {
      const response = await fetch(`/api/auth/politics-survey-results/${surveyId}`);
      if (!response.ok) throw new Error('Failed to fetch survey results');
      const results = await response.json();
      setSurveyResults(results);
      setShowResults(surveyId);
    } catch (error) {
      toast({ title: "결과 조회 실패", description: "설문 결과 조회 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setLoadingResults(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
          <p className="text-white/40 font-black uppercase tracking-widest text-xs italic">Loading Politics...</p>
        </div>
      </div>
    );
  }

  if (showResults && surveyResults) {
    return (
      <div className="min-h-screen bg-black">
        <PoliticsResultsModal surveyResults={surveyResults} onClose={() => { setShowResults(null); setSurveyResults(null); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30 pb-24">
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar topColor="#E11D48" bottomColor="#2563EB" intensity={1.5} rotationSpeed={0.5} glowAmount={0.002} pillarWidth={2.0} />
      </div>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      <MobileHeader />

      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-40 bg-transparent"
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <motion.h1
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-red-400 to-orange-400"
            >
              POLITICS
            </motion.h1>
            <p className="text-[10px] font-bold text-white/50 tracking-widest uppercase mt-0.5">Real-time Analysis</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-white/10 flex items-center justify-center">
            <Vote className="w-5 h-5 text-orange-400" />
          </div>
        </div>
      </motion.header>

      <main className="px-6 py-8 space-y-8 relative z-10">
        <Tabs defaultValue="dashboard" value={tab} onValueChange={handleTabChange} className="w-full space-y-8">
          <div className="relative">
            <TabsList id="politics-category-tabs" className="w-full h-12 bg-white/5 p-1 rounded-[24px] border border-white/10 grid grid-cols-4 gap-1">
              {['dashboard', 'trends', 'surveys', 'tendency'].map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="relative z-10 flex-1 h-full flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white/30 transition-all duration-500 data-[state=active]:text-white bg-transparent border-none shadow-none"
                >
                  <span className="relative z-20">
                    {t === 'dashboard' ? '정치 지표' : t === 'trends' ? '주간 동향' : t === 'surveys' ? '주간 설문' : '정치 성향'}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <style dangerouslySetInnerHTML={{
              __html: `
              #politics-category-tabs [data-state="active"] { color: white !important; }
              #politics-category-tabs [data-state="active"]::after {
                content: ""; position: absolute; inset: 4px;
                background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
                border-radius: 22px; z-index: -1;
                box-shadow: 0 4px 15px rgba(249, 115, 22, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.2);
                animation: tabIn 0.4s cubic-bezier(0.23, 1, 0.32, 1);
              }
              @keyframes tabIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            `}} />
          </div>

          <TabsContent value="dashboard" className="space-y-10">
            <div className="text-center space-y-3">
              <div className="inline-block px-6 py-2 rounded-2xl bg-orange-600/10 border border-orange-500/20">
                <span className="text-sm font-black italic text-orange-400">{getCurrentWeekInfo()} Update</span>
              </div>
              {presidentialData && presidentialData.length > 0 && presidentialData[0].totalParticipants > 0 && (
                <div className="text-sm text-white/60 font-bold">
                  실시간 참여자: <span className="text-white font-black">{presidentialData[0].totalParticipants}명</span>
                </div>
              )}
            </div>

            {/* Presidential Approval */}
            <InteractiveChartCard
              title="대통령 국정수행 지지율"
              subTitle="Approval Rating"
              type="PRESIDENTIAL"
              icon={<TrendingUp className="h-6 w-6 text-orange-400" />}
              data={(() => {
                const p = (currentStats as any)?.presidential || {};
                return [
                  { label: "Positive", value: p.positive || 0, color: "#10b981", twColorClass: "text-emerald-400" },
                  { label: "Negative", value: p.negative || 0, color: "#ef4444", twColorClass: "text-rose-400" },
                  { label: "Neutral", value: p.neutral || 0, color: "#6b7280", twColorClass: "text-gray-400" }
                ];
              })()}
              genderBreakdown={(currentStats as any)?.genderBreakdown}
              ageBreakdown={(currentStats as any)?.ageBreakdown}
              regionBreakdown={(currentStats as any)?.regionBreakdown}
            />

            {/* Party Support */}
            <InteractiveChartCard
              title="정당 지지율"
              subTitle="Party Support"
              type="PARTY"
              icon={<PieChartIcon className="h-5 w-5 text-purple-400" />}
              data={(() => {
                const p = (currentStats as any)?.parties || {};
                // Define party color mapping (simplified)
                const colors: Record<string, string> = {
                  "더불어민주당": "#2563eb",
                  "국민의힘": "#dc2626",
                  "정의당": "#facc15",
                  "조국혁신당": "#1d4ed8",
                  "개혁신당": "#ea580c",
                  "무당층/기타": "#6b7280"
                };
                return Object.entries(p).map(([name, value]) => ({
                  label: name,
                  value: value as number,
                  color: colors[name] || "#6b7280",
                  icon: <div className="w-5 h-5 rounded flex items-center justify-center overflow-hidden"><PartyLogo party={name} size="sm" /></div>
                }));
              })()}
              genderBreakdown={(currentStats as any)?.genderBreakdown}
              ageBreakdown={(currentStats as any)?.ageBreakdown}
              regionBreakdown={(currentStats as any)?.regionBreakdown}
            />

            {/* Presidential Priorities */}
            <InteractiveChartCard
              title="국정 우선 과제"
              subTitle="Top Priorities"
              type="PRIORITY"
              icon={<CheckSquare className="h-5 w-5 text-blue-400" />}
              data={(() => {
                const p = (currentStats as any)?.priorities || {};
                const colors: Record<string, string> = {
                  "물가/경제 안정": "#3b82f6", // Blue
                  "소통/협치": "#a855f7", // Purple
                  "인적 쇄신": "#22c55e", // Green
                  "공정/부패 척결": "#ef4444", // Red
                  "개혁 마무리": "#f97316" // Orange
                };
                return Object.entries(p).map(([name, value]) => ({
                  label: name,
                  value: value as number,
                  color: colors[name] || "#6b7280",
                  twColorClass: colors[name] ? `text-[${colors[name]}]` : "text-gray-400"
                })).sort((a, b) => b.value - a.value);
              })()}
              genderBreakdown={(currentStats as any)?.genderBreakdown}
              ageBreakdown={(currentStats as any)?.ageBreakdown}
              regionBreakdown={(currentStats as any)?.regionBreakdown}
            />

          </TabsContent>

          <TabsContent value="trends" className="space-y-8">
            {/* Trend Type Selector */}
            <div className="flex overflow-x-auto hide-scrollbar border-b border-white/5 bg-black/50 backdrop-blur-sm mb-6">
              {[
                { id: 'presidential' as const, label: '대통령 지지율' },
                { id: 'party' as const, label: '정당 지지율' },
                { id: 'priority' as const, label: '국정 우선 과제' }
              ].map((type) => {
                const isActive = trendType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setTrendType(type.id)}
                    className={`
                      relative py-4 px-6 text-sm font-bold whitespace-nowrap transition-colors outline-none
                      ${isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
                    `}
                  >
                    {type.label}
                    {isActive && (
                      <motion.div
                        layoutId="activeTrendTab"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500 shadow-[0_-2px_8px_rgba(249,115,22,0.5)]"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Hot Issue Badge */}
            <motion.div
              key={trendType}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card-strong p-6 rounded-[24px] border border-white/10 bg-gradient-to-r from-orange-900/20 via-black/20 to-red-900/20"
            >
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                  <span className="text-2xl">🚀</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1">이번 주 핫이슈</div>
                  <div className="text-sm font-bold text-white">
                    {trendType === 'presidential' && '대통령 지지율 '}
                    {trendType === 'party' && '더불어민주당 '}
                    {trendType === 'priority' && '물가/경제 안정 '}
                    <span className="text-emerald-400">
                      {trendType === 'presidential' && '▲6.0%p'}
                      {trendType === 'party' && '▲6.0%p'}
                      {trendType === 'priority' && '35%'}
                    </span>
                    {trendType === 'presidential' && ' 상승!'}
                    {trendType === 'party' && ' 상승하며 1위 달성!'}
                    {trendType === 'priority' && ' 압도적 1위!'}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Main Trend Chart */}
            <motion.div
              key={`chart-${trendType}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card-strong p-8 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-3xl"
            >
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.2em] mb-2">Weekly Trend</h3>
                  <h2 className="text-2xl font-black text-white">
                    {trendType === 'presidential' && '대통령 지지율 추이'}
                    {trendType === 'party' && '정당 지지율 추이'}
                    {trendType === 'priority' && '국정 우선 과제 추이'}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40 font-bold mb-1">
                    {selectedWeekData ? `${selectedWeekData.week} 참여자` : '최근 주차 참여자'}
                  </div>
                  <div className="text-lg font-black text-white">
                    {(() => {
                      if (selectedWeekData) return selectedWeekData.참여자;
                      const data = trendType === 'presidential' ? weeklyTrends?.presidential :
                        weeklyTrends?.party;
                      const latestWeek = data?.[data.length - 1];
                      return latestWeek?.참여자 || 0;
                    })()}명
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {trendType === 'presidential' ? (
                    <AreaChart
                      data={weeklyTrends?.presidential || []}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          setSelectedWeekData(data.activePayload[0].payload);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} domain={[0, 60]} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }} labelStyle={{ color: '#a78bfa', fontWeight: 'bold', marginBottom: '8px' }} />
                      <Area type="monotone" dataKey="긍정" stroke="#10b981" strokeWidth={3} fill="url(#colorPositive)" dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }} />
                      <Area type="monotone" dataKey="부정" stroke="#ef4444" strokeWidth={3} fill="url(#colorNegative)" dot={{ fill: '#ef4444', r: 4 }} activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }} />
                    </AreaChart>
                  ) : trendType === 'party' ? (
                    <AreaChart
                      data={weeklyTrends?.party || []}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          setSelectedWeekData(data.activePayload[0].payload);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="colorDemocrat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#004EA2" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#004EA2" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPeople" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E61E2B" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#E61E2B" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCho" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0073CF" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0073CF" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' }} axisLine={false} tickLine={false} domain={[0, 50]} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }} labelStyle={{ color: '#a78bfa', fontWeight: 'bold', marginBottom: '8px' }} />
                      <Area type="monotone" dataKey="더불어민주당" stroke="#004EA2" strokeWidth={3} fill="url(#colorDemocrat)" dot={{ fill: '#004EA2', r: 4 }} activeDot={{ r: 6, stroke: '#004EA2', strokeWidth: 2 }} />
                      <Area type="monotone" dataKey="국민의힘" stroke="#E61E2B" strokeWidth={3} fill="url(#colorPeople)" dot={{ fill: '#E61E2B', r: 4 }} activeDot={{ r: 6, stroke: '#E61E2B', strokeWidth: 2 }} />
                      <Area type="monotone" dataKey="조국혁신당" stackId="1" stroke="#1d4ed8" strokeWidth={2} fill="#1d4ed8" />
                    </AreaChart>
                  ) : (
                    <AreaChart
                      data={weeklyTrends?.priority || []}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          setSelectedWeekData(data.activePayload[0].payload);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="colorPriority" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }} labelStyle={{ color: '#a78bfa', fontWeight: 'bold', marginBottom: '8px' }} />
                      <Area type="monotone" dataKey="물가/경제 안정" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#colorPriority)" />
                      <Area type="monotone" dataKey="소통/협치" stackId="1" stroke="#a855f7" strokeWidth={2} fill="#a855f7" />
                      <Area type="monotone" dataKey="인적 쇄신" stackId="1" stroke="#22c55e" strokeWidth={2} fill="#22c55e" />
                      <Area type="monotone" dataKey="공정/부패 척결" stackId="1" stroke="#ef4444" strokeWidth={2} fill="#ef4444" />
                      <Area type="monotone" dataKey="개혁 마무리" stackId="1" stroke="#f97316" strokeWidth={2} fill="#f97316" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t border-white/5 flex-wrap">
                {trendType === 'presidential' && (
                  <>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                      <span className="text-xs font-bold text-white/70">긍정</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                      <span className="text-xs font-bold text-white/70">부정</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#fbbf24]"></div>
                      <span className="text-xs font-bold text-white/70">중립</span>
                    </div>
                  </>
                )}
                {trendType === 'party' && (
                  <>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#004EA2]"></div>
                      <span className="text-xs font-bold text-white/70">더불어민주당</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#E61E2B]"></div>
                      <span className="text-xs font-bold text-white/70">국민의힘</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-[#0073CF]"></div>
                      <span className="text-xs font-bold text-white/70">조국혁신당</span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>

            {/* Weekly Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <motion.div
                key={`up-${trendType}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card-strong p-6 rounded-[24px] border border-white/10"
              >
                <div className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">최고 상승</div>
                <div className="text-2xl font-black text-white mb-1">
                  {trendType === 'presidential' ? '+6.0%p' : '+6.0%p'}
                </div>
                <div className="text-xs text-white/60 font-bold">
                  {trendType === 'presidential' ? '긍정 평가' : '더불어민주당'}
                </div>
              </motion.div>

              <motion.div
                key={`down-${trendType}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card-strong p-6 rounded-[24px] border border-white/10"
              >
                <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-2">최대 하락</div>
                <div className="text-2xl font-black text-white mb-1">
                  {trendType === 'presidential' ? '-6.0%p' : '-6.0%p'}
                </div>
                <div className="text-xs text-white/60 font-bold">
                  {trendType === 'presidential' && '부정 평가'}
                  {trendType === 'party' && '국민의힘'}
                </div>
              </motion.div>
            </div>

            {/* Detailed Analysis for Selected Week */}
            <AnimatePresence mode="wait">
              {selectedWeekData?.raw ? (
                <motion.div
                  key={`detail-${selectedWeekData.week}-${trendType}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="space-y-6 pt-4"
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-black text-orange-400 uppercase tracking-widest">{selectedWeekData.week} 상세 분석</h2>
                    <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 uppercase font-black">Archive</Badge>
                  </div>

                  <InteractiveChartCard
                    title={trendType === 'presidential' ? "대통령 국정수행 지지율" : "정당 지지율"}
                    subTitle={trendType === 'presidential' ? "Approval Rating" : "Party Support"}
                    type={trendType === 'presidential' ? "PRESIDENTIAL" : "PARTY"}
                    icon={trendType === 'presidential' ? <TrendingUp className="h-6 w-6 text-orange-400" /> : <PieChartIcon className="h-5 w-5 text-purple-400" />}
                    data={(() => {
                      const raw = selectedWeekData.raw;
                      if (raw) {
                        if (trendType === 'presidential') {
                          const p = raw.presidential || {};
                          return [
                            { label: "Positive", value: p.positive || 0, color: "#10b981", twColorClass: "text-emerald-400" },
                            { label: "Negative", value: p.negative || 0, color: "#ef4444", twColorClass: "text-rose-400" },
                            { label: "Neutral", value: p.neutral || 0, color: "#6b7280", twColorClass: "text-gray-400" }
                          ];
                        } else {
                          const p = raw.parties || {};
                          const colors: Record<string, string> = {
                            "더불어민주당": "#2563eb",
                            "국민의힘": "#dc2626",
                            "정의당": "#facc15",
                            "조국혁신당": "#1d4ed8",
                            "개혁신당": "#ea580c",
                            "무당층/기타": "#6b7280"
                          };
                          return Object.entries(p).map(([name, value]) => ({
                            label: name,
                            value: value as number,
                            color: colors[name] || "#6b7280",
                            icon: <div className="w-5 h-5 rounded flex items-center justify-center overflow-hidden"><PartyLogo party={name} size="sm" /></div>
                          }));
                        }
                      }
                      return [];
                    })()}
                    genderBreakdown={selectedWeekData.raw.genderBreakdown}
                    ageBreakdown={selectedWeekData.raw.ageBreakdown}
                    regionBreakdown={selectedWeekData.raw.regionBreakdown}
                  />
                </motion.div>
              ) : (
                <div className="glass-card-strong p-8 rounded-[32px] border border-white/5 bg-white/[0.02] text-center mt-4">
                  <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em] leading-relaxed">
                    차트의 데이터 점을 클릭하여<br />
                    해당 주차의 <span className="text-orange-400/50">상세 여론조사 결과</span>를 확인하세요
                  </p>
                </div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="surveys" className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-black text-white/40 uppercase tracking-widest">Active Polls</h2>
              <div className="text-[9px] font-black text-emerald-500 uppercase flex items-center">
                <div className="w-1 h-1 bg-emerald-500 rounded-full mr-2 animate-pulse"></div>
                Live
              </div>
            </div>
            {surveys.length === 0 ? (
              <div className="glass-card-light p-10 rounded-[32px] text-center italic text-white/30 border border-white/5">
                No active surveys this week
              </div>
            ) : (
              surveys.map((survey: any) => {
                const isParticipated = participatedSurveyIds.includes(survey.id);
                return (
                  <motion.div key={survey.id} whileHover={{ scale: 1.01 }}>
                    <Card className="glass-card-light border-white/5 bg-white/[0.02] overflow-hidden rounded-[32px] transition-all hover:bg-white/[0.04]">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <span className="text-[9px] font-black px-3 py-1 rounded-lg border border-orange-500/20 text-orange-400 bg-orange-500/5 uppercase tracking-widest">Survey</span>
                          <span className="text-[10px] font-bold text-white/20 italic">{survey.participantCount} 참여</span>
                        </div>
                        <h3 className="text-lg font-black text-white leading-tight mb-3 transition-colors">{survey.title}</h3>
                        <p className="text-xs font-medium text-white/40 leading-relaxed mb-6 line-clamp-2">{survey.description}</p>
                        <div className="flex items-center space-x-3">
                          <Button onClick={() => handleSurveyClick(survey.id)} disabled={isParticipated} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white h-12 rounded-2xl font-black uppercase tracking-widest text-[10px]">
                            {isParticipated ? '참여 완료' : '설문 참여'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}

            <div className="pt-8">
              <div className="flex items-center justify-between mb-6 px-1">
                <h2 className="text-xs font-black text-white/40 uppercase tracking-widest">국회 발의 법률안</h2>
                <Gavel className="h-4 w-4 text-white/20" />
              </div>
              <div className="space-y-4">
                {assemblyBills.slice(0, showMoreBills ? undefined : 5).map((bill: any) => (
                  <motion.div key={bill.id} className="glass-card-light p-5 rounded-3xl border border-white/5 bg-white/[0.01]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-1 h-1 bg-amber-500 rounded-full"></div>
                        <span className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest">{bill.proposer} 의원 / {bill.committee}</span>
                      </div>
                      <span className="text-[9px] font-bold text-white/20 italic">{new Date(bill.proposalDate).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-sm font-black text-white leading-snug mb-2">{bill.billName}</h4>
                    {(bill.surveyQuestion || bill.billSummary) && (
                      <p className="text-[11px] font-medium text-white/40 leading-normal mb-4 line-clamp-2">
                        {bill.surveyQuestion || bill.billSummary}
                      </p>
                    )}
                    <Button variant="ghost" className="w-full bg-white/5 text-[10px] font-black uppercase tracking-widest h-10 rounded-xl" onClick={() => window.open(bill.detailLink, '_blank')}>
                      상세보기
                    </Button>
                  </motion.div>
                ))}
                <Button variant="ghost" className="w-full text-xs font-black uppercase tracking-widest text-white/30" onClick={() => setShowMoreBills(!showMoreBills)}>
                  {showMoreBills ? '접기' : `전체 보기 (${assemblyBills.length})`}
                </Button>
              </div>
            </div>

            {pastSurveys.length > 0 && (
              <div className="pt-8">
                <button onClick={() => setShowPastSurveys(!showPastSurveys)} className="flex items-center justify-between w-full px-1 text-xs font-black text-white/40 uppercase tracking-widest mb-4">
                  <span>Past Results</span>
                  <History className={`h-4 w-4 transition-transform ${showPastSurveys ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showPastSurveys && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                      {pastSurveys.map((survey: any) => (
                        <div key={survey.id} className="glass-card-light p-4 rounded-3xl border border-white/5 bg-white/[0.01] flex items-center justify-between">
                          <div className="flex-1 min-w-0 pr-4">
                            <h4 className="text-sm font-black text-white/60 truncate">{survey.title}</h4>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tendency" className="space-y-8">
            <PoliticalAnalysisTab />
          </TabsContent>
        </Tabs >
      </main >
      <BottomNav />
    </div >
  );
}

function PoliticalAnalysisTab() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({}); // questionId -> score
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing result
    if (user && !user.isGuest) {
      const saved = localStorage.getItem(`political_analysis_${(user as any).auth_id || user.id}`);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          // Check if result is recent (optional, but good UX)
          setResultData(data.result);
          setAnswers(data.answers || {});
          setShowResult(true);
        } catch (e) {
          console.error("Failed to load saved analysis", e);
        }
      }
    }
  }, [user]);

  const handleAnswer = (score: number) => {
    setAnswers(prev => ({
      ...prev,
      [politicalQuestions[currentStep].id]: score
    }));

    // Next step or Finish
    if (currentStep < politicalQuestions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      finishAnalysis({ ...answers, [politicalQuestions[currentStep].id]: score });
    }
  };

  const finishAnalysis = (finalAnswers: Record<number, number>) => {
    setIsAnalyzing(true);

    // Simulate processing time for effect
    setTimeout(() => {
      // Calculate Axis Scores
      const axes = {
        Economy: [] as number[],
        Social: [] as number[],
        Diplomacy: [] as number[],
        Governance: [] as number[],
        Participation: [] as number[]
      };

      politicalQuestions.forEach(q => {
        if (finalAnswers[q.id] !== undefined) {
          axes[q.axis as keyof typeof axes].push(finalAnswers[q.id]);
        }
      });

      const axisScores: any = {};
      Object.keys(axes).forEach((axis) => {
        const scores = axes[axis as keyof typeof axes];
        if (scores.length > 0) {
          // Average score (-2 to 2)
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          // Map -2..2 to 0..100
          axisScores[axis] = Math.round(((avg + 2) / 4) * 100);
        } else {
          axisScores[axis] = 50;
        }
      });

      // Calculate Total Average Score
      const allScores = Object.values(finalAnswers);
      const totalAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;

      // Determine Classification
      let classification = "";
      let description = "";
      let color = "";

      if (totalAvg >= 1.2) {
        classification = "진보";
        description = "사회 변화와 평등을 중시하며, 정부의 적극적 역할을 지지하는 성향입니다.";
        color = "#ef4444";
      } else if (totalAvg >= 0.4) {
        classification = "중도진보";
        description = "진보적 가치를 지지하되, 점진적 변화를 선호하는 균형잡힌 성향입니다.";
        color = "#f97316";
      } else if (totalAvg >= -0.4) {
        classification = "중도";
        description = "좌우 이념에 치우치지 않고 실용적 접근을 선호하는 중립적 성향입니다.";
        color = "#eab308";
      } else if (totalAvg >= -1.2) {
        classification = "중도보수";
        description = "안정과 질서를 중시하되, 필요한 변화는 수용하는 온건한 성향입니다.";
        color = "#3b82f6";
      } else {
        classification = "보수";
        description = "전통적 가치와 질서를 중시하며, 급진적 변화에 신중한 성향입니다.";
        color = "#10b981";
      }

      const result = {
        classification,
        description,
        color,
        axisScores,
        avgScore: totalAvg.toFixed(2),
        totalScore: Math.round(((totalAvg + 2) / 4) * 100)
      };

      setResultData(result);
      setShowResult(true);
      setIsAnalyzing(false);

      // Save to localStorage
      if (user && !user.isGuest) {
        const userId = (user as any).auth_id || user.id;
        localStorage.setItem(`political_analysis_${userId}`, JSON.stringify({
          result,
          answers: finalAnswers,
          timestamp: Date.now()
        }));

        toast({
          title: "분석 완료",
          description: "정치 성향 분석 결과가 저장되었습니다.",
        });
      }
    }, 1500);
  };

  const retest = () => {
    setCurrentStep(0);
    setAnswers({});
    setShowResult(false);
    setResultData(null);
  };

  // Radar Chart Data preparation
  const getRadarData = () => {
    if (!resultData) return [];
    const axisNames: Record<string, string> = {
      Economy: '경제관',
      Social: '사회관',
      Diplomacy: '외교안보',
      Governance: '국가관',
      Participation: '정치참여'
    };
    return Object.entries(resultData.axisScores).map(([axis, score]: [string, any]) => ({
      subject: axisNames[axis] || axis,
      value: score,
      fullMark: 100
    }));
  };

  if (showResult && resultData) {
    return (
      <div className="space-y-6">
        <div className="glass-card p-8 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none" style={{ backgroundColor: resultData.color }} />

          <div className="text-center mb-8 relative z-10">

            <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
              당신은 <span style={{ color: resultData.color }}>{resultData.classification}</span> 성향입니다
            </h2>
            <p className="text-white/60 font-medium leading-relaxed max-w-lg mx-auto">
              {resultData.description}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 relative z-10">
            {/* Radar Chart */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-center min-h-[300px]">
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData()}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Tendency"
                    dataKey="value"
                    stroke={resultData.color}
                    fill={resultData.color}
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Scores */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Detailed Scores</h3>
              {getRadarData().map((item, idx) => (
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
                      style={{ backgroundColor: resultData.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center pt-6 border-t border-white/5 relative z-10">
            <Button
              onClick={retest}
              variant="outline"
              className="border-white/10 hover:bg-white/5 text-white/60 hover:text-white"
            >
              <History className="w-4 h-4 mr-2" />
              다시 분석하기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">
          <span>Question {currentStep + 1}</span>
          <span>{politicalQuestions.length}</span>
        </div>
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / politicalQuestions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAnalyzing ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-8" />
            <h3 className="text-2xl font-black text-white mb-2">분석 중입니다...</h3>
            <p className="text-white/40">당신의 정치적 DNA를 해독하고 있습니다.</p>
          </motion.div>
        ) : (
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                {politicalQuestions[currentStep].category}
              </Badge>
              <h2 className="text-2xl font-black text-white leading-tight">
                {politicalQuestions[currentStep].question}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {politicalQuestions[currentStep].options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(option.score)}
                  className="group relative p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-purple-500/30 transition-all duration-300 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white/80 group-hover:text-white transition-colors">
                      {option.text}
                    </span>
                    <div className="w-6 h-6 rounded-full border-2 border-white/10 group-hover:border-purple-500 flex items-center justify-center transition-colors">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
