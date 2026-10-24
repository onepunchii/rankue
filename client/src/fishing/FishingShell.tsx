/**
 * 낚시의 공개 화면 틀(2026-10-24 오너: "낚시 비로그인시에 골프랑 등산처럼 해당 페이지 스타일로").
 *
 * 전국 낚시터 · 낚시터 · 오늘 바다 · 항구 · 어종 · 금어기 · 낚시 축제는 검색으로 들어온 사람이 보는 화면이라 로그인 없이 열린다.
 * 예전 틀은 누구에게나 회원용 하단 탭(오늘 바다 · 크루 · 수족관 · 일지 · 채팅)을 그렸다 — 방문자가 누르면 전부 가입 안내였고,
 * 머리줄에 '로그인'도 없었다. 이제 등산(HikingShell) · 골프(CourseShell)와 같은 규칙이다:
 *   낚시를 쓰는 회원 → 하단 탭 · 방문자 → 머리줄 '로그인' + 아래 한 줄 가입 단추 · 그 밖(한국어가 아닌 화면 등) → 아무것도 없음.
 * 머리줄은 회원이 앱에서 보던 낚시 머리줄(SportBackHeader) 그대로다. ⚠️ 리터럴 색만(방문자 화면은 종목 테마가 아니다).
 */
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useFishingAccess } from "@/hooks/useFishingAccess";
import { goLogin } from "@/components/hiq/LoginGate";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { SportBackHeader } from "@/components/hiq/SportHeader";
import { FISHING_COLORS as C } from "@shared/fishing";

/** 방문자에게 보이는 아래 단추의 글(2026-10-24 오너가 고름) */
export const FISHING_JOIN_CTA = "가입하고 내 어탁 모으기";

export function FishingShell({ title, backTo, right, children, cta = FISHING_JOIN_CTA, nav = true }: {
    title: ReactNode;
    /** 뒤로 갈 곳이 없을 때(검색에서 막 들어온 경우) */
    backTo: string;
    right?: ReactNode;
    children: ReactNode;
    /** 방문자에게 보이는 아래 단추의 글. null 이면 그리지 않는다 */
    cta?: string | null;
    /** 회원에게 하단 탭을 그리는가 */
    nav?: boolean;
}) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const guest = !isLoading && !member;
    const fishingOk = useFishingAccess() && nav;
    const showCta = guest && !!cta;
    return (
        <div className={`min-h-[100dvh] ${fishingOk ? "pb-28" : showCta ? "pb-24" : "pb-10"}`} style={{ background: C.bg, color: C.foam }} data-fishing-shell="1">
            <SportBackHeader
                sport="FISHING" title={title} fallback={backTo} inner="mx-auto max-w-[720px]"
                right={<>
                    {right}
                    {guest && (
                        <button type="button" onClick={() => goLogin(setLocation)} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-medium" style={{ background: "#FFFFFF14", color: C.foam }} data-testid="fishing-login">로그인</button>
                    )}
                </>}
            />
            <main className="mx-auto max-w-[720px]">{children}</main>
            {fishingOk && <HiqNavigation />}
            {showCta && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3" style={{ background: "#0B1E2DF2", borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                    <button
                        type="button" onClick={() => goLogin(setLocation)} data-track-as="fishing-join" data-testid="fishing-join"
                        className="mx-auto block h-12 w-full max-w-[688px] rounded-xl text-[15px] font-semibold active:opacity-90"
                        style={{ background: C.brand, color: C.onBrand }}
                    >{cta}</button>
                </div>
            )}
        </div>
    );
}
