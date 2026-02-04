import { LucideCalculator } from "lucide-react";
import { formatMoney } from "@/lib/membershipUtils";

interface MembershipCalcTabProps {
    data: any;
    tax: number;
    commission: number;
    totalCost: number;
}

export function MembershipCalcTab({ data, tax, commission, totalCost }: MembershipCalcTabProps) {
    return (
        <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-2 mb-8 text-[#64DD17]">
                <LucideCalculator className="w-5 h-5" />
                <span className="font-bold text-lg">예상 매입 비용 상세</span>
            </div>

            <div className="space-y-5 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-white/50 font-medium">회원권 가격</span>
                    <span className="text-white font-bold text-base">{formatMoney(data.currentPrice)} 원</span>
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
                    <span className="text-white/80 font-bold">+ {formatMoney(data.fees.transfer)} 원</span>
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
    );
}
