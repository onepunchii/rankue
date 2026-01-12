import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

const adminFetch = async (url: string, options?: any) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  return response.json();
};

export function AdminUsers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleUserExpansion = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/admin/users", searchTerm, filterType, ageFilter, genderFilter, regionFilter, activityFilter, page],
    queryFn: () => adminFetch(`/api/admin/users?search=${searchTerm}&filter=${filterType}&age=${ageFilter}&gender=${genderFilter}&region=${regionFilter}&activity=${activityFilter}&page=${page}&sortBy=newest`),
  });

  const { data: userStats } = useQuery({
    queryKey: ["/api/admin/user-statistics"],
    queryFn: () => adminFetch("/api/admin/user-statistics"),
  });

  const { data: mauData } = useQuery({
    queryKey: ["/api/admin/mau-analysis"],
    queryFn: () => adminFetch("/api/admin/mau-analysis"),
  });

  const { data: demographicData } = useQuery({
    queryKey: ["/api/admin/demographic-analysis"],
    queryFn: () => adminFetch("/api/admin/demographic-analysis"),
  });

  const suspendUser = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) => 
      adminFetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      }),
    onSuccess: () => {
      toast({ title: "성공", description: "사용자가 정지되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    }
  });

  const unsuspendUser = useMutation({
    mutationFn: (userId: string) => adminFetch(`/api/admin/users/${userId}/unsuspend`, {
      method: 'POST'
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "사용자 정지가 해제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    }
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => adminFetch(`/api/admin/users/${userId}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast({ title: "성공", description: "사용자가 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    }
  });

  const handleSuspend = (user: any) => {
    const reason = prompt('정지 사유를 입력하세요:');
    if (reason) {
      suspendUser.mutate({ userId: user.id, reason });
    }
  };

  const exportToCSV = () => {
    if (!users?.data) return;
    
    const csvContent = [
      ['이름', '이메일', '가입일', '연령대', '성별', '지역', '레벨', '포인트', '설문참여수', '최근접속'],
      ...users.data.map((user: any) => [
        user.name || user.id,
        user.email || '미등록',
        new Date(user.createdAt).toLocaleDateString('ko-KR'),
        user.ageGroup || '미등록',
        user.gender || '미등록',
        user.region || '미등록',
        user.level || 0,
        user.points || 0,
        user.surveyCount || 0,
        user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('ko-KR') : '미접속'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({ title: "성공", description: "회원 데이터가 CSV로 내보내졌습니다." });
  };

  const viewUserDetail = async (userId: string) => {
    try {
      const userDetail = await adminFetch(`/api/admin/users/${userId}/detail`);
      setSelectedUser(userDetail);
      setShowUserModal(true);
    } catch (error) {
      toast({ title: "오류", description: "사용자 상세 정보를 불러올 수 없습니다.", variant: "destructive" });
    }
  };

  const getLevelColor = (level: number) => {
    if (level >= 10) return 'bg-purple-100 text-purple-800';
    if (level >= 7) return 'bg-blue-100 text-blue-800';
    if (level >= 4) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">사용자 데이터를 불러오는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
            <p className="text-gray-600">사용자 계정 관리 및 통계</p>
          </div>
        </div>

        {/* 핵심 회원 통계 카드 */}
        {userStats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-users text-blue-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">총 회원 수</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {userStats.totalUsers?.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-green-600">
                      +{userStats.growthRate || 0}% (전월 대비)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-chart-line text-green-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">MAU (월간활성)</p>
                    <p className="text-2xl font-bold text-green-600">
                      {userStats.mau?.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-gray-500">
                      전체의 {((userStats.mau / userStats.totalUsers) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-user-plus text-purple-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">오늘 가입</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {userStats.newUsersToday?.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-gray-500">
                      어제: {userStats.newUsersYesterday || 0}명
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-poll text-orange-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">설문 참여율</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {userStats.surveyParticipationRate?.toFixed(1) || '0.0'}%
                    </p>
                    <p className="text-xs text-gray-500">
                      {userStats.activeSurveyParticipants || 0}명 참여중
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-bell text-teal-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">푸시 수신율</p>
                    <p className="text-2xl font-bold text-teal-600">
                      {userStats.pushConsentRate?.toFixed(1) || '0.0'}%
                    </p>
                    <p className="text-xs text-gray-500">
                      {userStats.pushConsentUsers || 0}명 수신 동의
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* MAU/DAU 트렌드 차트 */}
        {mauData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>월간 활성 사용자 (MAU) 추이</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mauData.monthlyTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="mau" stroke="#10b981" strokeWidth={2} name="MAU" />
                    <Line type="monotone" dataKey="dau" stroke="#3b82f6" strokeWidth={2} name="평균 DAU" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>가입 경로 분석</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={mauData.signupChannels || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {(mauData.signupChannels || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 인구통계학적 분포 */}
        {demographicData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>연령대 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={demographicData.ageDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ageGroup" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>성별 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={demographicData.genderDistribution || []}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="count"
                    >
                      {(demographicData.genderDistribution || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>지역 분포 TOP 10</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={demographicData.regionDistribution || []} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="region" type="category" width={60} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 고급 필터 및 검색 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>고급 회원 검색 및 필터</CardTitle>
              <Button onClick={exportToCSV} variant="outline">
                <i className="fas fa-download mr-2"></i>
                CSV 내보내기
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">검색</label>
                <Input
                  placeholder="이름, 이메일, ID로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">상태</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="active">활성</option>
                  <option value="suspended">정지</option>
                  <option value="high_level">고레벨 (7+)</option>
                  <option value="recent">최근 가입</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">연령대</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="10-19">10대</option>
                  <option value="20-29">20대</option>
                  <option value="30-39">30대</option>
                  <option value="40-49">40대</option>
                  <option value="50-59">50대</option>
                  <option value="60+">60대 이상</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">성별</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                  <option value="other">기타</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">지역</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="서울">서울</option>
                  <option value="경기">경기</option>
                  <option value="인천">인천</option>
                  <option value="부산">부산</option>
                  <option value="대구">대구</option>
                  <option value="광주">광주</option>
                  <option value="대전">대전</option>
                  <option value="울산">울산</option>
                  <option value="강원">강원</option>
                  <option value="충북">충북</option>
                  <option value="충남">충남</option>
                  <option value="전북">전북</option>
                  <option value="전남">전남</option>
                  <option value="경북">경북</option>
                  <option value="경남">경남</option>
                  <option value="제주">제주</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">활동 기준</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="active_7d">최근 7일 활동</option>
                  <option value="active_30d">최근 30일 활동</option>
                  <option value="survey_participant">설문 참여자</option>
                  <option value="push_consent">푸시 수신 동의</option>
                  <option value="inactive">비활성 사용자</option>
                </select>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <span>검색 결과: {users?.pagination?.total || 0}명</span>
              {(searchTerm || filterType !== 'all' || ageFilter !== 'all' || genderFilter !== 'all' || regionFilter !== 'all' || activityFilter !== 'all') && (
                <button 
                  className="ml-4 text-blue-600 hover:underline"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    setAgeFilter('all');
                    setGenderFilter('all');
                    setRegionFilter('all');
                    setActivityFilter('all');
                  }}
                >
                  필터 초기화
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 회원 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>회원 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {users?.data?.length > 0 ? (
              <>
                <div className="space-y-2">
                  {users.data.map((user: any) => {
                    const isExpanded = expandedUsers.has(user.auth_id);
                    return (
                      <div key={user.auth_id} className="border rounded-lg bg-white hover:bg-gray-50 transition-colors">
                        {/* Compact Header - Always Visible */}
                        <div 
                          className="p-3 cursor-pointer flex items-center justify-between"
                          onClick={() => toggleUserExpansion(user.auth_id)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex items-center gap-2">
                              <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400 text-sm transition-transform`}></i>
                              <h3 className="font-medium text-gray-900">
                                {user.name || user.id}
                              </h3>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Badge className={getLevelColor(user.level)}>
                                레벨 {user.level}
                              </Badge>
                              <Badge className={getStatusColor(user.status || 'active')}>
                                {user.status === 'suspended' ? '정지' : 
                                 user.status === 'inactive' ? '비활성' : '활성'}
                              </Badge>
                              {user.isGuest && (
                                <Badge variant="outline">게스트</Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-600">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : 'Invalid Date'}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t bg-gray-50/50">
                            <div className="pt-3">
                              {/* Basic Info Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                                <div>
                                  <p className="text-gray-500 mb-1">이메일</p>
                                  <p className="font-medium">{user.email || '미등록'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">최근 활동</p>
                                  <p className="font-medium">
                                    {user.lastLoginAt ? 
                                      new Date(user.lastLoginAt).toLocaleDateString('ko-KR') : 
                                      '정보 없음'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">지역</p>
                                  <p className="font-medium">{user.region || '미등록'}</p>
                                </div>
                              </div>

                              {/* Stats Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm mb-4">
                                <div>
                                  <p className="text-gray-500 mb-1">설문 참여</p>
                                  <p className="font-bold text-blue-600">{user.surveyCount || 0}회</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">보유 포인트</p>
                                  <p className="font-bold text-green-600">{user.points || 0}P</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">성별</p>
                                  <p className="font-medium">{user.gender || '미등록'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">연령대</p>
                                  <p className="font-medium">{user.ageGroup || '미등록'}</p>
                                </div>
                              </div>

                              {/* Suspension Reason */}
                              {user.suspendReason && (
                                <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded">
                                  <p className="text-sm text-red-700">
                                    <strong>정지 사유:</strong> {user.suspendReason}
                                  </p>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex gap-2 pt-2 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    viewUserDetail(user.id);
                                  }}
                                >
                                  <i className="fas fa-eye mr-1"></i>
                                  상세보기
                                </Button>
                                
                                {user.status !== 'suspended' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-orange-600 hover:text-orange-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSuspend(user);
                                    }}
                                  >
                                    <i className="fas fa-ban mr-1"></i>
                                    정지
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      unsuspendUser.mutate(user.id);
                                    }}
                                  >
                                    <i className="fas fa-check mr-1"></i>
                                    해제
                                  </Button>
                                )}
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('정말로 이 사용자를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.')) {
                                      deleteUser.mutate(user.id);
                                    }
                                  }}
                                >
                                  <i className="fas fa-trash mr-1"></i>
                                  삭제
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 페이지네이션 */}
                {users.pagination && (
                  <div className="flex justify-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      이전
                    </Button>
                    <span className="px-3 py-2 text-sm">
                      {page} / {users.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= users.pagination.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      다음
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <i className="fas fa-users text-gray-400 text-4xl mb-4"></i>
                <p className="text-gray-500">검색 조건에 맞는 회원이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 사용자 상세 모달 */}
        {showUserModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">회원 상세 정보</h2>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 기본 정보 */}
                <Card>
                  <CardHeader>
                    <CardTitle>기본 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">이름:</span>
                      <span className="font-medium">{selectedUser.name || selectedUser.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">이메일:</span>
                      <span className="font-medium">{selectedUser.email || '미등록'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">연령대:</span>
                      <span className="font-medium">{selectedUser.ageGroup || '미등록'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">성별:</span>
                      <span className="font-medium">{selectedUser.gender || '미등록'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">지역:</span>
                      <span className="font-medium">{selectedUser.region || '미등록'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">가입일:</span>
                      <span className="font-medium">{new Date(selectedUser.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">최근 접속:</span>
                      <span className="font-medium">
                        {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString('ko-KR') : '미접속'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* 활동 통계 */}
                <Card>
                  <CardHeader>
                    <CardTitle>활동 통계</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">레벨:</span>
                      <Badge className={getLevelColor(selectedUser.level)}>
                        레벨 {selectedUser.level}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">보유 포인트:</span>
                      <span className="font-bold text-green-600">{selectedUser.points?.toLocaleString() || 0}P</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">설문 참여:</span>
                      <span className="font-bold text-blue-600">{selectedUser.surveyParticipationCount || 0}회</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">설문 생성:</span>
                      <span className="font-medium">{selectedUser.createdSurveyCount || 0}개</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">푸시 수신:</span>
                      <Badge variant={selectedUser.pushAgreed ? "default" : "secondary"}>
                        {selectedUser.pushAgreed ? '동의' : '미동의'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">가입 경로:</span>
                      <span className="font-medium">{selectedUser.signupChannel || '일반'}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 참여한 설문 목록 */}
              {selectedUser.recentSurveys && selectedUser.recentSurveys.length > 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>최근 참여한 설문 (최대 10개)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedUser.recentSurveys.map((survey: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="font-medium">{survey.title}</p>
                            <p className="text-sm text-gray-500">{survey.category}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{new Date(survey.participatedAt).toLocaleDateString('ko-KR')}</p>
                            <p className="text-xs text-gray-500">+{survey.earnedPoints}P</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 선호 주제 */}
              {selectedUser.preferredCategories && selectedUser.preferredCategories.length > 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>선호 주제 분석</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.preferredCategories.map((category: any, index: number) => (
                        <Badge key={index} variant="outline">
                          {category.name} ({category.count}회)
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}