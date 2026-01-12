import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  BarChart, Bar, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { 
  KPIRadarChart, GaugeChart, LikertBar, DivergingLikertBar,
  DonutChart, WordCloudChart, VerticalGroupedBar 
} from "@/components/chart-components";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GangnamReportData {
  overview: {
    surveyId: number;
    title: string;
    totalResponses: number;
    createdAt: string;
    category: string;
    residenceStats: {
      gangnam: number;
      other: number;
      noAnswer: number;
    };
  };
  kpis: {
    accessibilityIndex: number;
    transparencyIndex: number;
    environmentIndex: number;
    publicTrustIndex: number;
    choiceExpansionIndex: number;
  };
  questionStats: Array<{
    questionId: number;
    question: string;
    order: number;
    distribution: Array<{ answer: string; count: number }>;
  }>;
  multiSelectStats: Array<{
    questionId: number;
    question: string;
    order: number;
    distribution: Array<{ answer: string; count: number }>;
  }>;
  textInsights: Array<{
    questionId: number;
    question: string;
    order: number;
    responses: Array<{ answer: string; userId: string }>;
  }>;
}

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#0ea5e9', '#06b6d4'];

const CircularKPI = ({ title, score, color }: { title: string; score: number; color: string }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-0 shadow-md transition-all duration-300">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold" style={{ color }}>{score}</div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">100점 만점</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const FeedbackCard = ({ answer, userId, index }: { answer: string; userId: string; index: number }) => {
  const getSentiment = (text: string) => {
    const positiveWords = ['감사', '좋', '만족', '훌륭', '잘', '편리', '쉬', '빠르', '친절'];
    const hasPositive = positiveWords.some(word => text.includes(word));
    return hasPositive ? 'positive' : 'neutral';
  };

  const sentiment = getSentiment(answer);
  
  return (
    <div
      className={`p-4 rounded-lg border ${
        sentiment === 'positive' 
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{answer}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">응답자 ID: {userId}</span>
        {sentiment === 'positive' && (
          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300">
            긍정
          </Badge>
        )}
      </div>
    </div>
  );
};

interface AISummary {
  sentiment: string;
  sentimentScore: number;
  keywords: string[];
  summary: string;
  improvements: string[];
}

export default function GangnamDashboard() {
  const { toast } = useToast();
  const [aiSummaries, setAiSummaries] = useState<{ [key: number]: AISummary | null }>({});
  const [loadingSummary, setLoadingSummary] = useState<{ [key: number]: boolean }>({});
  
  const { data: report, isLoading } = useQuery<GangnamReportData>({
    queryKey: ['/api/admin/gangnam-survey-report'],
  });

  const handleExportPDF = () => {
    window.print();
    toast({
      title: "PDF 생성",
      description: "브라우저 인쇄 기능으로 PDF를 저장할 수 있습니다.",
    });
  };

  const handleExportExcel = async () => {
    if (!report) return;

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // 1. 개요 시트
      const overviewData = [
        ['펫터디 반려동물 장례 서비스 만족도 분석'],
        ['강남구 실증특례 사업 정책 리포트'],
        [],
        ['조사기간', new Date(report.overview.createdAt).toLocaleDateString('ko-KR')],
        ['총 응답자', report.overview.totalResponses],
        ['강남구 거주', report.overview.residenceStats.gangnam],
        ['타지역', report.overview.residenceStats.other],
        ['응답 안 함', report.overview.residenceStats.noAnswer],
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, wsOverview, '개요');

      // 2. KPI 시트
      const kpiData = [
        ['지표명', '점수'],
        ['접근성 개선', report.kpis.accessibilityIndex],
        ['투명성', report.kpis.transparencyIndex],
        ['환경 영향', report.kpis.environmentIndex],
        ['공공 신뢰', report.kpis.publicTrustIndex],
        ['선택권 확대', report.kpis.choiceExpansionIndex],
      ];
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiData);
      XLSX.utils.book_append_sheet(wb, wsKPI, 'KPI');

      // 3. 질문별 응답 시트
      report.questionStats.forEach((stat, idx) => {
        const questionData = [
          [`Q${stat.order}: ${stat.question}`],
          [],
          ['응답', '응답 수'],
          ...stat.distribution.map(d => [d.answer, d.count])
        ];
        const ws = XLSX.utils.aoa_to_sheet(questionData);
        const sheetName = `Q${stat.order}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      XLSX.writeFile(wb, `강남구_펫터디_설문_리포트_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast({
        title: "Excel 다운로드 완료",
        description: "설문 데이터가 Excel 파일로 저장되었습니다.",
      });
    } catch (error) {
      toast({
        title: "오류 발생",
        description: "Excel 파일 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "링크 복사 완료",
        description: "대시보드 링크가 클립보드에 복사되었습니다.",
      });
    } catch (error) {
      toast({
        title: "복사 실패",
        description: "링크를 수동으로 복사해주세요: " + url,
        variant: "destructive",
      });
    }
  };

  const generateAISummary = async (questionId: number, responses: Array<{ answer: string; userId: string }>) => {
    setLoadingSummary(prev => ({ ...prev, [questionId]: true }));
    
    try {
      const result = await apiRequest('/api/admin/gangnam-ai-summary', {
        method: 'POST',
        body: JSON.stringify({ questionId, responses }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      setAiSummaries(prev => ({ ...prev, [questionId]: result.analysis }));
      toast({
        title: "AI 분석 완료",
        description: "응답 분석이 완료되었습니다.",
      });
    } catch (error) {
      toast({
        title: "오류 발생",
        description: "AI 분석 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingSummary(prev => ({ ...prev, [questionId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">리포트 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">리포트 데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const residenceChartData = [
    { name: '강남구', value: report.overview.residenceStats.gangnam, fill: '#2563eb' },
    { name: '타지역', value: report.overview.residenceStats.other, fill: '#60a5fa' },
    { name: '응답 안 함', value: report.overview.residenceStats.noAnswer, fill: '#cbd5e1' },
  ];

  const kpiRadarData = [
    { subject: '접근성 개선', score: report.kpis.accessibilityIndex },
    { subject: '투명성', score: report.kpis.transparencyIndex },
    { subject: '환경 영향', score: report.kpis.environmentIndex },
    { subject: '공공 신뢰', score: report.kpis.publicTrustIndex },
    { subject: '선택권 확대', score: report.kpis.choiceExpansionIndex },
  ];

  const gangnamPercentage = ((report.overview.residenceStats.gangnam / report.overview.totalResponses) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-blue-600 text-white px-6 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                  Polli x 강남구
                </Badge>
                <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                  정책 인사이트 플랫폼
                </Badge>
              </div>
              <h1 className="text-4xl font-bold mb-3">펫터디 반려동물 장례 서비스 만족도 분석</h1>
              <p className="text-blue-100 text-lg">강남구 실증특례 사업 정책 리포트</p>
            </div>
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Seal_of_Gangnam-gu%2C_Seoul.svg/240px-Seal_of_Gangnam-gu%2C_Seoul.svg.png" 
              alt="강남구" 
              className="h-24 w-24 bg-white rounded-full p-3 shadow-md" 
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="text-sm text-blue-100">조사기간</div>
              <div className="font-semibold mt-1">{new Date(report.overview.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="text-sm text-blue-100">총 응답자</div>
              <div className="font-semibold text-2xl mt-1">{report.overview.totalResponses}명</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="text-sm text-blue-100">설문 문항</div>
              <div className="font-semibold text-2xl mt-1">42문항</div>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={handleExportPDF}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
              data-testid="button-export-pdf"
            >
              <i className="fas fa-file-pdf mr-2"></i>
              PDF 리포트
            </Button>
            <Button 
              variant="outline"
              onClick={handleExportExcel}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
              data-testid="button-export-excel"
            >
              <i className="fas fa-file-excel mr-2"></i>
              Excel 데이터
            </Button>
            <Button 
              variant="outline"
              onClick={handleShare}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
              data-testid="button-share"
            >
              <i className="fas fa-share-alt mr-2"></i>
              공유
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            핵심 성과 지표 (KPI)
          </h2>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <KPIRadarChart data={kpiRadarData} />
              <div className="mt-6 grid grid-cols-5 gap-4">
                {kpiRadarData.map((kpi, index) => (
                  <div key={index} className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{kpi.score.toFixed(1)}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{kpi.subject}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>KPI 산출 기준:</strong> 각 항목 관련 질문의 5점 척도 평균을 0-100 점수로 환산 (평균 × 20)
            </p>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            응답자 개요
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base font-medium text-gray-700 dark:text-gray-300">거주지 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={residenceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {residenceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base font-medium text-gray-700 dark:text-gray-300">주요 통계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">{report.overview.totalResponses}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">총 응답자</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">{report.overview.residenceStats.gangnam}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">강남구 거주</div>
                    <div className="text-xs text-blue-500 dark:text-blue-400 mt-1">({gangnamPercentage}%)</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-3xl font-bold text-gray-600">{report.overview.residenceStats.other}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">타지역</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            주요 질문 응답 분포
          </h2>
          <div className="space-y-6">
            {report.questionStats.map((stat, index) => {
              const order = stat.order;
              const calculateAverage = () => {
                const scoreMap: Record<string, number> = {
                  '매우 불만족': 1, '불만족': 2, '보통': 3, '만족': 4, '매우 만족': 5,
                  '매우 어렵다': 1, '어렵다': 2, '쉬웠다': 4, '매우 쉬웠다': 5,
                  '전혀 그렇지 않다': 1, '그렇지 않다': 2, '그렇다': 4, '매우 그렇다': 5,
                };
                let totalScore = 0;
                let totalCount = 0;
                stat.distribution.forEach(d => {
                  const score = scoreMap[d.answer] || 3;
                  totalScore += score * d.count;
                  totalCount += d.count;
                });
                return totalCount > 0 ? totalScore / totalCount : 0;
              };
              
              const renderChart = () => {
                if (order === 1) {
                  return <DivergingLikertBar data={stat.distribution} />;
                } else if (order >= 2 && order <= 3) {
                  return <DonutChart data={stat.distribution} />;
                } else if (order >= 4 && order <= 13) {
                  return <LikertBar data={stat.distribution} showAverage average={calculateAverage()} />;
                } else if ((order >= 14 && order <= 15) || (order >= 37 && order <= 38)) {
                  const score = calculateAverage();
                  return <GaugeChart score={score} maxScore={5} title="5점 만점" />;
                } else if (order >= 16 && order <= 26) {
                  return <VerticalGroupedBar data={stat.distribution} />;
                } else {
                  return <LikertBar data={stat.distribution} />;
                }
              };

              return (
                <motion.div
                  key={stat.questionId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Card className="border-0 shadow-md">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        <span className="text-blue-600 font-semibold mr-2">Q{stat.order}</span>
                        {stat.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {renderChart()}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {report.multiSelectStats.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              복수선택 질문 분석
            </h2>
            <div className="space-y-6">
              {report.multiSelectStats.map((stat, index) => (
                <Card key={stat.questionId} className="border-0 shadow-md">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span className="text-blue-600 font-semibold mr-2">Q{stat.order}</span>
                      {stat.question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VerticalGroupedBar data={stat.distribution} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.section>
        )}

        {Object.keys(aiSummaries).length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              정책 제안 및 인사이트
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-medium text-gray-700 dark:text-gray-300">
                    주요 키워드
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(
                      Object.values(aiSummaries)
                        .filter((summary): summary is AISummary => summary !== null)
                        .flatMap(summary => summary.keywords)
                    )).map((keyword, idx) => (
                      <Badge 
                        key={idx}
                        variant="outline"
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300"
                      >
                        #{keyword}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-medium text-gray-700 dark:text-gray-300">
                    주요 개선사항
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from(new Set(
                      Object.values(aiSummaries)
                        .filter((summary): summary is AISummary => summary !== null)
                        .flatMap(summary => summary.improvements)
                    )).slice(0, 5).map((improvement, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                      >
                        <span className="text-sm text-gray-800 dark:text-gray-200">{improvement}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.section>
        )}

        {report.textInsights.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              자유서술 의견
            </h2>
            <div className="space-y-6">
              {report.textInsights.map((insight) => (
                <Card key={insight.questionId} className="border-0 shadow-md">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        <span className="text-blue-600 font-semibold mr-2">Q{insight.order}</span>
                        {insight.question}
                      </CardTitle>
                      <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300">
                        {insight.responses.length}개
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {!aiSummaries[insight.questionId] && (
                      <div className="mb-6">
                        <Button
                          onClick={() => generateAISummary(insight.questionId, insight.responses)}
                          disabled={loadingSummary[insight.questionId]}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          data-testid={`button-ai-summary-${insight.questionId}`}
                        >
                          {loadingSummary[insight.questionId] ? (
                            <>
                              <i className="fas fa-spinner fa-spin mr-2"></i>
                              AI 분석 중...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-brain mr-2"></i>
                              AI로 응답 요약하기
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    <div className="mb-6">
                      <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-4">
                        주요 키워드 분석
                      </h5>
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <WordCloudChart responses={insight.responses} />
                      </div>
                    </div>

                    {aiSummaries[insight.questionId] && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                            AI 분석 결과
                          </h4>
                          <Badge className={`${
                            aiSummaries[insight.questionId]!.sentiment === '긍정적' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : aiSummaries[insight.questionId]!.sentiment === '부정적'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                          }`}>
                            {aiSummaries[insight.questionId]!.sentiment} ({aiSummaries[insight.questionId]!.sentimentScore}%)
                          </Badge>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">
                              전체 요약
                            </h5>
                            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed bg-white dark:bg-gray-800 p-4 rounded-lg">
                              {aiSummaries[insight.questionId]!.summary}
                            </p>
                          </div>

                          {aiSummaries[insight.questionId]!.improvements.length > 0 && (
                            <div>
                              <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">
                                개선 제안사항
                              </h5>
                              <ul className="space-y-2">
                                {aiSummaries[insight.questionId]!.improvements.map((improvement, idx) => (
                                  <li key={idx} className="text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-3 rounded-lg">
                                    {improvement}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    <div>
                      <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3">
                        최근 응답 ({insight.responses.length}개)
                      </h5>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                        {insight.responses.slice(0, 20).map((response, idx) => (
                          <FeedbackCard 
                            key={idx}
                            answer={response.answer}
                            userId={response.userId}
                            index={idx}
                          />
                        ))}
                      </div>
                      {insight.responses.length > 20 && (
                        <div className="mt-4 text-center">
                          <Button variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50">
                            더 보기 ({insight.responses.length - 20}개 더)
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.section>
        )}

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="pb-10"
        >
          <Card className="border-0 shadow-md bg-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-1">리포트 다운로드 및 공유</h3>
                  <p className="text-blue-100 text-sm">정책 담당자와 함께 인사이트를 공유하세요</p>
                </div>
                <Button 
                  onClick={handleExportExcel}
                  className="bg-white text-blue-600 hover:bg-blue-50"
                  data-testid="button-download-full-report"
                >
                  <i className="fas fa-download mr-2"></i>
                  전체 리포트
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
