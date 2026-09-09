/**
 * 진입 화면 배색 — 검정 판(2026-09-08 오너가 샘플 셋 중 고름).
 * 테이블이 위를 가로로 꽉 채우고, 그 아래는 어두운 카드. 큰 숫자는 흰색, 노란색은 "코드로 참가"와 내 차례 배지에만,
 * 초록(brand)은 주 동작 버튼에만 둔다 — 배경을 초록으로 덮지 않으니 초록이 계속 "이걸 누르세요"로 읽힌다.
 * 색은 전부 토큰(공 노랑·brand)과 검정 한 가지. 그라디언트·발광은 쓰지 않는다.
 */
export interface EntryStyle {
    /** 화면 전체 바탕 */
    readonly page: string;
    readonly title: string;
    readonly close: string;
    /** 3D 테이블 자리 — 렌더러가 마운트 요소의 배경색으로 레터박스를 지우므로 반드시 불투명 색 */
    readonly showcase: string;
    readonly card: string;
    readonly cardTitle: string;
    readonly cardSub: string;
    readonly cardBig: string;
    readonly cardNote: string;
    readonly pill: string;
    readonly primary: string;
    readonly gap: string;
    /** "내 차례 n" 배지 */
    readonly badge: string;
    /** 그룹 펼침 화살표 — 색 클래스를 안 주면 바깥(밝은 테마)의 검은 글자색을 상속해 안 보인다. */
    readonly chevron: string;
}

export const ENTRY_STYLE: EntryStyle = {
    page: "bg-[#121412]",
    title: "text-white",
    close: "border border-white/25 text-white/90 active:bg-white/10",
    showcase: "relative h-[240px] -mx-5 w-[calc(100%+40px)] overflow-hidden bg-[#121412] mb-4",
    card: "rounded-card bg-white/[0.06] border border-white/10 overflow-hidden",
    cardTitle: "text-white",
    cardSub: "text-white/55",
    cardBig: "text-white",
    cardNote: "text-white/75",
    pill: "border border-white/15 bg-transparent text-white/85 active:bg-white/10",
    primary: "bg-brand text-brand-fg active:bg-brand-strong",
    gap: "gap-3",
    badge: "border border-ball-yellow text-ball-yellow",
    chevron: "text-white/70",
};
