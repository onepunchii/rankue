/**
 * 비로그인 방문자에게 홈을 열 때 쓰는 공용 부품(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다").
 *
 * 예전 홈은 비로그인이면 통째로 로그인 안내(LoginGate)였다 — 무엇을 하는 앱인지 보지도 못하고 가입부터 요구받았다.
 * 이제는 화면을 그대로 열고, 내 기록이 들어갈 자리는 예시 숫자(shared/guestSample)로 채운 뒤, 기록이 쌓이는 동작만 가입으로 잇는다.
 *  - SampleBadge   예시 숫자를 그리는 카드마다 붙이는 "예시" 알약. 예시가 진짜 기록처럼 읽히면 안 된다.
 *  - useGuestGate  회원이면 동작을 그대로 실행하고, 비로그인이면 가입·로그인 팝업(LoginSheet)을 연다.
 *  - GuestJoinCta  예시 카드 위·아래에 붙이는 가입 유도 한 줄. 단추도 같은 팝업을 연다(goLogin).
 *
 * 2026-10-06 오너: "회원가입은 실제로 하려고 할 때 저 화면보다는 올라오는 간편 회원가입 팝업으로" — 예전에는 guard 가 자기 안내 시트
 * ("가입하고 계속하기")를 띄우고, 그 단추가 다시 로그인 화면으로 보냈다(두 단계). 이제는 앱에 하나뿐인 팝업을 바로 연다(한 단계) —
 * 제목·설명·돌아갈 곳을 그대로 넘긴다. 팝업의 색은 호스트가 지금 종목으로 정한다(골프면 어두운 시트).
 *
 * tone 하나로 두 모습을 낸다. "light"(기본)는 당구 홈 — 디자인 토큰만. "dark"는 골프 홈(바탕 #0A0A0A) — **리터럴 색만**.
 * 골프 테마는 흰 바탕·검정 글자·흰 글자 유틸을 다른 색으로 바꿔 끼우므로(index.css :root[data-sport="GOLF"]) 이 파일은 그런 유틸을 아예 쓰지 않는다
 * (shared/guestSample.test.ts 가 소스를 읽어 지킨다).
 * 회원에게는 아무것도 달라지지 않는다 — 알약·한 줄은 부르는 쪽이 비로그인일 때만 그리고, guard 는 회원이면 바로 실행한다.
 */
import { useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { goLogin, goLoginPage } from "./LoginGate";
import { openLoginSheet } from "./LoginSheet";

export type GuestTone = "light" | "dark";

// 클래스는 통째로 적는다 — Tailwind 는 조각을 이어 붙인 이름을 못 찾는다.
const TONE: Record<GuestTone, {
    badge: string; primary: string;
    cta: string; ctaTitle: string; ctaDesc: string;
}> = {
    light: {
        badge: "bg-ink-1 text-surface-1",
        primary: "bg-brand text-brand-fg",
        cta: "rounded-tile bg-brand/[0.06] border-brand/20",
        ctaTitle: "text-ink-1",
        ctaDesc: "text-ink-3",
    },
    dark: {
        badge: "bg-[#FFFFFF] text-[#0A0A0A]",
        primary: "bg-[#64DD17] text-[#0A0A0A]",
        cta: "rounded-2xl bg-[#FFFFFF0F] border-[#FFFFFF1F]",
        ctaTitle: "text-[#FFFFFF]",
        ctaDesc: "text-[#FFFFFF99]",
    },
};

/** "예시" 표시 — 예시 숫자를 그리는 카드의 제목 옆에 둔다. 작지만 분명하게(12px, 바탕과 반대 색). */
export function SampleBadge({ tone = "light", className }: { tone?: GuestTone; className?: string }) {
    const { t } = useT();
    return (
        <span className={cn("inline-flex shrink-0 items-center h-5 px-2 rounded-full text-[12px] font-bold leading-none tracking-normal", TONE[tone].badge, className)}>
            {t("guest.sample")}
        </span>
    );
}

export interface GuestGuardOptions {
    /** 팝업 제목 — 부르는 쪽이 이미 번역한 문장. 없으면 기본 문구("랭큐 시작하기") */
    title?: string;
    desc?: string;
    /** 가입 뒤 갈 주소. 없으면 지금 주소(그 자리에 그대로) */
    from?: string;
}

/**
 * 기록이 쌓이는 동작(경기 시작·합류·라운드 기록 등)을 감싼다.
 *   const gate = useGuestGate();            // 골프 홈은 useGuestGate("dark")
 *   <button onClick={() => gate.guard(() => start())}>…</button>
 *   {gate.sheet}                            // 예전에 시트를 그리던 자리 — 지금은 null 이다(지워도 되고 둬도 된다)
 * 회원이면 run 을 바로 실행한다. 비로그인이 **확인된** 때만 팝업을 연다 — 로그인 확인 중에는 막지 않는다
 * (그 잠깐 사이 회원의 누름이 먹히지 않으면 회원의 동작이 달라진다).
 *
 * 팝업은 앱에 하나(LoginSheetHost)라 이 훅은 아무것도 그리지 않는다. 돌려주는 모양({ isGuest, guard, sheet })은 그대로 둔다 —
 * 부르는 화면들이 {gate.sheet} 를 그리고 있다. tone 도 받기만 한다(부르는 쪽 useGuestGate("dark") 를 그대로 두려고): 팝업 색은 호스트가 정한다.
 */
export function useGuestGate(tone: GuestTone = "light"): {
    isGuest: boolean;
    guard: (run: () => void, o?: GuestGuardOptions) => void;
    sheet: ReactNode;
} {
    void tone;
    const { isGuest } = useAuth();
    const [, setLocation] = useLocation();

    const guard = useCallback((run: () => void, o?: GuestGuardOptions) => {
        if (!isGuest) { run(); return; }
        // 가입·로그인 팝업을 그 자리에서 연다 — from 이 없으면 로그인 뒤 보던 곳에 그대로 남는다.
        // 못 열었으면(호스트가 아직 없다) 예전처럼 로그인 화면으로 보낸다.
        if (openLoginSheet({ from: o?.from, title: o?.title, desc: o?.desc })) return;
        goLoginPage(setLocation, o?.from);
    }, [isGuest, setLocation]);

    return { isGuest, guard, sheet: null };
}

/**
 * 예시 카드 위·아래에 붙이는 가입 유도 한 줄 — 문구 + "가입하고 시작하기" 단추(누르면 가입·로그인 팝업이 그 자리에서 올라온다).
 * title·desc 는 부르는 쪽이 번역해서 넘긴다. 좁은 화면에서 문구가 눌리면 단추가 아래 줄로 내려간다.
 */
export function GuestJoinCta({ tone = "light", title, desc, from, className }: {
    tone?: GuestTone; title: string; desc?: string; from?: string; className?: string;
}) {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const s = TONE[tone];
    return (
        <div className={cn("flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border px-3.5 py-3", s.cta, className)}>
            <div className="min-w-[150px] flex-1 text-left">
                <p className={cn("text-[13.5px] font-semibold leading-snug break-keep", s.ctaTitle)}>{title}</p>
                {desc && <p className={cn("mt-0.5 text-[12.5px] font-medium leading-snug break-keep", s.ctaDesc)}>{desc}</p>}
            </div>
            <button
                type="button"
                onClick={() => goLogin(setLocation, from)}
                className={cn("shrink-0 h-9 px-3.5 rounded-full text-[13px] font-bold active:scale-[0.97] transition-transform", s.primary)}
            >
                {t("guest.joinStart")}
            </button>
        </div>
    );
}
