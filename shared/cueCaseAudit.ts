/**
 * 큐 케이스 맞춰 보기(2026-10-16 어드민 › 당구 › 큐 케이스 — "부정 경기를 지워도 그 경기로 받은 큐와 한정 번호는 남는다").
 * 받은 기록 한 줄마다 지금 기록이 그 조건을 받쳐 주는가를 본다. 받쳐 주지 않는 줄만 운영자가 거둘 수 있다 —
 * 운영자가 마음대로 거두는 길이 아니다(굿즈 · 배지에서 오너가 고른 '증정한 것만 회수'와 같은 선).
 *
 * 다시 판정할 수 없는 줄은 거두지 않는다:
 *  - 그 순간에만 아는 것: 다마 오름 · 다마 넘김(경기를 끝내는 순간의 다마는 기록에 남지 않는다 — cueCase.repo awardNow)
 *  - 고른 한정 큐(친구 30명마다 — 고를 때만 들어온다. 초대 취소로 넘친 것은 친구 초대 화면이 거둔다)
 *  - 운영자가 증정한 것(굿즈 · 배지에서 회수)
 *  - 아직 받는 길이 없는 것('곧 열려요' — 증정으로만 들어온다)
 */
import { SOON, caseItem, type CaseItem } from "./cueCase.js";

export type AwardOrigin = "earned" | "moment" | "pick" | "granted";

/** 기록으로 다시 판정할 수 있는 물건인가 */
export function rejudgeable(x: Pick<CaseItem, "id" | "rule">): boolean {
    if (SOON.has(x.id)) return false;
    const r = x.rule;
    if (r.k === "invitePick") return false;
    if (r.k === "realScene" && (r.s === "overTarget" || r.s === "damaUp")) return false;
    return true;
}

export function awardOrigin(itemId: string, granted: boolean): AwardOrigin {
    if (granted) return "granted";
    const x = caseItem(itemId);
    if (!x) return "moment";
    if (x.rule.k === "invitePick") return "pick";
    return rejudgeable(x) ? "earned" : "moment";
}

export const ORIGIN_LABEL: Readonly<Record<AwardOrigin, string>> = {
    earned: "기록으로 받음", moment: "그 순간에 받음", pick: "고른 한정 큐", granted: "운영자 증정",
};

/** 한 줄 — supported: 기록이 받쳐 주는가(다시 판정할 수 없는 줄은 null) */
export interface CaseAuditRow { itemId: string; serial: number | null; earnedAt: string; origin: AwardOrigin; supported: boolean | null }
export interface CaseAuditMember { memberId: string; name: string; rows: CaseAuditRow[]; unsupported: number }
/** GET /admin/billiards/case-audit */
export interface CaseAuditSweep {
    members: CaseAuditMember[]; scanned: number; total: number;
    /** 한정판 — 나간 자루 / 정한 수 */
    limited: { itemId: string; given: number; limit: number }[];
}

/** 거둘 수 있는 줄 — 기록으로 받았는데 지금 기록이 받쳐 주지 않는 것만 */
export const canTakeBack = (r: Pick<CaseAuditRow, "origin" | "supported">) => r.origin === "earned" && r.supported === false;
