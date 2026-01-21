import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
    LucideChevronRight,
    LucideBell,
    LucideInfo,
    LucideSettings,
    LucideLogOut,
    LucideBriefcase,
    LucideUserCircle,
    LucideTrophy
} from "lucide-react";
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

export default function HiqMenu() {
    const [, setLocation] = useLocation();

    const { data: member } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const handleLogout = () => {
        document.cookie = "hiq_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        setLocation("/");
    };

    const getTier = (handi: number) => {
        if (handi >= 200) return { label: "GOLD", color: "#fbbf24", icon: "🏆" };
        if (handi >= 120) return { label: "SILVER", color: "#94a3b8", icon: "🥈" };
        return { label: "BRONZE", color: "#b45309", icon: "🥉" };
    };

    const tier = getTier(member?.handi4c || 0);

    return (
        <div className="min-h-screen premium-bg text-white p-6 pb-40 font-sans relative overflow-x-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-[30dvh] pointer-events-none z-0">
                <div className="absolute inset-0 premium-vignette opacity-60" />
                <div
                    className="absolute inset-x-0 top-0 h-full opacity-10 blur-[100px]"
                    style={{ background: 'var(--brand-primary)' }}
                />
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-8">
                <h1 className="text-2xl font-black tracking-tighter">전체 메뉴</h1>
                <div className="flex gap-4">
                    <button title="알림" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <LucideBell className="w-5 h-5 text-white/40" />
                    </button>
                    <button title="설정" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <LucideSettings className="w-5 h-5 text-white/40" />
                    </button>
                </div>
            </div>

            {/* Section A: Membership Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 mb-10 group"
            >
                <div className="absolute -inset-1 bg-gradient-to-r from-white/10 to-transparent blur-md opacity-50 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
                <div className="relative premium-glass-strong rounded-[2.5rem] p-8 overflow-hidden border-white/10 shadow-2xl">
                    {/* Card Chips & Pattern */}
                    <div className="absolute top-8 right-8 w-12 h-10 rounded-lg bg-white/5 border border-white/10" />
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/[0.02] rounded-full blur-3xl" />

                    <div className="flex flex-col gap-6">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                    <LucideUserCircle className="w-10 h-10 text-white/20" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black">{member?.name || "사용자"}</h2>
                                    <p className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Premium Member</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-black tracking-widest text-[#ffd700] bg-[#ffd700]/10 px-2 py-1 rounded">
                                    {tier.label}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mt-4">
                            <div>
                                <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">소속 매장</p>
                                <p className="text-xs font-bold text-white/80">하이큐 당구클럽</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">나의 에버리지</p>
                                <p className="text-sm font-black text-white">{member?.average || "0.000"}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-6 border-t border-white/5">
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-6 h-1 rounded-full bg-white/10" />
                                ))}
                            </div>
                            <LucideChevronRight className="w-5 h-5 text-white/20" />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Section B: Grid Menu */}
            <div className="relative z-10 grid grid-cols-1 gap-3 mb-10">
                {[
                    { icon: LucideInfo, label: "공지사항", sub: "새로운 소식을 확인하세요" },
                    { icon: LucideBriefcase, label: "이용안내", sub: "랭큐 사용법 가이드" },
                    { icon: LucideTrophy, label: "랭킹 시스템 안내", sub: "등급 산정 기준" },
                    { icon: LucideLogOut, label: "로그아웃", sub: "세션을 종료합니다", onClick: handleLogout, danger: true },
                ].map((item, idx) => (
                    <motion.button
                        key={idx}
                        whileTap={{ scale: 0.98 }}
                        onClick={item.onClick}
                        className="flex items-center justify-between p-5 premium-glass rounded-2xl border-white/5 hover:bg-white/[0.05] transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.danger ? 'bg-red-500/10' : 'bg-white/5'}`}>
                                <item.icon className={`w-5 h-5 ${item.danger ? 'text-red-400' : 'text-white/60'}`} />
                            </div>
                            <div className="text-left">
                                <p className={`text-sm font-bold ${item.danger ? 'text-red-400' : 'text-white'}`}>{item.label}</p>
                                <p className="text-[10px] text-white/30 font-medium">{item.sub}</p>
                            </div>
                        </div>
                        <LucideChevronRight className="w-4 h-4 text-white/10" />
                    </motion.button>
                ))}
            </div>

            {/* Section C: SaaS Promotion Banner */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation("/partner/intro")}
                className="relative z-10 w-full p-6 rounded-[2rem] overflow-hidden group shadow-2xl"
            >
                {/* Animated Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-90 group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)]" />

                <div className="relative flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-full bg-black/20 backdrop-blur-md text-[9px] font-black text-white tracking-widest uppercase">Partner Program</span>
                        </div>
                        <h3 className="text-base font-black text-white mb-1">사장님이신가요?</h3>
                        <p className="text-[11px] font-bold text-white/70">우리 매장도 랭큐 도입하기 &gt;</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center rotate-12 group-hover:rotate-0 transition-transform shadow-xl border border-white/20">
                        <LucideBriefcase className="w-7 h-7 text-white" />
                    </div>
                </div>

                {/* Sparkling Effect */}
                <div className="absolute -top-10 -left-10 w-24 h-24 bg-white/20 blur-2xl rounded-full mix-blend-overlay group-hover:translate-x-32 transition-transform duration-1000" />
            </motion.button>

            <HiqNavigation />
        </div>
    );
}
