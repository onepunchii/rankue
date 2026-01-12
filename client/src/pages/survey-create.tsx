import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/contexts/AuthContext";

interface Question {
  question: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'ranking' | 'matrix' | 'dropdown' | 'multi_text' | 'rating_scale' | 'slider';
  options?: string[];
  matrixRows?: string[];
  matrixColumns?: string[];
  ratingScale?: {
    min: number;
    max: number;
    labels?: string[];
  };
  isRequired?: boolean;
}

const surveySchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요").max(255, "제목이 너무 깁니다"),
  description: z.string().optional(),
  category: z.enum(['fun', 'life', 'deep', 'location']),
  rewardType: z.enum(['experience', 'points', 'prize', 'sponsored']),
  rewardAmount: z.number().min(0).optional(),
  rewardDescription: z.string().optional(),
  sponsorName: z.string().optional(),
  prizePoolTotal: z.number().min(0).optional(),
  winnerCount: z.number().min(1).optional(),
  isAnonymous: z.boolean().default(false),
  votingDurationMinutes: z.number().min(5).default(4320), // 최소 5분, 기본값 3일(4320분)
});

type SurveyFormData = z.infer<typeof surveySchema>;

export default function SurveyCreate() {
  const [, setLocation] = useLocation();
  const [questions, setQuestions] = useState<Question[]>([
    { question: '', type: 'single_choice', options: ['', ''] }
  ]);
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [timeValue, setTimeValue] = useState<number>(3);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<SurveyFormData>({
    resolver: zodResolver(surveySchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'fun',
      rewardType: 'experience',
      rewardAmount: 10,
      isAnonymous: false,
      votingDurationMinutes: 4320, // 3일 = 3 * 24 * 60 = 4320분
      winnerCount: 1,
    },
  });

  const createSurveyMutation = useMutation({
    mutationFn: async (data: { survey: SurveyFormData; questions: Question[] }) => {
      return await apiRequest('/api/simple-auth/surveys', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "설문이 생성되었습니다!",
        description: "새로운 설문에 참여해보세요.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/surveys'] });
      setLocation(`/survey/${data.survey.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "설문 생성 실패",
        description: error.message || "설문 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const addQuestion = () => {
    setQuestions([...questions, {
      question: '',
      type: 'single_choice',
      options: ['', ''],
      isRequired: true
    }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };

    // Initialize default values based on question type
    if (field === 'type') {
      switch (value) {
        case 'rating_scale':
          if (!newQuestions[index].ratingScale) {
            newQuestions[index].ratingScale = { min: 1, max: 5 };
          }
          break;
        case 'single_choice':
        case 'multiple_choice':
        case 'ranking':
          if (!newQuestions[index].options) {
            newQuestions[index].options = ['', ''];
          }
          break;
      }
    }

    setQuestions(newQuestions);
  };

  const addOption = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].options = [...(newQuestions[questionIndex].options || []), ''];
    setQuestions(newQuestions);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].options = newQuestions[questionIndex].options?.filter((_, i) => i !== optionIndex);
    setQuestions(newQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].options) {
      newQuestions[questionIndex].options![optionIndex] = value;
    }
    setQuestions(newQuestions);
  };

  // Matrix question helpers
  const addMatrixRow = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].matrixRows = [...(newQuestions[questionIndex].matrixRows || []), ''];
    setQuestions(newQuestions);
  };

  const addMatrixColumn = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].matrixColumns = [...(newQuestions[questionIndex].matrixColumns || []), ''];
    setQuestions(newQuestions);
  };

  const updateMatrixRow = (questionIndex: number, rowIndex: number, value: string) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].matrixRows) {
      newQuestions[questionIndex].matrixRows![rowIndex] = value;
    }
    setQuestions(newQuestions);
  };

  const updateMatrixColumn = (questionIndex: number, columnIndex: number, value: string) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].matrixColumns) {
      newQuestions[questionIndex].matrixColumns![columnIndex] = value;
    }
    setQuestions(newQuestions);
  };

  const removeMatrixRow = (questionIndex: number, rowIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].matrixRows = newQuestions[questionIndex].matrixRows?.filter((_, i) => i !== rowIndex);
    setQuestions(newQuestions);
  };

  const removeMatrixColumn = (questionIndex: number, columnIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].matrixColumns = newQuestions[questionIndex].matrixColumns?.filter((_, i) => i !== columnIndex);
    setQuestions(newQuestions);
  };

  const updateRatingScale = (questionIndex: number, field: 'min' | 'max', value: number) => {
    const newQuestions = [...questions];
    if (!newQuestions[questionIndex].ratingScale) {
      newQuestions[questionIndex].ratingScale = { min: 1, max: 5 };
    }
    newQuestions[questionIndex].ratingScale![field] = value;
    setQuestions(newQuestions);
  };

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'single_choice': return 'fas fa-list';
      case 'multiple_choice': return 'fas fa-check-square';
      case 'text': return 'fas fa-font';
      case 'ranking': return 'fas fa-sort-amount-down';

      case 'rating_scale': return 'fas fa-star';
      default: return 'fas fa-question';
    }
  };

  const getQuestionTypeName = (type: string) => {
    switch (type) {
      case 'single_choice': return '객관식 (단일선택)';
      case 'multiple_choice': return '객관식 (다중선택)';
      case 'text': return '주관식';
      case 'ranking': return '순위매기기';

      case 'rating_scale': return '평점척도';
      default: return '기본';
    }
  };

  const onSubmit = (data: SurveyFormData) => {
    // 게스트 사용자 체크
    if (!user || user.isGuest) {
      toast({
        title: "회원가입이 필요합니다",
        description: "설문 생성은 회원만 사용할 수 있습니다. 회원가입하고 다양한 설문을 만들어보세요!",
        variant: "destructive",
      });
      return;
    }

    const validQuestions = questions.filter(q => {
      if (!q.question.trim()) return false;

      switch (q.type) {
        case 'text':
          return true;
        case 'rating_scale':
          return q.ratingScale && q.ratingScale.min < q.ratingScale.max;
        case 'single_choice':
        case 'multiple_choice':
        case 'dropdown':
        case 'ranking':
        default:
          return q.options && q.options.filter(opt => opt.trim()).length >= 2;
      }
    });

    if (validQuestions.length === 0) {
      toast({
        title: "유효한 질문을 추가해주세요",
        description: "질문 내용과 필수 설정을 완료해주세요.",
        variant: "destructive",
      });
      return;
    }

    createSurveyMutation.mutate({ survey: data, questions: validQuestions });
  };

  const watchedRewardType = form.watch('rewardType');

  const createSurveyStructuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "설문 생성하기",
    "description": "폴리에서 나만의 설문조사를 생성하고 공유하세요",
    "author": {
      "@type": "Organization",
      "name": "Polli"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Polli",
      "url": "https://polli.replit.app"
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SEOHead
        title="설문 생성하기 - Polli | 나만의 설문조사 만들기"
        description="폴리에서 나만의 설문조사를 무료로 생성하세요. 다양한 질문 유형과 리워드 설정으로 참여자들의 관심을 끌어보세요. 재미, 생활, 심층, 지역 카테고리 중 선택하여 설문을 만들 수 있습니다."
        keywords="설문 생성, 설문 만들기, 투표 만들기, 설문조사 도구, 온라인 설문, 무료 설문"
        structuredData={createSurveyStructuredData}
      />
      <MobileHeader />

      <main className="max-w-md mx-auto p-4 pb-20">
        {/* Header Section */}
        <div className="glass-card-strong p-6 mb-6" style={{ background: 'linear-gradient(135deg, rgba(245, 73, 144, 0.1) 0%, rgba(245, 103, 164, 0.1) 100%)' }}>
          <div className="flex items-center space-x-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, rgba(245, 73, 144, 1) 0%, rgba(245, 103, 164, 1) 100%)' }}
            >
              <i className="fas fa-plus-circle text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">새 설문 만들기</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">나만의 설문을 만들어보세요</p>
            </div>
          </div>
        </div>

        <Card className="glass-card">
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(245, 73, 144, 1) 0%, rgba(245, 103, 164, 1) 100%)' }}
                    >
                      <i className="fas fa-info text-white text-xs"></i>
                    </div>
                    <h3 className="font-semibold text-gray-800 dark:text-white">기본 정보</h3>
                  </div>
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>설문 제목</FormLabel>
                        <FormControl>
                          <Input placeholder="설문 제목을 입력해주세요" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>설문 설명 (선택)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="설문에 대한 설명을 입력해주세요" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>카테고리</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="카테고리를 선택해주세요" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fun">Fun Poll (재미있는 투표)</SelectItem>
                            <SelectItem value="life">Life Poll (생활 투표)</SelectItem>
                            <SelectItem value="deep">Deep Poll (심층 투표)</SelectItem>
                            <SelectItem value="location">내 지역 (지역 설문)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Reward System */}
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(245, 103, 164, 1) 0%, rgba(245, 123, 144, 1) 100%)' }}
                    >
                      <i className="fas fa-gift text-white text-xs"></i>
                    </div>
                    <h3 className="font-semibold text-lg text-gray-800 dark:text-white">보상 설정</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="rewardType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>보상 방식</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue="experience">
                          <FormControl>
                            <SelectTrigger className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="experience">경험치 지급 (기본)</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-gray-500 mt-1">
                          일반 사용자는 경험치 지급만 가능합니다
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rewardAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>경험치 지급량</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              value={10}
                              disabled
                              className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 pr-24"
                            />
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-medium">
                              고정값
                            </div>
                          </div>
                        </FormControl>
                        <div className="text-xs text-gray-500 mt-1">
                          <i className="fas fa-info-circle mr-1"></i>
                          모든 일반 사용자 설문은 참여자에게 10 경험치를 지급합니다
                        </div>
                      </FormItem>
                    )}
                  />


                </div>

                {/* Survey Settings */}
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(245, 123, 144, 1) 0%, rgba(245, 143, 164, 1) 100%)' }}
                    >
                      <i className="fas fa-cogs text-white text-xs"></i>
                    </div>
                    <h3 className="font-semibold text-lg text-gray-800 dark:text-white">설문 설정</h3>
                  </div>

                  <div className="space-y-3">
                    <FormLabel>투표 기간 설정</FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400">기간</label>
                        <Input
                          type="number"
                          min={timeUnit === 'minutes' ? 5 : timeUnit === 'hours' ? 1 : 1}
                          max={timeUnit === 'minutes' ? 43200 : timeUnit === 'hours' ? 720 : 30} // 최대 30일
                          value={timeValue}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 1;
                            setTimeValue(value);
                            // 분 단위로 변환하여 form에 저장
                            let minutes = value;
                            if (timeUnit === 'hours') {
                              minutes = value * 60;
                            } else if (timeUnit === 'days') {
                              minutes = value * 24 * 60;
                            }
                            form.setValue('votingDurationMinutes', minutes);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400">단위</label>
                        <Select
                          value={timeUnit}
                          onValueChange={(value: 'minutes' | 'hours' | 'days') => {
                            setTimeUnit(value);
                            // 현재 값을 새로운 단위에 맞게 조정
                            let newValue = timeValue;
                            if (value === 'minutes' && timeValue < 5) {
                              newValue = 5;
                            } else if (value === 'hours' && timeValue < 1) {
                              newValue = 1;
                            } else if (value === 'days' && timeValue < 1) {
                              newValue = 1;
                            }
                            setTimeValue(newValue);

                            // 분 단위로 변환
                            let minutes = newValue;
                            if (value === 'hours') {
                              minutes = newValue * 60;
                            } else if (value === 'days') {
                              minutes = newValue * 24 * 60;
                            }
                            form.setValue('votingDurationMinutes', minutes);
                          }}
                        >
                          <SelectTrigger className="glass-card">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="glass-card">
                            <SelectItem value="minutes">분</SelectItem>
                            <SelectItem value="hours">시간</SelectItem>
                            <SelectItem value="days">일</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center space-x-1">
                      <i className="fas fa-info-circle"></i>
                      <span>
                        최소 5분부터 설정 가능합니다
                        {timeUnit === 'minutes' && ` (현재: ${timeValue}분)`}
                        {timeUnit === 'hours' && ` (현재: ${timeValue}시간 = ${timeValue * 60}분)`}
                        {timeUnit === 'days' && ` (현재: ${timeValue}일 = ${timeValue * 24}시간)`}
                      </span>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="isAnonymous"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>익명 설문</FormLabel>
                          <div className="text-sm text-gray-500">
                            응답자의 신원을 숨깁니다
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Questions */}
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(245, 143, 164, 1) 0%, rgba(245, 73, 144, 1) 100%)' }}
                      >
                        <i className="fas fa-question text-white text-xs"></i>
                      </div>
                      <h3 className="font-semibold text-lg text-gray-800 dark:text-white">질문</h3>
                    </div>
                    <Button
                      type="button"
                      onClick={addQuestion}
                      size="sm"
                      className="glass-card bg-[#ff3d85]"
                    >
                      <i className="fas fa-plus mr-2"></i>질문 추가
                    </Button>
                  </div>

                  {questions.map((question, qIndex) => (
                    <div
                      key={qIndex}
                      className="glass-card p-4 space-y-3"
                      style={{
                        borderLeft: `4px solid rgba(245, ${73 + (qIndex * 20)}, 144, 1)`,
                        background: `linear-gradient(135deg, rgba(245, ${73 + (qIndex * 20)}, 144, 0.05) 0%, rgba(245, ${103 + (qIndex * 20)}, 164, 0.05) 100%)`
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                            style={{ background: `linear-gradient(135deg, rgba(245, ${73 + (qIndex * 20)}, 144, 1) 0%, rgba(245, ${103 + (qIndex * 20)}, 164, 1) 100%)` }}
                          >
                            {qIndex + 1}
                          </div>
                          <span className="font-medium text-gray-800 dark:text-white">질문 {qIndex + 1}</span>
                        </div>
                        {questions.length > 1 && (
                          <Button
                            type="button"
                            onClick={() => removeQuestion(qIndex)}
                            size="sm"
                            variant="outline"
                            className="glass-card"
                          >
                            <i className="fas fa-trash text-red-500"></i>
                          </Button>
                        )}
                      </div>

                      <Input
                        placeholder="질문을 입력해주세요"
                        value={question.question}
                        onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                      />

                      <Select
                        value={question.type}
                        onValueChange={(value) => updateQuestion(qIndex, 'type', value)}
                      >
                        <SelectTrigger className="glass-card">
                          <div className="flex items-center space-x-2">
                            <i className={`${getQuestionTypeIcon(question.type)} text-pink-500`}></i>
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="glass-card">
                          {/* 기본 선택형 */}
                          <SelectItem value="single_choice">
                            <div className="flex items-center space-x-3">
                              <i className="fas fa-dot-circle text-blue-500"></i>
                              <div>
                                <div className="font-medium">객관식</div>
                                <div className="text-xs text-gray-500">하나만 선택</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="multiple_choice">
                            <div className="flex items-center space-x-3">
                              <i className="fas fa-check-square text-green-500"></i>
                              <div>
                                <div className="font-medium">다중선택</div>
                                <div className="text-xs text-gray-500">여러개 선택 가능</div>
                              </div>
                            </div>
                          </SelectItem>


                          {/* 평가형 */}
                          <SelectItem value="rating_scale">
                            <div className="flex items-center space-x-3">
                              <i className="fas fa-star text-yellow-500"></i>
                              <div>
                                <div className="font-medium">평점척도</div>
                                <div className="text-xs text-gray-500">1-5점, 1-10점 등</div>
                              </div>
                            </div>
                          </SelectItem>

                          {/* 고급형 */}
                          <SelectItem value="ranking">
                            <div className="flex items-center space-x-3">
                              <i className="fas fa-sort-amount-down text-red-500"></i>
                              <div>
                                <div className="font-medium">순위매기기</div>
                                <div className="text-xs text-gray-500">항목들의 순서 정하기</div>
                              </div>
                            </div>
                          </SelectItem>

                          {/* 텍스트 입력형 */}
                          <SelectItem value="text">
                            <div className="flex items-center space-x-3">
                              <i className="fas fa-font text-gray-500"></i>
                              <div>
                                <div className="font-medium">주관식</div>
                                <div className="text-xs text-gray-500">자유 텍스트 입력</div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* 기본 객관식/선택배열/순위매기기 질문 */}
                      {['single_choice', 'multiple_choice', 'ranking'].includes(question.type) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">선택지</span>
                            <Button
                              type="button"
                              onClick={() => addOption(qIndex)}
                              size="sm"
                              variant="outline"
                              className="glass-card"
                              style={{ color: 'rgba(245, 103, 164, 1)' }}
                            >
                              <i className="fas fa-plus mr-1"></i>추가
                            </Button>
                          </div>
                          {question.options?.map((option, oIndex) => (
                            <div key={oIndex} className="flex items-center space-x-2">
                              <Input
                                placeholder={`${question.type === 'ranking' ? '순위 항목' : '선택지'} ${oIndex + 1}`}
                                value={option}
                                onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                              />
                              {question.options!.length > 2 && (
                                <Button
                                  type="button"
                                  onClick={() => removeOption(qIndex, oIndex)}
                                  size="sm"
                                  variant="outline"
                                  className="glass-card"
                                >
                                  <i className="fas fa-minus text-red-500"></i>
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 평점척도 설정 */}
                      {question.type === 'rating_scale' && (
                        <div className="space-y-3">
                          <span className="text-sm font-medium">평점 범위 설정</span>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">최소값</label>
                              <Input
                                type="number"
                                min="1"
                                max="10"
                                value={question.ratingScale?.min || 1}
                                onChange={(e) => updateRatingScale(qIndex, 'min', parseInt(e.target.value) || 1)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">최대값</label>
                              <Input
                                type="number"
                                min="2"
                                max="10"
                                value={question.ratingScale?.max || 5}
                                onChange={(e) => updateRatingScale(qIndex, 'max', parseInt(e.target.value) || 5)}
                              />
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 flex items-center space-x-1">
                            <i className="fas fa-info-circle"></i>
                            <span>1-10 범위에서 설정 가능합니다</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="submit"
                  className="w-full glass-card-strong text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, rgba(245, 73, 144, 1) 0%, rgba(245, 103, 164, 1) 100%)' }}
                  disabled={createSurveyMutation.isPending}
                >
                  {createSurveyMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      설문 생성 중...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check mr-2"></i>
                      설문 생성하기
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
}