import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AdminLayoutProps {
  children: React.ReactNode;
}

// 관리자 fetch 함수
const adminFetch = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (response.status === 401) {
    // 세션 만료 시 로그인 페이지로 리다이렉트
    window.location.href = '/admin/login';
    throw new Error('Session expired');
  }
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  return response.json();
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 데이터베이스 상태 조회
  const { data: dbStatus, isLoading: dbLoading, error } = useQuery({
    queryKey: ["/api/admin/db-status"],
    queryFn: () => adminFetch("/api/admin/db-status"),
    refetchInterval: 30000, // 30초마다 갱신
    retry: false, // 401 오류 시 재시도하지 않음
    onError: (error: any) => {
      if (error.message === 'Session expired') {
        // 이미 리다이렉트됨
        return;
      }
      console.error('DB status fetch error:', error);
    }
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include"
      });
      toast({
        title: "로그아웃",
        description: "관리자 세션이 종료되었습니다.",
      });
      setLocation("/admin/login");
    } catch (error) {
      console.error("Logout error:", error);
      setLocation("/admin/login");
    }
  };

  const menuItems = [
    { icon: "fas fa-tachometer-alt", label: "대시보드", path: "/admin/dashboard" },
    { icon: "fas fa-database", label: "DB 상태", path: "/admin/database-status" },
    { icon: "fas fa-poll", label: "설문 관리", path: "/admin/surveys" },
    { icon: "fas fa-chart-bar", label: "통계 분석", path: "/admin/analytics" },
    { icon: "fas fa-bullseye", label: "타겟 설문", path: "/admin/targeting" },
    { icon: "fas fa-bell", label: "푸시 알림", path: "/admin/notifications" },
    { icon: "fas fa-users", label: "회원 관리", path: "/admin/users" },
    { icon: "fas fa-gift", label: "리워드 관리", path: "/admin/rewards" },
    { icon: "fas fa-chart-line", label: "연동 분석", path: "/admin/analytics-rewards" },
    { icon: "fas fa-plug", label: "외부 연동", path: "/admin/integration" },
    { icon: "fas fa-shield-alt", label: "어뷰징 탐지", path: "/admin/abuse-detection" },
    { icon: "fas fa-cog", label: "설정", path: "/admin/settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 사이드바 */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300 flex flex-col`}>
        {/* 헤더 */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <h2 className="text-xl font-bold text-gray-900">Polli Admin</h2>
                <div className="text-xs text-gray-500 mt-1">
                  {dbLoading ? (
                    <span>연결 확인 중...</span>
                  ) : dbStatus ? (
                    <div>
                      <div className="flex items-center">
                        <i className="fas fa-circle text-green-500 text-xs mr-1"></i>
                        DB 연결됨
                      </div>
                      <div className="text-xs mt-1">
                        회원: {dbStatus.stats?.totalUsers?.toLocaleString() || 0}명 | 
                        설문: {dbStatus.stats?.totalSurveys?.toLocaleString() || 0}개
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <i className="fas fa-circle text-red-500 text-xs mr-1"></i>
                      DB 연결 실패
                    </div>
                  )}
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-600 hover:text-gray-900"
            >
              <i className={`fas ${sidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i>
            </Button>
          </div>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.path}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start text-left ${
                    window.location.pathname === item.path 
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setLocation(item.path)}
                >
                  <i className={`${item.icon} ${sidebarOpen ? 'mr-3' : ''} w-4`}></i>
                  {sidebarOpen && <span>{item.label}</span>}
                </Button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 시스템 정보 및 로그아웃 */}
        <div className="p-4 border-t space-y-3">
          {sidebarOpen && dbStatus && (
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>참여수:</span>
                <span className="font-mono">{dbStatus.stats?.totalParticipations || 0}회</span>
              </div>
              <div className="flex justify-between">
                <span>가동시간:</span>
                <span className="font-mono">{Math.floor(Date.now() / 1000 / 60) % 60}분</span>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={`w-full ${sidebarOpen ? 'justify-start' : 'justify-center'} text-red-600 hover:bg-red-50`}
          >
            <i className={`fas fa-sign-out-alt ${sidebarOpen ? 'mr-3' : ''} w-4`}></i>
            {sidebarOpen && <span>로그아웃</span>}
          </Button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col">
        {/* 상단 헤더 */}
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-medium text-gray-900">
                관리자 패널
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                관리자: petudy
              </span>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">A</span>
              </div>
            </div>
          </div>
        </header>

        {/* 메인 컨텐츠 영역 */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}