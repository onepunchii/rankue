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

export function AdminNotifications() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'general',
    targetType: 'all',
    targetValue: '',
    scheduledAt: '',
    immediate: true
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["/api/admin/notifications"],
    queryFn: () => adminFetch("/api/admin/notifications"),
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/admin/notification-stats"],
    queryFn: () => adminFetch("/api/admin/notification-stats"),
  });

  const createNotification = useMutation({
    mutationFn: (data: any) => adminFetch("/api/admin/notifications", {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "알림이 생성되었습니다." });
      setShowCreateForm(false);
      setFormData({
        title: '', message: '', type: 'general', targetType: 'all', 
        targetValue: '', scheduledAt: '', immediate: true
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
    },
    onError: () => {
      toast({ title: "오류", description: "알림 생성에 실패했습니다.", variant: "destructive" });
    }
  });

  const sendTestNotification = useMutation({
    mutationFn: (data: any) => adminFetch("/api/admin/notifications/test", {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "테스트 알림이 전송되었습니다." });
    }
  });

  const deleteNotification = useMutation({
    mutationFn: (id: number) => adminFetch(`/api/admin/notifications/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "알림이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createNotification.mutate(formData);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'general': return '일반';
      case 'survey': return '설문';
      case 'event': return '이벤트';
      case 'system': return '시스템';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'general': return 'bg-blue-100 text-blue-800';
      case 'survey': return 'bg-green-100 text-green-800';
      case 'event': return 'bg-purple-100 text-purple-800';
      case 'system': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">알림 데이터를 불러오는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">푸시 알림</h1>
            <p className="text-gray-600">사용자 알림 생성 및 관리</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <i className="fas fa-plus mr-2"></i>
            새 알림 생성
          </Button>
        </div>

        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-bell text-blue-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">총 알림 수</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {stats.totalNotifications?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-paper-plane text-green-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">전송 성공</p>
                    <p className="text-2xl font-bold text-green-600">
                      {stats.sentNotifications?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-clock text-yellow-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">예약 대기</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {stats.scheduledNotifications?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-percentage text-purple-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">열람률</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {stats.openRate?.toFixed(1) || '0.0'}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 알림 생성 폼 */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>새 푸시 알림 생성</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">제목</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="알림 제목을 입력하세요"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">알림 유형</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="general">일반</option>
                      <option value="survey">설문</option>
                      <option value="event">이벤트</option>
                      <option value="system">시스템</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">메시지</label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="알림 메시지를 입력하세요"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">대상 유형</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.targetType}
                      onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
                    >
                      <option value="all">전체 사용자</option>
                      <option value="age">연령대</option>
                      <option value="gender">성별</option>
                      <option value="region">지역</option>
                      <option value="level">레벨</option>
                    </select>
                  </div>
                  {formData.targetType !== 'all' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">대상 값</label>
                      <Input
                        value={formData.targetValue}
                        onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                        placeholder="예: 20-29, male, 서울, 5+"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.immediate}
                      onChange={(e) => setFormData({ ...formData, immediate: e.target.checked })}
                      className="mr-2"
                    />
                    즉시 전송
                  </label>
                  {!formData.immediate && (
                    <Input
                      type="datetime-local"
                      value={formData.scheduledAt}
                      onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                      className="w-auto"
                    />
                  )}
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={createNotification.isPending}>
                    {createNotification.isPending ? '생성 중...' : '알림 생성'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sendTestNotification.mutate(formData)}
                    disabled={sendTestNotification.isPending}
                  >
                    테스트 전송
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 알림 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>알림 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications?.length > 0 ? (
              <div className="space-y-4">
                {notifications.map((notification: any) => (
                  <div key={notification.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-gray-900">{notification.title}</h3>
                          <Badge className={getTypeColor(notification.type)}>
                            {getTypeLabel(notification.type)}
                          </Badge>
                          <Badge className={getStatusColor(notification.status)}>
                            {notification.status === 'sent' ? '전송완료' : 
                             notification.status === 'scheduled' ? '예약중' : 
                             notification.status === 'failed' ? '실패' : notification.status}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3">{notification.message}</p>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>
                            <i className="fas fa-users mr-1"></i>
                            대상: {notification.targetType === 'all' ? '전체' : `${notification.targetType} ${notification.targetValue}`}
                          </span>
                          <span>
                            <i className="fas fa-eye mr-1"></i>
                            열람: {notification.openCount || 0}명
                          </span>
                          <span>
                            <i className="fas fa-calendar mr-1"></i>
                            생성: {new Date(notification.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                          {notification.scheduledAt && (
                            <span>
                              <i className="fas fa-clock mr-1"></i>
                              예약: {new Date(notification.scheduledAt).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm('정말로 이 알림을 삭제하시겠습니까?')) {
                              deleteNotification.mutate(notification.id);
                            }
                          }}
                        >
                          <i className="fas fa-trash mr-1"></i>
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <i className="fas fa-bell text-gray-400 text-4xl mb-4"></i>
                <p className="text-gray-500">생성된 알림이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}