/**
 * 프로필 기본 두 가지 — 성별 · 나이대(2026-10-20 오너: "당구 골프 등산 낚시에 공통으로 해야 되니깐 성별이랑 나이대로 가고
 * 각 프로필 배너 창 잘 만들어 줘"). 예전의 출생연도 칸(설정 화면 선택)은 나이대로 바꿨다 — 정확한 나이는 어디에도 쓰지 않는다
 * (크루 회원 목록도 '30대 · 남성'까지만 보였다). 이미 출생연도를 넣은 회원은 그 해로 나이대를 읽는다(그 행은 그대로 둔다).
 *
 * 어디에 쓰나(사실만 — 화면 문구가 이것보다 많이 말하면 안 된다):
 *  - 크루(당구 크루 · 산악회 · 낚시 크루 · 골프 크루) 회원 목록의 '30대 · 남성' — 같은 크루 회원에게만(crew.ts stripMemberPrivacy)
 *  - 크루 모임의 팀 나누기(성별 섞기 · 나누기 — client/src/lib/teamGenerator)
 *  - 골프 조인을 열 때 내 자리의 남 · 여(JoinCreateSheet)
 */

export const AGE_BANDS = ["10s", "20s", "30s", "40s", "50s", "60s"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export type Gender = "male" | "female";

export const isAgeBand = (v: unknown): v is AgeBand => typeof v === "string" && (AGE_BANDS as readonly string[]).includes(v);
export const isGender = (v: unknown): v is Gender => v === "male" || v === "female";

/**
 * 이 회원의 나이대. 고른 나이대가 먼저, 없으면 출생연도로(그해 나이의 십 단위 — 60 이상은 60s, 10 미만은 모름).
 * year 는 부르는 쪽의 해(한국 시각의 해를 넘기면 된다).
 */
export function ageBandOf(m: { ageBand?: string | null; birthYear?: number | null } | null | undefined, year: number): AgeBand | null {
    if (!m) return null;
    if (isAgeBand(m.ageBand)) return m.ageBand;
    const by = Number(m.birthYear);
    if (!Number.isInteger(by) || by <= 0) return null;
    const age = year - by;
    if (age < 10) return null;
    if (age >= 60) return "60s";
    return `${Math.floor(age / 10) * 10}s` as AgeBand;
}

/** 두 가지 중 하나라도 비었나 — 홈 배너를 띄울지 */
export function needsProfileBasics(m: { gender?: string | null; ageBand?: string | null; birthYear?: number | null } | null | undefined, year: number): boolean {
    if (!m) return false;
    return !isGender(m.gender) || ageBandOf(m, year) === null;
}

/** 배너의 '나중에' — 이만큼 다시 띄우지 않는다(기기마다) */
export const PROFILE_NUDGE_SNOOZE_DAYS = 7;
export const PROFILE_NUDGE_SNOOZE_KEY = "rankue_profile_nudge_snooze";
