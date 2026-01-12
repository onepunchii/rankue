import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { motion } from "framer-motion";

export default function AdminRewards() {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    pointCost: 0,
    categoryId: "coupon",
    providerSku: "",
    sortOrder: 0,
    isActive: true,
  });
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 상품 목록 조회
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["/api/admin/rewards/products"],
  });

  // 주문 목록 조회
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/admin/rewards/orders"],
  });

  // 통계 조회
  const { data: stats = {} } = useQuery({
    queryKey: ["/api/admin/rewards/stats"],
  });

  // 상품 생성 뮤테이션
  const createProductMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/admin/rewards/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "상품이 생성되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/products"] });
      setIsProductDialogOpen(false);
      setNewProduct({
        name: "",
        description: "",
        pointCost: 0,
        categoryId: "coupon",
        providerSku: "",
        sortOrder: 0,
        isActive: true,
      });
    },
    onError: (error: Error) => {
      toast({ title: "상품 생성 실패", description: error.message, variant: "destructive" });
    },
  });

  // 주문 승인 뮤테이션
  const approveOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest(`/api/admin/rewards/orders/${orderId}/approve`, {
      method: "POST",
    }),
    onSuccess: () => {
      toast({ title: "주문이 승인되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/orders"] });
    },
    onError: (error: Error) => {
      toast({ title: "주문 승인 실패", description: error.message, variant: "destructive" });
    },
  });

  // 주문 거절 뮤테이션
  const rejectOrderMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: number; reason: string }) => 
      apiRequest(`/api/admin/rewards/orders/${orderId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({ title: "주문이 거절되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/orders"] });
    },
    onError: (error: Error) => {
      toast({ title: "주문 거절 실패", description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "secondary" as const, text: "대기중" },
      approved: { variant: "default" as const, text: "승인됨" },
      issued: { variant: "default" as const, text: "발행완료" },
      rejected: { variant: "destructive" as const, text: "거절됨" },
      failed: { variant: "destructive" as const, text: "실패" },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || { variant: "secondary" as const, text: status };
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const handleRejectOrder = (orderId: number) => {
    const reason = prompt("거절 사유를 입력해주세요:");
    if (reason) {
      rejectOrderMutation.mutate({ orderId, reason });
    }
  };

  if (productsLoading || ordersLoading) {
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
          <h1 className="text-3xl font-bold">리워드 관리</h1>
          <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogTrigger asChild>
              <Button>새 상품 추가</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>새 상품 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">상품명</Label>
                  <Input
                    id="name"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    placeholder="상품명을 입력하세요"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">설명</Label>
                  <Textarea
                    id="description"
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                    placeholder="상품 설명을 입력하세요"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pointCost">포인트 가격</Label>
                  <Input
                    id="pointCost"
                    type="number"
                    value={newProduct.pointCost}
                    onChange={(e) => setNewProduct({ ...newProduct, pointCost: parseInt(e.target.value) })}
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providerSku">제공업체 SKU</Label>
                  <Input
                    id="providerSku"
                    value={newProduct.providerSku}
                    onChange={(e) => setNewProduct({ ...newProduct, providerSku: e.target.value })}
                    placeholder="SKU 코드를 입력하세요"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={newProduct.isActive}
                    onCheckedChange={(checked) => setNewProduct({ ...newProduct, isActive: checked })}
                  />
                  <Label htmlFor="isActive">활성화</Label>
                </div>
                <Button 
                  onClick={() => createProductMutation.mutate(newProduct)}
                  disabled={createProductMutation.isPending}
                  className="w-full"
                >
                  {createProductMutation.isPending ? "생성 중..." : "상품 생성"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">전체 주문</p>
                  <p className="text-2xl font-bold">{stats.totalOrders || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">대기 중</p>
                  <p className="text-2xl font-bold">{stats.pendingOrders || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">승인됨</p>
                  <p className="text-2xl font-bold">{stats.approvedOrders || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">활성 상품</p>
                  <p className="text-2xl font-bold">{stats.activeProducts || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">주문 관리</TabsTrigger>
            <TabsTrigger value="products">상품 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>주문 목록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {orders.map((order: any) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">주문 #{order.id}</span>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {order.product?.name} • {order.pointCost}P
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {order.user?.name} ({order.user?.email})
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: ko })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {order.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => approveOrderMutation.mutate(order.id)}
                                disabled={approveOrderMutation.isPending}
                              >
                                승인
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectOrder(order.id)}
                                disabled={rejectOrderMutation.isPending}
                              >
                                거절
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {order.recipientPhone && (
                        <p className="text-sm">수신: {order.recipientPhone}</p>
                      )}
                      {order.failReason && (
                        <p className="text-sm text-red-600">실패 사유: {order.failReason}</p>
                      )}
                    </motion.div>
                  ))}
                  {orders.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      주문이 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle>상품 목록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {products.map((product: any) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.name}</span>
                            <Badge variant={product.isActive ? "default" : "secondary"}>
                              {product.isActive ? "활성" : "비활성"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                          <p className="text-sm font-medium">{product.pointCost}P</p>
                          <p className="text-xs text-muted-foreground">SKU: {product.providerSku}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {products.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      상품이 없습니다.
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