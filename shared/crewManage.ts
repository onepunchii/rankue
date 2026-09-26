// 크루 관리 화면(목록 줄·설정·멤버 관리)이 쓰는 순수 규칙(2026-09-26 크루 관리 개선).
//
// 화면 코드에 흩어져 있던 판단을 한곳에 모았다 — 비교·권한·정렬이 틀리면 버튼이 엉뚱하게 켜지거나(설정을 열자마자
// '저장' 활성), 서버가 거절할 동작을 화면이 권하게 된다(운영진에게 '크루장 넘기기'). 서버 규칙(server/routes/modules/crew.ts)을
// 그대로 옮겨 적은 것이라, 서버 규칙이 바뀌면 여기도 같이 바꾼다. DOM·React 없이 돌아서 vitest(node) 로 검사한다.

import { withoutBettingTags } from "./crewTags";

export type CrewRole = "leader" | "manage" | "member" | "pending";

// ── 설정 폼 ───────────────────────────────────────────────────────────

/** 글자 칸 비교용 — null·undefined·'' 와 앞뒤 공백만 다른 값은 같은 값이다. */
export function normText(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/** 정원 — 0·null·음수·숫자 아님은 모두 '무제한'(0). 서버 joinCrew 도 null/0 을 제한 없음으로 본다. */
export function normCapacity(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export interface CrewSettingsForm {
    name: string;
    shortIntro: string;
    description: string;
    /** 0 = 무제한 */
    maxMembers: number;
    emblem: string;
    coverImage: string;
    meetingDay: string;
    meetingTime: string;
    joinType: "auto" | "approval";
    gameType: string;
    tags: string[];
    region: string;
    baseListingCode: string | null;
    baseStoreId: string | null;
}

type CrewLike = Record<string, unknown> | null | undefined;

/** 크루 → 설정 폼. 빈 값은 '' 로, 정원은 0(무제한)으로 모은다 — 예전엔 `maxMembers || 50` 이라 무제한 크루가 50 으로 보였다. */
export function crewToSettingsForm(crew: CrewLike): CrewSettingsForm {
    const c = (crew ?? {}) as Record<string, any>;
    return {
        name: normText(c.name),
        shortIntro: normText(c.shortIntro),
        description: typeof c.description === "string" ? c.description : "",
        maxMembers: normCapacity(c.maxMembers),
        emblem: normText(c.emblem),
        coverImage: normText(c.coverImage),
        meetingDay: normText(c.meetingDay),
        meetingTime: normText(c.meetingTime),
        joinType: c.joinType === "approval" ? "approval" : "auto",
        gameType: normText(c.gameType) || "any",
        // 이미 저장된 내기 권유 태그는 폼에 싣지 않는다(감사 S5) — 비교도 거른 값끼리 해야 열자마자 '바뀜'이 되지 않는다.
        tags: withoutBettingTags(Array.isArray(c.tags) ? c.tags : []),
        region: normText(c.region),
        baseListingCode: normText(c.baseListingCode) || null,
        baseStoreId: normText(c.baseStoreId) || null,
    };
}

/**
 * 바뀐 칸만 골라 PATCH 몸통으로 만든다. 빈 칸은 null 로 보낸다(서버는 받은 칸만 고친다).
 * 예전엔 폼 전체를 보내고 '' 와 null 을 다르게 봐서, 설정을 열기만 해도 '저장'이 켜졌고
 * 무제한 크루가 50 명으로 저장되며 현재 인원이 50 을 넘으면 어떤 수정도 저장되지 않았다(maxBelowCurrent).
 */
export function crewSettingsPatch(form: CrewSettingsForm, crew: CrewLike): Record<string, unknown> {
    const base = crewToSettingsForm(crew);
    const patch: Record<string, unknown> = {};
    const textKeys = ["name", "shortIntro", "meetingDay", "meetingTime", "emblem", "coverImage", "region"] as const;
    for (const k of textKeys) {
        if (normText(form[k]) !== base[k]) patch[k] = normText(form[k]) || null;
    }
    // 소개글은 줄바꿈·앞 공백이 뜻을 가질 수 있어 원문을 보낸다(비교만 trim).
    if (normText(form.description) !== normText(base.description)) patch.description = normText(form.description) ? form.description : null;
    if (normCapacity(form.maxMembers) !== base.maxMembers) patch.maxMembers = normCapacity(form.maxMembers) || null;
    if (form.joinType !== base.joinType) patch.joinType = form.joinType;
    if ((form.gameType || "any") !== base.gameType) patch.gameType = form.gameType || "any";
    if (JSON.stringify(form.tags ?? []) !== JSON.stringify(base.tags)) patch.tags = form.tags ?? [];
    // 베이스캠프는 둘이 한 쌍 — 하나만 바뀌어도 둘 다 보낸다(파트너 ↔ 디렉토리 전환 시 반대쪽을 비워야 한다).
    if ((form.baseListingCode || null) !== base.baseListingCode || (form.baseStoreId || null) !== base.baseStoreId) {
        patch.baseListingCode = form.baseListingCode || null;
        patch.baseStoreId = form.baseStoreId || null;
    }
    return patch;
}

export const CAPACITY_PRESETS = [10, 20, 30, 50, 100] as const;
export const CAPACITY_MAX = 1000; // 서버 badMaxMembers 상한과 같다

/** 정원 선택지 — 현재 활동 인원보다 작은 값은 서버가 거절하므로(maxBelowCurrent) 처음부터 끈다. 0 = 무제한. */
export function capacityOptions(activeCount: number): Array<{ value: number; disabled: boolean }> {
    return [
        ...CAPACITY_PRESETS.map((value) => ({ value, disabled: value < activeCount })),
        { value: 0, disabled: false },
    ];
}

/** 직접 입력한 정원이 저장 가능한가 — 정수, 현재 인원 이상, 상한 이하. */
export function isValidCapacity(value: number, activeCount: number): boolean {
    return Number.isInteger(value) && value >= Math.max(1, activeCount) && value <= CAPACITY_MAX;
}

// ── 정모 요일·시간 ─────────────────────────────────────────────────────
// meeting_day 는 자유 글(예: "매주 토요일")로 쌓여 왔고 크루 홈이 그대로 찍는다. 그래서 새 값도 사람이 읽는 글로 저장하고
// (요일 칩 → "토요일" / "토·일"), 읽을 때 그 글을 다시 칩으로 푼다. 칩으로 못 푸는 옛 글은 그대로 두고 화면이 따로 보여 준다.

export const WEEK_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
/** 요일별 짧은·긴 이름(현재 언어). 예: { SAT: { short: "토", long: "토요일" } } */
export type DayLabels = Record<WeekDay, { short: string; long: string }>;

/** 칩 → 저장 글. 한 요일이면 긴 이름, 여러 요일이면 짧은 이름을 '·' 로 잇는다(요일 순서대로). */
export function formatMeetingDays(days: readonly WeekDay[], labels: DayLabels): string {
    const sorted = WEEK_DAYS.filter((d) => days.includes(d));
    if (sorted.length === 0) return "";
    if (sorted.length === 1) return labels[sorted[0]].long;
    return sorted.map((d) => labels[d].short).join("·");
}

/** 저장 글 → 칩. 빈 글은 [], 요일 이름으로만 이뤄지지 않은 글은 null(옛 자유 글). */
export function parseMeetingDays(value: string | null | undefined, labels: DayLabels): WeekDay[] | null {
    const text = normText(value);
    if (!text) return [];
    const tokens = text.split(/[\s,·/、]+/).filter(Boolean);
    const out = new Set<WeekDay>();
    for (const tok of tokens) {
        const low = tok.toLowerCase();
        const hit = WEEK_DAYS.find((d) =>
            low === d.toLowerCase() || low === labels[d].short.toLowerCase() || low === labels[d].long.toLowerCase());
        if (!hit) return null;
        out.add(hit);
    }
    return WEEK_DAYS.filter((d) => out.has(d));
}

/** <input type="time"> 이 읽을 수 있는 "HH:MM" 인가. 옛 자유 글("오후 2시")은 아니다. */
export function isClockTime(v: unknown): boolean {
    return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
}

// ── 목록 줄 ───────────────────────────────────────────────────────────

/** 크루 엠블럼·커버가 그릴 수 있는 이미지 주소인가 — 옛 크루는 엠블럼에 이모지를 넣었다(<img src="🎱"> 는 깨진다). */
export function crewImageSrc(v: unknown): string | null {
    const s = normText(v);
    return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(s) ? s : null;
}

/** 인원 표시 — 정원이 있으면 "n/max", 무제한이면 "n". 승인 대기는 서버가 이미 뺀 숫자를 받는다. */
export function crewRowStatus(input: { memberCount?: number | null; maxMembers?: number | null }) {
    const count = Math.max(0, Math.floor(Number(input.memberCount) || 0));
    const max = normCapacity(input.maxMembers);
    return {
        count,
        max: max || null,
        countLabel: max ? `${count}/${max}` : `${count}`,
        full: max > 0 && count >= max,
        nearlyFull: max > 0 && count < max && count >= max * 0.9,
    };
}

// ── 멤버 관리 ─────────────────────────────────────────────────────────

export interface MemberActions {
    approve: boolean;
    reject: boolean;
    appointManager: boolean;
    demoteManager: boolean;
    transfer: boolean;
    kick: boolean;
}

const NO_ACTIONS: MemberActions = { approve: false, reject: false, appointManager: false, demoteManager: false, transfer: false, kick: false };

/**
 * 내가(myRole) 대상(targetRole)에게 할 수 있는 동작 — 서버 규칙 그대로:
 *  - 승인·거절(대기자 내보내기): 크루장·운영진 (POST approve, DELETE members)
 *  - 운영진 임명/해제: 크루장만 (PATCH role, 대기자 불가)
 *  - 크루장 넘기기: 크루장만, 대상은 활동 멤버 (POST transfer)
 *  - 내보내기: 크루장은 누구나(자신 제외), 운영진은 일반 멤버·대기자만 (DELETE members — cannotKickStaff)
 */
export function memberActions(myRole: string | null | undefined, targetRole: string, isSelf: boolean): MemberActions {
    if (isSelf || !myRole || targetRole === "leader") return NO_ACTIONS;
    const leader = myRole === "leader";
    const manager = myRole === "manage";
    if (!leader && !manager) return NO_ACTIONS;
    if (targetRole === "pending") return { ...NO_ACTIONS, approve: true, reject: true };
    return {
        ...NO_ACTIONS,
        appointManager: leader && targetRole === "member",
        demoteManager: leader && targetRole === "manage",
        transfer: leader,
        kick: leader || targetRole === "member",
    };
}

export type MemberSort = "role" | "name" | "joined";

interface SortableMember {
    member: { nickname?: string | null; name?: string | null };
    role: string;
    joinedAt: string | Date;
}

const ROLE_ORDER: Record<string, number> = { leader: 0, manage: 1, member: 2, pending: 3 };
const displayName = (m: SortableMember) => normText(m.member?.nickname) || normText(m.member?.name);
const joinedMs = (m: SortableMember) => {
    const t = new Date(m.joinedAt as any).getTime();
    return Number.isFinite(t) ? t : 0;
};

/**
 * 이름 검색 + 정렬. role = 크루장→운영진→멤버→대기, 같은 역할은 먼저 가입한 순 / name = 이름순(현재 언어) /
 * joined = 최근 가입순. 원본 배열은 건드리지 않는다.
 */
export function filterSortMembers<T extends SortableMember>(list: readonly T[], query: string, sort: MemberSort, locale = "ko"): T[] {
    const q = normText(query).toLowerCase();
    const filtered = q ? list.filter((m) => displayName(m).toLowerCase().includes(q)) : [...list];
    const byName = (a: T, b: T) => displayName(a).localeCompare(displayName(b), locale);
    return filtered.sort((a, b) => {
        if (sort === "name") return byName(a, b) || joinedMs(a) - joinedMs(b);
        if (sort === "joined") return joinedMs(b) - joinedMs(a) || byName(a, b);
        const r = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
        return r || joinedMs(a) - joinedMs(b);
    });
}
