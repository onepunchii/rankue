import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
// import { useAuth } from "@/hooks/useAuth"; // cleanAuth로 대체됨
import { Phone, Shield, Clock, CheckCircle, User, Calendar, MapPin, Briefcase, GraduationCap, DollarSign, Heart, ArrowLeft, Gift } from "lucide-react";

const AGE_GROUPS = ['10대', '20대', '30대', '40대', '50대', '60대+'];
const GENDERS = ['남성', '여성', '기타'];
const REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도'
];
const JOB_CATEGORIES = ['학생', '회사원', '자영업', '공무원', '주부', '무직', '기타'];
const EDUCATION_LEVELS = ['고졸이하', '대학재학', '대졸', '대학원졸', '기타'];
const INCOME_LEVELS = ['100만원미만', '100-200만원', '200-300만원', '300-500만원', '500-700만원', '700만원이상', '비공개'];
const MARITAL_STATUS = ['미혼', '기혼', '기타'];

export default function DemographicSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // const { user, isAuthenticated } = useAuth(); // cleanAuth로 대체됨
  const authId = localStorage.getItem('guestId');

  const [formData, setFormData] = useState({
    ageGroup: '',
    gender: '',
    region: '',
    jobCategory: '',
    educationLevel: '',
    incomeLevel: '',
    maritalStatus: ''
  });

  // SMS 인증 상태 관리
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Simple Auth 시스템: 더 이상 SMS 인증 불필요, 프로필 설정만으로 충분
  const isSimpleAuth = true; // SMS 인증 시스템 제거됨

  // 타이머 효과
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsCodeSent(false);
            setVerificationCode('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timeLeft]);

  // SMS 인증 mutation
  const sendCodeMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { GuestAuthManager } = await import('@/lib/guestAuth');
      const guestId = GuestAuthManager.getCurrentGuestId();

      return await apiRequest('/api/auth/sms/send', {
        method: 'POST',
        body: { phoneNumber: phone, guestId }
      });
    },
    onSuccess: (data: any) => {
      setIsCodeSent(true);
      setTimeLeft(180); // 3분 타이머

      // 데모 모드일 때 인증번호를 토스트에 표시
      if (data.demoCode) {
        toast({
          title: "데모 모드 - 인증번호 발송",
          description: `테스트용 인증번호: ${data.demoCode}`,
          duration: 10000, // 10초간 표시
        });
      } else {
        toast({
          title: "인증번호 발송",
          description: "휴대폰으로 인증번호가 발송되었습니다.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "발송 실패",
        description: error.message || "인증번호 발송 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      const { GuestAuthManager } = await import('@/lib/guestAuth');
      const guestId = GuestAuthManager.getCurrentGuestId();

      return await apiRequest('/api/auth/sms/verify', {
        method: 'POST',
        body: { phoneNumber: phone, verificationCode: code, guestId }
      });
    },
    onSuccess: (data, variables) => {
      // localStorage에 인증 완료 상태 저장
      import('@/lib/guestAuth').then(({ GuestAuthManager }) => {
        GuestAuthManager.markSimpleAuthCompleted(variables.phone);
      });

      setIsVerified(true);
      setTimeLeft(0);
      toast({
        title: "인증 완료",
        description: "휴대폰 인증이 성공적으로 완료되었습니다.",
      });
      // 인증 상태 새로고침
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
    onError: (error: any) => {
      toast({
        title: "인증 실패",
        description: error.message || "인증번호가 올바르지 않습니다.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // useSimpleCleanAuth와 동일한 guestId 사용
      let guestId = localStorage.getItem('guestId');
      if (!guestId) {
        guestId = `guest_${Date.now()}_${btoa(navigator.userAgent.slice(0, 20))}`;
        localStorage.setItem('guestId', guestId);
        localStorage.setItem('onboardingCompleted', 'true');
      }

      const requestData = { ...data, guestId };
      console.log('Demographics 요청 데이터:', requestData);
      console.log('Guest ID:', guestId);

      const response = await apiRequest('/api/user/demographics', {
        method: 'POST',
        body: requestData
      });
      return response;
    },
    onSuccess: (data: any) => {
      // 새로운 cleanAuth 시스템 캐시 무효화
      const guestId = localStorage.getItem('guestId');
      queryClient.invalidateQueries({ queryKey: ['user-state'] });
      if (guestId) {
        queryClient.invalidateQueries({ queryKey: ['user-state', guestId] });
      }

      // 강제 새로고침을 위한 추가 무효화
      setTimeout(() => {
        queryClient.invalidateQueries();
      }, 100);

      if (data?.lotteryTicketsAwarded > 0) {
        toast({
          title: "프로필 설정 완료!",
          description: `인구통계 정보가 등록되었습니다. 로또 티켓 ${data.lotteryTicketsAwarded}장을 받았어요!`,
        });
      } else {
        toast({
          title: "정보 등록 완료",
          description: "인구통계 정보가 성공적으로 등록되었습니다.",
        });
      }

      // 홈으로 리다이렉트 (페이지 새로고침으로 캐시 문제 해결)
      setTimeout(() => {
        window.location.href = '/home';
      }, 1000);
    },
    onError: (error) => {
      toast({
        title: "등록 실패",
        description: "정보 등록 중 오류가 발생했습니다. 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 필수 항목 검증 (나이, 성별, 거주지역)
    if (!formData.ageGroup || !formData.gender || !formData.region) {
      toast({
        title: "필수 정보 누락",
        description: "나이, 성별, 거주지역은 필수 입력사항입니다.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(formData);
  };

  const isFormValid = formData.ageGroup && formData.gender && formData.region;

  // cleanAuth 시스템: 필수 정보만 입력하면 완료 가능 (SMS 인증 불필요)
  const isCompleteFormValid = isFormValid;

  return (
    <div className="min-h-screen bg-pink-50/30 dark:bg-gray-900 transition-colors p-4">
      <div className="max-w-lg mx-auto pt-6">
        <Card className="border border-pink-100/60 dark:border-gray-700/60 shadow-lg bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm overflow-hidden">
          <CardHeader className="text-center pb-4 relative">
            <div className="w-14 h-14 bg-pink-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
              <i className="fas fa-user-cog text-xl text-white"></i>
            </div>
            <CardTitle className="text-lg font-bold text-pink-600 dark:text-pink-400">
              프로필 설정
            </CardTitle>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
              더 정확한 설문조사 분석을 위해 기본 정보를 알려주세요
            </p>
            <div className="bg-pink-600 rounded-full px-3 py-1.5 inline-flex items-center space-x-1.5 mt-3 shadow-md">
              <i className="fas fa-gift text-white text-xs"></i>
              <span className="text-white text-xs font-bold">로또 티켓 5장 지급!</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 필수 항목들 */}
              <div className="space-y-3 p-5 rounded-2xl bg-pink-50/40 dark:bg-pink-900/10 border border-pink-100/60 dark:border-pink-800/30">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-5 h-5 bg-pink-600 rounded-full flex items-center justify-center">
                    <i className="fas fa-star text-white text-xs"></i>
                  </div>
                  <h3 className="font-semibold text-pink-600 dark:text-pink-400 text-sm">
                    필수 정보
                  </h3>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">나이</label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, ageGroup: value }))}>
                    <SelectTrigger className="border-pink-200/60 dark:border-pink-700/50 focus:border-pink-500 focus:ring-pink-500/30 h-11 text-sm bg-white/80 dark:bg-gray-800/80">
                      <SelectValue placeholder="연령대를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_GROUPS.map(age => (
                        <SelectItem key={age} value={age}>{age}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">성별</label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                    <SelectTrigger className="border-pink-200/60 dark:border-pink-700/50 focus:border-pink-500 focus:ring-pink-500/30 h-11 text-sm bg-white/80 dark:bg-gray-800/80">
                      <SelectValue placeholder="성별을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map(gender => (
                        <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">거주 지역</label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, region: value }))}>
                    <SelectTrigger className="border-pink-200/60 dark:border-pink-700/50 focus:border-pink-500 focus:ring-pink-500/30 h-11 text-sm bg-white/80 dark:bg-gray-800/80">
                      <SelectValue placeholder="거주 지역을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map(region => (
                        <SelectItem key={region} value={region}>{region}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 선택 항목들 */}
              <div className="space-y-3 p-5 rounded-2xl bg-gray-50/30 dark:bg-gray-800/30 border border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-5 h-5 bg-gray-500 rounded-full flex items-center justify-center">
                    <i className="fas fa-plus-circle text-white text-xs"></i>
                  </div>
                  <h3 className="font-semibold text-gray-600 dark:text-gray-400 text-sm">
                    추가 정보 (선택사항)
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">직업</label>
                    <Select onValueChange={(value) => setFormData(prev => ({ ...prev, jobCategory: value }))}>
                      <SelectTrigger className="border-gray-300/60 dark:border-gray-600/50 focus:border-gray-500 focus:ring-gray-500/30 h-10 text-sm bg-white/80 dark:bg-gray-700/80">
                        <SelectValue placeholder="직업을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_CATEGORIES.map(job => (
                          <SelectItem key={job} value={job}>{job}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">학력</label>
                    <Select onValueChange={(value) => setFormData(prev => ({ ...prev, educationLevel: value }))}>
                      <SelectTrigger className="border-gray-300/60 dark:border-gray-600/50 focus:border-gray-500 focus:ring-gray-500/30 h-10 text-sm bg-white/80 dark:bg-gray-700/80">
                        <SelectValue placeholder="학력을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {EDUCATION_LEVELS.map(edu => (
                          <SelectItem key={edu} value={edu}>{edu}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">소득 수준</label>
                    <Select onValueChange={(value) => setFormData(prev => ({ ...prev, incomeLevel: value }))}>
                      <SelectTrigger className="border-gray-300/60 dark:border-gray-600/50 focus:border-gray-500 focus:ring-gray-500/30 h-10 text-sm bg-white/80 dark:bg-gray-700/80">
                        <SelectValue placeholder="월 소득을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {INCOME_LEVELS.map(income => (
                          <SelectItem key={income} value={income}>{income}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">결혼 여부</label>
                    <Select onValueChange={(value) => setFormData(prev => ({ ...prev, maritalStatus: value }))}>
                      <SelectTrigger className="border-gray-300/60 dark:border-gray-600/50 focus:border-gray-500 focus:ring-gray-500/30 h-10 text-sm bg-white/80 dark:bg-gray-700/80">
                        <SelectValue placeholder="결혼 여부를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUS.map(status => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>



              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/home')}
                  className="flex-1 border-gray-300/60 hover:bg-gray-50 dark:hover:bg-gray-800 h-11 rounded-xl font-medium text-sm transition-all duration-200"
                >
                  나중에 하기
                </Button>
                <Button
                  type="submit"
                  disabled={!isCompleteFormValid || updateMutation.isPending}
                  className="flex-1 bg-pink-600 text-white hover:bg-pink-700 font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-300 h-11 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      저장 중...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check mr-2"></i>
                      완료
                    </>
                  )}
                </Button>
              </div>
            </form>

            <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4 p-3 glass-card rounded-xl bg-gradient-to-r from-gray-50/50 to-pink-50/30 dark:from-gray-800/50 dark:to-pink-900/5">
              <i className="fas fa-shield-alt mr-1 text-pink-500"></i>
              모든 정보는 익명으로 처리되며, 통계 분석 목적으로만 사용됩니다.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}