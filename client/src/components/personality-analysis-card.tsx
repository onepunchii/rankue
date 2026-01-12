import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

// Union type for backward compatibility
interface PersonalityAnalysis {
  profile: {
    nickname: string;
    description?: string; // New
    roast_intro?: string; // Legacy
    main_class?: string; // New
  };
  // New Array Format
  radar_chart_data?: {
    subject: string;
    label: string;
    A: number;
    fullMark: number;
  }[];
  // Legacy Object Format
  radar_chart?: {
    politics: { score: number; label: string };
    economy: { score: number; label: string };
    entertainment: { score: number; label: string };
    international: { score: number; label: string };
    sports: { score: number; label: string };
  };
  moments_of_truth: {
    category: string;
    question: string;
    choice: string;
    analysis: string;
  }[];
  // New
  final_verdict?: {
    strongest_stat: string;
    prescription: string;
  };
  // Legacy
  final_diagnosis?: {
    type: string;
    prescription: string;
  };
}

interface EligibilityData {
  isEligible: boolean;
  totalActivities: number;
  createdSurveys: number;
  participations: number;
  nextAnalysisAt: number;
  currentMilestone: number;
  analysisLevel: 'basic' | 'advanced' | 'comprehensive' | null;
}

interface AnalysisResponse {
  analysis: PersonalityAnalysis;
  eligibility: EligibilityData;
  cached?: boolean;
}

interface PersonalityAnalysisCardProps {
  userId: string;
}

export default function PersonalityAnalysisCard({ userId }: PersonalityAnalysisCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check eligibility first
  const { data: eligibilityData, isLoading: eligibilityLoading } = useQuery<EligibilityData>({
    queryKey: ["/api/auth/personality-eligibility"],
    enabled: !!userId,
    staleTime: 1 * 60 * 1000,
  });

  // Only fetch analysis if eligible
  const { data: analysisData, isLoading: analysisLoading, error } = useQuery<AnalysisResponse>({
    queryKey: ["/api/auth/personality-analysis"],
    enabled: !!userId && !!eligibilityData?.isEligible,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });

  const isLoading = eligibilityLoading || analysisLoading;
  const analysis = analysisData?.analysis;
  const eligibility = analysisData?.eligibility;

  // Robust Data Safeties
  const profileDescription = analysis?.profile?.description || analysis?.profile?.roast_intro || "데이터 수집 중...";
  const mainClass = analysis?.profile?.main_class || analysis?.final_diagnosis?.type || "분석 중";
  const finalType = analysis?.final_verdict?.strongest_stat || analysis?.final_diagnosis?.type || "분석 완료";
  const prescription = analysis?.final_verdict?.prescription || analysis?.final_diagnosis?.prescription || "더 많은 활동이 필요합니다.";

  // Radar Data Transformation
  let radarData: any[] = [];
  if (analysis?.radar_chart_data) {
    radarData = analysis.radar_chart_data;
  } else if (analysis?.radar_chart) {
    // Legacy transformation
    const rc = analysis.radar_chart;
    radarData = [
      { subject: "정치", label: rc.politics.label, A: rc.politics.score, fullMark: 100 },
      { subject: "경제", label: rc.economy.label, A: rc.economy.score, fullMark: 100 },
      { subject: "연예", label: rc.entertainment.label, A: rc.entertainment.score, fullMark: 100 },
      { subject: "국제", label: rc.international.label, A: rc.international.score, fullMark: 100 },
      { subject: "스포츠", label: rc.sports.label, A: rc.sports.score, fullMark: 100 }
    ];
  }

  if (isLoading) {
    return (
      <div className="glass-card border border-white/10 p-8 shadow-2xl">
        <div className="flex items-center space-x-4 mb-8">
          <div className="w-14 h-14 bg-rose-600/20 border border-rose-500/20 rounded-2xl flex items-center justify-center shadow-xl shadow-rose-500/10">
            <i className="fas fa-search-dollar text-rose-400 text-xl animate-pulse"></i>
          </div>
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">팩트 폭격 장전 중...</h3>
            <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Profiling in progress...</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-4 bg-white/5 border border-white/5 rounded-lg animate-pulse"></div>
          <div className="h-4 bg-white/5 border border-white/5 rounded-lg animate-pulse w-3/4"></div>
          <div className="h-4 bg-white/5 border border-white/5 rounded-lg animate-pulse w-1/2"></div>
        </div>
      </div>
    );
  }

  // Show activity progress when not eligible
  if (!isLoading && eligibilityData && !eligibilityData.isEligible) {
    const progressPercentage = (eligibilityData.totalActivities / eligibilityData.nextAnalysisAt) * 100;
    const remaining = eligibilityData.nextAnalysisAt - eligibilityData.totalActivities;

    return (
      <div className="glass-card border border-white/10 p-8 shadow-2xl">
        <div className="flex items-center space-x-4 mb-8">
          <div className="w-14 h-14 bg-purple-600/20 border border-purple-500/20 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/10">
            <i className="fas fa-clipboard-check text-purple-400 text-xl animate-pulse"></i>
          </div>
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">성향 분석 데이터 수집 중...</h3>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Data Collection In Progress</p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Progress to Unlock</span>
            <span className="text-xs font-black italic text-purple-400">
              {eligibilityData.totalActivities} / {eligibilityData.nextAnalysisAt}
            </span>
          </div>

          <div className="w-full bg-white/5 rounded-full h-1.5 mb-6 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 bg-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>

          <div className="text-center">
            <p className="text-sm text-white/80 font-bold leading-relaxed mb-1">
              <span className="text-purple-400 text-lg mr-1">{remaining}개의 설문</span>을 더 진행해주세요!
            </p>
            <p className="text-xs text-white/50 font-medium">
              데이터가 모이면 AI가 당신의 숨겨진 욕망을<br />낱낱이 분석해드립니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!isLoading && !analysis)) {
    return (
      <div className="glass-card border border-white/10 p-8 shadow-2xl">
        <div className="text-center py-10">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-exclamation-triangle text-rose-500 text-xl"></i>
          </div>
          <p className="text-sm text-white/60 font-bold uppercase tracking-widest mb-2">Analysis Error</p>
          <p className="text-xs text-white/20 font-medium">Please refresh or try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card border border-white/10 overflow-hidden relative">
      {/* Background decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="p-8 relative z-10">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600/20 to-orange-600/20 border border-red-500/20 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/10 shrink-0">
              <i className="fas fa-bomb text-red-400 text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-tight leading-none mb-0.5">AI 팩트 폭격 리포트</h3>
              <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Warning: High Toxicity</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 uppercase tracking-tighter font-black text-[9px] px-2 h-5">
            {mainClass}
          </Badge>
        </div>

        {/* 프로필 카드 */}
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl mb-8 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="mb-4">
            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block mb-2">TARGET USER</span>
            <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
              "{analysis?.profile?.nickname}"
            </h2>
          </div>

          <div className="p-4 bg-black/40 rounded-xl border border-white/5">
            <p className="text-sm text-white/80 font-medium leading-relaxed italic">
              <i className="fas fa-quote-left text-red-500/50 mr-2 text-xs"></i>
              {profileDescription}
              <i className="fas fa-quote-right text-red-500/50 ml-2 text-xs"></i>
            </p>
          </div>
        </div>

        {/* 다음 단계 진행도 */}
        {eligibility && (
          <div className="mb-8 px-1">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest leading-none">Next Analysis Update</span>
              <span className="text-[10px] font-black text-purple-400 leading-none">
                {eligibility.totalActivities} / {eligibility.nextAnalysisAt}
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(147,51,234,0.3)]"
                style={{ width: `${Math.min((eligibility.totalActivities / eligibility.nextAnalysisAt) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 레이더 차트 */}
        <div className="mb-8 p-4 bg-white/[0.02] rounded-3xl border border-white/5">
          <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6 text-center">Desire Stats</h4>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis
                  dataKey="label"
                  tick={{ fill: 'white', fontSize: 11, fontWeight: 700 }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Stats"
                  dataKey="A"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="#ef4444"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 결정적 증거 (Moments of Truth) */}
        <div className="mb-8">
          <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <i className="fas fa-search text-red-400"></i> Moments of Truth
          </h4>
          <div className="space-y-4">
            {analysis?.moments_of_truth?.map((moment, index) => (
              <div key={index} className="bg-white/5 border border-white/5 p-4 rounded-xl hover:bg-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/10 text-white/60 font-bold uppercase">
                    {moment.category}
                  </Badge>
                  <span className="text-[9px] font-black text-white/20 uppercase">EVIDENCE #{index + 1}</span>
                </div>
                <h5 className="text-sm font-bold text-white mb-2 leading-tight">"{moment.question}"</h5>
                <div className="flex items-center gap-2 mb-3 bg-black/20 p-2 rounded-lg">
                  <span className="text-[10px] text-white/40 font-bold uppercase">Choice</span>
                  <span className="text-xs font-black text-white">{moment.choice}</span>
                </div>
                <p className="text-xs text-red-200/90 leading-relaxed font-medium">
                  <i className="fas fa-arrow-right text-red-500 mr-2"></i>
                  {moment.analysis}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 최종 진단 (Final Diagnosis) */}
        <div className="bg-gradient-to-br from-red-900/10 to-orange-900/10 border border-red-500/20 p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-red-500/10 blur-2xl rounded-full"></div>
          <h5 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <i className="fas fa-file-medical-alt"></i> Final Diagnosis
          </h5>

          <div className="mb-4">
            <span className="text-[10px] text-red-400/60 font-black uppercase tracking-wider block mb-1">Type</span>
            <div className="text-lg font-black text-white">{finalType}</div>
          </div>

          <div>
            <span className="text-[10px] text-red-400/60 font-black uppercase tracking-wider block mb-1">Prescription</span>
            <div className="text-sm text-white/80 italic font-medium leading-relaxed">
              "{prescription}"
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}