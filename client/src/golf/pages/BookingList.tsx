import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideSearch,
    LucideCircleDollarSign,
    LucideUsers,
    LucideCheckCircle2,
    LucideArrowUpDown,
    LucideX,
    LucideChevronRight,
    LucideMapPin,
    LucideClock,
    LucidePlus,
    LucideMessageSquare,
    LucideShare2,
    LucideCopy,
    LucideSend,
    LucideMessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GolfBooking } from "../../../../shared/schema";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetClose
} from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookingCreateForm } from "../components/BookingCreateForm";
import { GlobalSearch } from "../components/GlobalSearch";

const REGION_OPTIONS = [
    { id: 'kyunggi_south', label: '경기 남부 (한강 이남)' },
    { id: 'kyunggi_north', label: '경기 북부 (한강 이북)' },
    { id: 'kyunggi_east', label: '경기 동부 (남양주/가평)' },
    { id: 'incheon_west', label: '인천 / 경기 서부' },
    { id: 'gangwon', label: '강원권' },
    { id: 'chungcheong', label: '충청권' },
    { id: 'jeolla', label: '전라권' },
    { id: 'gyeongsang', label: '경상권' },
    { id: 'jeju', label: '제주' }
];

const PRICE_OPTIONS = [
    { id: 'under_10', label: '10만원 이하' },
    { id: 'range_10_15', label: '10 ~ 15만원' },
    { id: 'range_15_20', label: '15 ~ 20만원' },
    { id: 'over_20', label: '20만원 이상' },
    { id: 'sort_low', label: '가격 낮은순' },
    { id: 'sort_discount', label: '할인율 높은순' }
];

const SPECIAL_OPTIONS = [
    { id: 'couple_2', label: '2인 플레이' },
    { id: 'player_3', label: '3인 가능' },
    { id: 'no_caddie', label: '노캐디' },
    { id: 'marshal', label: '마샬/드라이빙 캐디' },
    { id: 'meal_inc', label: '식사 제공' },
    { id: 'cart_free', label: '카트비 무료/할인' }
];

const TIME_OPTIONS = [
    { id: 'all', label: '전체 시간' },
    { id: 'morning', label: '1부 (06:00 ~ 11:59)' },
    { id: 'afternoon', label: '2부 (12:00 ~ 16:59)' },
    { id: 'night', label: '3부 (17:00 ~ 이후)' }
];

export default function BookingList() {
    const [selectedDate, setSelectedDate] = useState(0);
    const [viewType, setViewType] = useState<'ALL' | 'BOOKING' | 'JOIN'>('BOOKING');
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        region: [],
        price: [],
        special: [],
        time: ['all']
    });

    // 공유 관련 상태
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareItem, setShareItem] = useState<any>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchSelectedItem, setSearchSelectedItem] = useState<GolfBooking | null>(null);

    const handleShare = (item: any) => {
        setShareItem(item);
        setIsShareModalOpen(true);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("예약 링크가 복사되었습니다! 친구에게 붙여넣기 하세요.");
        setIsShareModalOpen(false); // 복사 후 닫기
    };

    const handleExternalShare = async (item: any) => {
        const shareUrl = `${window.location.origin}/golf/booking-list/${item.id}`;
        const shareData = {
            title: `[랭큐] ${item.courseName || item.blindName} 예약`,
            text: `${new Date(item.datetime).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}\n그린피: ${item.greenFee.toLocaleString()}원`,
            url: shareUrl,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Share failed', err);
            }
        } else {
            copyToClipboard(shareUrl);
        }
    };

    const [isBookingManager, setIsBookingManager] = useState(true);
    const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

    const { data: user } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
    });

    useEffect(() => {
        if (user) {
            const authorizedRoles = ['admin', 'super_admin', 'store_owner', 'booking_manager'];
            setIsBookingManager(authorizedRoles.includes(user.role));
        } else {
            setIsBookingManager(false);
        }
    }, [user]);

    // Color Theme Constants
    const themeColor = viewType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';
    const themeBg = viewType === 'JOIN' ? 'bg-[#FF6B00]' : 'bg-[#64DD17]';
    const themeBorder = viewType === 'JOIN' ? 'border-[#FF6B00]' : 'border-[#64DD17]';

    // Generate next 30 days
    const weekDates = useMemo(() => Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
        const dayOfWeek = dayNames[date.getDay()];
        const month = date.getMonth() + 1;
        const dateNum = date.getDate();

        return {
            dayName: i === 0 ? "오늘" : dayOfWeek,
            dateNum: dateNum,
            displayDate: `${month}/${dateNum} ${dayOfWeek}요일`,
            fullDate: date.toISOString().split('T')[0]
        };
    }), []);

    const selectedFullDate = weekDates[selectedDate].fullDate;

    // Fetch booking counts
    const { data: bookingCounts = [] } = useQuery({
        queryKey: ['/api/hiq/golf/bookings/counts', weekDates[0].fullDate, weekDates[weekDates.length - 1].fullDate, viewType],
        queryFn: async () => {
            const start = weekDates[0].fullDate;
            const end = weekDates[weekDates.length - 1].fullDate;
            return apiRequest(`/api/hiq/golf/bookings/counts?startDate=${start}&endDate=${end}&viewType=${viewType}`);
        }
    });

    // Fetch actual tee times
    const { data: bookings = [] } = useQuery<GolfBooking[]>({
        queryKey: [viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings', {
            date: selectedFullDate,
            region: selectedFilters.region.join(','),
        }],
        queryFn: async () => {
            const endpoint = viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings';
            const params = new URLSearchParams({
                date: selectedFullDate,
            });
            if (selectedFilters.region.length > 0) {
                params.append('region', selectedFilters.region.join(','));
            }
            return apiRequest(`${endpoint}?${params.toString()}`);
        }
    });

    // URL Deep Link Handling
    useEffect(() => {
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];

        if (lastPart && lastPart.length > 20) { // UUID 길이 체크 대략적으로
            setExpandedBookingId(lastPart);
            setTimeout(() => {
                const element = document.getElementById(`booking-${lastPart}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 800);
        }
    }, [bookings]); // bookings 데이터가 로드된 후 실행되도록 의존성 추가

    // 내 크루 정보 가져오기
    const { data: myCrewsData } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine"],
    });

    const myCrews = useMemo(() => {
        if (!myCrewsData) return [];
        return myCrewsData.map(item => item.crew);
    }, [myCrewsData]);

    const handleSendToCrew = async (crew: any) => {
        if (!shareItem) return;

        const dateStr = new Date(shareItem.datetime).toLocaleDateString('ko-KR', {
            month: 'long', day: 'numeric', weekday: 'short'
        });
        const timeStr = new Date(shareItem.datetime).toLocaleTimeString('ko-KR', {
            hour: '2-digit', minute: '2-digit'
        });
        const shareUrl = `${window.location.origin}/golf/booking-list/${shareItem.id}`;

        const message = `⛳️ [부킹 공유] ${shareItem.courseName || shareItem.blindName}\n📅 ${dateStr} ${timeStr}\n💰 그린피 ${shareItem.greenFee.toLocaleString()}원\n👉 확인하기: ${shareUrl}`;

        try {
            await apiRequest(`/api/hiq/crews/${crew.id}/chats`, {
                method: "POST",
                body: {
                    message,
                    type: "text",
                    metadata: {
                        type: 'GOLF_BOOKING',
                        bookingId: shareItem.id,
                        courseName: shareItem.courseName || shareItem.blindName,
                        datetime: shareItem.datetime,
                        greenFee: shareItem.greenFee
                    }
                }
            });
            alert(`${crew.name} 채팅방에 공유되었습니다!`);
            setIsShareModalOpen(false);
        } catch (e) {
            alert("공유 중 오류가 발생했습니다.");
        }
    };

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const toggleFilter = (category: string, id: string) => {
        setSelectedFilters(prev => {
            const current = prev[category];
            const updated = current.includes(id)
                ? current.filter(item => item !== id)
                : [...current, id];

            if (category === 'time') {
                if (id === 'all') return { ...prev, [category]: ['all'] };
                const newTime = updated.filter(x => x !== 'all');
                return { ...prev, [category]: newTime.length === 0 ? ['all'] : newTime };
            }

            return { ...prev, [category]: updated };
        });
    };

    const clearFilter = (category: string) => {
        setSelectedFilters(prev => ({
            ...prev,
            [category]: category === 'time' ? ['all'] : []
        }));
    };

    const handleReserve = (item: any) => {
        const phoneNumber = item.managerPhone || "010-1234-5678";
        const dateInfo = weekDates[selectedDate];
        const dateStr = dateInfo.displayDate;
        const timeStr = new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const displayName = item.isBlind ? item.blindName : item.courseName;
        const actionText = item.listingType === 'JOIN' ? "조인 신청 가능한가요?" : "예약 가능한가요?";
        const messageBody = `안녕하세요! [랭큐] 보고 연락드립니다.\n${displayName} / ${dateStr} / ${timeStr} / ${item.greenFee.toLocaleString()}원\n${actionText}`;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const delimiter = isIOS ? '&' : '?';
        const smsUrl = `sms:${phoneNumber}${delimiter}body=${encodeURIComponent(messageBody)}`;
        window.open(smsUrl, '_self');
    };

    const filteredTimes = (bookings || []).filter(item => {
        if (viewType === 'BOOKING' && item.listingType === 'JOIN') return false;
        if (viewType === 'JOIN' && item.listingType !== 'JOIN') return false;

        const timeFilters = selectedFilters.time;
        if (timeFilters.length > 0 && !timeFilters.includes('all')) {
            const hour = new Date(item.datetime).getHours();
            let category = 'night';
            if (hour < 12) category = 'morning';
            else if (hour < 17) category = 'afternoon';
            if (!timeFilters.includes(category)) return false;
        }

        const priceFilters = selectedFilters.price.filter(p => !p.startsWith('sort_'));
        if (priceFilters.length > 0) {
            const price = item.greenFee;
            const match = priceFilters.some(filter => {
                if (filter === 'under_10') return price <= 100000;
                if (filter === 'range_10_15') return price > 100000 && price <= 150000;
                if (filter === 'range_15_20') return price > 150000 && price <= 200000;
                if (filter === 'over_20') return price > 200000;
                return false;
            });
            if (!match) return false;
        }

        if (selectedFilters.special.length > 0) {
            const itemOptions = item.options || [];
            const hasAny = selectedFilters.special.some(f => itemOptions.includes(f));
            if (!hasAny) return false;
        }

        return true;
    }).sort((a, b) => {
        const sortFilters = selectedFilters.price.filter(p => p.startsWith('sort_'));
        if (sortFilters.includes('sort_low')) {
            return a.greenFee - b.greenFee;
        }
        if (sortFilters.includes('sort_discount')) {
            if (a.isHotDeal && !b.isHotDeal) return -1;
            if (!a.isHotDeal && b.isHotDeal) return 1;
            return a.greenFee - b.greenFee;
        }
        return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    });

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-20 font-sans selection:bg-[#64DD17]/30">
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => window.history.back()}
                            className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
                            title="뒤로 가기"
                        >
                            <LucideChevronLeft className="w-6 h-6" />
                        </button>
                        <div className={cn("px-4 py-2 rounded-full border",
                            viewType === 'JOIN' ? "bg-[#FF6B00]/10 border-[#FF6B00]/20" : "bg-[#64DD17]/10 border-[#64DD17]/20"
                        )}>
                            <h1 className={cn("text-sm font-black tracking-tight", themeColor)}>
                                {weekDates[selectedDate].displayDate}
                            </h1>
                        </div>

                        {/* Type Toggle */}
                        <div className="flex items-center bg-[#1A1A1A] rounded-full p-1 border border-white/5 h-10">
                            <button
                                onClick={() => setViewType('BOOKING')}
                                className={cn(
                                    "px-5 h-full rounded-full text-xs font-black transition-all flex items-center justify-center whitespace-nowrap min-w-[70px]",
                                    viewType === 'BOOKING'
                                        ? "bg-[#64DD17] text-[#051907] shadow-sm"
                                        : "text-white/40 hover:text-white"
                                )}
                            >
                                부킹
                            </button>
                            <button
                                onClick={() => setViewType('JOIN')}
                                className={cn(
                                    "px-5 h-full rounded-full text-xs font-black transition-all flex items-center justify-center whitespace-nowrap min-w-[70px]",
                                    viewType === 'JOIN'
                                        ? "bg-[#FF6B00] text-white shadow-sm"
                                        : "text-white/40 hover:text-white"
                                )}
                            >
                                조인
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-colors"
                        title="검색"
                    >
                        <LucideSearch className="w-5 h-5 opacity-40 hover:opacity-100 transition-opacity" />
                    </button>
                </div>

                {/* Horizontal Weekly Calendar */}
                <div className="flex gap-3 overflow-x-auto px-6 pb-6 pt-2 scrollbar-hide">
                    {weekDates.map((date, idx) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedDate(idx)}
                            className={cn(
                                "flex flex-col items-center min-w-[64px] py-4 rounded-2xl border transition-all duration-300",
                                selectedDate === idx
                                    ? `${themeBg} ${themeBorder} text-[#051907] scale-105 shadow-[0_0_20px_rgba(255,255,255,0.1)]`
                                    : "bg-[#1E1E1E] border-white/5 text-white/20 hover:border-white/20"
                            )}
                        >
                            <span className="text-[10px] font-bold uppercase tracking-widest mb-1">{date.dayName}</span>
                            <span className="text-xl font-black">{date.dateNum}</span>

                            {(Array.isArray(bookingCounts) ? bookingCounts : []).find((c: any) => c.date === date.fullDate) && (
                                <div className={cn(
                                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold mt-1.5",
                                    selectedDate === idx ? "bg-black/20 text-black" : (viewType === 'JOIN' ? 'bg-[#FF6B00]/20 text-[#FF6B00]' : 'bg-[#64DD17]/20 text-[#64DD17]')
                                )}>
                                    {(Array.isArray(bookingCounts) ? bookingCounts : []).find((c: any) => c.date === date.fullDate)?.count?.toLocaleString()}개
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                {/* Filter Chips */}
                <div className="flex gap-2 overflow-x-auto px-6 pb-6 scrollbar-hide">
                    <FilterChip
                        icon={LucideMapPin}
                        label="골프장"
                        title="골프장 선택"
                        options={REGION_OPTIONS}
                        selectedIds={selectedFilters.region}
                        onToggle={(id) => toggleFilter('region', id)}
                        onReset={() => clearFilter('region')}
                        active={selectedFilters.region.length > 0}
                        viewType={viewType}
                    />
                    <FilterChip
                        icon={LucideClock}
                        label="시간"
                        title="시간대 선택"
                        options={TIME_OPTIONS}
                        selectedIds={selectedFilters.time}
                        onToggle={(id) => toggleFilter('time', id)}
                        onReset={() => clearFilter('time')}
                        active={selectedFilters.time.length > 0 && !selectedFilters.time.includes('all')}
                        viewType={viewType}
                    />
                    <FilterChip
                        icon={LucideArrowUpDown}
                        label="가격"
                        title="가격 및 정렬"
                        options={PRICE_OPTIONS}
                        selectedIds={selectedFilters.price}
                        onToggle={(id) => toggleFilter('price', id)}
                        onReset={() => clearFilter('price')}
                        active={selectedFilters.price.length > 0}
                        viewType={viewType}
                    />
                    <FilterChip
                        icon={LucideUsers}
                        label="인원/옵션"
                        title="인원 및 옵션 선택"
                        options={SPECIAL_OPTIONS}
                        selectedIds={selectedFilters.special}
                        onToggle={(id) => toggleFilter('special', id)}
                        onReset={() => clearFilter('special')}
                        active={selectedFilters.special.length > 0}
                        viewType={viewType}
                    />
                </div>
            </div>

            <main className="p-6">
                <div className="mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                        총 {filteredTimes.length}개의 티타임이 검색되었습니다
                    </p>
                </div>

                <div className="space-y-4">
                    {filteredTimes.map((item) => (
                        <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            key={item.id}
                            id={`booking-${item.id}`} // Deep Linking용 ID 추가
                            className={cn(
                                "bg-[#1E1E1E] border border-[#333333] rounded-3xl overflow-hidden transition-all duration-300",
                                expandedBookingId === item.id ? `${themeBorder} shadow-[0_4px_20px_-4px_rgba(100,221,23,0.1)] mb-4` : "hover:border-[#64DD17]/30 mb-3"
                            )}
                        >
                            {/* Card Header */}
                            <div
                                onClick={() => setExpandedBookingId(expandedBookingId === item.id ? null : item.id)}
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
                                                expandedBookingId === item.id ? themeColor : "text-white group-hover:text-[#64DD17]"
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
                                        <div className={cn("text-lg font-black tracking-tighter", themeColor)}>
                                            {item.greenFee.toLocaleString()}<span className="text-xs ml-0.5 opacity-60">원</span>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition-all duration-300",
                                        expandedBookingId === item.id ? `${themeBg} ${themeBorder} rotate-90` : "bg-white/5 group-hover:bg-white/10"
                                    )}>
                                        <LucideChevronRight className={cn(
                                            "w-4 h-4 transition-colors",
                                            expandedBookingId === item.id ? "text-[#051907]" : "text-white/40"
                                        )} />
                                    </div>
                                </div>
                            </div>

                            <AnimatePresence>
                                {expandedBookingId === item.id && (
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
                                                                <span key={optId} className={cn("px-2 py-1 rounded-lg text-[10px] font-bold", viewType === 'JOIN' ? "bg-[#FF6B00]/10 text-[#FF6B00]" : "bg-[#64DD17]/10 text-[#64DD17]")}>
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
                                                        handleReserve(item);
                                                    }}
                                                    className={cn(
                                                        "flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest shadow-[0_4px_20px_-4px_rgba(100,221,23,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2",
                                                        item.listingType === 'JOIN' ? 'bg-[#FF6B00] text-white shadow-[0_4px_20px_-4px_rgba(255,107,0,0.3)]' : 'bg-[#64DD17] text-[#051907]'
                                                    )}
                                                >
                                                    <span>{item.listingType === 'JOIN' ? "조인 신청하기" : "예약 문자 보내기"}</span>
                                                    <LucideChevronRight className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShare(item);
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
                    ))}
                </div>
            </main>

            {isBookingManager && (
                <AnimatePresence>
                    {!isCreateModalOpen && (
                        <motion.button
                            initial={{ scale: 0, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0, opacity: 0, y: 20 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsCreateModalOpen(true)}
                            className={cn(
                                "fixed bottom-8 right-6 z-[60] px-6 py-4 rounded-full font-black text-sm uppercase tracking-widest shadow-[0_10px_30px_rgba(100,221,23,0.4)] flex items-center gap-2 group transition-all",
                                themeBg,
                                viewType === 'JOIN' ? 'text-white shadow-[0_10px_30px_rgba(255,107,0,0.4)]' : 'text-[#051907] shadow-[0_10px_30px_rgba(100,221,23,0.4)]'
                            )}
                        >
                            <LucidePlus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                            <span>{viewType === 'JOIN' ? "조인 만들기" : "부킹 만들기"}</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            )}

            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="p-0 border-none bg-transparent max-w-md w-full h-[90vh] overflow-hidden" hideClose={true}>
                    <BookingCreateForm
                        onClose={() => setIsCreateModalOpen(false)}
                        initialMode={viewType === 'ALL' ? 'BOOKING' : viewType}
                    />
                </DialogContent>
            </Dialog>

            {/* 공유 바텀 시트 */}
            <Sheet open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
                <SheetContent side="bottom" className="z-[80] bg-[#1A1A1A] border-t border-white/5 rounded-t-[2.5rem] focus:outline-none [&&>button]:hidden">
                    <div className="absolute right-8 top-8 z-50">
                        <SheetClose asChild>
                            <button className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all active:scale-95" title="닫기">
                                <LucideX className="w-6 h-6" />
                            </button>
                        </SheetClose>
                    </div>

                    <SheetHeader className="mb-8 px-8 pt-8">
                        <SheetTitle className="text-xl font-black text-white">이 티타임 공유하기</SheetTitle>
                    </SheetHeader>

                    <div className="px-8 pb-12 space-y-8">
                        {/* 외부 공유 섹션 */}
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => handleExternalShare(shareItem)}
                                className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-[#FAE100] hover:scale-[1.02] transition-all group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center">
                                    <LucideMessageCircle className="w-6 h-6 text-[#3C1E1E]" />
                                </div>
                                <span className="text-[11px] font-black text-[#3C1E1E] uppercase tracking-widest">카카오톡</span>
                            </button>
                            <button
                                onClick={() => {
                                    const link = `${window.location.origin}/golf/booking-list/${shareItem?.id}`;
                                    copyToClipboard(link);
                                }}
                                className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                                    <LucideCopy className="w-6 h-6 text-white/60 group-hover:text-white" />
                                </div>
                                <span className="text-[11px] font-black text-white/40 group-hover:text-white uppercase tracking-widest">링크 복사</span>
                            </button>
                        </div>

                        {/* 구분선 */}
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/5"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="px-4 bg-[#1A1A1A] text-[9px] font-black text-white/10 uppercase tracking-[0.3em]">OR SEND TO CREW</span>
                            </div>
                        </div>

                        {/* 내부 크루 공유 섹션 */}
                        <div className="space-y-3">
                            <div className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1 mb-2">내 크루 채팅방에 보내기</div>
                            {myCrews.length === 0 ? (
                                <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center">
                                    <p className="text-xs font-bold text-white/20">가입된 크루가 없습니다.</p>
                                </div>
                            ) : (
                                myCrews.map((crew: any) => (
                                    <button
                                        key={crew.id}
                                        onClick={() => handleSendToCrew(crew)}
                                        className="w-full p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-[#64DD17]/30 hover:bg-[#64DD17]/5 flex items-center justify-between group transition-all"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#64DD17]/20 transition-colors overflow-hidden">
                                                {crew.emblem ? (
                                                    <span className="text-xl">{crew.emblem}</span>
                                                ) : (
                                                    <LucideMessageSquare className="w-5 h-5 text-white/20 group-hover:text-[#64DD17]" />
                                                )}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-white group-hover:text-[#64DD17] transition-colors">{crew.name}</div>
                                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-tight">{crew.shortIntro || '크루 채팅방'}</div>
                                            </div>
                                        </div>
                                        <LucideSend className="w-4 h-4 text-white/10 group-hover:text-[#64DD17] -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
            <GlobalSearch
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                viewType={viewType}
                onSelectBooking={(booking) => {
                    // Navigate to the date
                    const dt = typeof booking.datetime === 'string' ? new Date(booking.datetime) : booking.datetime;
                    const dateIdx = weekDates.findIndex(d => d.fullDate === dt.toISOString().split('T')[0]);
                    if (dateIdx !== -1) {
                        setSelectedDate(dateIdx);
                        setExpandedBookingId(booking.id);
                        setIsSearchOpen(false);

                        // Scroll to the booking item after modal closes
                        setTimeout(() => {
                            const element = document.getElementById(`booking-${booking.id}`);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 300);
                    }
                }}
            />
        </div>
    );
}

function FilterChip({
    icon: Icon,
    label,
    active = false,
    title,
    options,
    selectedIds,
    onToggle,
    onReset,
    viewType
}: {
    icon: any,
    label: string,
    active?: boolean,
    title: string,
    options: { id: string, label: string }[],
    selectedIds: string[],
    onToggle: (id: string) => void,
    onReset: () => void,
    viewType?: 'ALL' | 'BOOKING' | 'JOIN'
}) {
    const activeColor = viewType === 'JOIN' ? '#FF6B00' : '#64DD17';
    const activeBgColor = viewType === 'JOIN' ? 'bg-[#FF6B00]' : 'bg-[#64DD17]';
    const activeBorderColor = viewType === 'JOIN' ? 'border-[#FF6B00]' : 'border-[#64DD17]';
    const activeTextColor = viewType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';
    return (
        <Sheet>
            <SheetTrigger asChild>
                <button
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0",
                        active
                            ? `${activeBgColor}/10 ${activeBorderColor} ${activeTextColor}`
                            : "bg-[#1A1A1A] border-white/5 text-white/40"
                    )}
                    title={title}
                >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {selectedIds.length > 0 && (
                        <span className={cn("w-4 h-4 rounded-full text-[8px] flex items-center justify-center",
                            activeBgColor,
                            viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'
                        )}>
                            {selectedIds.length}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="z-[70] bg-[#1A1A1A] border-t border-white/5 rounded-t-[2.5rem] h-[70vh] flex flex-col focus:outline-none [&>button]:hidden">
                <div className="absolute right-8 top-8 z-50">
                    <SheetClose asChild>
                        <button
                            className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                            title="닫기"
                        >
                            <LucideX className="w-6 h-6" />
                        </button>
                    </SheetClose>
                </div>
                <SheetHeader className="mb-6 px-8 pt-8 pr-20 shrink-0">
                    <SheetTitle className="text-2xl font-black text-white flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", `${activeBgColor}/10`)}>
                            <Icon className={cn("w-6 h-6", activeTextColor)} />
                        </div>
                        {label} 필터
                    </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-8">
                    <div className="grid grid-cols-2 gap-4 pb-6">
                        {options.map(option => {
                            const isSelected = selectedIds.includes(option.id);
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => onToggle(option.id)}
                                    className={cn(
                                        "p-5 border rounded-2xl text-base font-bold transition-all h-20 flex items-center justify-center text-center",
                                        isSelected
                                            ? `${activeBgColor} ${activeBorderColor} ${viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'}`
                                            : "bg-white/5 border-white/5 text-white/60 hover:border-white/20"
                                    )}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="px-8 pb-8 flex gap-4 shrink-0 border-t border-white/5 pt-6">
                    <button
                        onClick={onReset}
                        className="flex-1 py-5 rounded-2xl bg-white/5 font-black uppercase tracking-widest text-[#AAAAAA] hover:bg-white/10 transition-all active:scale-95"
                    >
                        초기화
                    </button>
                    <SheetClose asChild>
                        <button className={cn(
                            "flex-1 py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all",
                            activeBgColor,
                            viewType === 'JOIN' ? 'text-white shadow-[0_0_20px_rgba(255,107,0,0.3)]' : 'text-[#051907] shadow-[0_0_20px_rgba(100,221,23,0.3)]'
                        )}>적용하기</button>
                    </SheetClose>
                </div>
            </SheetContent>
        </Sheet>
    );
}
