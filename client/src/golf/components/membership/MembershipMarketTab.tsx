import { LucideTrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/membershipUtils";

interface MembershipMarketTabProps {
    data: any;
}

export function MembershipMarketTab({ data }: MembershipMarketTabProps) {
    return (
        <div className="space-y-6">
            {/* Chart Card */}
            <div className="h-64 rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between border border-white/5 bg-[#1A1A1A]">
                <div className="absolute inset-0 bg-gradient-to-r from-[#1A1A1A] via-transparent to-[#1A1A1A] z-10 pointer-events-none" />
                <div className="flex justify-between items-start z-10 w-full mb-4">
                    <div>
                        <span className="text-xs font-bold text-white/40 block mb-1">시세추이</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-white tracking-tight">상승세 지속</span>
                            <LucideTrendingUp className="w-4 h-4 text-red-500" />
                        </div>
                    </div>

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
                    <span className="text-2xl font-black text-white tracking-tight">{data.buyPrice}</span>
                    <span className="text-[10px] text-white/30 mt-1">대기 3명</span>
                </div>
                <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-red-500/20 flex flex-col items-center text-center hover:bg-[#1A1A1A]/80 transition-colors">
                    <span className="text-xs text-red-400 font-bold mb-1">즉시 구매가</span>
                    <span className="text-2xl font-black text-white tracking-tight">{data.sellPrice}</span>
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
                        const txPrice = data.currentPrice + priceVariation;

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
    );
}
