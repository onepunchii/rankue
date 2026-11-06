/**
 * 비회원의 바닥 가입 줄(2026-11-06 — shared/guestConversion). 선수 · 매장 · 당구 용어 화면이 그 화면에 맞는 말로 둔다.
 *
 *  · 비회원 · 한국어 화면에서만 그린다(유입의 거의 전부가 네이버다 — 다른 언어 화면은 예전대로 설치 팝업).
 *  · data-page-cta — 이 줄이 보이는 동안 앱 설치 팝업은 스스로 뜨지 않는다(AppInstallSheet pageCtaVisible). 한 화면에 바닥 권유 둘은 소음이다.
 *  · 하단 탭이 떠 있는 화면(html[data-bottom-nav])에서는 탭 위에 뜬다(index.css .rk-guest-cta). 본문 끝이 가려지지 않게 같은 높이의 빈칸을 둔다.
 */
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { openLoginSheet } from "@/components/hiq/LoginSheet";
import { SCOREBOARD_LOGIN_ASK, SCOREBOARD_START_PATH, type GuestBarCopy } from "@shared/guestConversion";

/** '점수판 쓰기' — 가입 팝업(점수판으로 치려다 가입한다고 말한다). 가입하면 홈의 실전 점수판이 바로 열린다(?start=match) */
export function askScoreboardSignup(setLocation: (to: string) => void): void {
    if (!openLoginSheet({ ...SCOREBOARD_LOGIN_ASK, from: SCOREBOARD_START_PATH })) goLoginPage(setLocation, SCOREBOARD_START_PATH);
}

export function GuestCtaBar({ id, copy, onClick, trackAs }: { id: string; copy: GuestBarCopy; onClick: () => void; trackAs: string }) {
    const { member, isLoading } = useAuth();
    const { locale } = useT();
    if (isLoading || member || locale !== "ko") return null;
    return (
        <>
            <div aria-hidden className="h-[84px]" />
            <div className="rk-guest-cta fixed left-0 right-0 z-40 px-3" data-page-cta={id} data-testid="guest-cta-bar">
                <div className="mx-auto flex max-w-[448px] items-center gap-3 rounded-2xl border border-black/[0.08] bg-white/[0.97] px-3.5 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur">
                    <p className="min-w-0 flex-1 leading-snug break-keep">
                        <span className="block text-[14px] font-bold text-ink-1">{copy.title}</span>
                        <span className="block text-[12.5px] text-ink-3">{copy.sub}</span>
                    </p>
                    <button type="button" onClick={onClick} data-track-as={trackAs} data-testid="guest-cta-btn"
                        className="h-11 shrink-0 rounded-xl bg-brand px-4 text-[14px] font-bold text-brand-fg active:scale-[0.98] transition-transform">
                        {copy.label}
                    </button>
                </div>
            </div>
        </>
    );
}
