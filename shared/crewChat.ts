/**
 * 크루 채팅의 정모 띠·정모 카드 규칙(2026-09-26 크루 채팅 1단계, 오너 승인 시안).
 * 화면(채팅 윗줄 띠·카드)이 같은 판정을 쓰도록 순수 계산만 둔다(테스트 동반).
 */
import { activityCapacity, activityPhase, type ActivityPhase } from "./crewActivity.js";

const KST = 9 * 3600_000;
const DAY = 86_400_000;

/** 한국 날짜로 며칠 뒤인가(오늘 0, 내일 1, 어제 -1). 날짜가 이상하면 null. */
export function kstDayDiff(at: string | Date | null | undefined, now: number = Date.now()): number | null {
    if (!at) return null;
    const t = new Date(at).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.floor((t + KST) / DAY) - Math.floor((now + KST) / DAY);
}

/** 띠의 D-day 한 낱말 — 진행 중·오늘은 "today", 그 뒤는 D-n. */
export function meetupDday(at: string | Date | null | undefined, now: number = Date.now()): { kind: "today" } | { kind: "dday"; n: number } | null {
    const diff = kstDayDiff(at, now);
    if (diff === null) return null;
    return diff <= 0 ? { kind: "today" } : { kind: "dday", n: diff };
}

interface ActivityLike {
    id: string;
    activityDate: string | Date;
    maxParticipants?: number | null;
    participants?: Array<{ memberId: string; status?: string | null }> | null;
}

/** 참석 상태 — 대기(waiting)는 참석 수에 넣지 않는다(서버 joinCrewActivity 와 같은 셈). */
export function meetupRsvp(a: ActivityLike, meId: string | null | undefined, now: Date = new Date()): {
    count: number; cap: number | null; joined: boolean; full: boolean; phase: ActivityPhase;
} {
    const people = (a.participants ?? []).filter((p) => (p.status ?? "joined") === "joined");
    const cap = activityCapacity(a.maxParticipants);
    const joined = !!meId && (a.participants ?? []).some((p) => p.memberId === meId);
    return { count: people.length, cap, joined, full: cap !== null && people.length >= cap, phase: activityPhase(a.activityDate, now) };
}

/**
 * 띠에 올릴 정모 — 다가오는(진행 중 포함) 목록에서 가장 이른 것. 목록은 서버가 시각 순으로 주지만
 * 캐시가 섞일 수 있어 여기서 한 번 더 고른다. 지난 정모는 띠에 올리지 않는다.
 */
export function nextMeetup<T extends ActivityLike>(list: readonly T[] | null | undefined, now: Date = new Date()): T | null {
    let best: T | null = null;
    for (const a of list ?? []) {
        if (activityPhase(a.activityDate, now) === "past") continue;
        if (!best || new Date(a.activityDate).getTime() < new Date(best.activityDate).getTime()) best = a;
    }
    return best;
}
