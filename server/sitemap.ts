import type { Express } from "express";
import { storage } from "./storage/index.js";
import { db } from "./db.js";
import { storeListings } from "../shared/schema.js";
import { asc } from "drizzle-orm";

// 동적 사이트맵 — 정적 페이지 + 모든 크루(/club/:id) + 모든 매장(/store/:slug)을
// DB에서 조립. 새 크루/매장이 생기면 자동 반영된다. 루트(/sitemap.xml)에서 서빙.

const ORIGIN = "https://www.rankue.co.kr";
// 앱 UI 지원 언어(홈): 5개. About 마케팅 페이지는 ja·zh 번역까지 있어 7개.
const APP_LANGS = ["en", "vi", "tr", "es"];
const ABOUT_LANGS = ["en", "vi", "tr", "es", "ja", "zh"];

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

function entry(loc: string, opts?: { langs?: string[]; changefreq?: string; priority?: string }): string {
  let alts = "";
  if (opts?.langs && opts.langs.length) {
    const sep = loc.includes("?") ? "&" : "?";
    alts =
      `\n    <xhtml:link rel="alternate" hreflang="ko" href="${esc(loc)}" />` +
      opts.langs.map((l) => `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(loc + sep + "lang=" + l)}" />`).join("") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}" />`;
  }
  return (
    `  <url>\n    <loc>${esc(loc)}</loc>${alts}` +
    (opts?.changefreq ? `\n    <changefreq>${opts.changefreq}</changefreq>` : "") +
    (opts?.priority ? `\n    <priority>${opts.priority}</priority>` : "") +
    `\n  </url>`
  );
}

export async function generateSitemap(): Promise<string> {
  const parts: string[] = [
    entry(`${ORIGIN}/`, { langs: APP_LANGS, changefreq: "weekly", priority: "1.0" }),
    entry(`${ORIGIN}/about`, { langs: ABOUT_LANGS, changefreq: "monthly", priority: "0.9" }),
    entry(`${ORIGIN}/stores`, { changefreq: "weekly", priority: "0.7" }),
    // UMB 세계랭킹 — 주간 갱신 공개 페이지 ("당구 세계랭킹" 검색 유입 타깃)
    entry(`${ORIGIN}/world-ranking`, { langs: APP_LANGS, changefreq: "weekly", priority: "0.8" }),
    entry(`${ORIGIN}/support`, { changefreq: "monthly", priority: "0.5" }),
    entry(`${ORIGIN}/privacy`, { changefreq: "yearly", priority: "0.3" }),
    entry(`${ORIGIN}/account-delete`, { changefreq: "yearly", priority: "0.3" }),
  ];

  // 크루
  try {
    const crews = await storage.getCrewsForSitemap();
    for (const c of crews) parts.push(entry(`${ORIGIN}/club/${c.id}`, { changefreq: "weekly", priority: "0.6" }));
  } catch (e) {
    console.warn("[sitemap] crews failed:", (e as Error)?.message);
  }

  // 매장
  try {
    const stores = await storage.getStoresForSitemap();
    for (const s of stores) if (s.slug) parts.push(entry(`${ORIGIN}/store/${encodeURIComponent(s.slug)}`, { changefreq: "weekly", priority: "0.6" }));
  } catch (e) {
    console.warn("[sitemap] stores failed:", (e as Error)?.message);
  }

  // 매장 디렉토리 — 수집 1,195곳. "지역명 + 당구장" 로컬 검색 타깃, 한국어 전용 페이지.
  try {
    const listings = await db.select({ code: storeListings.code }).from(storeListings).orderBy(asc(storeListings.code));
    for (const l of listings) parts.push(entry(`${ORIGIN}/stores/${l.code}`, { changefreq: "monthly", priority: "0.4" }));
  } catch (e) {
    console.warn("[sitemap] listings failed:", (e as Error)?.message);
  }

  // 커뮤니티 — 목록 + 글(블라인드 제외). 크루 내부 콘텐츠는 색인 제외가 원칙이지만
  // 커뮤니티는 공개 게시판이라 색인 대상 (오너 결정 2026-08-05).
  try {
    const posts = await storage.community.getPostsForSitemap();
    if (posts.length) {
      parts.push(entry(`${ORIGIN}/community`, { changefreq: "daily", priority: "0.7" }));
      for (const p of posts) parts.push(entry(`${ORIGIN}/community/${p.id}`, { changefreq: "weekly", priority: "0.5" }));
    }
  } catch (e) {
    console.warn("[sitemap] community failed:", (e as Error)?.message);
  }

  // UMB 선수 페이지 — 부문별 톱 1000 + 한국 선수 전원. 주간 갱신 콘텐츠.
  // hreflang: 프리렌더가 ?lang=en·tr·vi·es 4개 언어 버전을 실제로 서빙한다.
  try {
    const players = await storage.umb.getPlayersForSitemap();
    for (const p of players) parts.push(entry(`${ORIGIN}/player/${p.category}/${p.playerUmbId}`, { langs: APP_LANGS, changefreq: "weekly", priority: "0.5" }));
  } catch (e) {
    console.warn("[sitemap] umb players failed:", (e as Error)?.message);
  }

  // PBA 투어 — 랭킹 + 선수 전원. "스롱 피아비 상금"류 국내 검색 타깃, ko 단일 언어.
  try {
    const players = await storage.pba.getPlayersForSitemap();
    if (players.length) {
      parts.push(entry(`${ORIGIN}/pba`, { changefreq: "weekly", priority: "0.8" }));
      for (const p of players) parts.push(entry(`${ORIGIN}/pba-player/${p.memCode}`, { changefreq: "weekly", priority: "0.5" }));
    }
  } catch (e) {
    console.warn("[sitemap] pba players failed:", (e as Error)?.message);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${parts.join("\n")}\n</urlset>\n`;
}

export function registerSitemap(app: Express) {
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const xml = await generateSitemap();
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.send(xml);
    } catch (e) {
      console.error("[sitemap] error:", e);
      res.status(500).send("sitemap error");
    }
  });
}
