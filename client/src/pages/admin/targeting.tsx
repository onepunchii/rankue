import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export function AdminTargeting() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetType: 'age',
    targetValue: '',
    surveyId: '',
    active: true
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["/api/admin/targeting-campaigns"],
    queryFn: () => adminFetch("/api/admin/targeting-campaigns"),
  });

  const { data: surveys } = useQuery({
    queryKey: ["/api/admin/surveys-list"],
    queryFn: () => adminFetch("/api/admin/surveys-list"),
  });

  const createCampaign = useMutation({
    mutationFn: (data: any) => adminFetch("/api/admin/targeting-campaigns", {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "타겟 캠페인이 생성되었습니다." });
      setShowCreateForm(false);
      setFormData({ title: '', description: '', targetType: 'age', targetValue: '', surveyId: '', active: true });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targeting-campaigns"] });
    },
    onError: () => {
      toast({ title: "오류", description: "캠페인 생성에 실패했습니다.", variant: "destructive" });
    }
  });

  const toggleCampaign = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => 
      adminFetch(`/api/admin/targeting-campaigns/${id}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ active })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targeting-campaigns"] });
    }
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: number) => adminFetch(`/api/admin/targeting-campaigns/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "캠페인이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targeting-campaigns"] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(formData);
  };

  const getTargetTypeLabel = (type: string) => {
    switch (type) {
      case 'age': return '연령대';
      case 'gender': return '성별';
      case 'region': return '지역';
      case 'level': return '레벨';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">타겟 캠페인 데이터를 불러오는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">타겟 설문</h1>
            <p className="text-gray-600">특정 사용자 그룹을 대상으로 한 설문 캠페인 관리</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <i className="fas fa-plus mr-2"></i>
            새 캠페인 생성
          </Button>
        </div>

        {/* 캠페인 생성 폼 */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>새 타겟 캠페인 생성</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">캠페인 이름</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="예: 20대 대상 라이프스타일 설문"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">대상 설문</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.surveyId}
                      onChange={(e) => setFormData({ ...formData, surveyId: e.target.value })}
                      required
                    >
                      <option value="">설문 선택</option>
                      {surveys?.map((survey: any) => (
                        <option key={survey.id} value={survey.id}>
                          {survey.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">설명</label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="캠페인 목적과 타겟 대상을 설명해주세요"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">타겟 유형</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.targetType}
                      onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
                    >
                      <option value="age">연령대</option>
                      <option value="gender">성별</option>
                      <option value="region">지역</option>
                      <option value="level">레벨</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">타겟 값</label>
                    <Input
                      value={formData.targetValue}
                      onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                      placeholder="예: 20-29, male, 서울, 5+"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={createCampaign.isPending}>
                    {createCampaign.isPending ? '생성 중...' : '캠페인 생성'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 캠페인 목록 */}
        <div className="grid gap-4">
          {campaigns?.length > 0 ? (
            campaigns.map((campaign: any) => (
              <Card key={campaign.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{campaign.title}</h3>
                        <Badge variant={campaign.active ? "default" : "secondary"}>
                          {campaign.active ? '활성' : '비활성'}
                        </Badge>
                        <Badge variant="outline">
                          {getTargetTypeLabel(campaign.targetType)}: {campaign.targetValue}
                        </Badge>
                      </div>
                      
                      <p className="text-gray-600 mb-4">{campaign.description}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">대상 사용자</p>
                          <p className="font-semibold">{campaign.targetUserCount || 0}명</p>
                        </div>
                        <div>
                          <p className="text-gray-500">도달률</p>
                          <p className="font-semibold">{campaign.reachRate || 0}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500">참여율</p>
                          <p className="font-semibold">{campaign.participationRate || 0}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500">생성일</p>
                          <p className="font-semibold">
                            {new Date(campaign.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleCampaign.mutate({ 
                          id: campaign.id, 
                          active: !campaign.active 
                        })}
                      >
                        <i className={`fas ${campaign.active ? 'fa-pause' : 'fa-play'} mr-1`}></i>
                        {campaign.active ? '일시중지' : '활성화'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm('정말로 이 캠페인을 삭제하시겠습니까?')) {
                            deleteCampaign.mutate(campaign.id);
                          }
                        }}
                      >
                        <i className="fas fa-trash mr-1"></i>
                        삭제
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <i className="fas fa-bullseye text-gray-400 text-4xl mb-4"></i>
                <p className="text-gray-500 mb-4">생성된 타겟 캠페인이 없습니다.</p>
                <Button onClick={() => setShowCreateForm(true)}>
                  첫 번째 캠페인 만들기
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}