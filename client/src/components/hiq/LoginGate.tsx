import { useLocation } from "wouter";
import { HiqNavigation } from "./HiqNavigation";
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

/** 로그인 화면으로 보내되, 끝나면 원래 있던 곳으로 되돌아오게 한다. */
export function goLogin(setLocation: (to: string) => void, from?: string) {
    const back = from ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
    // login=1 은 마케팅 랜딩(소개 화면)을 건너뛰고 곧장 로그인 폼을 띄우는 신호(landing.tsx).
    // redirect 는 landing 이 이미 지원하는 복귀 파라미터를 그대로 쓴다.
    setLocation(`/?login=1&redirect=${encodeURIComponent(back)}`);
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
    const [, setLocation] = useLocation();

    return (
        <div className="min-h-screen bg-[#f2f0eb] px-5 pb-32 flex flex-col items-center justify-center">
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
                    로그인하고 시작하기
                </button>
            </div>

            {links && links.length > 0 && (
                <div className="w-full max-w-[380px] mt-4">
                    <p className="text-[12px] font-medium text-black/40 px-1 mb-2">로그인 없이 볼 수 있어요</p>
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
