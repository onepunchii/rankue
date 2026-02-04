import { LucideInfo, LucideCalendarDays, LucidePhone } from "lucide-react";
import { FAQSection } from "./FAQSection";
import { formatMoney } from "@/lib/membershipUtils";

interface MembershipBenefitTabProps {
    data: any;
}

export function MembershipBenefitTab({ data }: MembershipBenefitTabProps) {
    return (
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
                                {data.greenFee.member > 0 ? `${formatMoney(data.greenFee.member)}원` : "문의"}
                            </div>
                            <div className="p-3 text-center border-l border-white/5">
                                {data.greenFee.weekendMember > 0 ? `${formatMoney(data.greenFee.weekendMember)}원` : "문의"}
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
                                {data.greenFee.nonMember > 0 ? `${formatMoney(data.greenFee.nonMember)}원` : "문의"}
                            </div>
                            <div className="p-3 text-center border-l border-white/5 text-white/40">
                                {data.greenFee.weekendNonMember > 0 ? `${formatMoney(data.greenFee.weekendNonMember)}원` : "문의"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Fees */}
                <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
                    <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                        <div className="text-[10px] font-bold text-white/40 mb-1">카트비 (팀당)</div>
                        <div className="text-sm font-black text-white">
                            {data.fees.cart > 0 ? `${formatMoney(data.fees.cart)}원` : "문의"}
                        </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                        <div className="text-[10px] font-bold text-white/40 mb-1">캐디피 (팀당)</div>
                        <div className="text-sm font-black text-white">
                            {data.fees.caddy > 0 ? `${formatMoney(data.fees.caddy)}원` : "문의"}
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

                {data.clubInfo.summary && data.clubInfo.summary !== '' && (
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-xs font-bold text-[#64DD17] mb-2">회원권 설명</div>
                        <p className="text-sm text-white/70 leading-relaxed">
                            {data.clubInfo.summary}
                        </p>
                    </div>
                )}

                {data.clubInfo.usageLimit &&
                    data.clubInfo.usageLimit !== '상세 혜택은 문의 바랍니다.' &&
                    data.clubInfo.usageLimit !== data.clubInfo.summary && (
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="flex items-start gap-2">
                                <LucideInfo className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-xs font-bold text-amber-400 mb-1">이용 안내</div>
                                    <p className="text-xs text-amber-200 font-medium leading-relaxed">
                                        {data.clubInfo.usageLimit}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
            </div>

            {/* Benefit List */}
            <div className="space-y-3">
                {data.benefits.map((item: any, i: number) => (
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
                        <a href={`tel:${data.phone}`} className="px-4 py-2 bg-[#64DD17]/10 text-[#64DD17] rounded-lg text-xs font-bold hover:bg-[#64DD17]/20 transition-colors flex items-center gap-2">
                            <LucidePhone className="w-3 h-3" />
                            {data.phone}
                        </a>
                    </div>
                </div>
            </div>

            <FAQSection />
        </div>
    );
}
