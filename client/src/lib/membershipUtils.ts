export const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

export const formatSimple = (n: number) => {
    const eok = Math.floor(n / 100000000);
    const man = Math.floor((n % 100000000) / 10000);
    if (eok > 0) return `${eok}억 ${man > 0 ? new Intl.NumberFormat('ko-KR').format(man) : 0}만`;
    return `${new Intl.NumberFormat('ko-KR').format(man)}만`;
};
