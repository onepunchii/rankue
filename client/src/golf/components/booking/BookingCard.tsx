import { ReportDialog } from "@/components/hiq/community/ReportDialog";
import { useState } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { LucideChevronRight, LucideUsers, LucideCheckCircle2, LucideCircleDollarSign, LucideMessageSquare, LucideShare2, LucideFlag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_COLORS, SPECIAL_OPTIONS } from '../../constants/booking';
import { JOIN_OPTIONS } from '@shared/golfJoin';
import { JoinApplicants } from './JoinApplicants';
import { kstHour, kstMinute } from '@/lib/kst';
import { SlotDots, JoinTypeBadge, costText, joinTypeOf, slotsOf } from '../join/joinUi';
import { distanceKm, formatDistance, isKoreaCoord } from '@shared/golfJoin';

interface BookingCardProps {
    item: any;
    expandedBookingId: string | null;
    onExpand: (id: string | null) => void;
    onReserve: (item: any) => void;
    /** 조인 신청·취소. 조인 글에서만 쓴다. */
    onApply?: (item: any) => void;
    onShare: (item: any) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
    /** 로그인한 회원 id. 내가 올린 조인 글이면 신청자 목록을 연다. */
    meId?: string;
    /** 내 위치(있으면 조인 카드에 거리를 적는다) */
    myLocation?: { lat: number; lng: number } | null;
    /** 내가 올린 글 내리기 */
    onDelete?: (item: any) => void;
}

export const BookingCard = ({ item, expandedBookingId, onExpand, onReserve, onApply, onShare, viewType, meId, myLocation, onDelete }: BookingCardProps) => {
    const [reportOpen, setReportOpen] = useState(false);
    const isExpanded = expandedBookingId === item.id;
    const theme = viewType === 'JOIN' ? THEME_COLORS.JOIN : THEME_COLORS.BOOKING;
    const isJoin = item.listingType === 'JOIN';
    // 자리 모델(2026-09-21): 정원 = 모집 자리 수, 찬 자리 = 승인된 사람 수. 옛 글은 모집 인원으로.
    const slots = isJoin ? slotsOf(item) : [];
    const capacity = Number(item.joinCapacity) > 0 ? Number(item.joinCapacity) : Number(item.joinHeadcount) > 0 ? Number(item.joinHeadcount) : 3;
    const applied = Number(item.joinApplied ?? 0);
    const joinFull = applied >= capacity;
    const isMine = !!meId && item.ownerId === meId;
    const myStatus: string | null = item.myJoinStatus ?? (item.joinedByMe ? "applied" : null);
    const joinType = isJoin ? joinTypeOf(item) : null;
    const km = isJoin && myLocation && isKoreaCoord(item.lat, item.lng) ? distanceKm(myLocation.lat, myLocation.lng, item.lat, item.lng) : null;

    return (
        <>
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
                            {kstHour(item.datetime)}
                        </span>
                        <span className="text-[10px] font-bold text-white/40 leading-none mt-1">
                            {kstMinute(item.datetime)}
                        </span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span
                                className={cn(
                                    "text-base font-black leading-none transition-colors truncate max-w-[140px]",
                                    isExpanded ? theme.text : "text-white group-hover:text-[#64DD17]"
                                )}
                                title={item.isBlind ? item.blindName : item.courseName}
                            >
                                {(() => {
                                    const name = item.isBlind ? item.blindName : item.courseName;
                                    return name.length > 6 ? name.substring(0, 6) + "..." : name;
                                })()}
                            </span>
                            {item.isBlind && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-tighter border border-white/10">
                                    비공개
                                </span>
                            )}
                        </div>
                        {!isJoin && (
                            // 누가 올렸나(2026-09-21 A안) — 돈이 먼저 오가는 글이라 매장인지 개인 양도인지 먼저 보인다. 옛 글은 매장.
                            <span className={cn("self-start px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold",
                                item.sellerType === 'PERSONAL' ? "bg-[#4DA3FF]/15 text-[#7CBBFF]" : "bg-[#64DD17]/15 text-[#8BE84A]")}>
                                {item.sellerType === 'PERSONAL' ? '개인 양도' : '매장'}
                            </span>
                        )}
                        {isJoin && joinType && (
                            <div className="flex items-center gap-2">
                                <SlotDots slots={slots} filled={applied} size={18} />
                                <JoinTypeBadge type={joinType} />
                                {item.joinPending > 0 && isMine && <span className="text-[11px] font-medium text-[#FF8A33]">대기 {item.joinPending}</span>}
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-[11.5px] font-medium text-[#9A9A9A]">
                            <span>{item.isBlind ? "위치 비공개" : item.region}</span>
                            {km !== null && <><span className="w-0.5 h-2 bg-white/10 rounded-full" /><span className="text-[#7CBBFF]">{formatDistance(km)}</span></>}
                            {(!isJoin || joinType === 'FIELD') && (
                                <>
                                    <span className="w-0.5 h-2 bg-white/10 rounded-full" />
                                    <span>
                                        {(item.options || []).includes('no_caddie')
                                            ? '노캐디'
                                            : (item.options || []).includes('marshal')
                                                ? '드라이빙 캐디'
                                                : '일반캐디'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className={cn("text-lg font-semibold tracking-tight", theme.text)}>
                            {isJoin ? costText(item) : <>{item.greenFee.toLocaleString()}<span className="text-xs ml-0.5 opacity-60">원</span></>}
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
                                        <div className="text-xs font-semibold text-[#FF6B00]">
                                            {applied}/{capacity} 확정
                                        </div>
                                    </div>
                                    <SlotDots slots={slots} filled={applied} size={26} />
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

                            {/* 내가 올린 조인이면 누가 신청했는지 — 그리고 티타임이 지나면 안 온 사람 표시 */}
                            {isJoin && isMine && <JoinApplicants bookingId={item.id} enabled={isExpanded} />}

                            <div className={cn("grid gap-4", isJoin ? "grid-cols-1" : "grid-cols-2")}>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                                        <LucideCheckCircle2 className="w-3 h-3" />
                                        포함 옵션
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(item.options || []).length > 0 ? (item.options || []).map((optId: string) => {
                                            const optLabel = SPECIAL_OPTIONS.find(o => o.id === optId)?.label || JOIN_OPTIONS.find(o => o.id === optId)?.label || optId;
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
                                {!isJoin && <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
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
                                </div>}
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
                                {/* 조인은 기록으로 남는 신청이다. 부킹은 예전처럼 문자로 문의한다. */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isJoin && isMine) return;
                                        if (isJoin && onApply) onApply(item); else onReserve(item);
                                    }}
                                    disabled={isJoin && ((isMine) || myStatus === "rejected" || (joinFull && !item.joinedByMe))}
                                    className={cn(
                                        "flex-1 py-4 rounded-2xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:scale-100",
                                        isJoin
                                            ? (item.joinedByMe ? 'bg-white/10 text-white border border-white/20' : 'bg-[#FF6B00] text-white shadow-[0_4px_20px_-4px_rgba(255,107,0,0.3)]')
                                            : 'bg-[#64DD17] text-[#051907] shadow-[0_4px_20px_-4px_rgba(100,221,23,0.3)]'
                                    )}
                                >
                                    <span>
                                        {!isJoin ? "예약 문자 보내기"
                                            : isMine ? `내가 올린 조인 · 확정 ${applied}/${capacity}`
                                                : myStatus === "accepted" ? "확정됐어요 · 취소하기"
                                                    : myStatus === "applied" ? "승인 기다리는 중 · 취소하기"
                                                        : myStatus === "rejected" ? "이번엔 함께하지 못해요"
                                                            : joinFull ? "자리가 찼어요" : `조인 신청하기 ${applied}/${capacity}`}
                                    </span>
                                    {!item.joinedByMe && !(isJoin && isMine) && <LucideChevronRight className="w-4 h-4" />}
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
                                {/* 신고 — 사기 매물을 내릴 방법이 코드에 하나도 없었다(2026-09-09 검토).
                                    같은 사람 셋이 신고하면 서버가 자동으로 가린다. */}
                                {isMine && onDelete ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                                        className="h-14 px-4 rounded-2xl bg-white/5 border border-white/5 text-[13px] font-medium text-white/60 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                                        title="내리기"
                                    >내리기</button>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setReportOpen(true); }}
                                        className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                                        title="신고하기"
                                        aria-label="신고하기"
                                    >
                                        <LucideFlag className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
        <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            targetType="golf_booking"
            targetId={item.id}
            targetAuthorId={item.ownerId ?? undefined}
            targetAuthorName={item.courseName}
        />
        </>
    );
};
