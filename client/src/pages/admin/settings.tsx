import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const adminFetch = async (url: string, options?: any) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  return response.json();
};

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/admin/settings"],
    queryFn: () => adminFetch("/api/admin/settings"),
  });

  const { data: systemInfo } = useQuery({
    queryKey: ["/api/admin/system-info"],
    queryFn: () => adminFetch("/api/admin/system-info"),
  });

  const updateSettings = useMutation({
    mutationFn: (data: any) => adminFetch("/api/admin/settings", {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "설정이 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: () => {
      toast({ title: "오류", description: "설정 저장에 실패했습니다.", variant: "destructive" });
    }
  });

  const resetSettings = useMutation({
    mutationFn: () => adminFetch("/api/admin/settings/reset", { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "성공", description: "설정이 초기화되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    }
  });

  const clearCache = useMutation({
    mutationFn: () => adminFetch("/api/admin/cache/clear", { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "성공", description: "캐시가 삭제되었습니다." });
    }
  });

  const updateActivitySample = useMutation({
    mutationFn: () => fetch("/api/assembly/update-activity-sample", { 
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),
    onSuccess: (data) => {
      toast({ 
        title: "성공", 
        description: `샘플 활동지수 업데이트 완료 (${data.updatedMembers}명)` 
      });
    },
    onError: () => {
      toast({ 
        title: "오류", 
        description: "활동지수 업데이트 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const updateActivityAll = useMutation({
    mutationFn: () => fetch("/api/assembly/update-activity-all", { 
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),
    onSuccess: (data) => {
      toast({ 
        title: "성공", 
        description: `전체 활동지수 업데이트 완료 (${data.updatedMembers}명)` 
      });
    },
    onError: () => {
      toast({ 
        title: "오류", 
        description: "전체 활동지수 업데이트 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const handleSaveSettings = (formData: any) => {
    updateSettings.mutate(formData);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">설정을 불러오는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">설정</h1>
            <p className="text-gray-600">플랫폼 전체 설정 및 시스템 관리</p>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <Card>
          <CardContent className="p-0">
            <div className="flex border-b">
              {[
                { id: 'general', label: '일반 설정', icon: 'fas fa-cog' },
                { id: 'survey', label: '설문 설정', icon: 'fas fa-poll' },
                { id: 'user', label: '사용자 설정', icon: 'fas fa-users' },
                { id: 'system', label: '시스템 정보', icon: 'fas fa-server' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <i className={`${tab.icon} mr-2`}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 일반 설정 */}
        {activeTab === 'general' && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>플랫폼 기본 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">플랫폼 이름</label>
                    <Input
                      defaultValue={settings?.platformName || "Polli"}
                      placeholder="플랫폼 이름"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">관리자 이메일</label>
                    <Input
                      defaultValue={settings?.adminEmail || "admin@polli.co.kr"}
                      placeholder="관리자 이메일"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">플랫폼 설명</label>
                  <Textarea
                    defaultValue={settings?.platformDescription || "블록체인 기반 설문조사 플랫폼"}
                    placeholder="플랫폼 설명"
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">점검 모드</h4>
                    <p className="text-sm text-gray-600">점검 모드 활성화 시 일반 사용자 접근 차단</p>
                  </div>
                  <Switch
                    checked={settings?.maintenanceMode || false}
                    onCheckedChange={(checked) => {
                      handleSaveSettings({ maintenanceMode: checked });
                    }}
                  />
                </div>

                <Button onClick={() => handleSaveSettings({})}>
                  일반 설정 저장
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 설문 설정 */}
        {activeTab === 'survey' && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>설문 관련 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">기본 설문 포인트</label>
                    <Input
                      type="number"
                      defaultValue={settings?.defaultSurveyPoints || 10}
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">최대 설문 길이 (문항 수)</label>
                    <Input
                      type="number"
                      defaultValue={settings?.maxSurveyQuestions || 20}
                      placeholder="20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">설문 만료 기간 (일)</label>
                    <Input
                      type="number"
                      defaultValue={settings?.surveyExpiryDays || 30}
                      placeholder="30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">최소 응답자 수</label>
                    <Input
                      type="number"
                      defaultValue={settings?.minResponses || 10}
                      placeholder="10"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">자동 설문 생성</h4>
                      <p className="text-sm text-gray-600">AI 기반 자동 설문 생성 기능</p>
                    </div>
                    <Switch
                      checked={settings?.autoSurveyGeneration || true}
                      onCheckedChange={(checked) => {
                        handleSaveSettings({ autoSurveyGeneration: checked });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">설문 승인 필요</h4>
                      <p className="text-sm text-gray-600">사용자 생성 설문 사전 승인</p>
                    </div>
                    <Switch
                      checked={settings?.requireSurveyApproval || false}
                      onCheckedChange={(checked) => {
                        handleSaveSettings({ requireSurveyApproval: checked });
                      }}
                    />
                  </div>
                </div>

                <Button>설문 설정 저장</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 사용자 설정 */}
        {activeTab === 'user' && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>사용자 관련 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">신규 사용자 포인트</label>
                    <Input
                      type="number"
                      defaultValue={settings?.newUserPoints || 100}
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">일일 참여 제한</label>
                    <Input
                      type="number"
                      defaultValue={settings?.dailyParticipationLimit || 10}
                      placeholder="10"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">이메일 인증 필수</h4>
                      <p className="text-sm text-gray-600">가입 시 이메일 인증 필수</p>
                    </div>
                    <Switch
                      checked={settings?.requireEmailVerification || true}
                      onCheckedChange={(checked) => {
                        handleSaveSettings({ requireEmailVerification: checked });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">게스트 참여 허용</h4>
                      <p className="text-sm text-gray-600">비회원 설문 참여 허용</p>
                    </div>
                    <Switch
                      checked={settings?.allowGuestParticipation || true}
                      onCheckedChange={(checked) => {
                        handleSaveSettings({ allowGuestParticipation: checked });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">자동 어뷰징 차단</h4>
                      <p className="text-sm text-gray-600">의심스러운 활동 자동 차단</p>
                    </div>
                    <Switch
                      checked={settings?.autoAbuseBlocking || true}
                      onCheckedChange={(checked) => {
                        handleSaveSettings({ autoAbuseBlocking: checked });
                      }}
                    />
                  </div>
                </div>

                <Button>사용자 설정 저장</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 시스템 정보 */}
        {activeTab === 'system' && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>시스템 정보</CardTitle>
              </CardHeader>
              <CardContent>
                {systemInfo && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">서버 정보</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Node.js 버전:</span>
                          <span className="font-mono">{systemInfo.nodeVersion}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>서버 시작 시간:</span>
                          <span>{new Date(systemInfo.serverStartTime).toLocaleString('ko-KR')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>업타임:</span>
                          <span>{systemInfo.uptime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>메모리 사용량:</span>
                          <span>{systemInfo.memoryUsage}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">데이터베이스 정보</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>연결 상태:</span>
                          <span className="text-green-600">정상</span>
                        </div>
                        <div className="flex justify-between">
                          <span>총 테이블:</span>
                          <span>{systemInfo.tableCount || 0}개</span>
                        </div>
                        <div className="flex justify-between">
                          <span>총 레코드:</span>
                          <span>{systemInfo.totalRecords?.toLocaleString() || 0}개</span>
                        </div>
                        <div className="flex justify-between">
                          <span>DB 크기:</span>
                          <span>{systemInfo.dbSize || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>시스템 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    onClick={() => clearCache.mutate()}
                    disabled={clearCache.isPending}
                  >
                    <i className="fas fa-trash mr-2"></i>
                    캐시 삭제
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => updateActivitySample.mutate()}
                    disabled={updateActivitySample.isPending}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <i className="fas fa-chart-line mr-2"></i>
                    {updateActivitySample.isPending ? '업데이트 중...' : '활동지수 테스트 (10명)'}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => updateActivityAll.mutate()}
                    disabled={updateActivityAll.isPending}
                    className="text-green-600 hover:text-green-700"
                  >
                    <i className="fas fa-users mr-2"></i>
                    {updateActivityAll.isPending ? '업데이트 중...' : '전체 활동지수 업데이트'}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm('정말로 설정을 초기화하시겠습니까?')) {
                        resetSettings.mutate();
                      }
                    }}
                    disabled={resetSettings.isPending}
                  >
                    <i className="fas fa-undo mr-2"></i>
                    설정 초기화
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => window.open('/api/admin/logs', '_blank')}
                  >
                    <i className="fas fa-file-alt mr-2"></i>
                    로그 보기
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}