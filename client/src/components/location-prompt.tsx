import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface LocationPromptProps {
  onLocationSet: (city: string, district: string) => void;
  onSkip: () => void;
}

export default function LocationPrompt({ onLocationSet, onSkip }: LocationPromptProps) {
  const { toast } = useToast();
  const { latitude, longitude, city, district, error, loading, getCurrentLocation } = useGeolocation();
  const [manualLocation, setManualLocation] = useState({ city: '', district: '' });
  const [showManual, setShowManual] = useState(false);

  const updateLocationMutation = useMutation({
    mutationFn: async (locationData: { city: string; district: string; latitude?: string; longitude?: string }) => {
      await apiRequest('/api/user/location', {
        method: 'POST',
        body: locationData,
      });
    },
    onSuccess: () => {
      toast({
        title: '위치 설정 완료',
        description: '내 지역 설문조사를 확인해보세요!',
      });
    },
    onError: () => {
      toast({
        title: '오류',
        description: '위치 설정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleAutoLocation = () => {
    getCurrentLocation();
  };

  const handleManualSubmit = () => {
    if (!manualLocation.city) {
      toast({
        title: '오류',
        description: '도시를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    updateLocationMutation.mutate({
      city: manualLocation.city,
      district: manualLocation.district,
    });

    onLocationSet(manualLocation.city, manualLocation.district);
  };

  // Auto-submit when geolocation is successful
  if (city && district && !updateLocationMutation.isPending) {
    updateLocationMutation.mutate({
      city,
      district,
      latitude: latitude?.toString(),
      longitude: longitude?.toString(),
    });

    onLocationSet(city, district);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-map-marker-alt text-blue-600 text-2xl"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">내 지역 설정</h3>
            <p className="text-sm text-gray-600">
              우리 동네 설문조사에 참여하려면 위치 정보가 필요해요
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-600">{error.message}</p>
            </div>
          )}

          {!showManual ? (
            <div className="space-y-3">
              <Button
                onClick={handleAutoLocation}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    위치 확인 중...
                  </>
                ) : (
                  <>
                    <i className="fas fa-crosshairs mr-2"></i>
                    자동으로 위치 찾기
                  </>
                )}
              </Button>

              <Button
                onClick={() => setShowManual(true)}
                variant="outline"
                className="w-full"
              >
                <i className="fas fa-edit mr-2"></i>
                직접 입력하기
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  시/도
                </label>
                <input
                  type="text"
                  value={manualLocation.city}
                  onChange={(e) => setManualLocation(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="예: 서울"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  구/군 (선택사항)
                </label>
                <input
                  type="text"
                  value={manualLocation.district}
                  onChange={(e) => setManualLocation(prev => ({ ...prev, district: e.target.value }))}
                  placeholder="예: 강남구"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={handleManualSubmit}
                  disabled={updateLocationMutation.isPending}
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                >
                  {updateLocationMutation.isPending ? '설정 중...' : '설정 완료'}
                </Button>
                <Button
                  onClick={() => setShowManual(false)}
                  variant="outline"
                  className="flex-1"
                >
                  뒤로
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200">
            <Button
              onClick={onSkip}
              variant="ghost"
              className="w-full text-gray-500 text-sm"
            >
              나중에 설정하기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}