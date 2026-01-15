import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { ArrowLeft, Gift } from 'lucide-react';
import LightPillar from '@/components/ui/light-pillar';
import StepAge from '@/components/profile-steps/step-age';
import StepGender from '@/components/profile-steps/step-gender';
import StepRegion from '@/components/profile-steps/step-region';
import StepOptional from '@/components/profile-steps/step-optional';
import StepPersonal from '@/components/profile-steps/step-personal';
import StepAuth from '@/components/profile-steps/step-auth';
import StepComplete from '@/components/profile-steps/step-complete';

const steps = [
  { component: StepAge, title: '연령대 선택', description: '포인트와 로또 기능을 이용하기 위해 필요합니다' },
  { component: StepGender, title: '성별 선택', description: '더 정확한 설문 결과를 위해 필요합니다' },
  { component: StepRegion, title: '지역 선택', description: '지역별 설문에 참여하실 수 있습니다' },
  { component: StepOptional, title: '추가 정보', description: '선택사항으로 더 맞춤형 서비스를 제공합니다' },
  { component: StepPersonal, title: '정보 입력', description: '서비스 이용을 위한 기본 정보입니다' },
  { component: StepAuth, title: '간편 가입', description: '입력한 정보로 3초만에 가입하세요' },
  { component: StepComplete, title: '완료', description: '프로필 설정이 완료되었습니다' }
];

export default function ProfileSetup() {
  const [, setLocation] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState({
    ageGroup: '',
    gender: '',
    region: '', // 기존 호환성 유지
    city_province: '', // 새로운 시/도 필드
    district: '', // 새로운 구/군 필드
    jobCategory: '',
    educationLevel: '',
    incomeLevel: '',
    maritalStatus: '',
    name: '',
    phone: '',
    isPetOwner: ''
  });

  // Load persisted data on mount to handle refreshes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('profile_setup_data');
      const savedIndex = localStorage.getItem('profile_setup_step_index');

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Failed to parse saved profile data:", e);
        }
      }

      if (savedIndex) {
        setStepIndex(parseInt(savedIndex, 10));
      }
    }
  }, []);

  const currentStep = steps[stepIndex];
  const StepComponent = currentStep.component;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const goNext = (data: any) => {
    const updatedData = { ...formData, ...data };
    setFormData(updatedData);

    // Persist to localStorage at every step to prevent data loss on flash/stale props
    localStorage.setItem('profile_setup_data', JSON.stringify(updatedData));

    if (stepIndex < steps.length - 1) {
      const nextIndex = stepIndex + 1;
      setStepIndex(nextIndex);
      localStorage.setItem('profile_setup_step_index', nextIndex.toString());
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else {
      setLocation('/home');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LightPillar
          topColor="#818CF8"
          bottomColor="#C084FC"
          intensity={0.15}
        />
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5"></div>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <motion.button
            onClick={goBack}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all duration-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </motion.button>

          <motion.div
            className="absolute left-1/2 -translate-x-1/2 text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-lg font-bold text-white tracking-tight">
              <span className="text-indigo-400 mr-1">{stepIndex + 1}</span>
              <span className="text-white/20">/</span>
              <span className="text-white/40 ml-1">{steps.length}</span>
            </div>
          </motion.div>

          <div className="w-10 h-10 flex items-center justify-center">
            {stepIndex === steps.length - 1 && (
              <motion.div
                className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Gift className="w-4 h-4 text-white" />
              </motion.div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-white/5 w-full">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%]"
            initial={{ width: 0 }}
            animate={{
              width: `${progress}%`,
              backgroundPosition: ["0% 0%", "100% 0%"]
            }}
            transition={{
              width: { duration: 0.5, ease: "easeOut" },
              backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" }
            }}
          />
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 py-8 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, x: 20, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.98 }}
            transition={{
              duration: 0.25,
              ease: "easeOut",
              type: "spring",
              stiffness: 400,
              damping: 30
            }}
            className="w-full"
          >
            <StepComponent
              data={formData}
              formData={formData}
              onNext={goNext}
              onBack={goBack}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}