import type { Express } from "express";
import { storage } from "./storage/index.js";
import { db } from "./db.js";
import { storeListings } from "../shared/schema.js";
import { hreflangOf } from "../shared/aboutContent.js";
import { asc, sql } from "drizzle-orm";
import { playerCardUrl, golferCardUrl, pbaCardUrl } from "./services/playerCard.js";
import { loadGolfCourseSummary } from "./routes/modules/golfCourses.js";
import { GOLF_REGIONS, GOLF_INTENTS, cityShort, coursePath, listPath, listingIntents } from "../shared/golfCourse.js";
// seo/* 는 이 파일의 entry 를 되받아 쓴다(순환). entry 는 함수 선언이고 요청 시점에만 불리므로 안전하다.
import { rankingExtraSitemapParts } from "./seo/rankingExtra.js";
import { billiardsTermsSitemapParts } from "./seo/billiardsTerms.js";
import { tournamentsSitemapParts } from "./seo/tournaments.js";
import { pbaRecordsSitemapParts } from "./seo/pbaRecords.js";
import { todayKst } from "../shared/briefingMeta.js";

// 동적 사이트맵 — /sitemap.xml 은 **사이트맵 인덱스**, 실제 URL 은 주제별 5개 파일에 나눠 싣는다.
//
//   /sitemap.xml            인덱스 (아래 5개를 가리킴)
//   /sitemap-core.xml       정적 페이지·허브(세계랭킹·PBA·골프·매장·브리핑·커뮤니티)·크루·파트너 매장·지역 허브
//   /sitemap-players.xml    UMB 선수 — 부문별 톱 300 + 한국 전원
//   /sitemap-pba.xml        PBA 투어 랭킹 + 선수
//   /sitemap-golf.xml       골프 랭킹 + 선수 — 세계 톱 150·한국 500위 이내, KPGA·KLPGA 전원
//   /sitemap-stores.xml     매장 디렉토리(수집 1,195곳)
//   /sitemap-golf-courses.xml  골프장 475곳 전부(2026-09-24) — 시세가 매일 바뀌어 daily
//   /sitemap-golf-hubs.xml     골프장 목록·지역·시군 + 부킹·조인·취소티 허브(글이 있는 조합만)
//   /sitemap-rankings.xml      국가별 세계랭킹(남자 10명 이상) + 순위 변동 한 장(2026-09-24)
//   /sitemap-terms.xml         당구 용어 사전 허브 + 용어 페이지(본문 300자 이상, 2026-09-24)
//   /sitemap-tournaments.xml   당구 대회 허브 + PBA 시즌·대회(끝나고 우승자 있는 것) + UMB 대회(포인트 받은 선수 16명 이상, 2026-09-24)
//   /sitemap-pba-records.xml   PBA·LPBA 통산 기록 순위 한 장(두 리그 모두 30경기 이상 선수 20명 이상일 때만, 2026-09-24)
//
// 2026-09-14 분할 이유: 단일 사이트맵에 5,173 URL 을 제출했더니 색인 4개, "발견됨 - 색인 안 됨" 3,660.
// 서버 렌더 내부 링크가 거의 없는(홈에 링크 1개) 저권위 도메인에 한 번에 쏟은 게 원인이라
// (1) 프리렌더에 허브→목록→상세 링크를 깔고 (2) 사이트맵은 주제별로 쪼개 Search Console 에서
// 어느 묶음이 색인되는지 따로 보이게 하고 (3) 하위 순위 선수 등 검색 수요가 없는 URL 은 뺐다.
// 언어판 hreflang 은 허브 URL 에만 선언한다 — 선수 페이지는 HTML <link rel=alternate> 가 이미 있어
// 사이트맵까지 5배로 늘릴 이유가 없다(크롤 예산).

const ORIGIN = "https://www.rankue.co.kr";
// 앱 UI 지원 언어(홈): 5개. About 마케팅 페이지는 ja·zh 번역까지 있어 7개.
const APP_LANGS = ["en", "vi", "tr", "es"];
const ABOUT_LANGS = ["en", "vi", "tr", "es", "ja", "zh"];

export const SITEMAP_SECTIONS = ["core", "players", "pba", "golf", "stores", "golf-courses", "golf-hubs", "rankings", "terms", "tournaments", "pba-records"] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

// lastmod 는 오늘(KST)을 넘지 않게 자른다 — 롤렉스 랭킹 회차 날짜가 발표보다 뒤(9/28)라 미래 lastmod 231개가 나갔다.
// 미래 날짜가 섞이면 구글이 그 파일의 lastmod 를 통째로 안 믿는다(2026-09-24). 모든 섹션이 여기를 지난다.
export function lastmodDay(d: Date | string): string {
  const s = day(d);
  const today = todayKst();
  return s > today ? today : s;
}

// image: 선수 카드 PNG(/og/…) — 이미지 사이트맵 확장. 구글 이미지·썸네일 발견 경로(2026-09-14).
export function entry(loc: string, opts?: { langs?: string[]; changefreq?: string; priority?: string; lastmod?: Date | string | null; image?: string }): string {
  let alts = "";
  if (opts?.langs && opts.langs.length) {
    const sep = loc.includes("?") ? "&" : "?";
    alts =
      `\n    <xhtml:link rel="alternate" hreflang="ko" href="${esc(loc)}" />` +
      opts.langs.map((l) => `\n    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(loc + sep + "lang=" + l)}" />`).join("") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}" />`;
  }
  return (
    `  <url>\n    <loc>${esc(loc)}</loc>${alts}` +
    (opts?.lastmod ? `\n    <lastmod>${lastmodDay(opts.lastmod)}</lastmod>` : "") +
    (opts?.image ? `\n    <image:image><image:loc>${esc(opts.image)}</image:loc></image:image>` : "") +
    (opts?.changefreq ? `\n    <changefreq>${opts.changefreq}</changefreq>` : "") +
    (opts?.priority ? `\n    <priority>${opts.priority}</priority>` : "") +
    `\n  </url>`
  );
}

function urlset(parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${parts.join("\n")}\n</urlset>\n`;
}

/** 인덱스 — 자식 사이트맵 전부. lastmod 는 오늘(매일 갱신되는 브리핑·커뮤니티가 있어 사실에 가깝다). */
export function generateSitemapIndex(): string {
  const today = day(new Date());
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    SITEMAP_SECTIONS.map((s) => `  <sitemap>\n    <loc>${ORIGIN}/sitemap-${s}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join("\n")
  }\n</sitemapindex>\n`;
}

async function coreParts(): Promise<string[]> {
  const parts: string[] = [
    entry(`${ORIGIN}/`, { langs: APP_LANGS, changefreq: "weekly", priority: "1.0" }),
    entry(`${ORIGIN}/about`, { langs: ABOUT_LANGS, changefreq: "monthly", priority: "0.9" }),
    // UMB 세계랭킹 — 주간 갱신 공개 페이지 ("당구 세계랭킹" 검색 유입 타깃)
    entry(`${ORIGIN}/world-ranking`, { langs: APP_LANGS, changefreq: "weekly", priority: "0.8" }),
    entry(`${ORIGIN}/stores`, { changefreq: "weekly", priority: "0.7" }),
    entry(`${ORIGIN}/support`, { changefreq: "monthly", priority: "0.5" }),
    entry(`${ORIGIN}/privacy`, { changefreq: "yearly", priority: "0.3" }),
    entry(`${ORIGIN}/account-delete`, { changefreq: "yearly", priority: "0.3" }),
  ];

  // 매장 지역 허브 — "서울 당구장"류 로컬 검색 타깃이자 디렉토리 1,195곳으로 가는 내부 링크 층.
  try {
    const regions = await db.select({ region: storeListings.region, n: sql<number>`count(*)::int` })
      .from(storeListings).groupBy(storeListings.region).orderBy(sql`count(*) DESC`);
    for (const r of regions) if (r.region) parts.push(entry(`${ORIGIN}/stores?region=${encodeURIComponent(r.region)}`, { changefreq: "weekly", priority: "0.6" }));
  } catch (e) {
    console.warn("[sitemap] regions failed:", (e as Error)?.message);
  }

  // 크루
  try {
    const crews = await storage.getCrewsForSitemap();
    for (const c of crews) parts.push(entry(`${ORIGIN}/club/${c.id}`, { changefreq: "weekly", priority: "0.5" }));
  } catch (e) {
    console.warn("[sitemap] crews failed:", (e as Error)?.message);
  }

  // 파트너 매장 — 시스템 매장(hiq·global)은 제외한다. 유저가 소속되는 그릇일 뿐이라
  // 검색에 노출할 콘텐츠가 없고, 색인되면 '랭큐'로 검색한 사람이 빈 매장 페이지를 만난다.
  try {
    const { isSystemStore } = await import("../shared/systemStores.js");
    const stores = await storage.getStoresForSitemap();
    for (const s of stores) if (s.slug && !isSystemStore(s.slug)) parts.push(entry(`${ORIGIN}/store/${encodeURIComponent(s.slug)}`, { changefreq: "weekly", priority: "0.6" }));
  } catch (e) {
    console.warn("[sitemap] stores failed:", (e as Error)?.message);
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

  // 브리핑은 /briefing 한 장만 올린다(2026-09-18). 날짜별 아카이브 30개는 본문이 한 문장이라 핵심 사이트맵의
  // 절반을 얇은 페이지로 채우고 있었다 — 그 페이지들은 이제 noindex 이고(prerender), 사이트맵에서도 뺀다.
  parts.push(entry(`${ORIGIN}/briefing`, { changefreq: "daily", priority: "0.6" }));
  return parts;
}

// UMB 선수 페이지 — 부문별 톱 300 + 한국 선수 전원(umb.repo.getPlayersForSitemap). 상위 50 은 우선순위를 높인다.
async function playerParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const players = await storage.umb.getPlayersForSitemap();
    for (const p of players) {
      parts.push(entry(`${ORIGIN}/player/${p.category}/${p.playerUmbId}`, {
        changefreq: "weekly", priority: p.rank <= 50 ? "0.6" : "0.4", lastmod: p.lastmod,
        image: playerCardUrl(ORIGIN, p.category, p.playerUmbId),
      }));
    }
  } catch (e) {
    console.warn("[sitemap] umb players failed:", (e as Error)?.message);
  }
  return parts;
}

// PBA 투어 — 랭킹 + 선수 전원. "스롱 피아비 상금"류 국내 검색 타깃.
// hreflang 은 허브(/pba)에만 — 프리렌더가 ?lang=en·vi·tr·es 언어판을 실제로 서빙한다(2026-08-18).
async function pbaParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const players = await storage.pba.getPlayersForSitemap();
    if (players.length) {
      parts.push(entry(`${ORIGIN}/pba`, { langs: APP_LANGS, changefreq: "weekly", priority: "0.8" }));
      for (const p of players) parts.push(entry(`${ORIGIN}/pba-player/${p.memCode}`, { changefreq: "weekly", priority: "0.5", image: pbaCardUrl(ORIGIN, p.memCode) }));
    }
  } catch (e) {
    console.warn("[sitemap] pba players failed:", (e as Error)?.message);
  }
  return parts;
}

// 골프 랭킹(2026-09-13) — 랭킹 + 선수(golfRank.repo.getPlayersForSitemap 의 컷).
// 언어판은 실제로 서빙하는 en 하나만 — vi·tr·es 는 한국어 페이지가 나가 hreflang 오류였다(2026-09-24, 프리렌더 altLangs 와 짝).
const GOLF_LANGS = ["en"];
async function golfParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const players = await storage.golfRank.getPlayersForSitemap();
    parts.push(entry(`${ORIGIN}/golf-ranking`, { langs: GOLF_LANGS, changefreq: "weekly", priority: "0.8" }));
    // owgr 은 맨 주소(/golf-ranking)가 대표라 여기서 빼고 나머지 투어만 — 중복 URL 을 올리면 구글이 하나를 버린다.
    for (const tour of ["rolex", "kpga", "klpga"]) parts.push(entry(`${ORIGIN}/golf-ranking?tour=${tour}`, { changefreq: "weekly", priority: "0.6" }));
    for (const p of players) parts.push(entry(`${ORIGIN}/golfer/${p.tour}/${p.playerId}`, { changefreq: "weekly", priority: "0.4", lastmod: p.lastmod, image: golferCardUrl(ORIGIN, p.tour, p.playerId) }));
  } catch (e) {
    console.warn("[sitemap] golf players failed:", (e as Error)?.message);
  }
  return parts;
}

// 매장 디렉토리 — 수집 1,195곳. "지역명 + 당구장" 로컬 검색 타깃, 한국어 전용 페이지.
async function storeParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const listings = await db.select({ code: storeListings.code, updatedAt: storeListings.updatedAt })
      .from(storeListings).orderBy(asc(storeListings.code));
    for (const l of listings) parts.push(entry(`${ORIGIN}/stores/${l.code}`, { changefreq: "monthly", priority: "0.4", lastmod: l.updatedAt }));
  } catch (e) {
    console.warn("[sitemap] listings failed:", (e as Error)?.message);
  }
  return parts;
}

// 골프장 490곳(2026-09-24) — 한국어 전용이라 hreflang 없음. 주소의 한글은 coursePath 가 퍼센트 인코딩한다.
// lastmod = 골프장 행 갱신·회원권 시세 기준일·가장 최근 글 중 가장 늦은 날. 비공개·가려진 글은 페이지에 안 나오므로 뺀다.
async function golfCourseParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const r: any = await db.execute(sql`
      select p.slug, p.logo, to_char(greatest(
        p.updated_at::date,
        (select max(m.as_of) from golf_membership_prices m where m.slug = p.slug),
        (select max(b.created_at)::date from golf_bookings b
           where b.course_id = any(p.course_ids::text[]) and b.is_blinded = false and coalesce(b.is_blind, false) = false)
      ), 'YYYY-MM-DD') as lastmod
      from golf_course_pages p where p.slug <> '' and btrim(p.name) <> '' order by p.slug`);
    for (const x of (r.rows ?? r) as { slug: string; logo: string | null; lastmod: string | null }[]) {
      // 로고가 있으면 이미지 사이트맵으로도 알린다 — "OO CC 로고" 이미지 검색에서 골프장 페이지로 들어온다.
      parts.push(entry(`${ORIGIN}${coursePath(x.slug)}`, { changefreq: "daily", priority: "0.6", lastmod: x.lastmod, ...(x.logo ? { image: `${ORIGIN}${x.logo}` } : {}) }));
    }
  } catch (e) {
    console.warn("[sitemap] golf courses failed:", (e as Error)?.message);
  }
  return parts;
}

// 골프장 허브 — 목록(전국·지역 6·시군 전부)은 항상, 의도 허브는 최상위 3개 + **글이 있는** 지역·시군 조합만.
// 빈 조합은 프리렌더가 noindex 로 내보낸다 — 사이트맵에 올리면 "제출됨·noindex" 경고만 쌓인다.
async function golfHubParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const raw = await loadGolfCourseSummary();
    // 이름·슬러그가 빈 행은 프리렌더도 싣지 않는다(server/prerender.ts golfView) — 같은 기준
    const ok = (p: { slug: string; name: string } | undefined) => !!p && !!p.slug && !!p.name?.trim();
    const s = { ...raw, pages: raw.pages.filter(ok), listings: raw.listings.filter((l) => ok(raw.bySlug.get(l.slug))) };
    const now = Date.now();
    parts.push(entry(`${ORIGIN}${listPath()}`, { changefreq: "daily", priority: "0.8" }));
    const cities = new Map<string, { region: string; city: string }>();
    for (const r of GOLF_REGIONS) {
      if (!s.pages.some((p) => p.region === r)) continue;
      parts.push(entry(`${ORIGIN}${listPath({ region: r })}`, { changefreq: "daily", priority: "0.7" }));
      for (const p of s.pages) if (p.region === r && p.city) {
        const k = `${r}/${cityShort(p.city)}`;
        if (!cities.has(k)) cities.set(k, { region: r, city: p.city });
      }
    }
    for (const c of cities.values()) parts.push(entry(`${ORIGIN}${listPath(c)}`, { changefreq: "daily", priority: "0.6" }));
    // 의도 × 지역 · 의도 × 시군 — 프리렌더의 noindex 판정과 같은 식(같은 요약·같은 listingIntents)
    const live = new Map<string, number>();
    for (const l of s.listings) {
      const p = s.bySlug.get(l.slug);
      if (!p) continue;
      for (const i of listingIntents(l, now)) {
        const kr = `${i}|${p.region}|`;
        live.set(kr, (live.get(kr) ?? 0) + 1);
        if (p.city) {
          const kc = `${i}|${p.region}|${cityShort(p.city)}`;
          live.set(kc, (live.get(kc) ?? 0) + 1);
        }
      }
    }
    for (const intent of GOLF_INTENTS) {
      parts.push(entry(`${ORIGIN}${listPath({ intent })}`, { changefreq: "hourly", priority: "0.7" }));
      for (const r of GOLF_REGIONS) {
        if (!live.get(`${intent}|${r}|`)) continue;
        parts.push(entry(`${ORIGIN}${listPath({ intent, region: r })}`, { changefreq: "hourly", priority: "0.5" }));
        for (const c of cities.values()) {
          if (c.region === r && live.get(`${intent}|${r}|${cityShort(c.city)}`)) {
            parts.push(entry(`${ORIGIN}${listPath({ intent, region: r, city: c.city })}`, { changefreq: "hourly", priority: "0.4" }));
          }
        }
      }
    }
  } catch (e) {
    console.warn("[sitemap] golf hubs failed:", (e as Error)?.message);
  }
  return parts;
}

const SECTION_PARTS: Record<SitemapSection, () => Promise<string[]>> = {
  core: coreParts, players: playerParts, pba: pbaParts, golf: golfParts, stores: storeParts,
  "golf-courses": golfCourseParts, "golf-hubs": golfHubParts,
  rankings: rankingExtraSitemapParts, terms: billiardsTermsSitemapParts,
  tournaments: tournamentsSitemapParts, "pba-records": pbaRecordsSitemapParts,
};

export async function generateSitemapSection(section: SitemapSection): Promise<string> {
  return urlset(await SECTION_PARTS[section]());
}

/** 예전 단일 사이트맵과 같은 내용 — 테스트·점검용(전체 URL 수 세기). 서빙은 인덱스+섹션으로 한다. */
export async function generateSitemap(): Promise<string> {
  const all: string[] = [];
  for (const s of SITEMAP_SECTIONS) all.push(...(await SECTION_PARTS[s]()));
  return urlset(all);
}

export function registerSitemap(app: Express) {
  const send = (res: any, xml: string) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(xml);
  };
  app.get("/sitemap.xml", (_req, res) => {
    try {
      send(res, generateSitemapIndex());
    } catch (e) {
      console.error("[sitemap] index error:", e);
      res.status(500).send("sitemap error");
    }
  });
  app.get("/sitemap-:section.xml", async (req, res) => {
    const section = req.params.section as SitemapSection;
    if (!(SITEMAP_SECTIONS as readonly string[]).includes(section)) return res.status(404).type("text/plain").send("not found");
    try {
      send(res, await generateSitemapSection(section));
    } catch (e) {
      console.error(`[sitemap] ${section} error:`, e);
      res.status(500).send("sitemap error");
    }
  });
}
