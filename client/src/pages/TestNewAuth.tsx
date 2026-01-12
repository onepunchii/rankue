import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface UserAuth {
  auth_id: string;
  user_type: 'guest' | 'verified' | 'admin';
  is_verified: boolean;
  phone?: string;
  ci?: string;
  age_group?: string;
  gender?: string;
  region?: string;
  job_category?: string;
  education_level?: string;
  income_level?: string;
  marital_status?: string;
  available_lottery_tickets: number;
  experience_points: number;
  personal_points: number;
  level_number: number;
  created_at?: string;
  updated_at?: string;
}

export default function TestNewAuth() {
  const [authId, setAuthId] = useState<string>('');
  const [userAuth, setUserAuth] = useState<UserAuth | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [demographics, setDemographics] = useState({
    age_group: '',
    gender: '',
    region: '',
    job_category: '',
    education_level: '',
    income_level: '',
    marital_status: ''
  });
  const { toast } = useToast();

  // Generate a new guest ID
  const generateGuestId = () => {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setAuthId(guestId);
    localStorage.setItem('auth_id', guestId);
    toast({
      title: "새 게스트 ID 생성됨",
      description: guestId,
    });
  };

  // Load stored auth_id on component mount
  useEffect(() => {
    const storedAuthId = localStorage.getItem('auth_id');
    if (storedAuthId) {
      setAuthId(storedAuthId);
    }
  }, []);

  // Check user state
  const checkUserState = async () => {
    if (!authId) {
      toast({
        title: "오류",
        description: "auth_id가 필요합니다.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/user-state?auth_id=${authId}`);
      const data = await response.json();
      setUserAuth(data);
      toast({
        title: "사용자 상태 조회 성공",
        description: `타입: ${data.user_type}, 인증: ${data.is_verified}`,
      });
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 상태를 조회할 수 없습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Send SMS verification
  const sendSMSVerification = async () => {
    if (!phone) {
      toast({
        title: "오류",
        description: "휴대폰 번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, auth_id: authId }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "SMS 전송 성공",
          description: data.message,
        });
      } else {
        toast({
          title: "SMS 전송 실패",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "SMS 전송에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // Verify SMS code
  const verifySMSCode = async () => {
    if (!phone || !verificationCode) {
      toast({
        title: "오류",
        description: "휴대폰 번호와 인증번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/auth/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: verificationCode, auth_id: authId }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "인증 성공",
          description: data.message,
        });
        checkUserState(); // Refresh user state
      } else {
        toast({
          title: "인증 실패",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "인증에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // Set demographics
  const setUserDemographics = async () => {
    if (!demographics.age_group || !demographics.gender || !demographics.region) {
      toast({
        title: "오류",
        description: "필수 인구통계 정보를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/user/demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...demographics, auth_id: authId }),
      });
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "인구통계 설정 성공",
          description: data.message,
        });
        checkUserState(); // Refresh user state
      } else {
        toast({
          title: "설정 실패",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "인구통계 설정에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>새로운 인증 시스템 테스트</CardTitle>
            <CardDescription>
              게스트 → 인증 사용자 플로우를 테스트해보세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Auth ID Management */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">1. 인증 ID 관리</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="auth_id (자동 생성됨)"
                  value={authId}
                  onChange={(e) => setAuthId(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={generateGuestId}>
                  새 게스트 ID 생성
                </Button>
                <Button onClick={checkUserState} disabled={loading || !authId}>
                  상태 조회
                </Button>
              </div>
            </div>

            <Separator />

            {/* User State Display */}
            {userAuth && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">2. 사용자 상태</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label>사용자 타입</Label>
                    <Badge variant={userAuth.user_type === 'verified' ? 'default' : 'secondary'}>
                      {userAuth.user_type}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label>인증 상태</Label>
                    <Badge variant={userAuth.is_verified ? 'default' : 'destructive'}>
                      {userAuth.is_verified ? '인증됨' : '미인증'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label>로또 티켓</Label>
                    <div>{userAuth.available_lottery_tickets}장</div>
                  </div>
                  <div className="space-y-1">
                    <Label>경험치</Label>
                    <div>{userAuth.experience_points}XP</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Auth ID: {userAuth.auth_id}
                </div>
              </div>
            )}

            <Separator />

            {/* SMS Verification */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">3. SMS 인증</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="휴대폰 번호 (예: 010-1234-5678)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={sendSMSVerification}>
                    인증번호 전송
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="인증번호 6자리"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={verifySMSCode}>
                    인증 확인
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Demographics */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">4. 인구통계 설정</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>연령대 *</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={demographics.age_group}
                    onChange={(e) => setDemographics({...demographics, age_group: e.target.value})}
                  >
                    <option value="">선택해주세요</option>
                    <option value="10대">10대</option>
                    <option value="20대">20대</option>
                    <option value="30대">30대</option>
                    <option value="40대">40대</option>
                    <option value="50대">50대</option>
                    <option value="60대+">60대+</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>성별 *</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={demographics.gender}
                    onChange={(e) => setDemographics({...demographics, gender: e.target.value})}
                  >
                    <option value="">선택해주세요</option>
                    <option value="남성">남성</option>
                    <option value="여성">여성</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>지역 *</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={demographics.region}
                    onChange={(e) => setDemographics({...demographics, region: e.target.value})}
                  >
                    <option value="">선택해주세요</option>
                    <option value="서울">서울</option>
                    <option value="경기">경기</option>
                    <option value="인천">인천</option>
                    <option value="부산">부산</option>
                    <option value="대구">대구</option>
                    <option value="대전">대전</option>
                    <option value="광주">광주</option>
                    <option value="울산">울산</option>
                    <option value="세종">세종</option>
                    <option value="강원">강원</option>
                    <option value="충북">충북</option>
                    <option value="충남">충남</option>
                    <option value="전북">전북</option>
                    <option value="전남">전남</option>
                    <option value="경북">경북</option>
                    <option value="경남">경남</option>
                    <option value="제주">제주</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>직업</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={demographics.job_category}
                    onChange={(e) => setDemographics({...demographics, job_category: e.target.value})}
                  >
                    <option value="">선택해주세요</option>
                    <option value="학생">학생</option>
                    <option value="회사원">회사원</option>
                    <option value="자영업">자영업</option>
                    <option value="공무원">공무원</option>
                    <option value="주부">주부</option>
                    <option value="무직">무직</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>결혼 상태</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={demographics.marital_status}
                    onChange={(e) => setDemographics({...demographics, marital_status: e.target.value})}
                  >
                    <option value="">선택해주세요</option>
                    <option value="미혼">미혼</option>
                    <option value="기혼">기혼</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
              </div>
              
              <Button onClick={setUserDemographics} className="w-full">
                인구통계 정보 저장
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}