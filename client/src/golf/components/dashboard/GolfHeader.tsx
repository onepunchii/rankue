import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideChevronDown, LucideBell, LucideMenu } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { NotificationInbox, UNREAD_COUNT_KEY } from "@/components/hiq/menu/NotificationInbox";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";

interface GolfHeaderProps {
    member: any;
}

/**
 * 골프 홈 머리줄(2026-09-21 오너: "골프 헤더도 당구처럼 알림·전체 아이콘으로").
 * 왼쪽은 종목 전환, 오른쪽은 🔔 알림 · ≡ 전체. 예전 오른쪽(핸디캡 티어 + 아바타)은 뺐다 — 핸디캡은 바로 아래 큰 숫자가 말한다.
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 * 알림은 회원의 것이라 종 자리에 "로그인" 단추를 둔다(알림 수도 부르지 않는다). 종목 알약과 ≡ 전체는 방문자에게도 그대로 동작한다.
 */
export function GolfHeader({ member: _member }: GolfHeaderProps) {
    const { setSport } = useSport();
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    const { member, isGuest } = useAuth();
    // 종목을 붙여야 골프 알림이 온다 — 없이 부르면 당구 알림만 세어 골프 배지가 늘 0 이었다(2026-09-21).
    // 60초 폴링은 그대로 두되 받는 건 숫자 하나다 — 예전엔 목록 전량(오너 계정 330KB)을 1분마다 받았다(2026-09-23).
    // 비로그인은 부르지 않는다 — 로그인 필수라 1분마다 401 만 쌓인다(enabled 가 꺼지면 폴링도 멈춘다).
    const { data: notifCount } = useQuery<{ unread: number }>({ queryKey: [UNREAD_COUNT_KEY, { sport: "GOLF" }], refetchInterval: 60_000, staleTime: 30_000, enabled: !!member });
    const unread = notifCount?.unread || 0;

    return (
        <div className="flex items-center justify-between mb-8 relative z-10">
            {/* 종목 전환(2026-09-23 오너). 당구 홈의 검정 알약과 짝 — 여기는 어두운 바탕이라 흰 알약에 검정 글자다.
                라벨의 '모드'를 뺐고, 한국어로 박혀 있던 문구를 사전으로 옮겼다(외국어 사용자에게 한국어가 보였다).
                ⚠️ 골프 테마는 `bg-white` 뿐 아니라 `text-black/45` 같은 **검정 계열 유틸리티도 밝은 색으로 바꿔 끼운다**
                (index.css 의 :root[data-sport="GOLF"] 규칙들). 흰 알약 위에 그걸 쓰면 글자도 화살표도 배경에 묻는다 —
                두 번 다 그렇게 만들었다가 화면에서 잡았다. 이 알약 안은 **리터럴 hex 만** 쓴다. */}
            <button
                type="button"
                onClick={() => setSport('BILLIARDS')}
                title={t("dashboardHeader.switchToBilliards")}
                className="inline-flex items-center gap-1 h-7 pl-3 pr-2 rounded-full bg-[#ffffff] active:scale-95 transition-transform"
            >
                <span className="text-[12.5px] font-semibold text-[#0a0a0a] tracking-tight">{t("dashboardHeader.golfMode")}</span>
                <LucideChevronDown className="w-3.5 h-3.5 text-[#52525b]" />
            </button>

            <div className="flex items-center gap-2">
                {isGuest ? (
                    // 로그인하면 지금 보던 골프 홈으로 돌아온다(goLogin 이 지금 주소를 기억한다). 색은 리터럴만 — 골프 테마가 유틸을 바꿔 끼운다.
                    // 옆의 ≡ 단추와 같은 결(옅은 바탕 + 라임)로 둔다 — 라임으로 꽉 채운 단추는 바로 아래 가입 안내 한 줄이 쓴다.
                    <button
                        type="button" onClick={() => goLogin(setLocation)}
                        className="h-11 px-4 rounded-full bg-[#FFFFFF0F] border border-[#FFFFFF1A] text-[#64DD17] text-[14px] font-bold active:scale-95 transition-transform"
                    >
                        로그인
                    </button>
                ) : (
                    <button
                        type="button" onClick={() => setNotifOpen(true)} title={t("dashboardHeader.notifications")}
                        className="relative w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <LucideBell className="w-[20px] h-[20px] text-[#64DD17]" />
                        {unread > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#0A0A0A]" />}
                    </button>
                )}
                <button
                    type="button" onClick={() => setLocation("/menu")} title={t("dashboardHeader.menu")}
                    className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <LucideMenu className="w-[20px] h-[20px] text-[#64DD17]" />
                </button>
            </div>
            {/* 알림함은 회원에게만 붙인다 — 방문자에게는 열 단추가 없다 */}
            {!isGuest && <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />}
        </div>
    );
}
