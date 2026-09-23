import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
    LucideHome,
    LucideTrophy,
    LucideBarChart3,
    LucideMessageSquare,
    LucideUsers,
    LucideFlag,
    LucideCalendarDays,
    LucideCalendarCheck
} from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useT } from "@/lib/i18n";

export function HiqNavigation() {
    const { t } = useT();
    // 하단 네비가 떠 있다는 사실을 문서에 알린다 — 앱 설치 배너도 fixed bottom z-50 이라
    // 나중에 렌더되는 배너가 네비를 그대로 덮고 있었다(2026-08-16 실측). 배너는 이 표식을 보고
    // 네비 높이만큼 올라간다(index.css). 컴포넌트끼리 서로를 몰라도 되게 문서 상태로 푼다.
    useEffect(() => {
        document.documentElement.dataset.bottomNav = "1";
        return () => { delete document.documentElement.dataset.bottomNav; };
    }, []);
    const { isApp } = useNativeBridge();
    const [location, setLocation] = useLocation();
    const { currentSport } = useSport();
    const activeColor = "rgb(var(--brand))";

    /**
     * 하단 탭은 종목마다 다르다(2026-09-09 오너).
     * 당구: 홈 · 크루 · 친구 · 기록 · 전체
     * 골프: 홈 · 크루 · 조인 · 내 예약 · 채팅
     *   - 친구를 뺀 이유: 그 화면은 당구 상대전적을 보여주고, 크루 중심이면 사람은 크루 안에 있다.
     *   - 조인을 넣은 이유: 자리가 나면 빨리 들어가야 하는 화면이라 두 번 눌러 가면 늦는다.
     *   - '라운드'(/history)를 내리고 '내 예약'을 올린 이유(2026-09-23 오너): 골프의 /history 는 여섯 덩어리 중
     *     **넷이 꺼진** 반쯤 빈 화면이었다(성장 그래프·주간 달성률·시뮬 기록 등은 currentSport !== "GOLF" 조건). 남는 건
     *     요약 카드와 목록뿐인데, 그 요약은 홈의 스코어 트렌드가 이미 더 잘 보여 준다. 반대로 부킹·조인 내역은
     *     시트 안에만 있어 주소가 없었고, 하루에도 몇 번씩 "승인됐나" 를 보러 오는 화면이다 — 상시 탭은 이쪽이 맞다.
     *     라운드 기록으로 가는 길은 둘로 늘렸다: 홈의 스코어 트렌드 카드(누르면 /history)와 전체 메뉴의 '라운드 기록'.
     *   - 프로암·메세지는 넣지 않았다. 프로암은 응모 기간에만 의미가 있어 상시 탭이면 대부분 비고,
     *     독립 대화 탭은 대화가 크루와 조인 글 안에서 일어나는 구조와 안 맞는다.
     */
    const isGolf = currentSport === "GOLF";
    // 채팅 탭 배지 — 안 읽은 메시지 합계. 1분마다, 로그인했을 때만.
    const { member } = useAuth();
    const { data: unreadData } = useQuery<{ unread: number }>({
        queryKey: ["/api/hiq/chat/unread", currentSport],
        queryFn: () => apiRequest(`/api/hiq/chat/unread?sport=${currentSport}`),
        enabled: !!member,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });
    const chatUnread = unreadData?.unread ?? 0;
    const tabs = isGolf
        ? [
            { id: "home", label: "hiqNavigation.home", icon: LucideHome, path: "/dashboard" },
            { id: "club", label: "hiqNavigation.club", icon: LucideFlag, path: "/club" },
            // to 는 이동할 주소, path 는 탭 켜짐 판정용 경로다. 질의를 안 붙이면 '조인' 탭인데
            // 부킹 화면이 열렸다(목록의 기본 보기가 부킹이다).
            { id: "join", label: "hiqNavigation.join", icon: LucideCalendarDays, path: "/golf/booking-list", to: "/golf/booking-list?view=JOIN" },
            // 아이콘은 달력+체크(예약) — LucideBarChart3 은 기록 아이콘이라 당구 '기록' 탭과 헷갈린다.
            { id: "myBookings", label: "hiqNavigation.myBookings", icon: LucideCalendarCheck, path: "/golf/my-bookings" },
            // 전체(≡)는 머리줄로 올라갔고 이 자리는 채팅이다(2026-09-21 오너: "전체 대신 메시지")
            { id: "chat", label: "hiqNavigation.chat", icon: LucideMessageSquare, path: "/chat" },
        ]
        : [
            { id: "home", label: "hiqNavigation.home", icon: LucideHome, path: "/dashboard" },
            { id: "club", label: "hiqNavigation.club", icon: LucideFlag, path: "/club" },
            { id: "friend", label: "hiqNavigation.friend", icon: LucideUsers, path: "/friends" },
            { id: "log", label: "hiqNavigation.log", icon: LucideBarChart3, path: "/history" },
            // 전체(≡)는 머리줄로 올라갔고 이 자리는 채팅이다(2026-09-21 오너: "전체 대신 메시지")
            { id: "chat", label: "hiqNavigation.chat", icon: LucideMessageSquare, path: "/chat" },
        ];

    // 조인은 상세(/golf/booking-list/:id)로 들어가도 그 탭이 켜져 있어야 한다 — 정확히 같을 때만 보면 꺼진다.
    const isActive = (path: string) => location === path || location.startsWith(path + "/");

    return (
        <nav
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 bg-white/95 border-t border-black/10 pt-4 rounded-t-2xl bottom-navigation-container"
            )}
            // 전역 `.fixed.bottom-0 { padding-bottom: env(...) }` 규칙이 (특이도 우위로) 클래스로 준
            // pb-* 를 덮어써 웹에선 fallback(1.5rem)이 유실되고 앱에선 의도한 여백이 뭉개졌다.
            // 인라인 스타일은 그 전역 규칙을 확실히 이겨, 어디서든 base + 홈인디케이터 인셋을 보장한다.
            style={{ paddingBottom: `calc(${isApp ? "0.5rem" : "0.75rem"} + env(safe-area-inset-bottom))` }}
        >
            <div className="max-w-md mx-auto px-6 flex items-center justify-between">
                {tabs.map((tab) => {
                    const active = isActive(tab.path);
                    return (
                        <motion.button
                            key={tab.id}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setLocation((tab as any).to ?? tab.path)}
                            className="flex-1 flex flex-col items-center justify-center py-2 gap-2 relative group"
                        >
                            <div className={`relative transition-all duration-300 ${active ? 'scale-110' : 'opacity-55 group-hover:opacity-100'}`}>
                                <tab.icon
                                    className="w-7 h-7 transition-all duration-300"
                                    style={active ? { color: activeColor } : { color: 'var(--nav-idle)' }}
                                />
                                {tab.id === "chat" && chatUnread > 0 && (
                                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10.5px] font-semibold flex items-center justify-center rk-num" aria-label={`안 읽은 메시지 ${chatUnread}`}>
                                        {chatUnread > 99 ? "99+" : chatUnread}
                                    </span>
                                )}
                            </div>
                            <span className="text-[12px] font-semibold transition-all duration-300" style={active ? { color: activeColor } : { color: 'var(--nav-idle)' }}>
                                {t(tab.label)}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </nav>
    );
}
