/**
 * 방문자 발자국에 "무엇이 열렸다"를 남기는 손잡이(2026-10-08). 수집기(components/hiq/Tracker)가 듣는다.
 * 화면 이동·누름·스크롤은 수집기가 알아서 줍는다 — 여기는 주소가 바뀌지 않는 큰 일(가입 창이 열렸다)만.
 * 규칙·남기지 않는 것은 shared/uiTrail 머리말.
 */
export const TRAIL_EVENT = "rankue:trail";

/** label = 관리자 화면에 그대로 보일 말("가입 창"). 실패해도 화면에는 아무 영향이 없어야 한다 */
export function trailOpen(label: string): void {
    try { window.dispatchEvent(new CustomEvent(TRAIL_EVENT, { detail: { l: label } })); } catch { /* 수집은 부가 기능 */ }
}
