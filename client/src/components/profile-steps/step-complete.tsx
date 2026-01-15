import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Gift, Sparkles, Trophy, ArrowRight, CheckCircle } from 'lucide-react';

interface StepCompleteProps {
  onNext: (data: any) => void;
  formData: any;
}

export default function StepComplete({ onNext, formData }: StepCompleteProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const currentAuthId = localStorage.getItem('guestId');
      console.log('API request - authId:', currentAuthId);
      console.log('API request - data:', data);

      return apiRequest('/api/user/demographics', {
        method: 'POST',
        headers: { 'X-Auth-ID': currentAuthId || '' },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      // 전체 캐시 완전 클리어 (가장 확실한 방법)
      queryClient.clear();

      // localStorage에 완료 플래그 설정
      localStorage.setItem('profileJustCompleted', 'true');

      setIsCompleted(true);
      toast({
        title: "🎉 프로필 설정 완료!",
        description: "새로운 닉네임과 5장의 로또 티켓을 받으셨습니다. 이제 모든 기능을 이용하실 수 있어요!",
      });

      // 프로필 페이지로 리디렉션
      setTimeout(() => {
        setLocation('/home');
      }, 1500);
    },
    onError: (error: any) => {
      console.error('Profile update error:', error);
      toast({
        title: "오류 발생",
        description: "프로필 설정 중 오류가 발생했습니다. 다시 시도해주세요.",
        variant: "destructive"
      });
    }
  });

  const handleComplete = async () => {
    // localStorage에서 guestId 확인
    let currentAuthId = localStorage.getItem('guestId');

    // guestId가 없으면 새로 생성
    if (!currentAuthId) {
      const userAgent = navigator.userAgent;
      const timestamp = Date.now();
      const userAgentBase64 = btoa(userAgent).slice(0, 20);
      currentAuthId = `guest_${timestamp}_${userAgentBase64}`;
      localStorage.setItem('guestId', currentAuthId);
      console.log('새 guestId 생성:', currentAuthId);
    }

    console.log('Profile setup - authId:', currentAuthId);

    setIsCompleting(true);

    const profileData = {
      age_group: formData.ageGroup,
      gender: formData.gender,
      region: formData.region,
      job_category: formData.jobCategory || null,
      education_level: formData.educationLevel || null,
      income_level: formData.incomeLevel || null,
      marital_status: formData.maritalStatus || null
    };

    console.log('Profile setup - authId:', currentAuthId);
    console.log('Profile setup - data:', profileData);

    updateProfileMutation.mutate(profileData);
  };

  const handleGoHome = () => {
    setLocation('/home');
  };

  useEffect(() => {
    // 자동으로 프로필 업데이트 실행
    if (!isCompleting && !isCompleted) {
      handleComplete();
    }
  }, []);

  return (
    <div className="w-full space-y-8 pb-10">
      {!isCompleted ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
          <div className="relative">
            <motion.div
              className="w-24 h-24 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center backdrop-blur-xl"
              animate={{
                rotate: 360,
                scale: [1, 1.1, 1]
              }}
              transition={{
                rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
              }}
            >
              <Sparkles className="w-12 h-12 text-purple-400" />
            </motion.div>
            <motion.div
              className="absolute inset-0 bg-purple-500/20 rounded-3xl blur-2xl -z-10"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-white mb-2">프로필 설정 완료 중...</h2>
            <p className="text-white/40 text-sm">잠시만 기다려주세요, 선물을 준비하고 있어요!</p>
          </div>
        </div>
      ) : (
        <>
          {/* Success Banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative p-10 rounded-[2.5rem] bg-purple-600/10 border border-white/10 flex flex-col items-center text-center overflow-hidden backdrop-blur-xl shadow-2xl"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 200 }}
              className="w-24 h-24 rounded-3xl bg-purple-600 flex items-center justify-center shadow-[0_0_40px_rgba(147,51,234,0.3)] mb-6"
            >
              <CheckCircle className="w-12 h-12 text-white" />
            </motion.div>

            <h2 className="text-3xl font-black text-white mb-3 tracking-tighter">환영합니다!</h2>
            <p className="text-white/60 text-sm leading-relaxed max-w-[80%]">
              프로필 설정이 모두 완료되었습니다.<br />이제 폴리의 모든 기능을 즐겨보세요!
            </p>

            {/* Abstract Backgrounds */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -z-10" />
          </motion.div>

          {/* Rewards Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-8 border-white/10 bg-white/5 relative overflow-hidden"
          >
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                <Gift className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-black text-yellow-400 uppercase tracking-widest mb-1">WELCOME REWARD</div>
                <h3 className="text-xl font-black text-white mb-1">로또 티켓 5장 지급!</h3>
                <p className="text-white/40 text-xs">참여해주셔서 감사합니다. 행운을 빌어요!</p>
              </div>
            </div>

            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-yellow-400/5 rounded-full blur-2xl pointer-events-none" />
          </motion.div>

          {/* Action Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button
              onClick={handleGoHome}
              className="w-full h-16 bg-white text-black hover:bg-white/90 rounded-2xl font-black text-xl shadow-2xl transition-all duration-300 transform active:scale-[0.98] mt-4"
            >
              시작하기
            </Button>
          </motion.div>
        </>
      )}
    </div>
  );
}