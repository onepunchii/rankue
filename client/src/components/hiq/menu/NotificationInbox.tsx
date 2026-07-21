import { motion, AnimatePresence } from "framer-motion";
import { LucideX, LucideBell, LucideCheck, LucideTrash2, LucideChevronRight } from "@/lib/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface NotificationInboxProps {
    open: boolean;
    onClose: () => void;
}

export function NotificationInbox({ open, onClose }: NotificationInboxProps) {
    const { t } = useT();
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

        // Deep linking logic — 크루 상세는 /club/:id 에 마운트되어 있고, 탭은 ?tab= 쿼리로 전달한다.
        if (notif.params && notif.params.crewId) {
            const tab = notif.params.tab?.toLowerCase();
            setLocation(`/club/${notif.params.crewId}${tab ? `?tab=${tab}` : ''}`);
            onClose();
        }
        // NOTICE 등 목적지 페이지가 없는 알림은 읽음 처리만 하고 이동하지 않는다 (전용 페이지 부재).
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
                        className="fixed inset-0 bg-black/60 z-[100]"
                    />
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-white border-l border-black/10 z-[101] shadow-[0_0_40px_rgba(0,0,0,0.12)] flex flex-col text-ink-1"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-black/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-tile bg-black/[0.04] flex items-center justify-center ">
                                    <LucideBell className="w-5 h-5 text-brand" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-ink-1">{t("notificationInbox.title")}</h2>
                                    <p className="text-[12px] text-black/55">{t("notificationInbox.subtitle")}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                title={t("notificationInbox.close")}
                                className="w-10 h-10 rounded-full hover:bg-black/[0.04] flex items-center justify-center transition-colors"
                            >
                                <LucideX className="w-5 h-5 text-black/40" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-black/40">
                                    <div className="w-8 h-8 rounded-full border-2 border-black/15 border-t-brand animate-spin mb-4" />
                                    <p className="text-sm">{t("notificationInbox.loading")}</p>
                                </div>
                            ) : notifications?.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-black/30">
                                    <LucideBell className="w-12 h-12 mb-4" />
                                    <p className="text-sm">{t("notificationInbox.empty")}</p>
                                </div>
                            ) : (
                                notifications?.map((notif) => (
                                    <motion.div
                                        key={notif.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "relative group bg-black/[0.02] rounded-2xl p-5 overflow-hidden transition-all active:scale-[0.98]",
                                            !notif.isRead && "bg-white border-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                                        )}
                                        onClick={() => handleItemClick(notif)}
                                    >
                                        {!notif.isRead && (
                                            <div className="absolute top-5 right-5 w-1.5 h-1.5 rounded-full bg-brand" />
                                        )}

                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[12px] font-bold text-brand uppercase tracking-wider">
                                                    {notif.type || t("notificationInbox.defaultType")}
                                                </span>
                                                <span className="text-[12px] text-black/40">
                                                    {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ko })}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-bold text-ink-1">{notif.title}</h3>
                                            <p className="text-xs text-black/55 leading-relaxed mt-1">{notif.body}</p>
                                        </div>

                                        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-black/10">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteMutation.mutate(notif.id);
                                                }}
                                                title={t("notificationInbox.delete")}
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-black/40 hover:text-red-500 transition-all"
                                            >
                                                <LucideTrash2 className="w-4 h-4" />
                                            </button>
                                            <div className="flex-1" />
                                            <LucideChevronRight className="w-4 h-4 text-black/40 group-hover:translate-x-1 transition-transform" />
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
                                                    title: t("notificationInbox.testTitle"),
                                                    body: t("notificationInbox.testBody"),
                                                    type: "NOTICE"
                                                })
                                            });
                                            queryClient.invalidateQueries({ queryKey: ["/api/hiq/notifications"] });
                                        } catch (e) {
                                            console.error("Test push failed", e);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-full bg-black/[0.04] text-[12px] text-black/55 hover:bg-black/[0.06] transition-colors"
                                >
                                    {t("notificationInbox.testButton")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
