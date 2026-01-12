import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const adminFetch = async (url: string, options?: any) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  return response.json();
};

export function AdminAbuseDetection() {
  const [selectedTimeRange, setSelectedTimeRange] = useState("7d");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

  // 어뷰징 탐지 통계 조회
  const { data: abuseStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/abuse/stats", selectedTimeRange],
    queryFn: () => adminFetch(`/api/admin/abuse/stats?timeRange=${selectedTimeRange}`),
  });

  // 어뷰징 알람 목록 조회
  const { data: abuseAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["/api/admin/abuse/alerts"],
    queryFn: () => adminFetch("/api/admin/abuse/alerts"),
  });

  // 사용자별 어뷰징 패턴 조회
  const { data: userPatterns, isLoading: patternsLoading } = useQuery({
    queryKey: ["/api/admin/abuse/user-patterns", selectedUserId],
    queryFn: () => adminFetch(`/api/admin/abuse/user-patterns${selectedUserId ? `?userId=${selectedUserId}` : ''}`),
    enabled: !!selectedUserId,
  });

  // 리워드샵 주문 통계
  const { data: rewardStats, isLoading: rewardStatsLoading } = useQuery({
    queryKey: ["/api/admin/rewards/stats", selectedTimeRange],
    queryFn: () => adminFetch(`/api/admin/rewards/stats?timeRange=${selectedTimeRange}`),
  });

  // 알람 처리 뮤테이션
  const resolveAlert = useMutation({
    mutationFn: ({ alertId, action }: { alertId: string; action: 'resolve' | 'ignore' }) => 
      adminFetch(`/api/admin/abuse/alerts/${alertId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "성공", description: "알람이 처리되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/abuse/alerts"] });
    }
  });

  // 사용자 정지 뮤테이션
  const suspendUser = useMutation({
    mutationFn: ({ userId, reason, duration }: { userId: string; reason: string; duration: string }) => 
      adminFetch(`/api/admin/abuse/suspend-user`, {
        method: 'POST',
        body: JSON.stringify({ userId, reason, duration })
      }),
    onSuccess: () => {
      toast({ title: "성공", description: "사용자가 정지되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/abuse/alerts"] });
    }
  });

  const toggleAlertExpansion = (alertId: string) => {
    setExpandedAlerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'critical': return '긴급';
      case 'high': return '높음';
      case 'medium': return '보통';
      case 'low': return '낮음';
      default: return '알 수 없음';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">어뷰징 탐지</h1>
            <p className="text-gray-600">리워드샵 및 설문 어뷰징 패턴을 실시간으로 모니터링합니다</p>
          </div>
          <div className="flex gap-2">
            <select 
              value={selectedTimeRange} 
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="1d">최근 1일</option>
              <option value="7d">최근 7일</option>
              <option value="30d">최근 30일</option>
              <option value="90d">최근 90일</option>
            </select>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">활성 알람</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {abuseStats?.activeAlerts || 0}
              </div>
              <p className="text-sm text-gray-500">처리 대기 중</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">의심 계정</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {abuseStats?.suspiciousAccounts || 0}
              </div>
              <p className="text-sm text-gray-500">모니터링 중</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">차단된 IP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-700">
                {abuseStats?.blockedIPs || 0}
              </div>
              <p className="text-sm text-gray-500">자동 차단</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">차단 방지율</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {abuseStats?.preventionRate || 0}%
              </div>
              <p className="text-sm text-gray-500">예상 손실 방지</p>
            </CardContent>
          </Card>
        </div>

        {/* 리워드샵 통계 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>리워드샵 주문 추이</CardTitle>
            </CardHeader>
            <CardContent>
              {rewardStatsLoading ? (
                <div className="h-64 flex items-center justify-center">로딩 중...</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={rewardStats?.orderTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="suspicious" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>어뷰징 패턴 분포</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-64 flex items-center justify-center">로딩 중...</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={abuseStats?.patternDistribution || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {(abuseStats?.patternDistribution || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 실시간 알람 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <i className="fas fa-exclamation-triangle text-red-500"></i>
              실시간 어뷰징 알람
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : abuseAlerts?.length > 0 ? (
              <div className="space-y-3">
                {abuseAlerts.map((alert: any) => {
                  const isExpanded = expandedAlerts.has(alert.id);
                  return (
                    <div key={alert.id} className="border rounded-lg bg-white">
                      <div 
                        className="p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleAlertExpansion(alert.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400`}></i>
                            <Badge className={getSeverityColor(alert.severity)}>
                              {getSeverityText(alert.severity)}
                            </Badge>
                            <h3 className="font-medium text-gray-900">{alert.title}</h3>
                            <span className="text-sm text-gray-600">
                              사용자: {alert.userId}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(alert.createdAt).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t bg-gray-50/50">
                          <div className="pt-4 space-y-4">
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">상세 정보</h4>
                              <p className="text-sm text-gray-700">{alert.description}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">패턴 유형:</span>
                                <span className="ml-2 font-medium">{alert.pattern}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">위험도 점수:</span>
                                <span className="ml-2 font-medium text-red-600">{alert.riskScore}/100</span>
                              </div>
                              <div>
                                <span className="text-gray-500">IP 주소:</span>
                                <span className="ml-2 font-mono">{alert.ipAddress}</span>
                              </div>
                            </div>

                            {alert.evidences && alert.evidences.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">증거 자료</h4>
                                <div className="bg-gray-100 p-3 rounded text-sm">
                                  <ul className="space-y-1">
                                    {alert.evidences.map((evidence: string, index: number) => (
                                      <li key={index} className="flex items-start gap-2">
                                        <i className="fas fa-circle text-xs text-gray-400 mt-1.5"></i>
                                        <span>{evidence}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resolveAlert.mutate({ alertId: alert.id, action: 'resolve' });
                                }}
                              >
                                <i className="fas fa-check mr-2"></i>
                                해결
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resolveAlert.mutate({ alertId: alert.id, action: 'ignore' });
                                }}
                              >
                                <i className="fas fa-times mr-2"></i>
                                무시
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const reason = prompt('정지 사유를 입력하세요:');
                                  if (reason) {
                                    suspendUser.mutate({ 
                                      userId: alert.userId, 
                                      reason, 
                                      duration: '30d' 
                                    });
                                  }
                                }}
                              >
                                <i className="fas fa-ban mr-2"></i>
                                사용자 정지
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <i className="fas fa-shield-alt text-green-500 text-4xl mb-4"></i>
                <p>현재 활성 알람이 없습니다. 시스템이 정상적으로 작동 중입니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 사용자 패턴 분석 */}
        <Card>
          <CardHeader>
            <CardTitle>사용자 패턴 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="사용자 ID를 입력하세요"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="max-w-md"
              />
            </div>

            {selectedUserId && userPatterns && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">활동 패턴</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={userPatterns.activityPattern || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="activity" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">위험 지표</h4>
                  <div className="space-y-3">
                    {userPatterns.riskIndicators?.map((indicator: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm font-medium">{indicator.name}</span>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 rounded text-xs ${
                            indicator.level === 'high' ? 'bg-red-100 text-red-800' :
                            indicator.level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {indicator.level === 'high' ? '높음' : 
                             indicator.level === 'medium' ? '보통' : '낮음'}
                          </div>
                          <span className="text-sm text-gray-600">{indicator.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}