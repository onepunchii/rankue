/**
 * 어드민 · 회원 상세의 '최근 30일 접속' 띠(2026-11-18 오너: "언제언제 들어왔는지") — 하루 한 칸, 들어온 날만 칠한다.
 *
 * 자료는 hiq_app_sessions 하나다(앱 · 로그인한 웹 모두 여기 남는다 — '7일 접속' 칸과 같은 근거).
 * 날짜는 한국 날짜 글자("2026-11-18")로만 주고받는다. 질의는 server/storage/adminMemberActivity 의 getMemberVisitDaysForAdmin.
 */
import { activityFromDay, activitySinceIso } from "./memberActivity.js";

export const VISIT_STRIP_DAYS = 30;

export interface VisitDayRow { day: string; n: number }
export interface VisitCell {
    /** 한국 날짜 */
    day: string;
    /** 그날 연 횟수(세션 수). 0 = 안 들어옴 */
    n: number;
    /** 가입하기 전의 날 — 빈 칸과 다르게 그린다 */
    before: boolean;
}
export interface VisitStrip {
    /** 옛날 → 오늘 순서, VISIT_STRIP_DAYS 칸 */
    cells: VisitCell[];
    /** 들어온 날 수 */
    activeDays: number;
    /** 가장 최근에 들어온 날(없으면 null) */
    lastDay: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 띠의 첫 칸(한국 날짜)과 질의에 넣을 시작 시각(UTC ISO) */
export function visitStripSince(now: Date): { sinceIso: string; fromDay: string } {
    const sinceIso = activitySinceIso(now, VISIT_STRIP_DAYS);
    return { sinceIso, fromDay: activityFromDay(sinceIso) };
}

/** 질의 결과(들어온 날만) → 30칸. joinedDay 는 가입한 한국 날짜(모르면 null) */
export function buildVisitStrip(rows: VisitDayRow[], fromDay: string, joinedDay: string | null = null): VisitStrip {
    const counts = new Map<string, number>();
    for (const r of rows) if (/^\d{4}-\d{2}-\d{2}$/.test(r.day) && r.n > 0) counts.set(r.day, (counts.get(r.day) ?? 0) + r.n);
    const start = Date.parse(`${fromDay}T00:00:00Z`);
    const cells: VisitCell[] = [];
    for (let i = 0; i < VISIT_STRIP_DAYS; i++) {
        const day = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
        const n = counts.get(day) ?? 0;
        cells.push({ day, n, before: n === 0 && !!joinedDay && day < joinedDay });
    }
    const on = cells.filter((c) => c.n > 0);
    return { cells, activeDays: on.length, lastDay: on.length ? on[on.length - 1].day : null };
}

/** 칸에 붙이는 설명 — "11월 12일(수) · 3번" / "11월 13일(목) · 안 들어옴" */
export function visitCellLabel(c: VisitCell): string {
    const [, m, d] = c.day.split("-").map(Number);
    const wd = WEEKDAY[new Date(`${c.day}T00:00:00Z`).getUTCDay()];
    const tail = c.n > 0 ? `${c.n}번` : c.before ? "가입 전" : "안 들어옴";
    return `${m}월 ${d}일(${wd}) · ${tail}`;
}
