import React, { useState } from 'react';
import {
    LucideChevronDown,
    LucideChevronRight
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from '../data/membershipData';
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

    const handleTabChange = (newTab: typeof activeTab) => {
        setActiveTab(newTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 계산기 데이터
    const commission = hybridData.currentPrice * hybridData.fees.commissionRate;
    const tax = hybridData.currentPrice * hybridData.fees.taxRate;
    const totalCost = hybridData.currentPrice + commission + tax + hybridData.fees.transfer;

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

                    {/* 등락 배지는 두지 않는다(2026-10-06) — 이 자료엔 전일 값이 없어 방향과 %를 지어내고 있었다.
                        날짜는 자료 날짜를 알 때만 적는다. */}
                    <div className="flex items-center justify-between gap-2">
                        {hybridData.priceAsOfLabel && (
                            <span className="text-[12px] text-[#FFFFFF66]">{hybridData.priceAsOfLabel}</span>
                        )}
                        <span className="ml-auto text-[12px] font-bold text-[#64DD17]">시세 보기</span>
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

            {/* 거래(매수/매도 주문)는 2026-09-09 오너 결정으로 뺐다 — 시세·코스 정보만 남긴다 */}
            {/* 하단 단추는 자료에 있는 연락 길 하나만 그린다(2026-10-06) — 번호가 있으면 전화, 없으면 홈페이지(새 창), 둘 다 없으면 그리지 않는다.
                예전엔 번호 자리에 홈페이지 주소가 들어가 tel:http://… 로 걸렸다. 골프·콘도 종목은 자료에 번호가 없어 홈페이지로 나간다.
                무엇을 그릴지는 MembershipActionFooter 가 정한다. */}
            <MembershipActionFooter phone={hybridData.phone} homepage={hybridData.clubInfo.website} />
        </div>
    );
}
