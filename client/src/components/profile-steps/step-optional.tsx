import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, GraduationCap, DollarSign, Heart, Settings, ArrowRight } from 'lucide-react';

const JOB_CATEGORIES = ['학생', '회사원', '자영업', '공무원', '주부', '무직', '기타'];
const EDUCATION_LEVELS = ['고졸이하', '대학재학', '대졸', '대학원졸', '기타'];
const INCOME_LEVELS = ['100만원미만', '100-200만원', '200-300만원', '300-500만원', '500-700만원', '700만원이상', '비공개'];
const MARITAL_STATUS = ['미혼', '기혼', '기타'];

interface StepOptionalProps {
  onNext: (data: any) => void;
  formData: any;
}

export default function StepOptional({ onNext, formData }: StepOptionalProps) {
  const [optionalData, setOptionalData] = useState({
    jobCategory: formData.jobCategory || '',
    educationLevel: formData.educationLevel || '',
    incomeLevel: formData.incomeLevel || '',
    maritalStatus: formData.maritalStatus || ''
  });

  const handleNext = async () => {
    onNext(optionalData);
  };

  const handleSkip = () => {
    onNext({});
  };

  const updateField = (field: string, value: string) => {
    setOptionalData(prev => ({ ...prev, [field]: value }));
  };

  const renderField = (label: string, icon: any, field: string, placeholder: string, options: string[]) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <label className="text-sm font-black text-purple-400 uppercase tracking-widest ml-1 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
        <span className="opacity-70">{icon}</span>
        {label}
      </label>
      <Select value={(optionalData as any)[field]} onValueChange={(value) => updateField(field, value)}>
        <SelectTrigger className="w-full h-16 px-6 border border-white/10 rounded-[2rem] bg-white/5 text-white focus:ring-2 focus:ring-purple-500/50 transition-all duration-300 backdrop-blur-xl">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-black/90 border-white/10 backdrop-blur-2xl rounded-3xl max-h-[300px]">
          {options.map((opt) => (
            <SelectItem
              key={opt}
              value={opt}
              className="py-3 px-4 focus:bg-purple-500/20 focus:text-white text-white/70 rounded-xl mx-2 my-1 transition-colors"
            >
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  );

  return (
    <div className="w-full space-y-8 pb-10">
      <div className="space-y-6">
        {renderField('직업', <Briefcase className="w-3 h-3" />, 'jobCategory', '직업을 선택해주세요', JOB_CATEGORIES)}
        {renderField('학력', <GraduationCap className="w-3 h-3" />, 'educationLevel', '학력을 선택해주세요', EDUCATION_LEVELS)}
        {renderField('소득 수준', <DollarSign className="w-3 h-3" />, 'incomeLevel', '소득 수준을 선택해주세요', INCOME_LEVELS)}
        {renderField('결혼 상태', <Heart className="w-3 h-3" />, 'maritalStatus', '결혼 상태를 선택해주세요', MARITAL_STATUS)}
      </div>

      <div className="flex gap-4">
        <Button
          onClick={handleSkip}
          variant="ghost"
          className="flex-1 h-14 text-white/50 hover:text-white hover:bg-white/5 rounded-2xl font-bold transition-all"
        >
          건너뛰기
        </Button>
        <Button
          onClick={handleNext}
          className="flex-[2] h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-purple-500/20 transition-all duration-300 transform active:scale-[0.98] border-0"
        >
          <span>설정 완료</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}