import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { PieChart, BarChart, Users, Calendar, MapPin, Briefcase, GraduationCap, Coins, Heart, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import './statistics.css';

interface DemographicStats {
  byAge: Record<string, number>;
  byGender: Record<string, number>;
  byRegion: Record<string, number>;
  byJob: Record<string, number>;
  byEducation: Record<string, number>;
  byIncome: Record<string, number>;
  byMarital: Record<string, number>;
  totalParticipants: number;
  completedDemographics: number;
}

interface OverallStats {
  totalParticipants: number;
  todayParticipants: number;
  avgCompletionRate: number;
  activeSurveys: number;
}

interface Survey {
  id: number;
  title: string;
  participantCount: number;
}

export default function Statistics() {
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  // 전체 통계 가져오기
  const { data: overallStats } = useQuery<OverallStats>({
    queryKey: ['/api/statistics/overall']
  });

  // 선택된 설문의 인구통계 분석
  const { data: demographicStats } = useQuery<DemographicStats>({
    queryKey: [`/api/surveys/${selectedSurveyId}/demographics`],
    enabled: !!selectedSurveyId
  });

  // 최근 설문 목록
  const { data: recentSurveys } = useQuery<Survey[]>({
    queryKey: ['/api/surveys?limit=10']
  });

  // 차트 색상
  const chartColors = {
    gender: ['#3B82F6', '#EC4899', '#10B981'],
    age: ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B'],
    region: ['#DC2626', '#EA580C', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#6366F1']
  };

  // 백분율 계산 헬퍼
  const getPercentage = (value: number, total: number) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  // 최대값 찾기 헬퍼
  const getMaxValue = (obj: Record<string, number>) => {
    return Math.max(...Object.values(obj), 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50/50 via-white to-rose-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-pink-900/20 pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 pt-[16px] pb-[16px] pl-[24px] pr-[24px] mt-[-9px] mb-[-9px] glass-header"
          >
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => setLocation('/home')}
                className="w-12 h-12 rounded-xl flex items-center justify-center hover:scale-105 transition-all duration-300 border border-pink-200/50 dark:border-pink-400/30 back-button"
                aria-label="뒤로 가기"
              >
                <ArrowLeft className="w-5 h-5 text-pink-600" />
              </button>
              <div className="flex-1">
                <h1 className="font-bold bg-gradient-to-r from-pink-600 via-rose-500 to-pink-700 bg-clip-text text-transparent text-[29px]">
                  <i className="fas fa-chart-bar mr-3"></i>참여 통계
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 text-[14px]">
                  실시간 참여자 분석 및 인구통계학적 데이터
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 전체 통계 카드 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
        >
          <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 hover:scale-105 transition-transform duration-300 stat-card-1"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">총 참여자</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                  {overallStats?.totalParticipants || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center stat-icon-1"
              >
                <Users className="w-6 h-6 text-pink-600" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 hover:scale-105 transition-transform duration-300 stat-card-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">오늘 참여자</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                  {overallStats?.todayParticipants || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center stat-icon-2"
              >
                <Calendar className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 hover:scale-105 transition-transform duration-300 stat-card-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">평균 완료율</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-pink-700 to-rose-700 bg-clip-text text-transparent">
                  {overallStats?.avgCompletionRate || 0}%
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center stat-icon-3"
              >
                <BarChart className="w-6 h-6 text-pink-700" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 hover:scale-105 transition-transform duration-300 stat-card-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">활성 설문</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-pink-800 to-rose-800 bg-clip-text text-transparent">
                  {overallStats?.activeSurveys || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center stat-icon-4"
              >
                <PieChart className="w-6 h-6 text-pink-800" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* 설문 선택 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 mb-8 survey-selection-card"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center survey-selection-icon"
            >
              <i className="fas fa-poll text-white text-lg"></i>
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                설문별 상세 분석
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                분석할 설문을 선택하세요
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentSurveys?.map((survey: any) => (
              <button
                key={survey.id}
                onClick={() => setSelectedSurveyId(survey.id)}
                className={`p-4 rounded-xl border transition-all duration-300 text-left hover:scale-105 ${selectedSurveyId === survey.id
                  ? 'border-pink-300 dark:border-pink-500 shadow-lg survey-button-selected'
                  : 'border-pink-100/50 dark:border-pink-500/20 hover:border-pink-200 dark:hover:border-pink-400 survey-button-default'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className={`font-semibold text-lg mb-1 ${selectedSurveyId === survey.id
                      ? 'bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent'
                      : 'text-gray-800 dark:text-white'
                      }`}>
                      {survey.title}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      참여자 {survey.participantCount || 0}명
                    </p>
                  </div>
                  {selectedSurveyId === survey.id && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center survey-check-icon"
                    >
                      <i className="fas fa-check text-white text-sm"></i>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* 인구통계 분석 */}
        {selectedSurveyId && demographicStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* 성별 분포 */}
            <div className="glass-card p-6 border border-pink-100/30 dark:border-pink-500/20 demographic-card"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center demographic-icon"
                >
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                  성별 분포
                </h3>
              </div>

              <div className="space-y-4">
                {Object.entries(demographicStats.byGender).map(([gender, count], index) => (
                  <div key={gender} className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800 dark:text-white">{gender}</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 bg-pink-50 dark:bg-pink-900/20 px-3 py-1 rounded-full">
                        {count}명 ({getPercentage(count, demographicStats.totalParticipants)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-full h-8 overflow-hidden border border-pink-100/30">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${getPercentage(count, demographicStats.totalParticipants)}%` }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                        className="h-full rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-inner"
                        style={{
                          background: `linear-gradient(135deg, ${chartColors.gender[index]} 0%, ${chartColors.gender[index]}dd 100%)`
                        }}
                      >
                        {getPercentage(count, demographicStats.totalParticipants)}%
                      </motion.div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 연령대 분포 */}
            <Card className="bg-white dark:bg-gray-800 border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  연령대 분포
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(demographicStats.byAge)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([age, count], index) => (
                      <div key={age} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{age}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {count}명 ({getPercentage(count, demographicStats.totalParticipants)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${getPercentage(count, demographicStats.totalParticipants)}%` }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="h-full rounded-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ backgroundColor: chartColors.age[index % chartColors.age.length] }}
                          >
                            {getPercentage(count, demographicStats.totalParticipants)}%
                          </motion.div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* 지역별 분포 */}
            <Card className="bg-white dark:bg-gray-800 border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  지역별 분포
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(demographicStats.byRegion)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([region, count], index) => (
                      <div key={region} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">{region}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {count}명 ({getPercentage(count, demographicStats.totalParticipants)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${getPercentage(count, demographicStats.totalParticipants)}%` }}
                            transition={{ duration: 0.5, delay: index * 0.05 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: chartColors.region[index % chartColors.region.length] }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* 직업별 분포 */}
            {Object.keys(demographicStats.byJob).length > 0 && (
              <Card className="bg-white dark:bg-gray-800 border-0 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    직업별 분포
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(demographicStats.byJob).map(([job, count]) => (
                      <div key={job} className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                        <p className="font-medium text-sm">{job}</p>
                        <p className="text-2xl font-bold text-pink-600">{count}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {getPercentage(count, demographicStats.totalParticipants)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 통계 요약 */}
            <div className="glass-card p-8 border border-pink-200/50 dark:border-pink-400/30 summary-card"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <i className="fas fa-chart-pie text-white text-xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-white">통계 요약</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <i className="fas fa-users text-white text-sm"></i>
                    </div>
                    <p className="text-white/90 font-medium">총 참여자</p>
                  </div>
                  <p className="text-3xl font-bold text-white">{demographicStats.totalParticipants}<span className="text-lg">명</span></p>
                </div>

                <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <i className="fas fa-check-circle text-white text-sm"></i>
                    </div>
                    <p className="text-white/90 font-medium">프로필 완성률</p>
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {getPercentage(demographicStats.completedDemographics, demographicStats.totalParticipants)}<span className="text-lg">%</span>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}