import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import SurveyCard from "@/components/survey-card";
import { Survey } from "@shared/schema";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useEffect, useState } from "react";
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";
import {
  Laugh,
  Home,
  ShieldAlert,
  MapPin,
  Landmark,
  BarChart2,
  Lightbulb,
  ArrowLeft,
  Inbox
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Category() {
  const { category } = useParams();
  const [, setLocation] = useLocation();
  const { getCurrentPosition } = useGeolocation();
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // 위치 정보 가져오기 (location 카테고리일 때만)
  useEffect(() => {
    if (category === 'location') {
      getCurrentPosition().then(location => {
        if (location) {
          setUserLocation({
            latitude: location.latitude,
            longitude: location.longitude
          });
        }
      }).catch(error => {
        console.error('위치 정보 가져오기 실패:', error);
        // 테스트용으로 설문과 같은 위치 설정 (거리 0km)
        setUserLocation({
          latitude: 37.5665,
          longitude: 126.9780
        });
      });
    }
  }, [category, getCurrentPosition]);

  // 위치 기반 설문 조회 (location 카테고리일 때)
  const { data: nearbyLocationSurveys = [], isLoading: isLoadingNearby } = useQuery<Survey[]>({
    queryKey: ["/api/surveys/nearby", userLocation?.latitude, userLocation?.longitude],
    enabled: category === 'location' && !!userLocation,
    queryFn: async () => {
      if (!userLocation) return [];
      const url = `/api/surveys/nearby?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&radius=10`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch nearby surveys');
      return response.json();
    }
  });

  // 일반 설문 조회 (location 카테고리가 아닐 때)
  const { data: regularSurveys = [], isLoading: isLoadingRegular } = useQuery<Survey[]>({
    queryKey: ["/api/surveys", "category", category],
    enabled: category !== 'location',
    queryFn: async () => {
      const response = await fetch(`/api/surveys?category=${category}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch surveys');
      return response.json();
    }
  });

  // 사용자 참여 정보 조회
  const { data: userParticipations = [] } = useQuery<any[]>({
    queryKey: ["/api/user/participations"],
  });

  // 사용할 설문 데이터와 로딩 상태 결정
  const surveys = category === 'location' ? nearbyLocationSurveys : regularSurveys;
  const isLoading = category === 'location' ?
    (isLoadingNearby || !userLocation) :
    isLoadingRegular;

  const getCategoryInfo = (cat: string) => {
    switch (cat) {
      case 'fun':
        return {
          title: 'Fun Poll',
          description: '재미있는 설문조사',
          icon: Laugh,
          accentColor: 'text-yellow-400',
          bgColor: 'bg-yellow-500',
          borderColor: 'border-yellow-500/50',
          gradient: 'from-yellow-400 to-orange-400',
          reward: '50P',
          lightPillarTop: '#FACC15', // yellow-400
          lightPillarBottom: '#FB923C' // orange-400
        };
      case 'life':
        return {
          title: 'Life Poll',
          description: '일상 생활 설문',
          icon: Home,
          accentColor: 'text-green-400',
          bgColor: 'bg-green-500',
          borderColor: 'border-green-500/50',
          gradient: 'from-green-400 to-emerald-400',
          reward: '30P',
          lightPillarTop: '#4ADE80', // green-400
          lightPillarBottom: '#34D399' // emerald-400
        };
      case 'deep':
        return {
          title: 'Deep Poll',
          description: '민감한 이슈 (익명)',
          icon: ShieldAlert,
          accentColor: 'text-pink-400',
          bgColor: 'bg-pink-500',
          borderColor: 'border-pink-500/50',
          gradient: 'from-pink-400 to-rose-400',
          reward: '100P',
          lightPillarTop: '#F472B6', // pink-400
          lightPillarBottom: '#FB7185' // rose-400
        };
      case 'location':
        return {
          title: '내 지역',
          description: '우리 동네 설문조사',
          icon: MapPin,
          accentColor: 'text-blue-400',
          bgColor: 'bg-blue-500',
          borderColor: 'border-blue-500/50',
          gradient: 'from-blue-400 to-indigo-400',
          reward: '70P',
          lightPillarTop: '#60A5FA', // blue-400
          lightPillarBottom: '#818CF8' // indigo-400
        };
      case 'policy':
        return {
          title: '국가 정책조사',
          description: '국정조사 여론안 설문',
          icon: Landmark,
          accentColor: 'text-emerald-400',
          bgColor: 'bg-emerald-500',
          borderColor: 'border-emerald-500/50',
          gradient: 'from-emerald-400 to-teal-400',
          reward: '50P',
          lightPillarTop: '#34D399', // emerald-400
          lightPillarBottom: '#2DD4BF' // teal-400
        };
      default:
        return {
          title: '설문',
          description: '설문조사',
          icon: BarChart2,
          accentColor: 'text-gray-400',
          bgColor: 'bg-gray-500',
          borderColor: 'border-gray-500/50',
          gradient: 'from-gray-400 to-gray-500',
          reward: '50P',
          lightPillarTop: '#9CA3AF',
          lightPillarBottom: '#6B7280'
        };
    }
  };

  const categoryInfo = getCategoryInfo(category || '');
  const Icon = categoryInfo.icon;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <LightPillar topColor={categoryInfo.lightPillarTop} bottomColor={categoryInfo.lightPillarBottom} intensity={1.5} rotationSpeed={0.5} />
        <div className={`w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mb-4 relative z-10 ${categoryInfo.borderColor.replace('/50', '')} border-white/20`}></div>
        <p className="text-xs text-white/30 relative z-10">설문 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/20">
      {/* Background */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor={categoryInfo.lightPillarTop}
          bottomColor={categoryInfo.lightPillarBottom}
          intensity={0.6}
          rotationSpeed={0.4}
        />
      </div>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setLocation('/home')}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className={`text-lg font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-r ${categoryInfo.gradient}`}>
            {categoryInfo.title.toUpperCase()}
          </span>
          <div className="w-10" />
        </div>
      </div>

      <main className="relative z-10 max-w-md mx-auto px-6 pt-20 pb-32">
        {/* Category Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className={`glass-card-strong p-6 rounded-[32px] border ${categoryInfo.borderColor} relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-32 h-32 ${categoryInfo.bgColor} opacity-10 rounded-full blur-3xl transform translate-x-8 -translate-y-8`}></div>

            <div className="relative z-10 flex items-center gap-5">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} p-[1px] shadow-lg`}>
                <div className="w-full h-full rounded-2xl bg-black/40 backdrop-blur-md flex items-center justify-center">
                  <Icon className={`w-8 h-8 text-white`} />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white mb-1">{categoryInfo.title}</h1>
                <p className="text-sm text-white/50 font-medium">{categoryInfo.description}</p>
              </div>
            </div>

            <div className="relative z-10 flex gap-3 mt-6">
              <div className="flex-1 bg-black/40 rounded-xl p-3 border border-white/5 flex flex-col items-center">
                <span className="text-xs text-white/40 mb-1">활성 설문</span>
                <span className={`text-lg font-bold ${categoryInfo.accentColor}`}>{surveys.length}</span>
              </div>
              <div className="flex-1 bg-black/40 rounded-xl p-3 border border-white/5 flex flex-col items-center">
                <span className="text-xs text-white/40 mb-1">평균 보상</span>
                <span className={`text-lg font-bold ${categoryInfo.accentColor}`}>{categoryInfo.reward}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Survey List */}
        <div className="mb-6 flex items-center justify-between px-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            설문 목록 <span className={`text-xs px-2 py-0.5 rounded-full bg-white/10 ${categoryInfo.accentColor}`}>{surveys.length}</span>
          </h2>
        </div>

        <div className="space-y-4">
          <AnimatePresence>
            {surveys.length > 0 ? (
              surveys.map((survey, index) => {
                const isParticipated = userParticipations.some((p: any) => (p.surveyId === survey.id || p.survey_id === survey.id));
                return (
                  <motion.div
                    key={survey.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <SurveyCard survey={survey} isParticipated={isParticipated} />
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card-light rounded-[24px] p-10 text-center border border-white/5"
              >
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 bg-white/5 flex items-center justify-center ${categoryInfo.accentColor}`}>
                  <Inbox className="w-8 h-8 opacity-50" />
                </div>
                <h3 className={`text-lg font-bold ${categoryInfo.accentColor} mb-2`}>
                  {category === 'location' ? '주변에 설문이 없습니다' : '설문이 준비 중입니다'}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed max-w-[250px] mx-auto">
                  {category === 'location' ?
                    '내 주변 10km 이내에는 아직 지역 설문이 없습니다.' :
                    '곧 새로운 설문이 추가될 예정입니다. 잠시만 기다려주세요!'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tips Section */}
        <div className="mt-8">
          <div className={`glass-card p-5 rounded-[24px] border border-white/5 relative overflow-hidden`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ${categoryInfo.accentColor}`}>
                <Lightbulb className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">참여 팁</h3>
            </div>

            <div className="space-y-2 text-xs text-white/50 leading-relaxed font-medium pl-1">
              {category === 'fun' && (
                <>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-yellow-500" /> 가벼운 마음으로 즐길 수 있는 주제들입니다.</p>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-yellow-500" /> 정답은 없습니다. 솔직하게 답변해주세요.</p>
                </>
              )}
              {category === 'life' && (
                <>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-green-500" /> 일상 생활과 밀접한 설문들입니다.</p>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-green-500" /> 여러분의 라이프스타일을 공유해주세요.</p>
                </>
              )}
              {category === 'deep' && (
                <>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500" /> 100% 익명성이 보장되는 공간입니다.</p>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500" /> 민감한 주제에 대해 솔직한 의견을 남겨주세요.</p>
                </>
              )}
              {category === 'location' && (
                <>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-500" /> GPS 기준 반경 10km 내 설문만 표시됩니다.</p>
                  <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-500" /> 우리 동네 이웃들의 생각을 들어보세요.</p>
                  {!userLocation && (
                    <div className="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <p className="text-blue-400 font-bold flex items-center gap-2">
                        <MapPin className="w-3 h-3" /> 위치 확인 중...
                      </p>
                    </div>
                  )}
                </>
              )}
              {!['fun', 'life', 'deep', 'location'].includes(category || '') && (
                <p>다양한 설문에 참여하고 의견을 공유하세요.</p>
              )}
            </div>
          </div>
        </div>

      </main>

      <BottomNav />
    </div>
  );
}
