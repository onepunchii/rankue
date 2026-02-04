import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    LucideTrophy,
    LucideCamera,
    LucideLoader2
} from "lucide-react";
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSport } from "@/contexts/SportContext";
import { getTier } from "@/lib/hiqUtils";
import { InfoModal, InfoModalType } from "@/components/hiq/menu/InfoModal";
import { NotificationInbox } from "@/components/hiq/menu/NotificationInbox";

export default function HiqMenu() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const { currentSport, setSport } = useSport();

    const [infoModal, setInfoModal] = useState<{ open: boolean, type: InfoModalType | null }>({ open: false, type: null });
    const openInfoModal = (type: InfoModalType) => setInfoModal({ open: true, type });

    const [notifOpen, setNotifOpen] = useState(false);



    const { data: member } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
    });

    const updateProfileMutation = useMutation({
        mutationFn: async (data: { profileImageUrl: string }) => {
            return await apiRequest("/api/hiq/me", {
                method: "PATCH",
                body: JSON.stringify(data)
            });
        },
        onSuccess: () => {
            toast({ title: "프로필 사진이 업데이트되었습니다" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        },
        onError: (err: Error) => {
            toast({ title: "업데이트 실패", description: err.message, variant: "destructive" });
        }
    });

    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_SIZE = 400; // Profile pics can be small
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { reject(new Error("Canvas context failed")); return; }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => reject(new Error("Image load failed"));
                img.src = event.target?.result as string;
            };
            reader.onerror = () => reject(new Error("File read failed"));
            reader.readAsDataURL(file);
        });
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            const b64 = await compressImage(file);
            updateProfileMutation.mutate({ profileImageUrl: b64 });
        } catch (err) {
            toast({ title: "이미지 처리 실패", variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogout = () => {
        document.cookie = "hiq_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        setLocation("/");
    };

    const tier = currentSport === "GOLF"
        ? { label: "익스플로러", class: "border-amber-500/50 text-amber-500", icon: "⛳️" }
        : getTier(member?.handi4c || 0, false, currentSport);

    const sportColor = currentSport === "GOLF" ? "#64DD17" : "#10b981";
    const sportColorClass = currentSport === "GOLF" ? "text-[#64DD17]" : "text-[#10b981]";
    const sportBgClass = currentSport === "GOLF" ? "bg-[#64DD17]" : "bg-[#10b981]";
    const sportGlowClass = currentSport === "GOLF" ? "shadow-[0_0_25px_rgba(100,221,23,0.3)]" : "shadow-[0_0_25px_rgba(16,185,129,0.3)]";

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-40 font-sans relative overflow-x-hidden">
            {/* Background Light Effect */}
            <div
                className="absolute top-0 right-0 w-[80dvw] h-[50dvh] blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none transition-colors duration-700"
                style={{ backgroundColor: `${sportColor}0D` }}
            />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-10 pt-4">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-black tracking-tighter text-white">전체 메뉴</h1>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">Application Menu</span>

                </div>
                <div className="flex gap-3">
                    <button
                        title="알림"
                        onClick={() => setNotifOpen(true)}
                        className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all"
                    >
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
                key={currentSport}
                className="relative z-10 mb-12 group"
            >
                <div
                    className="absolute inset-0 blur-[60px] rounded-[3rem] opacity-0 group-hover:opacity-100 transition-all duration-700 font-bold"
                    style={{ backgroundColor: `${sportColor}1A` }}
                />
                <div className="relative bg-white/[0.03] backdrop-blur-2xl rounded-[2.5rem] p-10 overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {/* Decorative Elements */}
                    <div
                        className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full blur-[80px] transition-colors duration-700"
                        style={{ backgroundColor: `${sportColor}0D` }}
                    />

                    <div className="flex flex-col gap-10">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-5">
                                <div className="relative group/avatar cursor-pointer" onClick={() => document.getElementById('profile-upload')?.click()}>
                                    <div
                                        className="absolute inset-0 blur-xl rounded-full opacity-50 group-hover/avatar:opacity-100 transition-all duration-700"
                                        style={{ backgroundColor: `${sportColor}33` }}
                                    />
                                    <div className={cn(
                                        "w-20 h-20 rounded-[1.8rem] bg-white/[0.05] border border-white/10 flex items-center justify-center overflow-hidden relative z-10 backdrop-blur-xl transition-all",
                                        currentSport === "GOLF" ? "group-hover/avatar:border-[#64DD17]/50" : "group-hover/avatar:border-[#10b981]/50"
                                    )}>
                                        {member?.profileImageUrl ? (
                                            <img src={member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                                        ) : (
                                            <LucideUserCircle className="w-12 h-12 text-white/10" />
                                        )}

                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                            {isUploading || updateProfileMutation.isPending ? (
                                                <LucideLoader2 className="w-6 h-6 text-white animate-spin" />
                                            ) : (
                                                <LucideCamera className="w-6 h-6 text-white" />
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        id="profile-upload"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                    />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tighter mb-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">{member?.nickname || member?.name || "사용자"}님</h2>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span className={cn("text-[10px] font-black uppercase tracking-[0.15em] transition-colors", sportColorClass)}>프리미엄 회원</span>
                                        <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Lv.{Math.floor((member?.visitCount || 0) / 5) + 1}</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-10">
                            <div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">
                                    {currentSport === "GOLF" ? "월드 랭킹" : "나의 홈 클럽"}
                                </p>
                                <p className="text-sm font-black text-white/80 tracking-tight">
                                    {currentSport === "GOLF" ? "RANKUE ELITE 60" : "RANKUE BILLIARDS CLUB"}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">
                                    {currentSport === "GOLF" ? "정복한 코스" : "공식 에버리지"}
                                </p>
                                <div className="flex items-baseline gap-1">
                                    <p className={cn("text-2xl font-black tracking-tighter transition-colors", sportColorClass)}>
                                        {currentSport === "GOLF" ? "34" : (member?.average || "0.000")}
                                    </p>
                                    <span className="text-[9px] font-black text-white/20 uppercase">
                                        {currentSport === "GOLF" ? "CC" : "AVG"}
                                    </span>
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
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">멤버십 이용 중</span>
                            </div>
                            <LucideChevronRight className={cn("w-6 h-6 text-white/20 group-hover:translate-x-1 transition-all", currentSport === "GOLF" ? "group-hover:text-[#64DD17]" : "group-hover:text-[#10b981]")} />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Section: Sports Mode Switcher (Icon Only Style) */}
            <div className="relative z-10 mb-10 px-4">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-2 items-center">
                        <button
                            title="당구 모드"
                            onClick={() => {
                                setSport("BILLIARDS");
                                toast({ title: "스포츠 모드 변경", description: "당구 모드로 전환되었습니다." });
                            }}
                            className={cn(
                                "w-16 h-16 rounded-[1.8rem] flex items-center justify-center transition-all active:scale-90",
                                currentSport === "BILLIARDS"
                                    ? "bg-[#10b981] border border-[#10b981]/50 shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                                    : "bg-white/[0.03] border border-white/10 opacity-40 grayscale"
                            )}
                        >
                            <span className="text-2xl">🎱</span>
                        </button>
                        <span className={cn(
                            "text-[9px] font-black uppercase tracking-tighter",
                            currentSport === "BILLIARDS" ? "text-[#10b981]" : "text-white/20"
                        )}>Billiards</span>
                    </div>

                    <div className="w-px h-8 bg-white/5 mx-1" />

                    <div className="flex flex-col gap-2 items-center">
                        <button
                            title="골프 모드"
                            onClick={() => {
                                setSport("GOLF");
                                toast({ title: "스포츠 모드 변경", description: "골프 모드로 전환되었습니다." });
                            }}
                            className={cn(
                                "w-16 h-16 rounded-[1.8rem] flex items-center justify-center transition-all active:scale-90 group",
                                currentSport === "GOLF"
                                    ? "bg-[#64DD17] border border-[#64DD17]/50 shadow-[0_0_25px_rgba(100,221,23,0.3)]"
                                    : "bg-white/[0.03] border border-white/10 opacity-40 grayscale"
                            )}
                        >
                            <span className={cn(
                                "text-2xl transition-opacity",
                                currentSport === "GOLF" ? "opacity-100" : "opacity-40 group-hover:opacity-100"
                            )}>⛳️</span>
                        </button>
                        <span className={cn(
                            "text-[9px] font-black uppercase tracking-tighter",
                            currentSport === "GOLF" ? "text-[#64DD17]" : "text-white/20"
                        )}>Golf</span>
                    </div>
                </div>
            </div>

            {/* Section B: Grid Menu (Premium Dark Style) */}
            <div className="relative z-10 space-y-4 mb-12">
                <h3 className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase px-4 mb-4">Management</h3>
                <div className="grid grid-cols-1 gap-4">
                    {[
                        { icon: LucideInfo, label: "공지사항", sub: "Announcements", desc: "새로운 소식과 공지사항", onClick: () => openInfoModal('announcement') },
                        { icon: LucideBriefcase, label: "이용안내", sub: "Service Guide", desc: "랭큐 앱 서비스 사용 가이드", onClick: () => openInfoModal('guide') },
                        { icon: LucideTrophy, label: "랭킹 시스템 안내", sub: "Ranking Info", desc: "실력 산정 및 등급 기준 안내", onClick: () => openInfoModal('ranking') },
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
                            <LucideChevronRight className={cn("w-5 h-5 relative z-10 transition-all", item.danger ? 'text-red-400/20' : cn("text-white/10", currentSport === "GOLF" ? "group-hover:text-[#64DD17]" : "group-hover:text-[#10b981]"))} />
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Section C: SaaS Promotion Banner (Enhanced Premium) */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation("/partner/login")}
                className="relative z-10 w-full p-8 rounded-[2.5rem] overflow-hidden group shadow-2xl border border-white/10"
            >
                {/* Visual Background */}
                <div className="absolute inset-0 bg-[#0A0A0A]" />
                <div
                    className="absolute inset-0 opacity-80 transition-all duration-700"
                    style={{ background: `linear-gradient(to bottom right, ${sportColor}66, ${sportColor}1A, transparent)` }}
                />
                <div
                    className="absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full -mr-32 -mt-32 transition-all duration-700"
                    style={{ backgroundColor: `${sportColor}33` }}
                />

                <div className="relative flex items-center justify-between">
                    <div className="text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md mb-4 border border-white/10">
                            <span className={cn("text-[9px] font-black tracking-[0.2em] uppercase transition-colors", sportColorClass)}>파트너 프로그램</span>
                        </div>
                        <h3 className="text-2xl font-black text-white mb-1 tracking-tighter leading-none">사장님이신가요?</h3>
                        <p className="text-xs font-bold text-white/50 tracking-tight">우리 매장도 랭큐 도입으로 스마트하게 운영하기</p>
                    </div>
                    <div className="w-16 h-16 rounded-[1.5rem] bg-white/10 backdrop-blur-xl flex items-center justify-center rotate-6 group-hover:rotate-0 transition-transform shadow-2xl border border-white/20">
                        <LucideBriefcase className={cn("w-8 h-8 transition-colors", sportColorClass)} />
                    </div>
                </div>

                {/* Subtle Animation */}
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#10b981]/40 to-transparent" />
            </motion.button>

            <InfoModal
                open={infoModal.open}
                type={infoModal.type}
                onOpenChange={(open) => setInfoModal(prev => ({ ...prev, open }))}
                sport={currentSport as "BILLIARDS" | "GOLF"}
            />

            <NotificationInbox
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
            />

            <HiqNavigation />
        </div>
    );
}
