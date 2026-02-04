import { motion, AnimatePresence } from "framer-motion";
import { LucideX, LucideBell, LucideCheck, LucideTrash2, LucideChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface NotificationInboxProps {
    open: boolean;
    onClose: () => void;
}

export function NotificationInbox({ open, onClose }: NotificationInboxProps) {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();

    const { data: notifications, isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/notifications"],
        enabled: open,
    });

    const readMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest(`/api/hiq/notifications/${id}/read`, { method: "PATCH" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/notifications"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest(`/api/hiq/notifications/${id}`, { method: "DELETE" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/notifications"] });
        },
    });

    const handleItemClick = (notif: any) => {
        if (!notif.isRead) {
            readMutation.mutate(notif.id);
        }

        // Deep linking logic
        if (notif.params && notif.params.crewId) {
            const tab = notif.params.tab?.toLowerCase() || 'chat';
            setLocation(`/crew/${notif.params.crewId}/${tab}`);
            onClose();
        } else if (notif.type === 'NOTICE') {
            setLocation('/hiq/notice');
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-[#0F0F0F] border-l border-white/10 z-[101] shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                    <LucideBell className="w-5 h-5 text-white/60" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">알림함</h2>
                                    <p className="text-[10px] text-white/30 uppercase tracking-widest">Notification Inbox</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                title="닫기"
                                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors"
                            >
                                <LucideX className="w-5 h-5 text-white/40" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                                    <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
                                    <p className="text-sm">알림을 불러오는 중...</p>
                                </div>
                            ) : notifications?.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                                    <LucideBell className="w-12 h-12 mb-4" />
                                    <p className="text-sm">알림 내역이 없습니다</p>
                                </div>
                            ) : (
                                notifications?.map((notif) => (
                                    <motion.div
                                        key={notif.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "relative group bg-white/[0.03] border border-white/5 rounded-2xl p-5 overflow-hidden transition-all active:scale-[0.98]",
                                            !notif.isRead && "bg-white/[0.06] border-white/10"
                                        )}
                                        onClick={() => handleItemClick(notif)}
                                    >
                                        {!notif.isRead && (
                                            <div className="absolute top-5 right-5 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                        )}

                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                                                    {notif.type || '알림'}
                                                </span>
                                                <span className="text-[10px] text-white/20">
                                                    {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ko })}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-bold text-white/90">{notif.title}</h3>
                                            <p className="text-xs text-white/50 leading-relaxed mt-1">{notif.body}</p>
                                        </div>

                                        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-white/5">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteMutation.mutate(notif.id);
                                                }}
                                                title="삭제"
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                                            >
                                                <LucideTrash2 className="w-4 h-4" />
                                            </button>
                                            <div className="flex-1" />
                                            <LucideChevronRight className="w-4 h-4 text-white/10 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </motion.div>
                                ))
                            )}

                            {/* Test Button for Developer/User Verification */}
                            <div className="pt-10 pb-20 flex justify-center">
                                <button
                                    onClick={async () => {
                                        try {
                                            await apiRequest("/api/hiq/test-notification", {
                                                method: "POST",
                                                body: JSON.stringify({
                                                    title: "🚀 기능 활성화 완료",
                                                    body: "이제부터 받는 모든 알림이 여기에 기록됩니다.",
                                                    type: "NOTICE"
                                                })
                                            });
                                            queryClient.invalidateQueries({ queryKey: ["/api/hiq/notifications"] });
                                        } catch (e) {
                                            console.error("Test push failed", e);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/40 hover:bg-white/10 transition-colors"
                                >
                                    테스트 알림 받기
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
