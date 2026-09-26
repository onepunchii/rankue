// 크루 투표 규칙 — 서버(생성 검증·목록의 isClosed)와 화면(카드·만들기 창)이 같은 판정을 쓴다.
//
// 마감 판정의 정본은 endTime 이다. status 는 예전엔 어디서도 'closed' 로 바뀌지 않아서
// "마감됨"이 영영 안 떴다(2026-09-26 검토 P0). 지금은 '일찍 마감'이 status 를 closed 로 바꾸면서
// endTime 도 그 순간으로 당긴다 — 그래서 둘 중 하나만 봐도 되지만, 옛 행을 위해 둘 다 본다.
import { DAY_MS } from "./crewTime.js";

export const POLL_LIMITS = {
    minOptions: 2,
    maxOptions: 10,
    optionMax: 60,
    titleMax: 100,
    descMax: 500,
    /** 마감은 최대 60일 뒤까지 — 그보다 긴 투표는 사실상 잊힌다. */
    maxDays: 60,
} as const;

export function isPollClosed(poll: { status?: string | null; endTime?: Date | string | null }, now: Date | number = Date.now()): boolean {
    if (poll.status === "closed") return true;
    if (!poll.endTime) return false;
    const end = new Date(poll.endTime).getTime();
    return !Number.isNaN(end) && end <= (typeof now === "number" ? now : now.getTime());
}

/**
 * 선택지별 비율(%). 분모는 **투표한 사람 수**다 — 복수 선택에서 표 수를 분모로 쓰면
 * 10명 중 10명이 고른 선택지가 50%로 보인다. 그래서 복수 선택은 비율 합이 100을 넘을 수 있다(정상).
 */
export function voterPercent(voteCount: number, voterCount: number): number {
    if (!voterCount || voterCount <= 0 || !voteCount) return 0;
    return Math.min(100, Math.round((voteCount / voterCount) * 100));
}

/** 1위 선택지 id — 동점이면 없음(여러 개에 '1위'가 붙으면 결과가 흐려진다). */
export function uniqueLeaderId(options: Array<{ id: string; voteCount: number }>): string | null {
    let best: { id: string; voteCount: number } | null = null;
    let tie = false;
    for (const o of options) {
        const n = o.voteCount || 0;
        if (!best || n > best.voteCount) { best = { id: o.id, voteCount: n }; tie = false; }
        else if (n === best.voteCount) tie = true;
    }
    return best && best.voteCount > 0 && !tie ? best.id : null;
}

export type PollOptionsError = "count" | "tooLong" | "duplicate";

/**
 * 선택지 정리 — 앞뒤 공백 제거, 빈 칸 제거, 대소문자·공백만 다른 중복 거절, 길이·개수 확인.
 * 중복을 조용히 합치지 않고 거절하는 이유: 쓴 사람은 둘이라고 생각하고 만들었는데 하나만 올라가면 헷갈린다.
 */
export function normalizePollOptions(raw: unknown): { ok: true; options: string[] } | { ok: false; reason: PollOptionsError } {
    if (!Array.isArray(raw)) return { ok: false, reason: "count" };
    const options = raw
        .map((o) => (typeof o === "string" ? o : o == null ? "" : String(o)).replace(/\s+/g, " ").trim())
        .filter((o) => o.length > 0);
    if (options.length < POLL_LIMITS.minOptions || options.length > POLL_LIMITS.maxOptions) return { ok: false, reason: "count" };
    if (options.some((o) => o.length > POLL_LIMITS.optionMax)) return { ok: false, reason: "tooLong" };
    const seen = new Set<string>();
    for (const o of options) {
        const key = o.toLocaleLowerCase();
        if (seen.has(key)) return { ok: false, reason: "duplicate" };
        seen.add(key);
    }
    return { ok: true, options };
}

export type PollEndTimeError = "invalid" | "past" | "tooFar";

/** 마감 시각 확인. 없으면(null) 마감 없는 투표로 허용한다 — 옛 화면·API 호환. */
export function checkPollEndTime(endTime: unknown, now: number = Date.now()): { ok: true; endTime: Date | null } | { ok: false; reason: PollEndTimeError } {
    if (endTime == null || endTime === "") return { ok: true, endTime: null };
    const d = new Date(endTime as any);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: "invalid" };
    // 1분 여유 — 만들기 버튼을 누르는 사이 '오늘 23:59'가 지나가는 경계만 봐준다.
    if (d.getTime() < now - 60_000) return { ok: false, reason: "past" };
    if (d.getTime() > now + POLL_LIMITS.maxDays * DAY_MS) return { ok: false, reason: "tooFar" };
    return { ok: true, endTime: d };
}
