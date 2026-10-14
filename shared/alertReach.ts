/**
 * 알림이 닿는가 — 웹 회원에게 앱을 권하는 때(2026-10-14 오너: "골프 웹 가입자가 많은데 앱으로 연결이 잘 안 되네 —
 * 취소티 알림이나 알림이 필요한 버튼을 누르면 앱 다운로드 배너 띄울까?" → "응 진행").
 *
 * 푸시는 랭큐 앱에서만 울린다(웹 푸시 없음). 운영 실측(10/14): 관심 골프장을 켠 23명 중 푸시가 닿는 사람 3명 — 나머지는 켰다고 믿지만 울리지 않는다.
 * 그래서 두 자리에서 권한다:
 *   1. 알림을 켠 그 순간 — 설치 팝업(components/hiq/AppInstallSheet)을 '알림' 판으로 바로 띄운다. 한 방문에 한 번(그다음은 토스트).
 *   2. 알림을 켜 두었거나 크루에 들어 있는데 푸시가 닿지 않는 웹 회원 — 네 종목의 홈 · 알림함 위의 띠 한 줄. 닫으면 사흘 쉰다.
 *   (크루 가입 · 모임 참석의 순간에도 1처럼 — 당구 · 등산 · 낚시 · 골프 모두 같은 크루 화면이다)
 * 단추를 막지는 않는다(웹에서도 알림은 켜지고 알림함에 남는다).
 * ⚠️ 서버가 부를 수 있게 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */

/** GET /api/hiq/golf-courses/alerts/reach 의 답 */
export interface AlertReach { watches: number; areas: number; push: boolean; /** 들어 있는 크루 수(대기 제외) — 크루 채팅 · 모임 알림이 푸시로 온다(2026-10-14 오너: "당구 · 등산 및 낚시도 앱 유도") */ crews?: number }

export const ALERT_STRIP_REST_DAYS = 3;
/** 띠를 닫은 때(localStorage) */
export const ALERT_STRIP_KEY = "rankue_alert_strip_closed_at";
/** 이번 방문에 '알림' 판 설치 팝업을 이미 보여 줬다(sessionStorage) */
export const ALERT_INSTALL_SESSION_KEY = "rankue_alert_install_shown";

/**
 * 띠를 보일까 — 앱 밖이고, 켜 둔 알림이나 들어 있는 크루가 있고, 이 회원에게 푸시가 닿지 않고, 요즘 닫지 않았을 때.
 * kind: 'alerts' 면 "켜 둔 알림 N개", 'crews' 면 "크루 N곳의 채팅 · 모임 알림"(켜 둔 알림이 먼저다).
 */
export function alertStripPlan(r: AlertReach | null | undefined, o: { native: boolean; closedAt: number | null; now: number }): { show: boolean; count: number; kind: "alerts" | "crews" } {
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    const alerts = n(r?.watches) + n(r?.areas), crews = n(r?.crews);
    const kind = alerts > 0 ? "alerts" : "crews", count = alerts > 0 ? alerts : crews;
    const rested = o.closedAt == null || !Number.isFinite(o.closedAt) || o.now - o.closedAt >= ALERT_STRIP_REST_DAYS * 86_400_000;
    return { show: !o.native && !!r && !r.push && count > 0 && rested, count, kind };
}

/** 알림을 켠 순간의 팝업 제목 — "강남300 취소티 알림은 앱에서 울려요" · 이름을 모르면 끝난 일 한 줄 뒤에 */
export function alertInstallTitle(what: string | null | undefined, done: string): string {
    const w = String(what ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
    return w ? `${w} 알림은 앱에서 울려요` : `${done} — 알림은 앱에서 울려요`;
}
