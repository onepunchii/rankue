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

// ── 선수 상세 앵커 목차 — 네이버 "본문 바로가기" 칩 ──────────────────────────
// 네이버는 메타태그가 아니라 페이지 안의 <nav> 앵커(<a href="#...">) 구조에서
// 검색결과의 "본문 바로가기" 칩과 관련문서를 자동 생성하고, **앵커 텍스트를 그대로
// 칩 문구로 쓴다**. 그래서 라벨은 클라(pba-player.tsx L.ko)와 프리렌더가 이 정본을
// 공유해 문자 단위로 일치시킨다 (봇 문서 = React 렌더 결과 금선).
export const PBA_PLAYER_ANCHORS_KO = {
    career: "통산 기록",
    seasons: "시즌별 궤적",
    umb: "이 선수의 UMB 세계랭킹 기록",
    related: "PBA 랭킹",
} as const;

// 관련 선수 — 같은 리그 상금랭킹에서 본인 순번 주변 count명(본인 제외).
// 클라 관련 블록과 프리렌더가 같은 선정 로직을 써야 두 문서가 같은 링크를 낸다.
export function pbaRelated<T extends { memCode: string }>(rows: T[], memCode: string, count = 5): T[] {
    const others = rows.filter((r) => r.memCode !== memCode);
    if (!others.length) return [];
    const idx = rows.findIndex((r) => r.memCode === memCode);
    const start = Math.max(0, Math.min(idx < 0 ? 0 : idx - Math.floor(count / 2), others.length - count));
    return others.slice(start, start + count);
}
