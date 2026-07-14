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

export function HiqNavigation() {
    const { isApp } = useNativeBridge();
    const [location, setLocation] = useLocation();
    const { currentSport } = useSport();
    const activeColor = "rgb(var(--brand))";

    const tabs = [
        { id: "home", label: "홈", icon: LucideHome, path: "/dashboard" },
        { id: "club", label: "크루", icon: LucideFlag, path: "/club" },
        { id: "friend", label: "친구", icon: LucideUsers, path: "/friends" },
        { id: "log", label: "기록", icon: LucideBarChart3, path: "/history" },
        { id: "menu", label: "전체", icon: LucideMenu, path: "/menu" },
    ];

    const isActive = (path: string) => location === path;

    return (
        <nav
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 bg-white/95 border-t border-black/10 pt-4 rounded-t-2xl bottom-navigation-container",
                isApp ? "pb-4" : "pb-[env(safe-area-inset-bottom,1.5rem)]"
            )}
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
                                    style={active ? { color: activeColor } : { color: 'rgba(0, 0, 0, 0.55)' }}
                                />
                            </div>
                            <span className="text-[12px] font-semibold transition-all duration-300" style={active ? { color: activeColor } : { color: 'rgba(0, 0, 0, 0.55)' }}>
                                {tab.label}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </nav>
    );
}
