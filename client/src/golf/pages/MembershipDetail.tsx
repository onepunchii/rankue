import React, { useState, useMemo, useRef } from 'react';
import {
    LucideArrowLeft,
    LucideStar,
    LucideInfo,
    LucideCheck,
    LucideCalculator,
    LucidePhone,
    LucideTrendingUp,
    LucideCalendarDays,
    LucideUsers,
    LucideCoins,
    LucideMapPin,
    LucideFlag,
    LucideLeaf,
    LucideTrophy,
    LucideCheckCircle2,
    LucideHeart,
    LucideZap,
    LucideCrown,
    LucideLock,
    LucideCamera,
    LucideChevronLeft,
    LucideMessageSquare,
    LucideChevronRight,
    LucideChevronDown,
    LucideGlobe
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Link, useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from "framer-motion";
import {
    CRAWLED_MEMBERSHIPS,
    MembershipItem,
    formatPrice,
    calculateTrend,
    extractClubName,
    getClubVariants,
    extractVariantType
} from '../data/membershipData';
import OrderModal from '../components/OrderModal';

// 숫자 포맷터 (1억 8,500만 / 250만)
const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);
const formatSimple = (n: number) => {
    const eok = Math.floor(n / 100000000);
    const man = Math.floor((n % 100000000) / 10000);
    if (eok > 0) return `${eok}억 ${man > 0 ? new Intl.NumberFormat('ko-KR').format(man) : 0}만`;
    return `${new Intl.NumberFormat('ko-KR').format(man)}만`;
};

// Mock Reviews for "Course Info" tab - Synced with CourseDetail structure
const REVIEWS = [
    {
        id: 1,
        user: "최정환",
        tier: "싱글 골퍼",
        date: "2026.01.24",
        score: 82,
        verified: true,
        content: "역시 명불허전입니다. 페어웨이 관리 상태가 양탄자 수준이고, 그린도 잘 받아줍니다.",
        ratings: { course: 5, green: 4, service: 5 },
        specs: { speed: 2.8, fee: 250000, difficulty: "상" },
        tags: ["#그린스피드빠름", "#페어웨이양탄자", "#그늘집맛집"]
    },
    {
        id: 2,
        user: "김프로",
        tier: "세미프로",
        date: "2026.01.10",
        score: 75,
        verified: true,
        content: "그린 스피드가 2.8 이상 나와주네요. 난이도도 적당하고 코스 레이아웃이 정말 훌륭합니다.",
        ratings: { course: 5, green: 5, service: 4 },
        specs: { speed: 2.9, fee: 220000, difficulty: "중" },
        tags: ["#전장김", "#벙커지옥"]
    }
];

// FAQ 데이터 (관리자가 수정 가능)
const FAQ_LIST = [
    {
        q: "랭큐 거래소는 어떤 곳인가요?",
        a: "랭큐는 회원권 시세 정보와 매물을 투명하게 제공하는 프리미엄 플랫폼입니다. 실제 거래 및 계약은 랭큐가 검증한 '제휴 공식 회원권 거래소'의 전문 딜러를 통해 안전하게 진행됩니다."
    },
    {
        q: "중개 수수료는 얼마인가요?",
        a: "법정 중개 수수료율을 준수합니다. 통상적으로 거래 금액의 0.3% ~ 0.5% 수준이며, 정확한 요율은 매물 종류와 거래소 정책에 따라 상담 시 안내드립니다."
    },
    {
        q: "회원권 구매 시 세금은 어떻게 되나요?",
        a: "회원권 취득 시 매매가의 2.2%에 해당하는 '취득세'가 부과됩니다. 또한 골프장마다 정해진 '명의개서료(입회비)'와 '수입인지세'가 별도로 발생합니다."
    },
    {
        q: "거래 절차가 궁금해요.",
        a: "1. 호가 접수 및 상담 → 2. 매수/매도 매칭 → 3. 계약금 입금 → 4. 골프장 서류 접수 및 잔금 지급 → 5. 명의 개서 완료 (회원 대우 시작) 순으로 진행됩니다."
    },
    {
        q: "허위 매물은 없나요?",
        a: "랭큐는 실시간 모니터링과 제휴 거래소와의 교차 검증을 통해 허위 매물을 원천 차단하고 있습니다. 안심하고 문의하셔도 됩니다."
    }
];

function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex items-center gap-2 mb-6 px-1">
                <LucideInfo className="w-5 h-5 text-[#64DD17]" />
                <h3 className="text-lg font-bold text-white">자주 묻는 질문</h3>
            </div>

            <div className="space-y-3">
                {FAQ_LIST.map((item, index) => (
                    <div
                        key={index}
                        className={cn(
                            "rounded-2xl border transition-all duration-300 overflow-hidden",
                            openIndex === index
                                ? "bg-[#1E1E1E] border-[#64DD17]/30"
                                : "bg-[#18181b] border-white/5 hover:border-white/10"
                        )}
                    >
                        <button
                            onClick={() => toggleFAQ(index)}
                            className="w-full flex items-center justify-between p-5 text-left"
                        >
                            <span className={cn(
                                "text-sm font-bold",
                                openIndex === index ? "text-white" : "text-zinc-400"
                            )}>
                                Q. {item.q}
                            </span>
                            <LucideChevronDown
                                className={cn(
                                    "w-5 h-5 text-zinc-500 transition-transform duration-300",
                                    openIndex === index && "rotate-180 text-[#64DD17]"
                                )}
                            />
                        </button>

                        {/* 답변 영역 (애니메이션 효과) */}
                        <div
                            className={cn(
                                "px-5 text-sm text-zinc-400 leading-relaxed overflow-hidden transition-all duration-300 ease-in-out",
                                openIndex === index ? "max-h-40 pb-5 opacity-100" : "max-h-0 opacity-0"
                            )}
                        >
                            <div className="pt-2 border-t border-white/5">
                                {item.a}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function MembershipDetail() {
    const [match, params] = useRoute("/golf/membership/:id");
    const [_location, setLocation] = useLocation();
    const membershipId = match ? params.id : "1";

    // ID로 실제 회원권 데이터 찾기
    const membership = CRAWLED_MEMBERSHIPS.find(m => m.id === membershipId) || CRAWLED_MEMBERSHIPS[0];

    // 관련 회원권(Variants) 찾기
    const clubName = extractClubName(membership.name);
    const variants = getClubVariants(clubName, CRAWLED_MEMBERSHIPS);
    const currentVariantType = extractVariantType(membership.name);

    const [activeTab, setActiveTab] = useState<'COURSE' | 'BENEFIT' | 'MARKET' | 'CALC'>('COURSE');
    // State for Membership Type selection
    const [isTypeOpen, setIsTypeOpen] = useState(false);

    // Trade Order Modal State
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');

    // --- Dynamic Data Generation based on Membership ---
    const HYBRID_DATA = useMemo(() => {
        // 시세 변동 계산
        const trend = calculateTrend(membership.id);

        // 가격 관련 계산
        const currentPrice = membership.priceValue;
        const changeRate = typeof trend.changeRate === 'string' ? parseFloat(trend.changeRate) : trend.changeRate;
        const changeAmount = Math.floor(currentPrice * (changeRate / 100));

        // 지역 추출
        const region = membership.clubInfo.address !== '-'
            ? membership.clubInfo.address.split(' ').slice(0, 2).join(' ')
            : '정보 확인중';

        return {
            // 1. 회원권 정보 (Membership Identity)
            id: membership.id,
            name: membership.name,
            type: membership.type,
            category: membership.category,
            courseType: membership.category,
            region: region,
            originalRegion: region.split(' ')[0],
            holes: membership.clubInfo.holes || "-",
            grass: "-", // 크롤링 데이터에 없는 정보
            imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=2070",
            phone: membership.clubInfo.website || "-",
            tags: membership.tags.length > 0 ? membership.tags.map(t => `#${t}`) : ["#프리미엄"],

            // 2. 골프장 스펙 (Course Specs)
            difficulty: "-",
            difficultyDesc: "코스 상세 분석은 회원 가입 후 확인하실 수 있습니다.",
            specs: { speed: 0, fee: 0 },

            // 3. 시장 데이터 (Market Data)
            currentPrice: currentPrice,
            changeAmount: changeAmount,
            changeRate: changeRate.toFixed(2),
            status: trend.status,
            trendData: [160, 162, 158, 165, 170, 172, 168, 175, 180, 182, 185],
            buyPrice: formatPrice(currentPrice - 5000000),
            sellPrice: formatPrice(currentPrice + 5000000),

            // 4. 회원 혜택 (Benefits)
            conditions: ["상세 조건은 문의 바랍니다."],
            benefits: [
                {
                    icon: <LucideCalendarDays className="w-5 h-5" />,
                    title: "회원 혜택",
                    desc: membership.benefits.summary
                        ? (membership.benefits.summary.length > 40 ? "상세 내용은 상단의 설명을 참고해주세요." : membership.benefits.summary)
                        : (membership.benefits.usageLimit || "문의 바랍니다.")
                },
                {
                    icon: <LucideUsers className="w-5 h-5" />,
                    title: `${membership.type}`,
                    desc: membership.clubInfo.memberCount !== '-' ? `정원 ${membership.clubInfo.memberCount}명` : "정보 확인중"
                },
                {
                    icon: <LucideCoins className="w-5 h-5" />,
                    title: "시설 정보",
                    desc: membership.clubInfo.holes || "문의 바랍니다."
                },
            ],
            greenFee: membership.greenFee || {
                member: 0,
                nonMember: 0,
                weekendMember: 0,
                weekendNonMember: 0
            },

            // 5. 비용 정보 (Fees)
            fees: {
                transfer: membership.fees.transfer,
                commissionRate: membership.fees.commission,
                taxRate: membership.fees.taxRate,
                caddy: membership.fees.caddy,
                cart: membership.fees.cart
            },

            // 6. 클럽 정보 추가
            clubInfo: membership.clubInfo,
            openDate: membership.clubInfo.openDate,
            address: membership.clubInfo.address
        };
    }, [membership]);

    // 계산기 로직
    const commission = HYBRID_DATA.currentPrice * HYBRID_DATA.fees.commissionRate;
    const tax = HYBRID_DATA.currentPrice * HYBRID_DATA.fees.taxRate;
    const totalCost = HYBRID_DATA.currentPrice + commission + tax + HYBRID_DATA.fees.transfer;

    // Dynamic Color Logic
    const trendColor = HYBRID_DATA.status === 'UP' ? 'text-red-500' : (HYBRID_DATA.status === 'DOWN' ? 'text-blue-500' : 'text-white/40');
    const trendBg = HYBRID_DATA.status === 'UP' ? 'bg-red-500/10 border-red-500/20' : (HYBRID_DATA.status === 'DOWN' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-white/5 border-white/10');
    const TrendIcon = HYBRID_DATA.status === 'UP' ? LucideTrendingUp : (HYBRID_DATA.status === 'DOWN' ? LucideTrendingUp : LucideTrendingUp); // LucideTrendingDown exists? Use rotate if not.

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans pb-32 relative overflow-x-hidden">

            {/* A. SUPER HERO SECTION (Visual Only) */}
            <header className="relative h-[40vh] overflow-hidden">
                <div className="w-full h-full relative">
                    <img
                        src={HYBRID_DATA.imageUrl}
                        className="w-full h-full object-cover"
                        alt={HYBRID_DATA.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#050505]" />
                </div>

                {/* Navigation Overlay */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-30">
                    <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-90">
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex gap-2">
                        <button className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white active:scale-90"><LucideStar className="w-5 h-5" /></button>
                        <button className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white active:scale-90"><LucideCamera className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Hero Info Overlay */}
                <div className="absolute bottom-6 left-0 right-0 px-6 z-30 flex flex-col items-start gap-2">
                    {/* Identity Badge */}
                    <div className="flex items-center gap-2 opacity-90">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-amber-600 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                            <LucideCrown className="w-2.5 h-2.5 text-amber-950 fill-amber-950" />
                            <span className="text-[8px] font-black text-amber-950 uppercase tracking-widest">RANKUE 60</span>
                        </div>
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em] border border-white/10 px-2 py-0.5 rounded backdrop-blur-md">{HYBRID_DATA.region}</span>
                    </div>

                    {/* Prominent Name */}
                    <h1 className="text-4xl font-black tracking-tighter drop-shadow-2xl text-white">
                        {HYBRID_DATA.name}
                    </h1>
                </div>
            </header>

            {/* B. HYBRID TABS (Modern Line Style) */}
            <div className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-xl border-b border-white/10 px-0 flex justify-between">
                {[
                    { id: 'COURSE', label: '코스 가이드' },
                    { id: 'BENEFIT', label: '회원권 혜택' },
                    { id: 'MARKET', label: '실시간 시세' },
                    { id: 'CALC', label: '비용 계산' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex-1 py-4 text-xs font-bold transition-all relative shrink-0 text-center tracking-tight",
                            activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/60"
                        )}
                    >
                        {tab.label}
                        {activeTab === tab.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#64DD17] shadow-[0_0_8px_#64DD17] rounded-full" />}
                    </button>
                ))}
            </div>

            {/* C. CONTENT AREA */}
            <main className="px-6 py-6 min-h-[50vh] animate-in fade-in slide-in-from-bottom-2 duration-300">

                {/* Membership Type Selector */}
                <div className="mb-4">
                    <button
                        onClick={() => setIsTypeOpen(!isTypeOpen)}
                        className="w-full bg-[#1A1A1A] rounded-2xl p-5 border border-white/10 flex justify-between items-center active:scale-[0.98] transition-all group"
                    >
                        <div className="text-left">
                            <div className="text-[10px] font-bold text-white/30 mb-1 tracking-wider uppercase">회원권 종류 (Membership Type)</div>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-black text-white">{currentVariantType || '회원권 선택'}</span>
                                {membership.tags.includes('법인') && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">법인</span>
                                )}
                            </div>
                        </div>
                        <LucideChevronDown className={cn("w-5 h-5 text-white/30 transition-transform duration-300", isTypeOpen && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                        {isTypeOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {variants.map(variant => {
                                        const isSelected = variant.id === membership.id;
                                        const vType = extractVariantType(variant.name);
                                        const isCorp = variant.tags.includes('법인');

                                        return (
                                            <button
                                                key={variant.id}
                                                onClick={() => {
                                                    setLocation(`/golf/membership/${variant.id}`);
                                                    setIsTypeOpen(false);
                                                }}
                                                className={cn(
                                                    "p-4 rounded-xl border text-left transition-all active:scale-95",
                                                    isSelected
                                                        ? "bg-white/10 border-white/20 ring-1 ring-white/20"
                                                        : "bg-[#1A1A1A] border-white/5 hover:bg-white/5"
                                                )}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className={cn(
                                                        "text-sm font-bold truncate pr-1",
                                                        isSelected ? "text-white" : "text-white/70"
                                                    )}>{vType}</span>
                                                    {isCorp && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />}
                                                </div>
                                                <div className="text-xs font-bold text-[#64DD17]">
                                                    {formatPrice(variant.priceValue)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 🌟 PRICE BUTTON CARD (Common Across Tabs) */}
                <button
                    onClick={() => setActiveTab('MARKET')}
                    className="w-full bg-[#1A1A1A] rounded-2xl p-5 border border-white/10 mb-8 relative group overflow-hidden active:scale-[0.98] transition-all"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />

                    <div className="flex justify-between items-start mb-1">
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-black tracking-tighter text-white">
                                    {formatSimple(HYBRID_DATA.currentPrice)}
                                </span>
                                <span className="text-sm font-bold text-white/40 mt-2">원</span>
                            </div>
                        </div>
                        <LucideChevronRight className="text-white/20 group-hover:text-white/60 transition-colors" />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border", trendBg)}>
                                <LucideTrendingUp className={cn("w-3 h-3", trendColor, HYBRID_DATA.status === 'DOWN' && "rotate-180")} />
                                <span className={cn("text-xs font-bold", trendColor)}>
                                    {HYBRID_DATA.status === 'UP' ? '+' : (HYBRID_DATA.status === 'DOWN' ? '-' : '')}
                                    {formatSimple(HYBRID_DATA.changeAmount)} ({HYBRID_DATA.changeRate}%)
                                </span>
                            </div>
                            <span className="text-[10px] text-white/30">전일대비</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#64DD17]">실시간 시세 보기</span>
                    </div>
                </button>

                {/* Membership Type Selector */}
                {/* Membership Type Selector (Dropdown Style) */}


                {/* 1. COURSE GUIDE TAB */}
                {activeTab === 'COURSE' && (
                    <div className="space-y-10">
                        {/* Spec Bar */}
                        <div className="flex justify-between items-center py-4 relative bg-[#1A1A1A] rounded-2xl px-2 border border-white/5">
                            <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                            <div className="absolute right-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                            <div className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideMapPin className="w-3 h-3 text-[#64DD17]" /> 위치</span>
                                <span className="text-sm font-bold text-white">{HYBRID_DATA.originalRegion}</span>
                            </div>
                            <div className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideFlag className="w-3 h-3 text-[#64DD17]" /> 홀수</span>
                                <span className="text-sm font-bold text-white">
                                    {String(HYBRID_DATA.holes).endsWith('홀') ? HYBRID_DATA.holes : `${HYBRID_DATA.holes}홀`}
                                </span>
                            </div>
                            <div className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideLeaf className="w-3 h-3 text-[#64DD17]" /> 잔디</span>
                                <span className="text-sm font-bold text-center leading-tight text-white">중지</span>
                            </div>
                        </div>

                        {/* Club Information Section */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                                    <div className="w-1 h-4 bg-[#64DD17]" />
                                    클럽 정보
                                </h3>
                            </div>
                            <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 space-y-4">
                                {HYBRID_DATA.openDate && HYBRID_DATA.openDate !== '-' && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                            <LucideCalendarDays className="w-4 h-4 text-[#64DD17]" />
                                            개장일
                                        </span>
                                        <span className="text-sm font-bold text-white">{HYBRID_DATA.openDate}</span>
                                    </div>
                                )}
                                {HYBRID_DATA.address && HYBRID_DATA.address !== '-' && (
                                    <div className="flex justify-between items-start">
                                        <span className="text-xs font-bold text-white/40 flex items-center gap-2 shrink-0">
                                            <LucideMapPin className="w-4 h-4 text-[#64DD17]" />
                                            주소
                                        </span>
                                        <span className="text-sm font-bold text-white text-right">{HYBRID_DATA.address}</span>
                                    </div>
                                )}
                                {HYBRID_DATA.clubInfo.memberCount && HYBRID_DATA.clubInfo.memberCount !== '-' && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                            <LucideUsers className="w-4 h-4 text-[#64DD17]" />
                                            회원수
                                        </span>
                                        <span className="text-sm font-bold text-white">{HYBRID_DATA.clubInfo.memberCount}명</span>
                                    </div>
                                )}
                                {HYBRID_DATA.clubInfo.website && HYBRID_DATA.clubInfo.website !== '' && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                            <LucideGlobe className="w-4 h-4 text-[#64DD17]" />
                                            웹사이트
                                        </span>
                                        <a
                                            href={HYBRID_DATA.clubInfo.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            방문하기 →
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Analysis Chart */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                                    <div className="w-1 h-4 bg-amber-400" />
                                    코스 분석
                                </h3>
                            </div>
                            <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-white/40">DIFFICULTY</span>
                                    <span className="text-xs font-black text-white/50">정보 준비중</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full relative mb-3 flex items-center">
                                    <div className="h-full w-[50%] bg-white/20 rounded-full" />
                                </div>
                                <p className="text-[10px] text-white/40 italic text-center">코스 상세 분석은 순차적으로 업데이트 예정입니다.</p>

                                <div className="flex flex-wrap gap-2 mt-4">
                                    {HYBRID_DATA.tags.map(tag => (
                                        <span key={tag} className="px-2 py-1 rounded bg-white/5 text-[10px] font-bold text-white/50 border border-white/10">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Reviews Check - Rich Insight Cards */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h3 className="text-lg font-black italic tracking-widest uppercase mb-1 flex items-center gap-2">
                                        ⭐ 멤버 인사이트
                                    </h3>
                                    <p className="text-[10px] font-bold text-white/30">핵심 데이터 요약 카드 (총 1,240개)</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black text-amber-400 tracking-tighter">4.9</div>
                                    <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">전체 평점</div>
                                </div>
                            </div>

                            {REVIEWS.map(review => (
                                <div key={review.id} className="bg-[#1E1E1E] rounded-[2rem] p-6 relative overflow-hidden border border-white/5 shadow-lg">
                                    {/* Header Row: Profile (Left) & Score (Right) */}
                                    <div className="flex items-center justify-between mb-6">
                                        {/* Left: User Profile */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-xs text-white/40 shrink-0 border border-white/5">
                                                {review.user[0]}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black text-white">{review.user}</span>
                                                    {review.verified && <LucideCheckCircle2 className="w-3.5 h-3.5 text-[#64DD17]" />}
                                                    <div className="px-1.5 py-0.5 rounded bg-white/10 border border-white/5 text-[9px] font-bold text-[#FFD700]">
                                                        {review.tier}
                                                    </div>
                                                </div>
                                                <div className="text-[10px] text-white/30 font-bold mt-0.5">{review.date} • 30대 남성</div>
                                            </div>
                                        </div>

                                        {/* Right: Score Display */}
                                        <div className="text-2xl font-black text-[#64DD17] tracking-tighter leading-none flex items-center gap-1">
                                            🏆 {review.score}타
                                        </div>
                                    </div>

                                    {/* Section 2: Data Grid */}
                                    <div className="grid grid-cols-2 gap-6 relative mb-6">
                                        {/* Vertical Divider */}
                                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />

                                        {/* Left Column: Satisfaction */}
                                        <div className="space-y-3 pr-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">코스</span>
                                                <div className="flex items-center gap-1">
                                                    <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                    <span className="text-xs font-black text-white">{review.ratings.course}.0</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">그린</span>
                                                <div className="flex items-center gap-1">
                                                    <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                    <span className="text-xs font-black text-white">{review.ratings.green}.0</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">서비스</span>
                                                <div className="flex items-center gap-1">
                                                    <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                    <span className="text-xs font-black text-white">{review.ratings.service}.0</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Specs/Facts */}
                                        <div className="space-y-3 pl-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">스피드</span>
                                                <span className="text-xs font-black text-white">{review.specs.speed}m</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">그린피</span>
                                                <span className="text-xs font-black text-white">{review.specs.fee / 10000}만</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-white/40">난이도</span>
                                                <span className="text-xs font-black text-white">{review.specs.difficulty}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 3: Footer (Tags) */}
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                        {review.tags.map(tag => (
                                            <span key={tag} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 shrink-0">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. BENEFIT TAB */}
                {activeTab === 'BENEFIT' && (
                    <div className="space-y-6">
                        {/* Usage Fees Card */}
                        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 relative overflow-hidden">

                            <div className="flex justify-between items-end mb-4 relative z-10">
                                <h3 className="text-white/40 text-xs font-bold uppercase font-mono tracking-wider">Usage Fees Summary</h3>
                                <span className="text-[10px] text-amber-500/50 font-bold tracking-tight text-right">
                                    * 정회원 기준 (무기명 별도 문의)
                                </span>
                            </div>

                            <div className="relative z-10 bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                                {/* Table Header */}
                                <div className="grid grid-cols-3 bg-white/5 border-b border-white/5">
                                    <div className="p-3 text-center text-xs font-bold text-white/50">구분</div>
                                    <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주중</div>
                                    <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주말</div>
                                </div>

                                {/* Rows */}
                                <div className="divide-y divide-white/5 text-sm font-bold text-white">
                                    {/* Regular Member */}
                                    <div className="grid grid-cols-3">
                                        <div className="p-3 text-center bg-[#64DD17]/10 text-[#64DD17]">정회원</div>
                                        <div className="p-3 text-center border-l border-white/5">
                                            {HYBRID_DATA.greenFee.member > 0 ? `${formatMoney(HYBRID_DATA.greenFee.member)}원` : "문의"}
                                        </div>
                                        <div className="p-3 text-center border-l border-white/5">
                                            {HYBRID_DATA.greenFee.weekendMember > 0 ? `${formatMoney(HYBRID_DATA.greenFee.weekendMember)}원` : "문의"}
                                        </div>
                                    </div>
                                    {/* Family Member */}
                                    <div className="grid grid-cols-3">
                                        <div className="p-3 text-center text-white/80">가족회원</div>
                                        <div className="p-3 text-center border-l border-white/5 text-white/60">문의</div>
                                        <div className="p-3 text-center border-l border-white/5 text-white/60">문의</div>
                                    </div>
                                    {/* Non-Member */}
                                    <div className="grid grid-cols-3">
                                        <div className="p-3 text-center text-white/40">비회원</div>
                                        <div className="p-3 text-center border-l border-white/5 text-white/40">
                                            {HYBRID_DATA.greenFee.nonMember > 0 ? `${formatMoney(HYBRID_DATA.greenFee.nonMember)}원` : "문의"}
                                        </div>
                                        <div className="p-3 text-center border-l border-white/5 text-white/40">
                                            {HYBRID_DATA.greenFee.weekendNonMember > 0 ? `${formatMoney(HYBRID_DATA.greenFee.weekendNonMember)}원` : "문의"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Fees */}
                            <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
                                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                    <div className="text-[10px] font-bold text-white/40 mb-1">카트비 (팀당)</div>
                                    <div className="text-sm font-black text-white">
                                        {HYBRID_DATA.fees.cart > 0 ? `${formatMoney(HYBRID_DATA.fees.cart)}원` : "문의"}
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                    <div className="text-[10px] font-bold text-white/40 mb-1">캐디피 (팀당)</div>
                                    <div className="text-sm font-black text-white">
                                        {HYBRID_DATA.fees.caddy > 0 ? `${formatMoney(HYBRID_DATA.fees.caddy)}원` : "문의"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Membership Features Section */}
                        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 space-y-4">
                            <h3 className="text-white/40 text-xs font-bold uppercase mb-4 relative z-10 font-mono tracking-wider flex items-center gap-2">
                                <LucideInfo className="w-4 h-4 text-[#64DD17]" />
                                회원권 상세 정보
                            </h3>

                            {/* 회원 혜택 요약 */}
                            {membership.benefits.summary && membership.benefits.summary !== '' && (
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="text-xs font-bold text-[#64DD17] mb-2">회원권 설명</div>
                                    <p className="text-sm text-white/70 leading-relaxed">
                                        {membership.benefits.summary}
                                    </p>
                                </div>
                            )}

                            {/* 사용 제한 정보 (Summary와 내용이 다를 경우에만 표시) */}
                            {membership.benefits.usageLimit &&
                                membership.benefits.usageLimit !== '상세 혜택은 문의 바랍니다.' &&
                                membership.benefits.usageLimit !== membership.benefits.summary && (
                                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                        <div className="flex items-start gap-2">
                                            <LucideInfo className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="text-xs font-bold text-amber-400 mb-1">이용 안내</div>
                                                <p className="text-xs text-amber-200 font-medium leading-relaxed">
                                                    {membership.benefits.usageLimit}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                        </div>

                        {/* Benefit List */}
                        <div className="space-y-3">

                            {HYBRID_DATA.benefits.map((item, i) => (
                                <div key={i} className="flex gap-4 p-5 bg-[#1A1A1A] rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="mt-1 text-[#64DD17] p-2 bg-[#64DD17]/10 rounded-lg h-fit">{item.icon}</div>
                                    <div>
                                        <div className="font-bold text-lg text-white mb-1.5">{item.title}</div>
                                        <div className="text-sm text-white/50 leading-relaxed font-medium">{item.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Reservation Guide */}
                        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <LucideCalendarDays className="w-5 h-5 text-[#64DD17]" />
                                <h3 className="text-lg font-bold text-white">예약 방법 및 안내</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#64DD17] mt-2 shrink-0" />
                                    <div>
                                        <div className="text-sm font-bold text-white mb-1">예약 오픈 (Booking Open)</div>
                                        <div className="text-xs text-white/50 space-y-1">
                                            <p>• 주말 : 3주 전 화요일 09:00 오픈</p>
                                            <p>• 주중 : 4주 전 월요일 09:00 오픈</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                                    <div>
                                        <div className="text-sm font-bold text-white mb-1">위약 규정 (Cancellation)</div>
                                        <div className="text-xs text-white/50">
                                            <p>• 이용일 7일 전 17:00까지 취소 및 변경 가능</p>
                                            <p className="text-red-400/80 mt-1">* 이후 취소 시 위약금 발생 및 예약 정지</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="text-sm font-bold text-white">회원 예약실 문의</div>
                                    <a href={`tel:${HYBRID_DATA.phone}`} className="px-4 py-2 bg-[#64DD17]/10 text-[#64DD17] rounded-lg text-xs font-bold hover:bg-[#64DD17]/20 transition-colors flex items-center gap-2">
                                        <LucidePhone className="w-3 h-3" />
                                        {HYBRID_DATA.phone}
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* FAQ Section Added Here */}
                        <FAQSection />
                    </div>
                )}

                {/* 3. MARKET TAB */}
                {activeTab === 'MARKET' && (
                    <div className="space-y-6">
                        {/* Chart Card */}
                        <div className="h-64 rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between border border-white/5 bg-[#1A1A1A]">
                            {/* Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#1A1A1A] via-transparent to-[#1A1A1A] z-10 pointer-events-none" />
                            <div className="flex justify-between items-start z-10 w-full mb-4">
                                <div>
                                    <span className="text-xs font-bold text-white/40 block mb-1">시세추이</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-black text-white tracking-tight">상승세 지속</span>
                                        <LucideTrendingUp className="w-4 h-4 text-red-500" />
                                    </div>
                                </div>

                                {/* Time Range Selector */}
                                <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5">
                                    {['1년', '2년', '전체'].map((range, i) => (
                                        <button
                                            key={range}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                                                i === 0 ? "bg-[#64DD17] text-[#09090b]" : "text-white/40 hover:text-white"
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SVG Wave Chart */}
                            <div className="absolute bottom-0 left-0 right-0 h-40">
                                <svg viewBox="0 0 100 50" className="w-full h-full transform scale-x-125 origin-bottom" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="waveGrad" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0,40 C10,35 20,45 30,30 C40,20 50,25 60,15 C70,10 80,12 90,5 L100,0 L100,50 L0,50 Z" fill="url(#waveGrad)" />
                                    <path d="M0,40 C10,35 20,45 30,30 C40,20 50,25 60,15 C70,10 80,12 90,5 L100,0" fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                </svg>
                            </div>
                        </div>

                        {/* Order Book Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-blue-500/20 flex flex-col items-center text-center hover:bg-[#1A1A1A]/80 transition-colors">
                                <span className="text-xs text-blue-400 font-bold mb-1">즉시 판매가</span>
                                <span className="text-2xl font-black text-white tracking-tight">{HYBRID_DATA.buyPrice}</span>
                                <span className="text-[10px] text-white/30 mt-1">대기 3명</span>
                            </div>
                            <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-red-500/20 flex flex-col items-center text-center hover:bg-[#1A1A1A]/80 transition-colors">
                                <span className="text-xs text-red-400 font-bold mb-1">즉시 구매가</span>
                                <span className="text-2xl font-black text-white tracking-tight">{HYBRID_DATA.sellPrice}</span>
                                <span className="text-[10px] text-white/30 mt-1">대기 1명</span>
                            </div>
                        </div>

                        {/* Transaction History (New Section) */}
                        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 space-y-4">
                            <h3 className="text-white/40 text-xs font-bold uppercase mb-2 relative z-10 font-mono tracking-wider">Recent Transactions</h3>

                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map((_, i) => {
                                    const date = new Date();
                                    date.setDate(date.getDate() - i * 3 - 1);
                                    const priceVariation = (Math.random() - 0.5) * 5000000;
                                    const txPrice = HYBRID_DATA.currentPrice + priceVariation;

                                    return (
                                        <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 -mx-2 rounded transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-white/40">
                                                    {date.getFullYear()}.{String(date.getMonth() + 1).padStart(2, '0')}.{String(date.getDate()).padStart(2, '0')}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-black text-white">{formatMoney(Math.floor(txPrice / 10000) * 10000)}원</div>
                                                <div className="text-[10px] font-bold text-[#64DD17]">거래완료</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. CALCULATOR TAB */}
                {activeTab === 'CALC' && (
                    <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center gap-2 mb-8 text-[#64DD17]">
                            <LucideCalculator className="w-5 h-5" />
                            <span className="font-bold text-lg">예상 매입 비용 상세</span>
                        </div>

                        <div className="space-y-5 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-white/50 font-medium">회원권 가격</span>
                                <span className="text-white font-bold text-base">{formatMoney(HYBRID_DATA.currentPrice)} 원</span>
                            </div>
                            <div className="h-px bg-white/5 my-1" />
                            <div className="flex justify-between items-center">
                                <span className="text-white/50 font-medium">취득세 (2.2%)</span>
                                <span className="text-white/80 font-bold">+ {formatMoney(tax)} 원</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-white/50 font-medium">중개수수료 (0.3%)</span>
                                <span className="text-white/80 font-bold">+ {formatMoney(commission)} 원</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-white/50 font-medium">명의개서료</span>
                                <span className="text-white/80 font-bold">+ {formatMoney(HYBRID_DATA.fees.transfer)} 원</span>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-dashed border-white/10">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-white/60">총 필요 자금</span>
                                <span className="text-2xl font-black text-[#64DD17] tracking-tighter">{formatMoney(totalCost)} 원</span>
                            </div>
                            <p className="text-[10px] text-white/30 mt-3 text-right">* 인지세 등 기타 실비는 제외된 금액입니다.</p>
                        </div>
                    </div>
                )}
            </main>

            {/* D. STICKY ACTION FOOTER (Exchange Focus) */}
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-[#050505]/80 backdrop-blur-xl border-t border-white/10 flex gap-4 z-50 pb-8">
                <button className="flex-[0.8] h-14 rounded-2xl bg-[#1A1A1A] text-white font-bold text-sm border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors active:scale-95">
                    <LucidePhone className="w-4 h-4" />
                    문의
                </button>
                <button
                    onClick={() => {
                        setOrderType('BUY');
                        setIsOrderModalOpen(true);
                    }}
                    className="flex-[1.2] h-14 rounded-2xl bg-[#64DD17] text-[#050505] font-black text-lg flex items-center justify-center shadow-[0_0_20px_rgba(100,221,23,0.2)] hover:bg-[#52c41a] transition-all active:scale-95"
                >
                    매수/매도 신청
                </button>
            </div>

            <OrderModal
                isOpen={isOrderModalOpen}
                onClose={() => setIsOrderModalOpen(false)}
                type={orderType}
                defaultPrice={HYBRID_DATA.currentPrice}
            />
        </div>
    );
}
