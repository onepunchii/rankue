import { getLocale } from "./i18n";

export const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

/** 원 단위 → 한국어는 "1억 2,000만", 그 외 언어는 그 언어의 축약 표기(₩ 유지, 예: ₩120M). */
export const formatSimple = (n: number) => {
    const locale = getLocale();
    if (locale !== 'ko') {
        return `₩${new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
    }
    const eok = Math.floor(n / 100000000);
    const man = Math.floor((n % 100000000) / 10000);
    if (eok > 0) return `${eok}억 ${man > 0 ? new Intl.NumberFormat('ko-KR').format(man) : 0}만`;
    return `${new Intl.NumberFormat('ko-KR').format(man)}만`;
};
