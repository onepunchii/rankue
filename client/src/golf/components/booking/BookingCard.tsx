import { motion, AnimatePresence } from 'framer-motion';
import { LucideChevronRight, LucideUsers, LucideCheckCircle2, LucideCircleDollarSign, LucideMessageSquare, LucideShare2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_COLORS, SPECIAL_OPTIONS } from '../../constants/booking';

interface BookingCardProps {
    item: any;
    expandedBookingId: string | null;
    onExpand: (id: string | null) => void;
    onReserve: (item: any) => void;
    onShare: (item: any) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
}

export const BookingCard = ({ item, expandedBookingId, onExpand, onReserve, onShare, viewType }: BookingCardProps) => {
    const isExpanded = expandedBookingId === item.id;
    const theme = viewType === 'JOIN' ? THEME_COLORS.JOIN : THEME_COLORS.BOOKING;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            id={`booking-${item.id}`}
            className={cn(
                "bg-[#1E1E1E] border border-[#333333] rounded-3xl overflow-hidden transition-all duration-300",
                isExpanded ? `${theme.border} shadow-[0_4px_20px_-4px_rgba(100,221,23,0.1)] mb-4` : "hover:border-[#64DD17]/30 mb-3"
            )}
        >
            {/* Card Header */}
            <div
                onClick={() => onExpand(isExpanded ? null : item.id)}
                className="relative p-5 flex items-center justify-between cursor-pointer group active:scale-[0.99] transition-transform"
            >
                {item.isHotDeal && (
                    <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-red-600 to-red-500 text-white text-[8px] font-black rounded-bl-xl uppercase tracking-widest z-10 shadow-lg">
                        긴급 핫딜
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/5 group-hover:border-[#64DD17]/30 transition-colors">
                        <span className="text-xl font-black text-white leading-none">
                            {new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).split(':')[0]}
                        </span>
                        <span className="text-[10px] font-bold text-white/40 leading-none mt-1">
                            {new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).split(':')[1]}
                        </span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "text-base font-black leading-none transition-colors",
                                isExpanded ? theme.text : "text-white group-hover:text-[#64DD17]"
                            )}>
                                {item.isBlind ? item.blindName : item.courseName}
                            </span>
                            {item.isBlind && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-tighter border border-white/10">
                                    비공개
                                </span>
                            )}
                        </div>
                        {item.listingType === 'JOIN' && (
                            <div className="flex gap-1">
                                <span className="px-1.5 py-0.5 rounded bg-[#FF6B00]/20 text-[#FF6B00] text-[9px] font-black uppercase tracking-tighter border border-[#FF6B00]/20 flex items-center gap-1">
                                    <LucideUsers className="w-2.5 h-2.5" />
                                    {item.joinHeadcount}명 모집
                                </span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] font-bold text-[#888888] uppercase tracking-widest">
                            <span>{item.isBlind ? "위치 비공개" : item.region}</span>
                            <span className="w-0.5 h-2 bg-white/10 rounded-full" />
                            <span>
                                {(item.options || []).includes('no_caddie')
                                    ? '노캐디'
                                    : (item.options || []).includes('marshal')
                                        ? '드라이빙 캐디'
                                        : '일반캐디'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className={cn("text-lg font-black tracking-tighter", theme.text)}>
                            {item.greenFee.toLocaleString()}<span className="text-xs ml-0.5 opacity-60">원</span>
                        </div>
                    </div>
                    <div className={cn(
                        "w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition-all duration-300",
                        isExpanded ? `${theme.bg} ${theme.border} rotate-90` : "bg-white/5 group-hover:bg-white/10"
                    )}>
                        <LucideChevronRight className={cn(
                            "w-4 h-4 transition-colors",
                            isExpanded ? "text-[#051907]" : "text-white/40"
                        )} />
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-[#141414] border-t border-white/5"
                    >
                        <div className="p-5 space-y-6">
                            {item.listingType === 'JOIN' && (
                                <div className="p-4 rounded-2xl bg-[#FF6B00]/10 border border-[#FF6B00]/20 mb-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest flex items-center gap-1.5">
                                            <LucideUsers className="w-3.5 h-3.5" />
                                            조인 모집 정보
                                        </div>
                                        <div className="text-xs font-black text-[#FF6B00]">
                                            {item.joinHeadcount}명 급구
                                        </div>
                                    </div>
                                    {item.joinCondition && (
                                        <div className="flex flex-wrap gap-2">
                                            {item.joinCondition.split(',').map((cond: string) => (
                                                <span key={cond} className="px-2 py-1 bg-[#FF6B00]/20 rounded-lg text-[#FF6B00] text-[10px] font-bold">
                                                    {cond}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                                        <LucideCheckCircle2 className="w-3 h-3" />
                                        포함 옵션
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(item.options || []).length > 0 ? (item.options || []).map((optId: string) => {
                                            const optLabel = SPECIAL_OPTIONS.find(o => o.id === optId)?.label || optId;
                                            return (
                                                <span key={optId} className={cn("px-2 py-1 rounded-lg text-[10px] font-bold", theme.bg.replace('bg-', 'bg-') + '/10', theme.text)}>
                                                    {optLabel}
                                                </span>
                                            );
                                        }) : (
                                            <span className="text-[11px] text-white/20 font-bold">없음</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                                        <LucideCircleDollarSign className="w-3 h-3" />
                                        취소/환불 규정
                                    </div>
                                    <div className="text-[11px] font-bold text-white/80 leading-relaxed whitespace-pre-wrap break-words">
                                        {item.policyType === 'POLICY_STANDARD' && (
                                            <>
                                                <div className="mb-1.5">• 우천 시: 현장 기준 100% 환불</div>
                                                <div>• 4일 전 취소 가능</div>
                                            </>
                                        )}
                                        {item.policyType === 'POLICY_STRICT' && (
                                            <>
                                                <div className="mb-1.5">• 우천 시: 골프장 휴장 시에만 환불</div>
                                                <div>• <span className="text-red-400 font-bold">취소/환불 불가</span> (양도만 가능)</div>
                                            </>
                                        )}
                                        {item.policyType === 'POLICY_CUSTOM' && (
                                            <div>{item.policyCustomText || "매니저에게 문의"}</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {item.comment && (item.comment as string).length > 0 && (
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                                        <LucideMessageSquare className="w-3 h-3" />
                                        매니저 코멘트
                                    </div>
                                    <p className="text-sm font-medium text-white/80 leading-relaxed">
                                        {item.comment}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onReserve(item);
                                    }}
                                    className={cn(
                                        "flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2",
                                        viewType === 'JOIN' ? 'bg-[#FF6B00] text-white shadow-[0_4px_20px_-4px_rgba(255,107,0,0.3)]' : 'bg-[#64DD17] text-[#051907] shadow-[0_4px_20px_-4px_rgba(100,221,23,0.3)]'
                                    )}
                                >
                                    <span>{viewType === 'JOIN' ? "조인 신청하기" : "예약 문자 보내기"}</span>
                                    <LucideChevronRight className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onShare(item);
                                    }}
                                    className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                                    title="공유하기"
                                >
                                    <LucideShare2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
