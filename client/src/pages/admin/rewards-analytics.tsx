import { AdminLayout } from "@/components/admin/AdminLayout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { motion } from "framer-motion";
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

export default function AdminRewardsAnalytics() {
  // 연동 로그 조회
  const { data: logs = [], isLoading: logsLoading } = useQuery<IntegrationLog[]>({
    queryKey: [queryKeys.ADMIN_REWARDS_LOGS],
  });

  // 통계 조회
  const { data: stats = {} } = useQuery<Stats>({
    queryKey: [queryKeys.ADMIN_REWARDS_STATS],
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      success: { variant: "default" as const, text: "성공" },
      error: { variant: "destructive" as const, text: "오류" },
      pending: { variant: "secondary" as const, text: "대기" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { variant: "secondary" as const, text: status };
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

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
          <h1 className="text-3xl font-bold">연동 로그 & 분석</h1>
        </div>

        {/* 통계 개요 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">총 연동 시도</p>
                  <p className="text-2xl font-bold">{logs.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">성공률</p>
                  <p className="text-2xl font-bold">
                    {logs.length > 0
                      ? Math.round((logs.filter((log: any) => log.status === 'success').length / logs.length) * 100)
                      : 0
                    }%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">최근 오류</p>
                  <p className="text-2xl font-bold">
                    {logs.filter((log: any) => log.status === 'error').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs">연동 로그</TabsTrigger>
            <TabsTrigger value="errors">오류 분석</TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>최근 연동 로그</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {logs.map((log: any) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">주문 #{log.orderId}</span>
                            {getStatusBadge(log.status)}
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
                          응답시간: {log.responseTime || 0}ms
                        </div>
                      </div>

                      {log.requestBody && (
                        <details className="mt-2">
                          <summary className="text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                            요청 데이터 보기
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                            {typeof log.requestBody === 'string'
                              ? log.requestBody
                              : JSON.stringify(log.requestBody, null, 2)
                            }
                          </pre>
                        </details>
                      )}

                      {log.responseBody && (
                        <details className="mt-2">
                          <summary className="text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                            응답 데이터 보기
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                            {typeof log.responseBody === 'string'
                              ? log.responseBody
                              : JSON.stringify(log.responseBody, null, 2)
                            }
                          </pre>
                        </details>
                      )}

                      {log.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                          <p className="text-sm text-red-600 font-medium">오류:</p>
                          <p className="text-sm text-red-700">{log.error}</p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {logs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      연동 로그가 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors">
            <Card>
              <CardHeader>
                <CardTitle>오류 분석</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {logs
                    .filter((log: any) => log.status === 'error')
                    .map((log: any) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-red-200 rounded-lg p-4 space-y-2 bg-red-50"
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-red-800">주문 #{log.orderId}</span>
                              <Badge variant="destructive">{log.provider}</Badge>
                            </div>
                            {log.endpoint && (
                              <p className="text-sm text-red-700">
                                {log.method} {log.endpoint}
                              </p>
                            )}
                            <p className="text-xs text-red-600">
                              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ko })}
                            </p>
                          </div>
                        </div>

                        {log.error && (
                          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
                            <p className="text-sm text-red-800 font-medium">오류 메시지:</p>
                            <p className="text-sm text-red-900">{log.error}</p>
                          </div>
                        )}

                        {log.responseBody && (
                          <details className="mt-2">
                            <summary className="text-sm cursor-pointer text-red-700 hover:text-red-900">
                              상세 응답 보기
                            </summary>
                            <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto">
                              {typeof log.responseBody === 'string'
                                ? log.responseBody
                                : JSON.stringify(log.responseBody, null, 2)
                              }
                            </pre>
                          </details>
                        )}
                      </motion.div>
                    ))}
                  {logs.filter((log: any) => log.status === 'error').length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      오류가 없습니다.
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