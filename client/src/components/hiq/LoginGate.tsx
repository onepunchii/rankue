import { useT } from "@/lib/i18n";
import { useLocation } from "wouter";
import { HiqNavigation } from "./HiqNavigation";
import { loginPagePath, openLoginSheet } from "./LoginSheet";
import { LucideLock, LucideChevronRight, type LucideIcon } from "@/lib/icons";

// 개인 화면(홈·기록·라이벌·랭킹)에 비로그인으로 도달했을 때 그리는 안내.
//
// 왜 필요한가: 검색으로 선수/매장 페이지에 들어온 방문자가 하단 탭을 누르면 개인 화면으로
// 간다. 예전에는 그 화면들이 빈 값을 그려서 "라이벌 0명 · 0승 0패 · 아직 랭킹이 없습니다"
// 처럼 **없다고 거짓말**을 했고, 홈(/dashboard)은 아예 흰 화면이었다(2026-08-16 실측).
// 로그인이 필요하다는 사실 자체가 화면에 없으면 방문자는 앱이 고장 났다고 읽는다.
//
// 하단 네비를 그대로 두는 것이 이 컴포넌트의 핵심이다 — 막다른 길이 아니라
// 공개 콘텐츠(크루·커뮤니티·세계랭킹)로 계속 걸어갈 수 있어야 한다.

/**
 * 로그인 **화면**으로 보내되, 끝나면 원래 있던 곳으로 되돌아오게 한다(예전 goLogin 의 동작 그대로).
 * 화면이 뜨자마자 자동으로 보내는 곳(골프 전용 문 GolfOnly · 크루 만들기)이 쓴다 — 빈 화면 위에 팝업이 뜨면 안 되고,
 * 닫으면 빈 화면에 갇힌다. 사람이 눌러서 여는 곳은 goLogin 을 쓴다.
 */
export function goLoginPage(setLocation: (to: string) => void, from?: string) {
    const back = from ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
    // 주소는 loginPagePath 한 곳에서 만든다(/?login=1&redirect=…) — login=1 은 '로그인하러 온 사람'이라는 신호(landing.tsx):
    // 이게 없는 맨 '/' 는 비로그인을 예시 홈으로 보낸다. redirect 는 landing 이 이미 지원하는 복귀 파라미터를 그대로 쓴다.
    setLocation(loginPagePath(back));
}

/**
 * 가입·로그인 팝업을 그 자리에서 연다(2026-10-06 오너: "회원가입은 실제로 하려고 할 때 저 화면보다는 올라오는 간편 회원가입 팝업으로").
 * 예전에는 로그인 화면으로 옮겨 갔다 — 부르는 곳(머리의 '로그인', 관심·응원·팔로우 등)은 그대로 두고 여기서 팝업으로 바꿨다.
 * 로그인이 끝나면 from 이 지금 주소와 다를 때만 그리로 가고, 아니면 보던 화면에 그대로 남는다(LoginSheet).
 * 팝업을 못 열 때(호스트가 아직 붙지 않았다 · 지금 화면이 곧 로그인 화면이다)는 예전처럼 로그인 화면으로 보낸다 — setLocation 은 그때만 쓰인다.
 */
export function goLogin(setLocation: (to: string) => void, from?: string) {
    if (openLoginSheet({ from })) return;
    goLoginPage(setLocation, from);
}

interface LoginGateProps {
    /** 무엇을 보려는 화면인지 — "기록", "라이벌" 처럼 짧은 명사. */
    title: string;
    desc: string;
    icon?: LucideIcon;
    /** 로그인 없이도 볼 수 있는 곳으로 가는 길. 막다른 길을 만들지 않기 위한 것. */
    links?: { label: string; to: string }[];
    /** 하단 탭 표시 여부 — 탭이 없는 화면(모달 등)에서 끌 수 있다. */
    nav?: boolean;
}

export function LoginGate({ title, desc, icon: Icon = LucideLock, links, nav = true }: LoginGateProps) {
    const { t } = useT();
    const [, setLocation] = useLocation();

    return (
        <div className="min-h-screen bg-surface-0 px-5 pb-32 flex flex-col items-center justify-center">
            <div className="w-full max-w-[380px] rk-card p-7 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-brand/[0.08] flex items-center justify-center mb-4">
                    <Icon className="w-7 h-7 text-brand" />
                </div>
                <h2 className="text-[19px] font-bold text-ink-1">{title}</h2>
                <p className="text-[13.5px] text-black/50 mt-2 leading-relaxed">{desc}</p>

                <button
                    onClick={() => goLogin(setLocation)}
                    className="w-full mt-6 h-[52px] rounded-tile bg-brand text-white text-[15px] font-bold active:scale-[0.98] transition-transform"
                >
                    {t("loginGate.cta")}
                </button>
            </div>

            {links && links.length > 0 && (
                <div className="w-full max-w-[380px] mt-4">
                    <p className="text-[12px] font-medium text-black/40 px-1 mb-2">{t("loginGate.publicSection")}</p>
                    <div className="rk-card divide-y divide-black/[0.06]">
                        {links.map((l) => (
                            <button
                                key={l.to}
                                onClick={() => setLocation(l.to)}
                                className="w-full px-4 py-3.5 flex items-center justify-between text-left active:bg-black/[0.02] transition-colors"
                            >
                                <span className="text-[14px] font-medium text-ink-1">{l.label}</span>
                                <LucideChevronRight className="w-4 h-4 text-black/25" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {nav && <HiqNavigation />}
        </div>
    );
}
