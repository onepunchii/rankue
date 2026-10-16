/**
 * 등산 정상 인증의 다시 볼 것(2026-10-17 어드민 › 등산 › 정상 인증 — "POST /summits 는 앱이 보낸 위경도를 그대로 믿는다").
 * 서버는 좌표를 남기지 않는다(거리 구간만) — 그래서 위치를 꾸몄는지는 **시간과 산의 자리**로만 본다. 판정이 아니라 사람이 다시 볼 것을 고르는 체. 순수 함수.
 *  - 한 사람이 하루(한국 날짜)에 정상 인증을 세 곳 넘게
 *  - 앞 인증의 산에서 이 산까지(정상끼리 직선) 시속 40km 넘게 — 산을 내려와 차로 옮겨 다시 올라도 어려운 빠르기
 *  - 서로 다른 두 산을 20분 안에
 */
export type SummitFlagId = "manyPerDay" | "tooFast" | "tooSoon";
export interface SummitFlag { id: SummitFlagId; text: string }

export const SUMMIT_FLAG_RULES = { perDay: 3, kmh: 40, minutes: 20 } as const;

export interface SummitFlagInput { id: string; memberId: string; mountainId: string; atMs: number; day: string }
export interface MountainSpot { name: string; lat: number | null; lng: number | null }

const R = 6371;
export function kmBetween(a: MountainSpot, b: MountainSpot): number | null {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** 인증 줄마다의 표시 — 같은 사람의 앞 인증과 견준다(인증한 줄만 넣는다) */
export function summitFlags(rows: readonly SummitFlagInput[], spots: ReadonlyMap<string, MountainSpot>): Map<string, SummitFlag[]> {
    const out = new Map<string, SummitFlag[]>();
    const byMember = new Map<string, SummitFlagInput[]>();
    for (const r of rows) byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);
    for (const list of byMember.values()) {
        const sorted = [...list].sort((a, b) => a.atMs - b.atMs);
        const perDay = new Map<string, number>();
        for (const r of sorted) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
        sorted.forEach((r, i) => {
            const flags: SummitFlag[] = [];
            const n = perDay.get(r.day) ?? 0;
            if (n > SUMMIT_FLAG_RULES.perDay) flags.push({ id: "manyPerDay", text: `이날 정상 인증 ${n}곳` });
            const prev = sorted[i - 1];
            if (prev && prev.mountainId !== r.mountainId) {
                const minutes = (r.atMs - prev.atMs) / 60_000;
                const a = spots.get(prev.mountainId), b = spots.get(r.mountainId);
                const km = a && b ? kmBetween(a, b) : null;
                if (km !== null && minutes > 0 && km / (minutes / 60) > SUMMIT_FLAG_RULES.kmh) {
                    flags.push({ id: "tooFast", text: `${a!.name}에서 ${Math.round(km)}km를 ${minutes < 120 ? `${Math.round(minutes)}분` : `${Math.round(minutes / 6) / 10}시간`} 만에` });
                } else if (minutes < SUMMIT_FLAG_RULES.minutes) {
                    flags.push({ id: "tooSoon", text: `${a?.name ?? "앞 산"} 인증 ${Math.max(0, Math.round(minutes))}분 뒤` });
                }
            }
            if (flags.length) out.set(r.id, flags);
        });
    }
    return out;
}

/** GET /admin/hiking/summits 의 한 줄 */
export interface AdminSummitRow {
    id: string; memberId: string; memberName: string; mountainId: string; mountainName: string; heightM: number | null;
    at: string; day: string; bucket: string | null;
    flags: SummitFlag[];
    /** 운영자가 인증을 취소한 줄 */
    voided: { at: string; reason: string; by: string } | null;
}
/** 취소하면 거둘 것 · 거둔 것(와펜 · 큰 와펜 · 핀 · 등급) */
export interface AdminHikingAwardLoss { kind: string; key: string; name: string }
