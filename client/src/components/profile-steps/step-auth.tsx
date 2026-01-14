import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Shield, Lock, Smartphone, Mail, CheckCircle2 } from 'lucide-react';

interface StepAuthProps {
  data: any;
  formData: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export default function StepAuth({ data, formData, onNext, onBack }: StepAuthProps) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSNSLogin = async (provider: 'kakao' | 'google') => {
    setIsLoading(provider);

    try {
      // Use the absolute latest data from localStorage or fallback to formData
      const latestData = JSON.parse(localStorage.getItem('profile_setup_data') || '{}');
      const finalData = { ...formData, ...latestData };

      localStorage.setItem('pending_profile_data', JSON.stringify({
        ageGroup: finalData.ageGroup,
        gender: finalData.gender,
        region: finalData.region,
        cityProvince: finalData.city_province,
        district: finalData.district,
        jobCategory: finalData.jobCategory,
        educationLevel: finalData.educationLevel,
        incomeLevel: finalData.incomeLevel,
        maritalStatus: finalData.maritalStatus,
        isPetOwner: finalData.isPetOwner,
        name: finalData.name,
        phone: finalData.phone,
      }));

      // Import dynamically to avoid build errors if lib/supabase is not ready yet
      const { supabase } = await import('@/lib/supabase');

      let options: any = {
        redirectTo: `${window.location.origin}/`,
      };

      if (provider === 'google') {
        options.queryParams = {
          access_type: 'offline',
          prompt: 'consent',
        };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: options,
      });

      if (error) throw error;

      // OAuth flow redirects away, so no need to stop loading state usually
    } catch (err: any) {
      console.error('Login error:', err);
      toast({
        variant: "destructive",
        title: "로그인 실패",
        description: err.message || "일시적인 오류가 발생했습니다."
      });
      setIsLoading(null);
    }

  };

  return (
    <div className="w-full space-y-8 pb-10">
      <div className="text-center space-y-4 mb-8">
        <div>
          <h3 className="text-2xl font-black text-white mb-2">
            3초만에 시작하기
          </h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            복잡한 입력 없이 SNS 계정으로<br />
            간편하고 안전하게 프로필을 저장하세요.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Kakao */}
        <Button
          onClick={() => handleSNSLogin('kakao')}
          disabled={!!isLoading}
          className="w-full h-14 bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#000000] rounded-2xl font-bold text-base transition-all transform active:scale-[0.98] border-0 relative overflow-hidden group"
        >
          <div className="absolute left-6 flex items-center justify-center">
            <i className="fas fa-comment text-lg"></i>
          </div>
          카카오로 시작하기
          {isLoading === 'kakao' && (
            <div className="absolute right-6 animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
          )}
        </Button>

        {/* Google */}
        <Button
          onClick={() => handleSNSLogin('google')}
          disabled={!!isLoading}
          className="w-full h-14 bg-white hover:bg-gray-100 text-black rounded-2xl font-bold text-base transition-all transform active:scale-[0.98] border-0 relative overflow-hidden"
        >
          <div className="absolute left-6 flex items-center justify-center">
            <i className="fab fa-google text-lg"></i>
          </div>
          구글로 시작하기
          {isLoading === 'google' && (
            <div className="absolute right-6 animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-4 py-4">
        <div className="h-px bg-white/10 flex-1"></div>
        <span className="text-xs text-gray-500 font-medium">또는</span>
        <div className="h-px bg-white/10 flex-1"></div>
      </div>

      <Button
        variant="outline"
        onClick={onBack}
        className="w-full h-14 border-white/10 bg-black/40 hover:bg-black/60 text-gray-400 rounded-2xl font-medium"
      >
        이전 단계로
      </Button>

      <p className="text-[10px] text-center text-gray-600 mt-6">
        회원가입 시 <span className="underline cursor-pointer hover:text-gray-400">이용약관</span> 및 <span className="underline cursor-pointer hover:text-gray-400">개인정보처리방침</span>에 동의하게 됩니다.
      </p>
    </div>
  );
}