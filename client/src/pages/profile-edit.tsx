import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { KOREA_ADMINISTRATIVE_DISTRICT } from "@shared/koreaAdministrativeDistrict";
import { motion } from "framer-motion";

export default function ProfileEdit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 사용자 정보 조회
  const { data: userState, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  // 폼 상태
  const [formData, setFormData] = useState({
    ageGroup: "",
    gender: "",
    cityProvince: "",
    district: "",
    jobCategory: "",
    educationLevel: "",
    incomeLevel: "",
    maritalStatus: "",
    isPetOwner: "false", // Use string "true"/"false" for Select component compatibility
  });

  // 사용자 데이터로 폼 초기화
  useEffect(() => {
    if (userState && (userState as any).user) {
      const user = (userState as any).user;
      console.log("Initial user data:", user);
      setFormData({
        ageGroup: user.ageGroup || "",
        gender: user.gender || "",
        cityProvince: user.cityProvince || "",
        district: user.district || "",
        jobCategory: user.jobCategory || "",
        educationLevel: user.educationLevel || "",
        incomeLevel: user.incomeLevel || "",
        maritalStatus: user.maritalStatus || "",
        isPetOwner: user.isPetOwner ? "true" : "false",
      });
    }
  }, [userState]);

  // 프로필 업데이트 mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Convert string "true"/"false" back to boolean for API
      const payload = {
        ...data,
        isPetOwner: data.isPetOwner === "true"
      };

      console.log("Profile update - payload:", payload);
      return await apiRequest("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      });
    },
    onSuccess: () => {
      toast({
        title: "프로필 수정 완료",
        description: "프로필 정보가 성공적으로 업데이트되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/profile");
    },
    onError: (error: any) => {
      console.error("Profile update error:", error);
      toast({
        title: "수정 실패",
        description: error?.message || "프로필 수정 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 시/도 선택 시 구/군 초기화
  const handleCityProvinceChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      cityProvince: value,
      district: "" // 시/도 변경 시 구/군 초기화
    }));
  };

  // 선택된 시/도에 해당하는 구/군 목록
  const availableDistricts = formData.cityProvince
    ? (KOREA_ADMINISTRATIVE_DISTRICT as any)[formData.cityProvince] || []
    : [];

  const handleSubmit = () => {
    // 필수 필드 검증
    if (!formData.ageGroup || !formData.gender || (!formData.cityProvince && !formData.district)) {
      toast({
        title: "필수 정보 누락",
        description: "연령대, 성별, 거주지역은 필수 입력사항입니다.",
        variant: "destructive",
      });
      return;
    }

    updateProfileMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Background simplifed - removing intense gradients */}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-3 relative z-10">
          <button
            onClick={() => setLocation('/profile')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
            aria-label="뒤로 가기"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h1 className="text-sm font-black text-white uppercase tracking-widest">프로필 수정</h1>
          <div className="w-10"></div> {/* Spacer */}
        </div>
      </header>

      <main className="px-4 py-8 max-w-lg mx-auto relative z-10 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="glass-card border border-white/5 bg-black/20 ring-0 shadow-none">
            <CardHeader className="text-center pb-8 p-0 mb-6">
              <div className="w-20 h-20 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                <i className="fas fa-user-edit text-3xl text-purple-400"></i>
              </div>
              <CardTitle className="text-2xl font-black text-white mb-2">
                PROFILE EDIT
              </CardTitle>
              <p className="text-xs text-white/40 uppercase tracking-widest font-medium">
                더 정확한 추천을 위해 정보를 최신화하세요
              </p>
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              {/* 연령대 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  연령대 <span className="text-purple-500 ml-1">*</span>
                </label>
                <Select value={formData.ageGroup} onValueChange={(value) => setFormData(prev => ({ ...prev, ageGroup: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="연령대를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="10대">10대</SelectItem>
                    <SelectItem value="20대">20대</SelectItem>
                    <SelectItem value="30대">30대</SelectItem>
                    <SelectItem value="40대">40대</SelectItem>
                    <SelectItem value="50대">50대</SelectItem>
                    <SelectItem value="60대 이상">60대 이상</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 성별 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  성별 <span className="text-purple-500 ml-1">*</span>
                </label>
                <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="성별을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="남성">남성</SelectItem>
                    <SelectItem value="여성">여성</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 거주지역 Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* 시/도 */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                    시/도 <span className="text-purple-500 ml-1">*</span>
                  </label>
                  <Select value={formData.cityProvince} onValueChange={handleCityProvinceChange}>
                    <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                      <SelectValue placeholder="시/도" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-[300px]">
                      {Object.keys(KOREA_ADMINISTRATIVE_DISTRICT).map((cityProvince) => (
                        <SelectItem key={cityProvince} value={cityProvince}>
                          {cityProvince}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 구/군 */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                    구/군 <span className="text-purple-500 ml-1">*</span>
                  </label>
                  <Select
                    value={formData.district}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, district: value }))}
                    disabled={!formData.cityProvince}
                  >
                    <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white disabled:opacity-50 focus:ring-purple-500/50">
                      <SelectValue placeholder="구/군" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-[300px]">
                      {availableDistricts.map((district: string) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="h-px bg-white/5 my-6"></div>

              {/* 반려동물 유무 - NEW */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  반려동물
                </label>
                <Select value={formData.isPetOwner} onValueChange={(value) => setFormData(prev => ({ ...prev, isPetOwner: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="반려동물 유무를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="true">있음</SelectItem>
                    <SelectItem value="false">없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 직업 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  직업
                </label>
                <Select value={formData.jobCategory} onValueChange={(value) => setFormData(prev => ({ ...prev, jobCategory: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="직업을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="학생">학생</SelectItem>
                    <SelectItem value="직장인">직장인</SelectItem>
                    <SelectItem value="자영업">자영업</SelectItem>
                    <SelectItem value="전문직">전문직</SelectItem>
                    <SelectItem value="주부">주부</SelectItem>
                    <SelectItem value="무직">무직</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 교육수준 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  교육수준
                </label>
                <Select value={formData.educationLevel} onValueChange={(value) => setFormData(prev => ({ ...prev, educationLevel: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="교육수준을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="중졸 이하">중졸 이하</SelectItem>
                    <SelectItem value="고졸">고졸</SelectItem>
                    <SelectItem value="대졸">대졸</SelectItem>
                    <SelectItem value="대학원졸">대학원졸</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 소득수준 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  소득수준
                </label>
                <Select value={formData.incomeLevel} onValueChange={(value) => setFormData(prev => ({ ...prev, incomeLevel: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="소득수준을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="200만원미만">200만원 미만</SelectItem>
                    <SelectItem value="200-400만원">200-400만원</SelectItem>
                    <SelectItem value="400-600만원">400-600만원</SelectItem>
                    <SelectItem value="600-800만원">600-800만원</SelectItem>
                    <SelectItem value="800만원이상">800만원 이상</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 결혼상태 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 block">
                  결혼상태
                </label>
                <Select value={formData.maritalStatus} onValueChange={(value) => setFormData(prev => ({ ...prev, maritalStatus: value }))}>
                  <SelectTrigger className="glass-input h-12 text-sm rounded-xl border-white/10 bg-white/5 text-white focus:ring-purple-500/50">
                    <SelectValue placeholder="결혼상태를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="미혼">미혼</SelectItem>
                    <SelectItem value="기혼">기혼</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>

            <div className="mt-6 px-5 pb-5">
              <Button
                onClick={handleSubmit}
                disabled={updateProfileMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest h-12 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 text-xs"
              >
                {updateProfileMutation.isPending ? (
                  <div className="flex items-center justify-center">
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    UPDATING...
                  </div>
                ) : (
                  "SAVE CHANGES"
                )}
              </Button>
            </div>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}