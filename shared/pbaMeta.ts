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

// ── "선수 연봉" 검색 대응 (오너 요청 2026-08-16) ──────────────────────────────
// 프로당구는 연봉제가 아니다. 선수 수입은 대회 상금이 중심이고, 구단 계약금은 공개되지 않는다.
// 그래서 상금 수치를 '연봉'으로 바꿔 부르지 않는다 — 그건 없는 사실을 만드는 것이다.
// 대신 "OOO 연봉"으로 들어온 사람에게 **정확한 답**(연봉제가 아니며 공개된 수치는 상금)을 주고,
// 그 답 안에서 통산 상금을 보여준다. 클라이언트와 프리렌더가 이 문구를 공유해 문자 단위로 맞춘다.
export const PBA_INCOME_NOTE_KO =
    "프로당구는 연봉제가 아닙니다. 선수 수입은 대회 상금이 중심이며 구단 계약금은 공개되지 않아, 랭큐는 공식 기록의 상금만 표시합니다.";

export const PBA_LIST_TITLE_KO = "PBA 투어 랭킹 · 프로당구 상금(연봉) 순위 | 랭큐";
export const PBA_LIST_DESC_KO =
    "프로당구 PBA·LPBA 시즌별 랭킹. 선수 상금 순위와 랭킹 포인트, 통산 기록을 랭큐에서. 프로당구는 연봉제가 아니라 대회 상금이 선수 수입의 중심입니다.";

export const pbaPlayerTitleKo = (nameKo: string, league: string) =>
    `${nameKo} 상금·연봉 — ${league} 프로당구 선수 | 랭큐`;

export const pbaPlayerDescKo = (
    nameKo: string, nameEn: string | null | undefined, league: string,
    careerPrize: number | null | undefined, average: unknown, highRun: unknown,
) =>
    `${nameKo}${nameEn ? ` (${nameEn})` : ""} — ${league} 통산 상금 ${careerPrize != null ? formatPrizeKo(careerPrize) : "-"}, 에버리지 ${average ?? "-"}, 하이런 ${highRun ?? "-"}. 프로당구는 연봉제가 아니라 상금 중심입니다.`;

/** "OOO 연봉 얼마?" 질문에 대한 정답 — FAQ 구조화데이터·화면 공용. */
export const pbaIncomeAnswerKo = (nameKo: string, careerPrize: number | null | undefined) =>
    `${nameKo} 선수는 연봉을 받는 것이 아니라 대회 성적에 따른 상금을 받습니다. 공식 기록 기준 통산 상금은 ${careerPrize != null ? `${formatPrizeKo(careerPrize)}원` : "집계 중"}입니다.`;
