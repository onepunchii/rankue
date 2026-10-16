/**
 * 낚시 수족관 장식 맞춰 보기(2026-10-17 어드민 › 낚시 › 장식 — "금 닻(99)은 기록만 적으면 받는다").
 * 큐 케이스 맞춰 보기(shared/cueCaseAudit)와 같은 선: 운영자가 마음대로 거두지 않는다 — **지금 기록(가린 조과는 빼고)이 받쳐 주지 않는** 장식만 거둔다.
 * 가짜 기록이 의심되면 먼저 '조과 검수'에서 그 조과를 가린다 → 장식이 '받쳐 주지 않음'이 된다 → 여기서 거둔다. 증정한 것은 굿즈 · 배지에서 회수.
 * 한정(금 닻)을 가진 사람에게는 근거를 붙인다 — 한 해 어종 수 · 사진 있는 기록 · 기록한 날 수(판정이 아니라 사람이 볼 재료).
 */
export interface DecorAuditRow { itemId: string; name: string; serial: number; earnedAt: string; granted: boolean; supported: boolean }
export interface DecorAuditMember {
    memberId: string; name: string; rows: DecorAuditRow[]; unsupported: number;
    /** 한정 장식을 가진 사람의 근거 */
    evidence: { yearSpecies: number; photos: number; days: number; catches: number } | null;
}
export interface DecorAuditSweep { members: DecorAuditMember[]; limited: { itemId: string; name: string; given: number; limit: number }[] }

/** 거둘 수 있는 줄 — 기록으로 받았는데(증정 아님) 지금 기록이 받쳐 주지 않는 것만 */
export const canTakeBackDecor = (r: Pick<DecorAuditRow, "granted" | "supported">) => !r.granted && !r.supported;
