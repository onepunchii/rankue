import { useCallback, useState } from "react";

/**
 * 랭큐매치 게임 결과의 단위. **기본은 포인트(P)**, 원화는 본인이 켠 경우에만 보인다(2026-09-11 오너 승인).
 *
 * 왜: 앱은 돈을 옮기지 않지만, 원화(₩)·'BETTING' 표기와 '내기 자동 정산' 문구가 붙으면 도박 방조 시비와
 * 앱스토어·구글플레이의 실제 금전 도박 조항 심사에 걸릴 수 있다. 점수 계산기로 보이게 한다.
 */
export type MoneyUnit = "P" | "KRW";

const KEY = "rankue_golf_money_unit";

function readUnit(): MoneyUnit {
    try {
        return localStorage.getItem(KEY) === "KRW" ? "KRW" : "P";
    } catch {
        return "P";
    }
}

export function useMoneyUnit(): [MoneyUnit, (u: MoneyUnit) => void] {
    const [unit, setUnit] = useState<MoneyUnit>(readUnit);
    const set = useCallback((u: MoneyUnit) => {
        setUnit(u);
        try { localStorage.setItem(KEY, u); } catch { /* 저장 못 해도 이번 화면에선 바뀐다 */ }
    }, []);
    return [unit, set];
}

/** 12,000P · +12,000원 · −3,000P */
export function formatMoney(amount: number, unit: MoneyUnit, signed = false): string {
    const abs = Math.abs(amount).toLocaleString();
    const sign = amount < 0 ? "−" : signed && amount > 0 ? "+" : "";
    return `${sign}${abs}${unit === "KRW" ? "원" : "P"}`;
}
