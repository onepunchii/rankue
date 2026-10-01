/**
 * 골프 알림 조용한 시간 — 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *
 * 한국 시각 21시~08시에는 골프 푸시를 기기로 보내지 않는다. 규칙의 원본은 긴급 조인 방송이다
 * (server/routes/modules/golf.ts URGENT_PUSH_FROM_HOUR·URGENT_PUSH_UNTIL_HOUR, 2026-09-23 오너:
 * "밤엔 푸시를 안 보낸다 — 글은 그대로 올라가고 배지도 붙는다, 푸시만 건너뛴다").
 * 어드민의 '골프 알림 받는 회원' 발송도 같은 시간을 지킨다 — 조용한 시간에 보내면 알림함에만 넣고 기기는 울리지 않는다.
 *
 * 숫자가 golf.ts 와 두 벌이라(그 파일은 이번 작업 범위 밖) golfPushQuiet.test.ts 가 두 값이 같은지 지킨다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'(없으면 Vercel /api 전체 500).
 */
import { kstHour } from "./golfJoin.js";

/** 이 시각(한국)부터 골프 푸시를 기기로 보낸다 */
export const GOLF_PUSH_FROM_HOUR = 8;
/** 이 시각(한국)부터 다음 날 GOLF_PUSH_FROM_HOUR 전까지가 조용한 시간 */
export const GOLF_PUSH_UNTIL_HOUR = 21;

/** 지금이 골프 알림 조용한 시간인가(한국 21:00~07:59) */
export function isGolfQuietHour(ms: number): boolean {
    const h = kstHour(ms);
    return h < GOLF_PUSH_FROM_HOUR || h >= GOLF_PUSH_UNTIL_HOUR;
}
