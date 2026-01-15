import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PolliDemoSetup() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 사용자 정보 가져오기 - AuthContext에서 이미 가져옴
  // const { data: user } = useQuery({ ... });

  // 인구통계 폼 데이터
  const [demographicsData, setDemographicsData] = useState({
    age_group: '',
    gender: '',
    region: '',
    job_category: '',
    education_level: '',
    income_level: '',
    marital_status: ''
  });

  // 프로필 설정 처리 (Simple Auth 시스템 사용)
  const verifyMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/user/demographics', {
        method: 'POST',
        body: {
          age_group: demographicsData.age_group,
          gender: demographicsData.gender,
          region: demographicsData.region,
          job_category: demographicsData.job_category,
          education_level: demographicsData.education_level,
          income_level: demographicsData.income_level,
          marital_status: demographicsData.marital_status
        }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "프로필 설정 완료!",
        description: data.message + " " + (data.reward || ""),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      // 홈으로 리다이렉트
      setTimeout(() => {
        setLocation('/home');
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "설정 실패",
        description: error.message || "프로필 설정에 실패했습니다.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    if (!demographicsData.age_group || !demographicsData.gender || !demographicsData.region) {
      toast({
        title: "필수 정보 누락",
        description: "연령대, 성별, 지역은 필수 입력 항목입니다.",
        variant: "destructive",
      });
      return;
    }
    verifyMutation.mutate();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* 헤더 */}
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-gray-900">Polli 프로필 설정</h1>
          <p className="text-gray-600 mt-2">프로필을 완성하고 로또 기능을 이용해보세요</p>
        </div>



        {/* 프로필 설정 */}
        <Card>
          <CardHeader>
            <CardTitle>프로필 설정</CardTitle>
            <CardDescription>인구통계 정보를 입력해주세요 (필수: 연령대, 성별, 지역)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="age_group">연령대 *</Label>
              <Select value={demographicsData.age_group} onValueChange={(value) => setDemographicsData({ ...demographicsData, age_group: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="연령대를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10대">10대</SelectItem>
                  <SelectItem value="20대">20대</SelectItem>
                  <SelectItem value="30대">30대</SelectItem>
                  <SelectItem value="40대">40대</SelectItem>
                  <SelectItem value="50대">50대</SelectItem>
                  <SelectItem value="60대 이상">60대 이상</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gender">성별 *</Label>
              <Select value={demographicsData.gender} onValueChange={(value) => setDemographicsData({ ...demographicsData, gender: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="성별을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="남성">남성</SelectItem>
                  <SelectItem value="여성">여성</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="region">지역 *</Label>
              <Select value={demographicsData.region} onValueChange={(value) => setDemographicsData({ ...demographicsData, region: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="지역을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="서울">서울</SelectItem>
                  <SelectItem value="부산">부산</SelectItem>
                  <SelectItem value="대구">대구</SelectItem>
                  <SelectItem value="인천">인천</SelectItem>
                  <SelectItem value="광주">광주</SelectItem>
                  <SelectItem value="대전">대전</SelectItem>
                  <SelectItem value="울산">울산</SelectItem>
                  <SelectItem value="경기도">경기도</SelectItem>
                  <SelectItem value="강원도">강원도</SelectItem>
                  <SelectItem value="충청북도">충청북도</SelectItem>
                  <SelectItem value="충청남도">충청남도</SelectItem>
                  <SelectItem value="전라북도">전라북도</SelectItem>
                  <SelectItem value="전라남도">전라남도</SelectItem>
                  <SelectItem value="경상북도">경상북도</SelectItem>
                  <SelectItem value="경상남도">경상남도</SelectItem>
                  <SelectItem value="제주도">제주도</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="job_category">직업 (선택)</Label>
              <Select value={demographicsData.job_category} onValueChange={(value) => setDemographicsData({ ...demographicsData, job_category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="직업을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="학생">학생</SelectItem>
                  <SelectItem value="직장인">직장인</SelectItem>
                  <SelectItem value="자영업">자영업</SelectItem>
                  <SelectItem value="전문직">전문직</SelectItem>
                  <SelectItem value="주부">주부</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="education_level">학력 (선택)</Label>
              <Select value={demographicsData.education_level} onValueChange={(value) => setDemographicsData({ ...demographicsData, education_level: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="학력을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="중학교 졸업">중학교 졸업</SelectItem>
                  <SelectItem value="고등학교 졸업">고등학교 졸업</SelectItem>
                  <SelectItem value="대학교 재학">대학교 재학</SelectItem>
                  <SelectItem value="대학교 졸업">대학교 졸업</SelectItem>
                  <SelectItem value="대학원 졸업">대학원 졸업</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="income_level">소득수준 (선택)</Label>
              <Select value={demographicsData.income_level} onValueChange={(value) => setDemographicsData({ ...demographicsData, income_level: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="소득수준을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100만원 미만">100만원 미만</SelectItem>
                  <SelectItem value="100-200만원">100-200만원</SelectItem>
                  <SelectItem value="200-300만원">200-300만원</SelectItem>
                  <SelectItem value="300-400만원">300-400만원</SelectItem>
                  <SelectItem value="400-500만원">400-500만원</SelectItem>
                  <SelectItem value="500만원 이상">500만원 이상</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="marital_status">결혼여부 (선택)</Label>
              <Select value={demographicsData.marital_status} onValueChange={(value) => setDemographicsData({ ...demographicsData, marital_status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="결혼여부를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="미혼">미혼</SelectItem>
                  <SelectItem value="기혼">기혼</SelectItem>
                  <SelectItem value="이혼">이혼</SelectItem>
                  <SelectItem value="사별">사별</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={verifyMutation.isPending}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              {verifyMutation.isPending ? "설정 중..." : "프로필 설정 완료"}
            </Button>
          </CardContent>
        </Card>

        {/* 뒤로가기 버튼 */}
        <Button
          variant="outline"
          onClick={() => setLocation('/')}
          className="w-full"
        >
          홈으로 돌아가기
        </Button>
      </div>
    </div>
  );
}