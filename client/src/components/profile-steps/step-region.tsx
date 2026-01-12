import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, ArrowRight } from 'lucide-react';
import { CITY_PROVINCES, getDistrictsByProvince } from '@shared/koreaAdministrativeDistrict';

interface StepRegionProps {
  onNext: (data: any) => void;
  formData: any;
}

export default function StepRegion({ onNext, formData }: StepRegionProps) {
  const [selectedCityProvince, setSelectedCityProvince] = useState(formData.city_province || '');
  const [selectedDistrict, setSelectedDistrict] = useState(formData.district || '');
  const [availableDistricts, setAvailableDistricts] = useState<string[]>(
    formData.city_province ? getDistrictsByProvince(formData.city_province) : []
  );

  const handleCityProvinceChange = (cityProvince: string) => {
    setSelectedCityProvince(cityProvince);
    setSelectedDistrict(''); // 시/도 변경 시 구/군 초기화
    const districts = getDistrictsByProvince(cityProvince);
    setAvailableDistricts(districts);
  };

  const handleNext = () => {
    if (selectedCityProvince && (availableDistricts.length === 0 || selectedDistrict)) {
      onNext({
        region: selectedCityProvince,
        city_province: selectedCityProvince,
        district: selectedDistrict || null
      });
    }
  };

  return (
    <div className="w-full space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="space-y-4">
          <label className="text-sm font-black text-purple-400 uppercase tracking-widest ml-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            시/도 선택
          </label>
          <Select value={selectedCityProvince} onValueChange={handleCityProvinceChange}>
            <SelectTrigger className="w-full h-16 px-6 border border-white/10 rounded-[2rem] bg-white/5 text-white focus:ring-2 focus:ring-purple-500/50 transition-all duration-300 backdrop-blur-xl">
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-purple-400" />
                <SelectValue placeholder="시/도를 선택해주세요" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-black/90 border-white/10 backdrop-blur-2xl rounded-3xl">
              {CITY_PROVINCES.map((cityProvince) => (
                <SelectItem
                  key={cityProvince}
                  value={cityProvince}
                  className="py-3 px-4 focus:bg-purple-500/20 focus:text-white text-white/70 rounded-xl mx-2 my-1 transition-colors"
                >
                  {cityProvince}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 구/군 선택 */}
        {selectedCityProvince && availableDistricts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <label className="text-sm font-black text-purple-400 uppercase tracking-widest ml-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              구/군 선택
            </label>
            <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
              <SelectTrigger className="w-full h-16 px-6 border border-white/10 rounded-[2rem] bg-white/5 text-white focus:ring-2 focus:ring-purple-500/50 transition-all duration-300 backdrop-blur-xl">
                <div className="flex items-center space-x-3">
                  <MapPin className="w-5 h-5 text-purple-400" />
                  <SelectValue placeholder="구/군을 선택해주세요" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-black/90 border-white/10 backdrop-blur-2xl rounded-3xl">
                {availableDistricts.map((district) => (
                  <SelectItem
                    key={district}
                    value={district}
                    className="py-3 px-4 focus:bg-purple-500/20 focus:text-white text-white/70 rounded-xl mx-2 my-1 transition-colors"
                  >
                    {district}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        )}

        {/* 선택 완료 피드백 */}
        {selectedCityProvince && (availableDistricts.length === 0 || selectedDistrict) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 bg-purple-500/10 border border-purple-500/20 rounded-[2.5rem] backdrop-blur-xl shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -z-10" />
            <div className="flex items-center space-x-5">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <div className="text-base font-bold text-white/80 leading-snug">
                <span className="text-purple-400 font-black text-lg block mb-0.5">
                  {selectedCityProvince}
                  {selectedDistrict && ` ${selectedDistrict}`}
                </span>
                지역 설문에 참여하실 수 있어요!
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button
          onClick={handleNext}
          disabled={!selectedCityProvince || (availableDistricts.length > 0 && !selectedDistrict)}
          className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-purple-500/20 transition-all duration-300 disabled:opacity-30 disabled:grayscale transform active:scale-[0.98] border-0"
        >
          <span>다음 단계</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}