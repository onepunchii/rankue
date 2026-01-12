import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { User, Users, ArrowRight } from 'lucide-react';

const GENDERS = [
  { value: '남성', label: '남성' },
  { value: '여성', label: '여성' },
  { value: '기타', label: '기타' }
];

interface StepGenderProps {
  onNext: (data: any) => void;
  formData: any;
}

export default function StepGender({ onNext, formData }: StepGenderProps) {
  const [selectedGender, setSelectedGender] = useState(formData.gender || '');

  const handleNext = () => {
    if (selectedGender) {
      onNext({ gender: selectedGender });
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="space-y-4">
        {GENDERS.map((gender, index) => (
          <motion.button
            key={gender.value}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => setSelectedGender(gender.value)}
            whileHover={{ scale: 1.01, x: 4 }}
            whileTap={{ scale: 0.99 }}
            className={`
              w-full p-6 rounded-[2rem] border transition-all duration-300 flex items-center justify-between overflow-hidden relative backdrop-blur-xl
              ${selectedGender === gender.value
                ? 'bg-purple-500/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }
            `}
          >
            {selectedGender === gender.value && (
              <motion.div
                layoutId="gender-active-bg"
                className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent pointer-events-none"
              />
            )}

            <div className="flex items-center space-x-5 relative z-10">
              <div className={`
                w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
                ${selectedGender === gender.value
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 text-white/20 border border-white/5'}
              `}>
                <User className="w-6 h-6" />
              </div>
              <div className={`font-black text-xl tracking-tight transition-colors ${selectedGender === gender.value ? 'text-white' : 'text-white/70'}`}>
                {gender.label}
              </div>
            </div>

            {selectedGender === gender.value && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(168,85,247,0.5)] border-2 border-white/20"
              >
                <div className="w-2.5 h-2.5 bg-white rounded-full" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button
          onClick={handleNext}
          disabled={!selectedGender}
          className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-purple-500/20 transition-all duration-300 disabled:opacity-30 disabled:grayscale transform active:scale-[0.98] border-0"
        >
          <span>다음 단계</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}