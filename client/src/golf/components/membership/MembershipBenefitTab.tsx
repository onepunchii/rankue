import { LucideInfo, LucideCalendarDays, LucidePhone } from "lucide-react";
import { FAQSection } from "./FAQSection";
import { formatMoney } from "@/lib/membershipUtils";

interface MembershipBenefitTabProps {
    data: any;
}

export function MembershipBenefitTab({ data }: MembershipBenefitTabProps) {
    if (data.category === 'Fitness') {
        return (
            <div className="space-y-6">
                {/* 1. Facility Info (Hotel, Hours, Closed Days) */}
                <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="flex justify-between items-end mb-4 relative z-10">
                        <h3 className="text-white/40 text-xs font-bold uppercase font-mono tracking-wider">시설 이용 안내 (Facility Info)</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-1.5">호텔명 (Hotel Name)</div>
                            <div className="text-sm font-bold text-white">{data.clubInfo?.vendor || '-'}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-1.5">운영시간 (Operating Hours)</div>
                            <div className="text-sm font-bold text-white whitespace-pre-line">{data.clubInfo?.operatingHours || '-'}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-1.5">정기 휴장일 (Closed Days)</div>
                            <div className="text-sm font-bold text-white text-red-400">{data.clubInfo?.closedDays || '-'}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-1.5">주요 시설 (Facilities)</div>
                            <div className="flex gap-2">
                                {data.spec?.facility?.hasGym && <span className="px-2 py-1 bg-white/10 rounded text-xs text-white">체련장</span>}
                                {data.spec?.facility?.hasPool && <span className="px-2 py-1 bg-white/10 rounded text-xs text-white">수영장</span>}
                                {data.spec?.facility?.hasSauna && <span className="px-2 py-1 bg-white/10 rounded text-xs text-white">사우나</span>}
                                {data.spec?.facility?.hasGolfRange && <span className="px-2 py-1 bg-white/10 rounded text-xs text-white">골프연습장</span>}
                            </div>
                        </div>
                    </div>

                    {data.spec?.facilityInfo && (
                        <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/5 relative z-10">
                            <div className="text-xs font-bold text-[#64DD17] mb-2">시설 상세 안내</div>
                            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
                                {data.spec.facilityInfo}
                            </p>
                        </div>
                    )}
                </div>

                {/* 2. Membership Fees (Annual Fee, Transfer Fee) */}
                <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <h3 className="text-white/40 text-xs font-bold uppercase mb-4 relative z-10 font-mono tracking-wider">
                        회원권 비용 안내 (Membership Fees)
                    </h3>
                    <div className="grid grid-cols-2 gap-4 relative z-10">
                        {/* Annual Fee */}
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-2">연회비 (Annual Fee)</div>
                            <div className="space-y-2">
                                {data.spec?.annualFee?.personal > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-white/60">개인</span>
                                        <span className="font-bold text-white">{formatMoney(data.spec.annualFee.personal)}원</span>
                                    </div>
                                )}
                                {data.spec?.annualFee?.couple > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-white/60">부부</span>
                                        <span className="font-bold text-white">{formatMoney(data.spec.annualFee.couple)}원</span>
                                    </div>
                                )}
                                {data.spec?.annualFee?.corporate > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-white/60">법인</span>
                                        <span className="font-bold text-white">{formatMoney(data.spec.annualFee.corporate)}원</span>
                                    </div>
                                )}
                                {!data.spec?.annualFee?.personal && !data.spec?.annualFee?.couple && !data.spec?.annualFee?.corporate && (
                                    <span className="text-sm text-white/40">문의</span>
                                )}
                            </div>
                        </div>

                        {/* Transfer Fee */}
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs font-bold text-white/40 mb-2">명의개서료 (Transfer Fee)</div>
                            <div className="text-lg font-black text-white">
                                {data.fees?.transfer > 0 ? `${formatMoney(data.fees.transfer)}원` : "문의"}
                            </div>
                            <div className="mt-2 text-[10px] text-white/30">
                                * 취득세 별도 (매매가의 2.2%)
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Membership Privileges */}
                {data.spec?.complimentary && (
                    <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 space-y-4">
                        <h3 className="text-white/40 text-xs font-bold uppercase mb-2 relative z-10 font-mono tracking-wider flex items-center gap-2">
                            <LucideInfo className="w-4 h-4 text-[#64DD17]" />
                            회원 특전 (Benefits)
                        </h3>
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <p className="text-sm text-amber-200/90 leading-relaxed whitespace-pre-line font-medium">
                                {data.spec.complimentary}
                            </p>
                        </div>
                    </div>
                )}

                <FAQSection />
            </div>
        );
    }

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
                    {data.feeTable && data.feeTable.length > 0 ? (
                        <>
                            {/* Detailed Fee Table */}
                            {/* Detailed Fee Table */}
                            <div className="overflow-x-auto">
                                <div className="min-w-[900px]">
                                    <div className="grid grid-cols-8 bg-white/5 border-b border-white/5">
                                        <div className="p-3 text-center text-xs font-bold text-white/50">구분</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">정회원</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">가족회원</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">지정인1</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">지정인2</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주중정회원</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주중가족</div>
                                        <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">비회원</div>
                                    </div>
                                    <div className="divide-y divide-white/5 text-sm font-bold text-white">
                                        {data.feeTable.map((row: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-8 hover:bg-white/5 transition-colors">
                                                <div className="p-3 text-center text-white/60">{row.division}</div>
                                                <div className="p-3 text-center border-l border-white/5 text-[#64DD17]">
                                                    {row.member > 0 ? `${formatMoney(row.member)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/80">
                                                    {row.familyMember > 0 ? `${formatMoney(row.familyMember)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/80">
                                                    {row.designated1 > 0 ? `${formatMoney(row.designated1)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/80">
                                                    {row.designated2 > 0 ? `${formatMoney(row.designated2)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/80">
                                                    {row.weekdayMember > 0 ? `${formatMoney(row.weekdayMember)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/80">
                                                    {row.weekdayFamilyMember > 0 ? `${formatMoney(row.weekdayFamilyMember)}원` : "-"}
                                                </div>
                                                <div className="p-3 text-center border-l border-white/5 text-white/40">
                                                    {row.nonMember > 0 ? `${formatMoney(row.nonMember)}원` : "-"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Legacy Simple Table */}
                            <div className="grid grid-cols-3 bg-white/5 border-b border-white/5">
                                <div className="p-3 text-center text-xs font-bold text-white/50">구분</div>
                                <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주중</div>
                                <div className="p-3 text-center text-xs font-bold text-white/50 border-l border-white/5">주말</div>
                            </div>

                            <div className="divide-y divide-white/5 text-sm font-bold text-white">
                                <div className="grid grid-cols-3">
                                    <div className="p-3 text-center bg-[#64DD17]/10 text-[#64DD17]">정회원</div>
                                    <div className="p-3 text-center border-l border-white/5">
                                        {data.greenFee.member > 0 ? `${formatMoney(data.greenFee.member)}원` : "문의"}
                                    </div>
                                    <div className="p-3 text-center border-l border-white/5">
                                        {data.greenFee.weekendMember > 0 ? `${formatMoney(data.greenFee.weekendMember)}원` : "문의"}
                                    </div>
                                </div>
                                <div className="grid grid-cols-3">
                                    <div className="p-3 text-center text-white/80">가족회원</div>
                                    <div className="p-3 text-center border-l border-white/5 text-white/60">
                                        {data.greenFee.family > 0 ? `${formatMoney(data.greenFee.family)}원` : "문의"}
                                    </div>
                                    <div className="p-3 text-center border-l border-white/5 text-white/60">문의</div>
                                </div>
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
                        </>
                    )}
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

                {/* Fee Remarks */}
                {data.intro?.feeRemarks && (
                    <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl relative z-10">
                        <div className="flex items-start gap-2">
                            <LucideInfo className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="text-xs font-bold text-amber-400 mb-1">요금 특이사항</div>
                                <p className="text-xs text-amber-200/80 leading-relaxed font-medium whitespace-pre-line">
                                    {data.intro.feeRemarks}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Membership Features Section */}
            <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/5 space-y-4">
                <h3 className="text-white/40 text-xs font-bold uppercase mb-4 relative z-10 font-mono tracking-wider flex items-center gap-2">
                    <LucideInfo className="w-4 h-4 text-[#64DD17]" />
                    회원권 상세 정보
                </h3>

                {/* Source migrated from the old flat clubInfo.summary/usageLimit to the nested
                    intro.{desc,features} shape produced by useMembershipData. */}
                {data.intro?.desc && data.intro.desc !== '' && (
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-xs font-bold text-[#64DD17] mb-2">회원권 설명</div>
                        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
                            {data.intro.desc}
                        </p>
                    </div>
                )}

                {data.intro?.features &&
                    data.intro.features !== '' &&
                    data.intro.features !== '상세 혜택은 문의 바랍니다.' &&
                    data.intro.features !== data.intro.desc && (
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="flex items-start gap-2">
                                <LucideInfo className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-xs font-bold text-amber-400 mb-1">이용 안내</div>
                                    <p className="text-xs text-amber-200 font-medium leading-relaxed whitespace-pre-line">
                                        {data.intro.features}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
            </div>

            {/* Benefit List */}
            <div className="space-y-3">
                {data.benefits?.map((item: any, i: number) => (
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
