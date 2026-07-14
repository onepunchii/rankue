import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useEffect } from "react";
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
    LucideLoader2,
    LucidePencil,
    LucideCheck,
    LucideX,
    LucideMail,
    LucideCrown,
    LucideCircle,
    LucideFlag
} from "lucide-react";
import { SuggestionModal } from "@/components/hiq/SuggestionModal";
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import { uploadImage } from "@/lib/imageUtils";
import { GOLF_ENABLED } from "@/lib/features";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSport } from "@/contexts/SportContext";
import { getTier } from "@/lib/hiqUtils";
import { InfoModal, InfoModalType } from "@/components/hiq/menu/InfoModal";
import { NotificationInbox } from "@/components/hiq/menu/NotificationInbox";
import { Button } from "@/components/ui/button";

export default function HiqMenu() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const { currentSport, setSport } = useSport();

    const [infoModal, setInfoModal] = useState<{ open: boolean, type: InfoModalType | null }>({ open: false, type: null });
    const openInfoModal = (type: InfoModalType) => setInfoModal({ open: true, type });

    const [notifOpen, setNotifOpen] = useState(false);
    const [suggestionOpen, setSuggestionOpen] = useState(false);


    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState("");

    const { data: member } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
    });

    useEffect(() => {
        if (member) {
            setNewName(member.nickname || member.name || "");
        }
    }, [member]);

    const updateProfileMutation = useMutation({
        mutationFn: async (data: { profileImageUrl?: string, name?: string }) => {
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

    // Single guarded entry point so Enter + click (or a double-tap) can't fire two PATCHes.
    const handleSaveName = () => {
        if (updateProfileMutation.isPending) return;
        const trimmed = newName.trim();
        if (!trimmed) { setIsEditingName(false); return; }
        updateProfileMutation.mutate({ name: trimmed });
        setIsEditingName(false);
    };

    const recalculateMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest("/api/hiq/me/recalculate-avg", {
                method: "POST"
            });
        },
        onSuccess: () => {
            toast({ title: "평균 데이터가 재계산되었습니다" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        },
        onError: (err: Error) => {
            toast({ title: "재계산 실패", description: err.message, variant: "destructive" });
        }
    });

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            // Compress to webp (avatars stay small) + upload to Blob; store only the URL.
            const url = await uploadImage(file, 'avatar', { maxSize: 400 });
            updateProfileMutation.mutate({ profileImageUrl: url });
        } catch (err) {
            toast({ title: "이미지 처리 실패", variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogout = async () => {
        // The auth cookie is httpOnly+signed, so client JS cannot clear it — the server must.
        try { await apiRequest("/api/hiq/logout", { method: "POST" }); } catch { /* ignore */ }
        // Clear all cached data so the next user on this device sees nothing from this account.
        queryClient.clear();
        setLocation("/");
    };

    const tier = currentSport === "GOLF"
        ? { label: "익스플로러", class: "border-amber-500/50 text-amber-500", icon: "⛳️" }
        : getTier(member?.handi4c || 0, false, currentSport);

    const sportColor = currentSport === "GOLF" ? "#64DD17" : "#006241";
    const sportColorClass = currentSport === "GOLF" ? "text-brand" : "text-brand";
    const sportBgClass = currentSport === "GOLF" ? "bg-brand" : "bg-brand";
    const sportGlowClass = currentSport === "GOLF" ? "" : "";

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-32 font-sans relative overflow-x-hidden">
            {/* Background Light Effect */}
            <div
                className="absolute top-0 right-0 w-[80dvw] h-[50dvh] blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none transition-colors duration-700"
                style={{ backgroundColor: `${sportColor}0D` }}
            />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-8 pt-5">
                <h1 className="text-[26px] font-bold tracking-tight text-brand">전체 메뉴</h1>
                <div className="flex gap-2.5">
                    <button
                        title="알림"
                        onClick={() => setNotifOpen(true)}
                        className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <LucideBell className="w-5 h-5 text-black/55" />
                    </button>
                    <button title="설정" className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center active:scale-95 transition-transform">
                        <LucideSettings className="w-5 h-5 text-black/55" />
                    </button>
                </div>
            </div>

            {/* Section A: Profile card */}
            <div className="relative z-10 mb-10">
                <div className="rk-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="relative group/avatar cursor-pointer shrink-0" onClick={() => document.getElementById('profile-upload')?.click()}>
                            <div className="w-[68px] h-[68px] rounded-2xl bg-surface-2 flex items-center justify-center overflow-hidden relative">
                                {member?.profileImageUrl ? (
                                    <img src={member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                                ) : (
                                    <LucideUserCircle className="w-10 h-10 text-black/15" />
                                )}
                                <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                    {isUploading || updateProfileMutation.isPending ? (
                                        <LucideLoader2 className="w-5 h-5 text-white animate-spin" />
                                    ) : (
                                        <LucideCamera className="w-5 h-5 text-white" />
                                    )}
                                </div>
                            </div>
                            {/* Persistent tap affordance (mobile — hover overlay is enhancement only) */}
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center">
                                {isUploading || updateProfileMutation.isPending ? (
                                    <LucideLoader2 className="w-3.5 h-3.5 text-black/55 animate-spin" />
                                ) : (
                                    <LucideCamera className="w-3.5 h-3.5 text-black/55" />
                                )}
                            </div>
                            <input
                                type="file"
                                id="profile-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            {isEditingName ? (
                                <div className="flex items-center gap-2 mb-1.5">
                                    <input
                                        type="text"
                                        aria-label="이름 수정"
                                        placeholder="이름"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="bg-transparent border-b border-black/25 text-[19px] font-bold text-ink-1 w-full max-w-[150px] outline-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveName();
                                        }}
                                    />
                                    <button title="저장" disabled={updateProfileMutation.isPending} onClick={handleSaveName} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full active:bg-black/[0.06] shrink-0 disabled:opacity-40">
                                        <LucideCheck className="w-4 h-4 text-brand" />
                                    </button>
                                    <button title="취소" onClick={() => setIsEditingName(false)} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full active:bg-black/[0.06] shrink-0">
                                        <LucideX className="w-4 h-4 text-red-500" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mb-1.5">
                                    <h2 className="text-[19px] font-bold text-ink-1 tracking-tight truncate">
                                        {member?.nickname || member?.name || "사용자"}
                                        <span className="text-[15px] font-medium text-black/40 ml-0.5">님</span>
                                    </h2>
                                    <button title="이름 수정" onClick={() => setIsEditingName(true)} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full text-black/55 active:bg-black/[0.06] transition-colors shrink-0">
                                        <LucidePencil className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-black/55">일반 회원</span>
                                <span className="w-1 h-1 rounded-full bg-black/25" />
                                <span className="text-[13px] font-medium text-black/40">Lv.{Math.floor((member?.visitCount || 0) / 5) + 1}</span>
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={() => toast({ title: "서비스 준비 중", description: "프리미엄 멤버십 결제 기능은 추후 업데이트될 예정입니다." })}
                        className="w-full h-12 mt-6 rounded-tile font-semibold text-[15px] bg-brand text-brand-fg hover:bg-brand active:scale-[0.98] transition-transform border-none shadow-none"
                    >
                        <LucideCrown className="w-4 h-4 mr-2" />
                        프리미엄 멤버십 시작하기
                    </Button>
                </div>
            </div>

            {/* Section: Sports Mode Switcher (Icon Only Style) */}
            <div className="relative z-10 mb-10">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-2 items-center">
                        <button
                            title="당구 모드"
                            onClick={() => {
                                setSport("BILLIARDS");
                                toast({ title: "스포츠 모드 변경", description: "당구 모드로 전환되었습니다." });
                            }}
                            className={cn(
                                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-90",
                                currentSport === "BILLIARDS"
                                    ? "bg-brand border border-brand/50 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                                    : "bg-black/[0.04] "
                            )}
                        >
                            <LucideCircle className={cn(
                                "w-7 h-7",
                                currentSport === "BILLIARDS" ? "text-brand-fg" : "text-black/35"
                            )} />
                        </button>
                        <span className={cn(
                            "text-[12px] font-semibold tracking-tight",
                            currentSport === "BILLIARDS" ? "text-brand" : "text-black/45"
                        )}>당구</span>
                    </div>

                    {GOLF_ENABLED && (
                        <>
                            <div className="w-px h-8 bg-black/10 mx-1" />

                            <div className="flex flex-col gap-2 items-center">
                                <button
                                    title="골프 모드"
                                    onClick={() => {
                                        setSport("GOLF");
                                        toast({ title: "스포츠 모드 변경", description: "골프 모드로 전환되었습니다." });
                                    }}
                                    className={cn(
                                        "w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-90",
                                        currentSport === "GOLF"
                                            ? "bg-brand border border-brand/50 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                                            : "bg-black/[0.04] "
                                    )}
                                >
                                    <LucideFlag className={cn(
                                        "w-7 h-7",
                                        currentSport === "GOLF" ? "text-brand-fg" : "text-black/35"
                                    )} />
                                </button>
                                <span className={cn(
                                    "text-[12px] font-semibold tracking-tight",
                                    currentSport === "GOLF" ? "text-brand" : "text-black/45"
                                )}>골프</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Section B: Menu list */}
            <div className="relative z-10 mb-10">
                <h3 className="text-[15px] font-semibold text-black/55 mb-3 px-1">관리 · 안내</h3>
                <div className="flex flex-col gap-2.5">
                    {[
                        { icon: LucideMail, label: "건의함 · 제휴 문의", desc: "무엇이든 말씀해주세요", onClick: () => setSuggestionOpen(true) },
                        { icon: LucideInfo, label: "공지사항", desc: "새로운 소식과 공지", onClick: () => openInfoModal('announcement') },
                        { icon: LucideBriefcase, label: "이용안내", desc: "랭큐 서비스 사용 가이드", onClick: () => openInfoModal('guide') },
                        { icon: LucideTrophy, label: "랭킹 시스템 안내", desc: "실력 산정 및 등급 기준", onClick: () => openInfoModal('ranking') },
                        {
                            icon: LucideLogOut,
                            label: "로그아웃",
                            desc: "현재 기기에서 계정 연결 해제",
                            onClick: handleLogout,
                            danger: true
                        },
                    ].map((item, idx) => (
                        <motion.button
                            key={idx}
                            whileTap={{ scale: 0.98 }}
                            onClick={item.onClick}
                            className="flex items-center justify-between p-4 rk-card active:bg-surface-2 transition-colors"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className={`w-11 h-11 rounded-tile flex items-center justify-center ${item.danger ? 'bg-red-500/10' : 'bg-surface-2'}`}>
                                    <item.icon className={`w-5 h-5 ${item.danger ? 'text-red-500' : 'text-black/55'}`} />
                                </div>
                                <div className="text-left">
                                    <p className={`text-[15px] font-semibold leading-tight ${item.danger ? 'text-red-500' : 'text-ink-1'}`}>{item.label}</p>
                                    <p className="text-[12.5px] text-black/40 font-medium mt-0.5">{item.desc}</p>
                                </div>
                            </div>
                            <LucideChevronRight className={cn("w-5 h-5", item.danger ? 'text-red-500/30' : 'text-black/40')} />
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Section C: Partner promo */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation("/partner/login")}
                className="relative z-10 w-full p-6 rounded-card overflow-hidden border border-brand/20 bg-gradient-to-br from-brand/[0.08] to-white mb-10 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <span className="rk-chip bg-brand/[0.12] text-brand mb-3">파트너 프로그램</span>
                        <h3 className="text-[20px] font-bold text-ink-1 mt-2 leading-tight">사장님이신가요?</h3>
                        <p className="text-[13px] font-medium text-black/55 mt-1">우리 매장도 랭큐로 스마트하게 운영하기</p>
                    </div>
                    <div className="w-14 h-14 rounded-tile bg-brand/[0.12] flex items-center justify-center shrink-0">
                        <LucideBriefcase className="w-7 h-7 text-brand" />
                    </div>
                </div>
            </motion.button>

            {/* Section: Family services */}
            <div className="relative z-10 mb-12">
                <h3 className="text-[15px] font-semibold text-black/55 mb-3 px-1">패밀리 서비스</h3>
                <div className="flex flex-col gap-2.5">
                    <a href="https://www.tohk.co.kr" target="_blank" rel="noopener noreferrer" className="block rk-card p-5 hover:bg-surface-2 transition-colors group">
                        <span className="rk-chip bg-purple-500/[0.10] text-purple-700 mb-2.5">무료 운세 · 꿈해몽</span>
                        <h3 className="text-[16px] font-semibold text-ink-1 leading-tight mt-1.5">어젯밤 그 꿈, 혹시 태몽? 흉몽?</h3>
                        <p className="text-[12.5px] text-black/40 font-medium mt-1 group-hover:text-purple-700/80 transition-colors">광고 없는 100% 무료 운세 바로가기</p>
                    </a>

                    <a href="https://www.polli.co.kr" target="_blank" rel="noopener noreferrer" className="block rk-card p-5 hover:bg-surface-2 transition-colors group">
                        <span className="rk-chip bg-cyan-500/[0.10] text-cyan-700 mb-2.5">대국민 투표 · 퀴즈</span>
                        <h3 className="text-[16px] font-semibold text-ink-1 leading-tight mt-1.5">짜장 vs 짬뽕, 당신의 선택은?</h3>
                        <p className="text-[12.5px] text-black/40 font-medium mt-1 group-hover:text-cyan-700/80 transition-colors">폴리에서 내 취향 증명하고 결과 보기</p>
                    </a>
                </div>
            </div>

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

            <SuggestionModal
                open={suggestionOpen}
                onOpenChange={setSuggestionOpen}
            />

            <HiqNavigation />
        </div>
    );
}
