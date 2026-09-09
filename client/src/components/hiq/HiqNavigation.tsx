import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
    LucideHome,
    LucideTrophy,
    LucideBarChart3,
    LucideMenu,
    LucideUsers,
    LucideFlag
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

    const tabs = [
        { id: "home", label: "hiqNavigation.home", icon: LucideHome, path: "/dashboard" },
        { id: "club", label: "hiqNavigation.club", icon: LucideFlag, path: "/club" },
        { id: "friend", label: "hiqNavigation.friend", icon: LucideUsers, path: "/friends" },
        { id: "log", label: "hiqNavigation.log", icon: LucideBarChart3, path: "/history" },
        { id: "menu", label: "hiqNavigation.menu", icon: LucideMenu, path: "/menu" },
    ];

    const isActive = (path: string) => location === path;

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
