/**
 * 어드민 · 친구 초대 관리(2026-10-16 어드민 전수 조사 — "가짜 계정 30개로 한정 큐를 받아 가는 경우").
 * 초대로 든 가입마다 사람이 다시 볼 것을 고르는 체 — 판정이 아니다. 순수 함수.
 *  - 가입하고 아무 경기도 없다(초대로만 센 계정일 수 있다) — 하루가 지난 뒤부터
 *  - 같은 사람의 초대가 한 시간 안에 다섯 넘게 몰렸다
 *  - 초대받은 사람이 탈퇴했다
 */
export type InviteFlagId = "noPlay" | "burst" | "withdrawn";
export interface InviteFlag { id: InviteFlagId; text: string }

export const INVITE_BURST = { windowMs: 3_600_000, count: 5 } as const;

export function inviteFlags(o: { at: string; games: number; withdrawn: boolean; siblingsAt: readonly string[] }, nowMs = Date.now()): InviteFlag[] {
    const out: InviteFlag[] = [];
    const t = Date.parse(o.at);
    if (o.withdrawn) out.push({ id: "withdrawn", text: "초대받은 사람이 탈퇴했어요" });
    else if (o.games === 0 && nowMs - t > 86_400_000) out.push({ id: "noPlay", text: "가입하고 경기가 하나도 없어요" });
    const near = o.siblingsAt.filter((x) => Math.abs(Date.parse(x) - t) <= INVITE_BURST.windowMs).length;
    if (near > INVITE_BURST.count) out.push({ id: "burst", text: `같은 사람의 초대가 한 시간 안에 ${near}명` });
    return out;
}

export interface AdminInviteRow {
    inviteeId: string; inviteeName: string; inviterId: string; inviterName: string;
    at: string; inviteeJoinedAt: string | null;
    /** 초대받은 사람이 마지막으로 들어온 때(hiq_members.last_visited_at) — 가짜 계정은 다시 오지 않는다 */
    inviteeSeenAt: string | null;
    /** 초대받은 사람이 친 경기 수(실전 기록 + 끝난 온라인 대전) */
    games: number; withdrawn: boolean;
    /** 운영자가 취소한 초대 — 초대 수에서 빠진다 */
    canceled: { at: string; reason: string; by: string } | null;
    flags: InviteFlag[];
}
/** 초대한 사람 한 줄 — count 는 취소하지 않은 초대만 */
export interface AdminInviterRow { memberId: string; name: string; count: number; suspicious: number; picks: { total: number; left: number }; lastAt: string }
/** 한정 큐 한 자루 — 몇 번을 누가(번호 순) */
export interface AdminInviteStock { itemId: string; limit: number; holders: { memberId: string; name: string; serial: number }[] }
/** GET /admin/billiards/invites */
export interface AdminInvites { rows: AdminInviteRow[]; top: AdminInviterRow[]; stock: AdminInviteStock[] }
