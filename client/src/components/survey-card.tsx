import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Survey } from "@shared/schema";

interface SurveyCardProps {
  survey: Survey;
  isParticipated?: boolean;
}

export default function SurveyCard({ survey, isParticipated = false }: SurveyCardProps) {
  const [, setLocation] = useLocation();
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'fun':
        return {
          name: '🎉 재미',
          gradient: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        };
      case 'life':
        return {
          name: '🏠 생활',
          gradient: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        };
      case 'deep':
        return {
          name: '🔍 심층',
          gradient: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        };
      case 'location':
        return {
          name: '📍 내 지역',
          gradient: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
        };
      case 'policy':
        return {
          name: '🏛️ 정책',
          gradient: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        };
      case 'politics':
        return {
          name: '🗳️ 정치',
          gradient: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        };
      default:
        return {
          name: '📋 설문',
          gradient: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        };
    }
  };

  const categoryInfo = getCategoryInfo(survey.category);

  // 남은시간 계산 함수
  const calculateTimeRemaining = (endDate: Date | null) => {
    if (!endDate) return "마감";
    const now = new Date().getTime();
    const end = new Date(endDate).getTime();
    const diff = end - now;

    if (diff <= 0) return "마감";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    if (minutes > 0) return `${minutes}분 남음`;
    return "1분 미만";
  };

  // 남은시간 업데이트
  useEffect(() => {
    if (survey?.votingEndDate) {
      const updateTime = () => {
        setTimeRemaining(calculateTimeRemaining(survey.votingEndDate));
      };
      updateTime();
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    }
  }, [survey?.votingEndDate]);

  return (
    <div className="relative group">
      <button
        onClick={isParticipated ? undefined : () => setLocation(`/survey/${survey.id}`)}
        className={`w-full glass-card p-6 transition-all duration-500 text-left border relative overflow-hidden rounded-[24px]
          ${isParticipated
            ? 'cursor-default'
            : 'hover:bg-white/10 hover:border-white/20 hover:translate-y-[-4px] active:scale-[0.98] cursor-pointer shadow-lg shadow-black/20'
          }
        `}
      >
        <div className="flex flex-col gap-5">
          {/* Top category & Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest border transition-colors ${categoryInfo.gradient}`}>
                {categoryInfo.name}
              </span>
              {survey.isAnonymous && (
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/10">
                  <i className="fas fa-lock mr-1"></i>ANONYMOUS
                </span>
              )}
            </div>
            {!isParticipated && (
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-purple-600 group-hover:border-purple-500 transition-all duration-300">
                <i className="fas fa-chevron-right text-xs text-white/20 group-hover:text-white"></i>
              </div>
            )}
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5 flex-1">
            <h4 className="font-black text-xl text-white tracking-tighter line-clamp-2 leading-tight group-hover:text-purple-400 transition-colors">
              {survey.title}
            </h4>
            <p className="text-sm text-white/40 font-medium line-clamp-1">
              {survey.description || '지금 바로 설문에 참여해보세요!'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/60">
              <i className="fas fa-users text-purple-400"></i>
              <span>{survey.participantCount || 0}명 참여</span>
            </div>

            {survey.votingEndDate && timeRemaining !== "마감" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/60">
                <i className="fas fa-clock text-blue-400"></i>
                <span>{timeRemaining}</span>
              </div>
            )}

            {survey.rewardType && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-black text-purple-400">
                <i className="fas fa-gift"></i>
                <span>
                  {survey.rewardType === 'experience' && `+${survey.experienceReward || 10} EXP`}
                  {survey.rewardType === 'points' && `+${survey.rewardAmount || 0}P`}
                  {survey.rewardType === 'prize' && '상품 지급'}
                  {survey.rewardType === 'sponsored' && '후원 설문'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Glow Effect */}
        <div className="absolute -right-4 -top-4 w-32 h-32 bg-purple-600/5 rounded-full blur-3xl group-hover:bg-purple-600/10 transition-all duration-700 -z-10" />
      </button>

      {isParticipated && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-[2px] rounded-[24px] pointer-events-none">
          <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-purple-600/10 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <i className="fas fa-check text-purple-400"></i>
            <span className="text-sm font-black italic text-purple-400 uppercase tracking-tight">참여 완료</span>
          </div>
        </div>
      )}
    </div>
  );
}