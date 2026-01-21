import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
    LucideHome,
    LucideTrophy,
    LucideBarChart3,
    LucideMenu,
    LucideUsers
} from "lucide-react";

export function HiqNavigation() {
    const [location, setLocation] = useLocation();

    const tabs = [
        { id: "home", label: "홈", icon: LucideHome, path: "/dashboard" },
        { id: "friend", label: "친구", icon: LucideUsers, path: "/friends" },
        { id: "log", label: "기록", icon: LucideBarChart3, path: "/history" },
        { id: "menu", label: "전체", icon: LucideMenu, path: "/menu" },
    ];

    const isActive = (path: string) => location === path;

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/80 backdrop-blur-xl border-t border-white/5 pt-4 pb-[calc(env(safe-area-inset-bottom,1.5rem)+0.4rem)] rounded-t-[3rem]">
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
                            <div className={`relative transition-all duration-300 ${active ? 'scale-110' : 'opacity-40 group-hover:opacity-100'}`}>
                                <tab.icon
                                    className={`w-7 h-7 transition-all duration-300 ${active ? 'text-[#22c55e]' : 'text-white'}`}
                                    style={active ? { filter: 'drop-shadow(0 0 12px rgba(34, 197, 94, 0.4))' } : {}}
                                />
                                {active && (
                                    <motion.div
                                        layoutId="activeGlow"
                                        className="absolute -inset-2 bg-green-500/5 blur-md rounded-full -z-10"
                                    />
                                )}
                            </div>
                            <span className={`text-[11px] font-black transition-all duration-300 tracking-tighter ${active ? 'text-[#22c55e]' : 'text-white/20'}`}>
                                {tab.label}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </nav>
    );
}
