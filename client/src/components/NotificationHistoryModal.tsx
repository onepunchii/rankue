import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, MessageSquare, Trophy, Star, Clock, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Notification } from "@shared/schema";
import { Button } from "./ui/button";

interface NotificationHistoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function NotificationHistoryModal({ open, onOpenChange }: NotificationHistoryModalProps) {
    const queryClient = useQueryClient();

    // 1. Fetch real notifications
    const { data: notifications = [], isLoading } = useQuery<Notification[]>({
        queryKey: ["/api/notifications"],
        enabled: open,
    });

    // 2. Mark as read mutation
    const readMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        },
    });

    // 3. Mark all as read mutation
    const readAllMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("/api/notifications/read-all", { method: "POST" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        },
    });

    const getIcon = (type: string) => {
        switch (type) {
            case 'politics': return <MessageSquare className="w-5 h-5 text-blue-400" />;
            case 'fandom': return <Trophy className="w-5 h-5 text-yellow-400" />;
            case 'balance_game': return <Star className="w-5 h-5 text-pink-400" />;
            case 'reward': return <Clock className="w-5 h-5 text-purple-400" />;
            case 'result': return <Bell className="w-5 h-5 text-green-400" />;
            default: return <Bell className="w-5 h-5 text-gray-400" />;
        }
    };

    const getTimeLabel = (dateStr: string | Date) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60 * 1000) return "방금 전";
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
        if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
        if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}일 전`;
        return date.toLocaleDateString();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md mx-auto h-[70vh] flex flex-col p-0 glass-card border-white/10 overflow-hidden bg-black/80 backdrop-blur-2xl">
                <DialogHeader className="p-6 pb-2 flex flex-row items-center justify-between">
                    <DialogTitle className="text-xl font-black italic flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        알림 내역
                    </DialogTitle>
                    {notifications.some(n => !n.isRead) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] text-white/40 hover:text-white flex items-center gap-1 uppercase tracking-tighter"
                            onClick={() => readAllMutation.mutate()}
                        >
                            <Check className="w-3 h-3" />
                            모두 읽음
                        </Button>
                    )}
                </DialogHeader>

                <ScrollArea className="flex-1 px-6 pb-6">
                    <div className="space-y-4">
                        {isLoading ? (
                            <div className="py-20 text-center text-white/20 animate-pulse font-black italic">
                                LOADING...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-sm text-white/20 font-medium italic">
                                    아직 새로운 알림이 없습니다.
                                </p>
                            </div>
                        ) : (
                            <AnimatePresence>
                                {notifications.map((noti, index) => (
                                    <motion.div
                                        key={noti.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${noti.isRead
                                                ? "bg-white/5 border-white/5 grayscale-[0.5]"
                                                : "bg-gradient-to-br from-white/10 to-transparent border-white/10 shadow-lg shadow-primary/5"
                                            }`}
                                        onClick={() => !noti.isRead && readMutation.mutate(noti.id)}
                                    >
                                        {!noti.isRead && (
                                            <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                        )}

                                        <div className="flex gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${noti.isRead ? "bg-white/5" : "bg-white/10"
                                                }`}>
                                                {getIcon(noti.type)}
                                            </div>

                                            <div className="flex-1 space-y-1">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="font-bold text-sm text-white">{noti.title}</h4>
                                                    <span className="text-[10px] text-white/30 font-medium">
                                                        {getTimeLabel(noti.createdAt)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/50 leading-relaxed font-medium">
                                                    {noti.body}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>

                    {!isLoading && notifications.length > 0 && (
                        <div className="py-10 text-center">
                            <p className="text-[10px] font-black tracking-widest text-white/20 uppercase">
                                End of Notifications
                            </p>
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
