/**
 * 어드민 › 등산 › 현황(2026-10-17 어드민 전수 조사 — "등산 현황 · 산악회 보기 · 전날 브리핑 크론 실패를 모른다"). 화면과 서버가 같이 쓰는 모양.
 * 좌표는 싣지 않는다(정상 인증도 거리 구간만 남긴다) — 숫자 · 산 이름 · 산악회 이름만.
 */
export interface HikingOverview {
    totals: {
        summits: number; summitMembers: number; records: number; trips: number; reachedTrips: number;
        photos: number; publicPhotos: number; hiddenPhotos: number; awards: number; primaryMembers: number;
        crews: number; crewMembers: number;
    };
    /** 최근 30일(한국 날짜) — 정상 인증 · 기록 · 산행 · 사진 */
    days: { day: string; summits: number; records: number; trips: number; photos: number }[];
    /** 최근 30일 많이 오른 산 */
    mountains: { id: string; name: string; slug: string; summits: number; records: number }[];
    crews: {
        id: string; name: string; members: number;
        next: { title: string; at: string; mountain: string | null } | null;
        lastAt: string | null;
        /** 함께 정상 인증한 산(같은 날 둘 이상) */
        together: number;
    }[];
    /** 산행 전날 저녁 브리핑 — 최근 실행(보낼 시간에 돈 것과 실패만 적힌다) */
    eveRuns: { at: string; ok: boolean; trips: number; people: number; sent: number; failed: number; error: string | null }[];
}

/** 막대 높이 — 30일 가운데 가장 큰 날을 꽉 차게 */
export const barScale = (values: readonly number[]) => Math.max(1, ...values);

/** 30일 줄 — 빈 날도 0 으로 채운다(한국 날짜, 오래된 날부터) */
export function fillDays<T extends { day: string }>(rows: readonly T[], todayKst: string, n: number, blank: (day: string) => T): T[] {
    const by = new Map(rows.map((r) => [r.day, r]));
    const [y, m, d] = todayKst.split("-").map(Number);
    const out: T[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const t = new Date(Date.UTC(y, m - 1, d - i));
        const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
        out.push(by.get(key) ?? blank(key));
    }
    return out;
}
