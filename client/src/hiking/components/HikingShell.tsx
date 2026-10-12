/**
 * 등산의 공개 화면 틀(2026-10-13) — 머리줄(뒤로 · 제목 · 로그인)과 방문자용 아래 줄.
 * 검색으로 들어온 사람이 보는 화면이라 로그인 없이 열린다. 골프의 틀(CourseShell)을 가져다 쓰지 않는다 — 등산은 등산의 색(theme.HK)이다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { LucideChevronLeft } from "@/lib/icons";
import { HIKING_HUB_PATH } from "@shared/hikingMountains";

export function HikingShell({ title, backTo = HIKING_HUB_PATH, right, children, cta = "가입하고 산 도장 모으기", nav = true }: {
    title?: ReactNode;
    /** 뒤로 갈 곳이 없을 때(검색에서 막 들어온 경우) */
    backTo?: string;
    right?: ReactNode;
    children: ReactNode;
    /** 방문자에게 보이는 아래 단추의 글. null 이면 그리지 않는다 */
    cta?: string | null;
    /** 하단 탭을 그리는가 — 산행 중에는 뺀다(걷다가 잘못 눌러 화면을 떠나지 않게) */
    nav?: boolean;
}) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    // 검색에서 막 들어온 사람은 history 가 이 화면 하나다 — back() 하면 검색 결과로 나가 버린다
    const back = () => (window.history.length > 1 && document.referrer.startsWith(window.location.origin) ? window.history.back() : setLocation(backTo));
    const guest = !isLoading && !member;
    // 등산을 쓸 수 있는 회원에게는 하단 탭(홈 · 산 · 도장첩 · 크루 · 채팅)을 붙인다 — 산 화면에서도 등산 안에 머문다
    const hikingOk = useHikingAccess() && nav;
    return (
        <div className={`min-h-screen bg-[#0B1F26] font-sans text-[#F4EFE3] ${hikingOk ? "pb-nav" : guest && cta ? "pb-24" : "pb-10"}`} data-hiking="1">
            <header className="sticky top-0 z-40 border-b border-[#FFFFFF14] bg-[#0B1F26E6] backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1.5 px-3">
                    <button type="button" onClick={back} aria-label="뒤로" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-[#F4EFE3] active:bg-[#FFFFFF14]">
                        <LucideChevronLeft weight="bold" className="h-5 w-5" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{title ?? "랭큐 등산"}</div>
                    {right}
                    {guest && (
                        <button type="button" onClick={() => goLogin(setLocation)} className="h-8 rounded-full bg-[#FFFFFF14] px-3 text-[13px] font-medium text-[#F4EFE3]">로그인</button>
                    )}
                </div>
            </header>
            <main className="mx-auto max-w-[720px]">{children}</main>
            {hikingOk && <HiqNavigation />}
            {guest && cta && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#FFFFFF14] bg-[#0B1F26F2] px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                    <button type="button" onClick={() => goLogin(setLocation)} data-track-as="hiking-join" className="mx-auto block h-12 w-full max-w-[688px] rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]">
                        {cta}
                    </button>
                </div>
            )}
        </div>
    );
}

/** 구역 하나 — 제목과 오른쪽 한 줄 */
export function HkSection({ title, aside, children, className, id }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
    return (
        <section id={id} className={`px-5 pt-8 ${className ?? ""}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight text-[#F4EFE3]">{title}</h2>
                {aside && <span className="shrink-0 text-[12.5px] text-[#F4EFE38C]">{aside}</span>}
            </div>
            {children}
        </section>
    );
}

/** 불러오는 동안의 자리 */
export const HkSkel = ({ className }: { className?: string }) => <div className={`animate-pulse rounded-2xl bg-[#FFFFFF0F] ${className ?? ""}`} />;
