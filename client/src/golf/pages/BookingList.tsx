import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideSearch,
    LucidePlus,
    LucideLoader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookingCreateSheet } from "../components/booking/BookingCreateSheet";
import { MyListingsSheet, MY_LISTINGS_QUERY_KEY } from "../components/booking/MyListingsSheet";
import { JoinCreateSheet } from "../components/join/JoinCreateSheet";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { distanceKm, isKoreaCoord, JOIN_TYPE_LABEL, JOIN_TYPES, type JoinType } from "@shared/golfJoin";
import { GlobalSearch } from "../components/GlobalSearch";
import { kstDateKey, kstDateLabel, kstHour, kstTime } from "@/lib/kst";

// Constants & Hooks
import { THEME_COLORS, DATE_STRIP_DAYS } from "../constants/booking";
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
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState(0);
    // 되짚기 응답이 늦게 왔을 때 "사용자가 그 사이 직접 날짜를 골랐는지" 를 본다.
    // 골랐으면 덮어쓰지 않는다 — 응답이 몇 초 뒤 도착해 화면이 혼자 튀는 걸 막는다.
    const userPickedDate = useRef(false);
    const pickDate = useCallback((idx: number) => { userPickedDate.current = true; setSelectedDate(idx); }, []);
    const [viewType, setViewType] = useState<'ALL' | 'BOOKING' | 'JOIN'>('BOOKING');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [myListingsOpen, setMyListingsOpen] = useState(false);
    /**
     * 조인 종류(필드/스크린/파크)와 "내 주변"(2026-09-21 오너: 스크린 조인은 내 위치 기반으로).
     * 위치는 누를 때 한 번 묻는다 — 목록을 열 때마다 권한 창이 뜨면 안 된다.
     */
    const [joinKind, setJoinKind] = useState<'ALL' | JoinType>('ALL');
    const [nearMe, setNearMe] = useState(false);
    const { location, requestLocation, locationStatus } = useNativeBridge();

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

    /**
     * 오늘부터 30일(한국 날짜). 예전엔 `now + 9시간` 을 만든 뒤 **기기 시간대의** setDate/getDate 로
     * 하루씩 밀고 UTC 게터로 읽었다 — 지역 시간대와 UTC 를 섞어 쓴 셈이라 서머타임이 있는 나라의
     * 기기에서는 하루가 통째로 빠지거나 겹칠 수 있었고, kst.ts 의 날짜 열쇠와도 어긋났다(2026-09-10 검토).
     * 이제 한국 날짜 하나를 얻은 뒤 Date.UTC 로 순수한 날짜 산술만 한다 — 시간대가 끼어들 자리가 없다.
     */
    // 한국 날짜가 바뀌면 다시 만든다 — 앱을 켜 둔 채 자정을 넘기면 '오늘' 칩이 어제를 가리켰다.
    const [todayKey, setTodayKey] = useState(() => kstDateKey(Date.now()));
    useEffect(() => {
        const check = () => setTodayKey((prev) => {
            const now = kstDateKey(Date.now());
            return now && now !== prev ? now : prev;
        });
        const timer = window.setInterval(check, 60_000);
        window.addEventListener('visibilitychange', check);
        return () => { window.clearInterval(timer); window.removeEventListener('visibilitychange', check); };
    }, []);

    const weekDates = useMemo(() => {
        const [y, m, d] = todayKey.split('-').map(Number);
        const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
        return Array.from({ length: DATE_STRIP_DAYS }, (_, i) => {
            const day = new Date(Date.UTC(y, m - 1, d + i));
            const dayOfWeek = dayNames[day.getUTCDay()];
            const month = day.getUTCMonth() + 1;
            const dateNum = day.getUTCDate();
            return {
                dayName: i === 0 ? "오늘" : dayOfWeek,
                dateNum,
                displayDate: `${month}/${dateNum} ${dayOfWeek}요일`,
                monthLabel: `${month}월`,
                fullDate: `${day.getUTCFullYear()}-${String(month).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`,
            };
        });
    }, [todayKey]);

    // Handle deep linking from URL
    useEffect(() => {
        if (weekDates.length === 0) return;
        const params = new URLSearchParams(window.location.search);
        const dateParam = params.get('date');
        const viewParam = params.get('view');

        if (viewParam === 'JOIN' || viewParam === 'BOOKING' || viewParam === 'ALL') {
            setViewType(viewParam);
        }

        if (dateParam) {
            const idx = weekDates.findIndex(d => d.fullDate === dateParam);
            if (idx !== -1) {
                setSelectedDate(idx);
                return;
            }
            // 띠(30일) 밖의 날짜다. 여기서 멈추면 아무 말 없이 '오늘' 이 열리므로 아래 되짚기로 넘어간다.
        }

        // 날짜가 안 실린 옛 링크(/golf/booking-list/<id>)이거나, 실린 날짜가 띠 밖인 경우.
        // 목록은 고른 하루치만 불러오기 때문에 오늘로 열면 그 티타임이 아예 없다 — id 로 한 건 물어본다.
        const id = window.location.pathname.split('/').filter(Boolean).pop();
        if (!id || id.length < 20) return;
        let cancelled = false;
        apiRequest(`/api/hiq/golf/bookings/${id}`)
            .then((b: any) => {
                // 응답이 늦게 와도 사용자가 그 사이 고른 날짜를 덮지 않는다
                // (아직 첫 칩(오늘)에 있을 때만 옮긴다).
                if (cancelled || !b?.datetime) return;
                if (userPickedDate.current) return;
                if (b.listingType === 'JOIN') setViewType('JOIN');
                const idx = weekDates.findIndex(d => d.fullDate === kstDateKey(b.datetime));
                if (idx !== -1) { setSelectedDate(idx); return; }
                // 30일 띠 밖이면 화면에 띄울 자리가 없다 — 조용히 오늘을 보여 주는 대신 그렇다고 말한다.
                toast({
                    title: "이 티타임은 목록에서 볼 수 있는 30일 밖이에요",
                    description: `${kstDateLabel(b.datetime)} ${kstTime(b.datetime)} · ${b.courseName ?? ''}`.trim(),
                });
            })
            .catch(() => { /* 지워졌거나 가려진 글 — 목록은 그대로 오늘을 보여 준다 */ });
        return () => { cancelled = true; };
    }, [weekDates, toast]);

    const { bookingCounts, bookings, isLoading, isError } = useBookingData(weekDates, selectedDate, viewType, selectedFilters);
    const { expandedBookingId, setExpandedBookingId } = useDeepLink(bookings);

    // Handle 'highlight' query param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const highlightId = params.get('highlight');
        if (highlightId && bookings && bookings.length > 0) {
            setExpandedBookingId(highlightId);
            // Scroll to item
            requestAnimationFrame(() => {
                document.getElementById(`booking-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }, [bookings, setExpandedBookingId]);

    // Auth check
    const { data: user } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    // My Crews for sharing
    // 종목을 반드시 실어 보낸다 — 예전엔 안 보내서 당구 크루까지 목록에 뜨고,
    // 공유를 누르면 당구 크루 채팅방에 골프 부킹 글이 올라갔다(2026-09-09 검토).
    const { data: myCrewsData } = useQuery<any[]>({ queryKey: ["/api/hiq/crews/mine", { sport: "GOLF" }] });
    const myCrews = useMemo(() => {
        if (!myCrewsData) return [];
        return myCrewsData.map(item => item?.crew).filter(Boolean);
    }, [myCrewsData]);

    const theme = viewType === 'JOIN' ? THEME_COLORS.JOIN : THEME_COLORS.BOOKING;

    // ⚡ Performance Optimization: Memoized filtering and sorting
    const filteredTimes = useMemo(() => {
        if (!bookings) return [];

        return (bookings as any[]).filter(item => {
            // 1. Date matching — 날짜 열쇠는 kst.ts 하나만 쓴다(손으로 +9시간 더하던 계산과 갈라지지 않게)
            if (kstDateKey(item.datetime) !== weekDates[selectedDate].fullDate) return false;

            // 2. Type filtering
            if (viewType === 'BOOKING' && item.listingType === 'JOIN') return false;
            if (viewType === 'JOIN' && item.listingType !== 'JOIN') return false;
            if (viewType === 'JOIN' && joinKind !== 'ALL' && (item.joinType ?? 'FIELD') !== joinKind) return false;


            // 4. Time filtering
            const timeFilters = selectedFilters.time;
            if (timeFilters.length > 0 && !timeFilters.includes('all')) {
                const hour = Number(kstHour(item.datetime));
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
            // 내 주변: 좌표 있는 글을 가까운 순으로 먼저, 좌표 없는 글은 시간순으로 뒤에
            if (viewType === 'JOIN' && nearMe && location) {
                const da = isKoreaCoord(a.lat, a.lng) ? distanceKm(location.lat, location.lng, a.lat, a.lng) : Infinity;
                const db = isKoreaCoord(b.lat, b.lng) ? distanceKm(location.lat, location.lng, b.lat, b.lng) : Infinity;
                if (da !== db) return da - db;
            }
            const sortFilters = selectedFilters.price.filter(p => p.startsWith('sort_'));
            if (sortFilters.includes('sort_low')) return a.greenFee - b.greenFee;
            if (sortFilters.includes('sort_discount')) {
                if (a.isHotDeal && !b.isHotDeal) return -1;
                if (!a.isHotDeal && b.isHotDeal) return 1;
                return a.greenFee - b.greenFee;
            }
            return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
        });
    }, [bookings, viewType, selectedFilters, selectedDate, weekDates, joinKind, nearMe, location]);

    // 내가 올린 글 내리기(부킹·조인 공통). 서버가 글쓴이·운영자만 받는다.
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "내렸어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            queryClient.invalidateQueries({ queryKey: MY_LISTINGS_QUERY_KEY });
        },
        onError: (e: any) => toast({ title: e?.message || "내리지 못했어요", variant: "destructive" }),
    });
    /** 내역에서 "보기": 그 글의 탭·날짜로 옮기고 카드를 펼친다(검색 결과 누를 때와 같은 동작). */
    const goToListing = useCallback((item: any) => {
        setMyListingsOpen(false);
        const type = item.listingType === 'JOIN' ? 'JOIN' : 'BOOKING';
        if (viewType !== type) setViewType(type);
        const idx = weekDates.findIndex(d => d.fullDate === kstDateKey(item.datetime));
        if (idx !== -1) pickDate(idx);
        else toast({ title: "지난 글이에요", description: "목록은 오늘부터 30일까지만 보여요." });
        setExpandedBookingId(item.id);
        setTimeout(() => document.getElementById(`booking-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }, [viewType, weekDates, pickDate, toast]);
    const handleDelete = useCallback((item: any) => {
        if (window.confirm("이 글을 내릴까요? 되돌릴 수 없어요.")) deleteMutation.mutate(item.id);
    }, [deleteMutation]);

    // 조인 신청은 기록으로 남긴다. 그전엔 문자 앱만 열고 아무것도 안 남아서 몇 명 찼는지도,
    // 누가 신청했는지도, 안 나타났는지도 알 수 없었다(2026-09-09 검토).
    const applyMutation = useMutation({
        mutationFn: async ({ id, joined }: { id: string; joined: boolean }) =>
            apiRequest(`/api/hiq/golf/bookings/${id}/apply`, { method: joined ? "DELETE" : "POST" }),
        onSuccess: (_d, v) => {
            toast({ title: v.joined ? "신청을 취소했어요" : "조인을 신청했어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
        },
        onError: (e: any) => toast({ title: e?.message || "신청하지 못했어요", variant: "destructive" }),
    });

    const handleApply = useCallback((item: any) => {
        applyMutation.mutate({ id: item.id, joined: !!item.joinedByMe });
    }, [applyMutation]);

    const handleReserve = useCallback((item: any) => {
        const phoneNumber = item.managerPhone || "010-1234-5678";
        // 날짜는 고른 칩이 아니라 **그 매물의 시각**에서 뽑는다 — 골프장에 가는 문자라 어긋나면 안 된다.
        const dateStr = kstDateLabel(item.datetime, { month: 'long', day: 'numeric', weekday: 'short' });
        const timeStr = kstTime(item.datetime);
        const displayName = item.isBlind ? item.blindName : item.courseName;
        const actionText = item.listingType === 'JOIN' ? "조인 신청 가능한가요?" : "예약 가능한가요?";
        const messageBody = `안녕하세요! [랭큐] 보고 연락드립니다.\n${displayName} / ${dateStr} / ${timeStr} / ${item.greenFee.toLocaleString()}원\n${actionText}`;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const delimiter = isIOS ? '&' : '?';
        window.open(`sms:${phoneNumber}${delimiter}body=${encodeURIComponent(messageBody)}`, '_self');
    }, []);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans selection:bg-[#64DD17]/30">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-5 h-16 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors" title="뒤로가기">
                            <LucideChevronLeft className="w-6 h-6" />
                        </button>
                        {/* 달만 적는다(2026-09-21 오너: "9/25 금요일"이 길어 모바일에서 헤더가 옆으로 밀렸다 — 날짜는 바로 아래 띠가 보여 준다). */}
                        <div className={cn("px-3.5 py-2 rounded-full border shrink-0", viewType === 'JOIN' ? "bg-[#FF6B00]/10 border-[#FF6B00]/20" : "bg-[#64DD17]/10 border-[#64DD17]/20")}>
                            <h1 className={cn("text-sm font-black tracking-tight whitespace-nowrap", theme.text)} aria-label={weekDates[selectedDate].displayDate}>
                                {weekDates[selectedDate].monthLabel}
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
                    <div className="flex items-center gap-2">
                        {user && (
                            <button
                                onClick={() => setMyListingsOpen(true)}
                                className="h-9 px-3 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors bg-white/[0.04] border-white/10 text-white/70 active:bg-white/10"
                                title="내가 올린 글"
                            >내역</button>
                        )}
                        <button onClick={() => setIsSearchOpen(true)} className="p-2 rounded-full hover:bg-white/5 transition-colors" title="검색">
                            <LucideSearch className="w-5 h-5 opacity-40 hover:opacity-100 transition-opacity" />
                        </button>
                    </div>
                </div>

                <DateSelector
                    weekDates={weekDates}
                    selectedDate={selectedDate}
                    setSelectedDate={pickDate}
                    bookingCounts={bookingCounts}
                    viewType={viewType}
                />

                <FilterBar
                    selectedFilters={selectedFilters}
                    toggleFilter={toggleFilter}
                    clearFilter={clearFilter}
                    viewType={viewType}
                />
                {viewType === 'JOIN' && (
                    <div className="px-6 pb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                        {(['ALL', ...JOIN_TYPES] as const).map((k) => (
                            <button
                                key={k} type="button" onClick={() => setJoinKind(k)}
                                className={cn("shrink-0 h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors",
                                    joinKind === k ? "bg-[#FF6B00] border-[#FF6B00] text-white" : "bg-white/[0.04] border-white/10 text-white/60")}
                            >{k === 'ALL' ? '전체' : JOIN_TYPE_LABEL[k]}</button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                if (nearMe) { setNearMe(false); return; }
                                void requestLocation().then((r) => {
                                    if (r === 'granted') setNearMe(true);
                                    else toast({ title: r === 'denied' ? "위치 권한이 꺼져 있어요" : "지금은 위치를 알 수 없어요", description: "설정에서 위치를 허용하면 가까운 조인부터 보여 드려요." });
                                });
                            }}
                            className={cn("shrink-0 ml-auto h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors",
                                nearMe ? "bg-[#4DA3FF] border-[#4DA3FF] text-white" : "bg-white/[0.04] border-white/10 text-white/60")}
                        >📍 내 주변{nearMe && locationStatus !== 'granted' ? '…' : ''}</button>
                    </div>
                )}
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
                                    onApply={handleApply}
                                onShare={handleShare}
                                onDelete={handleDelete}
                                viewType={viewType}
                                meId={(user as any)?.id}
                                myLocation={nearMe ? location : null}
                            />
                        ))}
                    </div>
                )}
            </main>

            {
                // 조인·부킹 모두 로그인한 누구나 올린다(2026-09-21 오너 A안). 부킹은 시트가 휴대폰 번호를 요구한다.
                !!user && (
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
                                    // 하단 네비 위로 띄운다 — bottom-8 이면 네비를 덮어 라운드·전체 탭이 안 눌린다(2026-09-09)
                                    "fixed right-6 z-[60] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] px-5 py-3.5 rounded-full font-semibold text-[14px] flex items-center gap-2 transition-all",
                                    theme.bg, theme.shadow,
                                    viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'
                                )}
                            >
                                <LucidePlus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                                <span>{viewType === 'JOIN' ? "조인 만들기" : "부킹 올리기"}</span>
                            </motion.button>
                        )}
                    </AnimatePresence>
                )
            }

            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="p-0 border-none bg-transparent max-w-md w-full h-[90vh] overflow-hidden flex flex-col" hideClose={true}>
                    {viewType === 'JOIN' ? (
                        <div className="relative h-full">
                            <JoinCreateSheet
                                onClose={() => setIsCreateModalOpen(false)}
                                onCreated={(day) => {
                                    const idx = weekDates.findIndex(d => d.fullDate === day);
                                    if (idx !== -1) pickDate(idx);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="relative h-full">
                            <BookingCreateSheet
                                onClose={() => setIsCreateModalOpen(false)}
                                onCreated={(day) => {
                                    setViewType('BOOKING');
                                    const idx = weekDates.findIndex(d => d.fullDate === day);
                                    if (idx !== -1) pickDate(idx);
                                }}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <MyListingsSheet open={myListingsOpen} onOpenChange={setMyListingsOpen} onGo={goToListing} onDelete={handleDelete} />

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
                    // 날짜 칩은 한국 날짜다. toISOString() 은 UTC 라서 오전 9시 이전 티타임이
                    // 하루 앞으로 밀렸고, 그러면 못 찾아서(-1) 눌러도 아무 일이 없었다(2026-09-09 검토).
                    const dateIdx = weekDates.findIndex(d => d.fullDate === kstDateKey(booking.datetime));
                    if (dateIdx !== -1) {
                        // 사용자가 고른 것이므로 되짚기 응답이 나중에 와도 이 선택을 못 덮게 한다.
                        pickDate(dateIdx);
                        if ((booking as any).listingType === 'JOIN' && viewType !== 'JOIN') setViewType('JOIN');
                        setExpandedBookingId(booking.id);
                        setIsSearchOpen(false);
                        requestAnimationFrame(() => {
                            document.getElementById(`booking-${booking.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                    }
                }}
            />

            {/* 하단 탭에서 들어오는 화면이라 네비를 단다 — 없으면 다른 탭으로 못 나간다(2026-09-09) */}
            <HiqNavigation />
        </div >
    );
}
