import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
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
import { MY_LISTINGS_QUERY_KEY } from "../lib/myListings";
import { useMyWatches } from "../lib/courseApi";
import { ToJoinSheet } from "../components/booking/ToJoinSheet";
import { JoinCreateSheet } from "../components/join/JoinCreateSheet";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { distanceKm, isKoreaCoord, JOIN_TYPE_LABEL, JOIN_TYPES, type JoinType } from "@shared/golfJoin";
import { GlobalSearch } from "../components/GlobalSearch";
import { GolfBackButton } from "../components/common/GolfBackButton";
import { kstDateKey, kstDateLabel, kstHour, kstTime } from "@/lib/kst";

// Constants & Hooks
import { THEME_COLORS, DATE_STRIP_DAYS, filterLabel } from "../constants/booking";
import { matchesGolfFilters } from "../lib/bookingFilter";
import { groupByCourse, groupSortOf } from "../lib/courseGroups";
import { useBookingFilters } from "../hooks/useBookingFilters";
import { useDeepLink } from "../hooks/useDeepLink";
import { useBookingData } from "../hooks/useBookingData";
import { useShare } from "../hooks/useShare";

// Components
import { BookingCard } from "../components/booking/BookingCard";
import { DateSelector } from "../components/booking/DateSelector";
import { FilterBar } from "../components/booking/FilterBar";
import { EmptyResult, type ActiveFilter } from "../components/booking/EmptyResult";
import { CourseGroupRow } from "../components/booking/CourseGroupRow";
import { ShareSheet } from "../components/booking/ShareSheet";

/**
 * '골프장별 보기' 를 켜 둔 상태를 기억한다(2026-09-23 오너). 묶어 보는 쪽을 좋아하는 사람이
 * 목록에 들어올 때마다 다시 켜야 하면 그건 설정이 아니라 매번 하는 일이다.
 * 열쇠 이름은 이 저장소 관례(golf_recent_searches)를 따른다.
 * ⚠️ 읽기·쓰기 모두 try/catch — 사파리 프라이빗 모드에서는 localStorage 접근 자체가 던진다.
 */
const GROUP_BY_COURSE_KEY = "golf_group_by_course";
const readGroupByCourse = (): boolean => {
    try { return localStorage.getItem(GROUP_BY_COURSE_KEY) === "1"; } catch { return false; }
};

export default function BookingList() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState(0);
    // 되짚기 응답이 늦게 왔을 때 "사용자가 그 사이 직접 날짜를 골랐는지" 를 본다.
    // 골랐으면 덮어쓰지 않는다 — 응답이 몇 초 뒤 도착해 화면이 혼자 튀는 걸 막는다.
    const userPickedDate = useRef(false);
    // 주소(경로·질의)를 구독한다 — 같은 화면에서 주소만 바뀌는 이동(하단 '조인' 탭, 푸시 클릭)을 알아채려고.
    const [routePath, setLocation] = useLocation();
    const routeSearch = useSearch();
    const lastRouteRef = useRef("");
    const pickDate = useCallback((idx: number) => { userPickedDate.current = true; setSelectedDate(idx); }, []);
    const [viewType, setViewType] = useState<'ALL' | 'BOOKING' | 'JOIN'>('BOOKING');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    /** 조인으로 돌릴 부킹(2026-09-23 오너). 이 화면의 카드에서 연다 — 내 예약 페이지도 같은 시트를 제 화면에서 연다. */
    const [toJoinItem, setToJoinItem] = useState<any | null>(null);
    const openToJoin = useCallback((item: any) => { setToJoinItem(item); }, []);
    /** 조인 종류(필드/스크린/파크) 스위치(2026-09-21 오너: 스크린 조인은 내 위치 기반으로). */
    const [joinKind, setJoinKind] = useState<'ALL' | JoinType>('ALL');
    /**
     * 필터 줄이 여는 시트(상세필터·정렬)가 떠 있나. 그 시트들은 FilterBar 안에 살지만
     * **FAB 를 숨기는 건 이 화면**이다 — 시트 위로 '부킹 올리기' 가 떠올라 시트를 가렸다(2026-09-23 오너).
     */
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    /** 골프장별 보기(부킹 전용 — 이유는 아래 groupingOn). */
    const [groupOn, setGroupOn] = useState(readGroupByCourse);
    const toggleGroupOn = useCallback(() => {
        setGroupOn(prev => {
            const next = !prev;
            try { localStorage.setItem(GROUP_BY_COURSE_KEY, next ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면에선 바뀐다 */ }
            return next;
        });
    }, []);
    const { location, requestLocation, locationStatus } = useNativeBridge();
    /**
     * 위치(2026-09-23 오너: "골프장과의 거리 버튼은 제거하고 항상 거리가 표기되게").
     * 물어볼 단추가 사라졌으니 목록이 **딱 한 번** 조용히 묻는다. 이미 받아 둔 위치가 있으면 그대로 쓴다.
     * 거부·실패면 아무 말도 하지 않는다 — 거리가 없는 것이 곧 답이고, 목록 위에 경고를 띄울 일이 아니다.
     * 두 번 묻지 않는다: locationStatus 가 정해지면 다시 부르지 않고, 거부된 뒤에는 권한 창 자체가 안 뜬다
     * (capacitor 는 checkPermissions 가 denied 면 바로 끝내고, 웹은 거부된 오리진에서 즉시 error 로 떨어진다).
     */
    const askedLocation = useRef(false);
    useEffect(() => {
        if (askedLocation.current || location || locationStatus) return;
        askedLocation.current = true;
        void requestLocation().catch(() => { /* 거리를 안 적을 뿐이다 */ });
    }, [location, locationStatus, requestLocation]);

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
    // 경로·질의가 바뀔 때마다 다시 맞춘다(2026-09-22 리뷰): 이 화면 안의 하단 '조인' 탭(?view=JOIN)이나 푸시 클릭은
    // 같은 컴포넌트 인스턴스로 주소만 바뀌는데, 예전 의존성([weekDates, toast])으로는 마운트 때 한 번만 돌아 아무 일도 없었다.
    useEffect(() => {
        if (weekDates.length === 0) return;
        // 새 주소로 왔을 때만 가드를 푼다 — 이 effect 는 자정에 weekDates 가 새로 만들어져도 돌기 때문에, 무조건 풀면
        // 사용자가 고른 날짜가 옛 딥링크의 날짜로 되돌아간다.
        const route = `${routePath}?${routeSearch}`;
        if (lastRouteRef.current !== route) { lastRouteRef.current = route; userPickedDate.current = false; }
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
    }, [weekDates, toast, routePath, routeSearch]);

    const { bookingCounts, bookings, isLoading, isError } = useBookingData(weekDates, selectedDate, viewType, selectedFilters);
    const { expandedBookingId, setExpandedBookingId } = useDeepLink(bookings, routePath);

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


            /**
             * 4. 시간 · 가격 · 인원 · 조건 — **같은 축 안에서는 OR, 축과 축 사이는 AND**
             *    (오너 2026-09-23 결정, 표준 상거래 필터 문법). 판정은 golf/lib/bookingFilter.ts 한 곳에 있고
             *    값을 넣어 돌리는 테스트(bookingFilter.test.ts)가 그 표를 굳힌다.
             *
             *    - 인원(couple_2·player_3, 조인이면 solo_ok·three_ok)은 서로 **대안**이라 OR.
             *    - 조건(노캐디·마샬·식사·카트…)은 각각 **독립된 요구**라 AND. 2026-09-23 전에는 여기가
             *      `.some()` 이라, '노캐디' 를 고른 사람 앞에 캐디 있는 매물이 '식사 제공' 이라는 이유만으로
             *      끼어들었다.
             *
             * ⚠️ 서버(golf.repo.ts)는 아직 jsonb_exists_any = OR 로 한 번 거른다. OR 결과는 여기서
             *    구하는 AND 결과의 **상위집합**이고 목록 질의에 limit 이 없으니 화면 판정이 이긴다.
             *    다만 날짜 띠의 건수는 서버가 센 것이라 AND 로 좁힌 실제 개수보다 클 수 있다.
             */
            if (!matchesGolfFilters(selectedFilters, {
                hour: Number(kstHour(item.datetime)),
                greenFee: item.greenFee,
                options: item.options || [],
            })) return false;

            return true;
        }).sort((a, b) => {
            /**
             * 가까운 순(조인) — 좌표 있는 글을 가까운 순으로 먼저, 좌표 없는 글은 시간순으로 뒤에.
             * 예전엔 '📍 내 주변' 단추가 켜는 정렬이었다. 단추가 사라지면서(거리는 이제 늘 적는다)
             * 정렬 메뉴('최신순 ▽')의 한 줄로 옮겼다 — 정렬을 켜는 곳이 화면에 이미 있는데
             * 같은 일을 하는 단추를 옆에 하나 더 두면 둘 중 무엇이 지금 걸린 건지 알 수 없다.
             */
            if (viewType === 'JOIN' && selectedFilters.price.includes('sort_near') && location) {
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
    }, [bookings, viewType, selectedFilters, selectedDate, weekDates, joinKind, location]);

    /**
     * 골프장별 보기는 **부킹에서만** 켠다(2026-09-23 판단, 근거 넷).
     *
     *  1. 조인의 '장소' 는 골프장이 아니다. JoinCreateSheet 는 스크린·파크 조인을 올릴 때
     *     `courseId: "venue"` 라는 **고정 문자열**을 넣는다(join/JoinCreateSheet.tsx:148).
     *     묶음 열쇠가 courseId 라 그대로 켜면 그 날의 스크린·파크 조인이 **전부 한 묶음**으로
     *     뭉친다 — 서로 다른 동네의 다른 가게가 '스크린' 한 줄이 된다. 이름으로 열쇠를 바꾸면
     *     이번엔 손으로 적는 상호(place?.name ?? query)라 '강남스크린'·'강남 스크린' 이 갈린다.
     *  2. 묶음 줄의 값이 조인에서는 뜻이 어긋난다. 'N팀' 은 티타임 수인데 조인은 팀이 아니라
     *     **자리**를 판다(joinCapacity/joinApplied). 한 글이 곧 한 자리 묶음이라 대부분 '1팀' 이
     *     찍히고, 화면만 한 겹 깊어진다.
     *  3. '가까운 순' 정렬과 싸운다. 그때 조인 정렬의 축은 골프장이 아니라 **내게서 가까운 순**인데,
     *     묶으면 그 순서가 묶음 안으로 숨어 켜 둔 정렬이 안 보인다.
     *  4. 조인 제어 줄에는 이미 종류 스위치(전체/필드/스크린/파크)가 한 줄 더 붙는다.
     *     320px 에서 가장 빡빡한 화면이다.
     * 부킹은 반대다 — 한 매장이 같은 골프장 티타임을 여럿 올리는 게 기본이라 묶을 게 실제로 있다.
     */
    const groupingOn = groupOn && viewType !== 'JOIN';

    /**
     * 거르고 정렬까지 끝난 filteredTimes 를 **묶기만** 한다. 거르는·정렬하는 규칙은 손대지 않는다.
     * 묶음의 순서는 지금 걸린 정렬을 따르고(groupSortOf), 묶음 안의 순서는 받은 순서 그대로다.
     */
    const grouped = useMemo(
        () => (groupingOn ? groupByCourse(filteredTimes as any[], groupSortOf(selectedFilters.price)) : null),
        [groupingOn, filteredTimes, selectedFilters.price],
    );

    /**
     * 펼쳐 둔 묶음. 묶음 목록이 바뀌면(날짜·필터·탭) 다시 잡는다 —
     * **골프장이 하나뿐이면 자동으로 펼친다**(2026-09-23 오너). 경쟁 앱은 전부 접고 시작하지만
     * 그쪽은 한 날에 골프장이 수십 곳이다. 우리는 하루에 한두 곳이라 전부 접으면 화면이 텅 빈다 —
     * 접을 게 하나뿐인데 접어 두는 건 뜻이 없다. 둘 이상일 때만 접힌 채로 시작한다.
     * (렌더 중 setState 는 "prop 이 바뀔 때 state 맞추기" 의 정석 — effect 로 하면 한 프레임 접혔다 펴진다.)
     */
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    // 열쇠를 **정렬해서** 잇는다 — 정렬만 바꿨을 때(묶음 순서만 뒤집힌다) 펼쳐 둔 걸 접지 않으려고.
    const groupSig = grouped ? grouped.groups.map(g => g.key).sort().join('|') : '';
    const [prevGroupSig, setPrevGroupSig] = useState(groupSig);
    if (prevGroupSig !== groupSig) {
        setPrevGroupSig(groupSig);
        setOpenGroups(grouped && grouped.groups.length === 1 ? { [grouped.groups[0].key]: true } : {});
    }
    const toggleGroup = useCallback((key: string) => {
        setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    /**
     * 지금 **결과를 줄이고 있는** 것들. 0건 화면이 "무엇 때문에 비었는지" 를 실제 이름으로 말하고,
     * 그 자리에서 하나씩 뗄 수 있게 하려고 모은다.
     *  - 정렬(sort_ — '가까운 순' 포함)은 뺀다 — 순서만 바꾸지 결과를 줄이지 않는다.
     *  - 시간의 'all' 은 훅의 기본값(= 아무것도 안 건 상태)이라 뺀다. 예전 필터 줄은 이걸 1로 세서
     *    첫 화면부터 "시간 ①" 배지가 켜져 있었다.
     *  - 조인 종류 스위치는 필터 줄 밖에 있지만 0건을 만들 수 있다 — 사용자에겐 이것도 '걸어 둔 것' 이다.
     */
    const activeFilters = useMemo(() => {
        const out: ActiveFilter[] = [];
        const push = (category: string, ids: string[]) => ids.forEach(id => out.push({
            key: `${category}:${id}`,
            label: filterLabel(category, id),
            remove: () => toggleFilter(category, id),
        }));
        push('region', selectedFilters.region);
        push('time', selectedFilters.time.filter(id => id !== 'all'));
        push('price', selectedFilters.price.filter(id => !id.startsWith('sort_')));
        push('special', selectedFilters.special);
        if (viewType === 'JOIN' && joinKind !== 'ALL') {
            out.push({ key: `kind:${joinKind}`, label: JOIN_TYPE_LABEL[joinKind], remove: () => setJoinKind('ALL') });
        }
        return out;
    }, [selectedFilters, viewType, joinKind, toggleFilter]);

    /**
     * '가까운 순'(조인 정렬)을 골랐는데 위치가 없으면 그때 한 번 더 묻는다.
     * 위의 조용한 요청과 달리 **여기서는 실패를 알린다** — 사용자가 대놓고 고른 정렬이라,
     * 아무 일도 안 일어나면 버튼이 고장 난 것으로 보인다.
     */
    const nearSort = viewType === 'JOIN' && selectedFilters.price.includes('sort_near');
    const nearAsked = useRef(false);
    useEffect(() => {
        if (!nearSort) { nearAsked.current = false; return; }
        if (location || nearAsked.current) return;
        nearAsked.current = true;
        void requestLocation().then((r) => {
            if (r === 'granted') return;
            toast({
                title: r === 'denied' ? "위치 권한이 꺼져 있어요" : "지금은 위치를 알 수 없어요",
                description: "설정에서 위치를 허용하면 가까운 조인부터 보여 드려요.",
            });
        });
    }, [nearSort, location, requestLocation, toast]);

    /**
     * 보이는 칩만 끈다 — clearFilter('price') 를 부르면 정렬(sort_)까지 같이 날아가는데,
     * 정렬은 애초에 0건의 원인이 아니라 사용자가 잃을 이유가 없다.
     * toggleFilter 는 함수형 setState 라 연달아 불러도 서로 덮지 않는다.
     */
    const clearAllFilters = useCallback(() => { activeFilters.forEach(f => f.remove()); }, [activeFilters]);

    // 내가 올린 글 내리기(부킹·조인 공통). 서버가 글쓴이·운영자만 받는다.
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: "내렸어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] }); // 조인 탭 목록은 키가 다르다 — 안 넣으면 내린 카드가 그대로 남는다
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            queryClient.invalidateQueries({ queryKey: MY_LISTINGS_QUERY_KEY });
        },
        onError: (e: any) => toast({ title: e?.message || "내리지 못했어요", variant: "destructive" }),
    });
    /** 이 화면 안에서 그 글로 옮겨 간다: 탭·날짜를 맞추고 카드를 펼친다(검색 결과 누를 때와 같은 동작). */
    const goToListing = useCallback((item: any) => {
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
        mutationFn: async ({ id, joined, headcount }: { id: string; joined: boolean; headcount?: number; isJoin: boolean }) =>
            apiRequest(`/api/hiq/golf/bookings/${id}/apply`, joined ? { method: "DELETE" } : { method: "POST", body: { headcount: headcount ?? 1 } }),
        onSuccess: (_d, v) => {
            toast({
                title: v.joined ? "신청을 취소했어요" : v.isJoin ? "조인을 신청했어요" : "예약 신청을 보냈어요",
                description: v.joined ? undefined : "올린 분이 승인하면 알림으로 알려 드려요.",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
        },
        onError: (e: any) => toast({ title: e?.message || "신청하지 못했어요", variant: "destructive" }),
    });

    const handleApply = useCallback((item: any, headcount?: number) => {
        applyMutation.mutate({ id: item.id, joined: !!item.joinedByMe, headcount, isJoin: item.listingType === 'JOIN' });
    }, [applyMutation]);

    // 머리의 '골프장' 단추 — 내 관심 골프장에 지금 글이 있으면 라임 점(안 본 신청 소식 빨간 점은 하단 '내 예약' 탭이 맡는다).
    const myWatches = useMyWatches(!!user);
    const watchedLive = (myWatches.data ?? []).some((w) => w.counts.booking + w.counts.join > 0);

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

    /**
     * 카드 한 장. 낱개 목록과 골프장별 묶음이 **같은 카드**를 쓴다 —
     * 프롭이 두 곳에 갈라져 있으면 한쪽만 고치는 일이 생긴다(토글 OFF 면 화면이 예전과 완전히 같아야 한다).
     */
    const renderCard = useCallback((item: any) => (
        <BookingCard
            key={item.id}
            item={item}
            expandedBookingId={expandedBookingId}
            onExpand={setExpandedBookingId}
            onReserve={handleReserve}
            onApply={handleApply}
            onShare={handleShare}
            onDelete={handleDelete}
            onToJoin={openToJoin}
            viewType={viewType}
            meId={(user as any)?.id}
            myLocation={location}
        />
    ), [expandedBookingId, setExpandedBookingId, handleReserve, handleApply, handleShare, handleDelete, openToJoin, viewType, user, location]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans selection:bg-[#64DD17]/30">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                {/* 375px 에 뒤로·달·부킹/조인·골프장·검색이 한 줄로 들어가야 한다(2026-09-24 '골프장' 단추가 조인 알약 위로 겹쳤다) — 여백을 줄였다 */}
                <div className="px-4 h-16 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0">
                        <GolfBackButton onClick={() => window.history.back()} label="뒤로가기" />
                        {/* 달만 적는다(2026-09-21 오너: "9/25 금요일"이 길어 모바일에서 헤더가 옆으로 밀렸다 — 날짜는 바로 아래 띠가 보여 준다). */}
                        <div className={cn("px-3 py-2 rounded-full border shrink-0", viewType === 'JOIN' ? "bg-[#FF6B00]/10 border-[#FF6B00]/20" : "bg-[#64DD17]/10 border-[#64DD17]/20")}>
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
                                        "px-3 h-full rounded-full text-xs font-black transition-all flex items-center justify-center whitespace-nowrap min-w-[54px]",
                                        viewType === type ? (type === 'BOOKING' ? "bg-[#64DD17] text-[#051907]" : "bg-[#FF6B00] text-white") : "text-white/40 hover:text-white"
                                    )}
                                >
                                    {type === 'BOOKING' ? '부킹' : '조인'}
                                </button>
                            ))}
                        </div>

                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {/* 골프장 목록(2026-09-24 오너: "내 예약은 네비게이션바에 있으니 그거 대신 골프장"). 492곳을 보고 ☆ 를 눌러 두면
                            그 골프장 티가 올라올 때 알림 — 더블이글 목록과 같은 자리다. 안 본 신청 소식 빨간 점은 하단 '내 예약' 탭으로 옮겼다.
                            관심 골프장에 지금 글이 있으면 라임 점. */}
                        <button
                            onClick={() => setLocation("/golf/courses")}
                            className="relative h-9 px-3 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors bg-white/[0.04] border-white/10 text-white/80 active:bg-white/10 inline-flex items-center"
                            title="전체 골프장 · 관심 골프장 알림"
                        >
                            골프장
                            {watchedLive && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#64DD17]" aria-label="관심 골프장에 티타임" />}
                        </button>
                        <button onClick={() => setIsSearchOpen(true)} className="p-1.5 -mr-1.5 rounded-full hover:bg-white/5 transition-colors" title="검색">
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
                    groupByCourse={viewType === 'JOIN' ? undefined : groupOn}
                    onToggleGroup={viewType === 'JOIN' ? undefined : toggleGroupOn}
                    onSheetOpenChange={setFilterSheetOpen}
                />
                {/*
                  * 조인 종류 스위치(전체/필드/스크린/파크). 예전엔 이 줄 오른쪽에 '📍 내 주변'(조인) ·
                  * '📍 골프장까지 거리'(부킹) 단추가 같이 있었는데, 2026-09-23 오너가 걷어냈다 —
                  * "거리 버튼은 제거하고 항상 거리가 표기되게". 거리는 위치를 알면 늘 적고, 가까운 순 정렬은
                  * 정렬 메뉴로 옮겼다(filteredTimes 의 sort_near 주석).
                  */}
                {viewType === 'JOIN' && (
                    <div className="px-5 pb-2.5">
                        {/* 알약 하나 안의 분절 스위치 — 필터 칩과 생김새가 같으면 무엇이 필터이고 무엇이 탭인지 헷갈린다 */}
                        <div className="flex rounded-full bg-white/[0.05] border border-white/[0.08] p-0.5">
                            {(['ALL', ...JOIN_TYPES] as const).map((k) => (
                                <button
                                    key={k} type="button" onClick={() => setJoinKind(k)}
                                    className={cn("flex-1 min-w-0 h-8 rounded-full text-[12.5px] font-medium truncate transition-colors",
                                        joinKind === k ? "bg-[#FF6B00] text-white" : "text-white/60")}
                                >{k === 'ALL' ? '전체' : JOIN_TYPE_LABEL[k]}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <main className="px-5 pt-3 pb-6">
                <p className="mb-3 text-[12px] font-medium text-white/40">
                    {isLoading ? "불러오는 중…" : `${viewType === 'JOIN' ? '조인' : '티타임'} ${filteredTimes.length}`}
                </p>

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
                    <EmptyResult
                        activeFilters={activeFilters}
                        onClearAll={clearAllFilters}
                        viewType={viewType}
                        dateLabel={weekDates[selectedDate].displayDate}
                    />
                ) : grouped ? (
                    /* 골프장별 보기 — 묶음 줄을 늘어놓고, 펼친 묶음만 카드를 그린다 */
                    <div>
                        {grouped.groups.map((g) => (
                            <CourseGroupRow
                                key={g.key}
                                group={g}
                                open={!!openGroups[g.key]}
                                onToggle={() => toggleGroup(g.key)}
                                accent={viewType === 'JOIN' ? '#FF6B00' : '#64DD17'}
                            >
                                {g.items.map(renderCard)}
                            </CourseGroupRow>
                        ))}
                        {/*
                          * 블라인드 글은 묶지 않고 낱개로, 맨 아래에.
                          * 이름이 가려져 있어(blindName: 'OO cc') 어느 골프장인지 알 수 없다 —
                          * 같은 blindName 끼리 묶으면 서로 다른 골프장을 한 줄로 합치는 것이고,
                          * 전부 '비공개 골프장' 하나로 합치면 묶음 줄의 가격·시간 범위가 아무 뜻도
                          * 없는 숫자가 된다. 가릴 만해서 가린 것이니 묶지 않는다(courseGroups.ts).
                          */}
                        {grouped.ungrouped.length > 0 && (
                            <>
                                <p className="mt-4 mb-2 text-[11.5px] font-medium text-white/30">
                                    골프장을 가린 글 {grouped.ungrouped.length}
                                </p>
                                {grouped.ungrouped.map(renderCard)}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredTimes.map(renderCard)}
                    </div>
                )}
            </main>

            {
                // 조인·부킹 모두 로그인한 누구나 올린다(2026-09-21 오너 A안). 부킹은 시트가 휴대폰 번호를 요구한다.
                !!user && (
                    <AnimatePresence>
                        {/*
                          * 바닥 시트가 떠 있는 동안은 안 그린다. FAB 는 fixed z-[60] 이고 Radix 시트의 오버레이는 z-50,
                          * 내용은 z-50(상세필터·정렬만 z-[70])이라 **그냥 두면 시트 위에 떠오른다** —
                          * 전환 시트에서는 버튼을 통째로 가렸고, 상세필터에서는 어두운 막 위에 혼자 떠 있었다(2026-09-23 오너).
                          * z-index 를 낮추는 길도 있지만, 시트가 떴을 때 FAB 는 **누를 일이 없는 버튼**이다 — 안 그리는 게 맞다.
                          * 셋 다 여기서 안다: 전환(toJoinItem) · 검색(isSearchOpen) · 필터 줄의 시트(filterSheetOpen).
                          */}
                        {!isCreateModalOpen && !isSearchOpen && !toJoinItem && !filterSheetOpen && (
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
                                    else toast({ title: "올렸어요 — 목록은 오늘부터 30일까지만 보여요", description: "그날이 가까워지면 목록에 나타나요. '내역'에서는 지금도 볼 수 있어요." });
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
                                    else toast({ title: "올렸어요 — 목록은 오늘부터 30일까지만 보여요", description: "그날이 가까워지면 목록에 나타나요. '내역'에서는 지금도 볼 수 있어요." });
                                }}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* 부킹 → 조인 전환. 끝나면 그 글이 있는 조인 탭·날짜로 옮겨 가 카드를 펼친다(내역의 '보기' 와 같은 동작). */}
            <ToJoinSheet
                item={toJoinItem}
                onClose={() => setToJoinItem(null)}
                onConverted={(converted) => goToListing(converted ?? { ...toJoinItem, listingType: 'JOIN' })}
            />

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
