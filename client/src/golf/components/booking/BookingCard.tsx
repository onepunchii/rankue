/**
 * 부킹·조인 카드(2026-09-21 재설계 — 오너: "시계가 아쉽다, 지도 버튼, 중요한 정보를 직관적으로").
 *
 * 접힌 카드 한 줄에 다 읽히게: [18:26 / 오늘] [장소 + 배지 / 자리·모집 요약 또는 지역·캐디] [가격 / 확정 n/정원].
 * 예전 시계는 시(18) 위에 분(26)이 작게 붙어 "18과 26" 두 숫자로 읽혔다. 티타임은 카드에서 제일 중요한 정보다.
 * 펼치면 중요도 순: 장소(지도·길찾기, 카카오맵 공식 링크라 키가 필요 없다) → 자리·신청자(조인) → 옵션 → 규정(부킹) → 한마디 → 버튼.
 * 리본은 예외 상태만(긴급 핫딜 · 마감 · 지난 글) — 카드마다 "모집중"을 붙이면 소음이다. 굵기는 600 까지.
 */
import { ReportDialog } from "@/components/hiq/community/ReportDialog";
import { useState } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { LucideChevronDown, LucideMapPin, LucideShare2, LucideFlag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPECIAL_OPTIONS } from '../../constants/booking';
import { JOIN_OPTIONS, distanceKm, formatDistance, isKoreaCoord } from '@shared/golfJoin';
import { JoinApplicants } from './JoinApplicants';
import { kstDateKey, kstTime } from '@/lib/kst';
import { SlotDots, JoinTypeBadge, costText, dayLabel, joinTypeOf, kakaoMapUrl, kakaoRouteUrl, openGenderText, slotLegend, slotsOf } from '../join/joinUi';

interface BookingCardProps {
    item: any;
    expandedBookingId: string | null;
    onExpand: (id: string | null) => void;
    onReserve: (item: any) => void;
    /** 신청·취소(조인은 한 자리, 부킹은 인원과 함께). */
    onApply?: (item: any, headcount?: number) => void;
    onShare: (item: any) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
    /** 로그인한 회원 id. 내가 올린 조인 글이면 신청자 목록을 연다. */
    meId?: string;
    /** 내 위치(있으면 조인 카드에 거리를 적는다) */
    myLocation?: { lat: number; lng: number } | null;
    /** 내가 올린 글 내리기 */
    onDelete?: (item: any) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const label = "text-[12px] font-medium text-white/50";
const box = "rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5";
const pill = "h-9 px-3 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/85 inline-flex items-center active:bg-white/10";

export const BookingCard = ({ item, expandedBookingId, onExpand, onReserve, onApply, onShare, viewType, meId, myLocation, onDelete }: BookingCardProps) => {
    const [reportOpen, setReportOpen] = useState(false);
    // 부킹 예약 신청의 인원 고르기(2026-09-21 오너: "푸시로 승부" — 문자 대신 앱 안에서 신청→승인→확정)
    const [picking, setPicking] = useState(false);
    const [headcount, setHeadcount] = useState(1);
    const isExpanded = expandedBookingId === item.id;
    const isJoin = item.listingType === 'JOIN';
    // 자리 모델(2026-09-21): 정원 = 모집 자리 수, 찬 자리 = 승인된 사람 수. 옛 글은 모집 인원으로.
    const slots = isJoin ? slotsOf(item) : [];
    const capacity = Number(item.joinCapacity) > 0 ? Number(item.joinCapacity) : Number(item.joinHeadcount) > 0 ? Number(item.joinHeadcount) : 3;
    const applied = Number(item.joinApplied ?? 0);
    const pending = Number(item.joinPending ?? 0);
    const joinFull = applied >= capacity;
    const isMine = !!meId && item.ownerId === meId;
    const myStatus: string | null = item.myJoinStatus ?? (item.joinedByMe ? "applied" : null);
    const joinType = isJoin ? joinTypeOf(item) : null;
    const km = myLocation && isKoreaCoord(item.lat, item.lng) ? distanceKm(myLocation.lat, myLocation.lng, item.lat, item.lng) : null;

    const name: string = item.isBlind ? item.blindName : item.courseName;
    const past = new Date(item.datetime).getTime() <= Date.now();
    const dday = dayLabel(kstDateKey(item.datetime), kstDateKey(Date.now()));
    const accent = isJoin ? "#FF6B00" : "#64DD17";
    const accentText = isJoin ? "text-[#FF8A33]" : "text-[#8BE84A]";
    const ribbon = past ? { text: "지난 글", cls: "bg-white/10 text-white/60" }
        : isJoin && joinFull ? { text: "마감", cls: "bg-white/10 text-white/70" }
            : !isJoin && item.isHotDeal ? { text: "긴급 핫딜", cls: "bg-red-500 text-white" }
                : null;
    const caddie = (item.options || []).includes('no_caddie') ? '노캐디' : (item.options || []).includes('marshal') ? '드라이빙 캐디' : '일반캐디';
    const optionLabels: string[] = (item.options || []).map((id: string) => SPECIAL_OPTIONS.find(o => o.id === id)?.label || JOIN_OPTIONS.find(o => o.id === id)?.label || id);

    const primaryText = isMine ? (isJoin ? `내가 올린 조인 · 확정 ${applied}/${capacity}` : (applied > 0 ? "예약 확정됨 · 내 글" : pending > 0 ? `예약 신청 ${pending}건 · 내 글` : "내가 올린 부킹"))
        : myStatus === "accepted" ? (isJoin ? "확정됐어요 · 취소하기" : "예약 확정 · 취소하기")
            : myStatus === "applied" ? "승인 기다리는 중 · 취소하기"
                : myStatus === "rejected" ? "이번엔 함께하지 못해요"
                    : joinFull ? (isJoin ? "자리가 찼어요" : "이미 확정된 티타임이에요")
                        : isJoin ? `조인 신청하기 ${applied}/${capacity}` : "예약 신청";
    const primaryDisabled = past || isMine || myStatus === "rejected" || (joinFull && !item.joinedByMe);
    // 문자: 매장 글은 번호가 영업용이라 늘 열려 있고, 개인 양도 글은 확정된 뒤에만 번호가 온다(서버가 가린다).
    const canSms = !isJoin && !!item.managerPhone && !isMine;

    return (
        <>
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            id={`booking-${item.id}`}
            className={cn(
                "bg-[#1A1A1A] border rounded-2xl overflow-hidden transition-colors mb-3",
                isExpanded ? (isJoin ? "border-[#FF6B00]/50" : "border-[#64DD17]/50") : "border-white/[0.08]",
                past && !isExpanded && "opacity-60",
            )}
        >
            {/* ── 접힌 줄 ── */}
            <div
                onClick={() => onExpand(isExpanded ? null : item.id)}
                className="relative p-4 flex items-center gap-3.5 cursor-pointer active:bg-white/[0.02] transition-colors"
            >
                {ribbon && (
                    <span className={cn("absolute top-0 right-0 px-2 py-0.5 rounded-bl-lg text-[10px] font-semibold z-10", ribbon.cls)}>{ribbon.text}</span>
                )}

                {/* 시계: 18:26 한 줄 + D-day */}
                <div className="w-[66px] h-14 shrink-0 flex flex-col items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.06]">
                    <span className="rk-num text-[19px] font-semibold text-white leading-none">{kstTime(item.datetime)}</span>
                    <span className={cn("mt-1 text-[11px] font-medium leading-none", dday === "오늘" ? accentText : "text-white/45")}>{dday}</span>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[15px] font-semibold text-white truncate" title={name}>{name}</span>
                        {isJoin && joinType
                            ? <JoinTypeBadge type={joinType} />
                            : <span className={cn("shrink-0 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold",
                                item.sellerType === 'PERSONAL' ? "bg-[#4DA3FF]/15 text-[#7CBBFF]" : "bg-[#64DD17]/15 text-[#8BE84A]")}>
                                {item.sellerType === 'PERSONAL' ? '개인 양도' : '매장'}
                            </span>}
                        {item.isBlind && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/10 text-white/60 text-[10.5px] font-medium">비공개</span>}
                    </div>
                    {isJoin ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <SlotDots slots={slots} filled={applied} size={16} />
                            <span className="text-[12px] font-medium text-white/60 truncate">
                                {capacity}명 모집 · {openGenderText(slots)}
                                {isMine && pending > 0 && <span className="text-[#FF8A33]"> · 대기 {pending}</span>}
                            </span>
                        </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/45 truncate">
                        <span className="truncate">{item.isBlind ? "위치 비공개" : item.region}</span>
                        {km !== null && <><span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" /><span className="text-[#7CBBFF] shrink-0">{formatDistance(km)}</span></>}
                        {(!isJoin || joinType === 'FIELD') && <><span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" /><span className="shrink-0">{caddie}</span></>}
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    <div className={cn("rk-num text-[16px] font-semibold leading-none", accentText)}>
                        {isJoin ? costText(item) : `${Number(item.greenFee).toLocaleString()}원`}
                    </div>
                    {isJoin && <div className="mt-1.5 text-[11px] font-medium text-white/50 leading-none">확정 {applied}/{capacity}</div>}
                </div>
                <LucideChevronDown className={cn("w-4 h-4 text-white/35 shrink-0 transition-transform", isExpanded && "rotate-180")} />
            </div>

            {/* ── 펼침 ── */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-[#141414] border-t border-white/[0.06]"
                    >
                        <div className="p-4 space-y-3">
                            {/* 장소 + 지도·길찾기 */}
                            <div className="flex items-center gap-2.5">
                                <LucideMapPin className="w-4 h-4 text-white/45 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-medium text-white truncate">{name}</div>
                                    <div className="text-[12px] text-white/45 truncate">{item.isBlind ? "위치 비공개 — 문의로 확인" : item.region}</div>
                                </div>
                                {!item.isBlind && (
                                    <div className="flex gap-1.5 shrink-0">
                                        <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" onClick={stop} className={pill}>지도</a>
                                        <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" onClick={stop} className={pill}>길찾기</a>
                                    </div>
                                )}
                            </div>

                            {/* 조인: 자리 */}
                            {isJoin && (
                                <div className={cn(box, "space-y-2.5")}>
                                    <div className="flex items-center justify-between">
                                        <span className={label}>자리</span>
                                        <span className="text-[12px] font-medium text-[#FF8A33]">확정 {applied}/{capacity}{pending > 0 && (isMine ? ` · 대기 ${pending}` : "")}</span>
                                    </div>
                                    <SlotDots slots={slots} filled={applied} size={26} />
                                    <div className="flex flex-wrap gap-1.5">
                                        {slotLegend(slots).map((t) => <span key={t} className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[12px] text-white/70">{t}</span>)}
                                    </div>
                                </div>
                            )}
                            {/* 내 글이면 신청자(승인·거절) — 부킹 예약 신청도 같은 목록이다 */}
                            {isMine && <JoinApplicants bookingId={item.id} enabled={isExpanded} />}

                            {/* 옵션 */}
                            {optionLabels.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {optionLabels.map((t) => <span key={t} className={cn("px-2 py-1 rounded-md text-[12px] font-medium", isJoin ? "bg-[#FF6B00]/12 text-[#FF8A33]" : "bg-[#64DD17]/12 text-[#8BE84A]")}>{t}</span>)}
                                </div>
                            )}

                            {/* 부킹: 취소·환불 */}
                            {!isJoin && (
                                <div className={box}>
                                    <div className={cn(label, "mb-1")}>취소·환불</div>
                                    <div className="text-[12.5px] text-white/75 leading-relaxed whitespace-pre-wrap break-words">
                                        {item.policyType === 'POLICY_STRICT'
                                            ? "휴장 시에만 환불 · 취소 불가(양도만 가능)"
                                            : item.policyType === 'POLICY_CUSTOM'
                                                ? (item.policyCustomText || "올린 분에게 문의")
                                                : "우천 시 현장 기준 100% 환불 · 4일 전 취소 가능"}
                                    </div>
                                </div>
                            )}

                            {item.comment && String(item.comment).length > 0 && (
                                <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap break-words">{item.comment}</p>
                            )}

                            {/* 확정된 부킹: 연락처가 열린다 */}
                            {!isJoin && myStatus === "accepted" && item.managerPhone && (
                                <div className={cn(box, "flex items-center justify-between gap-2")}>
                                    <div>
                                        <div className={label}>연락처</div>
                                        <div className="rk-num text-[15px] font-semibold text-white">{item.managerPhone}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); onReserve(item); }} className="h-10 px-4 rounded-xl bg-[#64DD17] text-[#051907] text-[13px] font-semibold">문자 보내기</button>
                                </div>
                            )}

                            {/* 부킹 예약 신청: 인원만 고르고 끝 */}
                            {picking && !isJoin && (
                                <div className={cn(box, "space-y-2")} onClick={stop}>
                                    <div className={label}>몇 명이 가나요?</div>
                                    <div className="flex gap-1.5">
                                        {[1, 2, 3, 4].map((n) => (
                                            <button key={n} type="button" onClick={() => setHeadcount(n)} className={cn("flex-1 h-10 rounded-xl text-[14px] font-medium border transition-colors", headcount === n ? "bg-[#64DD17] border-[#64DD17] text-[#051907]" : "bg-white/[0.04] border-white/[0.08] text-white/70")}>{n}명</button>
                                        ))}
                                    </div>
                                    <p className="text-[12px] text-white/45">올린 분이 승인하면 확정 알림과 함께 연락처가 열려요.</p>
                                </div>
                            )}

                            {/* 버튼: 조인·부킹 모두 앱 안 신청. 부킹은 인원을 고른 뒤 보낸다. */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isMine || !onApply) return;
                                        if (isJoin || item.joinedByMe) { onApply(item); return; }
                                        if (!picking) { setPicking(true); return; }
                                        onApply(item, headcount); setPicking(false);
                                    }}
                                    disabled={primaryDisabled}
                                    className={cn(
                                        "flex-1 h-12 rounded-xl text-[14px] font-semibold transition-colors disabled:opacity-40",
                                        isJoin && item.joinedByMe ? "bg-white/[0.08] text-white border border-white/10" : isJoin ? "text-white" : "text-[#051907]",
                                    )}
                                    style={isJoin && item.joinedByMe ? undefined : { backgroundColor: accent }}
                                >
                                    {picking && !isJoin && !item.joinedByMe ? `${headcount}명 예약 신청 보내기` : primaryText}
                                </button>
                                {canSms && (
                                    <button onClick={(e) => { e.stopPropagation(); onReserve(item); }} className="h-12 px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.06] text-[13px] font-medium text-white/70 active:bg-white/10" title="문자로 문의">문자</button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); onShare(item); }} className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-white/60 active:bg-white/10" title="공유하기" aria-label="공유하기">
                                    <LucideShare2 className="w-[18px] h-[18px]" />
                                </button>
                                {isMine && onDelete ? (
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="h-12 px-4 rounded-xl bg-white/[0.05] border border-white/[0.06] text-[13px] font-medium text-white/60 active:text-red-400" title="내리기">내리기</button>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setReportOpen(true); }} className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-white/60 active:bg-white/10" title="신고하기" aria-label="신고하기">
                                        <LucideFlag className="w-[18px] h-[18px]" />
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
