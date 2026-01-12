import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Users,
  Bot,
  ShieldCheck,
  TrendingUp,
  Search,
  PieChart,
  BarChart4,
  Target,
  FileCheck,
  Megaphone,
  MessageSquare,
  ArrowRight,
  ChevronRight,
  Download,
  Phone,
  Mail,
  Clock,
  LayoutGrid,
  Zap,
  CheckCircle2,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function EnterpriseResearch() {
  const [showContactForm, setShowContactForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeTab, setActiveTab] = useState('cases'); // 'cases' | 'services' | 'contact'
  const [, setLocation] = useLocation();
  const [contactForm, setContactForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    researchType: '',
    description: '',
    timeline: '',
    budget: ''
  });
  const { toast } = useToast();

  // 강남구 설문 실제 데이터 가져오기 (예시)
  const { data: gangnamSurvey } = useQuery<{ participantCount?: number }>({
    queryKey: ['/api/surveys/1653'],
  });

  const categories = [
    { id: 'all', name: '전체', icon: LayoutGrid },
    { id: 'it', name: 'IT·전자', icon: Zap },
    { id: 'finance', name: '금융', icon: Building2 },
    { id: 'food', name: '유통', icon: TrendingUp },
    { id: 'auto', name: '모빌리티', icon: Target },
    { id: 'public', name: '공공·지자체', icon: Building2 },
  ];

  const surveyCases = [
    {
      id: 'case_006',
      company: '서울시 강남구',
      category: 'public',
      title: '펫터디 반려동물 장례 서비스 만족도',
      highlight: '실증특례 기반 이동식 장례 / 지자체 협력',
      participants: gangnamSurvey?.participantCount ? `${gangnamSurvey.participantCount.toLocaleString()}명` : '진행 중',
      satisfaction: '진행 중',
      color: 'purple'
    },
    {
      id: 'case_001',
      company: '삼성전자',
      category: 'it',
      title: '갤럭시 브랜드 인지도 조사',
      highlight: '전국 1만 명 대상 / 인지도 87%',
      participants: '10,000명',
      satisfaction: '4.8',
      color: 'blue'
    },
    {
      id: 'case_002',
      company: '신한은행',
      category: 'finance',
      title: '2030 금융서비스 선호도',
      highlight: '고객 만족도 4.6점 / UX 개선',
      participants: '5,200명',
      satisfaction: '4.6',
      color: 'indigo'
    },
    {
      id: 'case_003',
      company: '롯데마트',
      category: 'food',
      title: 'PB 상품 구매 패턴 분석',
      highlight: '구매 의향 73% / 가성비 중시',
      participants: '8,500명',
      satisfaction: '4.5',
      color: 'emerald'
    },
    {
      id: 'case_004',
      company: '현대자동차',
      category: 'auto',
      title: '전기차 충전 인프라 조사',
      highlight: '전기차 관심도 82% / 충전소',
      participants: '6,800명',
      satisfaction: '4.7',
      color: 'cyan'
    },
  ];

  const filteredCases = selectedCategory === 'all'
    ? surveyCases
    : surveyCases.filter(c => c.category === selectedCategory);

  const researchTypes = [
    {
      id: 'market',
      title: '시장 조사',
      subtitle: 'Market Feasibility',
      icon: TrendingUp,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      description: '시장 진입 타당성 및 경쟁 구도 분석'
    },
    {
      id: 'consumer',
      title: '소비자 인사이트',
      subtitle: 'Consumer Insights',
      icon: Users,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      description: '타겟 고객 니즈 및 구매 패턴 분석'
    },
    {
      id: 'brand',
      title: '브랜드 리서치',
      subtitle: 'Brand Research',
      icon: AwardBadge,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      description: '브랜드 인지도 및 이미지, NPS 조사'
    },
    {
      id: 'product',
      title: '제품 테스트',
      subtitle: 'Product Testing',
      icon: FileCheck,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
      description: '신제품 컨셉 수용도 및 사용성 테스트'
    },
  ];

  // Award icon Wrapper since it's not exported as AwardBadge from lucide
  function AwardBadge(props: any) {
    return <CheckCircle2 {...props} />;
  }


  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.companyName || !contactForm.contactName || !contactForm.email) {
      toast({
        title: "필수 정보 누락",
        description: "회사명, 담당자명, 이메일은 필수입니다.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "문의 접수 완료",
      description: "담당자가 24시간 내 연락드리겠습니다.",
    });
    setContactForm({
      companyName: '', contactName: '', email: '', phone: '',
      researchType: '', description: '', timeline: '', budget: ''
    });
    setShowContactForm(false);
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30">
      <SEOHead
        title="Polli Enterprise - 기업 맞춤형 리서치 솔루션"
        description="10만+ 실사용자 패널 기반의 데이터 리서치. AI 분석으로 더 빠르고 정확한 인사이트를 제공합니다."
      />

      {/* Background Ambience - Removed as requested */}
      <div className="fixed inset-0 z-0 bg-black pointer-events-none"></div>

      {/* Mobile Header & Nav */}
      <MobileHeader />

      <main className="relative z-10 max-w-md mx-auto pb-32">

        {/* Hero Section */}
        <section className="pt-24 pb-8 px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-4 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Enterprise Solution
            </div>

            <h1 className="text-4xl font-black text-white leading-tight mb-4 tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-purple-300">
                Data-Driven
              </span><br />
              Decision Making
            </h1>

            <p className="text-gray-400 text-sm leading-relaxed mb-8 max-w-[300px] mx-auto">
              <span className="text-indigo-400 font-bold">10만+</span> 패널과 <span className="text-purple-400 font-bold">AI 분석</span>으로<br />
              비즈니스의 불확실성을 확신으로 바꿉니다.
            </p>

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => setShowContactForm(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-6 shadow-lg shadow-indigo-900/20 font-bold text-base transition-all hover:scale-105"
              >
                도입 문의하기
              </Button>
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl px-6 py-6 backdrop-blur-md font-medium text-base"
              >
                소개서 다운
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Stats Section */}
        <section className="px-4 mb-10">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '활성 패널', value: '100K+', icon: Users, color: 'text-blue-400' },
              { label: '평균 응답', value: '24h', icon: Clock, color: 'text-emerald-400' },
              { label: 'AI 정확도', value: '98%', icon: Bot, color: 'text-purple-400' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="glass-card-light p-4 rounded-2xl border border-white/5 bg-white/5 text-center"
              >
                <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
                <div className="text-lg font-bold text-white mb-0.5">{stat.value}</div>
                <div className="text-[10px] text-gray-500 font-medium">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="px-6 mb-6">
          <div className="flex p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
            {['Cases', 'Services', 'Contact'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase())}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 ${activeTab === tab.toLowerCase()
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'cases' && (
            <motion.div
              key="cases"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-4 space-y-4"
            >
              {/* Filter Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${selectedCategory === cat.id
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
                      }`}
                  >
                    <cat.icon className="w-3 h-3" />
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Cases Grid */}
              <div className="space-y-3">
                {filteredCases.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'case_006') {
                        setLocation('/survey/1653');
                      }
                    }}
                    className={`glass-card p-5 rounded-2xl border border-white/10 relative overflow-hidden group hover:border-indigo-500/30 transition-all ${item.id === 'case_006' ? 'cursor-pointer hover:bg-white/5 active:scale-[0.98]' : ''}`}
                  >
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-${item.color}-500/10 rounded-full blur-2xl -translate-y-10 translate-x-10`}></div>

                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-bold text-white">{item.company}</span>
                          <Badge variant="outline" className={`text-[10px] py-0 h-5 border-${item.color}-500/30 text-${item.color}-400`}>
                            {categories.find(c => c.id === item.category)?.name}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400">{item.title}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-white">{item.satisfaction}</div>
                        <div className="text-[10px] text-gray-500">만족도</div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-3 mb-3 relative z-10">
                      <p className="text-xs text-gray-300 leading-relaxed font-medium">
                        <span className="text-indigo-400">Result:</span> {item.highlight}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 relative z-10">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {item.participants} 참여
                      </div>
                      <div className="flex items-center gap-1 text-indigo-400 font-medium">
                        자세히 보기 <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'services' && (
            <motion.div
              key="services"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-4 grid grid-cols-2 gap-3"
            >
              {researchTypes.map((service) => (
                <div key={service.id} className="glass-card p-4 rounded-2xl border border-white/10 hover:bg-white/5 transition-all">
                  <div className={`w-10 h-10 rounded-xl ${service.bgColor} flex items-center justify-center mb-3`}>
                    <service.icon className={`w-5 h-5 ${service.color}`} />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{service.title}</h3>
                  <p className="text-[10px] text-gray-400 leading-snug">{service.description}</p>
                </div>
              ))}

              <div className="col-span-2 mt-4 glass-card-strong p-5 rounded-2xl border border-indigo-500/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 opacity-50"></div>
                <div className="relative z-10 text-center">
                  <h3 className="text-base font-bold text-white mb-2">맞춤형 설계가 필요하신가요?</h3>
                  <p className="text-xs text-gray-300 mb-4">전문 컨설턴트가 귀사의 니즈를 분석해 드립니다.</p>
                  <Button
                    onClick={() => setActiveTab('contact')}
                    className="bg-white text-indigo-900 hover:bg-gray-100 text-xs font-bold rounded-lg px-6"
                  >
                    무료 상담 신청
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-4"
            >
              <div className="glass-card p-6 rounded-2xl border border-white/10">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">문의하기</h3>
                  <p className="text-xs text-gray-400">24시간 이내에 답변해 드리겠습니다.</p>
                </div>

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 ml-1">회사명</Label>
                    <Input
                      className="bg-white/5 border-white/10 text-white focus:border-indigo-500/50"
                      placeholder="Polli Corp"
                      value={contactForm.companyName}
                      onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })}
                    />
                  </div>
                  <div className="row flex gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs text-gray-400 ml-1">담당자</Label>
                      <Input
                        className="bg-white/5 border-white/10 text-white focus:border-indigo-500/50"
                        placeholder="홍길동"
                        value={contactForm.contactName}
                        onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs text-gray-400 ml-1">연락처</Label>
                      <Input
                        className="bg-white/5 border-white/10 text-white focus:border-indigo-500/50"
                        placeholder="010-0000-0000"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 ml-1">이메일</Label>
                    <Input
                      className="bg-white/5 border-white/10 text-white focus:border-indigo-500/50"
                      placeholder="email@company.com"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 ml-1">문의 내용</Label>
                    <Textarea
                      className="bg-white/5 border-white/10 text-white focus:border-indigo-500/50 min-h-[100px]"
                      placeholder="어떤 조사가 필요하신가요?"
                      value={contactForm.description}
                      onChange={(e) => setContactForm({ ...contactForm, description: e.target.value })}
                    />
                  </div>

                  <Button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-6 rounded-xl shadow-lg mt-2">
                    문의 발송하기
                  </Button>
                </form>

                <div className="mt-6 flex flex-col gap-2 text-xs text-gray-500 text-center">
                  <p>또는 직접 연락주세요</p>
                  <p className="text-indigo-400 font-bold text-sm">enterprise@polli.co.kr</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      <BottomNav />

      {/* Contact Form Modal Overlay (if triggered from Hero) */}
      <AnimatePresence>
        {showContactForm && activeTab !== 'contact' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setShowContactForm(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-md bg-[#121212] border-t border-white/10 sm:border sm:rounded-2xl p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 text-gray-400"
                onClick={() => setShowContactForm(false)}
              >
                <X className="w-5 h-5" />
              </Button>

              <h3 className="text-xl font-bold text-white mb-2">간편 문의</h3>
              <p className="text-sm text-gray-400 mb-6">최소한의 정보만 남겨주시면 빠르게 연락드립니다.</p>

              <form onSubmit={handleContactSubmit} className="space-y-4">
                <Input
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="회사명"
                  value={contactForm.companyName}
                  onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })}
                />
                <Input
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="담당자명"
                  value={contactForm.contactName}
                  onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })}
                />
                <Input
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="연락처 (이메일 또는 전화번호)"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-6 rounded-xl mt-4">
                  상담 신청하기
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
