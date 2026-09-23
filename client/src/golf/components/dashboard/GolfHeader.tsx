import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideChevronDown, LucideBell, LucideMenu } from "lucide-react";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";

interface GolfHeaderProps {
    member: any;
}

/**
 * 골프 홈 머리줄(2026-09-21 오너: "골프 헤더도 당구처럼 알림·전체 아이콘으로").
 * 왼쪽은 종목 전환, 오른쪽은 🔔 알림 · ≡ 전체. 예전 오른쪽(핸디캡 티어 + 아바타)은 뺐다 — 핸디캡은 바로 아래 큰 숫자가 말한다.
 */
export function GolfHeader({ member: _member }: GolfHeaderProps) {
    const { setSport } = useSport();
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    // 종목을 붙여야 골프 알림이 온다 — 없이 부르면 당구 알림만 세어 골프 배지가 늘 0 이었다(2026-09-21).
    // 60초 폴링은 그대로 두되 받는 건 숫자 하나다 — 예전엔 목록 전량(오너 계정 330KB)을 1분마다 받았다(2026-09-23).
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport: "GOLF" }], refetchInterval: 60_000, staleTime: 30_000 });
    const unread = notifCount?.unread || 0;

    return (
        <div className="flex items-center justify-between mb-8 relative z-10">
            {/* 종목 전환(2026-09-23 오너). 당구 홈의 검정 알약과 짝 — 여기는 어두운 바탕이라 흰 알약에 검정 글자다.
                라벨의 '모드'를 뺐고, 한국어로 박혀 있던 문구를 사전으로 옮겼다(외국어 사용자에게 한국어가 보였다).
                ⚠️ `bg-white` 를 쓰면 안 된다 — 골프 테마가 .bg-white 를 surface-1(#17181a)로 덮어서
                검정 글자와 겹쳐 통째로 안 보인다. 실제로 그렇게 만들었다가 화면에서 잡았다. 리터럴 hex 로. */}
            <button
                type="button"
                onClick={() => setSport('BILLIARDS')}
                title={t("dashboardHeader.switchToBilliards")}
                className="inline-flex items-center gap-1 h-7 pl-3 pr-2 rounded-full bg-[#ffffff] active:scale-95 transition-transform"
            >
                <span className="text-[12.5px] font-semibold text-[#0a0a0a] tracking-tight">{t("dashboardHeader.golfMode")}</span>
                <LucideChevronDown className="w-3.5 h-3.5 text-black/45" />
            </button>

            <div className="flex items-center gap-2">
                <button
                    type="button" onClick={() => setNotifOpen(true)} title={t("dashboardHeader.notifications")}
                    className="relative w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <LucideBell className="w-[20px] h-[20px] text-[#64DD17]" />
                    {unread > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#0A0A0A]" />}
                </button>
                <button
                    type="button" onClick={() => setLocation("/menu")} title={t("dashboardHeader.menu")}
                    className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <LucideMenu className="w-[20px] h-[20px] text-[#64DD17]" />
                </button>
            </div>
            <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>
    );
}
