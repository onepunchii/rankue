/**
 * 관심 선수 순위 변동 알림 문구(2026-09-13 오너 제안 7번). 서버가 새 회차를 적재한 뒤 팔로워에게 보낸다.
 *
 * 규칙:
 *  - 순위가 **바뀐** 때만 보낸다. 매주 "그대로 12위" 알림은 알림함만 채운다(끄기 버튼으로 이어진다).
 *  - 처음 등재(직전 회차에 없음)는 변동이다 — 팔로우해 둔 유망주가 랭킹에 들어온 순간이다.
 *  - 1위가 되면 트로피. 그 외 상승 ▲ / 하락 ▼ 로 한눈에.
 * 문구는 한국어 고정 — 푸시는 서버에서 만들어지고 회원 언어별 문구 체계가 아직 없다(다른 알림들과 같다).
 */
export interface RankChangeInput {
    /** 화면 이름 — 한글 이름이 있으면 그것, 없으면 로마자 */
    readonly name: string;
    readonly rank: number;
    /** 직전 회차 순위. 없으면(처음 등재) null */
    readonly prevRank: number | null;
    readonly points: number;
}

export interface RankChangeMessage {
    readonly title: string;
    readonly body: string;
}

export function rankChangeMessage(v: RankChangeInput): RankChangeMessage | null {
    const { name, rank, prevRank, points } = v;
    if (prevRank !== null && prevRank === rank) return null;
    const pts = `${points}점`;
    if (prevRank === null) {
        return { title: `🌍 ${name} 세계랭킹 진입`, body: `세계 ${rank}위 · ${pts}` };
    }
    const d = prevRank - rank;
    if (rank === 1) {
        return { title: `🏆 ${name} 세계 1위!`, body: `지난 회차 ${prevRank}위 → 1위 (▲${d}) · ${pts}` };
    }
    const arrow = d > 0 ? `▲${d}` : `▼${-d}`;
    return {
        title: `${d > 0 ? "📈" : "📉"} ${name} 세계 ${rank}위`,
        body: `지난 회차 ${prevRank}위 → ${rank}위 (${arrow}) · ${pts}`,
    };
}
