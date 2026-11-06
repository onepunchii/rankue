/**
 * 이 기기의 '지금 여기서 친다'(2026-11-06 — shared/storeVenue). 테이블 QR 이 적고, 점수판 경기를 만들 때 실어 보낸다.
 * 몇 시간 지나면 저절로 버려진다(VENUE_MAX_MS). 손님이 매장을 떠났으면 점수판 만들기 창의 ✕ 로 지운다.
 */
import { VENUE_KEY, venueRead, venueRecord, type Venue } from "@shared/storeVenue";

export function rememberVenue(v: Venue): void {
    try { localStorage.setItem(VENUE_KEY, venueRecord(v, Date.now())); } catch { /* 적지 못해도 경기는 만들어진다 — 장소만 빈다 */ }
}

export function currentVenue(): Venue | null {
    try { return venueRead(localStorage.getItem(VENUE_KEY), Date.now()); } catch { return null; }
}

export function clearVenue(): void {
    try { localStorage.removeItem(VENUE_KEY); } catch { /* 오래되면 버려진다 */ }
}
