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

    const getTier = (handi: number, is3c: boolean) => {
        if (is3c) {
            if (handi >= 45) return { label: "MASTER", class: "tier-master", icon: "🔥" };
            if (handi >= 35) return { label: "DIAMOND", class: "tier-diamond", icon: "💠" };
            if (handi >= 28) return { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            if (handi >= 22) return { label: "GOLD", class: "tier-gold", icon: "🥇" };
            if (handi >= 16) return { label: "SILVER", class: "tier-silver", icon: "🥈" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉" };
        } else {
            if (handi >= 700) return { label: "MASTER", class: "tier-master", icon: "🔥" };
            if (handi >= 400) return { label: "DIAMOND", class: "tier-diamond", icon: "💠" };
            if (handi >= 250) return { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            if (handi >= 150) return { label: "GOLD", class: "tier-gold", icon: "🥇" };
            if (handi >= 80) return { label: "SILVER", class: "tier-silver", icon: "🥈" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉" };
        }
    };

    const tier = getTier(member?.handi4c || 0, false);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-40 font-sans relative overflow-x-hidden">
            {/* Background Light Effect */}
            <div className="absolute top-0 right-0 w-[80dvw] h-[50dvh] bg-[#10b981]/5 blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-10 pt-4">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-black tracking-tighter text-white">전체 메뉴</h1>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">Application Menu</span>
                </div>
                <div className="flex gap-3">
                    <button title="알림" className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all">
                        <LucideBell className="w-5 h-5 text-white/40" />
                    </button>
                    <button title="설정" className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all">
                        <LucideSettings className="w-5 h-5 text-white/40" />
                    </button>
                </div>
            </div>

            {/* Section A: Membership Card (Premium Bento Style) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 mb-12 group"
            >
                <div className="absolute inset-0 bg-[#10b981]/10 blur-[60px] rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative bg-white/[0.03] backdrop-blur-2xl rounded-[2.5rem] p-10 overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {/* Decorative Elements */}

                    <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#10b981]/5 rounded-full blur-[80px]" />

                    <div className="flex flex-col gap-10">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-5">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-[#10b981]/20 blur-xl rounded-full opacity-50" />
                                    <div className="w-20 h-20 rounded-[1.8rem] bg-white/[0.05] border border-white/10 flex items-center justify-center overflow-hidden relative z-10 backdrop-blur-xl">
                                        <LucideUserCircle className="w-12 h-12 text-white/10" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tighter mb-1">{member?.name || "사용자"}님</h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.15em]">Premium Member</span>
                                        <div className="w-1 h-1 rounded-full bg-white/20" />
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Lv.{Math.floor((member?.visitCount || 0) / 5) + 1}</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`px-4 py-1.5 rounded-full border ${tier.class} bg-white/5 backdrop-blur-md flex items-center gap-2 shadow-lg`}>
                                <span className="text-sm">{tier.icon}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">{tier.label}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-10">
                            <div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">My Home Club</p>
                                <p className="text-sm font-black text-white/80 tracking-tight">RANKUE BILLIARDS CLUB</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Official Average</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-black text-[#10b981] tracking-tighter">{member?.average || "0.000"}</p>
                                    <span className="text-[9px] font-black text-white/20 uppercase">AVG</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-8 border-t border-white/5 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0A0A] bg-white/10 flex items-center justify-center">
                                            <div className="w-1 h-1 rounded-full bg-white/40" />
                                        </div>
                                    ))}
                                </div>
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">Membership Active</span>
                            </div>
                            <LucideChevronRight className="w-6 h-6 text-white/20 group-hover:text-[#10b981] group-hover:translate-x-1 transition-all" />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Section B: Grid Menu (Premium Dark Style) */}
            <div className="relative z-10 space-y-4 mb-12">
                <h3 className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase px-4 mb-4">Management</h3>
                <div className="grid grid-cols-1 gap-4">
                    {[
                        { icon: LucideInfo, label: "공지사항", sub: "Announcements", desc: "새로운 소식과 공지사항" },
                        { icon: LucideBriefcase, label: "이용안내", sub: "Service Guide", desc: "랭큐 앱 서비스 사용 가이드" },
                        { icon: LucideTrophy, label: "랭킹 시스템 안내", sub: "Ranking Info", desc: "실력 산정 및 등급 기준 안내" },
                        {
                            icon: LucideLogOut,
                            label: "로그아웃",
                            sub: "Account Sign Out",
                            desc: "현재 기기에서 계정 연결 해제",
                            onClick: handleLogout,
                            danger: true
                        },
                    ].map((item, idx) => (
                        <motion.button
                            key={idx}
                            whileTap={{ scale: 0.98 }}
                            onClick={item.onClick}
                            className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/5 rounded-[2rem] active:bg-white/[0.08] transition-all group overflow-hidden relative"
                        >
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex items-center gap-5 relative z-10">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${item.danger
                                    ? 'bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                                    : 'bg-white/5 group-hover:bg-[#10b981]/10'
                                    }`}>
                                    <item.icon className={`w-6 h-6 ${item.danger ? 'text-red-400' : 'text-white/40 group-hover:text-[#10b981]'} transition-colors`} />
                                </div>
                                <div className="text-left">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className={`text-base font-black tracking-tighter ${item.danger ? 'text-red-400' : 'text-white/90'}`}>{item.label}</p>
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${item.danger ? 'text-red-400/40' : 'text-white/20'}`}>{item.sub}</span>
                                    </div>
                                    <p className="text-[11px] text-white/30 font-medium tracking-tight">{item.desc}</p>
                                </div>
                            </div>
                            <LucideChevronRight className={`w-5 h-5 relative z-10 transition-all ${item.danger ? 'text-red-400/20' : 'text-white/10 group-hover:text-[#10b981]'}`} />
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Section C: SaaS Promotion Banner (Enhanced Premium) */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation("/partner/intro")}
                className="relative z-10 w-full p-8 rounded-[2.5rem] overflow-hidden group shadow-2xl border border-white/10"
            >
                {/* Visual Background */}
                <div className="absolute inset-0 bg-[#0A0A0A]" />
                <div className="absolute inset-0 bg-gradient-to-br from-[#10b981]/40 via-[#10b981]/10 to-transparent opacity-80" />
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981]/20 blur-[80px] rounded-full -mr-32 -mt-32 group-hover:bg-[#10b981]/30 transition-colors" />

                <div className="relative flex items-center justify-between">
                    <div className="text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md mb-4 border border-white/10">
                            <span className="text-[9px] font-black text-[#10b981] tracking-[0.2em] uppercase">Partner Program</span>
                        </div>
                        <h3 className="text-2xl font-black text-white mb-1 tracking-tighter leading-none">사장님이신가요?</h3>
                        <p className="text-xs font-bold text-white/50 tracking-tight">우리 매장도 랭큐 도입으로 스마트하게 운영하기</p>
                    </div>
                    <div className="w-16 h-16 rounded-[1.5rem] bg-white/10 backdrop-blur-xl flex items-center justify-center rotate-6 group-hover:rotate-0 transition-transform shadow-2xl border border-white/20">
                        <LucideBriefcase className="w-8 h-8 text-[#10b981]" />
                    </div>
                </div>

                {/* Subtle Animation */}
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#10b981]/40 to-transparent" />
            </motion.button>

            <HiqNavigation />
        </div>
    );
}

