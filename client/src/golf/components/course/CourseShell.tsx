/**
 * 골프장 페이지의 틀(2026-09-24) — 목록·상세·허브가 같이 쓴다.
 *
 * 이 페이지들은 **로그인 없이** 열린다(검색으로 들어온 사람이 본다). 그래서 GolfOnly 밖에 있고,
 * 앱의 골프 테마(data-sport="GOLF")에 기대지 않는다 — 로그인 안 한 방문자는 당구 테마라
 * `.bg-white`·`.text-black/xx`·토큰(ink·surface)이 밝은 값으로 풀린다. 이 틀 안은 **리터럴 색만** 쓴다.
 *
 *   골프를 쓰는 회원 → 앱의 골프 하단 내비(HiqNavigation)
 *   그 밖(비로그인·당구 회원) → 아래 한 줄 "로그인하고 취소티 알림 받기"
 */
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { LucideChevronLeft } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { goLogin } from "@/components/hiq/LoginGate";

export const COURSE_COLORS = {
    bg: "#0A0A0A",
    card: "#FFFFFF08",       // white 3%
    line: "#FFFFFF14",       // white 8%
    lime: "#64DD17",         // 부킹·브랜드
    orange: "#FF6B00",       // 조인
    red: "#FF3B30",          // 긴급·하락
    rise: "#FF4D4F",         // 한국 시세 관례: 오름 = 빨강
    fall: "#3B82F6",         // 내림 = 파랑
} as const;

interface Props {
    /** 상단 바 가운데 글(짧게). 없으면 로고 글자. */
    title?: ReactNode;
    /** 상단 바 오른쪽(공유 등) */
    right?: ReactNode;
    /** 뒤로 갈 곳이 없을 때(검색에서 막 들어온 경우) */
    backTo?: string;
    /** 하단 "로그인하고 취소티 알림 받기" 줄을 끈다 — 상세처럼 관심 단추가 이미 같은 말을 하는 화면. */
    hideBottomCta?: boolean;
    children: ReactNode;
}

export function CourseShell({ title, right, backTo = "/golf/courses", hideBottomCta = false, children }: Props) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const golfOk = useGolfAccess();
    // 검색에서 막 들어온 사람은 history 가 이 페이지 하나다 — back() 하면 검색 결과로 나가 버린다.
    const back = () => (window.history.length > 1 && document.referrer.startsWith(window.location.origin) ? window.history.back() : setLocation(backTo));

    return (
        <div className={`min-h-screen bg-[#0A0A0A] text-white font-sans ${golfOk ? "pb-nav" : hideBottomCta ? "pb-8" : "pb-24"}`}>
            <header className="sticky top-0 z-40 bg-[#0A0A0AE6] backdrop-blur-md border-b border-[#FFFFFF0F]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="h-14 px-3 flex items-center gap-1.5">
                    <button type="button" onClick={back} aria-label="뒤로" className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center active:bg-[#FFFFFF14]">
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex-1 min-w-0 text-[16px] font-semibold truncate">
                        {title ?? <span className="text-[#64DD17]">랭큐 골프</span>}
                    </div>
                    {right}
                    {!isLoading && !member && (
                        <button type="button" onClick={() => goLogin(setLocation)} className="h-8 px-3 rounded-full bg-[#FFFFFF14] text-[13px] font-medium">
                            로그인
                        </button>
                    )}
                </div>
            </header>
            <main className="max-w-[720px] mx-auto">{children}</main>
            {golfOk ? <HiqNavigation /> : !isLoading && !member && !hideBottomCta ? (
                <div className="fixed inset-x-0 bottom-0 z-40 bg-[#0A0A0AF2] border-t border-[#FFFFFF14] px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                    <button type="button" onClick={() => goLogin(setLocation)} className="w-full h-12 rounded-xl bg-[#64DD17] text-[#051907] text-[15px] font-semibold">
                        로그인하고 취소티 알림 받기
                    </button>
                </div>
            ) : null}
        </div>
    );
}
