import { LucideCircleDollarSign, LucideTag, LucideZap, LucideUsers, LucideMinus, LucidePlus, LucideCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const SPECIAL_OPTIONS = [
    { id: 'couple_2', label: '2인 플레이' },
    { id: 'player_3', label: '3인 가능' },
    { id: 'no_caddie', label: '노캐디' },
    { id: 'marshal', label: '마샬/드라이빙 캐디' },
    { id: 'meal_inc', label: '식사 제공' },
    { id: 'cart_free', label: '카트비 무료/할인' }
];

interface OptionSelectionSectionProps {
    greenFee: string;
    setGreenFee: (v: string) => void;
    isHotDeal: boolean;
    setIsHotDeal: (v: boolean) => void;
    listingType: 'BOOKING' | 'JOIN';
    joinHeadcount: number;
    setJoinHeadcount: (n: number) => void;
    joinCondition: string[];
    setJoinCondition: React.Dispatch<React.SetStateAction<string[]>>;
    isManager: boolean;
    policyType: string;
    setPolicyType: (t: string) => void;
    policyCustomText: string;
    setPolicyCustomText: (t: string) => void;
    selectedOptions: string[];
    toggleOption: (id: string) => void;
}

export function OptionSelectionSection({
    greenFee,
    setGreenFee,
    isHotDeal,
    setIsHotDeal,
    listingType,
    joinHeadcount,
    setJoinHeadcount,
    joinCondition,
    setJoinCondition,
    isManager,
    policyType,
    setPolicyType,
    policyCustomText,
    setPolicyCustomText,
    selectedOptions,
    toggleOption
}: OptionSelectionSectionProps) {
    return (
        <>
            {/* Section 2: Pricing */}
            <section className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                        <LucideCircleDollarSign className="w-4 h-4 text-[#64DD17]" />
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">3. 요금 및 옵션 (1인 기준)</h3>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">그린피 (원)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/20">₩</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={greenFee}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    setGreenFee(val ? Number(val).toLocaleString() : "");
                                }}
                                placeholder="판매가 입력"
                                title="그린피 입력"
                                className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-10 pr-4 text-sm font-extrabold text-[#64DD17] focus:outline-none focus:border-[#64DD17]/50 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                                isHotDeal ? "bg-red-500/20 text-red-500" : "bg-white/5 text-white/20"
                            )}>
                                <LucideZap className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">특가 상품 (Hot Deal)</div>
                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">긴급 핫딜 태그 노출</div>
                            </div>
                        </div>
                        <Switch checked={isHotDeal} onCheckedChange={setIsHotDeal} />
                    </div>
                </div>
            </section>

            {/* Section 2.2: Join Specific Fields */}
            <AnimatePresence>
                {listingType === 'JOIN' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-6 overflow-hidden mb-6"
                    >
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            {/* Headcount */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                                        <LucideUsers className="w-4 h-4 text-[#64DD17]" />
                                    </div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">필요 인원 (필수)</h3>
                                </div>
                                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <button
                                        onClick={() => setJoinHeadcount(Math.max(1, joinHeadcount - 1))}
                                        className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all"
                                        title="인원 감소"
                                    >
                                        <LucideMinus className="w-5 h-5" />
                                    </button>
                                    <div className="flex-1 text-center">
                                        <div className="text-2xl font-black text-[#64DD17]">{joinHeadcount}명</div>
                                        <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest">모집 중</div>
                                    </div>
                                    <button
                                        onClick={() => setJoinHeadcount(Math.min(3, joinHeadcount + 1))}
                                        className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all"
                                        title="인원 증가"
                                    >
                                        <LucidePlus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Conditions */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">조인 조건</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    {['남성', '여성', '부부/커플', '성별 무관'].map(cond => {
                                        const isSelected = joinCondition.includes(cond);
                                        return (
                                            <button
                                                key={cond}
                                                onClick={() => {
                                                    setJoinCondition(prev =>
                                                        prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]
                                                    );
                                                }}
                                                className={cn(
                                                    "px-4 py-3 rounded-xl text-xs font-bold whitespace-nowrap border transition-all",
                                                    isSelected
                                                        ? "bg-[#64DD17] border-[#64DD17] text-[#051907]"
                                                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                                                )}
                                            >
                                                {cond}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Section 2.5: Cancellation & Refund Policy - Only for Managers */}
            {isManager && (
                <section className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                            <LucideCircleDollarSign className="w-4 h-4 text-[#64DD17]" />
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">취소 및 환불 규정 (필수)</h3>
                    </div>

                    <div className="space-y-4">
                        {/* Option A: Standard */}
                        <button
                            onClick={() => setPolicyType("POLICY_STANDARD")}
                            className={cn(
                                "w-full p-4 rounded-2xl border text-left transition-all group relative overflow-hidden",
                                policyType === "POLICY_STANDARD"
                                    ? "bg-[#64DD17]/10 border-[#64DD17]"
                                    : "bg-white/5 border-white/5 hover:border-white/20"
                            )}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center",
                                    policyType === "POLICY_STANDARD" ? "border-[#64DD17] bg-[#64DD17]" : "border-white/20"
                                )}>
                                    {policyType === "POLICY_STANDARD" && <LucideCheck className="w-3 h-3 text-[#051907]" />}
                                </div>
                                <span className={cn("text-sm font-black", policyType === "POLICY_STANDARD" ? "text-white" : "text-white/60")}>
                                    ✅ 표준 약관 (추천)
                                </span>
                            </div>
                            <div className="pl-8 space-y-1">
                                <p className="text-[11px] text-white/40 leading-relaxed">• 우천 시: 현장 기준 100% 환불 (골프장 규정 준수)</p>
                                <p className="text-[11px] text-white/40 leading-relaxed">• 취소 시: 4일 전 100% 환불 / 3일 전부터 위약금 발생</p>
                            </div>
                        </button>

                        {/* Option B: Strict */}
                        <button
                            onClick={() => setPolicyType("POLICY_STRICT")}
                            className={cn(
                                "w-full p-4 rounded-2xl border text-left transition-all group relative overflow-hidden",
                                policyType === "POLICY_STRICT"
                                    ? "bg-red-500/10 border-red-500"
                                    : "bg-white/5 border-white/5 hover:border-white/20"
                            )}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center",
                                    policyType === "POLICY_STRICT" ? "border-red-500 bg-red-500" : "border-white/20"
                                )}>
                                    {policyType === "POLICY_STRICT" && <LucideCheck className="w-3 h-3 text-white" />}
                                </div>
                                <span className={cn("text-sm font-black", policyType === "POLICY_STRICT" ? "text-white" : "text-white/60")}>
                                    ⚠️ 임박/특가 약관 (엄격)
                                </span>
                            </div>
                            <div className="pl-8 space-y-1">
                                <p className="text-[11px] text-white/40 leading-relaxed">• 우천 시: 골프장 휴장 시에만 환불</p>
                                <p className="text-[11px] text-white/40 leading-relaxed">• 취소 시: <span className="text-red-400 font-bold">취소/환불 불가</span> (타인 양도만 가능)</p>
                            </div>
                        </button>

                        {/* Option C: Custom */}
                        <button
                            onClick={() => setPolicyType("POLICY_CUSTOM")}
                            className={cn(
                                "w-full p-4 rounded-2xl border text-left transition-all group relative overflow-hidden",
                                policyType === "POLICY_CUSTOM"
                                    ? "bg-white/10 border-white/20"
                                    : "bg-white/5 border-white/5 hover:border-white/20"
                            )}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center",
                                    policyType === "POLICY_CUSTOM" ? "border-white bg-white" : "border-white/20"
                                )}>
                                    {policyType === "POLICY_CUSTOM" && <LucideCheck className="w-3 h-3 text-black" />}
                                </div>
                                <span className={cn("text-sm font-black", policyType === "POLICY_CUSTOM" ? "text-white" : "text-white/60")}>
                                    📝 직접 입력
                                </span>
                            </div>
                        </button>

                        <AnimatePresence>
                            {policyType === "POLICY_CUSTOM" && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <textarea
                                        value={policyCustomText}
                                        onChange={(e) => setPolicyCustomText(e.target.value)}
                                        placeholder="취소 및 환불 규정을 직접 입력해주세요."
                                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 px-4 text-xs font-bold text-white focus:outline-none focus:border-[#64DD17]/50 h-24 resize-none"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </section>
            )}

            {/* Section 3: Option Tags */}
            <section className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                        <LucideTag className="w-4 h-4 text-[#64DD17]" />
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">4. 옵션 태그 (터치하여 선택)</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {SPECIAL_OPTIONS.map(option => (
                        <button
                            key={option.id}
                            onClick={() => toggleOption(option.id)}
                            className={cn(
                                "p-4 rounded-2xl border text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-center text-center",
                                selectedOptions.includes(option.id)
                                    ? "bg-[#64DD17] border-[#64DD17] text-[#051907]"
                                    : "bg-white/5 border-white/5 text-white/40 hover:border-white/20"
                            )}
                        >
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            </section>
        </>
    );
}
