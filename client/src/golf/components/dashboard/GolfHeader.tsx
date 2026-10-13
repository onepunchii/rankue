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
    // 화면의 여백(p-6)을 벗어나 끝에서 끝까지, 맨 위부터 — 세 종목의 머리줄이 같은 자리 · 같은 크기다(치수는 SportHeader 한 곳에 있다)
    return <SportHeader sport="GOLF" bleed={24} lift={24} className="mb-5" />;
}
