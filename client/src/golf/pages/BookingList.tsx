import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideSearch,
    LucidePlus,
    LucideLoader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookingCreateForm } from "../components/BookingCreateForm";
import { GlobalSearch } from "../components/GlobalSearch";

// Constants & Hooks
import { THEME_COLORS } from "../constants/booking";
import { useBookingFilters } from "../hooks/useBookingFilters";
import { useDeepLink } from "../hooks/useDeepLink";
import { useBookingData } from "../hooks/useBookingData";
import { useShare } from "../hooks/useShare";

// Components
import { BookingCard } from "../components/booking/BookingCard";
import { DateSelector } from "../components/booking/DateSelector";
import { FilterBar } from "../components/booking/FilterBar";
import { ShareSheet } from "../components/booking/ShareSheet";

export default function BookingList() {
    const [selectedDate, setSelectedDate] = useState(0);
    const [viewType, setViewType] = useState<'ALL' | 'BOOKING' | 'JOIN'>('BOOKING');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isBookingManager, setIsBookingManager] = useState(false);

    // Custom Hooks
    const { selectedFilters, toggleFilter, clearFilter } = useBookingFilters();
    const {
        isShareModalOpen,
        setIsShareModalOpen,
        shareItem,
        handleShare,
        handleExternalShare,
        handleSendToCrew,
        copyToClipboard
    } = useShare();

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

    const { bookingCounts, bookings, isLoading, isError } = useBookingData(weekDates, selectedDate, viewType, selectedFilters);
    const { expandedBookingId, setExpandedBookingId } = useDeepLink(bookings);

    // Auth check
    const { data: user } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    useEffect(() => {
        if (user) {
            const authorizedRoles = ['admin', 'super_admin', 'store_owner', 'booking_manager'];
            setIsBookingManager(authorizedRoles.includes(user.role));
        }
    }, [user]);

    // My Crews for sharing
    const { data: myCrewsData } = useQuery<any[]>({ queryKey: ["/api/hiq/crews/mine"] });
    const myCrews = useMemo(() => myCrewsData?.map(item => item.crew) || [], [myCrewsData]);

    const theme = viewType === 'JOIN' ? THEME_COLORS.JOIN : THEME_COLORS.BOOKING;

    // ⚡ Performance Optimization: Memoized filtering and sorting
    const filteredTimes = useMemo(() => {
        if (!bookings) return [];

        return bookings.filter(item => {
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
            if (sortFilters.includes('sort_low')) return a.greenFee - b.greenFee;
            if (sortFilters.includes('sort_discount')) {
                if (a.isHotDeal && !b.isHotDeal) return -1;
                if (!a.isHotDeal && b.isHotDeal) return 1;
                return a.greenFee - b.greenFee;
            }
            return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
        });
    }, [bookings, viewType, selectedFilters]);

    const handleReserve = useCallback((item: any) => {
        const phoneNumber = item.managerPhone || "010-1234-5678";
        const dateStr = weekDates[selectedDate].displayDate;
        const timeStr = new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const displayName = item.isBlind ? item.blindName : item.courseName;
        const actionText = item.listingType === 'JOIN' ? "조인 신청 가능한가요?" : "예약 가능한가요?";
        const messageBody = `안녕하세요! [랭큐] 보고 연락드립니다.\n${displayName} / ${dateStr} / ${timeStr} / ${item.greenFee.toLocaleString()}원\n${actionText}`;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const delimiter = isIOS ? '&' : '?';
        window.open(`sms:${phoneNumber}${delimiter}body=${encodeURIComponent(messageBody)}`, '_self');
    }, [selectedDate, weekDates]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-20 font-sans selection:bg-[#64DD17]/30">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors" title="뒤로가기">
                            <LucideChevronLeft className="w-6 h-6" />
                        </button>
                        <div className={cn("px-4 py-2 rounded-full border", viewType === 'JOIN' ? "bg-[#FF6B00]/10 border-[#FF6B00]/20" : "bg-[#64DD17]/10 border-[#64DD17]/20")}>
                            <h1 className={cn("text-sm font-black tracking-tight", theme.text)}>
                                {weekDates[selectedDate].displayDate}
                            </h1>
                        </div>

                        {/* Type Toggle */}
                        <div className="flex items-center bg-[#1A1A1A] rounded-full p-1 border border-white/5 h-10">
                            {(['BOOKING', 'JOIN'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setViewType(type)}
                                    className={cn(
                                        "px-5 h-full rounded-full text-xs font-black transition-all flex items-center justify-center whitespace-nowrap min-w-[70px]",
                                        viewType === type ? (type === 'BOOKING' ? "bg-[#64DD17] text-[#051907]" : "bg-[#FF6B00] text-white") : "text-white/40 hover:text-white"
                                    )}
                                >
                                    {type === 'BOOKING' ? '부킹' : '조인'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setIsSearchOpen(true)} className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-colors" title="검색">
                        <LucideSearch className="w-5 h-5 opacity-40 hover:opacity-100 transition-opacity" />
                    </button>
                </div>

                <DateSelector
                    weekDates={weekDates}
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    bookingCounts={bookingCounts}
                    viewType={viewType}
                />

                <FilterBar
                    selectedFilters={selectedFilters}
                    toggleFilter={toggleFilter}
                    clearFilter={clearFilter}
                    viewType={viewType}
                />
            </div>

            <main className="p-6">
                <div className="mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                        {isLoading ? "불러오는 중..." : `총 ${filteredTimes.length}개의 티타임이 검색되었습니다`}
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/20">
                        <LucideLoader2 className="w-8 h-8 animate-spin" />
                        <span className="text-xs font-bold uppercase tracking-widest">티타임 검색중...</span>
                    </div>
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                        <p className="text-sm font-bold text-white/40">데이터를 불러오지 못했습니다.</p>
                        <button onClick={() => window.location.reload()} className={cn("px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest", theme.bg, viewType === 'JOIN' ? 'text-white' : 'text-[#051907]')}>
                            다시 시도
                        </button>
                    </div>
                ) : filteredTimes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                            <LucideSearch className="w-6 h-6 text-white/10" />
                        </div>
                        <p className="text-sm font-bold text-white/40">조건에 맞는 티타임이 없습니다.</p>
                        <button onClick={() => clearFilter('region')} className="text-xs font-black text-[#64DD17] uppercase tracking-widest">필터 초기화</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredTimes.map((item) => (
                            <BookingCard
                                key={item.id}
                                item={item}
                                expandedBookingId={expandedBookingId}
                                onExpand={setExpandedBookingId}
                                onReserve={handleReserve}
                                onShare={handleShare}
                                viewType={viewType}
                            />
                        ))}
                    </div>
                )}
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
                                "fixed bottom-8 right-6 z-[60] px-6 py-4 rounded-full font-black text-sm uppercase tracking-widest flex items-center gap-2 transition-all",
                                theme.bg, theme.shadow,
                                viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'
                            )}
                        >
                            <LucidePlus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                            <span>{viewType === 'JOIN' ? "조인 만들기" : "부킹 만들기"}</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            )}

            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="p-0 border-none bg-transparent max-w-md w-full h-[90vh] overflow-hidden flex flex-col" hideClose={true}>
                    <BookingCreateForm onClose={() => setIsCreateModalOpen(false)} initialMode={viewType === 'ALL' ? 'BOOKING' : viewType} />
                </DialogContent>
            </Dialog>

            <ShareSheet
                open={isShareModalOpen}
                onOpenChange={setIsShareModalOpen}
                shareItem={shareItem}
                onExternalShare={handleExternalShare}
                onCopyLink={copyToClipboard}
                myCrews={myCrews}
                onSendToCrew={(crew, item) => handleSendToCrew(crew, item)}
            />

            <GlobalSearch
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                viewType={viewType}
                onSelectBooking={(booking) => {
                    const dt = typeof booking.datetime === 'string' ? new Date(booking.datetime) : booking.datetime;
                    const dateIdx = weekDates.findIndex(d => d.fullDate === dt.toISOString().split('T')[0]);
                    if (dateIdx !== -1) {
                        setSelectedDate(dateIdx);
                        setExpandedBookingId(booking.id);
                        setIsSearchOpen(false);
                        requestAnimationFrame(() => {
                            document.getElementById(`booking-${booking.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                    }
                }}
            />
        </div>
    );
}
