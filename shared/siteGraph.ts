// 사이트 공통 검색 조각(2026-09-24) — 브랜드 꼬리말, 홈 @graph·소유확인 메타, 그리고 화면(useSeo)과 프리렌더(server/prerender.ts)가
// **같이 부르는** 제목·설명 함수. 봇과 사람이 다른 제목을 보면 클로킹이 된다 — 문자열은 여기 한 곳에서만 만든다.
// 숫자는 전부 우리가 적재한 랭킹 행에서 온다. 행에 없는 사실은 문장에서 뺀다(지어낸 값 없음).
import { CAT_KO, fedNameKo, type UmbCat } from "./umbCountryMeta.js";
import { GOLF_TOUR_META, formatRankValue, type GolfTour } from "./golfTours.js";

export const SITE_ORIGIN = "https://www.rankue.co.kr";

/* ── 브랜드 꼬리말 ── */

// 2026-09-24 감사: 제목 꼬리말이 다섯 가지("| 랭큐 RANKUE"·"| 랭큐"·"| 랭큐 골프"·…)로 갈려 있었다.
// 당구는 BRAND_KO, 골프(골프 랭킹·골퍼·골프장)는 BRAND_GOLF_KO 하나로. 홈·소개만 예외(브랜드 검색 착지점).
export const BRAND_KO = " | 랭큐";
export const BRAND_GOLF_KO = " | 랭큐 골프";
/** 한국어가 아닌 언어판 꼬리말 */
export const BRAND_INTL = " | RANKUE";

/* ── 홈 @graph · 소유확인 ── */

// client/index.html 의 JSON-LD 와 **같은 값**이어야 한다(shared/siteGraph.test.ts 가 둘을 대조한다).
// 봇 홈(server/prerender.ts "/")이 정적 셸을 통째로 대체하므로, 여기서 빠지면 구글이 사이트 이름("랭큐")을 고를 근거가 사라진다.
const ORG_ID = `${SITE_ORIGIN}/#organization`;

export const SITE_ORGANIZATION = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "RANKUE",
  alternateName: "랭큐",
  url: `${SITE_ORIGIN}/`,
  logo: `${SITE_ORIGIN}/icon-192.png`,
  image: `${SITE_ORIGIN}/og.png`,
  description: "스마트폰으로 당구 점수를 기록·관리하는 손안의 당구 점수판. 당구 매칭과 크루(당구 커뮤니티), 매장·전국 랭킹을 함께 제공합니다.",
};

// 검색결과 사이트 이름은 WebSite.name 하나로 정한다 — 한국어 결과에 "랭큐"가 나오게(2026-09-24).
export const SITE_WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_ORIGIN}/#website`,
  url: `${SITE_ORIGIN}/`,
  name: "랭큐",
  alternateName: ["RANKUE", "랭큐 RANKUE"],
  publisher: { "@id": ORG_ID },
  inLanguage: ["ko", "en", "vi", "tr", "es"],
};

export const SITE_APP = {
  "@type": "MobileApplication",
  "@id": `${SITE_ORIGIN}/#app`,
  name: "RANKUE 랭큐",
  operatingSystem: "iOS, Android",
  applicationCategory: "SportsApplication",
  url: `${SITE_ORIGIN}/`,
  inLanguage: ["ko", "en", "vi", "tr", "es"],
  publisher: { "@id": ORG_ID },
  description: "스마트폰으로 당구 점수를 간편하게 기록하는 손안의 당구 점수판. 이닝·평균(에버리지)·하이런 자동 계산과 음성 안내, 상대와의 매칭 경기, 자동 전적 기록, 당구 동호회를 꾸리는 크루(당구 커뮤니티), 3쿠션·4구 매장·전국 랭킹.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
};

export const SITE_GRAPH_LD = { "@context": "https://schema.org", "@graph": [SITE_ORGANIZATION, SITE_WEBSITE, SITE_APP] };

// 네이버 서치어드바이저(2)·구글 서치 콘솔(1) 소유확인. 봇 홈이 이걸 빠뜨리면 재확인 때 소유확인이 풀릴 수 있다.
export const SITE_VERIFICATION_META: ReadonlyArray<{ name: string; content: string }> = [
  { name: "naver-site-verification", content: "2e7af38e33b85d732c6cbdc50728f72e0ee2480e" },
  { name: "naver-site-verification", content: "921330879833dc13b92ea6e0ff5bcb203e2120a7" },
  { name: "google-site-verification", content: "jLYgi_u7y3J0WorGpD1ODFy7tZ4FZmE8KT4BaGPnRCM" },
];

/* ── 당구 세계랭킹 허브 · UMB 선수 페이지 언어판 ── */

// 언어판은 ko·en·tr·vi·es — 그 밖의 ?lang= 은 ko 로 떨어진다(프리렌더와 같은 규칙).
export const UMB_SEO_LANGS = ["ko", "en", "tr", "vi", "es"] as const;
export type UmbSeoLang = (typeof UMB_SEO_LANGS)[number];
const umbLang = (lang: string): UmbSeoLang => ((UMB_SEO_LANGS as readonly string[]).includes(lang) ? (lang as UmbSeoLang) : "ko");

export const WR_TITLE_KO = `당구 세계랭킹 — UMB 공식 3쿠션 랭킹${BRAND_KO}`;
export const WR_DESC_KO = "UMB 공식 3쿠션 세계랭킹을 매주 업데이트. 남자·여자·주니어 전체 순위, 한국 선수, 순위 변동과 선수별 히스토리를 한눈에.";

// 2026-09-24: 화면은 언어와 상관없이 한국어 제목을 달았다(?lang=en 봇은 영어) — 언어판 문안도 여기 한 곳에 둔다.
const WR_SEO: Record<UmbSeoLang, { title: string; desc: string }> = {
  ko: { title: WR_TITLE_KO, desc: WR_DESC_KO },
  en: {
    title: `Billiards World Ranking — Official UMB 3-Cushion Rankings${BRAND_INTL}`,
    desc: "Official UMB 3-cushion world rankings, updated weekly. Full men's, women's and junior standings with per-player rank history on RANKUE.",
  },
  tr: {
    title: `Bilardo Dünya Sıralaması — Resmî UMB 3 Bant Sıralaması${BRAND_INTL}`,
    desc: "Resmî UMB 3 bant dünya sıralaması, her hafta güncellenir. Erkekler, kadınlar ve gençler tam sıralama ve oyuncu bazlı sıralama geçmişi RANKUE'de.",
  },
  vi: {
    title: `BXH Bida Thế giới — BXH 3 băng chính thức của UMB${BRAND_INTL}`,
    desc: "BXH bida 3 băng thế giới chính thức của UMB, cập nhật hằng tuần. Đầy đủ nam, nữ, trẻ và diễn biến thứ hạng từng cơ thủ trên RANKUE.",
  },
  es: {
    title: `Ranking Mundial de Billar — Ranking oficial UMB de tres bandas${BRAND_INTL}`,
    desc: "Ranking mundial oficial UMB de billar a tres bandas, actualizado cada semana. Clasificación completa masculina, femenina y juvenil en RANKUE.",
  },
};
/** /world-ranking 제목·설명 — 프리렌더(WR_L10N)와 화면(world-ranking.tsx)이 같이 부른다 */
export const worldRankingSeo = (lang: string): { title: string; desc: string } => WR_SEO[umbLang(lang)];

/* ── UMB 선수 페이지(/player/:category/:umbId) ── */

export interface UmbPlayerSeo {
  category: UmbCat;
  playerName: string;
  nativeName?: string | null;
  fed: string;
  rank: number;
  points: number;
  bestRank: number;
  nationalRank?: number | null;
}

/** 부문 이름 — 한국어가 아닌 언어판. 설명에서는 소문자로 쓴다(기존 문안 그대로). */
export const UMB_CAT_INTL: Record<Exclude<UmbSeoLang, "ko">, Record<UmbCat, string>> = {
  en: { players: "Men's", ladies: "Women's", juniors: "Junior" },
  tr: { players: "Erkekler", ladies: "Kadınlar", juniors: "Gençler" },
  vi: { players: "Nam", ladies: "Nữ", juniors: "Trẻ" },
  es: { players: "Masculino", ladies: "Femenino", juniors: "Juvenil" },
};

/**
 * 한국어: 이름(한글이 있으면 한글만) + 순위 + 점수를 35자 안쪽에. 영문 이름은 설명으로 옮겼다(2026-09-24 — 영문이 붙어 순위가 잘렸다).
 * 여자·주니어는 부문을 넣는다 — 같은 선수의 남자·주니어 페이지가 같은 제목이 되지 않게. 0점은 적지 않는다.
 */
export function umbPlayerTitle(lang: string, p: UmbPlayerSeo): string {
  const l = umbLang(lang);
  if (l === "ko") {
    const cat = p.category === "players" ? "" : `${CAT_KO[p.category]} `;
    return `${p.nativeName || p.playerName} 3쿠션 ${cat}세계랭킹 ${p.rank}위${p.points > 0 ? ` · ${p.points}점` : ""}${BRAND_KO}`;
  }
  const n = p.playerName;
  const r = p.rank;
  switch (l) {
    case "en": return `${n} — 3-Cushion Billiards World Ranking No.${r}${BRAND_INTL}`;
    case "tr": return `${n} — 3 Bant Bilardo Dünya Sıralaması ${r}.${BRAND_INTL}`;
    case "vi": return `${n} — BXH Bida 3 băng Thế giới hạng ${r}${BRAND_INTL}`;
    case "es": return `${n} — Ranking Mundial de Billar a Tres Bandas N.º ${r}${BRAND_INTL}`;
  }
}

/** 한국어: "조명우(CHO Myung Woo·대한민국) UMB 3쿠션 남자 세계랭킹 1위, 499점. 역대 최고 1위, 대한민국 선수 중 1위." */
export function umbPlayerDesc(lang: string, p: UmbPlayerSeo): string {
  const l = umbLang(lang);
  const r = p.rank, pts = p.points, b = p.bestRank;
  if (l === "ko") {
    const country = fedNameKo(p.fed);
    const paren = [p.nativeName ? p.playerName : "", country].filter(Boolean).join("·");
    const natl = p.nationalRank ? `, ${country} 선수 중 ${p.nationalRank}위` : "";
    return `${p.nativeName || p.playerName}(${paren}) UMB 3쿠션 ${CAT_KO[p.category]} 세계랭킹 ${r}위${pts > 0 ? `, ${pts}점` : ""}. 역대 최고 ${b}위${natl}.`;
  }
  const n = p.playerName, f = p.fed, c = UMB_CAT_INTL[l][p.category].toLowerCase();
  switch (l) {
    case "en": return `${n} (${f}) is No.${r} in the official UMB 3-cushion ${c} world ranking with ${pts} points. Career best No.${b}. Weekly rank history and points by tournament on RANKUE.`;
    case "tr": return `${n} (${f}), resmî UMB 3 bant ${c} dünya sıralamasında ${pts} puanla ${r}. sırada. Kariyer rekoru ${b}. sıra. Haftalık sıralama geçmişi RANKUE'de.`;
    case "vi": return `${n} (${f}) đứng hạng ${r} BXH bida 3 băng ${c} thế giới chính thức của UMB với ${pts} điểm. Cao nhất sự nghiệp hạng ${b}. Xem diễn biến thứ hạng hằng tuần trên RANKUE.`;
    case "es": return `${n} (${f}) es N.º ${r} del ranking mundial oficial UMB de billar a tres bandas (${c}) con ${pts} puntos. Mejor puesto histórico: N.º ${b}. Historial semanal en RANKUE.`;
  }
}

/* ── 골프 랭킹(/golf-ranking) · 골퍼(/golfer/:tour/:id) ── */

// 언어판은 ko·en 둘뿐이다(그 밖의 ?lang= 은 ko 로 떨어진다) — 화면도 이 규칙으로 골라야 제목이 같아진다.
export type GolfSeoLang = "ko" | "en";
export const golfSeoLang = (lang: string | null | undefined): GolfSeoLang => (lang === "en" ? "en" : "ko");

export const GOLF_TOUR_LABEL: Record<GolfSeoLang, Record<GolfTour, string>> = {
  ko: { owgr: "남자 세계 골프랭킹", rolex: "여자 세계 골프랭킹", kpga: "KPGA 코리안투어", klpga: "KLPGA 투어" },
  en: { owgr: "Men's World Golf Ranking", rolex: "Women's World Golf Ranking", kpga: "KPGA Korean Tour", klpga: "KLPGA Tour" },
};
/** 설명에만 붙이는 검색어 별칭(예전 목록 설명 "OWGR·롤렉스" 그대로) */
const GOLF_TOUR_ALIAS_KO: Partial<Record<GolfTour, string>> = { owgr: "OWGR", rolex: "롤렉스 랭킹" };

/** 목록 정본 주소 — 기본 투어(owgr)는 맨 /golf-ranking 이 대표다(?tour=owgr 은 canonical 이 아니다). */
export const golfRankingPath = (tour: GolfTour, lang: string = "ko"): string => {
  const en = golfSeoLang(lang) === "en";
  return tour === "owgr" ? `/golf-ranking${en ? "?lang=en" : ""}` : `/golf-ranking?tour=${tour}${en ? "&lang=en" : ""}`;
};

/** 목록 페이지가 그리는 줄 수 — 설명의 "톱 50"과 "한국 선수 최고"는 이 안에서만 찾는다(화면이 더 불러와도 같은 문장). */
export const GOLF_LIST_SEO_LIMIT = 50;

export interface GolfRankSeoRow { rank: number; playerName: string; nameKo: string | null; country: string }
const golfName = (lang: GolfSeoLang, r: { playerName: string; nameKo: string | null }) => (lang === "ko" && r.nameKo ? r.nameKo : r.playerName);

/** "남자 세계 골프랭킹 순위 — 1위 {이름} | 랭큐 골프" */
export function golfRankingTitle(lang: string, tour: GolfTour, rows: readonly GolfRankSeoRow[]): string {
  const l = golfSeoLang(lang);
  const label = GOLF_TOUR_LABEL[l][tour];
  const top = rows[0];
  if (l === "en") return `${label}${top ? ` — No.1 ${golfName(l, top)}` : ""}${BRAND_INTL}`;
  return `${label} 순위${top ? ` — 1위 ${golfName(l, top)}` : ""}${BRAND_GOLF_KO}`;
}

/**
 * 투어마다 다른 설명 — 기준일 · 1~3위 · (세계 랭킹이면) 톱 50 안의 한국 선수 최고 순위. 2026-09-24: 네 투어가 같은 설명 한 줄을 나눠 썼다.
 * 갱신 주기는 golfTours 의 정의대로: 세계 랭킹은 주 1회, 투어 랭킹은 대회가 끝날 때마다.
 */
export function golfRankingDesc(lang: string, tour: GolfTour, edition: string | null | undefined, rows: readonly GolfRankSeoRow[]): string {
  const l = golfSeoLang(lang);
  const label = GOLF_TOUR_LABEL[l][tour];
  const shown = rows.slice(0, GOLF_LIST_SEO_LIMIT);
  const world = GOLF_TOUR_META[tour].world;
  const podium = shown.slice(0, 3);
  // 톱 3 안에 있으면 따로 말하지 않는다
  const kr = world ? shown.find((r) => r.country === "KOR") : undefined;
  const krOut = kr && !podium.includes(kr) ? kr : undefined;
  if (l === "en") {
    const date = edition ? ` as of ${edition}` : "";
    const top = podium.map((r) => `No.${r.rank} ${golfName(l, r)}`).join(", ");
    return `${label}${date}: ${top}${krOut ? `; top Korean ${golfName(l, krOut)} No.${krOut.rank}` : ""}. Top 50 updated ${world ? "weekly" : "after every event"}.`;
  }
  const alias = GOLF_TOUR_ALIAS_KO[tour];
  const date = monthDayKo(edition);
  const top = podium.map((r) => `${r.rank}위 ${golfName(l, r)}`).join("·");
  const head = `${label}${alias ? `(${alias})` : ""}${date ? ` ${date} 기준` : ""} ${top}${krOut ? `, 한국 선수 최고 ${golfName(l, krOut)} ${krOut.rank}위` : ""}.`;
  // 로마자 이름 셋이면 100자를 넘는다 — 그때는 갱신 주기 꼬리를 뗀다(검색결과에서 먼저 잘리는 자리라)
  const tail = ` 톱 50 ${world ? "매주" : "대회마다"} 갱신.`;
  return head.length + tail.length <= 100 ? head + tail : head;
}

/** "2026-09-20" → "9월 20일" — 설명 글자 수를 아끼려고 연도는 뺀다(시계에 기대지 않아 봇·화면이 늘 같은 글자다) */
function monthDayKo(ymd: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : "";
}

export interface GolferSeo { playerName: string; nameKo: string | null; country: string; rank: number | null; points: number | null }

/** 한국어 표기 이름 — 한글 이름이 있으면 "한글 (로마자)", 없으면 로마자 */
export const golferNameFull = (lang: string, p: { playerName: string; nameKo: string | null }) =>
  golfSeoLang(lang) === "ko" && p.nameKo && p.nameKo !== p.playerName ? `${p.nameKo} (${p.playerName})` : p.playerName;

export function golferTitle(lang: string, tour: GolfTour, p: GolferSeo): string {
  const l = golfSeoLang(lang);
  const label = GOLF_TOUR_LABEL[l][tour];
  const name = golferNameFull(l, p);
  if (l === "en") return `${name} — ${label}${p.rank === null ? "" : ` No.${p.rank}`}${BRAND_INTL}`;
  return `${name} — ${label}${p.rank === null ? "" : ` ${p.rank}위`}${BRAND_GOLF_KO}`;
}

/** 한국어: "장유빈(Yubin Jang·KOR) KPGA 코리안투어 1위, 시즌 포인트 5,210. 역대 최고 1위." — 끝의 "랭큐에서 확인하세요"는 뺐다. */
export function golferDesc(lang: string, tour: GolfTour, p: GolferSeo, bestRank: number | null): string {
  const l = golfSeoLang(lang);
  const label = GOLF_TOUR_LABEL[l][tour];
  if (l === "en") {
    return `${p.playerName} (${p.country}) is ${p.rank === null ? "ranked" : `No.${p.rank}`} in the ${label}${bestRank !== null ? `, career best No.${bestRank}` : ""}. Rank history and season stats (driving distance, fairways, GIR) on RANKUE.`;
  }
  const main = p.nameKo || p.playerName;
  const paren = [p.nameKo && p.nameKo !== p.playerName ? p.playerName : "", p.country].filter(Boolean).join("·");
  const value = p.points !== null && p.points > 0
    ? `, ${GOLF_TOUR_META[tour].valueKind === "avg" ? "평균 포인트" : "시즌 포인트"} ${formatRankValue(tour, p.points)}`
    : "";
  // 최신 회차에 없는 선수(rank=null)는 순위·포인트 없이 역대 최고만
  return `${main}(${paren}) ${label} ${p.rank === null ? "선수" : `${p.rank}위${value}`}${bestRank !== null ? `. 역대 최고 ${bestRank}위` : ""}.`;
}
