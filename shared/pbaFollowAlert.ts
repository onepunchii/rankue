/**
 * PBA 관심 선수 알림(2026-11-06 — shared/guestConversion: 선수 화면의 "○○ 선수 소식 받기 — 팔로우"가 실제로 무언가를 주게).
 *
 * 예전에는 PBA 선수를 팔로우해도 아무 알림이 없었다(UMB 선수 · 골프 선수만 순위 알림이 있었다 — services/playerFollowAlerts).
 * 우리가 매일 받는 PBA 자료는 시즌 상금 순위(pba_season_ranks)와 대회의 우승자(pba_tournaments)뿐이라 — 판마다의 결과는 없다 —
 * 그 둘로 알린다: ① 시즌 상금 순위가 바뀌었을 때(투어가 끝나면 상금이 들어와 바뀐다) ② 대회에서 우승했을 때.
 * 언제 · 무엇을은 여기서 정하고, 보내기는 services/pbaFollowAlerts 가 한다. 끄기는 설정 > 알림 > 관심 선수(pref 'players') — UMB 와 같다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 이 파일은 아무것도 임포트하지 않는다.
 */

/** "2025-26" — 시즌 2025 */
export const pbaSeasonText = (season: number): string => `${season}-${String((season + 1) % 100).padStart(2, "0")}`;

export type PbaRankKind = "entry" | "no1" | "up" | "down";

/**
 * 순위가 바뀌었나 — 바뀌지 않았거나 지금 순위가 없으면 null. prev 가 없으면(지난번엔 순위에 없었다) 'entry'.
 * 1위가 된 것은 따로(no1) — 그대로 1위면 바뀐 것이 아니다.
 */
export function pbaRankChange(prev: number | null, rank: number | null): { kind: PbaRankKind; d: number } | null {
    if (rank == null || !Number.isFinite(rank) || rank < 1) return null;
    if (prev == null) return { kind: "entry", d: 0 };
    if (prev === rank) return null;
    if (rank === 1) return { kind: "no1", d: prev - 1 };
    return rank < prev ? { kind: "up", d: prev - rank } : { kind: "down", d: rank - prev };
}

/** 알림 문구의 키(shared/i18n notif.pba.*) — 받는 사람 언어로 notificationService 가 푼다 */
export const PBA_RANK_KEYS: Record<PbaRankKind, { title: string; body: string }> = {
    entry: { title: "notif.pba.rankEntry.title", body: "notif.pba.rankEntry.body" },
    no1: { title: "notif.pba.rankNo1.title", body: "notif.pba.rankNo1.body" },
    up: { title: "notif.pba.rankUp.title", body: "notif.pba.rankUp.body" },
    down: { title: "notif.pba.rankDown.title", body: "notif.pba.rankDown.body" },
};
export const PBA_WIN_KEYS = { title: "notif.pba.win.title", body: "notif.pba.win.body" } as const;

/** 우승을 알릴 대회 — 지난번에 우승자가 없던(진행 중이던) 대회에 우승자가 생겼고, 그 선수를 누군가 팔로우한다. 처음 보는 대회(백필)는 알리지 않는다 */
export function newPbaWins(before: ReadonlyMap<string, string | null>, after: readonly { id: string; winnerMemCode: string | null }[], followed: ReadonlySet<string>): { id: string; memCode: string }[] {
    const out: { id: string; memCode: string }[] = [];
    for (const t of after) {
        if (!t.winnerMemCode || !followed.has(t.winnerMemCode)) continue;
        if (!before.has(t.id) || before.get(t.id) != null) continue;
        out.push({ id: t.id, memCode: t.winnerMemCode });
    }
    return out;
}

/** 선수 화면 주소 — 알림을 누르면 간다 */
export const pbaPlayerUrl = (memCode: string): string => `/pba-player/${memCode}`;
