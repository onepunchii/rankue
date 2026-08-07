export type UmbCategory = "players" | "ladies" | "juniors";

export interface UmbRankingRow {
    rank: number;
    playerName: string;
    nativeName?: string | null;
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
    fed: string; // 요약 기준 국가 (뷰어의 "우리나라")
    fedCount: number;
    top: { rank: number; playerName: string; nativeName?: string | null; fed: string } | null;
    fedTop: { rank: number; playerName: string; nativeName?: string | null } | null;
}

export interface UmbPlayerDetail {
    player: {
        playerName: string;
        nativeName?: string | null;
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
    rivals: Array<{ rank: number; playerName: string; nativeName?: string | null; playerUmbId: string; points: number }>;
}

export const UMB_CATEGORIES: Array<{ id: UmbCategory; labelKey: string }> = [
    { id: "players", labelKey: "umb.catPlayers" },
    { id: "ladies", labelKey: "umb.catLadies" },
    { id: "juniors", labelKey: "umb.catJuniors" },
];

export const UMB_SOURCE_URL = "https://www.umb-carom.org/ranking/archive";

// 목록 표시용 이름 — 한국어 화면이면 한글 이름 우선 ("조명우"), 그 외엔 로마자
export function displayName(row: { playerName: string; nativeName?: string | null }, locale: string): string {
    return locale === "ko" && row.nativeName ? row.nativeName : row.playerName;
}

// 사용자의 "우리나라" — 강조·필터·요약의 기준. 프로필 국가가 있으면 그것,
// 없으면(비로그인 등) 언어로 추정한다. 튀르키예·베트남은 3쿠션 강국이라
// 한국 고정이면 해당 언어 사용자에게 어색하다.
const LOCALE_FED: Record<string, string> = { ko: "KR", tr: "TR", vi: "VN", es: "ES", en: "US" };

export function resolveHomeFed(memberCountryCode: string | null | undefined, locale: string): string {
    const cc = (memberCountryCode || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) return cc;
    return LOCALE_FED[locale] || "KR";
}

// 국가 코드 → 현재 언어 국가명 ("KR" → "대한민국" / "South Korea")
export function regionName(code: string, locale: string): string {
    try {
        return new Intl.DisplayNames([locale || "ko"], { type: "region" }).of(code) || code;
    } catch {
        return code;
    }
}
