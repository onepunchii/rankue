// 국가별 세계랭킹(/world-ranking/country/:fed)·순위 변동(/world-ranking/movers) 공용 — 2026-09-24.
// 제목·설명·색인 기준·국가 이름을 화면(useSeo)·프리렌더(server/seo/rankingExtra.ts)·사이트맵이 **같은 함수**로 만든다.
// 봇과 사람이 다른 제목을 보면 클로킹이 되고, 색인 기준이 둘로 갈리면 사이트맵에 noindex 페이지가 올라간다.
// 여기 숫자는 전부 우리가 적재한 UMB 주간 회차(umb_rankings)에서 나온다 — 만든 값은 없다.

export type UmbCat = "players" | "ladies" | "juniors";

/** 남자 부문 등재 선수가 이 수 미만인 나라는 noindex·사이트맵 제외(얇은 페이지). */
export const COUNTRY_INDEX_MIN = 10;
/** 순위 변동 페이지는 남자 부문에서 순위가 바뀐 선수가 이 수 이상일 때만 색인한다. */
export const MOVERS_INDEX_MIN_CHANGED = 20;
/**
 * 상승·하락 목록은 상위 300위 안에서만 뽑는다(상승=현재 순위, 하락=직전 순위 기준).
 * 하위권은 2점짜리 선수 수백 명이 동점 처리 순서로 줄을 서 있어 남의 점수 한 번에 수백 계단씩 요동친다 —
 * 그 '상승'은 본인 성적이 아니다. 300 은 선수 페이지 사이트맵(부문별 톱 300)과 같은 선이다.
 */
export const MOVER_RANK_CUTOFF = 300;

export const MOVERS_PATH = "/world-ranking/movers";
export const countryPath = (fed: string) => `/world-ranking/country/${fed.toUpperCase()}`;

/** 주소 조각 → 국가 코드(대문자 두 글자). 모양이 아니면 null(=404). */
export function normalizeFed(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null;
}

// UMB 랭킹에 실제로 나오는 연맹 코드(2026-09 남자 57개국) + 여자·주니어·과거 회차에 나올 만한 나라. 없는 코드는 코드 그대로 쓴다.
export const UMB_FED_KO: Record<string, string> = {
  KR: "대한민국", TR: "튀르키예", VN: "베트남", CO: "콜롬비아", DE: "독일", ES: "스페인", GR: "그리스", NL: "네덜란드",
  US: "미국", JP: "일본", IT: "이탈리아", BE: "벨기에", MX: "멕시코", EG: "이집트", FR: "프랑스", VE: "베네수엘라",
  PE: "페루", PT: "포르투갈", SE: "스웨덴", CZ: "체코", EC: "에콰도르", DK: "덴마크", AT: "오스트리아", FI: "핀란드",
  GT: "과테말라", AR: "아르헨티나", BO: "볼리비아", NO: "노르웨이", CL: "칠레", LB: "레바논", CR: "코스타리카", ME: "몬테네그로",
  CY: "키프로스", HU: "헝가리", PA: "파나마", LU: "룩셈부르크", JO: "요르단", NI: "니카라과", CH: "스위스", AL: "알바니아",
  UY: "우루과이", LY: "리비아", MA: "모로코", DZ: "알제리", ZA: "남아프리카공화국", HR: "크로아티아", CN: "중국", SA: "사우디아라비아",
  IQ: "이라크", ID: "인도네시아", TN: "튀니지", KH: "캄보디아", SD: "수단", PL: "폴란드", SY: "시리아", PS: "팔레스타인",
  DO: "도미니카공화국", GB: "영국", IE: "아일랜드", RU: "러시아", UA: "우크라이나", IR: "이란", IN: "인도", PH: "필리핀",
  TH: "태국", TW: "대만", BR: "브라질", CA: "캐나다", AU: "호주", SI: "슬로베니아", SK: "슬로바키아", RS: "세르비아",
  BG: "불가리아", RO: "루마니아", AE: "아랍에미리트", KW: "쿠웨이트", QA: "카타르", SV: "엘살바도르", HN: "온두라스", PY: "파라과이",
  CU: "쿠바", PR: "푸에르토리코", BA: "보스니아 헤르체고비나", MK: "북마케도니아", IL: "이스라엘", SG: "싱가포르", MY: "말레이시아", MN: "몽골",
};
export const fedNameKo = (fed: string): string => UMB_FED_KO[fed.toUpperCase()] ?? fed.toUpperCase();

export const CAT_KO: Record<UmbCat, string> = { players: "남자", ladies: "여자", juniors: "주니어" };

/* ── 응답 모양(서버 umb.repo 가 만들고 화면·프리렌더가 읽는다) ── */

/** 한 선수의 두 회차 비교. rank=null 은 최신 회차에 없음(이탈), prevRank=null 은 직전 회차에 없음(신규). move = 직전 순위 − 현재 순위(+ 상승). */
export interface UmbMoveRow {
  playerUmbId: string;
  playerName: string;
  nativeName: string | null;
  fed: string;
  rank: number | null;
  prevRank: number | null;
  move: number | null;
  points: number | null;
  prevPoints: number | null;
}

export interface UmbCountrySection {
  category: UmbCat;
  edition: string;
  /** 회차 날짜 "YYYY-MM-DD"(UMB 발표일). Date 로 주고받으면 시간대에 따라 하루가 밀린다. */
  date: string;
  prevEdition: string | null;
  prevDate: string | null;
  /** 이 회차 전체 등재 인원 */
  worldTotal: number;
  /** 국가 랭킹표에서의 자리 — 앱 '국가' 탭과 같은 방식(getNations: 상위 5명 합산 포인트 내림차순, 같으면 최고 순위) */
  nationRank: number | null;
  nationCount: number;
  top5Points: number | null;
  total: number;
  top100: number;
  top300: number;
  /** 이 나라 선수 전원(순위순) */
  rows: UmbMoveRow[];
  risers: UmbMoveRow[];
  fallers: UmbMoveRow[];
  newCount: number;
}

export interface UmbCountryReport {
  fed: string;
  sections: UmbCountrySection[];
  /** 남자 국가 랭킹표 전체(다른 나라로 가는 링크용) — 코드·등재 인원·자리 */
  nations: Array<{ fed: string; players: number; pos: number }>;
}

export interface UmbMoversSection {
  category: UmbCat;
  edition: string;
  date: string;
  prevEdition: string;
  prevDate: string;
  total: number;
  changed: number;
  up: number;
  down: number;
  same: number;
  newCount: number;
  outCount: number;
  risers: UmbMoveRow[];
  fallers: UmbMoveRow[];
  entries: UmbMoveRow[];
  dropouts: UmbMoveRow[];
  kr: { total: number; up: number; down: number; same: number; newCount: number; outCount: number; rows: UmbMoveRow[] };
}

export interface UmbMoversReport {
  sections: UmbMoversSection[];
}

/* ── 표기 ── */

/** "2026-09-06" → "2026년 9월 6일". 문자열을 쪼개 읽는다(new Date 는 브라우저 시간대에 따라 하루 밀린다). */
export function editionDateKo(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : "";
}

/** 한국어 표기 이름 — 한글 이름이 있으면 한글(로마자), 없으면 로마자 */
export const nameFullKo = (r: { playerName: string; nativeName: string | null }) =>
  r.nativeName ? `${r.nativeName} (${r.playerName})` : r.playerName;
const nameShortKo = (r: { playerName: string; nativeName: string | null }) => r.nativeName || r.playerName;

/** 천 단위 쉼표. toLocaleString 은 ICU 가 빠진 런타임에서 모양이 달라질 수 있어 직접 찍는다(봇·사람 문자 단위 일치). */
export const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const sectionOf = <T extends { category: UmbCat }>(sections: T[], cat: UmbCat): T | undefined =>
  sections.find((s) => s.category === cat);

/* ── 국가 페이지 ── */

export function countryIndexable(r: UmbCountryReport): boolean {
  return (sectionOf(r.sections, "players")?.total ?? 0) >= COUNTRY_INDEX_MIN;
}

export const countryTitle = (fed: string) => `${fedNameKo(fed)} 당구 선수 세계랭킹 — UMB 3쿠션 | 랭큐`;
export const countryH1 = (fed: string) => `${fedNameKo(fed)} 당구 선수 세계랭킹 — UMB 3쿠션`;

/**
 * 설명 겸 본문 첫 문단. 남자 부문이 있으면 그 숫자로, 없으면 여자·주니어 인원으로.
 * 숫자를 앞에, 100자 안팎 — 국가 순위 셈법(상위 5명 합산)은 본문 표 머리말이 말한다(2026-09-24).
 */
export function countryDescription(r: UmbCountryReport): string {
  const name = fedNameKo(r.fed);
  const men = sectionOf(r.sections, "players");
  const others = r.sections.filter((s) => s.category !== "players").map((s) => `${CAT_KO[s.category]} ${s.total}명`);
  if (men && men.rows.length) {
    const best = men.rows[0];
    // 국가 순위는 남자 부문 셈이다(본문 "국가 순위(남자)") — '남자'를 순위 앞에 붙여야 전체 순위로 읽히지 않는다
    const lead = men.nationRank ? `${name} 3쿠션 남자 국가 순위 ${men.nationRank}위` : `${name} 3쿠션 남자 세계랭킹`;
    const parts = [
      `${lead} — ${num(men.total)}명 등재, 최고 ${nameShortKo(best)} ${best.rank}위${men.top100 > 0 ? `, 톱 100에 ${men.top100}명` : ""}.`,
      others.length ? `${others.join("·")}.` : "",
      `UMB ${editionDateKo(men.date)} 회차 기준.`,
    ];
    return parts.filter(Boolean).join(" ");
  }
  const first = r.sections[0];
  return `${name} 선수의 UMB 3쿠션 세계랭킹 — ${others.join("·")} 등재.${first ? ` ${editionDateKo(first.date)} 회차 기준.` : ""}`;
}

/* ── 순위 변동 페이지 ── */

export function moversIndexable(r: UmbMoversReport): boolean {
  return (sectionOf(r.sections, "players")?.changed ?? 0) >= MOVERS_INDEX_MIN_CHANGED;
}

export const MOVERS_TITLE = "당구 세계랭킹 순위 변동 — UMB 3쿠션 최신 회차 상승·하락 | 랭큐";
export const MOVERS_H1 = "당구 세계랭킹 순위 변동 — UMB 3쿠션 최신 회차";

/** 한국 선수 숫자를 앞에(국내 검색자가 먼저 찾는 것), 100자 안팎 — 직전 회차 날짜·상승/하락·신규 수는 본문 부문별 문단에 있다(2026-09-24). */
export function moversDescription(r: UmbMoversReport): string {
  const men = sectionOf(r.sections, "players");
  if (!men) return "UMB 3쿠션 세계랭킹 최신 회차와 직전 회차를 비교한 순위 상승·하락·신규 등재 선수.";
  const top = men.risers[0];
  const kr = men.kr;
  const krTxt = kr.up || kr.down ? ` — 한국 선수 ${kr.up}명 상승·${kr.down}명 하락,` : kr.same ? ` — 한국 선수 ${kr.same}명 순위 그대로,` : " —";
  const head = `UMB 3쿠션 남자 세계랭킹 ${editionDateKo(men.date)} 회차${krTxt} 전체 ${num(men.changed)}명 변동.`;
  // 상승 목록은 현재 300위 안에서만 뽑는다(MOVER_RANK_CUTOFF) — 문장에도 그 선을 적어야 '전체 1위 상승'으로 읽히지 않는다
  const riser = top ? ` ${MOVER_RANK_CUTOFF}위 안 최대 상승 ${nameShortKo(top)} ▲${top.move}(${top.rank}위).` : "";
  // 긴 로마자 이름이면 100자를 넘는다(9/6 회차 116자) — 그땐 뺀다. 그 선수는 본문 '가장 많이 오른 선수' 목록 맨 위에 있다
  return head.length + riser.length <= 100 ? head + riser : head;
}
