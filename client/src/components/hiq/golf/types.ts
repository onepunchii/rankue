/** 골프 랭킹 화면 타입(2026-09-13). 서버 응답(server/storage/golfRank.repo.ts)과 1:1 */
import type { GolfTour } from "@shared/golfTours";
export type { GolfTour };

export interface GolfRankRow {
    rank: number; playerId: string; playerName: string; nameKo: string | null; country: string;
    points: number; pointsTotal: number | null; events: number | null; prevRank: number | null; move: number | null;
}

export interface GolfRankingsResponse {
    edition: string | null; editionDate: string | null; prevEdition: string | null; total: number; rows: GolfRankRow[];
}

export interface GolfStatRow { rank: number; playerId: string; playerName: string; value: number; label: string; unit: string }
export interface GolfStatKey { statKey: string; label: string; unit: string; n: number }

export interface GolferDetail {
    player: {
        playerId: string; tour: GolfTour; playerName: string; nameKo: string | null; nameEn: string | null; country: string;
        rank: number | null; points: number | null; pointsTotal: number | null; events: number | null; prevRank: number | null;
        birthDate: string | null; extra: Record<string, unknown>; inLatest: boolean;
    };
    edition: string;
    bestRank: number | null;
    history: Array<{ edition: string; editionDate: string; rank: number; points: number }>;
    national: { fedCount: number; nationalRank: number | null; top: Array<{ rank: number; playerId: string; playerName: string; nameKo: string | null; points: number }> } | null;
    stats: Array<{ statKey: string; label: string; unit: string; rank: number; value: number; of: number | null }>;
    season: string;
    followers: number;
    following?: boolean;
}

/** 국내 투어는 한글 이름이 곧 이름. 세계 랭킹은 한국어 화면에서 한글 이름이 있으면 그것 */
export function golferName(row: { playerName: string; nameKo?: string | null }, locale: string): string {
    return locale === "ko" && row.nameKo ? row.nameKo : row.playerName;
}

/** IOC 3자(KOR) → 국기용 2자(KR). 흔한 것만 표로, 나머지는 앞 두 글자 */
const IOC2: Record<string, string> = {
    KOR: "KR", USA: "US", JPN: "JP", THA: "TH", CHN: "CN", ENG: "GB", SCO: "GB", WAL: "GB", NIR: "GB", GBR: "GB", AUS: "AU", CAN: "CA", NZL: "NZ",
    MEX: "MX", GER: "DE", SWE: "SE", RSA: "ZA", FRA: "FR", ESP: "ES", ITA: "IT", IRL: "IE", DEN: "DK", NED: "NL", BEL: "BE", NOR: "NO", FIN: "FI",
    AUT: "AT", SUI: "CH", ARG: "AR", COL: "CO", CHI: "CL", BRA: "BR", VEN: "VE", TPE: "TW", PHI: "PH", MAS: "MY", INA: "ID", IND: "IN", SGP: "SG",
    HKG: "HK", VIE: "VN", POR: "PT", POL: "PL", CZE: "CZ", ZIM: "ZW", FIJ: "FJ", PAR: "PY", PUR: "PR", DOM: "DO", CRC: "CR", GUA: "GT", URU: "UY",
    PER: "PE", ECU: "EC", TUR: "TR", ISR: "IL", UAE: "AE", QAT: "QA", KSA: "SA", EGY: "EG", MAR: "MA", NGR: "NG", KEN: "KE", ZAM: "ZM", BOT: "BW",
    NAM: "NA", SLO: "SI", CRO: "HR", SRB: "RS", HUN: "HU", SVK: "SK", ROU: "RO", BUL: "BG", GRE: "GR", ISL: "IS", LUX: "LU", LAT: "LV", LTU: "LT", EST: "EE",
    UKR: "UA", KAZ: "KZ", RUS: "RU", MGL: "MN", NEP: "NP", SRI: "LK", BAN: "BD", PAK: "PK", MYA: "MM", CAM: "KH", BRU: "BN",
};
export function iocToAlpha2(ioc: string): string {
    const k = (ioc || "").toUpperCase();
    return IOC2[k] ?? (k.length >= 2 ? k.slice(0, 2) : "");
}
