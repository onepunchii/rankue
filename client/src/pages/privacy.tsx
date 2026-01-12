import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

export default function Privacy() {
  const [, setLocation] = useLocation();
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    marketing: false,
    location: false
  });

  const [showTermsDetail, setShowTermsDetail] = useState(false);
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

  const allRequired = agreements.terms && agreements.privacy;

  const handleStart = async () => {
    // 게스트 ID 생성 및 저장 (새로운 방식)
    let guestId = localStorage.getItem('guestAuthId');
    if (!guestId) {
      guestId = `guest_${Date.now()}_${btoa(navigator.userAgent.slice(0, 20)).replace(/[^a-zA-Z0-9]/g, '')}`;
      localStorage.setItem('guestAuthId', guestId);
    }
    
    // 온보딩 완료 플래그 설정
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('termsAgreedAt', new Date().toISOString());
    
    // Simple Auth 시스템에 사용자 등록
    try {
      const response = await fetch('/api/auth/user-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guestId}`
        },
        body: JSON.stringify({ 
          auth_id: guestId,
          agreements,
          deviceInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        })
      });
      
      if (response.ok) {
        console.log('Simple Auth 사용자 등록 성공');
      }
    } catch (error) {
      console.log('cleanAuth 등록 실패, 게스트로 계속 진행:', error);
    }
    
    setLocation('/home');
  };

  const toggleAgreement = (key: keyof typeof agreements) => {
    setAgreements(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleAllRequired = () => {
    const newValue = !allRequired;
    setAgreements(prev => ({
      ...prev,
      terms: newValue,
      privacy: newValue
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-400/10 rounded-full blur-xl"></div>
        <div className="absolute bottom-32 right-20 w-28 h-28 bg-purple-400/10 rounded-full blur-xl"></div>
      </div>
      <div className="relative z-10 h-screen flex flex-col">
        {/* Header */}
        <div className="text-center pt-[16px] pb-[16px] mt-[42px] mb-[42px]">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">서비스 이용약관</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">안전한 서비스 이용을 위해 동의가 필요합니다</p>
        </div>

        {/* Simplified Content */}
        <div className="flex-1 flex flex-col justify-center px-6 py-4">
          <div className="max-w-sm mx-auto">
            {/* Agreement Card */}
            <div className="bg-white/95 dark:bg-gray-800/95 border border-gray-200/30 dark:border-gray-700/30 shadow-xl p-6 rounded-2xl mb-6">
              {/* Main Agreement Toggle */}
              <div 
                className="flex items-center justify-between cursor-pointer mb-4 p-3 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors" 
                onClick={toggleAllRequired}
              >
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    checked={allRequired} 
                    className="w-5 h-5 rounded-lg border-2 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
                  />
                  <span className="text-base font-semibold text-gray-800 dark:text-white">
                    필수 약관 전체 동의
                  </span>
                </div>
                <i className={`fas fa-chevron-down text-gray-400 text-sm transition-transform ${allRequired ? 'rotate-180' : ''}`}></i>
              </div>

              {/* Individual Agreement Items */}
              <div className="space-y-2 pl-2">
                <div className="flex items-center space-x-3 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <Checkbox 
                    checked={agreements.terms}
                    onCheckedChange={() => toggleAgreement('terms')}
                    className="w-4 h-4 rounded border-2 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                    서비스 이용약관
                  </span>
                  <span className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">필수</span>
                </div>
                <div className="flex items-center space-x-3 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <Checkbox 
                    checked={agreements.privacy}
                    onCheckedChange={() => toggleAgreement('privacy')}
                    className="w-4 h-4 rounded border-2 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                    개인정보 처리방침
                  </span>
                  <span className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">필수</span>
                </div>
              </div>
            </div>

            {/* Detailed Terms Drawer */}
            <Drawer>
              <DrawerTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full mb-6 py-3 border border-pink-200 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950 rounded-xl font-medium transition-all"
                >
                  <i className="fas fa-file-contract mr-2 text-pink-500"></i>
                  약관 자세히 보기
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <DrawerTitle className="text-center text-xl font-bold text-gray-800 dark:text-white">
                    이용약관 및 개인정보처리방침
                  </DrawerTitle>
                </DrawerHeader>
                <div className="px-6 py-6 overflow-y-auto">
                  <div className="space-y-6 max-w-md mx-auto">
                    {/* Terms Section */}
                    <div className="bg-white/95 dark:bg-gray-800/95 border border-gray-200/50 dark:border-gray-700/50 shadow-lg p-5 rounded-2xl">
                      <h3 className="font-bold text-gray-800 dark:text-white mb-3 text-base">
                        📋 서비스 이용약관
                      </h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3 leading-relaxed">
                        <div>
                          <p className="font-semibold mb-1">제1조 (목적)</p>
                          <p>이 약관은 Polli 서비스 이용과 관련된 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">제2조 (서비스의 내용)</p>
                          <p>• 실시간 뉴스 기반 투표 및 설문조사 서비스</p>
                          <p>• 포인트 및 리워드 시스템</p>
                          <p>• 로또 추첨 서비스</p>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">제3조 (이용자의 의무)</p>
                          <p>이용자는 서비스 이용 시 관련 법령과 이 약관을 준수해야 합니다.</p>
                        </div>
                      </div>
                    </div>

                    {/* Privacy Section */}
                    <div className="bg-white/95 dark:bg-gray-800/95 border border-gray-200/50 dark:border-gray-700/50 shadow-lg p-5 rounded-2xl">
                      <h3 className="font-bold text-gray-800 dark:text-white mb-3 text-base">
                        🔒 개인정보 처리방침
                      </h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3 leading-relaxed">
                        <div>
                          <p className="font-semibold mb-1">1. 개인정보의 처리목적</p>
                          <p>• 서비스 제공 및 운영</p>
                          <p>• 설문조사 결과 분석</p>
                          <p>• 포인트 및 리워드 지급</p>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">2. 수집하는 개인정보 항목</p>
                          <p>• 필수: 이메일, 닉네임</p>
                          <p>• 선택: 연령대, 성별, 지역 (익명 처리)</p>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">3. 개인정보의 보유기간</p>
                          <p>서비스 탈퇴 시까지 보관하며, 탈퇴 즉시 완전 삭제됩니다.</p>
                        </div>
                      </div>
                    </div>

                    {/* Optional Agreements */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-gray-800 dark:text-white text-base">선택 약관</h4>
                      
                      <div className="bg-white/95 dark:bg-gray-800/95 border border-gray-200/50 dark:border-gray-700/50 shadow-lg p-4 rounded-2xl">
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            checked={agreements.marketing}
                            onCheckedChange={() => toggleAgreement('marketing')}
                            className="w-5 h-5 rounded-lg border-2 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-gray-800 dark:text-white block mb-1">
                              📧 마케팅 정보 수신 동의 <span className="text-gray-500">(선택)</span>
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              새로운 설문조사와 이벤트 소식을 받아보실 수 있습니다.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/95 dark:bg-gray-800/95 border border-gray-200/50 dark:border-gray-700/50 shadow-lg p-4 rounded-2xl">
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            checked={agreements.location}
                            onCheckedChange={() => toggleAgreement('location')}
                            className="w-5 h-5 rounded-lg border-2 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-gray-800 dark:text-white block mb-1">
                              📍 위치기반 서비스 이용 동의 <span className="text-gray-500">(선택)</span>
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              내 지역 설문조사를 추천받을 수 있습니다.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            {/* Action Button */}
            <Button
              onClick={handleStart}
              disabled={!allRequired}
              className={`w-full text-white text-base font-semibold py-4 h-auto shadow-lg transition-all duration-300 rounded-xl ${
                allRequired 
                  ? 'bg-pink-500 hover:bg-pink-600 hover:shadow-pink-500/30' 
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              <i className="fas fa-check mr-2"></i>
              동의하고 시작하기
            </Button>

            {/* Footer Text */}
            <div className="text-center mt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                필수 약관에 동의하시면 Polli 서비스를 이용하실 수 있습니다
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}