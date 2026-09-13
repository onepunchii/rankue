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
    /** 국내 미니 리더보드(2026-09-13): 같은 국가 상위 5 + 등재 인원 */
    national?: {
        fedCount: number;
        top: Array<{ rank: number; playerName: string; nativeName?: string | null; playerUmbId: string; points: number }>;
    };
    /** PBA 교차 매칭 수치(매칭된 선수만). UMB 랭킹에는 없는 진짜 경기 수치다. */
    pba?: {
        league: "PBA" | "LPBA";
        memCode: string;
        nameKo: string;
        birthday: string | null;
        average: number | null;
        highRun: number | null;
        bankShotRate: number | null;
        win: number | null;
        lose: number | null;
        draw: number | null;
        careerPrize: number | null;
        season: { season: number; prizeRank: number | null; pointRank: number | null; prize: number; rankingPoint: number } | null;
    } | null;
    /** 이 선수를 관심 선수로 둔 랭큐 회원 수 */
    followers?: number;
    /** 로그인한 나의 팔로우 여부 */
    following?: boolean;
}

/** 생일 → 만 나이. 형식이 이상하면 null. */
export function ageFrom(birthday: string | null | undefined, now = new Date()): number | null {
    if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
    const b = new Date(birthday + "T00:00:00Z");
    if (Number.isNaN(b.getTime())) return null;
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const m = now.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
    return age >= 0 && age < 120 ? age : null;
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
