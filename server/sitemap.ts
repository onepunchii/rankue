import type { Express } from "express";
import { storage } from "./storage/index.js";

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
