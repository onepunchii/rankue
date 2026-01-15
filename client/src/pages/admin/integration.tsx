import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, Clock, Settings, TestTube, Zap } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";

interface IntegrationLog {
  id: number;
  orderId: number;
  provider: string;
  status: string;
  method?: string;
  endpoint?: string;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  createdAt: string;
  responseTime?: number;
}

interface Stats {
  totalOrders?: number;
  pendingOrders?: number;
  approvedOrders?: number;
  activeProducts?: number;
}

export default function AdminIntegration() {
  const [testData, setTestData] = useState({
    orderId: "",
    providerSku: "",
    phone: "",
    name: "",
  });
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 최근 연동 로그 조회
  const { data: recentLogs = [], isLoading: logsLoading } = useQuery<IntegrationLog[]>({
    queryKey: [queryKeys.ADMIN_REWARDS_LOGS],
  });

  // 통계 조회
  const { data: stats = {} } = useQuery<Stats>({
    queryKey: [queryKeys.ADMIN_REWARDS_STATS],
  });

  // 테스트 연동 뮤테이션
  const testIntegrationMutation = useMutation({
    mutationFn: (data: any) => apiRequest(queryKeys.ADMIN_REWARDS_TEST, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: "테스트 성공", description: "연동이 정상적으로 작동합니다" });
      } else {
        toast({
          title: "테스트 실패",
          description: result.error || "알 수 없는 오류가 발생했습니다",
          variant: "destructive"
        });
      }
      queryClient.invalidateQueries({ queryKey: [queryKeys.ADMIN_REWARDS_LOGS] });
      setIsTestDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "테스트 실패", description: error.message, variant: "destructive" });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      success: { variant: "default" as const, text: "성공" },
      error: { variant: "destructive" as const, text: "오류" },
      pending: { variant: "secondary" as const, text: "대기" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { variant: "secondary" as const, text: status };
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const successRate = recentLogs.length > 0
    ? Math.round((recentLogs.filter((log: any) => log.status === 'success').length / recentLogs.length) * 100)
    : 0;

  if (logsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">로딩 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">외부 연동 관리</h1>
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                연동 테스트
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>연동 테스트</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orderId">주문 ID</Label>
                  <Input
                    id="orderId"
                    value={testData.orderId}
                    onChange={(e) => setTestData({ ...testData, orderId: e.target.value })}
                    placeholder="테스트용 주문 ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providerSku">상품 SKU</Label>
                  <Input
                    id="providerSku"
                    value={testData.providerSku}
                    onChange={(e) => setTestData({ ...testData, providerSku: e.target.value })}
                    placeholder="기프티쇼 상품 SKU"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">수신 번호</Label>
                  <Input
                    id="phone"
                    value={testData.phone}
                    onChange={(e) => setTestData({ ...testData, phone: e.target.value })}
                    placeholder="01012345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">수신자명</Label>
                  <Input
                    id="name"
                    value={testData.name}
                    onChange={(e) => setTestData({ ...testData, name: e.target.value })}
                    placeholder="홍길동"
                  />
                </div>
                <Button
                  onClick={() => testIntegrationMutation.mutate(testData)}
                  disabled={testIntegrationMutation.isPending}
                  className="w-full"
                >
                  {testIntegrationMutation.isPending ? "테스트 중..." : "테스트 실행"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 연동 상태 개요 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">연동 상태</p>
                  <p className="text-2xl font-bold flex items-center gap-2">
                    {successRate >= 90 ? (
                      <>
                        <CheckCircle className="h-6 w-6 text-green-500" />
                        정상
                      </>
                    ) : successRate >= 70 ? (
                      <>
                        <AlertCircle className="h-6 w-6 text-yellow-500" />
                        주의
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-6 w-6 text-red-500" />
                        오류
                      </>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">성공률</p>
                  <p className="text-2xl font-bold">{successRate}%</p>
                </div>
                <Zap className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">오늘 연동</p>
                  <p className="text-2xl font-bold">
                    {recentLogs.filter((log: any) => {
                      const today = new Date();
                      const logDate = new Date(log.createdAt);
                      return logDate.toDateString() === today.toDateString();
                    }).length}
                  </p>
                </div>
                <Settings className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">평균 응답시간</p>
                  <p className="text-2xl font-bold">
                    {recentLogs.length > 0
                      ? Math.round(recentLogs.reduce((sum: number, log: any) => sum + (log.responseTime || 0), 0) / recentLogs.length)
                      : 0
                    }ms
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="status" className="space-y-4">
          <TabsList>
            <TabsTrigger value="status">연동 상태</TabsTrigger>
            <TabsTrigger value="config">설정 관리</TabsTrigger>
            <TabsTrigger value="history">연동 기록</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>KT 기프티쇼 연동</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">연결 상태</span>
                      <Badge variant={successRate >= 90 ? "default" : "destructive"}>
                        {successRate >= 90 ? "정상" : "오류"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">API 버전</span>
                      <span className="text-sm text-muted-foreground">v2.0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">마지막 연동</span>
                      <span className="text-sm text-muted-foreground">
                        {recentLogs.length > 0
                          ? formatDistanceToNow(new Date(recentLogs[0].createdAt), { addSuffix: true, locale: ko })
                          : "없음"
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">환경</span>
                      <span className="text-sm text-muted-foreground">Production</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>최근 연동 활동</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentLogs.slice(0, 5).map((log: any) => (
                      <div key={log.id} className="flex items-center gap-3">
                        {getStatusIcon(log.status)}
                        <div className="flex-1">
                          <p className="text-sm font-medium">주문 #{log.orderId}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ko })}
                          </p>
                        </div>
                        {getStatusBadge(log.status)}
                      </div>
                    ))}
                    {recentLogs.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        최근 연동 활동이 없습니다.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>연동 설정</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">KT 기프티쇼 API 설정</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>API 엔드포인트</Label>
                        <Input
                          value="https://api.giftishow.com"
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>타임아웃 (초)</Label>
                        <Input
                          value="30"
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>재시도 횟수</Label>
                        <Input
                          value="3"
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>재시도 간격 (초)</Label>
                        <Input
                          value="5"
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">알림 설정</h3>
                    <div className="space-y-2">
                      <Label>오류 알림 이메일</Label>
                      <Input
                        placeholder="admin@polli.com"
                        className="bg-gray-50"
                        disabled
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      * 연동 설정은 환경 변수를 통해 관리됩니다. 변경이 필요한 경우 개발팀에 문의하세요.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>연동 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentLogs.map((log: any) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(log.status)}
                            <span className="font-medium">주문 #{log.orderId}</span>
                            <Badge variant="outline">{log.provider}</Badge>
                          </div>
                          {log.endpoint && (
                            <p className="text-sm text-muted-foreground">
                              {log.method} {log.endpoint}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ko })}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {log.responseTime || 0}ms
                        </div>
                      </div>

                      {log.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                          <p className="text-sm text-red-600 font-medium">오류:</p>
                          <p className="text-sm text-red-700">{log.error}</p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {recentLogs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      연동 기록이 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}