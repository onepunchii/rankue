// 크루 정산 계산 — 1원 단위까지 정확히 나누고, 누가 누구에게 얼마를 보내는지 뽑는다.
//
// 예전 화면은 1인당 금액을 10원 단위로 올림(ceil(/10)*10)했다. 30,000원을 7명이 나누면 4,290원씩 걷혀
// 계산한 사람이 30,030원을 받았다 — 적어도 매번 "더 걷는" 쪽으로 틀렸다(2026-09-26 검토 P1).
// 지금은 몫(내림)을 똑같이 나누고, 나누어떨어지지 않는 나머지 몇 원은 **계산한 사람이 부담**한다.
// 계산한 사람이 참석자가 아니면(드물다) 나머지를 참석자 앞에서부터 1원씩 더 낸다 — 합이 결제 금액과 꼭 같아야 해서.

export interface SettlementShare {
    /** 모두가 내는 기본 몫(내림). */
    base: number;
    /** 나누어떨어지지 않은 나머지(0 ~ 인원-1 원). */
    remainder: number;
    /** 참석자별 부담액 — 합은 amount 와 정확히 같다. */
    shares: Record<string, number>;
}

export function splitAmount(amount: number, participantIds: string[], payerId?: string | null): SettlementShare {
    const n = participantIds.length;
    const total = Math.max(0, Math.round(Number(amount) || 0));
    if (n === 0) return { base: 0, remainder: 0, shares: {} };
    const base = Math.floor(total / n);
    const remainder = total - base * n;
    const shares: Record<string, number> = {};
    for (const id of participantIds) shares[id] = base;
    if (remainder > 0) {
        if (payerId && payerId in shares) shares[payerId] += remainder;
        else for (let i = 0; i < remainder; i++) shares[participantIds[i]] += 1;
    }
    return { base, remainder, shares };
}

export interface SettlementItemLike {
    amount: number;
    payerId: string | null;
    participants: Array<{ memberId: string }>;
}

export interface Transfer {
    fromId: string;
    toId: string;
    amount: number;
}

/**
 * 순잔액(낸 돈 − 쓴 몫)을 모아, 빚진 사람 → 받을 사람 송금 목록을 만든다(큰 금액끼리 먼저 짝짓는 욕심 방식).
 * 받을 사람은 각 차수의 **계산한 사람**이다 — 총무(정산을 만든 사람)가 아니다. 그래서 화면은 송금마다 받는 사람을
 * 적고, 총무 계좌는 받는 사람이 총무일 때만 붙인다.
 */
export function computeTransfers(items: SettlementItemLike[]): { balances: Record<string, number>; transfers: Transfer[] } {
    const balances: Record<string, number> = {};
    for (const item of items) {
        const ids = item.participants.map((p) => p.memberId);
        const amount = Math.max(0, Math.round(Number(item.amount) || 0));
        if (item.payerId) balances[item.payerId] = (balances[item.payerId] ?? 0) + amount;
        const { shares } = splitAmount(amount, ids, item.payerId);
        for (const [id, share] of Object.entries(shares)) balances[id] = (balances[id] ?? 0) - share;
    }

    // 금액이 같으면 id 순으로 — 같은 정산을 여러 번 열어도 목록이 매번 같아야 한다.
    const byAmount = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
        b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const debtors = Object.entries(balances).filter(([, b]) => b < 0).map(([id, b]) => ({ id, amount: -b })).sort(byAmount);
    const creditors = Object.entries(balances).filter(([, b]) => b > 0).map(([id, b]) => ({ id, amount: b })).sort(byAmount);

    const transfers: Transfer[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amount = Math.min(debtors[i].amount, creditors[j].amount);
        if (amount > 0) transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amount });
        debtors[i].amount -= amount;
        creditors[j].amount -= amount;
        if (debtors[i].amount === 0) i++;
        if (creditors[j].amount === 0) j++;
    }
    return { balances, transfers };
}

export type SettlementRoundError = "amount" | "participants" | "payer";

/** 한 차수 입력 확인 — 빈 금액이 0원으로, 빈 계산한 사람이 '첫 참석자'로 조용히 바뀌던 것을 막는다. */
export function checkSettlementRound(r: { amount: unknown; payerId?: string | null; participants: string[] }): SettlementRoundError | null {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1 || amount > 100_000_000) return "amount";
    if (!r.participants.length) return "participants";
    if (!r.payerId || !r.participants.includes(r.payerId)) return "payer";
    return null;
}
