import { SportHeader } from "@/components/hiq/SportHeader";

interface GolfHeaderProps {
    member: any;
}

/**
 * 골프 홈 머리줄 — 세 종목이 같이 쓰는 머리줄(SportHeader: 워드마크 · 종목 전환 · 알림 · 전체)을 그대로 쓴다.
 * 2026-10-13 오너: "헤더가 다 따로따로잖아 — 등산 헤더로 통일하자 · 골프는 주황색". 예전의 흰 알약 · 라임 종 · ≡ 단추는 SportHeader 로 옮겼다.
 * 비로그인에게는 종 자리에 "로그인" 단추가 놓인다(알림 수도 부르지 않는다) — SportHeader 가 맡는다.
 */
export function GolfHeader({ member: _member }: GolfHeaderProps) {
    // 화면의 옆 여백(p-6)을 벗어나 조금 넓게 — 종목 셋 · 알림 · 전체가 폭 360 에 한 줄로 들어가게
    return <SportHeader sport="GOLF" className="-mx-6 px-3 -mt-2 mb-6" />;
}
