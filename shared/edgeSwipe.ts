/**
 * 아이폰 앱의 '밀어서 뒤로'(2026-10-08 오너: "아이폰은 안드로이드와 달리 시스템 뒤로가기 버튼이 없잖아 — 우리 페이지에 뒤로가기 안 되어
 * 있으면 어떻게 돼?").
 *
 * 확인해 보니 답은 "갇힌다"였다: 아이폰에는 하드웨어 뒤로가기가 없고, 우리 앱의 웹뷰는 화면 가장자리를 밀어 뒤로 가는 동작도 꺼져 있다
 * (WKWebView 기본값 — 켜려면 새 앱 빌드가 필요하다). 화면에 뒤로 단추도 하단 탭도 없으면 앱을 껐다 켜는 수밖에 없었다.
 * 그래서 웹에서 직접 받는다 — 왼쪽 가장자리에서 오른쪽으로 밀면 '뒤로'. 새 빌드 없이 지금 깔린 앱에 바로 닿는다.
 * 안드로이드 하드웨어 뒤로가기와 **같은 길**을 탄다(떠 있는 팝업 → 화면이 건 핸들러 → 히스토리 — client lib/nativeBridge).
 *
 * 여기는 셈만 둔다(시험할 수 있게). 손가락 이벤트를 듣는 쪽은 nativeBridge.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙) — 이 파일은 아무것도 임포트하지 않는다.
 */

/** edge 왼쪽 가장자리에서 이 안(px)에서 시작해야 한다 · dist 오른쪽으로 이만큼(px) · slope 세로로 샌 정도(세로/가로) 한도 · maxMs 이 시간 안에 */
export const EDGE_SWIPE = { edge: 24, dist: 72, slope: 0.6, maxMs: 700 } as const;

export interface TouchPoint { x: number; y: number; t: number }

/** 가장자리에서 시작한 손가락인가 */
export const startsAtEdge = (x: number): boolean => x >= 0 && x <= EDGE_SWIPE.edge;

/** 왼쪽 가장자리에서 오른쪽으로 민 것인가(뒤로) — 세로 스크롤·길게 누르기·느린 끌기는 아니다 */
export function isEdgeSwipeBack(start: TouchPoint, end: TouchPoint): boolean {
    if (!startsAtEdge(start.x)) return false;
    const dx = end.x - start.x, dy = Math.abs(end.y - start.y), dt = end.t - start.t;
    return dx >= EDGE_SWIPE.dist && dy <= dx * EDGE_SWIPE.slope && dt >= 0 && dt <= EDGE_SWIPE.maxMs;
}

/**
 * 밀어서 뒤로를 받지 않는 화면 — 가장자리에서 시작하는 조작이 있는 게임 화면(조준·스윙·점수판).
 * 그 화면들은 자기 나가기 단추·확인 창이 있다.
 */
export const EDGE_SWIPE_OFF_PATH = /^\/(online-game|game\/|golf\/game\/|golf\/(?:play|minigolf|arcade|range)(?:\/|$))/;
