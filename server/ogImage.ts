import type { Express } from "express";
import { storage } from "./storage/index.js";
import { renderPlayerCardPng, rankWord, type PlayerCardInput } from "./services/playerCard.js";
import { GOLF_TOUR_META, formatRankValue, formatStatValue, type GolfTour } from "../shared/golfTours.js";
import { PBA_LANGS, pbaL10n, formatPrize, seasonLabel } from "../shared/pbaMeta.js";

// 공개 이미지 라우트 — 선수 카드 PNG (2026-09-14).
//   /og/player/:category/:umbId.png   UMB 세계랭킹 (ko·en·tr·vi·es)
//   /og/golfer/:tour/:id.png          골프 투어 랭킹 (ko·en)
//   /og/pba-player/:memCode.png       PBA 투어 (ko·en·vi·tr·es)
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

  app.get("/og/pba-player/:memCode.png", (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(req.params.memCode)) return res.status(404).type("text/plain").send("not found");
    const lang = pickLang(req.query.lang, PBA_LANGS);
    return sendCard(res, () => buildPbaPlayerCard(req.params.memCode, lang), "pba");
  });
}
