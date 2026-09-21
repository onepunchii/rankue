import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LucideArrowLeftRight, LucideBell, LucideMenu } from "lucide-react";
import { useSport } from "@/contexts/SportContext";
import { NotificationInbox } from "@/components/hiq/menu/NotificationInbox";

interface GolfHeaderProps {
    member: any;
}

/**
 * 골프 홈 머리줄(2026-09-21 오너: "골프 헤더도 당구처럼 알림·전체 아이콘으로").
 * 왼쪽은 종목 전환, 오른쪽은 🔔 알림 · ≡ 전체. 예전 오른쪽(핸디캡 티어 + 아바타)은 뺐다 — 핸디캡은 바로 아래 큰 숫자가 말한다.
 */
export function GolfHeader({ member: _member }: GolfHeaderProps) {
    const { setSport } = useSport();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    // 종목을 붙여야 골프 알림이 온다 — 없이 부르면 당구 알림만 세어 골프 배지가 늘 0 이었다(2026-09-21).
    const { data: notifs } = useQuery<any[]>({ queryKey: ["/api/hiq/notifications", { sport: "GOLF" }], refetchInterval: 60_000, staleTime: 30_000 });
    const unread = notifs?.filter((n) => !n.isRead).length || 0;

    return (
        <div className="flex items-center justify-between mb-8 relative z-10">
            <Button
                variant="ghost"
                className="p-0 hover:bg-transparent group"
                onClick={() => setSport('BILLIARDS')}
            >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md transition-all group-hover:border-[#64DD17]/50">
                    <div className="w-2 h-2 rounded-full bg-[#64DD17] shadow-[0_0_8px_#64DD17]" />
                    <span className="text-xs font-semibold text-white/80 group-hover:text-white">GOLF MODE</span>
                    <LucideArrowLeftRight className="w-3 h-3 text-white/40 group-hover:text-[#64DD17]" />
                </div>
            </Button>

            <div className="flex items-center gap-2">
                <button
                    type="button" onClick={() => setNotifOpen(true)} title="알림"
                    className="relative w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <LucideBell className="w-[20px] h-[20px] text-[#64DD17]" />
                    {unread > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#0A0A0A]" />}
                </button>
                <button
                    type="button" onClick={() => setLocation("/menu")} title="전체"
                    className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <LucideMenu className="w-[20px] h-[20px] text-[#64DD17]" />
                </button>
            </div>
            <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>
    );
}
