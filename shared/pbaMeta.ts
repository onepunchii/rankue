// PBA 표기 유틸 — 클라이언트(pba.tsx·pba-player.tsx)와 서버 프리렌더가 공유한다.
// 프리렌더 금선(봇 문서 = React 렌더 결과, 문자 단위 일치)을 복제 대신 공유로 보장
// (shared/crewMeta.ts 와 같은 패턴).

// 시즌 라벨: 2025 → "25-26"
export const seasonLabel = (s: number) => `${String(s).slice(2)}-${String(s + 1).slice(2)}`;

// 상금 표기: ko는 억/만, 그 외는 ₩ 축약.
// 만 단위 반올림이 10,000만이 되면 억으로 캐리한다 ("1억 10,000만" 방지).
export function formatPrize(n: number, locale: string): string {
    if (locale === "ko") {
        if (n >= 1e8) {
            let eok = Math.floor(n / 1e8);
            let man = Math.round((n % 1e8) / 1e4);
            if (man === 10000) { eok += 1; man = 0; }
            return man > 0 ? `${eok}억 ${man.toLocaleString("ko-KR")}만` : `${eok}억`;
        }
        if (n >= 1e4) {
            const man = Math.round(n / 1e4);
            if (man === 10000) return "1억";
            return `${man.toLocaleString("ko-KR")}만`;
        }
        return n.toLocaleString("ko-KR");
    }
    if (n >= 1e6) return `₩${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `₩${Math.round(n / 1e3).toLocaleString()}K`;
    return `₩${n.toLocaleString()}`;
}

export const formatPrizeKo = (n: number) => formatPrize(n, "ko");
