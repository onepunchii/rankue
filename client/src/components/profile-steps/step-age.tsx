import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Calendar, Users, ArrowRight } from 'lucide-react';

const AGE_GROUPS = [
  { value: '10대', label: '10대', range: '10-19세' },
  { value: '20대', label: '20대', range: '20-29세' },
  { value: '30대', label: '30대', range: '30-39세' },
  { value: '40대', label: '40대', range: '40-49세' },
  { value: '50대', label: '50대', range: '50-59세' },
  { value: '60대이상', label: '60대 이상', range: '60세+' }
];

interface StepAgeProps {
  onNext: (data: any) => void;
  formData: any;
}

export default function StepAge({ onNext, formData }: StepAgeProps) {
  const [selectedAge, setSelectedAge] = useState(formData.ageGroup || '');

  const handleNext = () => {
    if (selectedAge) {
      onNext({ ageGroup: selectedAge });
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="grid grid-cols-2 gap-4">
        {AGE_GROUPS.map((age, index) => (
          <motion.button
            key={age.value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => setSelectedAge(age.value)}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`
              relative p-6 rounded-[2rem] transition-all duration-300 text-center border overflow-hidden backdrop-blur-xl
              ${selectedAge === age.value
                ? 'bg-purple-500/20 border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.3)]'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }
            `}
          >
            {selectedAge === age.value && (
              <motion.div
                layoutId="active-bg"
                className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10"
              />
            )}

            <div className={`
              mb-4 inline-flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300
              ${selectedAge === age.value
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                : 'bg-white/5 text-white/20 border border-white/5'}
            `}>
              <Calendar className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <div className={`font-black text-xl tracking-tight transition-colors ${selectedAge === age.value ? 'text-white' : 'text-white/70'}`}>
                {age.label}
              </div>
              <div className="text-xs text-white/30 font-bold uppercase tracking-widest">
                {age.range}
              </div>
            </div>
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
          disabled={!selectedAge}
          className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-purple-500/20 transition-all duration-300 disabled:opacity-30 disabled:grayscale transform active:scale-[0.98] border-0"
        >
          <span>다음 단계</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}