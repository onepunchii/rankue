import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
    LucideHome,
    LucideTrophy,
    LucideBarChart3,
    LucideMenu,
    LucideUsers,
    LucideFlag,
    LucideCalendarDays
} from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
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
     * 골프: 홈 · 크루 · 조인 · 라운드 · 전체
     *   - 친구를 뺀 이유: 그 화면은 당구 상대전적을 보여주고, 크루 중심이면 사람은 크루 안에 있다.
     *   - 조인을 넣은 이유: 자리가 나면 빨리 들어가야 하는 화면이라 두 번 눌러 가면 늦는다.
     *   - 프로암·메세지는 넣지 않았다. 프로암은 응모 기간에만 의미가 있어 상시 탭이면 대부분 비고,
     *     독립 대화 탭은 대화가 크루와 조인 글 안에서 일어나는 구조와 안 맞는다.
     */
    const isGolf = currentSport === "GOLF";
    const tabs = isGolf
        ? [
            { id: "home", label: "hiqNavigation.home", icon: LucideHome, path: "/dashboard" },
            { id: "club", label: "hiqNavigation.club", icon: LucideFlag, path: "/club" },
            { id: "join", label: "hiqNavigation.join", icon: LucideCalendarDays, path: "/golf/booking-list" },
            { id: "round", label: "hiqNavigation.round", icon: LucideBarChart3, path: "/history" },
            { id: "menu", label: "hiqNavigation.menu", icon: LucideMenu, path: "/menu" },
        ]
        : [
            { id: "home", label: "hiqNavigation.home", icon: LucideHome, path: "/dashboard" },
            { id: "club", label: "hiqNavigation.club", icon: LucideFlag, path: "/club" },
            { id: "friend", label: "hiqNavigation.friend", icon: LucideUsers, path: "/friends" },
            { id: "log", label: "hiqNavigation.log", icon: LucideBarChart3, path: "/history" },
            { id: "menu", label: "hiqNavigation.menu", icon: LucideMenu, path: "/menu" },
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
                            onClick={() => setLocation(tab.path)}
                            className="flex-1 flex flex-col items-center justify-center py-2 gap-2 relative group"
                        >
                            <div className={`relative transition-all duration-300 ${active ? 'scale-110' : 'opacity-55 group-hover:opacity-100'}`}>
                                <tab.icon
                                    className="w-7 h-7 transition-all duration-300"
                                    style={active ? { color: activeColor } : { color: 'var(--nav-idle)' }}
                                />
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
