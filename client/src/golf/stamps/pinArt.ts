/**
 * 업적 핀의 그림(2026-10-12) — 어느 핀이 있는지 · 받는 조건은 shared/golfPins 가 정한다. 여기는 그림 주소와 숫자 판의 자리뿐.
 * 순수 값(화면 시험이 읽는다 — '@/…' 임포트 없음).
 */
export const pinSrc = (art: string) => `/golf/stamp-art/${art}.webp`;

/**
 * 타수 핀('100 깨기' …)의 숫자 판 — 그림에는 글자가 없고 코드가 숫자를 얹는다. 자리는 그림에서 찾은 값(그림 크기에 대한 비율),
 * 글자색은 판의 색(동 · 은 · 금)에 맞춘다.
 */
export const PIN_PLATE: Record<string, { x: number; y: number; w: number; h: number; ink: string }> = {
    "pin-break": { x: 0.1624, y: 0.7789, w: 0.6704, h: 0.1725, ink: "#FFF1DC" },
    "pin-break-silver": { x: 0.1475, y: 0.787, w: 0.705, h: 0.1672, ink: "#23272C" },
    "pin-break-gold": { x: 0.1436, y: 0.7897, w: 0.6936, h: 0.1551, ink: "#4A3200" },
};
