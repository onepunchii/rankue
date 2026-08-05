export type UmbCategory = "players" | "ladies" | "juniors";

export interface UmbRankingRow {
    rank: number;
    playerName: string;
    fed: string;
    playerUmbId: string;
    points: number;
    prevRank: number | null;
    move: number | null; // 직전 회차 대비 (+상승 / -하락 / null 신규)
}

export interface UmbRankingsResponse {
    edition: string | null;
    editionDate: string | null;
    total: number;
    rows: UmbRankingRow[];
}

export interface UmbSummary {
    edition: string;
    editionDate: string;
    total: number;
    krCount: number;
    top: { rank: number; playerName: string; fed: string } | null;
    krTop: { rank: number; playerName: string } | null;
}

export interface UmbPlayerDetail {
    player: {
        playerName: string;
        fed: string;
        playerUmbId: string;
        rank: number;
        points: number;
        penaltyPoints: number;
        eventPoints: Record<string, number> | null;
        nationalRank: number | null;
    } | null;
    bestRank: number;
    history: Array<{ edition: string; editionDate: string; rank: number; points: number }>;
    events: Array<{ colKey: string; label: string }>;
    rivals: Array<{ rank: number; playerName: string; playerUmbId: string; points: number }>;
}

export const UMB_CATEGORIES: Array<{ id: UmbCategory; labelKey: string }> = [
    { id: "players", labelKey: "umb.catPlayers" },
    { id: "ladies", labelKey: "umb.catLadies" },
    { id: "juniors", labelKey: "umb.catJuniors" },
];

export const UMB_SOURCE_URL = "https://www.umb-carom.org/ranking/archive";
