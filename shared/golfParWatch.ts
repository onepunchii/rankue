/**
 * 골프 › 파 자동 반영 — 감시 · 잠금(2026-10-17 어드민 전수 조사 골프 ②).
 * 스코어카드 두 장(서로 다른 회원 SCAN_PROMOTE_MEMBERS 명)이 같은 코스 · 같은 파를 말하면 공용 명부(rankue_golf_courses)가 바뀐다(오너 10/14).
 * 그 길은 그대로 두고 — ① 바뀐 것을 기록(golf_par_changes)하고 ② 운영자가 코스를 잠그면(par_lock) 카드가 더는 바꾸지 못하게 하고
 * ③ 바뀐 파를 되돌리면 잠근다(같은 카드 두 장이 이미 쌓여 있어 다음 카드 한 장에 다시 바뀌기 때문).
 * '두 사람'이 실은 한 사람의 두 계정일 수 있다(10/17 실측: 카드를 올린 사람은 운영자 계정 둘뿐) — 그래서 맞춘 사람의 이름을 보여 준다.
 */
export type ParChangeKind = "added" | "fixed" | "blocked" | "admin" | "reverted" | "lock" | "unlock";
export const PAR_CHANGE_LABEL: Readonly<Record<ParChangeKind, string>> = {
    added: "카드가 코스를 더함",
    fixed: "카드가 파를 바꿈",
    blocked: "잠겨서 막음",
    admin: "운영자가 고침",
    reverted: "되돌림",
    lock: "잠금",
    unlock: "잠금 풂",
};

export interface ParLock { at: string; by: string; reason: string }
export interface ParChangeRow {
    id: string; at: string; kind: ParChangeKind; clubId: string; clubName: string | null; courseId: string | null; courseName: string;
    from: number[] | null; to: number[] | null; members: number | null; by: string | null; reason: string | null;
    /** 지금 명부의 파 · 잠금 — 되돌릴 수 있는지 보려고 */
    current: number[] | null; lock: ParLock | null;
}
export type SeenStatus = "same" | "pending" | "applied-differs" | "blocked" | "missing";
export const SEEN_STATUS_LABEL: Readonly<Record<SeenStatus, string>> = {
    same: "명부와 같음",
    pending: "한 사람 더 같으면 바뀜",
    "applied-differs": "명부와 다름",
    blocked: "잠겨서 안 바뀜",
    missing: "명부에 없는 코스",
};
export interface SeenCourseRow {
    clubId: string; clubName: string | null; courseKey: string; courseName: string; pars: number[];
    members: number; memberNames: string[]; staffOnly: boolean; seen: number; lastSeen: string;
    courseId: string | null; current: number[] | null; lock: ParLock | null; status: SeenStatus;
}
export interface ParWatch {
    changes: ParChangeRow[];
    seen: SeenCourseRow[];
    locked: { courseId: string; clubId: string; clubName: string | null; courseName: string; pars: number[] | null; lock: ParLock }[];
    promoteMembers: number;
}

/** "443544354" → [4,4,3,…] — 9칸이 아니면 null */
export function parsOf(key: unknown): number[] | null {
    if (Array.isArray(key)) return key.length === 9 && key.every((v) => Number.isInteger(v) && v >= 3 && v <= 6) ? key.map(Number) : null;
    if (typeof key !== "string" || !/^[3-6]{9}$/.test(key)) return null;
    return key.split("").map(Number);
}
export const parsKey = (p: readonly number[]) => p.join("");

/** 다른 홀(0부터) */
export function parsDiff(a: readonly number[] | null, b: readonly number[] | null): number[] {
    if (!a || !b) return [];
    const out: number[] = [];
    for (let i = 0; i < 9; i++) if (a[i] !== b[i]) out.push(i);
    return out;
}

/** 카드가 본 코스의 상태 — 명부와 견준다 */
export function seenStatus(x: { members: number; pars: readonly number[]; current: readonly number[] | null; courseExists: boolean; locked: boolean; promoteMembers: number }): SeenStatus {
    if (!x.courseExists) return "missing";
    if (x.current && parsDiff(x.pars, x.current).length === 0) return "same";
    if (x.locked) return "blocked";
    return x.members >= x.promoteMembers ? "applied-differs" : "pending";
}

/** 되돌릴 수 있는가 — 카드가 바꾼 줄이고, 지금 명부가 그 바뀐 값 그대로일 때만 */
export function canRevert(r: Pick<ParChangeRow, "kind" | "from" | "to" | "current">): boolean {
    return r.kind === "fixed" && !!r.from && !!r.to && !!r.current && parsDiff(r.to, r.current).length === 0;
}

export function parseParLock(raw: unknown): ParLock | null {
    if (!raw || typeof raw !== "object") return null;
    const x = raw as Record<string, unknown>;
    return typeof x.at === "string" ? { at: x.at, by: typeof x.by === "string" ? x.by : "관리자", reason: typeof x.reason === "string" ? x.reason : "" } : null;
}
