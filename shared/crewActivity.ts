/**
 * 크루 정모·홈 요약의 순수 규칙(2026-09-26 크루 디자인·기능 정리). 서버(목록 자르기)와 화면(카드 상태)이 같은 창을 쓰게 여기 둔다.
 */

/**
 * 정모는 시작 시각에 목록에서 사라졌다(서버가 activity_date >= now 만 줬다). 모이는 중에 "오늘 정모 어디였지" 를
 * 볼 수 없었고, 화면의 '종료' 분기는 영영 안 탔다. 시작 뒤 이만큼은 '진행 중' 으로 남긴다.
 */
export const ACTIVITY_ONGOING_HOURS = 4;
const HOUR = 60 * 60 * 1000;

/** 다가오는 목록에 남길 기준 시각(= 지금 − 진행 중 창). 이보다 늦게 시작한 정모만 '다가오는' 쪽이다. */
export function upcomingActivityCutoff(now: Date = new Date()): Date {
    return new Date(now.getTime() - ACTIVITY_ONGOING_HOURS * HOUR);
}

export type ActivityPhase = "upcoming" | "ongoing" | "past";

export function activityPhase(activityDate: string | Date | null | undefined, now: Date = new Date()): ActivityPhase {
    const t = activityDate ? new Date(activityDate).getTime() : NaN;
    if (!Number.isFinite(t)) return "upcoming";
    if (t > now.getTime()) return "upcoming";
    if (t > upcomingActivityCutoff(now).getTime()) return "ongoing";
    return "past";
}

/**
 * 정원. DB 기본값은 8 이지만 옛 행은 null — 서버(joinCrewActivity)는 null 을 999(사실상 무제한)로 본다.
 * 화면은 null 을 8 로 보고 '마감' 을 띄우거나 "/ null" 을 찍었다 → 둘 다 '제한 없음' 으로 맞춘다.
 */
export function activityCapacity(max: unknown): number | null {
    const n = Number(max);
    return max != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function isActivityFull(joined: number, max: unknown): boolean {
    const cap = activityCapacity(max);
    return cap !== null && joined >= cap;
}

// --- 정모 종류 라벨 ---

// 값은 화면 i18n 키. 정모 만들기 창의 종류 고르기와 같은 문구를 쓴다.
const ACTIVITY_CATEGORY_KEYS: Record<string, string> = {
    REGULAR_BILLIARDS: "billiardsCategorySelector.regularLabel",
    BLITZ_BILLIARDS: "billiardsCategorySelector.blitzLabel",
    BILLIARDS_TOURNAMENT: "billiardsCategorySelector.tournamentLabel",
    AFTER_PARTY: "categorySelector.afterParty",
    REGULAR_ROUNDING: "categorySelector.regularRounding",
    BLITZ_ROUNDING: "categorySelector.blitzRounding",
    GOLF_TOUR: "categorySelector.golfTour",
    REGULAR_SCREEN: "categorySelector.regularScreen",
    BLITZ_SCREEN: "categorySelector.blitzScreen",
};

/** 정모 카드의 종류 라벨 키. 종류 없는 옛 정모는 null(화면은 라벨을 그리지 않는다). */
export function activityCategoryLabelKey(category: unknown): string | null {
    return typeof category === "string" ? ACTIVITY_CATEGORY_KEYS[category] ?? null : null;
}

// --- 골프 투어 종료일 ---

/**
 * 투어 종료일은 컬럼이 없어 설명 끝에 "---\n<라벨> M/d ~ M/d" 로 붙여 저장해 왔다. 수정 창이 이걸 다시 읽지 않아
 * 종료일이 사라졌고, 저장할 때마다 같은 꼬리가 한 줄씩 더 붙었다. 꼬리를 떼어 읽고, 저장할 땐 한 번만 붙인다.
 * 라벨은 언어마다 달라서(예전 꼬리에는 이모지도 있다) 숫자 모양만 본다.
 */
const TOUR_TRAILER_RE = /\s*\n?---\n[^\n]*?(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})[^\n]*$/;

export function splitTourTrailer(description: string | null | undefined): { body: string; endMonth: number | null; endDay: number | null } {
    let body = description ?? "";
    let endMonth: number | null = null;
    let endDay: number | null = null;
    // 예전 버그로 꼬리가 여러 번 붙은 행 — 전부 떼고 마지막(가장 바깥) 날짜를 쓴다.
    for (let guard = 0; guard < 20; guard++) {
        const m = TOUR_TRAILER_RE.exec(body);
        if (!m) break;
        if (endMonth === null) { endMonth = Number(m[3]); endDay = Number(m[4]); }
        body = body.slice(0, m.index);
    }
    return { body: body.replace(/\s+$/, ""), endMonth, endDay };
}

/** 꼬리의 M/d 를 시작일 기준 날짜로 되살린다 — 해를 넘기는 투어(12/30 ~ 1/2)는 다음 해. */
export function tourEndDate(start: Date, endMonth: number | null, endDay: number | null): Date | undefined {
    if (!endMonth || !endDay) return undefined;
    let d = new Date(start.getFullYear(), endMonth - 1, endDay);
    if (d.getTime() < new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) {
        d = new Date(start.getFullYear() + 1, endMonth - 1, endDay);
    }
    return d;
}

export function withTourTrailer(body: string, label: string, start: Date, end: Date | undefined): string {
    const clean = splitTourTrailer(body).body;
    if (!end) return clean;
    const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const trailer = `---\n${label} ${md(start)} ~ ${md(end)}`;
    return clean ? `${clean}\n\n${trailer}` : trailer;
}

// --- 투표 요약 ---

/**
 * 투표가 끝났나. 서버 status 는 만들 때 'active' 로 들어간 뒤 바뀌지 않아 홈 요약이 영원히 '진행중' 이었다.
 * 서버가 isClosed 를 내려 주면 그걸 믿고, 없으면 마감 시각으로 판단한다.
 */
export function isPollClosed(poll: { isClosed?: boolean | null; endTime?: string | Date | null; status?: string | null } | null | undefined, now: Date = new Date()): boolean {
    if (!poll) return false;
    if (poll.isClosed === true) return true;
    if (poll.status === "closed" || poll.status === "ended") return true;
    if (poll.endTime) {
        const t = new Date(poll.endTime).getTime();
        if (Number.isFinite(t) && t < now.getTime()) return true;
    }
    return false;
}

// --- 알림 문구의 시각 ---

const KST_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/**
 * 푸시 본문의 정모 시각 "9/27 19:00"(한국 시각). 예전엔 서버에서 toLocaleString("ko-KR") 로 찍었는데
 * 서버(Vercel)는 UTC 라 9시간 이른 시각이 한국어로만 나갔다. 숫자 모양은 다섯 언어 모두 그대로 읽힌다.
 */
export function kstShortDateTime(v: string | Date | null | undefined): string {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const p: Record<string, string> = {};
    for (const part of KST_PARTS.formatToParts(d)) p[part.type] = part.value;
    return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}
