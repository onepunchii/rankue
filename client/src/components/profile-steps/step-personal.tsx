import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Phone, Cat, Dog } from 'lucide-react';

interface StepPersonalProps {
    data: any;
    formData: any;
    onNext: (data: any) => void;
    onBack: () => void;
}

export default function StepPersonal({ data, formData, onNext, onBack }: StepPersonalProps) {
    const [localData, setLocalData] = useState({
        name: formData.name || '',
        phone: formData.phone || '',
        isPetOwner: formData.isPetOwner || '' // 'yes' | 'no'
    });

    const handleChange = (field: string, value: string) => {
        setLocalData(prev => ({ ...prev, [field]: value }));
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        if (value.length <= 11) {
            setLocalData(prev => ({ ...prev, phone: value }));
        }
    };

    const isValid = localData.name.length >= 2 && localData.phone.length >= 10 && localData.isPetOwner !== '';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isValid) {
            onNext(localData);
        }
    };

    return (
        <div className="w-full space-y-8">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">
                    거의 다 왔어요! 🙌
                </h2>
                <p className="text-gray-400 text-sm">
                    본인 확인과 맞춤형 혜택을 위해<br />
                    간단한 정보를 입력해주세요.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* 이름 입력 */}
                <div className="space-y-2">
                    <Label className="text-sm text-purple-400 font-bold ml-1 flex items-center gap-2">
                        <User className="w-3 h-3" /> 성함
                    </Label>
                    <Input
                        value={localData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="홍길동"
                        className="h-14 bg-white/5 border-white/10 rounded-2xl text-white px-5 focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                </div>

                {/* 휴대폰 번호 입력 */}
                <div className="space-y-2">
                    <Label className="text-sm text-purple-400 font-bold ml-1 flex items-center gap-2">
                        <Phone className="w-3 h-3" /> 휴대폰 번호
                    </Label>
                    <Input
                        value={localData.phone}
                        onChange={handlePhoneChange}
                        type="tel"
                        placeholder="01012345678"
                        className="h-14 bg-white/5 border-white/10 rounded-2xl text-white px-5 focus:ring-2 focus:ring-purple-500/50 transition-all font-mono"
                    />
                </div>

                {/* 반려동물 여부 */}
                <div className="space-y-3">
                    <Label className="text-sm text-purple-400 font-bold ml-1 flex items-center gap-2">
                        <Cat className="w-3 h-3" /> 반려동물을 키우시나요?
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => handleChange('isPetOwner', 'yes')}
                            className={`h-14 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 relative overflow-hidden group ${localData.isPetOwner === 'yes'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            <div className="flex items-center gap-2 relative z-10">
                                <Dog className="w-4 h-4" />
                                <span>네, 키워요</span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChange('isPetOwner', 'no')}
                            className={`h-14 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${localData.isPetOwner === 'no'
                                ? 'bg-gray-700 text-white shadow-lg ring-2 ring-gray-500/50'
                                : 'bg-black/40 text-gray-400 hover:bg-black/60 hover:text-white'
                                }`}
                        >
                            <span>아니요</span>
                        </button>
                    </div>
                </div>

                <div className="flex gap-4 pt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onBack}
                        className="flex-1 h-14 text-white/50 hover:text-white hover:bg-white/5 rounded-2xl font-bold transition-all"
                    >
                        이전
                    </Button>
                    <Button
                        type="submit"
                        disabled={!isValid}
                        className={`flex-[2] h-14 rounded-2xl font-black text-lg transition-all transform active:scale-[0.98] ${isValid
                            ? 'bg-white text-black hover:bg-white/90 shadow-xl shadow-white/10'
                            : 'bg-white/10 text-white/20 cursor-not-allowed'
                            }`}
                    >
                        다음으로
                    </Button>
                </div>
            </form>
        </div>
    );
}
