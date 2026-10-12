import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGolfVisible } from "@/hooks/useGolfAccess";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { sportForPath } from "@shared/sportRoute";
import { useAuth } from "@/hooks/useAuth";

export type SportType = "BILLIARDS" | "GOLF";
/**
 * 등산(2026-10-13)이 세 번째 종목으로 들어왔다. 화면 대부분은 종목을 둘(당구 · 골프)로만 가른다(currentSport === "GOLF" 가 80곳쯤).
 * 그 자리를 한 번에 다 고치지 않는다 — currentSport 는 그대로 **둘 중 하나**로 두고(등산일 땐 당구), 등산을 아는 화면
 * (하단 탭 · 홈 · 크루 · 채팅 · 전체 메뉴)만 sport · isHiking 을 본다. 등산을 모르는 화면이 등산 값을 받고 깨지는 일이 없다.
 */
export type AppSport = SportType | "HIKING";

interface SportContextType {
    /** 당구 · 골프 둘 중 하나 — 등산일 때는 당구(등산을 모르는 화면이 쓰는 값) */
    currentSport: SportType;
    /** 지금의 종목(등산 포함) */
    sport: AppSport;
    isHiking: boolean;
    setSport: (sport: AppSport) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

const STORAGE_KEY = "rankue_current_sport";
/** 이 세션에 주 종목을 한 번 맞췄나 */
const BOOT_KEY = "rankue_primary_sport_applied";

function readSaved(): AppSport {
    try { const v = localStorage.getItem(STORAGE_KEY); return v === "GOLF" || v === "HIKING" ? v : "BILLIARDS"; } catch { return "BILLIARDS"; }
}

/**
 * 종목을 **직접 고른 것**(종목 알약 · 종목이 정해진 주소)을 이 세션에 남긴다 — 그 뒤에 로그인해도 주 종목이 그 선택을 덮지 않는다.
 * 2026-10-05: 홈을 비로그인에 열면서 방문자도 종목을 고를 수 있게 됐는데, 방문자일 땐 '나'가 없어 BOOT_KEY 가 찍히지 않았다.
 * 그래서 골프 홈을 둘러보다 '로그인'을 누른 주 종목 당구 회원이 보던 골프 홈이 아니라 당구 홈에 떨어졌다(반대도 같다).
 * 표시는 고른 때에만 찍는다 — '방문자였던 세션'이라고 찍으면 새 폰에서 로그아웃 상태로 연 골프 회원이 당구 홈에 떨어진다.
 * 회원은 '나'가 오는 순간 이미 찍혀 있어 달라지는 게 없다.
 */
function markSportChosen() {
    try { sessionStorage.setItem(BOOT_KEY, "1"); } catch { /* 저장소를 못 쓰는 환경 */ }
}

export function SportProvider({ children }: { children: React.ReactNode }) {
    // 골프는 허용된 사람만. 판단은 shared/golfAccess.ts 하나이고 서버도 같은 걸 쓴다.
    // 2026-10-05 오너 결정("홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") — 여기서 묻는 것은 '쓸 수 있는가'가 아니라
    // **'볼 수 있는가'**(useGolfVisible)다: 회원의 골프 허용 또는 한국어로 보는 비로그인 방문자. 방문자도 골프 홈을 예시 숫자로 둘러본다.
    //  - 회원에게는 예전 값(useGolfAccess)과 같다 — 골프 허용이 없는 회원·한국어가 아닌 사람은 그대로 당구.
    //  - 한국어 화면이면 로그인 확인을 기다리지 않는다 — 골프가 전면 공개(GOLF_PUBLIC)인 동안엔 회원으로 끝나든 방문자로 끝나든 볼 수 있어서
    //    첫 그림부터 저장된 종목을 쓴다. 기다리면 골프를 저장해 둔 방문자가 새로 열 때마다 당구 화면을 먼저 봤다가 골프로 뒤집힌다(useGolfVisible).
    //  - 쓰기와 골프 전용 화면의 문은 여전히 useGolfAccess 다(App.tsx GolfOnly) — 방문자는 거기서 로그인으로 간다.
    const golfVisible = useGolfVisible();
    const [location] = useLocation();
    // 등산은 허용된 회원만(지금은 운영자와 시험 계정 — useHikingAccess). 공개 산 화면(/hiking …)의 색은 허용과 무관하게 등산이다(주소가 이긴다).
    const hikingOk = useHikingAccess();
    const [saved, setSaved] = useState<AppSport>(readSaved);

    /**
     * 종목은 **주소가 먼저** 정한다(2026-09-21 오너: "검색에서 골프 선수로 들어오면 당구 UI 색상과 섞여 꼬인다").
     * 예전엔 저장된 선호(기본 당구)만 봐서, 네이버·구글에서 골프 선수 페이지로 바로 들어온 사람은 골프 내용 위에
     * 당구 테마·당구 하단 탭이 씌워졌다. 로그인 전이라 골프 허용(golfOk)도 false 였으니 저장값이 골프여도 당구였다.
     * 골프 선수·골프 랭킹은 공개 페이지라 **테마는 허용과 무관하게** 골프여야 한다(들어갈 수 있는지는 GolfOnly 가 따로 막는다).
     * 두 종목이 함께 쓰는 화면(/dashboard·/menu…)에서는 저장된 선호를 쓰되, 골프를 볼 수 없는 사람이면 당구로 본다.
     */
    const routeSport = sportForPath(location);
    // 관리자·사장님 콘솔은 밝은 화면 한 가지로 만든 화면이다 — 운영자가 골프 모드였다고 골프 테마가 흰 카드·회색 글자를
    // 바꿔 끼우면 콘솔이 깨진다(2026-10-01 골프 관리 화면 조사). 색만 당구(기본)로 두고, 저장된 선호는 건드리지 않는다.
    // 로그인·가입 화면(/ · /hiq · /register)도 같은 이유로 밝은 화면 한 가지(2026-10-01 오너: "골프로 들어오면 로그인 화면 색이 이상하다").
    // 골프로 들어온 사람에겐 화면이 강조색만 라임으로 바꾼다(landing.tsx) — 테마 전체를 덮어씌우지 않는다.
    // 약관·개인정보처리방침·고객지원·계정삭제도 밝은 화면 한 가지다(뿌리가 bg-white + text-gray-*): 골프 테마는 흰 바탕만 어둡게 바꾸고
    // 회색 글자는 그대로 둬서 검정 바탕에 검정 글자가 된다. 2026-10-05 홈을 비로그인에 열면서 골프를 보던 방문자가 가입 화면의
    // '보기'(/privacy)에서 이 화면을 만나게 됐다 — 골프 모드 회원이 설정·동의 시트에서 열 때도 같아서 조건 없이 당구(기본)색으로 둔다.
    // 카카오 로그인에서 돌아오는 화면(/auth/kakao, 2026-10-05)도 로그인 화면과 같은 밝은 화면 한 가지다.
    const consolePath = /^\/(admin|partner|register|terms|privacy|support|account-delete|auth)(\/|$|\?)/.test(location) || location === "/" || location === "/hiq";
    const sport: AppSport = consolePath ? "BILLIARDS" : routeSport ?? (saved === "HIKING" ? (hikingOk ? "HIKING" : "BILLIARDS") : golfVisible ? saved : "BILLIARDS");
    const currentSport: SportType = sport === "HIKING" ? "BILLIARDS" : sport;

    // 주 종목(2026-10-01) — 앱을 열 때(세션마다 한 번) 회원이 고른 종목으로 시작한다. 폰을 바꾸거나 다시 깔아도 골프 회원은 골프로.
    // 세션 안에서 사용자가 종목을 바꾸면 그대로 둔다(한 번만 맞춘다). 주소가 종목을 정하는 화면은 위에서 이미 주소가 이긴다.
    const { member } = useAuth();
    const primary = (member as { primarySport?: string | null } | undefined)?.primarySport;
    useEffect(() => {
        // 등산으로 시작하기는 등산을 쓸 수 있는 회원만(허용이 풀린 회원은 당구 · 골프의 저장값 그대로)
        if (primary !== "GOLF" && primary !== "BILLIARDS" && !(primary === "HIKING" && hikingOk)) return;
        try {
            if (sessionStorage.getItem(BOOT_KEY)) return;
            sessionStorage.setItem(BOOT_KEY, "1");
        } catch { return; }
        if (primary !== saved) {
            setSaved(primary);
            try { localStorage.setItem(STORAGE_KEY, primary); } catch { /* 저장소를 못 쓰는 환경 */ }
        }
    }, [primary, hikingOk]); // eslint-disable-line react-hooks/exhaustive-deps

    // 종목이 정해진 주소로 들어왔으면 그게 곧 선택이다 — 골프 선수 페이지에서 '홈'을 누르면 골프 홈으로 이어져야지,
    // 당구 홈으로 튀면 "골프 앱인 줄 알았는데" 가 된다. 반대(당구 전용 주소)도 같다.
    useEffect(() => {
        if (!routeSport) return;
        // 등산을 쓸 수 없는 사람이 공개 산 화면(/hiking …)을 본 것은 종목을 고른 것이 아니다 — 저장된 종목(당구 · 골프)을 덮지 않는다.
        // 덮으면 산 화면을 구경한 골프 회원이 홈으로 돌아갈 때 당구 홈에 떨어진다.
        if (routeSport === "HIKING" && !hikingOk) return;
        // 저장값과 같을 때도 남긴다 — 골프가 이미 저장돼 있던 방문자가 골프 주소로 들어와 로그인해도 주 종목이 덮지 않게(markSportChosen)
        markSportChosen();
        if (routeSport !== saved) {
            setSaved(routeSport);
            try { localStorage.setItem(STORAGE_KEY, routeSport); } catch { /* 저장소를 못 쓰는 환경 */ }
        }
    }, [routeSport, saved, hikingOk]);

    // 토큰 층을 갈아 끼우는 스위치. index.css 의 [data-sport="GOLF"] 가 이 값을 본다.
    // 그리기 전에(useLayoutEffect) 붙여야 골프 주소로 들어온 첫 화면이 당구색으로 한 번 번쩍이지 않는다.
    // 등산은 어두운 화면이라 골프의 어두운 층(공용 화면의 흰 카드 · 검정 글씨를 토큰으로 되받는 다리 — index.css)을 그대로 타고,
    // 그 위에 data-skin="hiking" 으로 색만 등산의 것(짙은 청록 + 산호빛)으로 갈아 끼운다. 다리를 두 벌 만들지 않기 위해서다.
    useLayoutEffect(() => {
        document.documentElement.setAttribute("data-sport", sport === "HIKING" ? "GOLF" : sport);
        if (sport === "HIKING") document.documentElement.setAttribute("data-skin", "hiking"); else document.documentElement.removeAttribute("data-skin");
        return () => { document.documentElement.removeAttribute("data-sport"); document.documentElement.removeAttribute("data-skin"); };
    }, [sport]);

    const setSport = (picked: AppSport) => {
        // 골프를 볼 수 없는 사람이 골프를 고르면 당구로 되돌린다. 한국어 비로그인 방문자는 볼 수 있으므로 머리줄의 종목 알약이 그대로 동작한다.
        // 등산도 같다 — 허용되지 않은 사람이 고르면 당구로.
        const next: AppSport = (picked === "GOLF" && !golfVisible) || (picked === "HIKING" && !hikingOk) ? "BILLIARDS" : picked;
        setSaved(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 저장소를 못 쓰는 환경 */ }
        // 직접 고른 종목 — 이 세션에서는 뒤에 로그인해도 주 종목이 이 선택을 덮지 않는다
        markSportChosen();
    };

    return (
        <SportContext.Provider value={{ currentSport, sport, isHiking: sport === "HIKING", setSport }}>
            {children}
        </SportContext.Provider>
    );
}

export function useSport() {
    const context = useContext(SportContext);
    if (context === undefined) {
        throw new Error("useSport must be used within a SportProvider");
    }
    return context;
}
