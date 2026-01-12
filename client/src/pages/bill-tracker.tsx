import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PartyLogo from "@/components/PartyLogo";
import ProposerWithParty from "@/components/ProposerWithParty";

export default function BillTracker() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // 발의법률안 데이터 가져오기
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["/api/assembly/bills"],
    queryFn: async () => {
      const response = await fetch("/api/assembly/bills", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch bills");
      return response.json();
    }
  });

  // 검색 및 필터링
  const filteredBills = bills.filter((bill: any) => {
    const matchesSearch = bill.title?.includes(searchQuery) || 
                         bill.proposer?.includes(searchQuery) ||
                         bill.committee?.includes(searchQuery);
    
    const matchesStatus = selectedStatus === "all" || bill.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  // 상태별 색상 매핑
  const getStatusColor = (status: string) => {
    const colors = {
      "발의": "bg-blue-100 text-blue-700 border-blue-200",
      "심사중": "bg-yellow-100 text-yellow-700 border-yellow-200", 
      "통과": "bg-green-100 text-green-700 border-green-200",
      "부결": "bg-red-100 text-red-700 border-red-200",
      "폐기": "bg-gray-100 text-gray-700 border-gray-200"
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-indigo-900/20">
      <SEOHead 
        title="법안 추적 - 국회 발의법률안 현황"
        description="국회에서 발의된 법률안의 진행 상황을 실시간으로 추적하고 검색해보세요. 심사 현황과 통과율을 한눈에 확인할 수 있습니다."
      />
      
      <MobileHeader />
      
      <div className="pt-16 pb-20">
        {/* Header Section */}
        <section className="px-4 pb-6">
          <div className="glass-card-strong p-6 relative overflow-hidden bg-gradient-to-br from-purple-500/10 to-indigo-500/10 backdrop-blur-md border border-purple-200/30">
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full transform translate-x-8 -translate-y-8"></div>
            
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                  <i className="fas fa-search text-white text-lg"></i>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800 dark:text-white">법안 추적</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">국회 발의법률안 현황</p>
                </div>
              </div>
              <Button 
                onClick={() => setLocation('/')}
                variant="ghost"
                className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                <i className="fas fa-home mr-2"></i>
                홈으로
              </Button>
            </div>

            {/* Search and Filter Section */}
            <div className="space-y-4 relative z-10">
              <div>
                <Label htmlFor="search" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  법안명, 발의자, 소관위원회 검색
                </Label>
                <Input
                  id="search"
                  placeholder="예: 디지털플랫폼법, 이재명, 과학기술정보방송통신위원회..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  진행 상태 필터
                </Label>
                <div className="flex flex-wrap gap-2">
                  {["all", "발의", "심사중", "통과", "부결", "폐기"].map((status) => (
                    <Button
                      key={status}
                      variant={selectedStatus === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus(status)}
                      className="text-xs"
                    >
                      {status === "all" ? "전체" : status}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="px-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="glass-card-light">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600 mb-1">
                  {bills.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">총 발의법안</div>
              </CardContent>
            </Card>
            <Card className="glass-card-light">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {bills.filter((bill: any) => bill.status === "통과").length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">통과된 법안</div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Bills List */}
        <section className="px-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              발의법률안 목록
              <span className="ml-2 text-sm text-gray-500">({filteredBills.length}건)</span>
            </h2>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="text-purple-600 hover:text-purple-700"
              >
                검색 초기화
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12">
                <i className="fas fa-spinner fa-spin text-2xl text-purple-600 mb-4"></i>
                <p className="text-gray-600 dark:text-gray-400">법안 데이터를 불러오는 중...</p>
              </div>
            ) : filteredBills.length > 0 ? (
              filteredBills.map((bill: any, index: number) => (
                <Card key={bill.id || index} className="glass-card-light hover:shadow-lg transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="space-y-3">
                      {/* Title and Status */}
                      <div className="flex items-start justify-between">
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white line-clamp-2 flex-1 mr-3">
                          {bill.title || "제목 정보 없음"}
                        </h3>
                        <Badge className={`${getStatusColor(bill.status || "발의")} text-xs whitespace-nowrap`}>
                          {bill.status || "발의"}
                        </Badge>
                      </div>

                      {/* Bill Info */}
                      <div className="space-y-2">
                        {bill.proposer && (
                          <div className="flex items-center space-x-2">
                            <i className="fas fa-user text-purple-600 text-sm w-4"></i>
                            <ProposerWithParty proposer={bill.proposer} />
                          </div>
                        )}
                        
                        {bill.committee && (
                          <div className="flex items-center space-x-2">
                            <i className="fas fa-building text-indigo-600 text-sm w-4"></i>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              소관위: {bill.committee}
                            </span>
                          </div>
                        )}

                        {bill.proposalDate && (
                          <div className="flex items-center space-x-2">
                            <i className="fas fa-calendar text-blue-600 text-sm w-4"></i>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              발의일: {new Date(bill.proposalDate).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bill Number and Category */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          {bill.billNumber && (
                            <span className="text-xs text-gray-500 font-mono">
                              {bill.billNumber}
                            </span>
                          )}
                          {bill.category && (
                            <Badge variant="outline" className="text-xs">
                              {bill.category}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-purple-600 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          >
                            <i className="fas fa-external-link-alt mr-1"></i>
                            상세보기
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  검색 결과가 없습니다
                </h3>
                <p className="text-gray-500 dark:text-gray-500 mb-4">
                  다른 검색어나 필터를 시도해보세요
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedStatus("all");
                  }}
                  className="text-purple-600 border-purple-600"
                >
                  전체 법안 보기
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Coming Soon Features */}
        <section className="px-4 mt-8">
          <Card className="glass-card-light border-2 border-dashed border-purple-300">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-rocket text-purple-600 text-lg"></i>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                곧 추가될 기능들
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center space-x-2">
                  <i className="fas fa-bell text-purple-500"></i>
                  <span>법안 알림 설정</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-bookmark text-indigo-500"></i>
                  <span>관심 법안 저장</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-chart-line text-blue-500"></i>
                  <span>진행률 시각화</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-comments text-green-500"></i>
                  <span>법안 토론 기능</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}