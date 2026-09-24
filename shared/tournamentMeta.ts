// 당구 대회 허브(/tournaments) · PBA 시즌·대회 · UMB 대회 페이지 공용(2026-09-24).
// 주소·제목·설명·색인 기준·JSON-LD 를 화면(useSeo)·프리렌더(server/seo/tournaments.ts)·사이트맵이 **같은 함수**로 만든다
// — 봇과 사람이 다른 제목을 보면 클로킹이 되고, 색인 기준이 둘로 갈리면 사이트맵에 noindex 페이지가 올라간다.
// 여기 숫자는 전부 우리가 적재한 행(pba_tournaments · umb_rankings · umb_events)과 공식 일정에서 나온다 — 만든 값은 없다.
import { parseEventLabel } from "./umbEventLabel.js";
import { formatPrizeKo } from "./pbaMeta.js";
import { CAT_KO, fedNameKo, num, type UmbCat } from "./umbCountryMeta.js";

const ORIGIN = "https://www.rankue.co.kr";

export const TOURNAMENTS_PATH = "/tournaments";
export const PBA_OFFICIAL_SCHEDULE = "https://www.pbatour.org/ko/tournament/schedule/index";
export const UMB_OFFICIAL = "https://www.umb-carom.org";
export const UMB_OFFICIAL_CALENDAR = "https://www.umb-carom.org/calendar";

/* ── PBA 리그 ── */

export const PBA_TOUR_LEAGUES = ["PBA", "LPBA", "DREAM", "CHALLENGE", "TEAM"] as const;
export type PbaTourLeague = (typeof PBA_TOUR_LEAGUES)[number];
export const PBA_LEAGUE_KO: Record<PbaTourLeague, string> = {
    PBA: "PBA", LPBA: "LPBA", DREAM: "드림투어", CHALLENGE: "챌린지투어", TEAM: "팀리그",
};

/**
 * 공식 코드 → 우리 리그. 일정의 LEAGUE_GUBUN(PBA1·LPBA1·PBA2·PBA3·TLG)과 투어 목록의 PBA타입(PBA·LPBA·PBA2·PBA3)을 같이 받는다.
 * 모르는 코드는 null — 뜻을 모르는 리그를 아무 칸에나 넣지 않는다.
 */
export function pbaLeagueOf(raw: unknown): PbaTourLeague | null {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "PBA1" || s === "PBA") return "PBA";
    if (s === "LPBA1" || s === "LPBA") return "LPBA";
    if (s === "PBA2") return "DREAM";
    if (s === "PBA3") return "CHALLENGE";
    if (s === "TLG") return "TEAM";
    return null;
}

/* ── 행 모양(서버 저장소가 만들고 화면·프리렌더가 읽는다) ── */

export interface PbaTourRow {
    /** 공식 투어 코드. 팀리그·코드 없는 예정 대회는 null — 그런 행은 자기 페이지가 없다 */
    tourCode: number | null;
    season: number;
    league: PbaTourLeague;
    title: string;
    titleEn: string | null;
    startDate: string; // YYYY-MM-DD
    endDate: string;
    place: string | null;
    totalPrize: number | null;
    winnerPrize: number | null;
    /** 공식 표기 그대로("산체스", "김현우1") */
    winnerName: string | null;
    /** pba_players 와 하나로만 맞았을 때만 — 선수 페이지 링크 */
    winnerMemCode: string | null;
    participants: number | null;
    officialSeq: string | null;
}

export type TourStatus = "upcoming" | "live" | "finished";
/** today = 한국 날짜(YYYY-MM-DD). 대회 날짜가 한국 날짜라 기기 시간대로 재면 하루 어긋난다. */
export function tourStatus(r: { startDate: string; endDate: string }, today: string): TourStatus {
    if (r.endDate < today) return "finished";
    if (r.startDate <= today) return "live";
    return "upcoming";
}
/** 자기 페이지(/tournaments/pba/:season/:tourCode)가 있는 행 — 코드가 있는 개인 투어만 */
export const hasTourPage = (r: Pick<PbaTourRow, "tourCode" | "league">): r is PbaTourRow & { tourCode: number } =>
    r.tourCode !== null && r.league !== "TEAM";

export interface PbaWinnerProfile {
    memCode: string;
    league: "PBA" | "LPBA";
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    /** 아래는 전부 **통산** 기록(pba_players) — 이 대회 기록이 아니다 */
    average: number | null;
    highRun: number | null;
    bankShotRate: number | null;
    win: number | null;
    lose: number | null;
    draw: number | null;
    careerPrize: number | null;
}

export interface PbaSeasonPage {
    season: number;
    /** 행이 있는 시즌 전부(내림차순) — 시즌 전환 칩 */
    seasons: number[];
    /** 날짜 오름차순 */
    tours: PbaTourRow[];
    today: string;
}

export interface PbaTourPage {
    tour: PbaTourRow;
    today: string;
    winner: PbaWinnerProfile | null;
    /** 같은 대회(pbaEventKey 가 같고 리그가 같은 행)의 역대 기록 — 최신 먼저, 이 대회 포함. 묶을 수 없으면 빈 배열 */
    history: PbaTourRow[];
    /** 같은 시즌·같은 리그에서 바로 앞·뒤 대회(자기 페이지가 있는 것만) */
    prev: PbaTourRow | null;
    next: PbaTourRow | null;
}

/* ── UMB ── */

export interface UmbEventSummary {
    slug: string;
    kind: "worldcup" | "worldchamp";
    /** 주관 연맹(CEB·ACBC·AMECC·CPB) · 세계선수권은 UMB */
    org: string | null;
    city: string;
    /** 두 글자 국가 코드 */
    country: string;
    /** 라벨에 적힌 대회일(세계선수권은 마지막 날) */
    date: string;
    /** 포인트 표가 있는 부문 — 남자 먼저 */
    categories: UmbCat[];
    /** 가장 큰 부문에서 이 대회 포인트를 받은 선수 수 */
    players: number;
}

export interface UmbEventRow {
    playerUmbId: string;
    playerName: string;
    nativeName: string | null;
    fed: string;
    points: number;
}

export interface UmbEventSection {
    category: UmbCat;
    /** 이 대회 열이 남아 있는 가장 최근 회차 — 포인트를 읽은 곳 */
    edition: string;
    editionDate: string;
    label: string;
    /** 포인트 내림차순(같으면 이름순). 순위가 아니다 — UMB 는 대회 순위를 따로 주지 않는다 */
    rows: UmbEventRow[];
}

export interface UmbEventDetail extends UmbEventSummary {
    sections: UmbEventSection[];
    /** 같은 대회의 다른 해(월드컵은 같은 도시, 세계선수권은 같은 부문) — 최신 먼저 */
    others: UmbEventSummary[];
}

/** UMB 공식 달력의 한 줄(umb-carom.org/calendar) — 사실 정보만 */
export interface UmbCalendarItem {
    startDate: string;
    endDate: string;
    name: string;
    /** 도시 — 공식이 "N/A" 로 적은 미정은 null */
    city: string | null;
    /** 공식 표기 영어 국가명("Korea") */
    country: string | null;
    /** 국가명을 알아본 경우의 두 글자 코드 */
    countryCode: string | null;
    type: string | null;
    organization: string | null;
    postponed: boolean;
}

/** 허브의 '다가오는 대회' 한 줄 — PBA 일정과 UMB 달력을 같은 모양으로 */
export interface UpcomingEvent {
    source: "PBA" | "UMB";
    /** PBA 만 */
    league: PbaTourLeague | null;
    /** UMB 만 — 공식 종류("World Cup") */
    kind: string | null;
    title: string;
    titleEn: string | null;
    startDate: string;
    endDate: string;
    /** PBA 장소 / UMB 도시 */
    place: string | null;
    countryCode: string | null;
    country: string | null;
    org: string | null;
    postponed: boolean;
    /** 우리 대회 페이지(코드가 있는 PBA 투어만) */
    href: string | null;
    officialUrl: string;
}

export interface TournamentHub {
    today: string;
    upcoming: UpcomingEvent[];
    /** UMB 달력을 못 읽었으면 false — '예정 없음'과 '불러오기 실패'를 가른다 */
    umbCalendarOk: boolean;
    /** 최신 시즌 먼저. tours·finished 는 공식 일정 줄 전부(팀리그·예정 포함), winners 는 1부(PBA·LPBA) 우승자만 */
    pbaSeasons: Array<{ season: number; tours: number; finished: number; winners: PbaTourRow[] }>;
    /** 최신 해 먼저 */
    umbYears: Array<{ year: string; events: UmbEventSummary[] }>;
}

/* ── 주소 ── */

export const pbaSeasonPath = (season: number) => `${TOURNAMENTS_PATH}/pba/${season}`;
export const pbaTourPath = (season: number, tourCode: number) => `${TOURNAMENTS_PATH}/pba/${season}/${tourCode}`;
export const umbEventPath = (slug: string) => `${TOURNAMENTS_PATH}/umb/${slug}`;
/** 공식 대회 안내 — 공식 일정이 '자세히보기'를 여는 대회만 seq 가 있다. 없으면 공식 전체 일정 */
export const pbaOfficialUrl = (seq: string | null | undefined) =>
    seq ? `https://www.pbatour.org/ko/tournament/info/index?seq=${encodeURIComponent(seq)}` : PBA_OFFICIAL_SCHEDULE;

/** 주소의 시즌 조각 — 2019(PBA 출범)부터 2100 까지의 네 자리만 */
export function parseSeasonSeg(seg: string | undefined): number | null {
    if (!seg || !/^\d{4}$/.test(seg)) return null;
    const n = Number(seg);
    return n >= 2019 && n <= 2100 ? n : null;
}
export function parseTourCodeSeg(seg: string | undefined): number | null {
    if (!seg || !/^\d{1,6}$/.test(seg)) return null;
    const n = Number(seg);
    return n > 0 ? n : null;
}

/* ── UMB 슬러그 ── */

const KIND_SLUG = { worldcup: "world-cup", worldchamp: "world-championship" } as const;
export const UMB_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}$/;

/**
 * 라벨 → 주소 조각. 종류 + 도시 + 날짜(shared/umbEventLabel 파싱)라 회차가 바뀌어도 같은 대회는 같은 주소다.
 * "UMB / CEB World Cup - ANTWERP (BE) 2025-10-12" → "world-cup-antwerp-2025-10-12".
 * 대륙·국가선수권(도시·날짜 없음)과 날짜를 못 읽는 라벨은 null — 자기 페이지를 만들지 않는다.
 */
export function umbEventSlug(label: string): string | null {
    const p = parseEventLabel(label);
    if ((p.kind !== "worldcup" && p.kind !== "worldchamp") || !p.city || !p.date || !p.country) return null;
    const city = p.city.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return city ? `${KIND_SLUG[p.kind]}-${city}-${p.date}` : null;
}

/* ── 같은 PBA 대회 묶기 ── */

// 스폰서 이름 앞에 붙는 광고 문구 — 실측한 것만(2025-26·2026-27 일정). 스폰서 이름 자체는 건드리지 않는다.
const AD_SLOGANS = ["올바른 생활카드", "국민의 행복쉼터", "친환경 건축자재"];

/**
 * 같은 대회(해마다 열리는 같은 스폰서 대회)의 열쇠. 역대 우승자를 묶는 데만 쓴다.
 *
 * 걷어 내는 것 — 해마다 바뀌거나 대회 정체와 상관없는 조각:
 *   연도·시즌("2025", "2025-26", "21-22", "2019-2020", "2021년"), 괄호 메모("(연기)", "[잔여경기]"),
 *   "@태백" 같은 장소 꼬리표, "한가위" 같은 회차 별칭, 리그 표기(PBA·LPBA — 리그는 따로 맞춘다),
 *   띄어쓰기("월드 챔피언십" = "월드챔피언십"), 위 광고 문구.
 * 남기는 것: 스폰서 이름 — PBA 는 스폰서가 곧 대회 이름이다(휴온스 챔피언십 ≠ 하림 챔피언십).
 * 예외: 월드챔피언십은 시즌 마지막 대회 하나뿐이라 스폰서가 바뀌어도(SK렌터카 → 하나카드) 같은 대회다.
 * 확신이 없으면 묶지 않는다(null): PBA·LPBA 가 아닌 리그(드림투어 "3차전"은 해마다 다른 대회),
 *   "PBA 제4차 투어" 같은 미정 이름, 큐스쿨(선발전), 남는 글자가 없는 이름.
 * 표기가 바뀐 스폰서("웰컴저축은행 웰뱅" → "웰컴저축은행", "SY" → "에스와이")는 일부러 못 묶은 채 둔다 — 틀리게 묶는 것보다 낫다.
 */
export function pbaEventKey(title: string, league: PbaTourLeague): string | null {
    if (league !== "PBA" && league !== "LPBA") return null;
    let s = (title ?? "").normalize("NFC");
    for (const a of AD_SLOGANS) s = s.split(a).join(" ");
    s = s
        .replace(/[([][^)\]]*[)\]]/g, " ")
        .replace(/@\S+/g, " ")
        .replace(/(?:19|20)?\d{2}\s*-\s*(?:19|20)?\d{2}(?!\d)/g, " ")
        .replace(/(?:19|20)\d{2}년?/g, " ")
        .replace(/한가위/g, " ")
        .replace(/L?PBA/gi, " ");
    const key = s.replace(/\s+/g, "").toLowerCase();
    if (!key) return null;
    if (key.includes("월드챔피언십")) return "월드챔피언십";
    if (/제?\d+차(?:투어|전)?$/.test(key) || /^투어$/.test(key)) return null;
    if (/q-?school|큐스쿨/.test(key)) return null;
    return key;
}

/* ── 표기 ── */

/** 2025 → "2025-26" */
export const seasonLabelFull = (s: number) => `${s}-${String(s + 1).slice(2)}`;

const ymd = (d: string) => d.split("-").map(Number) as [number, number, number];

/** "2025년 10월 22일 ~ 28일" · 달이 바뀌면 "~ 11월 2일" · 해가 바뀌면 연도까지 */
export function dateRangeKo(start: string, end: string): string {
    const [ys, ms, ds] = ymd(start);
    const [ye, me, de] = ymd(end);
    if (start === end) return `${ys}년 ${ms}월 ${ds}일`;
    if (ys !== ye) return `${ys}년 ${ms}월 ${ds}일 ~ ${ye}년 ${me}월 ${de}일`;
    if (ms !== me) return `${ys}년 ${ms}월 ${ds}일 ~ ${me}월 ${de}일`;
    return `${ys}년 ${ms}월 ${ds}일 ~ ${de}일`;
}

/** "10.22 – 10.28" (연도 없이, 언어 중립) */
export function shortRange(start: string, end: string): string {
    const f = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
    return start === end ? f(start) : `${f(start)} – ${f(end)}`;
}

/** 원 단위 상금 → "2억 5,000만원" */
export const prizeKo = (n: number) => `${formatPrizeKo(n)}원`;

/** 연도·시즌 표기가 없는 대회명에는 시즌을 붙인다 — "휴온스 PBA 챔피언십"은 해마다 같은 이름이라 제목이 겹친다 */
export function tourNameWithSeason(r: Pick<PbaTourRow, "title" | "season">): string {
    return /\d{4}|\d{2}-\d{2}/.test(r.title) ? r.title : `${r.title} ${seasonLabelFull(r.season)}`;
}

// 도시 한글 표기 — 국내 당구 기사에서 쓰는 표기로 확신하는 것만. 없으면 영어 그대로.
const CITY_KO: Record<string, string> = {
    Antwerp: "앤트워프", Porto: "포르투", Ankara: "앙카라", "Ho Chi Minh City": "호치민", Seoul: "서울", Gwangju: "광주",
    Bogota: "보고타", "Sharm El Sheikh": "샤름엘셰이크", Veghel: "베겔", "Las Vegas": "라스베이거스", Murcia: "무르시아",
    Blois: "블루아", "Binh Thuan": "빈투안", Cartagena: "카르타헤나", Viersen: "피어젠", Istanbul: "이스탄불", Hurghada: "후르가다",
};
export const cityKo = (city: string) => CITY_KO[city] ?? city;

export const UMB_KIND_KO = { worldcup: "월드컵", worldchamp: "세계선수권" } as const;

/**
 * 주니어 세계선수권 — 남자 표 없이 주니어 표만 있는 **세계선수권**. 월드컵은 남녀노소가 같은 대회에 나와서
 * 주니어 표만 남은 월드컵(남자 회차를 2025-02 부터만 보관)도 '주니어 월드컵'이 아니다.
 */
export const isJuniorEvent = (e: Pick<UmbEventSummary, "kind" | "categories">) =>
    e.kind === "worldchamp" && !e.categories.includes("players") && e.categories.includes("juniors");

/** "2025 앤트워프 3쿠션 월드컵" · "2025 무르시아 주니어 3쿠션 세계선수권" */
export function umbEventName(e: Pick<UmbEventSummary, "kind" | "city" | "date" | "categories">): string {
    return `${e.date.slice(0, 4)} ${cityKo(e.city)} ${isJuniorEvent(e) ? "주니어 " : ""}3쿠션 ${UMB_KIND_KO[e.kind]}`;
}

/** 이름 표기 — 한글 이름이 있으면 한글(로마자) */
export const umbRowNameKo = (r: Pick<UmbEventRow, "playerName" | "nativeName">) =>
    r.nativeName ? `${r.nativeName} (${r.playerName})` : r.playerName;

/** 대표 부문 — 남자가 있으면 남자, 아니면 첫 부문 */
export const primarySection = (d: Pick<UmbEventDetail, "sections">): UmbEventSection | undefined =>
    d.sections.find((s) => s.category === "players") ?? d.sections[0];

/* ── 색인 기준 ── */

/** 시즌 페이지: 자기 페이지가 있는 투어가 이만큼 있어야 색인(대회 한두 개짜리 시즌 = 얇은 페이지) */
export const SEASON_INDEX_MIN_TOURS = 3;
/** UMB 대회: 포인트를 받은 선수가 이만큼 있어야 색인 — 주니어 월드컵 열(4~8명)은 표가 얇다 */
export const UMB_EVENT_INDEX_MIN_PLAYERS = 16;

export const seasonTourCount = (tours: PbaTourRow[]) => tours.filter(hasTourPage).length;
export const seasonIndexable = (p: Pick<PbaSeasonPage, "tours">) => seasonTourCount(p.tours) >= SEASON_INDEX_MIN_TOURS;
/**
 * 대회 페이지: **PBA·LPBA 1부**가 끝났고 우승자가 있어야 색인. 예정·진행 중은 noindex(내용이 날마다 바뀌고 얇다).
 * 드림·챌린지 투어는 우승자 이름 한 줄이 거의 전부(프로필 연결·상금이 대개 없다) — 얇은 페이지라 사람에게만 보이고 색인하지 않는다(2026-09-24 리드 판단).
 */
export const tourIndexable = (r: PbaTourRow, today: string) =>
    (r.league === "PBA" || r.league === "LPBA") && tourStatus(r, today) === "finished" && !!r.winnerName;
export const umbEventIndexable = (e: Pick<UmbEventSummary, "players">) => e.players >= UMB_EVENT_INDEX_MIN_PLAYERS;

/* ── 제목·설명 ── */

export const HUB_TITLE = "당구 대회 일정·결과 — PBA·UMB 3쿠션 대회 | 랭큐";
export const HUB_H1 = "당구 대회 일정·결과";

export function hubDescription(h: TournamentHub): string {
    const seasons = h.pbaSeasons.map((s) => s.season);
    const tours = h.pbaSeasons.reduce((n, s) => n + s.tours, 0);
    const umb = h.umbYears.reduce((n, y) => n + y.events.length, 0);
    const span = seasons.length ? `PBA ${seasonLabelFull(Math.min(...seasons))} ~ ${seasonLabelFull(Math.max(...seasons))} 시즌 대회 ${num(tours)}개` : "";
    const tail = [span, umb ? `UMB 3쿠션 대회 ${num(umb)}개` : ""].filter(Boolean).join(" · ");
    return `PBA·LPBA 프로당구와 UMB 3쿠션 월드컵·세계선수권의 다가오는 대회 일정, 지난 대회 우승자와 선수별 랭킹 포인트를 한곳에 모았습니다.${tail ? ` ${tail}.` : ""}`;
}

export const seasonTitle = (season: number) => `${seasonLabelFull(season)} PBA 투어 대회 일정·우승자 | 랭큐`;
export const seasonH1 = (season: number) => `${seasonLabelFull(season)} PBA 투어 대회 일정·우승자`;

export function seasonDescription(p: Pick<PbaSeasonPage, "season" | "tours">): string {
    const by = PBA_TOUR_LEAGUES
        .map((lg) => [lg, p.tours.filter((t) => t.league === lg).length] as const)
        .filter(([, n]) => n > 0)
        .map(([lg, n]) => `${PBA_LEAGUE_KO[lg]} ${n}`)
        .join(" · ");
    const won = p.tours.filter((t) => t.winnerName).length;
    return `${seasonLabelFull(p.season)} 시즌 프로당구 대회 ${p.tours.length}개(${by})의 일정·장소·상금과 우승자를 정리했습니다.${won ? ` 우승자가 나온 대회 ${won}개.` : ""}`;
}

/** 제목은 페이지에 실제로 있는 것만 말한다 — 상금을 모르는 대회(투어 목록에만 있는 2019 대회 등)에 '상금'을 달지 않는다 */
export function tourTitle(r: PbaTourRow): string {
    const prize = r.totalPrize || r.winnerPrize ? "·상금" : "";
    return r.winnerName ? `${tourNameWithSeason(r)} 우승자${prize}·일정 | 랭큐` : `${tourNameWithSeason(r)} 일정${prize} | 랭큐`;
}

/** 우승자 표시 이름 — 선수 행과 맞았으면 그 이름(“다니엘 산체스”), 아니면 공식 표기 그대로 */
export const winnerDisplay = (p: Pick<PbaTourPage, "tour" | "winner">) => p.winner?.nameKo ?? p.tour.winnerName ?? "";

export function tourFacts(r: PbaTourRow): string[] {
    return [
        dateRangeKo(r.startDate, r.endDate),
        r.place ?? "",
        r.totalPrize ? `총상금 ${prizeKo(r.totalPrize)}` : "",
        r.winnerPrize ? `우승상금 ${prizeKo(r.winnerPrize)}` : "",
        r.participants ? `${num(r.participants)}명 참가` : "",
    ].filter(Boolean);
}

export function tourDescription(p: Pick<PbaTourPage, "tour" | "winner" | "today">): string {
    const r = p.tour;
    const head = `${tourNameWithSeason(r)} — ${seasonLabelFull(r.season)} 시즌 ${PBA_LEAGUE_KO[r.league]}`;
    const facts = tourFacts(r).join(" · ");
    const st = tourStatus(r, p.today);
    if (r.winnerName) return `${head} 우승자 ${winnerDisplay(p)}. ${facts}.`;
    if (st === "finished") return `${head} 대회 기록. ${facts}.`;
    return `${head} 대회 일정. ${facts}.`;
}

export const umbEventTitle = (e: UmbEventSummary) => `${umbEventName(e)} 선수별 랭킹 포인트 | 랭큐`;

export function umbEventDescription(d: UmbEventDetail): string {
    const sec = primarySection(d);
    const rows = sec?.rows ?? [];
    const kr = rows.filter((r) => r.fed === "KR");
    const [y, m] = ymd(d.date);
    const where = `${y}년 ${m}월 ${cityKo(d.city)}(${fedNameKo(d.country)})`;
    const org = d.org && d.org !== "UMB" ? `(${d.org} 주관)` : "";
    const krTxt = kr.length ? ` 한국 선수 ${kr.length}명 — 최고 ${umbRowNameKo(kr[0])} ${num(kr[0].points)}점.` : "";
    // 남자 표가 없으면(남자 회차는 2025-02 부터 보관) 어느 랭킹의 포인트인지 밝힌다
    const cat = sec && sec.category !== "players" ? `${CAT_KO[sec.category]} ` : "";
    return `${where}에서 열린 UMB ${isJuniorEvent(d) ? "주니어 " : ""}3쿠션 ${UMB_KIND_KO[d.kind]}${org}에서 ${cat}세계랭킹 포인트를 받은 선수 ${num(rows.length)}명을 포인트 순으로 정리했습니다.${krTxt} 대회 순위가 아니라 UMB 랭킹 포인트 기준입니다.`;
}

/* ── 구조화데이터 ── 화면은 useSeo 에 객체 하나만 넘길 수 있어 @graph 로 묶는다. 프리렌더도 같은 객체를 싣는다. */

const crumbs = (items: Array<{ name: string; path: string }>) => ({
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
});
// 보이는 경로(프리렌더 본문 "랭큐 › 당구 대회 › …")와 같은 줄 — 모든 페이지가 홈에서 시작한다
const HOME_CRUMB = { name: "랭큐", path: "/" };
const HUB_CRUMB = { name: "당구 대회", path: TOURNAMENTS_PATH };

export function hubJsonLd(h: TournamentHub): object {
    return {
        "@context": "https://schema.org",
        "@graph": [
            crumbs([HOME_CRUMB, HUB_CRUMB]),
            {
                "@type": "ItemList",
                name: "PBA 투어 시즌별 대회",
                itemListElement: h.pbaSeasons.map((s, i) => ({
                    "@type": "ListItem", position: i + 1, name: `${seasonLabelFull(s.season)} PBA 투어`, url: `${ORIGIN}${pbaSeasonPath(s.season)}`,
                })),
            },
        ],
    };
}

export function seasonJsonLd(p: PbaSeasonPage): object {
    const withPage = p.tours.filter(hasTourPage);
    return {
        "@context": "https://schema.org",
        "@graph": [
            crumbs([HOME_CRUMB, HUB_CRUMB, { name: `${seasonLabelFull(p.season)} PBA 투어`, path: pbaSeasonPath(p.season) }]),
            {
                "@type": "ItemList",
                name: seasonH1(p.season),
                itemListElement: withPage.map((t, i) => ({
                    "@type": "ListItem", position: i + 1, name: t.title, url: `${ORIGIN}${pbaTourPath(t.season, t.tourCode)}`,
                })),
            },
        ],
    };
}

export function tourJsonLd(p: PbaTourPage): object {
    const r = p.tour;
    const url = r.tourCode !== null ? `${ORIGIN}${pbaTourPath(r.season, r.tourCode)}` : `${ORIGIN}${pbaSeasonPath(r.season)}`;
    return {
        "@context": "https://schema.org",
        "@graph": [
            crumbs([
                HOME_CRUMB,
                HUB_CRUMB,
                { name: `${seasonLabelFull(r.season)} PBA 투어`, path: pbaSeasonPath(r.season) },
                { name: r.title, path: r.tourCode !== null ? pbaTourPath(r.season, r.tourCode) : pbaSeasonPath(r.season) },
            ]),
            {
                "@type": "SportsEvent",
                name: r.title,
                url,
                sport: "Carom billiards",
                startDate: r.startDate,
                endDate: r.endDate,
                eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
                // 공식 이름에 "(연기)" 가 붙은 대회(2019-20 파이널)만 연기로 적는다 — 그 밖의 상태는 모른다
                eventStatus: /\(연기\)/.test(r.title) ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
                // Place 는 address 가 있어야 행사 구조화데이터로 읽힌다 — 공식 장소 표기를 그대로 주소 글로도 싣는다(지어낸 주소 없음)
                ...(r.place ? { location: { "@type": "Place", name: r.place, address: r.place } } : {}),
                organizer: { "@type": "Organization", name: "프로당구협회(PBA)", url: "https://www.pbatour.org" },
            },
        ],
    };
}

export function umbEventJsonLd(d: UmbEventDetail): object {
    const sec = primarySection(d);
    return {
        "@context": "https://schema.org",
        "@graph": [
            crumbs([HOME_CRUMB, HUB_CRUMB, { name: umbEventName(d), path: umbEventPath(d.slug) }]),
            ...(sec && sec.rows.length ? [{
                "@type": "ItemList",
                name: `${umbEventName(d)} — 세계랭킹 포인트를 받은 선수`,
                itemListElement: sec.rows.slice(0, 20).map((x, i) => ({
                    "@type": "ListItem", position: i + 1, name: x.nativeName || x.playerName,
                    url: `${ORIGIN}/player/${sec.category}/${encodeURIComponent(x.playerUmbId)}`,
                })),
            }] : []),
        ],
    };
}
