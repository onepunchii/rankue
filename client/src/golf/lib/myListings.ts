/**
 * '내 예약' 이 쓰는 질의 열쇠와 '봤다' 표식(2026-09-23).
 *
 * 원래는 내역 시트(MyListingsSheet.tsx)가 들고 있었다. 시트를 페이지(/golf/my-bookings)로 옮기면서,
 * 목록 화면(BookingList)의 빨간 점만 이 조각들을 계속 쓰기 때문에 화면에서 떼어 여기로 내렸다 —
 * 페이지 하나를 지웠다고 다른 화면의 배지가 따라 죽으면 안 된다.
 */

export const MY_LISTINGS_QUERY_KEY = ["/api/hiq/golf/bookings", "mine"] as const;
export const MY_REQUESTS_QUERY_KEY = ["/api/hiq/golf/bookings", "applied"] as const;

const SEEN_KEY = "rankue_golf_requests_seen";

/** 마지막으로 내 신청 탭을 본 시각(epoch ms). 없으면 0. */
export function readRequestsSeen(): number {
    try { return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0; } catch { return 0; }
}

export function markRequestsSeen(): void {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* 저장소를 못 쓰는 환경 */ }
}

/** 안 본 변화가 있나 — 확정·거절이 마지막으로 본 뒤에 바뀐 신청. */
export function hasUnseenRequestChange(rows: readonly any[] | undefined, seenAt: number): boolean {
    return (rows ?? []).some((r) => (r.myJoinStatus === "accepted" || r.myJoinStatus === "rejected") && new Date(r.changedAt ?? 0).getTime() > seenAt);
}
