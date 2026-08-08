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
    LucideStore,
    LucideCrown,
    LucideCircle,
    LucideFlag,
    LucideUserX
} from "@/lib/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { flagEmoji } from "@/lib/flag";
import { SuggestionModal } from "@/components/hiq/SuggestionModal";
import { FamilyServices } from "@/components/hiq/FamilyServices";
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
import { useT } from "@/lib/i18n";

export default function HiqMenu() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const { currentSport, setSport } = useSport();

    const [infoModal, setInfoModal] = useState<{ open: boolean, type: InfoModalType | null }>({ open: false, type: null });
    const openInfoModal = (type: InfoModalType) => setInfoModal({ open: true, type });

    const [notifOpen, setNotifOpen] = useState(false);
    const [suggestionOpen, setSuggestionOpen] = useState(false);

    // 계정 삭제 (App Store 5.1.1(v)) — '삭제' 입력 확인 후 영구 삭제
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);


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
            toast({ title: t("menu.profilePhotoUpdated") });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        },
        onError: (err: Error) => {
            toast({ title: t("menu.updateFailed"), description: err.message, variant: "destructive" });
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
            toast({ title: t("menu.avgRecalculated") });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        },
        onError: (err: Error) => {
            toast({ title: t("menu.recalcFailed"), description: err.message, variant: "destructive" });
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
            toast({ title: t("menu.imageProcessFailed"), variant: "destructive" });
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

    // 계정 영구 삭제 — 서버가 개인정보 삭제 + 세션 쿠키 무효화까지 처리한다.
    const handleDeleteAccount = async () => {
        if (deleteConfirm !== t("menu.deleteConfirmWord") || isDeleting) return;
        setIsDeleting(true);
        try {
            await apiRequest("/api/hiq/me", { method: "DELETE" });
            queryClient.clear();
            toast({ title: t("menu.accountDeleted"), description: t("menu.accountDeletedDesc") });
            setLocation("/");
        } catch {
            toast({ title: t("menu.deleteFailed"), description: t("menu.deleteFailedDesc"), variant: "destructive" });
            setIsDeleting(false);
        }
    };

    const tier = currentSport === "GOLF"
        ? { label: t("menu.tierExplorer"), class: "border-amber-500/50 text-amber-500", icon: "⛳️" }
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
                <h1 className="text-[26px] font-bold tracking-tight text-ink-1">{t("menu.title")}</h1>
                <div className="flex gap-2.5">
                    <button
                        title={t("menu.notifications")}
                        onClick={() => setNotifOpen(true)}
                        className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <LucideBell className="w-5 h-5 text-black/55" />
                    </button>
                    <button title={t("menu.settings")} onClick={() => setLocation("/settings")} className="w-11 h-11 rounded-full bg-surface-1 flex items-center justify-center active:scale-95 transition-transform">
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
                                        aria-label={t("menu.editName")}
                                        placeholder={t("menu.namePlaceholder")}
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="bg-transparent border-b border-black/25 text-[19px] font-bold text-ink-1 w-full max-w-[150px] outline-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveName();
                                        }}
                                    />
                                    <button title={t("menu.save")} disabled={updateProfileMutation.isPending} onClick={handleSaveName} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full active:bg-black/[0.06] shrink-0 disabled:opacity-40">
                                        <LucideCheck className="w-4 h-4 text-brand" />
                                    </button>
                                    <button title={t("menu.cancel")} onClick={() => setIsEditingName(false)} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full active:bg-black/[0.06] shrink-0">
                                        <LucideX className="w-4 h-4 text-red-500" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mb-1.5">
                                    <h2 className="text-[19px] font-bold text-ink-1 tracking-tight truncate">
                                        {flagEmoji(member?.countryCode) && <span className="mr-1 text-[17px]">{flagEmoji(member?.countryCode)}</span>}
                                        {member?.nickname || member?.name || t("menu.defaultUser")}
                                        <span className="text-[15px] font-medium text-black/40 ml-0.5">{t("menu.honorific")}</span>
                                    </h2>
                                    <button title={t("menu.editName")} onClick={() => setIsEditingName(true)} className="w-10 h-10 -m-2 flex items-center justify-center rounded-full text-black/55 active:bg-black/[0.06] transition-colors shrink-0">
                                        <LucidePencil className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                {/* @핸들 — 동명이인 구분용 유니크 아이디 (검색·초대에 사용) */}
                                {(member as any)?.handle && (
                                    <>
                                        <span className="text-[13px] font-medium text-brand">@{(member as any).handle}</span>
                                        <span className="w-1 h-1 rounded-full bg-black/25" />
                                    </>
                                )}
                                <span className="text-[13px] font-medium text-black/55">{t("menu.regularMember")}</span>
                                <span className="w-1 h-1 rounded-full bg-black/25" />
                                <span className="text-[13px] font-medium text-black/40">Lv.{Math.floor((member?.visitCount || 0) / 5) + 1}</span>
                            </div>
                        </div>
                    </div>

                    {/* 숨김 처리 — 추후 재노출 시 false → true */}
                    {false && (
                    <Button
                        onClick={() => toast({ title: t("menu.serviceComingSoon"), description: t("menu.premiumComingSoonDesc") })}
                        className="w-full h-12 mt-6 rounded-tile font-semibold text-[15px] bg-brand text-brand-fg hover:bg-brand active:scale-[0.98] transition-transform border-none shadow-none"
                    >
                        <LucideCrown className="w-4 h-4 mr-2" />
                        {t("menu.startPremium")}
                    </Button>
                    )}
                </div>
            </div>

            {/* Section: Sports Mode Switcher (Icon Only Style) */}
            <div className="relative z-10 mb-10">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-2 items-center">
                        <button
                            title={t("menu.billiardsMode")}
                            onClick={() => {
                                setSport("BILLIARDS");
                                toast({ title: t("menu.sportModeChanged"), description: t("menu.switchedToBilliards") });
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
                        )}>{t("menu.billiards")}</span>
                    </div>

                    {GOLF_ENABLED && (
                        <>
                            <div className="w-px h-8 bg-black/10 mx-1" />

                            <div className="flex flex-col gap-2 items-center">
                                <button
                                    title={t("menu.golfMode")}
                                    onClick={() => {
                                        setSport("GOLF");
                                        toast({ title: t("menu.sportModeChanged"), description: t("menu.switchedToGolf") });
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
                                )}>{t("menu.golf")}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Section B: Menu list */}
            <div className="relative z-10 mb-10">
                <h3 className="text-[15px] font-semibold text-black/55 mb-3 px-1">{t("menu.manageInfo")}</h3>
                <div className="flex flex-col gap-2.5">
                    {[
                        // 매장 찾기 — 모바일의 유일한 상시 진입점 (하단 네비·홈에는 자리가 없다)
                        { icon: LucideStore, label: t("menu.storeFinder"), desc: t("menu.storeFinderDesc"), onClick: () => setLocation("/stores") },
                        { icon: LucideMail, label: t("menu.suggestionBox"), desc: t("menu.suggestionBoxDesc"), onClick: () => setSuggestionOpen(true) },
                        { icon: LucideInfo, label: t("menu.announcements"), desc: t("menu.announcementsDesc"), onClick: () => openInfoModal('announcement') },
                        { icon: LucideBriefcase, label: t("menu.guide"), desc: t("menu.guideDesc"), onClick: () => openInfoModal('guide') },
                        { icon: LucideTrophy, label: t("menu.rankingSystem"), desc: t("menu.rankingSystemDesc"), onClick: () => openInfoModal('ranking') },
                        {
                            icon: LucideLogOut,
                            label: t("menu.logout"),
                            desc: t("menu.logoutDesc"),
                            onClick: handleLogout,
                            danger: true
                        },
                        {
                            icon: LucideUserX,
                            label: t("menu.deleteAccount"),
                            desc: t("menu.deleteAccountDesc"),
                            onClick: () => { setDeleteConfirm(""); setDeleteOpen(true); },
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

            {/* Section C: Partner promo — 숨김 처리 (추후 재노출 시 false → true) */}
            {false && (
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation("/partner/login")}
                className="relative z-10 w-full p-6 rounded-card overflow-hidden border border-brand/20 bg-gradient-to-br from-brand/[0.08] to-white mb-10 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <span className="rk-chip bg-brand/[0.12] text-brand mb-3">{t("menu.partnerProgram")}</span>
                        <h3 className="text-[20px] font-bold text-ink-1 mt-2 leading-tight">{t("menu.areYouOwner")}</h3>
                        <p className="text-[13px] font-medium text-black/55 mt-1">{t("menu.partnerPromoDesc")}</p>
                    </div>
                    <div className="w-14 h-14 rounded-tile bg-brand/[0.12] flex items-center justify-center shrink-0">
                        <LucideBriefcase className="w-7 h-7 text-brand" />
                    </div>
                </div>
            </motion.button>
            )}

            {/* Section: Family services — 카드 목록·착지점은 FamilyServices 가 갖는다.
                여기 하드코딩돼 있던 tohk·polli 두 카드를 옮겼다. 이제 기기에 따라
                스토어/웹으로 갈라지고, 자기 자신(랭큐)은 자동으로 빠진다.
                폴리는 앱이 없어 이번 범위에서 제외했다(레지스트리에 없음). */}
            <FamilyServices />

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

            {/* 계정 삭제 확인 다이얼로그 — App Store 5.1.1(v) 인앱 계정 삭제 */}
            <Dialog open={deleteOpen} onOpenChange={(open) => { if (!isDeleting) setDeleteOpen(open); }}>
                <DialogContent className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-[20px] font-bold text-ink-1">{t("menu.deleteDialogTitle")}</DialogTitle>
                        <DialogDescription className="text-[13px] font-medium text-black/55 mt-1">
                            {t("menu.deleteDialogDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-2 rounded-2xl bg-red-500/[0.06] p-4">
                        <ul className="text-[13px] font-medium text-black/70 space-y-1.5 list-disc pl-4">
                            <li>{t("menu.deleteBullet1Pre")}<b>{t("menu.deleteBullet1Bold")}</b>{t("menu.deleteBullet1Post")}</li>
                            <li>{t("menu.deleteBullet2")}</li>
                            <li>{t("menu.deleteBullet3Pre")}<b>{t("menu.deleteBullet3Bold")}</b>{t("menu.deleteBullet3Post")}</li>
                        </ul>
                    </div>

                    <div className="mt-4">
                        <p className="text-[13px] font-medium text-black/55 mb-2">
                            {t("menu.deleteConfirmPre")}<b className="text-red-500">{t("menu.deleteConfirmWord")}</b>{t("menu.deleteConfirmPost")}
                        </p>
                        <input
                            value={deleteConfirm}
                            onChange={(e) => setDeleteConfirm(e.target.value)}
                            placeholder={t("menu.deleteConfirmWord")}
                            className="w-full h-12 px-4 rounded-xl bg-black/[0.04] text-[15px] font-semibold text-ink-1 outline-none focus:ring-2 focus:ring-red-500/30"
                        />
                    </div>

                    <div className="mt-5 flex gap-2.5">
                        <button
                            onClick={() => setDeleteOpen(false)}
                            disabled={isDeleting}
                            className="flex-1 h-12 rounded-full bg-black/[0.05] text-[15px] font-bold text-ink-1 active:scale-[0.98] transition-transform"
                        >
                            {t("menu.cancel")}
                        </button>
                        <button
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirm !== t("menu.deleteConfirmWord") || isDeleting}
                            className="flex-1 h-12 rounded-full bg-red-500 text-white text-[15px] font-bold disabled:opacity-35 active:scale-[0.98] transition-transform"
                        >
                            {isDeleting ? t("menu.deleting") : t("menu.permanentDelete")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <HiqNavigation />
        </div>
    );
}
