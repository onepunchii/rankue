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
import { JOIN_OPTIONS, MAX_SLOTS, distanceKm, formatDistance, isKoreaCoord } from '@shared/golfJoin';
import { courseCoord } from '../../data/courseCoords';
import { JoinApplicants } from './JoinApplicants';
import { useT } from '@/lib/i18n';
import { kstDateKey, kstTime } from '@/lib/kst';
import { SlotDots, JoinTypeBadge, costText, dayLabel, hostSeatLabel, joinTypeOf, kakaoMapUrl, kakaoRouteUrl, openGenderText, slotLegend, slotsOf } from '../join/joinUi';

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
    /** 내 위치(있으면 카드에 골프장까지의 거리를 적는다 — 부킹·조인 모두) */
    myLocation?: { lat: number; lng: number } | null;
    /** 내가 올린 글 내리기 */
    onDelete?: (item: any) => void;
    /** 내가 올린 부킹을 조인으로 전환(2026-09-23) — 내 부킹 카드에만 붙는다 */
    onToJoin?: (item: any) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const label = "text-[12px] font-medium text-white/50";
const box = "rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5";
const pill = "h-9 px-3 rounded-full bg-white/[0.06] text-[12.5px] font-medium text-white/85 inline-flex items-center active:bg-white/10";

export const BookingCard = ({ item, expandedBookingId, onExpand, onReserve, onApply, onShare, viewType, meId, myLocation, onDelete, onToJoin }: BookingCardProps) => {
    const { t } = useT();
    const [reportOpen, setReportOpen] = useState(false);
    // 부킹 예약 신청의 인원 고르기(2026-09-21 오너: "푸시로 승부" — 문자 대신 앱 안에서 신청→승인→확정)
    const [picking, setPicking] = useState(false);
    const [headcount, setHeadcount] = useState(1);
    const isExpanded = expandedBookingId === item.id;
    const isJoin = item.listingType === 'JOIN';
    // 자리 모델(2026-09-21): 정원 = 모집 자리 수, 찬 자리 = 승인된 사람 수. 옛 글은 모집 인원으로.
    const slots = isJoin ? slotsOf(item) : [];
    // 전환 글(부킹 → 조인)에는 호스트가 없다 — 매장은 자기가 파는 팀에서 안 친다(joinUi.isConvertedJoin 주석).
    const hostLabel = hostSeatLabel(item);
    const capacity = Number(item.joinCapacity) > 0 ? Number(item.joinCapacity) : Number(item.joinHeadcount) > 0 ? Number(item.joinHeadcount) : 3;
    const applied = Number(item.joinApplied ?? 0);
    const pending = Number(item.joinPending ?? 0);
    const joinFull = applied >= capacity;
    const isMine = !!meId && item.ownerId === meId;
    const myStatus: string | null = item.myJoinStatus ?? (item.joinedByMe ? "applied" : null);
    const joinType = isJoin ? joinTypeOf(item) : null;
    /**
     * 내 위치에서 이 골프장까지(2026-09-23 오너: "티타임에 내가 현재 위치와 골프장 거리를 표기해줘").
     * 좌표는 두 곳에서 온다: 글에 저장된 lat/lng(스크린·파크 조인의 장소 검색 결과)와,
     * 없으면 정적 원장의 course_id 로 찾은 골프장 좌표(golf/data/courseCoords — 부킹에는 좌표 칸이 없다).
     * ⚠️ 비공개(isBlind) 글은 **거리도 안 적는다** — 서버가 이름·좌표를 가려 놨는데 거리를 적으면
     *    원장에서 반경으로 골프장을 되짚을 수 있다(가려 놓은 뜻이 사라진다). 서버도 courseId 를 null 로 준다.
     */
    const spot = item.isBlind
        ? null
        : isKoreaCoord(item.lat, item.lng) ? { lat: item.lat as number, lng: item.lng as number } : courseCoord(item.courseId);
    const km = myLocation && spot ? distanceKm(myLocation.lat, myLocation.lng, spot.lat, spot.lng) : null;

    const name: string = item.isBlind ? item.blindName : item.courseName;
    const past = new Date(item.datetime).getTime() <= Date.now();
    const dday = dayLabel(kstDateKey(item.datetime), kstDateKey(Date.now()));
    const accent = isJoin ? "#FF6B00" : "#64DD17";
    const accentText = isJoin ? "text-[#FF8A33]" : "text-[#8BE84A]";
    // 긴급 조인(당일·그린피를 던진 필드 조인)은 서버가 목록에 isUrgent 로 얹어 준다 — 저장 컬럼이 아니라 계산값이다.
    // 리본 순서: 지난 글 > ⚡ 긴급 > 마감 > 긴급 핫딜. 긴급을 마감보다 앞에 두는 건 전체 푸시를 받고 들어온 사람이
    // "그 글이 맞나" 부터 확인하기 때문이다. 기존 '긴급 핫딜'(부킹의 수동 체크)과는 다른 것이라 둘 다 남긴다.
    const urgent = !!item.isUrgent;
    const ribbon = past ? { text: "지난 글", cls: "bg-white/10 text-white/60" }
        : urgent ? { text: t("golf.urgentRibbon"), cls: "bg-[#FFC400] text-[#1A1200]" }
            : isJoin && joinFull ? { text: "마감", cls: "bg-white/10 text-white/70" }
                : !isJoin && item.isHotDeal ? { text: "긴급 핫딜", cls: "bg-red-500 text-white" }
                    : null;
    const caddie = (item.options || []).includes('no_caddie') ? '노캐디' : (item.options || []).includes('marshal') ? '드라이빙 캐디' : '일반캐디';
    const optionLabels: string[] = (item.options || []).map((id: string) => SPECIAL_OPTIONS.find(o => o.id === id)?.label || JOIN_OPTIONS.find(o => o.id === id)?.label || id);

    const primaryText = isMine ? (isJoin ? `내가 올린 조인 · 확정 ${applied}/${capacity}` : (applied > 0 ? "예약 확정됨 · 내 글" : pending > 0 ? `예약 신청 ${pending}건 · 내 글` : "내가 올린 부킹"))
        : myStatus === "accepted" ? (isJoin ? "확정됐어요 · 취소하기" : "예약 확정 · 취소하기")
            : myStatus === "applied" ? (joinFull ? "마감 · 자리 나면 알려 드려요 · 취소" : "승인 기다리는 중 · 취소하기")
                : myStatus === "rejected" ? "올린 분이 받지 않은 신청이에요"
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
                        {/* 부킹은 거의 다 업체가 올린다(운영 실측 10/10) — 그걸 카드마다 '매장' 이라고 적으면
                            모든 카드에 같은 글자가 반복될 뿐 아무것도 구별하지 않는다. 게다가 '매장' 은 당구 말이라
                            골프에서는 뜻이 안 통했다(2026-09-23 오너: "부킹에 매장이란 표현은 뭐야?").
                            **예외일 때만 알린다** — 사는 사람이 조심해야 할 건 모르는 개인에게 사는 쪽이다. */}
                        {isJoin && joinType
                            ? <JoinTypeBadge type={joinType} />
                            : item.sellerType === 'PERSONAL'
                                ? <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#4DA3FF]/15 text-[#7CBBFF]">개인 양도</span>
                                : null}
                        {item.isBlind && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/10 text-white/60 text-[10.5px] font-medium">비공개</span>}
                    </div>
                    {isJoin ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <SlotDots slots={slots} filled={applied} size={16} hostLabel={hostLabel} />
                            <span className="text-[12px] font-medium text-white/60 truncate">
                                {/* 정원이 아니라 **남은 자리**를 적는다 — 전환 글은 이미 팔린 자리도 OPEN 이라
                                    정원을 그대로 쓰면 '확정 2/4' 옆에 '4명 모집' 이 나란히 찍힌다(2026-09-24). */}
                                {joinFull ? "자리가 찼어요" : `${Math.max(0, capacity - applied)}명 모집 · ${openGenderText(slots, applied)}`}
                                {isMine && pending > 0 && <span className="text-[#FF8A33]"> · 대기 {pending}</span>}
                            </span>
                        </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/45 truncate">
                        <span className="truncate">{item.isBlind ? "위치 비공개" : item.region}</span>
                        {km !== null && <><span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" /><span className="text-[#7CBBFF] shrink-0">{formatDistance(km)}</span></>}
                        {/* 거리를 켜면 캐디 글자는 접힌 줄에서 뺀다 — 375px 에서 셋을 나란히 두면 지역이 '경…' 으로 잘려 아무 말도 아니게 된다.
                            캐디 정보는 펼친 칸의 옵션 칩에 그대로 있다(2026-09-23 거리 표기를 넣으며 실측). */}
                        {km === null && (!isJoin || joinType === 'FIELD') && <><span className="w-0.5 h-2 bg-white/10 rounded-full shrink-0" /><span className="shrink-0">{caddie}</span></>}
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
                                    <div className="text-[12px] text-white/45 truncate">
                                        {item.isBlind ? "위치 비공개 — 문의로 확인" : item.region}
                                        {km !== null && <span className="text-[#7CBBFF]"> · 내 위치에서 {formatDistance(km)}</span>}
                                    </div>
                                </div>
                                {!item.isBlind && (
                                    <div className="flex gap-1.5 shrink-0">
                                        <a href={kakaoMapUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" onClick={stop} className={pill}>지도</a>
                                        <a href={kakaoRouteUrl(name, item.lat, item.lng)} target="_blank" rel="noreferrer" onClick={stop} className={pill}>길찾기</a>
                                    </div>
                                )}
                            </div>

                            {/* 긴급 조인이 왜 이 값인지 한 줄 — 그린피만 던진 것이지 공짜 라운드가 아니라는 걸 먼저 알려야 한다 */}
                            {urgent && (
                                <div className="flex items-center gap-2 rounded-xl bg-[#FFC400]/10 border border-[#FFC400]/25 px-3 py-2.5">
                                    <span className="text-[13px] leading-none">⚡</span>
                                    <span className="text-[12.5px] font-medium text-[#FFD966] leading-relaxed">{t("golf.urgentNote")}</span>
                                </div>
                            )}

                            {/* 조인: 자리 */}
                            {isJoin && (
                                <div className={cn(box, "space-y-2.5")}>
                                    <div className="flex items-center justify-between">
                                        <span className={label}>자리</span>
                                        <span className="text-[12px] font-medium text-[#FF8A33]">확정 {applied}/{capacity}{pending > 0 && (isMine ? ` · 대기 ${pending}` : "")}</span>
                                    </div>
                                    <SlotDots slots={slots} filled={applied} size={26} hostLabel={hostLabel} />
                                    <div className="flex flex-wrap gap-1.5">
                                        {slotLegend(slots, hostLabel, applied).map((t) => <span key={t} className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[12px] text-white/70">{t}</span>)}
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

                            {/*
                              * 내 부킹을 조인으로 — 팔고 남은 자리가 있을 때(2026-09-23 오너).
                              * 이름은 '조인으로 전환' 한 마디다(오너: "'자리가 남았어요 - 조인으로 돌리기'가 아니라 그냥 '조인으로 전환'").
                              * 아래 버튼 줄이 아니라 그 위에 온전한 한 줄로 둔다: 줄에 이미 신청·문자·공유·내리기가 있어 375px 에서 이름이 잘린다.
                              * 확정된 예약이 있으면 안 보인다 — 팀이 통째로 팔린 티타임에는 나눌 자리가 없다(서버도 409).
                              */}
                            {isMine && !isJoin && !past && onToJoin && applied < MAX_SLOTS && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToJoin(item); }}
                                    className="w-full h-11 rounded-xl border border-[#FF6B00]/35 bg-[#FF6B00]/10 text-[13.5px] font-medium text-[#FF8A33] active:bg-[#FF6B00]/20"
                                >조인으로 전환</button>
                            )}

                            {/* 버튼: 조인·부킹 모두 앱 안 신청. 부킹은 인원을 고른 뒤 보낸다. */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isMine || !onApply) return;
                                        // 확정된 자리의 취소는 되돌릴 수 없다(취소 기록이 남고 올린 분께 알림이 간다) — 내역 시트처럼 확인을 받는다.
                                        if (myStatus === "accepted" && !window.confirm(isJoin ? "확정된 조인을 취소할까요?\n올린 분께 알림이 가고 취소 기록이 남아요." : "확정된 예약을 취소할까요?\n올린 분께 알림이 가고 취소 기록이 남아요.")) return;
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
