import React, { useState } from 'react';
import {
    LucideChevronDown,
    LucideChevronRight,
    LucideTrendingUp
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from '../data/membershipData';
import OrderModal from '../components/OrderModal';
import { formatSimple } from '@/lib/membershipUtils';

// Hooks
import { useMembershipData } from '../hooks/useMembershipData';

// Components
import { MembershipHero } from '../components/membership/MembershipHero';
import { MembershipTabs } from '../components/membership/MembershipTabs';
import { MembershipCourseTab } from '../components/membership/MembershipCourseTab';
import { MembershipBenefitTab } from '../components/membership/MembershipBenefitTab';
import { MembershipMarketTab } from '../components/membership/MembershipMarketTab';
import { MembershipCalcTab } from '../components/membership/MembershipCalcTab';
import { MembershipActionFooter } from '../components/membership/MembershipActionFooter';

export default function MembershipDetail() {
    const [match, params] = useRoute("/golf/membership/:id");
    const [_location, setLocation] = useLocation();
    const membershipId = match ? params.id : "1";

    const {
        membership,
        variants,
        currentVariantType,
        hybridData
    } = useMembershipData(membershipId);

    const [activeTab, setActiveTab] = useState<'COURSE' | 'BENEFIT' | 'MARKET' | 'CALC' | any>('COURSE');
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');

    const handleTabChange = (newTab: typeof activeTab) => {
        setActiveTab(newTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 계산기 데이터
    const commission = hybridData.currentPrice * hybridData.fees.commissionRate;
    const tax = hybridData.currentPrice * hybridData.fees.taxRate;
    const totalCost = hybridData.currentPrice + commission + tax + hybridData.fees.transfer;

    // Trend UI Logic
    const trendColor = hybridData.status === 'UP' ? 'text-red-500' : (hybridData.status === 'DOWN' ? 'text-blue-500' : 'text-white/40');
    const trendBg = hybridData.status === 'UP' ? 'bg-red-500/10 border-red-500/20' : (hybridData.status === 'DOWN' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-white/5 border-white/10');

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans pb-32 relative overflow-x-hidden">
            <MembershipHero
                data={hybridData}
                onBack={() => window.history.back()}
            />

            <MembershipTabs
                activeTab={activeTab}
                onChange={handleTabChange}
                category={hybridData.category}
            />

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
                                        const vType = variant.name.includes(hybridData.name)
                                            ? variant.name.replace(hybridData.name, '').trim() || '일반'
                                            : variant.name;
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
                                                    {formatPrice(variant.price.current)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Price Summary Button */}
                <button
                    onClick={() => setActiveTab('MARKET')}
                    className="w-full bg-[#1A1A1A] rounded-2xl p-5 border border-white/10 mb-8 relative group overflow-hidden active:scale-[0.98] transition-all"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />

                    <div className="flex justify-between items-start mb-1">
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-black tracking-tighter text-white">
                                    {formatSimple(hybridData.currentPrice)}
                                </span>
                                <span className="text-sm font-bold text-white/40 mt-2">원</span>
                            </div>
                        </div>
                        <LucideChevronRight className="text-white/20 group-hover:text-white/60 transition-colors" />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border", trendBg)}>
                                <LucideTrendingUp className={cn("w-3 h-3", trendColor, hybridData.status === 'DOWN' && "rotate-180")} />
                                <span className={cn("text-xs font-bold", trendColor)}>
                                    {hybridData.status === 'UP' ? '+' : (hybridData.status === 'DOWN' ? '-' : '')}
                                    {formatSimple(hybridData.changeAmount)} ({hybridData.changeRate}%)
                                </span>
                            </div>
                            <span className="text-[10px] text-white/30">전일대비</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#64DD17]">실시간 시세 보기</span>
                    </div>
                </button>

                {/* Tab Content */}
                {activeTab === 'COURSE' && <MembershipCourseTab data={hybridData} />}
                {activeTab === 'BENEFIT' && <MembershipBenefitTab data={hybridData} />}
                {activeTab === 'MARKET' && <MembershipMarketTab data={hybridData} />}
                {activeTab === 'CALC' && (
                    <MembershipCalcTab
                        data={hybridData}
                        tax={tax}
                        commission={commission}
                        totalCost={totalCost}
                    />
                )}
            </main>

            <MembershipActionFooter
                phone={hybridData.phone}
                onBuySell={() => {
                    setOrderType('BUY');
                    setIsOrderModalOpen(true);
                }}
            />

            <OrderModal
                isOpen={isOrderModalOpen}
                onClose={() => setIsOrderModalOpen(false)}
                type={orderType}
                defaultPrice={hybridData.currentPrice}
                courseName={hybridData.name}
            />
        </div>
    );
}
