import type { Express } from "express";
import { storage } from "./storage/index.js";
import { renderPlayerCardPng, rankWord, type PlayerCardInput } from "./services/playerCard.js";
import { GOLF_TOUR_META, formatRankValue, formatStatValue, type GolfTour } from "../shared/golfTours.js";
import { PBA_LANGS, pbaL10n, formatPrize, seasonLabel } from "../shared/pbaMeta.js";
import { renderGolfCourseCardPng, type GolfCourseCardInput } from "./services/golfCourseCard.js";
import { renderStoreCardPng, type StoreCardInput } from "./services/storeCard.js";
import { db } from "./db.js";
import { storeListings, hiqMembers } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { storeAreasKo } from "../shared/storeMeta.js";
import { loadGolfCourseSummary } from "./routes/modules/golfCourses.js";
import { courseWhere, weekdayFee, wonShort, type Fees } from "../shared/golfCourse.js";
import { renderGolfFootprintsCardPng, type FootprintsCardInput } from "./services/golfFootprintsCard.js";
import { renderGolfRoundCardPng, type GolfRoundCardInput } from "./services/golfRoundCard.js";
import { parseRoundRef, roundDateLabel, type RoundRef } from "../shared/golfRoundShare.js";
import { briefReason, lastTee18 } from "../shared/golfRoundBrief.js";
import { baseLabel, type WxKind } from "../shared/golfWeather.js";
import { getGolfFootprints } from "./storage/golfFootprints.js";
import { parseFootprintYear } from "../shared/golfFootprints.js";
import { verifyFootprintShare } from "./lib/footprintShare.js";

// 공개 이미지 라우트 — 선수 카드 PNG (2026-09-14).
//   /og/player/:category/:umbId.png   UMB 세계랭킹 (ko·en·tr·vi·es)
//   /og/golfer/:tour/:id.png          골프 투어 랭킹 (ko·en)
//   /og/pba-player/:memCode.png       PBA 투어 (ko·en·vi·tr·es)
//   /og/golf-course/:slug.png         골프장 카드 (2026-09-30)
//   /og/golf-round/:slug.png?d=&t=    라운드 브리핑 카드 (2026-10-05) — 그 날·그 티오프의 날씨. 예보가 없으면 404
//   /og/store/:code.png               당구장 카드 (2026-09-30)
//   /og/golf-footprints/:memberId.png 골프 발자국 카드 (2026-09-30) — **비공개**: 서명(t)·만료가 맞아야 열린다
// /api 아래에 두지 않는 이유: robots.txt 가 /api/ 를 막고 있어 구글이 이미지를 못 가져간다.
// vercel.json 의 /og/(.*) 라우트가 이 함수로 보낸다. 캐시는 하루(회차가 주간이라 충분).

const CARD_LANGS = ["ko", "en", "tr", "vi", "es"] as const;
const DATE_LOCALE: Record<string, string> = { ko: "ko-KR", en: "en-US", tr: "tr-TR", vi: "vi-VN", es: "es-ES" };
const monthLabel = (d: Date | string, lang: string) =>
  new Date(d).toLocaleDateString(DATE_LOCALE[lang] ?? "en-US", { year: "numeric", month: "long" });

// ── UMB ───────────────────────────────────────────────────────────
const UMB_CAT: Record<string, Record<string, string>> = {
  ko: { players: "남자 3쿠션", ladies: "여자 3쿠션", juniors: "주니어 3쿠션" },
  en: { players: "Men's 3-Cushion", ladies: "Women's 3-Cushion", juniors: "Junior 3-Cushion" },
  tr: { players: "Erkekler 3 Bant", ladies: "Kadınlar 3 Bant", juniors: "Gençler 3 Bant" },
  vi: { players: "Nam 3 băng", ladies: "Nữ 3 băng", juniors: "Trẻ 3 băng" },
  es: { players: "Tres bandas masculino", ladies: "Tres bandas femenino", juniors: "Tres bandas juvenil" },
};
const UMB_T: Record<string, { points: string; best: string; natl: string; trend: string; source: string }> = {
  ko: { points: "포인트", best: "역대 최고", natl: "국내 순위", trend: "순위 추이", source: "UMB 공식 세계랭킹" },
  en: { points: "Points", best: "Career best", natl: "National", trend: "Rank trend", source: "Official UMB world ranking" },
  tr: { points: "Puan", best: "Kariyer rekoru", natl: "Ulusal", trend: "Sıralama seyri", source: "Resmî UMB dünya sıralaması" },
  vi: { points: "Điểm", best: "Cao nhất", natl: "Trong nước", trend: "Diễn biến hạng", source: "BXH thế giới chính thức UMB" },
  es: { points: "Puntos", best: "Mejor histórico", natl: "Nacional", trend: "Evolución", source: "Ranking mundial oficial UMB" },
};

export async function buildUmbPlayerCard(category: string, umbId: string, lang: string): Promise<PlayerCardInput | null> {
  const data = await storage.umb.getPlayerHistory(category as any, umbId);
  if (!data?.player) return null;
  const p = data.player;
  const hist = data.history;
  const prev = hist.length >= 2 ? hist[hist.length - 2].rank : null;
  const latest = hist[hist.length - 1];
  const T = UMB_T[lang] ?? UMB_T.en;
  return {
    lang,
    nameMain: lang === "ko" ? (p.nativeName || p.playerName) : p.playerName,
    nameSub: lang === "ko" && p.nativeName ? p.playerName : null,
    fed: p.fed,
    categoryLabel: (UMB_CAT[lang] ?? UMB_CAT.en)[category] ?? category,
    rank: p.rank,
    delta: prev == null ? null : prev - p.rank,
    weeksNo1: hist.filter((h) => h.rank === 1).length,
    tiles: [
      { label: T.points, value: p.points.toLocaleString("en-US") },
      { label: T.best, value: rankWord(lang, data.bestRank) },
      { label: T.natl, value: p.nationalRank ? rankWord(lang, p.nationalRank) : "—" },
    ],
    trend: { label: T.trend, values: hist.map((h) => h.rank), invert: true },
    editionLabel: latest ? monthLabel(latest.editionDate, lang) : "",
    source: T.source,
  };
}

// ── 골프 ──────────────────────────────────────────────────────────
const GOLF_T = {
  ko: {
    tour: { owgr: "남자 세계 골프랭킹", rolex: "여자 세계 골프랭킹", kpga: "KPGA 코리안투어", klpga: "KLPGA 투어" } as Record<string, string>,
    avg: "평균 포인트", pts: "시즌 포인트", best: "역대 최고", natl: "국내 순위", events: "출전 대회", trend: "순위 추이", source: (n: string) => `출처: ${n}`,
  },
  en: {
    tour: { owgr: "Men's World Golf Ranking", rolex: "Women's World Golf Ranking", kpga: "KPGA Korean Tour", klpga: "KLPGA Tour" } as Record<string, string>,
    avg: "Avg points", pts: "Season points", best: "Career best", natl: "National", events: "Events", trend: "Rank trend", source: (n: string) => `Source: ${n}`,
  },
};

export async function buildGolferCard(tour: GolfTour, id: string, lang: "ko" | "en"): Promise<PlayerCardInput | null> {
  const data = await storage.golfRank.getPlayer(tour, id);
  if (!data?.player) return null;
  const p = data.player;
  const meta = GOLF_TOUR_META[tour];
  const T = GOLF_T[lang];
  const nameKo = p.nameKo && p.nameKo !== p.playerName ? p.nameKo : null;
  const latest = data.history[data.history.length - 1];
  return {
    lang,
    nameMain: lang === "ko" && nameKo ? nameKo : p.playerName,
    nameSub: lang === "ko" && nameKo ? p.playerName : null,
    fed: p.country,
    categoryLabel: T.tour[tour] ?? tour,
    rank: p.inLatest ? p.rank : null,
    delta: p.inLatest && p.rank != null && p.prevRank != null ? p.prevRank - p.rank : null,
    tiles: [
      { label: meta.valueKind === "avg" ? T.avg : T.pts, value: p.points != null ? formatRankValue(tour, p.points) : "—" },
      { label: T.best, value: data.bestRank != null ? rankWord(lang, data.bestRank) : "—" },
      // 국내 투어(KPGA·KLPGA)는 전원 한국 선수라 국내 순위가 무의미 — 출전 대회 수로 대체
      meta.world
        ? { label: T.natl, value: data.national?.nationalRank ? rankWord(lang, data.national.nationalRank) : "—" }
        : { label: T.events, value: p.events != null ? String(p.events) : "—" },
    ],
    trend: { label: T.trend, values: data.history.map((h) => h.rank), invert: true },
    // 회차가 1개뿐이면(랭킹 수집 초기) 추이선 대신 시즌 기록(드라이브 거리 등) 3개
    // 출처 라벨 "상금순위" 의 값은 상금액이라 라벨을 바로잡는다
    extraTiles: data.stats.slice(0, 3).map((s) => ({
      label: s.unit === "원" ? (lang === "ko" ? "시즌 상금" : "Prize money") : s.label,
      value: formatStatValue(s.value, s.unit ?? ""), unit: s.unit && s.unit !== "원" ? s.unit : undefined,
    })),
    editionLabel: latest ? monthLabel(latest.editionDate, lang) : data.edition,
    source: T.source(meta.sourceName),
  };
}

// ── PBA ───────────────────────────────────────────────────────────
// 히어로는 최신 시즌 상금 순위(PBA 공식 표기 관행이 상금순). 타일은 통산 상금·에버리지·하이런, 추이는 시즌별 상금.
const PBA_T: Record<string, { average: string; highRun: string; prizeRank: (s: string) => string; seasonPrize: string; tour: (l: string) => string }> = {
  ko: { average: "에버리지", highRun: "하이런", prizeRank: (s) => `${s} 시즌 상금 순위`, seasonPrize: "시즌별 상금", tour: (l) => `${l} 투어` },
  en: { average: "Average", highRun: "High run", prizeRank: (s) => `${s} season prize rank`, seasonPrize: "Prize by season", tour: (l) => `${l} Tour` },
  vi: { average: "Average", highRun: "High run", prizeRank: (s) => `Hạng tiền thưởng mùa ${s}`, seasonPrize: "Tiền thưởng theo mùa", tour: (l) => `${l} Tour` },
  tr: { average: "Ortalama", highRun: "En yüksek seri", prizeRank: (s) => `${s} sezonu para ödülü sırası`, seasonPrize: "Sezonlara göre ödül", tour: (l) => `${l} Turu` },
  es: { average: "Promedio", highRun: "Serie máxima", prizeRank: (s) => `Ranking de premios ${s}`, seasonPrize: "Premios por temporada", tour: (l) => `${l} Tour` },
};

export async function buildPbaPlayerCard(memCode: string, lang: string): Promise<PlayerCardInput | null> {
  const p = await storage.pba.getPlayer(memCode);
  if (!p) return null;
  const T = PBA_T[lang] ?? PBA_T.en;
  const L = pbaL10n(lang);
  const seasons = p.seasons.filter((s) => s.league === p.league);
  const cur = seasons[seasons.length - 1] ?? null;
  const prev = seasons.length >= 2 ? seasons[seasons.length - 2] : null;
  const isKo = lang === "ko";
  return {
    lang,
    nameMain: isKo ? p.nameKo : (p.nameEn || p.nameKo),
    nameSub: isKo ? p.nameEn : (p.nameEn ? p.nameKo : null),
    fed: p.nationCode ?? "KR",
    categoryLabel: T.tour(p.league),
    rank: cur?.prizeRank ?? null,
    heroLabel: cur ? T.prizeRank(seasonLabel(cur.season)) : null,
    delta: cur?.prizeRank != null && prev?.prizeRank != null ? prev.prizeRank - cur.prizeRank : null,
    tiles: [
      { label: L.careerPrize, value: p.careerPrize != null ? formatPrize(p.careerPrize, lang) : "—", unit: isKo && p.careerPrize != null ? "원" : undefined },
      { label: T.average, value: p.average != null ? p.average.toFixed(3) : "—" },
      { label: T.highRun, value: p.highRun != null ? String(p.highRun) : "—" },
    ],
    trend: seasons.length >= 2 ? { label: T.seasonPrize, values: seasons.map((s) => s.prize), invert: false } : null,
    editionLabel: cur ? (isKo ? `${seasonLabel(cur.season)} 시즌` : `Season ${seasonLabel(cur.season)}`) : "",
    source: L.source,
  };
}

// ── 골프장 ─────────────────────────────────────────────────────────
const ORIGIN = "https://www.rankue.co.kr";
/** 회원권 시세(만원) → 카드 칸에 들어갈 짧은 꼴: 10억 8,000만 → 10.8억, 9,100만 그대로 */
const shortManwon = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0).replace(/\.0$/, "")}억` : `${n.toLocaleString("ko-KR")}만`);
/** 로고는 정적 파일(/img/golf-logos/…)이라 함수 번들에 없다 — 사이트에서 받아 data URI 로. 못 받으면 이름 글자. */
async function logoDataUri(path: string | null | undefined): Promise<string | null> {
  if (!path || !/^\/img\/golf-logos\/[\w.-]+\.png$/.test(path)) return null;
  // 흰색뿐인 로고(-light.png)는 카드의 흰 판에서 안 보인다 — 이름 글자로(2026-10-01)
  if (/-light\.png$/i.test(path)) return null;
  try {
    const r = await fetch(`${ORIGIN}${path}`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}
export async function buildGolfCourseCard(slug: string): Promise<GolfCourseCardInput | null> {
  const s = await loadGolfCourseSummary();
  const p = s.bySlug.get(slug);
  if (!p || !p.name?.trim()) return null;
  const fees = p.fees && Array.isArray(p.fees.rows) ? (p.fees as Fees) : null;
  const fee = weekdayFee(fees);
  const top = s.top.get(slug);
  const tiles: GolfCourseCardInput["tiles"] = [];
  if (fee) tiles.push({ label: "주중 그린피", value: wonShort(fee), accent: "lime" });
  else if (p.feeFrom) tiles.push({ label: "그린피", value: `${wonShort(p.feeFrom)}~`, accent: "lime" });
  if (top?.price) tiles.push({ label: "회원권 시세", value: shortManwon(top.price), accent: "orange" });
  if (p.holes) tiles.push({ label: "코스", value: `${p.holes}홀` });
  return {
    name: p.name,
    where: courseWhere(p.region, p.city),
    shape: [p.kind, ...(p.grass ?? []).slice(0, 1)].filter(Boolean).join(" · "),
    logo: await logoDataUri(p.logo),
    tiles,
  };
}

// ── 라운드 브리핑(2026-10-05) ───────────────────────────────────────
/**
 * 그 골프장·그 날·그 티오프의 카드 재료. 받아 둔 예보만 읽는다 — 없으면 null(404). 화면의 날씨 카드와 같은 브리핑이다.
 * 날씨 모듈은 여기서 지연 로드한다(카드 라우트가 불릴 때만 필요하다).
 */
export async function buildGolfRoundCard(slug: string, ref: RoundRef, nowMs = Date.now()): Promise<GolfRoundCardInput | null> {
  const s = await loadGolfCourseSummary();
  const p = s.bySlug.get(slug);
  if (!p || !p.name?.trim()) return null;
  const { roundBriefAt } = await import("./services/golfWeather.js");
  const r = await roundBriefAt(p, ref, nowMs);
  if (!r) return null;
  const b = r.brief;
  // 해 뜨기 전·해 진 뒤의 칸은 달로 — 화면(WeatherCard nightAt)과 같은 셈
  const edge = (hm: string) => +hm.slice(0, 2) + (+hm.slice(3) > 30 ? 1 : 0);
  const night = (hr: number) => (r.sun ? hr < edge(r.sun.rise) || hr >= edge(r.sun.set) : hr < 6 || hr >= 19);
  const count: Partial<Record<WxKind, number>> = {};
  for (const x of b.hours) count[x.kind] = (count[x.kind] ?? 0) + 1;
  const sky = b.wet ?? (["clear", "partly", "cloudy"] as WxKind[]).reduce((best, k) => ((count[k] ?? 0) > (count[best] ?? 0) ? k : best), "clear" as WxKind);
  return {
    name: p.name,
    dateLabel: roundDateLabel(ref.ymd),
    teeLabel: `${String(b.teeHour).padStart(2, "0")}시 티오프`,
    verdict: b.verdict,
    reason: briefReason(b),
    tone: b.tone,
    sky: b.tone === "good" ? "clear" : sky,
    hours: b.hours.map((x) => {
      const hr = +x.t.slice(8, 10);
      return { label: `${hr}시`, kind: x.kind, night: night(hr), tmp: x.tmp != null ? `${x.tmp}°` : "–", pop: x.pop != null ? `${x.pop}%` : "–", wet: (x.pop ?? 0) >= 30 };
    }),
    frontCount: b.frontCount,
    gear: b.gear,
    sunLine: r.sun ? `해 짐 ${r.sun.set} · 18홀은 ${lastTee18(r.sun.set)} 전에 티오프` : null,
    stamp: `기상청 ${baseLabel(r.base)} 발표${r.approx ? ` · ${r.approx} 기준` : ""}`,
  };
}

// ── 당구장 ─────────────────────────────────────────────────────────
export async function buildStoreCard(code: string): Promise<StoreCardInput | null> {
  const [s] = await db.select().from(storeListings).where(eq(storeListings.code, code));
  if (!s) return null;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const areas = storeAreasKo(s.address, s.region);
  const tables = ([["대대", s.tableLarge], ["중대", s.tableMedium], ["포켓", s.tablePocket]] as const)
    .filter(([, n]) => n != null && n > 0).map(([label, n]) => ({ label, n: n as number }));
  const r10 = ([["대대", s.rate10Large], ["중대", s.rate10Medium], ["포켓", s.rate10Pocket]] as const).filter(([, v]) => v != null);
  const rates = r10.length ? [`10분당 ${r10.map(([l, v]) => `${l} ${won(v as number)}`).join(" · ")}`] : [];
  return {
    name: s.name,
    // 두 번째로 긴 동네(시·구) — 가장 긴 것(동까지)은 카드 머리에 길다
    area: areas.length > 1 ? areas[areas.length > 2 ? 1 : 0] : areas[0] ?? s.region,
    tables, rates, hours: s.openHours,
  };
}

// ── 골프 발자국 ────────────────────────────────────────────────────
/** 탈퇴하면 발자국 카드도 닫는다 — 예전에 보낸 링크가 남아 있어도(탈퇴 회원 행은 del- 전화번호로 익명화된다). */
export async function buildGolfFootprintsCard(memberId: string, year: number | null): Promise<FootprintsCardInput | null> {
  const [fp, members, summary] = await Promise.all([
    getGolfFootprints(memberId, year),
    db.select({ name: hiqMembers.name, phone: hiqMembers.phone }).from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1),
    loadGolfCourseSummary(),
  ]);
  const m = members[0];
  if (!m || m.phone?.startsWith("del-") || !fp.stops.length) return null;
  return {
    nickname: m.name ?? "",
    year,
    // 카드는 인증 도장만(현장 인증 + 옛 기록) — 집에서 적은 라운드(기록 도장)는 '방문 골프장'·'라운드'에 안 센다(2026-09-30 오너 결정)
    rounds: fp.onSiteRounds,
    stops: fp.stops,
    // 바탕 점 지도 — 앱의 골프장 점 지도(CourseDotMap)와 같은 골프장 페이지 좌표
    dots: summary.pages.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
  };
}

// ── 라우트 ─────────────────────────────────────────────────────────
export function registerOgImages(app: Express) {
  const sendCard = async (res: any, build: () => Promise<PlayerCardInput | null>, what: string) => {
    try {
      const input = await build();
      if (!input) return res.status(404).type("text/plain").send("not found");
      const png = await renderPlayerCardPng(input);
      res.setHeader("Content-Type", "image/png");
      // 공개 이미지 — 앱 안 "카드 공유" 가 fetch 로 받아 공유 시트에 넘긴다. 개발 서버(localhost)·임베드에서도 되게 CORS 개방.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
      res.send(png);
    } catch (e) {
      console.error(`[og] ${what} card failed:`, (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  };
  const pickLang = (q: unknown, allowed: readonly string[]) => (typeof q === "string" && allowed.includes(q) ? q : "ko");

  app.get("/og/player/:category/:umbId.png", (req, res) => {
    const category = ["players", "ladies", "juniors"].includes(req.params.category) ? req.params.category : null;
    if (!category || !/^\d{1,6}$/.test(req.params.umbId)) return res.status(404).type("text/plain").send("not found");
    const lang = pickLang(req.query.lang, CARD_LANGS);
    return sendCard(res, () => buildUmbPlayerCard(category, req.params.umbId, lang), "umb");
  });

  app.get("/og/golfer/:tour/:id.png", (req, res) => {
    const tour = (Object.keys(GOLF_TOUR_META) as string[]).includes(req.params.tour) ? (req.params.tour as GolfTour) : null;
    if (!tour || !/^\d{1,10}$/.test(req.params.id)) return res.status(404).type("text/plain").send("not found");
    const lang = pickLang(req.query.lang, ["ko", "en"]) as "ko" | "en";
    return sendCard(res, () => buildGolferCard(tour, req.params.id, lang), "golfer");
  });

  // 골프장 카드 — 슬러그는 한글이다(Express 가 이미 풀어 준다)
  app.get("/og/golf-course/:slug.png", async (req, res) => {
    const slug = String(req.params.slug ?? "");
    if (!slug || slug.length > 80) return res.status(404).type("text/plain").send("not found");
    try {
      const input = await buildGolfCourseCard(slug);
      if (!input) return res.status(404).type("text/plain").send("not found");
      const png = await renderGolfCourseCardPng(input);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
      res.send(png);
    } catch (e) {
      console.error("[og] golf course card failed:", (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  });

  // 라운드 브리핑 카드 — 예보는 세 시간마다 바뀌니 캐시는 짧게(10분). 없는 라운드(지난 시각·닷새 뒤)는 404 이고 그건 캐시하지 않는다.
  app.get("/og/golf-round/:slug.png", async (req, res) => {
    const slug = String(req.params.slug ?? "").normalize("NFC");
    const ref = parseRoundRef(req.query.d, req.query.t);
    const notFound = () => res.status(404).setHeader("Cache-Control", "no-store").type("text/plain").send("not found");
    if (!slug || slug.length > 80 || !ref) return notFound();
    try {
      const input = await buildGolfRoundCard(slug, ref);
      if (!input) return notFound();
      const png = await renderGolfRoundCardPng(input);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1800");
      res.send(png);
    } catch (e) {
      console.error("[og] golf round card failed:", (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  });

  app.get("/og/store/:code.png", async (req, res) => {
    const code = String(req.params.code ?? "");
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) return res.status(404).type("text/plain").send("not found");
    try {
      const input = await buildStoreCard(code);
      if (!input) return res.status(404).type("text/plain").send("not found");
      const png = await renderStoreCardPng(input);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
      res.send(png);
    } catch (e) {
      console.error("[og] store card failed:", (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  });

  // 골프 발자국 — 동선이라 공개 카드가 아니다. 서명·만료가 틀리면 있는지 없는지도 알리지 않고 404.
  // 캐시는 본인 기기에만(private) — CDN 에 남으면 링크가 닫힌 뒤에도 그림이 나간다. 검색엔진에는 싣지 않는다.
  app.get("/og/golf-footprints/:memberId.png", async (req, res) => {
    const memberId = String(req.params.memberId ?? "").toLowerCase();
    const year = req.query.year === undefined ? null : parseFootprintYear(req.query.year);
    const notFound = () => res.status(404).setHeader("Cache-Control", "no-store").type("text/plain").send("not found");
    if (req.query.year !== undefined && year == null) return notFound();
    if (!verifyFootprintShare(memberId, year, req.query.t)) return notFound();
    try {
      const input = await buildGolfFootprintsCard(memberId, year);
      if (!input) return notFound();
      const png = await renderGolfFootprintsCardPng(input);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=600");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noimageindex");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.send(png);
    } catch (e) {
      console.error("[og] golf footprints card failed:", (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  });

  app.get("/og/pba-player/:memCode.png", (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(req.params.memCode)) return res.status(404).type("text/plain").send("not found");
    const lang = pickLang(req.query.lang, PBA_LANGS);
    return sendCard(res, () => buildPbaPlayerCard(req.params.memCode, lang), "pba");
  });
}
