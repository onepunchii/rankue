import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star, MessageSquare, ThumbsUp, AlertTriangle, User, Mail, Phone, MapPin, CheckCircle, TrendingUp, Users, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";
import PartyLogo from "@/components/PartyLogo";

interface PoliticianDetailProps {
  type: 'assembly' | 'local_council';
}

interface RatingData {
  communicationRating: number;
  policyRating: number;
  integrityRating: number;
  localDevRating: number;
}

interface Comment {
  id: number;
  userId: string;
  content: string;
  isSupport: boolean;
  likeCount: number;
  createdAt: string;
  isLiked?: boolean;
}

interface Politician {
  id: number;
  name: string;
  party: string;
  constituency?: string;
  cityProvince?: string;
  district?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  homepage?: string;
  imageUrl?: string;
  propertyAmount?: number;
  candidacyCount?: string | number;
  billsProposed?: number;
  billsCosponsored?: number;
  attendanceRate?: string | number;
  mainCommittee?: string;
  committees?: string;
  aiPersona?: PoliticianPersona;
}

interface RatingsInfo {
  averageRatings?: {
    totalRatings: number;
    averageRating: number;
    communicationAvg: number;
    policyAvg: number;
    integrityAvg: number;
    localDevAvg: number;
  };
  userRating?: RatingData;
}

interface NationalPersona {
  type: 'national';
  hero_summary: {
    class_icon: string;
    class_name: string;
    level_title: string;
    comment: string;
  };
  stats: {
    power: number;
    intellect: number;
    survival: number;
  };
  history_badges: string[];
  traffic_light: 'Green' | 'Yellow' | 'Red';
}

interface LocalPersona {
  type: 'local';
  summary: {
    title: string;
    comment: string;
    traffic_light: 'Green' | 'Yellow' | 'Red';
  };
  wealth_analysis: {
    tier: string;
    chicken_index: string;
    comparison_text: string;
  };
  rpg_stats: {
    gold: number;
    intellect: number;
    moral: number;
    power: number;
    vitality: number;
    charm: number;
  };
  badges: string[];
  risk_factors: {
    criminal_record: string;
    tax_arrears: string;
  };
}

type PoliticianPersona = NationalPersona | LocalPersona;

export default function PoliticianDetail({ type }: PoliticianDetailProps) {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Validate ID parameter
  const validId = id && !isNaN(Number(id)) && Number(id) > 0 ? id : null;

  const [showRatingForm, setShowRatingForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [ratings, setRatings] = useState<RatingData>({
    communicationRating: 0,
    policyRating: 0,
    integrityRating: 0,
    localDevRating: 0,
  });
  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState<"support" | "suggestion">("support");

  // Fetch politician data
  const { data: politician, isLoading: politicianLoading, error: politicianError } = useQuery<Politician>({
    queryKey: [`/api/${type === 'assembly' ? 'assembly' : 'local-council'}/${validId}`],
    enabled: !!validId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Fetch ratings
  const { data: ratingsData } = useQuery<RatingsInfo>({
    queryKey: [`/api/politicians/${type}/${validId}/ratings`],
    enabled: !!validId,
  });

  // Fetch comments
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [`/api/politicians/${type}/${validId}/comments`],
    enabled: !!validId,
  });

  // Fetch AI Persona (Game Card)
  const { data: persona, isLoading: personaLoading } = useQuery<PoliticianPersona>({
    queryKey: [`/api/politicians/${type}/${validId}/persona`],
    enabled: !!validId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: false, // 오류 시 재시도하지 않음
    refetchOnWindowFocus: false, // 윈도우 포커스 시 재요청하지 않음
  });

  // Submit rating mutation
  const submitRatingMutation = useMutation({
    mutationFn: async (data: RatingData) => {
      if (!validId) throw new Error("유효하지 않은 정치인 ID입니다.");
      return await apiRequest(`/api/politicians/${type}/${validId}/ratings`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "평가 완료",
        description: "평가가 성공적으로 저장되었습니다.",
      });
      setShowRatingForm(false);
      queryClient.invalidateQueries({ queryKey: [`/api/politicians/${type}/${validId}/ratings`] });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "평가 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Submit comment mutation
  const submitCommentMutation = useMutation({
    mutationFn: async (data: { content: string; isSupport: boolean }) => {
      if (!validId) throw new Error("유효하지 않은 정치인 ID입니다.");
      return await apiRequest(`/api/politicians/${type}/${validId}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "댓글 작성 완료",
        description: "댓글이 성공적으로 작성되었습니다.",
      });
      setShowCommentForm(false);
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: [`/api/politicians/${type}/${validId}/comments`] });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "댓글 작성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Toggle like mutation
  const toggleLikeMutation = useMutation({
    mutationFn: async (commentId: number) => {
      return await apiRequest(`/api/comments/${commentId}/like`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/politicians/${type}/${validId}/comments`] });
    },
  });

  // Report comment mutation
  const reportCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      return await apiRequest(`/api/comments/${commentId}/report`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "신고 완료",
        description: "댓글이 신고되었습니다.",
      });
    },
  });

  useEffect(() => {
    if (ratingsData?.userRating) {
      setRatings({
        communicationRating: ratingsData.userRating.communicationRating,
        policyRating: ratingsData.userRating.policyRating,
        integrityRating: ratingsData.userRating.integrityRating,
        localDevRating: ratingsData.userRating.localDevRating,
      });
    }
  }, [ratingsData]);

  const handleRatingSubmit = () => {
    if (Object.values(ratings).some(r => r === 0)) {
      toast({
        title: "평가 미완료",
        description: "모든 항목을 평가해주세요.",
        variant: "destructive",
      });
      return;
    }
    submitRatingMutation.mutate(ratings);
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim()) {
      toast({
        title: "내용 입력 필요",
        description: "댓글 내용을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    submitCommentMutation.mutate({
      content: commentText,
      isSupport: commentType === "support",
    });
  };

  const renderStars = (rating: number, onChange?: (value: number) => void) => {
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onChange?.(star)}
            disabled={!onChange}
            title={`${star} stars`}
            className={`${onChange ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
          >
            <Star
              className={`w-5 h-5 ${star <= rating
                ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                : "fill-white/10 text-white/10"
                }`}
            />
          </button>
        ))}
      </div>
    );
  };

  // If invalid ID, show error and provide navigation back
  if (!validId) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <LightPillar topColor="#EF4444" bottomColor="#7F1D1D" intensity={1.5} rotationSpeed={0.5} />
        <div className="relative z-10 glass-card-strong p-8 rounded-[32px] text-center max-w-sm w-full border border-white/10">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-black italic mb-2">페이지를 찾을 수 없음</h2>
          <p className="text-white/40 text-sm mb-6">유효하지 않은 정치인 정보입니다.</p>
          <Button onClick={() => navigate("/my-district")} className="w-full bg-white/10 hover:bg-white/20 text-white font-bold h-12 rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" /> 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  if (politicianError && politicianError.message) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <LightPillar topColor="#EF4444" bottomColor="#7F1D1D" intensity={1.5} rotationSpeed={0.5} />
        <div className="relative z-10 glass-card-strong p-8 rounded-[32px] text-center max-w-sm w-full border border-white/10">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-black italic mb-2">오류 발생</h2>
          <p className="text-white/40 text-sm mb-6">{politicianError.message}</p>
          <Button onClick={() => navigate("/my-district")} className="w-full bg-white/10 hover:bg-white/20 text-white font-bold h-12 rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" /> 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  if (politicianLoading || !politician) {
    return (
      <div className="min-h-screen bg-black text-white">
        <LightPillar topColor="#10B981" bottomColor="#0891B2" intensity={1.5} rotationSpeed={0.5} />
        <div className="relative z-10 p-6 pt-20 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">프로필 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const isNational = type === 'assembly';

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor="#059669"
          bottomColor="#0e7490"
          intensity={1.5}
          rotationSpeed={0.5}
          glowAmount={0.002}
          pillarWidth={2.0}
        />
      </div>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      {/* Header with Back Button */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-md mx-auto relative pointer-events-auto">
          <div className="absolute top-0 left-0 p-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/my-district")}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0 backdrop-blur-md bg-black/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <main className="relative z-10 max-w-md mx-auto px-6 pt-16 pb-32">
        {/* Politician Profile Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-strong p-8 rounded-[36px] border border-white/10 bg-black/40 backdrop-blur-xl mb-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-50">
            <PartyLogo party={politician.party} size="lg" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                {isNational ? '국회의원' : '기초의원'}
              </Badge>
            </div>
            <h1 className="text-3xl font-black italic text-white mb-1">{politician.name}</h1>
            <p className="text-sm font-medium text-white/60 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {politician.party}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-white/70 bg-white/5 p-3 rounded-2xl border border-white/5">
                <MapPin className="w-4 h-4 text-emerald-500" />
                <span>{politician.constituency || `${politician.cityProvince} ${politician.district}`}</span>
              </div>
              {politician.email && (
                <div className="flex items-center gap-3 text-sm text-white/70 bg-white/5 p-3 rounded-2xl border border-white/5">
                  <Mail className="w-4 h-4 text-sky-500" />
                  <span>{politician.email}</span>
                </div>
              )}
              {(politician.phone || politician.phoneNumber) && (
                <div className="flex items-center gap-3 text-sm text-white/70 bg-white/5 p-3 rounded-2xl border border-white/5">
                  <Phone className="w-4 h-4 text-purple-500" />
                  <span>{politician.phone || politician.phoneNumber}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* AI Game Character Card Section */}
        <AnimatePresence>
          {persona && !personaLoading && (() => {
            const trafficLight = persona.type === 'national' ? persona.traffic_light : persona.summary.traffic_light;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card-strong mb-8 overflow-hidden rounded-[40px] border border-white/10 relative bg-black/40 backdrop-blur-xl"
              >
                <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl z-0"></div>

                <div className="relative z-10 p-8">
                  {persona.type === 'national' && persona.hero_summary ? (
                    // National: Scouter Hero Card Layout
                    <>
                      <div className="flex items-start justify-between mb-8">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${persona.traffic_light === 'Green' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' :
                              persona.traffic_light === 'Yellow' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' :
                                'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                              }`}></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Yeouido Scouter v1.0</span>
                          </div>
                          <h2 className="text-xl font-black italic text-white flex items-center gap-2 tracking-tight">
                            <span className="text-emerald-400">{persona.hero_summary?.class_icon || '⚔️'}</span> {persona.hero_summary?.class_name || '분석 중'}
                          </h2>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm font-bold text-sky-400">{persona.hero_summary?.level_title || '레벨 분석 중'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className={`text-[9px] font-black px-2 py-1 rounded-full border mb-1 ${persona.traffic_light === 'Green' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                            persona.traffic_light === 'Yellow' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                              'border-red-500/30 text-red-500 bg-red-500/10'
                            }`}>
                            {persona.traffic_light.toUpperCase()}
                          </div>
                        </div>
                      </div>

                      {/* History Badges */}
                      <div className="flex flex-wrap gap-2 mb-6">
                        {persona.history_badges?.map((badge, idx) => (
                          <span key={idx} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-sky-300">
                            {badge} 당선
                          </span>
                        ))}
                      </div>

                      {/* Committee Information - Prominent Display */}
                      <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-3xl p-5 border border-cyan-500/20 mb-8">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                            <span className="text-2xl">🏛️</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-[9px] font-black text-cyan-400/60 uppercase tracking-widest mb-1">소속 상임위원회</div>
                            <div className="text-sm font-black text-white">
                              {politician.mainCommittee || politician.committees || '소속 위원회 없음'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Comment */}
                      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 mb-8 relative">
                        <div className="absolute -top-3 -left-1 text-emerald-500/30 text-4xl font-serif">"</div>
                        <p className="text-sm font-medium text-white/90 leading-relaxed italic pr-4">
                          {persona.hero_summary?.comment || 'AI 분석을 진행 중입니다...'}
                        </p>
                        <div className="absolute -bottom-6 -right-1 text-emerald-500/30 text-4xl font-serif transform rotate-180">"</div>
                      </div>

                      {/* Stats */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Hero Stats</span>
                          <span className="text-[10px] font-bold text-white/20 italic">Influence Power</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 mb-6">
                          {[
                            { label: "Power", value: persona.stats.power, icon: "⚡", color: "bg-purple-400" },
                            { label: "Intellect", value: persona.stats.intellect, icon: "🧠", color: "bg-blue-400" },
                            { label: "Survival", value: persona.stats.survival, icon: "🔋", color: "bg-rose-400" },
                          ].map((stat, idx) => (
                            <div key={idx} className="space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{stat.icon} {stat.label}</span>
                                <span className="text-[10px] font-black text-white italic">{stat.value} / 100</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${stat.value}%` }}
                                  transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                                  className={`h-full ${stat.color} rounded-full opacity-80 shadow-[0_0_8px_rgba(255,255,255,0.2)]`}
                                ></motion.div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    // Local Layout (Default for Local or Fallback)
                    <>
                      <div className="flex items-start justify-between mb-8">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${('summary' in persona && persona.summary?.traffic_light === 'Green') || ('traffic_light' in persona && persona.traffic_light === 'Green') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' :
                              ('summary' in persona && persona.summary?.traffic_light === 'Yellow') || ('traffic_light' in persona && persona.traffic_light === 'Yellow') ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' :
                                'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                              }`}></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Polli AI Analysis</span>
                          </div>
                          <h2 className="text-2xl font-black italic text-white flex items-center gap-2">
                            {'summary' in persona ? (
                              <>
                                <span className="text-emerald-400">#</span> {persona.summary?.title || '분석 중'}
                              </>
                            ) : (
                              <>
                                <span className="text-emerald-400">#</span> 기초의원 분석
                              </>
                            )}
                          </h2>
                        </div>
                        <div className="flex flex-col items-end">
                          {'summary' in persona && (
                            <div className={`text-[9px] font-black px-2 py-1 rounded-full border mb-1 ${persona.summary?.traffic_light === 'Green' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                              persona.summary?.traffic_light === 'Yellow' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                                'border-red-500/30 text-red-500 bg-red-500/10'
                              }`}>
                              {persona.summary?.traffic_light?.toUpperCase() || 'ANALYZING'}
                            </div>
                          )}
                        </div>
                      </div>

                      {'badges' in persona && (
                        <div className="flex flex-wrap gap-2 mb-8">
                          {persona.badges?.map((badge: string, idx: number) => (
                            <span key={idx} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-sky-300">
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 mb-8 relative">
                        <div className="absolute -top-3 -left-1 text-emerald-500/30 text-4xl font-serif">"</div>
                        <p className="text-sm font-medium text-white/90 leading-relaxed italic pr-4">
                          {'summary' in persona ? persona.summary?.comment : 'AI 분석을 진행 중입니다...'}
                        </p>
                        <div className="absolute -bottom-6 -right-1 text-emerald-500/30 text-4xl font-serif transform rotate-180">"</div>
                      </div>

                      {'wealth_analysis' in persona && (
                        <div className="grid grid-cols-1 gap-4 mb-8">
                          <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 rounded-3xl p-6 border border-amber-500/20">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Chicken Index</span>
                              <span className="text-xs font-bold text-white/60">{persona.wealth_analysis?.tier || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-2xl">🍗</div>
                              <div>
                                <div className="text-2xl font-black text-amber-400 mb-1">{persona.wealth_analysis?.chicken_index || '0'}</div>
                                <p className="text-[11px] text-white/40 font-medium leading-normal">{persona.wealth_analysis?.comparison_text || '분석 중'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {'rpg_stats' in persona && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Character Stats</span>
                            <span className="text-[10px] font-bold text-white/20 italic">RPG v1.1</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-10">
                            {[
                              { label: "Gold", value: persona.rpg_stats?.gold || 0, icon: "💰", color: "bg-amber-400" },
                              { label: "Int", value: persona.rpg_stats?.intellect || 0, icon: "🧠", color: "bg-blue-400" },
                              { label: "Moral", value: persona.rpg_stats?.moral || 0, icon: "⚖️", color: "bg-emerald-400" },
                              { label: "Power", value: persona.rpg_stats?.power || 0, icon: "⚡", color: "bg-purple-400" },
                              { label: "Vit", value: persona.rpg_stats?.vitality || 0, icon: "🔋", color: "bg-rose-400" },
                              { label: "Charm", value: persona.rpg_stats?.charm || 0, icon: "✨", color: "bg-pink-400" },
                            ].map((stat, idx) => (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{stat.icon} {stat.label}</span>
                                  <span className="text-[10px] font-black text-white italic">{stat.value}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stat.value}%` }}
                                    transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                                    className={`h-full ${stat.color} rounded-full opacity-80 shadow-[0_0_8px_rgba(255,255,255,0.2)]`}
                                  ></motion.div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Detailed Data Section - Specially for Local or shown contextually */}
                  <div className="mt-6 pt-8 border-t border-white/5 space-y-6">
                    {!isNational ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 text-center">
                            <div className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">재산 신고액</div>
                            <div className="text-sm font-bold text-amber-400">
                              {politician.propertyAmount ? `${Number(politician.propertyAmount).toLocaleString()} 천원` : '정보 없음'}
                            </div>
                          </div>
                          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 text-center">
                            <div className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">입후보 횟수</div>
                            <div className="text-sm font-bold text-purple-400">
                              {politician.candidacyCount || '0'}회
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-8 px-2">
                          {persona.type === 'local' && (
                            <>
                              <div>
                                <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">범죄전력</div>
                                <div className={`text-[11px] font-bold ${persona.risk_factors.criminal_record === '전과 없음' || persona.risk_factors.criminal_record === '클린' ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                                  {persona.risk_factors.criminal_record}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">납세상태</div>
                                <div className={`text-[11px] font-bold ${persona.risk_factors.tax_arrears === '체납 없음' ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                                  {persona.risk_factors.tax_arrears}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/5 text-center">
                          <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">법안 발의</div>
                          <div className="text-sm font-bold text-emerald-400">{politician.billsProposed || 0}건</div>
                        </div>
                        <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/5 text-center">
                          <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">공동 발의</div>
                          <div className="text-sm font-bold text-sky-400">{politician.billsCosponsored || 0}건</div>
                        </div>
                        <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/5 text-center col-span-2">
                          <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">본회의 출석</div>
                          <div className="text-sm font-bold text-amber-400">{politician.attendanceRate || 0}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Statistics & Ratings Summary */}
        {
          ratingsData?.averageRatings && ratingsData.averageRatings.totalRatings > 0 && (() => {
            const avg = ratingsData.averageRatings;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card-strong p-6 rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-xl mb-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-black italic">시민 평가 지표</h2>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{avg.totalRatings}명의 시민 참여</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                      {avg.averageRating.toFixed(1)}
                    </div>
                    <div className="flex gap-0.5 justify-end">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-3 h-3 ${star <= Math.round(avg.averageRating) ? 'fill-amber-400 text-amber-400' : 'fill-white/10 text-white/10'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "소통 능력", value: avg.communicationAvg, icon: Users, color: "text-blue-400" },
                    { label: "정책 실행력", value: avg.policyAvg, icon: FileText, color: "text-emerald-400" },
                    { label: "청렴도", value: avg.integrityAvg, icon: CheckCircle, color: "text-purple-400" },
                    { label: "지역 발전", value: avg.localDevAvg, icon: TrendingUp, color: "text-rose-400" },
                  ].map((item, idx) => (
                    <div key={idx} className="bg-white/[0.03] p-3 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{item.label}</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-lg font-black text-white">{(item.value || 0).toFixed(1)}</span>
                        <div className="flex gap-0.5 mb-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <div key={star} className={`w-1 h-1 rounded-full ${star <= Math.round(item.value || 0) ? item.color.replace('text-', 'bg-') : 'bg-white/10'}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })()
        }

        {/* Actions Cards */}
        <div className="grid gap-4 mb-8">
          {/* Rating Action */}
          <motion.div
            layout
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            className={`glass-card-strong rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden ${showRatingForm ? 'bg-black/40' : 'bg-black/40'}`}
          >
            <AnimatePresence mode="wait">
              {!showRatingForm ? (
                <motion.button
                  key="rating-button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowRatingForm(true)}
                  className="w-full p-5 flex items-center justify-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Star className="w-5 h-5 text-purple-300" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-white">{ratingsData?.userRating ? "평가 수정하기" : "정치인 평가하기"}</span>
                </motion.button>
              ) : (
                <motion.div
                  key="rating-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="p-6"
                >
                  <h3 className="text-lg font-black italic mb-6 text-center">나의 평가</h3>
                  <div className="space-y-6">
                    {[
                      { key: 'communicationRating', label: '소통 능력' },
                      { key: 'policyRating', label: '정책 실행력' },
                      { key: 'integrityRating', label: '청렴도' },
                      { key: 'localDevRating', label: '지역 발전 기여도' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-white/60 uppercase tracking-wider">{item.label}</Label>
                        {renderStars(ratings[item.key as keyof RatingData], (val) => setRatings({ ...ratings, [item.key as keyof RatingData]: val }))}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-8">
                    <Button onClick={() => setShowRatingForm(false)} variant="ghost" className="flex-1 h-12 rounded-xl text-white/40 hover:text-white hover:bg-white/10">취소</Button>
                    <Button onClick={handleRatingSubmit} disabled={submitRatingMutation.isPending} className="flex-1 h-12 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-white shadow-lg shadow-purple-900/20">제출하기</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Comment Action */}
          <motion.div
            layout
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            className={`glass-card-strong rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden ${showCommentForm ? 'bg-black/40' : 'bg-black/40'}`}
          >
            <AnimatePresence mode="wait">
              {!showCommentForm ? (
                <motion.button
                  key="comment-button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowCommentForm(true)}
                  className="w-full p-5 flex items-center justify-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-5 h-5 text-emerald-300" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-white">의견 남기기</span>
                </motion.button>
              ) : (
                <motion.div
                  key="comment-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="p-6"
                >
                  <h3 className="text-lg font-black italic mb-6 text-center">소중한 의견을 남겨주세요</h3>

                  <RadioGroup value={commentType} onValueChange={(v: any) => setCommentType(v)} className="flex bg-black/20 p-1 rounded-xl mb-4">
                    <div className="flex-1">
                      <RadioGroupItem value="support" id="support" className="peer sr-only" />
                      <Label htmlFor="support" className="flex items-center justify-center h-9 rounded-lg cursor-pointer text-[10px] font-bold uppercase tracking-wider text-white/40 peer-data-[state=checked]:bg-emerald-600 peer-data-[state=checked]:text-white transition-all">응원해요</Label>
                    </div>
                    <div className="flex-1">
                      <RadioGroupItem value="suggestion" id="suggestion" className="peer sr-only" />
                      <Label htmlFor="suggestion" className="flex items-center justify-center h-9 rounded-lg cursor-pointer text-[10px] font-bold uppercase tracking-wider text-white/40 peer-data-[state=checked]:bg-amber-600 peer-data-[state=checked]:text-white transition-all">건의사항</Label>
                    </div>
                  </RadioGroup>

                  <Textarea
                    placeholder={commentType === "support" ? "응원의 메시지를 남겨주세요..." : "건의사항을 자유롭게 남겨주세요..."}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={4}
                    className="bg-black/20 border-white/10 rounded-xl resize-none text-sm text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 mb-4"
                  />

                  <div className="flex gap-3">
                    <Button onClick={() => { setShowCommentForm(false); setCommentText(""); }} variant="ghost" className="flex-1 h-12 rounded-xl text-white/40 hover:text-white hover:bg-white/10">취소</Button>
                    <Button onClick={handleCommentSubmit} disabled={submitCommentMutation.isPending} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-lg shadow-emerald-900/20">등록하기</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Comments List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">최근 코멘트</h3>
            <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[10px] font-bold text-white/60">{comments.length}</div>
          </div>

          {comments.length === 0 ? (
            <div className="glass-card-strong p-8 rounded-[24px] border border-white/10 bg-black/40 backdrop-blur-xl text-center">
              <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="text-xs text-white/30 font-medium">첫 번째 코멘트를 남겨보세요.</p>
            </div>
          ) : (
            comments.map((comment: Comment) => (
              <div key={comment.id} className="glass-card-strong p-5 rounded-[24px] border border-white/10 bg-black/40 backdrop-blur-xl">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={comment.isSupport ? "default" : "outline"} className={`h-6 px-2 text-[9px] font-bold uppercase tracking-wider ${comment.isSupport ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                      {comment.isSupport ? "응원" : "건의"}
                    </Badge>
                    <span className="text-[10px] font-medium text-white/30">
                      {format(new Date(comment.createdAt), 'yyyy.MM.dd', { locale: ko })}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-white/80 leading-relaxed mb-4">{comment.content}</p>

                <div className="flex items-center gap-4 pt-3 border-t border-white/5">
                  <button
                    onClick={() => toggleLikeMutation.mutate(comment.id)}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${comment.isLiked ? 'text-pink-500' : 'text-white/40 hover:text-white'}`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-pink-500' : ''}`} />
                    {comment.likeCount}
                  </button>
                  <button
                    onClick={() => reportCommentMutation.mutate(comment.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-white/20 hover:text-red-400 ml-auto transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    신고하기
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main >
    </div >
  );
}