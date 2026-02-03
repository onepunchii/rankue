import React, { useState } from 'react';
import { LucideMinus, LucidePlus, LucideX, LucideCheckCircle2, LucideInfo, LucideCalculator } from 'lucide-react';
import { cn } from "@/lib/utils";

interface OrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'BUY' | 'SELL'; // 매수인지 매도인지
    defaultPrice: number; // 현재 시세
}

const formatMoney = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

export default function OrderModal({ isOpen, onClose, type, defaultPrice }: OrderModalProps) {
    const [mode, setMode] = useState<'BUY' | 'SELL'>(type);
    const [price, setPrice] = useState(defaultPrice);
    const [purchasePrice, setPurchasePrice] = useState<number>(0);
    const [step, setStep] = useState(1); // 1: 입력, 2: 완료

    if (!isOpen) return null;

    // [매수] 4대 비용 계산기 (정밀 로직)
    const calculateBuyCost = () => {
        // 1. 중개 수수료 (0.3% 가정)
        const brokerage = Math.floor(price * 0.003);

        // 2. 취득세 (2.2% 고정)
        const acqTax = Math.floor(price * 0.022);

        // 3. 명의개서료 (골프장 납부 실비, 보통 33~99만원 수준. 66만원 평군가 적용)
        const transferFee = 660000;

        // 4. 정부 수입 인지세 (구간별 고정액 적용)
        let stampDuty = 0;
        if (price > 1000000000) stampDuty = 350000;      // 10억 초과
        else if (price > 100000000) stampDuty = 150000;   // 1억 ~ 10억
        else if (price > 50000000) stampDuty = 70000;    // 5천 ~ 1억
        else if (price > 30000000) stampDuty = 40000;    // 3천 ~ 5천
        else stampDuty = 20000;

        const totalCost = price + brokerage + acqTax + transferFee + stampDuty;

        return { brokerage, acqTax, transferFee, stampDuty, totalCost };
    };

    const buyData = calculateBuyCost();

    // [매도] 양도소득세 계산기
    const calculateSellData = () => {
        const commission = Math.floor(price * 0.003); // 중개 수수료
        const profit = price - purchasePrice - commission;

        // 간단한 양도세 계산 (수익의 약 20% 가정, 기본공제 제외 단순화)
        const estimatedTax = profit > 0 ? Math.floor(profit * 0.2) : 0;
        const actualReturn = price - commission - estimatedTax;

        return { commission, profit, estimatedTax, actualReturn };
    };

    const sellData = calculateSellData();

    const handleSubmit = () => {
        // 여기에 API 전송 로직 들어감 (DB에 주문 저장)
        setTimeout(() => setStep(2), 500); // 0.5초 뒤 완료 화면
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-md bg-[#18181b] rounded-t-3xl border-t border-white/10 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    title="닫기"
                    className="absolute top-4 right-4 z-[70] w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                >
                    <LucideX className="w-5 h-5" />
                </button>

                {/* 1. Header (Tab) */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => {
                            setMode('BUY');
                            setStep(1);
                        }}
                        className={cn("flex-1 py-4 font-black text-lg transition-colors", mode === 'BUY' ? "bg-red-500/10 text-red-500 border-b-2 border-red-500" : "text-white/30")}
                    >
                        살래요 (매수)
                    </button>
                    <button
                        onClick={() => {
                            setMode('SELL');
                            setStep(1);
                        }}
                        className={cn("flex-1 py-4 font-black text-lg transition-colors", mode === 'SELL' ? "bg-blue-500/10 text-blue-500 border-b-2 border-blue-500" : "text-white/30")}
                    >
                        팔래요 (매도)
                    </button>
                </div>

                {/* 2. Content */}
                <div className="p-6">
                    {step === 1 ? (
                        <>
                            {/* 가격 입력기 (Stepper) */}
                            <label className="text-xs font-bold text-white/50 mb-2 block">
                                {mode === 'BUY' ? '희망 매수 가격' : '희망 매도 가격'}
                            </label>

                            <div className="flex items-center justify-between bg-black/50 rounded-2xl p-2 border border-white/10 mb-6">
                                <button onClick={() => setPrice(p => Math.max(0, p - 1000000))} title="가격 감소" className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 text-white/70">
                                    <LucideMinus className="w-5 h-5" />
                                </button>
                                <div className="text-center">
                                    <div className={cn("text-2xl font-black tracking-tight", mode === 'BUY' ? "text-red-500" : "text-blue-500")}>
                                        {formatMoney(price)}
                                    </div>
                                    <div className="text-[10px] text-white/30">원</div>
                                </div>
                                <button onClick={() => setPrice(p => p + 1000000)} title="가격 증가" className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 text-white/70">
                                    <LucidePlus className="w-5 h-5" />
                                </button>
                            </div>

                            {/* [매수용] 4대 비용 상세 견적서 */}
                            {mode === 'BUY' ? (
                                <div className="bg-white/5 rounded-2xl p-5 mb-6 animate-in fade-in border border-white/5">
                                    <div className="flex items-center gap-2 mb-4 text-red-500">
                                        <LucideInfo className="w-4 h-4" />
                                        <span className="text-xs font-bold">매수 시 예상 소요 비용</span>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-white/50">회원권 가격</span>
                                            <span className="font-bold text-white">{formatMoney(price)}원</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/50">중개 수수료 (0.3%)</span>
                                            <span className="text-white/70">+ {formatMoney(buyData.brokerage)}원</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/50">취득세 (2.2%)</span>
                                            <span className="text-white/70">+ {formatMoney(buyData.acqTax)}원</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/50">명의개서료</span>
                                            <span className="text-white/70">+ {formatMoney(buyData.transferFee)}원</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/50">수입인지세</span>
                                            <span className="text-white/70">+ {formatMoney(buyData.stampDuty)}원</span>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-dashed border-white/20 flex justify-between items-center">
                                        <span className="font-bold text-white">총 필요 예산</span>
                                        <span className="text-xl font-black text-red-500">
                                            {formatMoney(buyData.totalCost)}원
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                /* [매도용] 양도세 계산 카드 */
                                <div className="space-y-4 mb-6 animate-in fade-in">
                                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                                        <div className="flex items-center gap-2 mb-4 text-blue-400">
                                            <LucideCalculator className="w-4 h-4" />
                                            <span className="text-xs font-bold">양도소득세 모의 계산</span>
                                        </div>

                                        <div className="mb-4">
                                            <label className="text-[10px] text-white/40 font-bold mb-1.5 block uppercase tracking-wider">과거 취득 금액 (내가 산 가격)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={purchasePrice || ''}
                                                    onChange={(e) => setPurchasePrice(Number(e.target.value))}
                                                    placeholder="예: 150000000"
                                                    className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-4 text-white font-bold focus:border-blue-500 outline-none transition-all placeholder:text-white/10"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/20">원</span>
                                            </div>
                                        </div>

                                        {purchasePrice > 0 && (
                                            <div className="space-y-2 text-sm pt-2 border-t border-white/5 mt-2 animate-in fade-in slide-in-from-top-1">
                                                <div className="flex justify-between">
                                                    <span className="text-white/50">매도 차익</span>
                                                    <span className={cn("font-bold", sellData.profit > 0 ? "text-red-400" : "text-white/40")}>
                                                        {formatMoney(sellData.profit)}원
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-white/50">중개 수수료</span>
                                                    <span className="text-white/70">- {formatMoney(sellData.commission)}원</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-white/50">예상 양도세 (약 20%)</span>
                                                    <span className="text-blue-400 font-bold">- {formatMoney(sellData.estimatedTax)}원</span>
                                                </div>
                                                <div className="mt-3 pt-3 border-t border-dashed border-white/20 flex justify-between items-center">
                                                    <span className="font-bold text-white">최종 정산 예정액</span>
                                                    <span className="text-xl font-black text-blue-500">
                                                        {formatMoney(sellData.actualReturn)}원
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {!purchasePrice && (
                                            <p className="text-[10px] text-white/30 text-center leading-relaxed py-2">
                                                취득가를 입력하시면 예상 세금을 제외한<br />실제 수령 금액을 미리 계산해볼 수 있습니다.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 연락처 입력 */}
                            <div className="mb-8">
                                <label className="text-xs font-bold text-white/50 mb-2 block">연락받으실 번호</label>
                                <input
                                    type="tel"
                                    placeholder="010-0000-0000"
                                    className="w-full h-12 bg-black/50 border border-white/10 rounded-xl px-4 text-white focus:border-[#64DD17] outline-none transition-colors"
                                />
                                <p className="text-[10px] text-white/30 mt-2">
                                    * 호가 접수 시 담당 딜러가 매칭 후 연락드립니다.
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button onClick={onClose} className="flex-1 h-14 rounded-xl bg-white/5 text-white/60 font-bold hover:bg-white/10 transition-colors">
                                    취소
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className={cn(
                                        "flex-[2] h-14 rounded-xl font-black text-lg text-white shadow-lg active:scale-95 transition-all",
                                        mode === 'BUY' ? "bg-red-600 hover:bg-red-500 shadow-red-900/20" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20"
                                    )}
                                >
                                    {mode === 'BUY' ? '매수 호가 넣기' : '매도 호가 넣기'}
                                </button>
                            </div>
                        </>
                    ) : (
                        // Step 2: 완료 화면
                        <div className="py-10 text-center animate-in zoom-in-95">
                            <div className="w-16 h-16 bg-[#64DD17]/20 rounded-full flex items-center justify-center mx-auto mb-4 text-[#64DD17]">
                                <LucideCheckCircle2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-2">호가 접수 완료!</h3>
                            <p className="text-white/50 text-sm mb-8">
                                담당 딜러가 내용을 확인하고<br />
                                30분 이내에 연락드리겠습니다.
                            </p>
                            <button onClick={onClose} className="w-full h-14 rounded-xl bg-[#64DD17] text-[#09090b] font-black text-lg active:scale-95 transition-all shadow-lg shadow-[#64DD17]/20">
                                확인
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
