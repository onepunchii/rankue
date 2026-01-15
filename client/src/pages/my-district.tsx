import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PartyLogo from "@/components/PartyLogo";
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Home, RotateCw, AlertTriangle, Building2, User, FileText, CheckCircle, Clock } from "lucide-react";

export default function MyDistrict() {
  const [, setLocation] = useLocation();
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedSubDistrict, setSelectedSubDistrict] = useState<string>("");
  const [showMyLocation, setShowMyLocation] = useState<boolean>(true); // 기본값을 true로 설정
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("assembly");
  const [userLocation, setUserLocation] = useState<{ cityProvince: string, district: string } | null>(null);

  // 사용자 프로필 정보 조회
  const { data: userProfile } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch user profile");
      const json = await response.json();
      return json.success ? json.data : json;
    },
  });

  // 사용자 프로필에서 지역 정보 자동 설정
  useEffect(() => {
    if (userProfile?.user && !userProfile.user.isGuest) {
      const user = userProfile.user;

      // 새로운 cascading location 필드들 우선 확인
      if (user.cityProvince && user.district) {
        setUserLocation({
          cityProvince: user.cityProvince,
          district: user.district
        });
      }
      // 하위 호환성: 기존 region 필드 확인
      else if (user.region) {
        setUserLocation({
          cityProvince: user.region,
          district: ""
        });
      }
    }
  }, [userProfile]);

  // 지역구별 국회의원 데이터 가져오기 (사용자 프로필 기반)
  const { data: assemblyMembers = [], isLoading: isLoadingAssembly } = useQuery({
    queryKey: ["/api/assembly/by-district", selectedDistrict, selectedSubDistrict, showMyLocation, userLocation?.cityProvince, userLocation?.district],
    queryFn: async () => {
      const params = new URLSearchParams();

      // 하위 지역구(구/군)가 선택된 경우 가장 우선
      if (selectedSubDistrict) {
        const cityProvince = selectedDistrict === "서울" ? "서울특별시" :
          selectedDistrict === "부산" ? "부산광역시" :
            selectedDistrict === "대구" ? "대구광역시" :
              selectedDistrict === "인천" ? "인천광역시" :
                selectedDistrict === "경기" ? "경기도" :
                  `${selectedDistrict}특별시`;
        params.append('cityProvince', cityProvince);
        params.append('district', selectedSubDistrict);
      }
      // 사용자가 주요 지역을 선택한 경우
      else if (selectedDistrict) {
        params.append('district', selectedDistrict);
      }
      // 내지역 버튼 선택 시 프로필 기반 지역 설정
      else if (showMyLocation && userLocation?.cityProvince) {
        params.append('cityProvince', userLocation.cityProvince);
        if (userLocation.district) {
          params.append('district', userLocation.district);
        }
      }

      const url = params.toString()
        ? `/api/assembly/by-district?${params.toString()}`
        : "/api/assembly/by-district";

      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch assembly members");
      const json = await response.json();
      return json.success ? json.data : json;
    },
    enabled: true
  });

  // 지역구별 기초의원 데이터 가져오기 (사용자 프로필 기반)
  const { data: localCouncilMembers = [], isLoading: isLoadingLocal } = useQuery({
    queryKey: ["/api/local-council/by-district", selectedDistrict, selectedSubDistrict, showMyLocation, userLocation?.cityProvince, userLocation?.district],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (selectedSubDistrict) {
        const cityProvince = selectedDistrict === "서울" ? "서울특별시" :
          selectedDistrict === "부산" ? "부산광역시" :
            selectedDistrict === "대구" ? "대구광역시" :
              selectedDistrict === "인천" ? "인천광역시" :
                selectedDistrict === "경기" ? "경기도" :
                  `${selectedDistrict}특별시`;
        params.append('cityProvince', cityProvince);
        params.append('district', selectedSubDistrict);
      }
      else if (selectedDistrict) {
        const cityProvince = selectedDistrict === "서울" ? "서울특별시" :
          selectedDistrict === "부산" ? "부산광역시" :
            selectedDistrict === "대구" ? "대구광역시" :
              selectedDistrict === "인천" ? "인천광역시" :
                selectedDistrict === "광주" ? "광주광역시" :
                  selectedDistrict === "대전" ? "대전광역시" :
                    selectedDistrict === "울산" ? "울산광역시" :
                      selectedDistrict === "세종" ? "세종특별자치시" :
                        selectedDistrict === "경기" ? "경기도" :
                          selectedDistrict === "강원" ? "강원도" :
                            selectedDistrict === "충북" ? "충청북도" :
                              selectedDistrict === "충남" ? "충청남도" :
                                selectedDistrict === "전북" ? "전라북도" :
                                  selectedDistrict === "전남" ? "전라남도" :
                                    selectedDistrict === "경북" ? "경상북도" :
                                      selectedDistrict === "경남" ? "경상남도" :
                                        selectedDistrict === "제주" ? "제주특별자치도" :
                                          selectedDistrict;
        params.append('cityProvince', cityProvince);
      }
      else if (showMyLocation && userLocation?.cityProvince) {
        params.append('cityProvince', userLocation.cityProvince);
        if (userLocation.district) {
          params.append('district', userLocation.district);
        }
      }

      const url = `/api/local-council/by-district?${params.toString()}`;

      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch local council members");
      const json = await response.json();
      return json.success ? json.data : json;
    },
    enabled: true
  });

  // 검색 필터링
  const filteredAssemblyMembers = assemblyMembers.filter((member: any) =>
    member.name.includes(searchQuery) ||
    member.constituency?.includes(searchQuery) ||
    member.party?.includes(searchQuery)
  );

  const filteredLocalMembers = localCouncilMembers.filter((member: any) =>
    member.name.includes(searchQuery) ||
    member.district?.includes(searchQuery) ||
    member.party?.includes(searchQuery)
  );

  // 주요 지역구 목록
  const majorDistricts = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
  ];

  // 각 지역별 구/군 목록
  const getSubDistricts = (region: string) => {
    switch (region) {
      case "서울": return ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"];
      case "부산": return ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"];
      case "대구": return ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군"];
      case "인천": return ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"];
      case "경기": return ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시", "하남시", "오산시", "이천시", "안성시", "의왕시", "양평군", "여주시", "과천시"];
      default: return [];
    }
  };

  const getPartyColor = (party: string) => {
    if (party.includes("민주당")) return "#004EA2"; // Blue
    if (party.includes("국민의힘")) return "#E61E2B"; // Red
    if (party.includes("정의당")) return "#FFED00"; // Yellow
    if (party.includes("개혁신당")) return "#FF7920"; // Orange
    if (party.includes("조국")) return "#0073CF"; // Dark Blue
    if (party.includes("진보당")) return "#D6001C"; // Red/Purple
    if (party.includes("무소속")) return "#9CA3AF"; // Gray
    return "#6B7280"; // Default Gray
  };

  const partyDistribution = useMemo(() => {
    const members = activeTab === "assembly" ? filteredAssemblyMembers : filteredLocalMembers;
    const total = members.length;
    if (total === 0) return [];

    const counts = members.reduce((acc: any, member: any) => {
      acc[member.party] = (acc[member.party] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([party, count]: [string, any]) => ({
        party,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, filteredAssemblyMembers, filteredLocalMembers]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor="#059669"
          bottomColor="#0e7490"
          intensity={1.5}
          rotationSpeed={0.5}
          glowAmount={0.002}
          pillarWidth={2.0}
        />
      </div>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      <SEOHead
        title="우리동네 정치인 - Polli"
        description="우리 지역 국회의원과 기초의원의 활동을 확인하고 평가해보세요."
      />
      <MobileHeader />

      <main className="relative z-10 max-w-md mx-auto px-6 py-8 pb-32">
        {/* Header */}
        <header className="mb-10 text-center">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-center space-x-2 mb-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.2em]">Local Government</span>
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">우리동네 정치인</h1>
            <p className="text-xs font-medium text-white/40 mt-1 italic">
              {userLocation ? `${userLocation.cityProvince} ${userLocation.district}` : "국회의원 & 기초의원 정보"}
            </p>
          </motion.div>
        </header>

        {/* Controls Section */}
        <div className="glass-card-strong p-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-3xl mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/5">
                <MapPin className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white italic">LOCATION SETTING</h2>
                <p className="text-[10px] text-white/40 uppercase tracking-widest">{selectedDistrict || userLocation?.cityProvince || "전체 지역"}</p>
              </div>
            </div>
            <Button
              onClick={() => setLocation('/home')}
              variant="ghost"
              className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black text-white/60 uppercase tracking-widest"
            >
              Home
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/20" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 bg-white/[0.03] border-white/10 rounded-2xl text-xs font-medium text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              placeholder="Search by name, district or party..."
            />
          </div>

          {/* District Buttons */}
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block pl-1">Major Districts</Label>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="ghost"
                  onClick={() => { setShowMyLocation(true); setSelectedDistrict(""); setSelectedSubDistrict(""); }}
                  className={`h-9 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${showMyLocation ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                >
                  내지역
                </Button>
                {majorDistricts.slice(0, 11).map((district) => (
                  <Button
                    key={district}
                    variant="ghost"
                    onClick={() => {
                      if (selectedDistrict === district) { setSelectedDistrict(""); setSelectedSubDistrict(""); }
                      else { setSelectedDistrict(district); setSelectedSubDistrict(""); }
                      setShowMyLocation(false);
                    }}
                    className={`h-9 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${selectedDistrict === district ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    {district}
                  </Button>
                ))}
              </div>
            </div>

            {/* Sub Districts */}
            {selectedDistrict && getSubDistricts(selectedDistrict).length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <Label className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 block pl-1">{selectedDistrict} Area</Label>
                <div className="grid grid-cols-4 gap-2">
                  {getSubDistricts(selectedDistrict).map((subDistrict) => (
                    <Button
                      key={subDistrict}
                      variant="ghost"
                      onClick={() => setSelectedSubDistrict(selectedSubDistrict === subDistrict ? "" : subDistrict)}
                      className={`h-8 rounded-lg text-[9px] font-bold transition-all ${selectedSubDistrict === subDistrict ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-white/[0.02] text-white/30 hover:bg-white/[0.05]'}`}
                    >
                      {subDistrict}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div id="district-tabs" className="relative mb-8 w-full p-1.5 bg-white/[0.03] backdrop-blur-2xl border border-white/5 rounded-[28px] flex items-center shadow-2xl">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full bg-transparent border-none p-0 h-auto gap-0">
              <TabsTrigger value="assembly" className="relative z-10 flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest text-white/30 transition-all duration-500 data-[state=active]:text-white bg-transparent border-none shadow-none">
                <span className="relative z-20 flex items-center justify-center gap-2">
                  국회의원 <Badge className="bg-white/10 text-white hover:bg-white/20 border-0 h-4 px-1.5 min-w-[1.2rem]">{filteredAssemblyMembers.length}</Badge>
                </span>
              </TabsTrigger>
              <TabsTrigger value="local" className="relative z-10 flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest text-white/30 transition-all duration-500 data-[state=active]:text-white bg-transparent border-none shadow-none">
                <span className="relative z-20 flex items-center justify-center gap-2">
                  기초의원 <Badge className="bg-white/10 text-white hover:bg-white/20 border-0 h-4 px-1.5 min-w-[1.2rem]">{filteredLocalMembers.length}</Badge>
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <style dangerouslySetInnerHTML={{
            __html: `
              #district-tabs [data-state="active"] { color: white !important; }
              #district-tabs [data-state="active"]::after {
                content: ""; position: absolute; inset: 4px;
                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                border-radius: 22px; z-index: -1;
                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.2);
                animation: tabIn 0.4s cubic-bezier(0.23, 1, 0.32, 1);
              }
              @keyframes tabIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
           `}} />
        </div>

        {/* Party Distribution */}
        {partyDistribution.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card-strong p-5 rounded-[24px] border border-white/10 bg-black/40 backdrop-blur-xl mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black italic text-white">정당별 분포</h3>
                <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Party Distribution</p>
              </div>
              <Badge className="bg-white/5 hover:bg-white/10 text-white border-0 text-[10px] font-bold">
                Total {activeTab === "assembly" ? filteredAssemblyMembers.length : filteredLocalMembers.length}
              </Badge>
            </div>

            {/* Progress Bar */}
            <div className="flex h-3 w-full rounded-[3px] overflow-hidden mb-4 bg-white/5">
              {partyDistribution.map((item) => (
                <div
                  key={item.party}
                  style={{ width: `${item.percentage}%`, backgroundColor: getPartyColor(item.party) }}
                  className="h-full transition-all duration-500"
                />
              ))}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2">
              {partyDistribution.map((item) => (
                <div key={item.party} className="flex items-center justify-between bg-white/[0.02] px-2.5 py-2 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: getPartyColor(item.party) }} />
                    <span className="text-[10px] font-bold text-white/80">{item.party}</span>
                  </div>
                  <div className="text-[10px] font-medium text-white/40">
                    <span className="text-white font-bold">{item.count}</span>명 ({item.percentage.toFixed(1)}%)
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Content */}
        <div>
          {activeTab === "assembly" ? (
            <div className="space-y-4">
              {isLoadingAssembly ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">Loading Assembly...</p>
                </div>
              ) : filteredAssemblyMembers.length > 0 ? (
                filteredAssemblyMembers.map((member: any) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
                    key={member.id}
                    onClick={() => setLocation(`/politician/assembly/${member.id}`)}
                    className="glass-card-strong p-6 rounded-[28px] border border-white/10 bg-black/40 backdrop-blur-xl hover:bg-black/50 transition-all cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform overflow-hidden font-black text-xl text-white/20">
                          {member.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="text-lg font-black text-white">{member.name}</h3>
                            <PartyLogo party={member.party} size="sm" />
                          </div>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{member.constituency}</p>
                        </div>
                      </div>
                      {member.monthlyRank && member.monthlyRank <= 3 && (
                        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/50 text-[9px] font-black uppercase tracking-wider px-2 py-0.5">Top {member.monthlyRank}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
                      <div className="text-center">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Bills</p>
                        <p className="text-sm font-black text-emerald-400">{member.billsProposed}</p>
                      </div>
                      <div className="text-center border-l border-white/5">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Pass Rate</p>
                        <p className="text-sm font-black text-cyan-400">{member.passRate}%</p>
                      </div>
                      <div className="text-center border-l border-white/5">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Attendance</p>
                        <p className="text-sm font-black text-indigo-400">{member.attendanceRate}%</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="glass-card-light p-10 rounded-[32px] text-center border border-white/5">
                  <AlertTriangle className="w-8 h-8 text-white/20 mx-auto mb-4" />
                  <p className="text-xs font-bold text-white/30">No assembly members found</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingLocal ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">Loading Local...</p>
                </div>
              ) : filteredLocalMembers.length > 0 ? (
                filteredLocalMembers.map((member: any) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
                    key={member.id}
                    onClick={() => setLocation(`/politician/local-council/${member.id}`)}
                    className="glass-card-strong p-6 rounded-[28px] border border-white/10 bg-black/40 backdrop-blur-xl hover:bg-black/50 transition-all cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform overflow-hidden font-black text-xl text-white/20">
                          {member.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="text-lg font-black text-white">{member.name}</h3>
                            <PartyLogo party={member.party} size="sm" />
                          </div>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{member.cityProvince} {member.district}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-white/5 text-white/60 border-0 text-[9px] font-bold uppercase tracking-wider">{member.electionCount || 1}선</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5 text-[10px] font-medium text-white/40">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3" />
                        <span>{member.age}세 · {member.gender}</span>
                      </div>
                      {member.education && (
                        <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                          <FileText className="w-3 h-3" />
                          <span className="truncate">{member.education}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="glass-card-light p-10 rounded-[32px] text-center border border-white/5">
                  <AlertTriangle className="w-8 h-8 text-white/20 mx-auto mb-4" />
                  <p className="text-xs font-bold text-white/30">No local members found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}