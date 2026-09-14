import type { Express } from "express";
import { storage } from "./storage/index.js";
import { renderPlayerCardPng, type PlayerCardInput } from "./services/playerCard.js";

// 공개 이미지 라우트 — /og/player/:category/:umbId.png (2026-09-14).
// /api 아래에 두지 않는 이유: robots.txt 가 /api/ 를 막고 있어 구글이 이미지를 못 가져간다.
// vercel.json 의 /og/(.*) 라우트가 이 함수로 보낸다. 캐시는 하루(회차가 주간이라 충분).

const CARD_LANGS = ["ko", "en", "tr", "vi", "es"] as const;
const CAT_LABEL: Record<string, Record<string, string>> = {
  ko: { players: "남자 3쿠션", ladies: "여자 3쿠션", juniors: "주니어 3쿠션" },
  en: { players: "Men's 3-Cushion", ladies: "Women's 3-Cushion", juniors: "Junior 3-Cushion" },
  tr: { players: "Erkekler 3 Bant", ladies: "Kadınlar 3 Bant", juniors: "Gençler 3 Bant" },
  vi: { players: "Nam 3 băng", ladies: "Nữ 3 băng", juniors: "Trẻ 3 băng" },
  es: { players: "Tres bandas masculino", ladies: "Tres bandas femenino", juniors: "Tres bandas juvenil" },
};
const DATE_LOCALE: Record<string, string> = { ko: "ko-KR", en: "en-US", tr: "tr-TR", vi: "vi-VN", es: "es-ES" };

export async function buildUmbPlayerCard(category: string, umbId: string, lang: string): Promise<PlayerCardInput | null> {
  const data = await storage.umb.getPlayerHistory(category as any, umbId);
  if (!data?.player) return null;
  const p = data.player;
  const hist = data.history;
  const prev = hist.length >= 2 ? hist[hist.length - 2].rank : null;
  const latest = hist[hist.length - 1];
  const editionLabel = latest
    ? new Date(latest.editionDate).toLocaleDateString(DATE_LOCALE[lang] ?? "en-US", { year: "numeric", month: "long" })
    : "";
  return {
    lang,
    nameMain: lang === "ko" ? (p.nativeName || p.playerName) : p.playerName,
    nameSub: lang === "ko" && p.nativeName ? p.playerName : null,
    fed: p.fed,
    categoryLabel: (CAT_LABEL[lang] ?? CAT_LABEL.en)[category] ?? category,
    rank: p.rank,
    points: p.points,
    bestRank: data.bestRank,
    nationalRank: p.nationalRank ?? null,
    delta: prev == null ? null : prev - p.rank,
    history: hist.map((h) => h.rank),
    editionLabel,
    weeksNo1: hist.filter((h) => h.rank === 1).length,
  };
}

export function registerOgImages(app: Express) {
  app.get("/og/player/:category/:umbId.png", async (req, res) => {
    const category = ["players", "ladies", "juniors"].includes(req.params.category) ? req.params.category : null;
    if (!category || !/^\d{1,6}$/.test(req.params.umbId)) return res.status(404).type("text/plain").send("not found");
    const q = String(req.query.lang ?? "");
    const lang = (CARD_LANGS as readonly string[]).includes(q) ? q : "ko";
    try {
      const input = await buildUmbPlayerCard(category, req.params.umbId, lang);
      if (!input) return res.status(404).type("text/plain").send("not found");
      const png = await renderPlayerCardPng(input);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
      res.send(png);
    } catch (e) {
      console.error("[og] player card failed:", (e as Error)?.message);
      res.status(500).type("text/plain").send("card error");
    }
  });
}
