import type { Express, Request } from "express";
import { storage } from "./storage/index.js";
import { db } from "./db.js";
import { storeListings } from "../shared/schema.js";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { ABOUT_CONTENT, ABOUT_LANGS, hreflangOf, type AboutContent } from "../shared/aboutContent.js";
import { DOC_META } from "../shared/docMeta.js";
import { crewTitle, crewDescription } from "../shared/crewMeta.js";
import { storeTitleKo, storeDescKo, storeJsonLd, mapLink, regionTitleKo, regionDescKo } from "../shared/storeMeta.js";
import { playerCardUrl, golferCardUrl, pbaCardUrl, CARD_SIZE } from "./services/playerCard.js";
import { LANDING_META, LANDING_FEATURES, LANDING_FAQS, LANDING_CREW, LANDING_LANGS, landingContent } from "../shared/landingContent.js";
import {
  formatPrizeKo as pbaFormatPrizeKo, seasonLabel as pbaSeasonLabelShared,
  PBA_INCOME_NOTE_KO, pbaPlayerTitleKo, pbaPlayerDescKo, pbaIncomeAnswerKo, PBA_LIST_TITLE_KO, PBA_LIST_DESC_KO,
  PBA_LANGS, pbaL10n,
} from "../shared/pbaMeta.js";
import { briefingLineKo, briefingDateKo, briefingTitle, briefingDesc, todayKst } from "../shared/briefingMeta.js";
import { loadGolfCourseSummary } from "./routes/modules/golfCourses.js";
import {
  GOLF_REGIONS, GOLF_INTENTS, REGION_LABEL, INTENT_LABEL, cityShort, coursePath, listPath, manwonText, wonShort, weekdayFee,
  courseTitle, courseDescription, listTitle, listDescription, listingIntents, teePart, distinctAliases, type Fees, type GolfIntent,
} from "../shared/golfCourse.js";
import { JOIN_TYPE_LABEL, distanceKm, formatDistance, type JoinType } from "../shared/golfJoin.js";
// seo/* 는 이 파일의 page·esc·hubNav 를 되받아 쓴다(순환). 둘 다 요청 시점에만 부르므로 초기화 순서와 무관하다.
import { renderRankingExtra, type RankingExtraRender } from "./seo/rankingExtra.js";
import { renderBilliardsTerms, type TermsRender } from "./seo/billiardsTerms.js";

// 크롤러 전용 프리렌더 — 봇에게 "React 가 그리는 것과 같은 내용"을 HTML 로 미리 채워 준다.
//
// 왜 필요한가: 랭큐 웹은 SPA 라 vercel.json 이 모든 페이지 요청을 정적 /index.html 로 보낸다.
// 그래서 JS 를 실행하지 않는 크롤러(대부분의 AI 크롤러 포함)가 보는 것은 전 페이지가
// **바이트까지 동일한 8.8KB 셸**이었다. 2026-08-03 측정: 9개 URL 전부 본문 29자,
// title 전부 홈 제목, 그리고 client/index.html:19 의 canonical 이 홈으로 고정돼 있어
// /about·/stores 등이 "홈의 중복"으로 선언되고 있었다.
//
// 클로킹이 아닌 이유: 여기서 내보내는 본문은 같은 경로에서 React 가 실제로 렌더하는 문구와
// 동일하다. 문안 원본을 공유하거나(shared/aboutContent.ts), 사용자에게도 공개된 API
// 데이터만 쓴다. 봇에게만 있는 문구를 만들지 않는 것이 이 파일의 유일한 금선이다.
//   → 홈(/) 을 아예 다루지 않는 이유도 그것과 이어진다. 홈의 실제 렌더 결과는 로그인 폼뿐이고,
//     정적 셸이 이미 더 나은 메타를 갖고 있다. 자세한 근거는 registerPrerender 안의 주석 참고.
//
// 실사용자는 이 미들웨어를 타지 않는다. vercel.json 이 User-Agent 헤더로 봇만
// /api/index.ts 로 우회시킨다(routes 의 has 조건). 앱이 Capacitor 원격URL 모드로
// 이 사이트를 띄우기 때문에, 실사용자를 서버리스 함수로 보내면 앱 시작이 콜드스타트를 탄다.

const ORIGIN = "https://www.rankue.co.kr";

// ⚠️ vercel.json routes 의 has(user-agent) 값과 **같은 집합**이어야 한다.
//    실제 관문은 vercel 쪽이다(거기서 안 걸리면 요청이 이 함수에 도달조차 못 한다).
//    그래서 서버 정규식만 넓혀 봐야 의미가 없고, 두 곳을 늘 같이 고쳐야 한다.
//
// Daum 이 아니라 Daumoa 인 이유: 다음 앱 인앱브라우저의 UA 가 "DaumApps" 라서
// Daum 으로 잡으면 실사용자가 앱 JS 없는 정적 페이지를 받게 된다. 크롤러는 Daumoa 다.
// Lighthouse·HeadlessChrome 는 일부러 뺐다 — 검색 크롤러가 아닌데 프리렌더를 주면
// PageSpeed 가 실제 앱이 아닌 정적 페이지를 측정해 성능 점수를 왜곡한다.
const BOT_RE =
  /bot|crawler|spider|scrap|Daumoa|Yeti|facebookexternalhit|ChatGPT-User|Claude-User|Claude-Web|Perplexity-User|meta-externalagent|cohere-ai|anthropic-ai|Google-Extended|InspectionTool/i;

// BOT_RE 는 /i 라서 vercel 쪽 패턴의 **상위집합**이다. 이게 중요한 불변식이다:
// vercel 이 통과시킨 요청은 여기서도 반드시 봇으로 판정되므로, 프로덕션에서 아래
// `!isBot → next()` 가지는 도달할 수 없다(= 실사용자가 serveStatic 폴백으로 새지 않는다).
// 로컬 dev/start 에서는 vercel 라우팅이 없어 이 가지를 타고, 그때는 dist/public 이
// 실제로 있으므로 정상적으로 앱 셸이 나간다. 서버 정규식을 vercel 보다 좁히지 말 것.
export function isBot(req: Request): boolean {
  return BOT_RE.test(req.get("user-agent") || "");
}

// 프리렌더 응답은 **절대 공유 캐시(CDN)에 저장시키지 않는다**.
//
// 이유: 같은 URL 이 User-Agent 에 따라 전혀 다른 문서를 낸다. 여기서 나가는 HTML 에는
// 앱 스크립트 태그도 #root 도 없으므로, CDN 이 봇 응답을 실사용자에게 한 번이라도
// 재사용하면 그 사용자는 **앱이 부팅되지 않는 죽은 페이지**를 본다. 랭큐 앱은 Capacitor
// 원격URL 모드로 이 사이트를 띄우므로 앱 사용자 전체가 영향을 받는다.
//
// 실측 근거(2026-08-03): 같은 구조의 polli 프로덕션에서 봇 요청이 CDN 에 캐시된 뒤
// 실사용자 요청이 x-vercel-cache: HIT 로 **봇용 프리렌더 문서를 받았다**.
// polli 는 프리렌더가 셸에 내용을 주입하는 방식이라 스크립트 태그가 살아 있어 무해했지만,
// 그건 설계된 안전장치가 아니라 우연이다. 여기서는 그 우연에 기대지 않는다.
//
// 봇 트래픽은 양이 적어 캐시가 없어도 비용이 무의미하다. 정확성을 택한다.
export function noStore(res: { setHeader: (k: string, v: string) => unknown }) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "User-Agent"); // 혹시 어딘가 캐시돼도 UA 별로 분리되게
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// 허브 내비 — 모든 프리렌더 문서 하단에 같은 링크 묶음을 깐다. 2026-09-14 색인 진단: 홈 HTML 에
// 내부 링크가 1개뿐이라 크롤러가 세계랭킹·PBA·골프·매장 허브로 갈 서버 렌더 경로가 없었다
// (사이트맵만으로 5,173 URL 을 던져 4개 색인). 언어판이 있는 허브만 ?lang= 을 붙인다.
const HUB_L10N: Record<string, { home: string; wr: string; pba: string; golf: string; stores: string; briefing: string; community: string; about: string; support: string }> = {
  ko: { home: "랭큐 홈", wr: "당구 세계랭킹", pba: "PBA 투어 랭킹", golf: "골프 랭킹", stores: "전국 당구장 찾기", briefing: "오늘의 당구 브리핑", community: "당구 커뮤니티", about: "랭큐 소개", support: "고객지원" },
  en: { home: "RANKUE home", wr: "Billiards world ranking", pba: "PBA Tour ranking", golf: "Golf rankings", stores: "Billiard halls in Korea", briefing: "Daily billiards briefing", community: "Community", about: "About RANKUE", support: "Support" },
  vi: { home: "Trang chủ RANKUE", wr: "BXH bida thế giới", pba: "BXH PBA Tour", golf: "BXH golf", stores: "Quán bida ở Hàn Quốc", briefing: "Bản tin bida hằng ngày", community: "Cộng đồng", about: "Giới thiệu RANKUE", support: "Hỗ trợ" },
  tr: { home: "RANKUE ana sayfa", wr: "Bilardo dünya sıralaması", pba: "PBA Tour sıralaması", golf: "Golf sıralamaları", stores: "Kore'deki bilardo salonları", briefing: "Günlük bilardo bülteni", community: "Topluluk", about: "RANKUE Hakkında", support: "Destek" },
  es: { home: "Inicio RANKUE", wr: "Ranking mundial de billar", pba: "Ranking PBA Tour", golf: "Rankings de golf", stores: "Salas de billar en Corea", briefing: "Boletín diario de billar", community: "Comunidad", about: "Acerca de RANKUE", support: "Soporte" },
};
export function hubNav(lang = "ko"): string {
  const H = HUB_L10N[lang] ?? HUB_L10N.en;
  const q = lang === "ko" ? "" : `?lang=${lang}`;
  const golfQ = lang === "en" ? "?lang=en" : "";
  const links: Array<[string, string]> = [
    [`/${q}`, H.home], [`/world-ranking${q}`, H.wr], [`/pba${q}`, H.pba], [`/golf-ranking${golfQ}`, H.golf],
    // 골프장 허브(2026-09-24) — 골프 예약·시세는 한국 전용이라 한국어 문서에만 건다.
    ...(lang === "ko" ? [["/golf/courses", "전국 골프장"] as [string, string]] : []),
    // 당구 용어 사전(2026-09-24) — 본문이 한국어 전용이라 한국어 문서에만 건다.
    ...(lang === "ko" ? [["/billiards/terms", "당구 용어"] as [string, string]] : []),
    ["/stores", H.stores], ["/briefing", H.briefing], ["/community", H.community], [`/about${q}`, H.about], ["/support", H.support],
  ];
  return `<nav aria-label="RANKUE">${links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(" · ")}</nav>`;
}

// 링크 미리보기용 기본 이미지. client/index.html:34 과 각 페이지 useSeo 의 image 인자가
// 쓰는 것과 **같은 값**이어야 한다. 이게 없으면 카카오톡·페이스북·슬랙 미리보기 카드에서
// 썸네일이 사라진다(스크래퍼 UA 인 kakaotalk-scrap·facebookexternalhit·Twitterbot 이
// 모두 봇 패턴에 걸려 이 프리렌더를 받기 때문이다).
const OG_IMAGE = `${ORIGIN}/og.png`;
const OG_LOCALE: Record<string, string> = {
  ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES", ja: "ja_JP", zh: "zh_CN",
};

export interface PageParts {
  lang?: string;
  title: string;
  desc: string;
  canonical: string;
  /**
   * 색인에서 뺀다(링크는 따라간다). 사람에게는 쓸모 있지만 검색 결과로는 얇은 페이지용 —
   * 날짜별 브리핑이 그렇다(2026-09-18: 본문 한 문장짜리가 매일 하나씩 쌓여 사이트 품질 신호를 끌어내렸다).
   */
  noindex?: boolean;
  /** hreflang 대체 URL 을 선언할 언어들. 사이트맵의 hreflang 과 짝을 맞춘다. */
  altLangs?: string[];
  /**
   * hreflang 클러스터의 기준(=ko판) URL. 대체 URL 은 여기에 ?lang= 을 붙여 만든다.
   * canonical 과 분리한 이유: 언어판은 자기 URL 을 self-canonical 해야 하는데(안 그러면
   * 전부 "ko판의 중복"으로 색인 제외된다), 그러면 canonical 에 ?lang= 이 이미 붙어 있어
   * 거기에 또 ?lang= 을 이어붙이는 실수가 난다.
   */
  altBase?: string;
  /** 페이지 고유 이미지(선수 카드 등). 없으면 브랜드 og.png. 정사각형이면 width=height 로 준다. */
  image?: { url: string; width: number; height: number; alt: string };
  body: string;
  jsonLd?: unknown[];
}

// 본문 목차(점프 링크) — 구글이 검색결과에 "섹션 칩"(오행 분포 · 2026년 운세 …처럼 페이지 안 절로
// 바로 가는 버튼)을 붙이려면 페이지 안에 id 가 있는 제목과 그 id 를 가리키는 앵커 링크가 함께 있어야
// 한다(2026-09-14 오너 요청). 모든 프리렌더 문서에 공통으로: 최상위 <h2> 에 id 를 달고 <h1> 바로 뒤에
// <nav> 목차를 끼운다. 목록 항목(매장 카드 등)은 h3 이라 목차에 안 들어간다. h2 가 2개 미만이면 생략.
const TOC_LABEL: Record<string, string> = { ko: "목차", en: "Contents", vi: "Mục lục", tr: "İçindekiler", es: "Contenido", ja: "目次", zh: "目录" };
function withToc(body: string, lang: string): string {
  const items: Array<{ id: string; label: string }> = [];
  let n = 0;
  const out = body.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (m, attrs: string | undefined, inner: string) => {
    if (attrs && /\bid=/.test(attrs)) return m;
    const label = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!label) return m;
    const id = `sec-${++n}`;
    items.push({ id, label });
    return `<h2${attrs ?? ""} id="${id}">${inner}</h2>`;
  });
  if (items.length < 2) return body;
  const nav = `\n  <nav aria-label="${esc(TOC_LABEL[lang] ?? TOC_LABEL.en)}"><ul>${items.slice(0, 8).map((i) => `<li><a href="#${i.id}">${i.label}</a></li>`).join("")}</ul></nav>`;
  const at = out.indexOf("</h1>");
  return at >= 0 ? out.slice(0, at + 5) + nav + out.slice(at + 5) : out;
}

export function page(p: PageParts): string {
  // 상호(reciprocal) hreflang: 어느 언어판을 내보내든 **같은 전체 클러스터**를 선언해야
  // 구글이 묶음으로 인식한다. 한쪽만 선언하면 선언 전체가 무시된다.
  const base = p.altBase ?? p.canonical;
  const alts = (p.altLangs ?? []).length
    ? `\n  <link rel="alternate" hreflang="ko" href="${esc(base)}" />` +
      (p.altLangs ?? [])
        .map((l) => `\n  <link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(base + "?lang=" + l)}" />`)
        .join("") +
      `\n  <link rel="alternate" hreflang="x-default" href="${esc(base)}" />`
    : "";

  // JSON-LD 는 esc() 를 쓸 수 없다(JSON 이 깨진다). 대신 '<' 를 유니코드로 이스케이프한다.
  // 이걸 빼면 크루 이름·소개글에 넣은 "</script>" 가 원문 그대로 나가 <head> 안에서
  // 스크립트가 조기 종료되고 임의 태그가 주입된다 — 크루 소개는 누구나 자유 입력이고
  // PATCH /crews/:id 는 별도 검증이 없다. U+2028/2029 도 JS 파서에서 줄바꿈으로 취급된다.
  const ld = (p.jsonLd ?? [])
    .map(
      (o) =>
        `\n<script type="application/ld+json">${JSON.stringify(o)
          .replace(/</g, "\\u003c")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029")}</script>`,
    )
    .join("");

  const lang = p.lang ?? "ko";
  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.desc)}" />
  <meta name="robots" content="${p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"}" />
  <link rel="canonical" href="${esc(p.canonical)}" />${alts}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="RANKUE" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:url" content="${esc(p.canonical)}" />
  <meta property="og:locale" content="${esc(OG_LOCALE[lang] ?? "ko_KR")}" />
  <meta property="og:image" content="${esc(p.image?.url ?? OG_IMAGE)}" />
  <meta property="og:image:width" content="${p.image?.width ?? 1200}" />
  <meta property="og:image:height" content="${p.image?.height ?? 630}" />
  <meta property="og:image:alt" content="${esc(p.image?.alt ?? "랭큐 RANKUE — 당구 실력 랭킹·매칭 앱")}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)}" />
  <meta name="twitter:description" content="${esc(p.desc)}" />
  <meta name="twitter:image" content="${esc(p.image?.url ?? OG_IMAGE)}" />${ld}
</head>
<body>
${withToc(p.body, p.lang ?? "ko")}
</body>
</html>
`;
}

// 이 함수에 도달한 봇 요청은 **반드시 여기서 끝내야 한다**.
// next() 로 흘리면 serveStatic 의 SPA 폴백이 index.html 을 sendFile 하려 하는데,
// api 함수 번들에는 dist/public 이 없어서(vercel.json 의 api 빌드에 includeFiles 미지정)
// 500 이 된다. 없는 리소스는 404, 색인 대상이 아닌 화면은 noindex 로 명시해 끝낸다.
export function sendGone(res: Parameters<Parameters<Express["get"]>[1]>[1], title: string, msg: string) {
  res.status(404).setHeader("X-Prerender", "404");
  noStore(res);
  res.send(
    `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>${esc(title)}</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>${esc(title)}</h1><p>${esc(msg)}</p>
<nav><a href="/">홈으로</a> <a href="/stores">매장 찾기</a></nav></main></body>
</html>
`,
  );
}

export function sendNoindex(res: Parameters<Parameters<Express["get"]>[1]>[1], title: string) {
  res.setHeader("X-Prerender", "noindex");
  noStore(res);
  res.send(
    `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>${esc(title)}</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>${esc(title)}</h1><nav><a href="/">홈으로</a></nav></main></body>
</html>
`,
  );
}

// DB 조회가 **예외로 실패**했을 때 쓰는 응답. 404 를 내면 안 된다 —
// 일시적 DB 장애 중에 크롤러가 방문하면 "이 URL 은 없다"로 읽고 색인에서 빼 버린다.
// 503 + Retry-After 는 "지금은 못 준다, 나중에 다시 와라"라서 색인에 영향이 없다.
export function sendUnavailable(res: Parameters<Parameters<Express["get"]>[1]>[1]) {
  res.status(503).setHeader("X-Prerender", "503");
  res.setHeader("Retry-After", "600");
  noStore(res);
  res.send(
    `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>일시적으로 정보를 불러올 수 없습니다 · 랭큐</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>일시적으로 정보를 불러올 수 없습니다</h1>
<p>잠시 후 다시 시도해 주세요.</p></main></body>
</html>
`,
  );
}

const APP_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RANKUE",
  alternateName: "랭큐",
  applicationCategory: "SportsApplication",
  operatingSystem: "iOS, Android",
  url: `${ORIGIN}/`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  author: { "@type": "Organization", name: "제이에이치스퀘어" },
};

/** /about — 문안은 shared/aboutContent.ts 가 정본. ?lang= 로 7개 언어. */
function aboutBody(c: AboutContent): string {
  return `<main>
  <h1>${esc(c.h1)}</h1>
  <p>${esc(c.tagline)}</p>
  <p>${esc(c.intro)}</p>

  <h2>${esc(c.whatTitle)}</h2>
  <p>${esc(c.whatBody)}</p>

  <h2>${esc(c.featuresTitle)}</h2>
  ${c.features.map((f) => `<section><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p></section>`).join("\n  ")}

  <h2>${esc(c.whyTitle)}</h2>
  <p>${esc(c.whyBody)}</p>

  <h2>${esc(c.howTitle)}</h2>
  <ol>${c.how.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>

  <h2>${esc(c.faqTitle)}</h2>
  ${c.faq.map((f) => `<section><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></section>`).join("\n  ")}

  <h2>${esc(c.ctaTitle)}</h2>
  <p>${esc(c.ctaBody)}</p>

  <nav><a href="/">${esc(c.home)}</a> <a href="/support">${esc(c.support)}</a> <a href="/privacy">${esc(c.privacy)}</a></nav>
</main>`;
}

// ── 골프장 페이지(2026-09-24) ─────────────────────────────────────
//   /golf/course/:slug                   골프장 한 곳(정본) — 기본정보·그린피·회원권 시세·코스·소개·티타임·가까운 곳
//   /golf/courses[/:region[/:city]]      목록 허브 — 항상 색인
//   /golf/{booking|join|urgent}[/…]      의도 허브 — 글이 0건인 지역·시군 조합은 noindex(최상위는 항상 색인)
// 제목·설명·주소·돈 표기는 전부 shared/golfCourse.ts — 화면(useSeo)·사이트맵과 같은 함수다.
// 데이터에 없는 것(평점·난이도·잔디·사진·전화)은 그리지 않는다. 정적 목록의 그 값들은 가짜였다.
// 이 페이지들은 네이버(Yeti)의 유일한 색인 경로다 — JS 를 돌리지 않으므로 여기 없는 글자는 네이버에 없다.
type GolfSummary = Awaited<ReturnType<typeof loadGolfCourseSummary>>;
type GolfPageRow = GolfSummary["pages"][number];
type GolfListingRow = GolfSummary["listings"][number];
/** 렌더 결과 — Express 없이 불러 검증할 수 있게 응답과 분리했다. */
export interface GolfRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

/** /golf/booking-list/… 같은 앱 화면은 걸리지 않는다(키워드 뒤가 '/' 또는 끝이어야 한다). */
const GOLF_PAGE_RE = /^\/golf\/(?:course|courses|booking|join|urgent)(?:\/.*)?$/;

/** 경로 한 조각 → 한글. 잘못된 퍼센트 인코딩은 null(=404). 맥의 NFD 한글도 NFC 로 접는다. */
function golfDecode(seg: string): string | null {
  try {
    const s = decodeURIComponent(seg).normalize("NFC").trim();
    return s || null;
  } catch {
    return null;
  }
}

function golfGone(title: string, msg: string): GolfRender {
  return {
    status: 404, tag: "404",
    html: `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>${esc(title)}</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>${esc(title)}</h1><p>${esc(msg)}</p>
<nav><a href="/golf/courses">전국 골프장</a> <a href="/">홈으로</a></nav></main></body>
</html>
`,
  };
}

const KST_DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** 티타임 표기 — "9월 28일(일) 06:34". golf_bookings.datetime 은 UTC 라 +9h 해서 읽는다. */
function kstTeeText(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${KST_DOW[d.getUTCDay()]}) ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
/** "1986-10-04" → "1986년 10월 4일" */
function dateKo(ymd: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ""));
  return m ? `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일` : "";
}
const wonFull = (n: unknown) => (typeof n === "number" && n > 0 ? `${n.toLocaleString("ko-KR")}원` : "");
const golfFees = (p: GolfPageRow): Fees | null => (p.fees && Array.isArray(p.fees.rows) ? (p.fees as Fees) : null);
const golfWhere = (region: string | null, city: string | null) =>
  city ? `${REGION_LABEL[region ?? ""] ?? region ?? ""} ${cityShort(city)}`.trim() : region ? (REGION_LABEL[region] ?? region) : "전국";
/** "18홀 회원제" · 여러 부면 "27홀(회원제 18홀 · 대중제 9홀)" */
function golfShape(p: GolfPageRow): string {
  const parts: { kind?: string; holes?: number | null }[] = Array.isArray(p.parts) ? p.parts : [];
  if (parts.length > 1) {
    const inner = parts.map((x) => [x.kind, x.holes ? `${x.holes}홀` : ""].filter(Boolean).join(" ")).join(" · ");
    return p.holes ? `${p.holes}홀(${inner})` : inner;
  }
  return [p.holes ? `${p.holes}홀` : "", p.kind ?? ""].filter(Boolean).join(" ");
}

/** 글 한 줄 — "9월 28일(일) 06:34 · 1부 · 조인 · 27만원 · 빈자리 2". 연락처·글쓴이는 공개 요약에 애초에 없다. */
function golfListingText(l: GolfListingRow): string {
  const jt = l.joinType as JoinType | null | undefined;
  const kind = l.listingType === "JOIN" ? `조인${jt && jt !== "FIELD" && JOIN_TYPE_LABEL[jt] ? `(${JOIN_TYPE_LABEL[jt]})` : ""}` : "부킹";
  const bits = [kstTeeText(l.datetime), `${teePart(l.datetime)}부`, kind];
  if (l.isUrgent) bits.push("긴급");
  const fee = l.costMode === "SPLIT" ? "1/N" : wonShort(l.greenFee);
  if (fee) bits.push(fee);
  if (l.listingType === "JOIN") {
    const left = Math.max(0, (l.joinCapacity ?? 0) - (l.joinApplied ?? 0));
    bits.push(left ? `빈자리 ${left}` : "마감");
  }
  return bits.join(" · ");
}

/**
 * 이름·슬러그가 빈 행은 싣지 않는다(적재 데이터에 슬러그 ''·이름 '' 인 행이 실제로 있다 — 링크가 /golf/course/ 가 된다).
 * 그 골프장의 글도 같이 뺀다. 한 곳 조회(bySlug)는 그대로 — 빈 슬러그는 애초에 경로로 들어올 수 없다.
 */
const golfPageOk = (p: GolfPageRow | undefined): p is GolfPageRow => !!p && !!p.slug && !!p.name?.trim();
function golfView(raw: GolfSummary): GolfSummary {
  return { ...raw, pages: raw.pages.filter(golfPageOk), listings: raw.listings.filter((l) => golfPageOk(raw.bySlug.get(l.slug))) };
}

/** 한 번의 렌더에서 여러 번 쓰는 골프장별 글 묶음. */
function golfListingsBySlug(s: GolfSummary): Map<string, GolfListingRow[]> {
  const m = new Map<string, GolfListingRow[]>();
  for (const l of s.listings) {
    const a = m.get(l.slug);
    if (a) a.push(l); else m.set(l.slug, [l]);
  }
  return m;
}

/** 목록 정렬 — API(/golf-courses)와 같은 무게: 지금 글이 있는 곳 → 시세·그린피가 있는 곳 → 이름. */
function golfSort(s: GolfSummary, pages: GolfPageRow[], byListing: Map<string, GolfListingRow[]>, now: number, intent: GolfIntent | null): GolfPageRow[] {
  const w = (p: GolfPageRow) => {
    const ls = byListing.get(p.slug) ?? [];
    const n = intent ? ls.filter((l) => listingIntents(l, now).includes(intent)).length : ls.length;
    return n * 1000 + (s.top.has(p.slug) ? 10 : 0) + (golfFees(p) ? 5 : 0);
  };
  return [...pages].sort((a, b) => w(b) - w(a) || a.name.localeCompare(b.name, "ko"));
}

/** 목록의 골프장 한 줄 — 이름 링크 + 시군·규모·주중 그린피·대표 시세·지금 글 수. */
function golfCourseLi(s: GolfSummary, p: GolfPageRow, byListing: Map<string, GolfListingRow[]>, opts: { where?: boolean; km?: number | null } = {}): string {
  const bits: string[] = [];
  if (opts.where) bits.push(golfWhere(p.region, p.city));
  else if (p.city) bits.push(cityShort(p.city));
  const shape = [p.holes ? `${p.holes}홀` : "", p.kind ?? ""].filter(Boolean).join(" ");
  if (shape) bits.push(shape);
  const fee = weekdayFee(golfFees(p));
  if (fee) bits.push(`주중 그린피 ${wonShort(fee)}`);
  else if (p.feeFrom) bits.push(`그린피 ${wonShort(p.feeFrom)}부터`);
  if (p.grass?.length) bits.push(p.grass.join("·"));
  const t = s.top.get(p.slug);
  if (t) bits.push(`회원권 ${manwonText(t.price)}`);
  const n = byListing.get(p.slug)?.length ?? 0;
  if (n) bits.push(`티타임 ${n}건`);
  if (opts.km != null) bits.push(formatDistance(opts.km));
  return `<li><a href="${esc(coursePath(p.slug))}">${esc(p.name)}</a>${bits.length ? ` — ${esc(bits.join(" · "))}` : ""}</li>`;
}

/** 허브 글 목록 한 줄 — 골프장 링크 + 글 요약. */
function golfListingLi(s: GolfSummary, l: GolfListingRow, withCourse: boolean): string {
  const p = s.bySlug.get(l.slug);
  const head = withCourse && p ? `<a href="${esc(coursePath(p.slug))}">${esc(p.name)}</a> — ` : "";
  return `<li>${head}${esc(golfListingText(l))}</li>`;
}

// ── 범위(전국 · 지역 · 시군) ──────────────────────────────────────
interface GolfScope { region: string | null; city: string | null; short: string | null; pages: GolfPageRow[] }
const golfInScope = (p: GolfPageRow, sc: { region: string | null; short: string | null }) =>
  (!sc.region || p.region === sc.region) && (!sc.short || (!!p.city && cityShort(p.city) === sc.short));

/**
 * 경로 조각 → 범위. 없는 지역·시군은 null(404). 시군을 긴 꼴("이천시")로 쓰면 짧은 꼴 주소로 보낸다(301) —
 * 같은 목록이 주소 두 개로 색인되면 구글이 하나를 버린다.
 */
function golfScope(s: GolfSummary, segs: string[], intent: GolfIntent | null): GolfScope | { redirect: string } | null {
  if (segs.length > 2) return null;
  const decoded = segs.map(golfDecode);
  if (decoded.some((x) => x == null)) return null;
  const [region, city] = decoded as string[];
  if (!region) return { region: null, city: null, short: null, pages: s.pages };
  if (!(GOLF_REGIONS as readonly string[]).includes(region)) return null;
  const inRegion = s.pages.filter((p) => p.region === region);
  if (!inRegion.length) return null;
  if (!city) return { region, city: null, short: null, pages: inRegion };
  const hit = inRegion.filter((p) => p.city && cityShort(p.city) === city);
  if (hit.length) return { region, city: hit[0].city, short: city, pages: hit };
  const long = inRegion.find((p) => p.city === city);
  if (long) return { redirect: `${ORIGIN}${listPath({ intent, region, city: long.city })}` };
  return null;
}

/** 범위 안의 글(의도가 있으면 그 의도만). */
function golfScopeListings(s: GolfSummary, sc: { region: string | null; short: string | null }, intent: GolfIntent | null, now: number): GolfListingRow[] {
  return s.listings.filter((l) => {
    const p = s.bySlug.get(l.slug);
    if (!p || !golfInScope(p, sc)) return false;
    return !intent || listingIntents(l, now).includes(intent);
  });
}

/**
 * 의도 허브 링크 — 이 범위에 그 의도의 글이 있으면 그 범위로, 없으면 한 단계씩 넓힌다(최상위는 항상 색인).
 * noindex 페이지로 크롤 예산을 흘리지 않고, 링크 글자가 곧 검색어("이천 골프 조인·동반자 모집")가 된다.
 */
function golfIntentLinks(s: GolfSummary, sc: { region: string | null; city: string | null; short: string | null }, now: number, except?: GolfIntent): string {
  const links = GOLF_INTENTS.filter((i) => i !== except).map((intent) => {
    const tries: { region: string | null; city: string | null; short: string | null }[] = [];
    if (sc.short) tries.push(sc);
    if (sc.region) tries.push({ region: sc.region, city: null, short: null });
    tries.push({ region: null, city: null, short: null });
    for (const t of tries) {
      const n = golfScopeListings(s, t, intent, now).length;
      if (n || (!t.region && !t.short)) {
        const o = { intent, region: t.region, city: t.city };
        return `<a href="${esc(listPath(o))}">${esc(listTitle(o).split(" | ")[0])}</a>${n ? ` (${n})` : ""}`;
      }
    }
    return "";
  }).filter(Boolean);
  return links.join(" · ");
}

/** 보이는 경로 표시 + BreadcrumbList. 마지막 칸은 현재 페이지(링크 없음). */
function golfCrumbs(items: { name: string; path: string }[]): { html: string; ld: unknown } {
  const html = `<nav aria-label="경로">${items.map((c, i) => i === items.length - 1 ? esc(c.name) : `<a href="${esc(c.path)}">${esc(c.name)}</a>`).join(" › ")}</nav>`;
  const ld = {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
  return { html, ld };
}

const golfImage = (alt: string) => ({ url: OG_IMAGE, width: 1200, height: 630, alt });

// ── /golf/course/:slug ────────────────────────────────────────────
async function renderGolfCourse(s: GolfSummary, rawSlug: string, now: number): Promise<GolfRender> {
  const slug = golfDecode(rawSlug);
  if (!slug) return golfGone("골프장을 찾을 수 없습니다.", "요청한 골프장 정보가 없습니다.");
  const p = s.bySlug.get(slug);
  if (!p) {
    // 옛 주소(/golf/course/74 — 정적 목록 id) → 슬러그 정본으로
    const old = /^\d{1,6}$/.test(slug) ? s.byCourseId.get(Number(slug)) : undefined;
    if (old) return { status: 301, tag: "golf-course:301", html: "", location: `${ORIGIN}${coursePath(old.slug)}` };
    return golfGone("골프장을 찾을 수 없습니다.", "요청한 골프장 정보가 없습니다.");
  }
  const rows = async (x: any) => { const r: any = await db.execute(x); return (r.rows ?? r) as any[]; };
  const [prices, hist, rounds] = await Promise.all([
    rows(sql`select item_id, label, price, change, year_high, year_low, as_of::text as as_of
             from golf_membership_prices where slug = ${slug} order by price desc`),
    rows(sql`select h.item_id, h.d::text as d, h.price from golf_membership_price_history h
             join golf_membership_prices m on m.item_id = h.item_id
             where m.slug = ${slug} and h.d > current_date - interval '400 days' order by h.item_id, h.d`),
    p.clubId
      ? rows(sql`select count(*)::int n from golf_match_sessions where course_id = ${p.clubId} and status = 'finished'`).catch(() => [{ n: 0 }])
      : Promise.resolve([{ n: 0 }]),
  ]);
  const byListing = golfListingsBySlug(s);
  const listings = byListing.get(slug) ?? [];
  const top = s.top.get(slug);
  const fees = golfFees(p);
  const facts = {
    name: p.name, region: p.region, city: p.city, kind: p.kind, holes: p.holes, fees, topPrice: top?.price ?? null, listingCount: listings.length,
    feeFrom: p.feeFrom, grass: p.grass, play: p.play, aliases: p.aliases,
  };
  const title = courseTitle(facts);
  const desc = courseDescription(facts);
  const canonical = `${ORIGIN}${coursePath(slug)}`;
  const regionName = REGION_LABEL[p.region] ?? p.region;
  const short = p.city ? cityShort(p.city) : null;
  const crumbs = golfCrumbs([
    { name: "전국 골프장", path: listPath() },
    { name: regionName, path: listPath({ region: p.region }) },
    ...(p.city ? [{ name: short!, path: listPath({ region: p.region, city: p.city }) }] : []),
    { name: p.name, path: coursePath(slug) },
  ]);

  // 기본 정보
  const info = (p.info ?? {}) as { opened?: string | null; members?: number | null; homepage?: string | null; membershipTypes?: string | null; membershipNotes?: string | null };
  const siteRaw = p.website || info.homepage;
  const homepage = typeof siteRaw === "string" && /^https?:\/\/[^\s"<>]+$/i.test(siteRaw) ? siteRaw : null;
  const PLAY_KO: Record<string, string> = { "3인가능": "3인 플레이 가능", "2인가능": "2인 플레이 가능", 노캐디: "노캐디" };
  const watchers = s.watchers.get(slug) ?? 0;
  const nRounds = Number(rounds[0]?.n ?? 0);
  const dl: [string, string][] = [
    ["다른 이름", distinctAliases(p.name, p.aliases).join(" · ")],
    ["지역", golfWhere(p.region, p.city)],
    ["주소", p.address ?? ""],
    ["대표 전화", p.phone ?? ""],
    ["규모", golfShape(p)],
    ["잔디", (p.grass ?? []).join(" · ")],
    ["플레이", (p.play ?? []).map((x) => PLAY_KO[x] ?? x).join(" · ")],
    ["그린피", !weekdayFee(fees) && p.feeFrom ? `${wonShort(p.feeFrom)}부터` : ""],
    ["개장", dateKo(info.opened)],
    ["회원 수", info.members ? `${info.members.toLocaleString("ko-KR")}명` : ""],
    ["회원권 종류", info.membershipTypes ?? ""],
    ["회원권 참고", info.membershipNotes ?? ""],
    ["랭큐매치 라운드", nRounds ? `${nRounds.toLocaleString("ko-KR")}회` : ""],
    ["관심 등록", watchers ? `${watchers.toLocaleString("ko-KR")}명` : ""],
  ];
  const dlHtml = dl.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n    ");
  const mapHtml = p.lat != null && p.lng != null
    ? `<p><a href="${esc(`https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lng}`)}" rel="noopener">카카오맵에서 보기</a> · <a href="${esc(`https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`)}" rel="noopener">길찾기</a>${homepage ? ` · <a href="${esc(homepage)}" rel="noopener">공식 홈페이지</a>` : ""}</p>`
    : homepage ? `<p><a href="${esc(homepage)}" rel="noopener">공식 홈페이지</a></p>` : "";

  // 그린피 표 — 값이 하나도 없는 열은 뺀다
  let feeHtml = "";
  const feeRows = fees?.rows ?? [];
  if (feeRows.length) {
    const cols = ([["nonMember", "비회원"], ["member", "회원"], ["family", "가족"]] as const).filter(([k]) => feeRows.some((r) => (r[k] ?? 0) > 0));
    const extra = [fees?.extra?.caddie ? `캐디피 ${wonFull(fees.extra.caddie)}` : "", fees?.extra?.cart ? `카트비 ${wonFull(fees.extra.cart)}` : ""].filter(Boolean);
    if (cols.length) {
      feeHtml = `
  <h2>${esc(p.name)} 그린피</h2>
  <table>
    <caption>1인 그린피</caption>
    <thead><tr><th scope="col">구분</th>${cols.map(([, l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead>
    <tbody>
    ${feeRows.map((r) => `<tr><th scope="row">${esc(r.day)}</th>${cols.map(([k]) => `<td>${esc(wonFull(r[k]) || "—")}</td>`).join("")}</tr>`).join("\n    ")}
    </tbody>
  </table>${extra.length ? `\n  <p>${esc(extra.join(" · "))}</p>` : ""}`;
    }
  }

  // 회원권 시세 — 종목별 현재가·직전 대비·1년 최고/최저·기록 시작 이후 변동 + 월별 표
  let priceHtml = "";
  if (prices.length) {
    const byItem = new Map<string, { d: string; p: number }[]>();
    for (const h of hist) {
      const a = byItem.get(h.item_id);
      const pt = { d: String(h.d).slice(0, 10), p: Number(h.price) };
      if (a) a.push(pt); else byItem.set(h.item_id, [pt]);
    }
    const changeText = (c: unknown) => {
      if (c == null) return "—";
      const n = Number(c);
      return n === 0 ? "보합" : n > 0 ? `▲ ${manwonText(n)}` : `▼ ${manwonText(-n)}`;
    };
    const sinceText = (m: any) => {
      const first = byItem.get(m.item_id)?.[0];
      if (!first || !first.p || !m.as_of || first.d >= m.as_of) return "—";
      const pct = ((Number(m.price) - first.p) / first.p) * 100;
      const pctText = Math.abs(pct) < 0.05 ? "변동 없음" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
      return `${pctText} (${first.d.replace(/-/g, ".")}부터)`;
    };
    const asOf = prices.map((m) => m.as_of).filter(Boolean).sort().pop();
    // 월별: 그 달의 마지막 기록(이번 달은 최근가). 최근 13개월.
    const months = new Map<string, Map<string, number>>();
    for (const [item, arr] of byItem) for (const x of arr) {
      const ym = x.d.slice(0, 7);
      if (!months.has(ym)) months.set(ym, new Map());
      months.get(ym)!.set(item, x.p);
    }
    const yms = [...months.keys()].sort().reverse().slice(0, 13);
    const monthly = yms.length >= 2
      ? `
  <h3>월별 시세</h3>
  <table>
    <thead><tr><th scope="col">월</th>${prices.map((m) => `<th scope="col">${esc(m.label)}</th>`).join("")}</tr></thead>
    <tbody>
    ${yms.map((ym) => `<tr><th scope="row">${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월</th>${prices.map((m) => `<td>${esc(manwonText(months.get(ym)!.get(m.item_id)) || "—")}</td>`).join("")}</tr>`).join("\n    ")}
    </tbody>
  </table>`
      : "";
    priceHtml = `
  <h2>${esc(p.name)} 회원권 시세</h2>
  <table>
    <caption>${asOf ? `${esc(dateKo(asOf))} 기준` : "회원권 시세"}</caption>
    <thead><tr><th scope="col">종목</th><th scope="col">현재가</th><th scope="col">직전 대비</th><th scope="col">연중 최고</th><th scope="col">연중 최저</th><th scope="col">추이</th></tr></thead>
    <tbody>
    ${prices.map((m) => `<tr><th scope="row">${esc(m.label)}</th><td>${esc(manwonText(m.price) || "—")}</td><td>${esc(changeText(m.change))}</td><td>${esc(manwonText(m.year_high) || "—")}</td><td>${esc(manwonText(m.year_low) || "—")}</td><td>${esc(sinceText(m))}</td></tr>`).join("\n    ")}
    </tbody>
  </table>${monthly}`;
  }

  // 코스(파)
  let courseHtml = "";
  const courses: { name?: string; par?: number; holes?: number }[] = Array.isArray(p.courses) ? p.courses : [];
  if (courses.length) {
    const holes = courses.reduce((a, c) => a + (Number(c.holes) || 0), 0);
    // 파 합계는 18홀일 때만 — 27홀 코스의 "파 108" 은 참이지만 아무도 그렇게 치지 않는다
    const par = courses.reduce((a, c) => a + (Number(c.par) || 0), 0);
    courseHtml = `
  <h2>코스</h2>
  <ul>
  ${courses.map((c) => `<li>${esc(c.name ?? "")}${[c.holes ? `${c.holes}홀` : "", c.par ? `파 ${c.par}` : ""].filter(Boolean).length ? ` — ${esc([c.holes ? `${c.holes}홀` : "", c.par ? `파 ${c.par}` : ""].filter(Boolean).join(" · "))}` : ""}</li>`).join("\n  ")}
  </ul>${courses.length > 1 && holes ? `\n  <p>${esc(`코스 ${courses.length}개 · 총 ${holes}홀${holes === 18 && par ? ` · 파 ${par}` : ""}`)}</p>` : ""}`;
  }

  const introHtml = p.intro ? `\n  <h2>${esc(p.name)} 소개</h2>\n  <p>${esc(p.intro)}</p>` : "";

  // 지금 올라온 티타임
  const listingHtml = listings.length
    ? `\n  <h2>지금 올라온 티타임 ${listings.length}건</h2>\n  <ul>\n  ${listings.slice(0, 40).map((l) => golfListingLi(s, l, false)).join("\n  ")}\n  </ul>`
    : "";

  // 가까운 골프장 8곳 — 좌표가 있으면 거리순, 없으면 같은 시군 → 같은 지역
  let near: { x: GolfPageRow; km: number | null }[] = [];
  if (p.lat != null && p.lng != null) {
    near = s.pages.filter((x) => x.slug !== slug && x.lat != null && x.lng != null)
      .map((x) => ({ x, km: distanceKm(p.lat!, p.lng!, x.lat!, x.lng!) }))
      .sort((a, b) => a.km! - b.km!).slice(0, 8);
  } else {
    const same = s.pages.filter((x) => x.slug !== slug && x.region === p.region);
    near = [...same.filter((x) => p.city && x.city === p.city), ...same.filter((x) => !p.city || x.city !== p.city)].slice(0, 8).map((x) => ({ x, km: null }));
  }
  const nearHtml = near.length
    ? `\n  <h2>${esc(p.name)} 가까운 골프장</h2>\n  <ul>\n  ${near.map(({ x, km }) => golfCourseLi(s, x, byListing, { where: true, km })).join("\n  ")}\n  </ul>`
    : "";

  const scope = { region: p.region, city: p.city, short };
  const cityCount = p.city ? s.pages.filter((x) => golfInScope(x, { region: p.region, short })).length : 0;
  const regionCount = s.pages.filter((x) => x.region === p.region).length;
  const hubHtml = `
  <h2>더 찾아보기</h2>
  <nav aria-label="골프장 목록">${p.city ? `<a href="${esc(listPath({ region: p.region, city: p.city }))}">${esc(short!)} 골프장 ${cityCount}곳</a> · ` : ""}<a href="${esc(listPath({ region: p.region }))}">${esc(regionName)} 골프장 ${regionCount}곳</a> · <a href="${esc(listPath())}">전국 골프장 ${s.pages.length}곳</a></nav>
  <nav aria-label="티타임">${golfIntentLinks(s, scope, now)}</nav>`;

  // 구조화 데이터 — 데이터에 있는 것만. 평점·리뷰 수는 없다(지어내면 구글 구조화 데이터 정책 위반).
  const feeVals = feeRows.map((r) => r.nonMember).filter((v): v is number => typeof v === "number" && v > 0);
  // 1/N(총액을 나누는 글)은 1인 값이 아니라 가격 범위에서 뺀다
  const priced = listings.filter((l) => l.costMode !== "SPLIT").map((l) => Number(l.greenFee)).filter(l0);
  const course: Record<string, unknown> = {
    "@type": "GolfCourse",
    "@id": `${canonical}#course`,
    name: p.name,
    ...(distinctAliases(p.name, p.aliases).length ? { alternateName: distinctAliases(p.name, p.aliases) } : {}),
    url: canonical,
    description: desc,
    ...(p.logo ? { logo: `${ORIGIN}${p.logo}`, image: `${ORIGIN}${p.logo}` } : {}),
    ...(p.phone ? { telephone: p.phone } : {}),
    // addressRegion 은 넣지 않는다 — 우리 지역은 '경상·전라' 같은 묶음이라 행정구역으로 적으면 거짓이다(2026-09-24 검토).
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      ...(p.city ? { addressLocality: p.city } : {}),
      ...(p.address ? { streetAddress: p.address } : {}),
    },
    ...(p.lat != null && p.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } } : {}),
    ...(homepage ? { sameAs: homepage } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(String(info.opened ?? "")) ? { foundingDate: info.opened } : {}),
    ...(feeVals.length ? { priceRange: Math.min(...feeVals) === Math.max(...feeVals) ? wonShort(feeVals[0]) : `${wonShort(Math.min(...feeVals))}~${wonShort(Math.max(...feeVals))}` } : {}),
    ...(priced.length
      ? { makesOffer: { "@type": "AggregateOffer", priceCurrency: "KRW", lowPrice: Math.min(...priced), highPrice: Math.max(...priced), offerCount: priced.length, url: canonical } }
      : {}),
  };

  const html = page({
    title,
    desc,
    canonical,
    image: golfImage(`${p.name} — 랭큐 골프`),
    jsonLd: [{ "@context": "https://schema.org", "@graph": [course, crumbs.ld] }],
    body: `<main>
  ${crumbs.html}
  ${p.logo ? `<img src="${esc(p.logo)}" alt="${esc(`${p.name} 로고`)}" width="160" height="56" loading="eager">` : ""}
  <h1>${esc(p.name)}</h1>
  <p>${esc(desc)}</p>
  <h2>${esc(p.name)} 기본 정보</h2>
  <dl>
    ${dlHtml}
  </dl>
  ${mapHtml}${listingHtml}${feeHtml}${priceHtml}${courseHtml}${introHtml}${nearHtml}${hubHtml}
  ${hubNav("ko")}
</main>`,
  });
  return { status: 200, tag: `golf-course:${encodeURIComponent(slug)}`, html };
}
/** 티타임 그린피로 믿을 만한 값(1천원~200만원). 입력 실수(27 → 27원)가 가격 범위를 망치지 않게. */
function l0(v: number): boolean { return Number.isFinite(v) && v >= 1000 && v <= 2_000_000; }

// ── /golf/courses[/:region[/:city]] ──────────────────────────────
function renderGolfList(s: GolfSummary, sc: GolfScope, now: number): GolfRender {
  const byListing = golfListingsBySlug(s);
  const live = golfScopeListings(s, sc, null, now);
  const o = { region: sc.region, city: sc.city };
  const title = listTitle(o);
  const desc = listDescription({ ...o, courseCount: sc.pages.length, listingCount: live.length });
  const canonical = `${ORIGIN}${listPath(o)}`;
  const where = sc.short ?? (sc.region ? (REGION_LABEL[sc.region] ?? sc.region) : "전국");
  const crumbs = golfCrumbs([
    { name: "전국 골프장", path: listPath() },
    ...(sc.region ? [{ name: REGION_LABEL[sc.region] ?? sc.region, path: listPath({ region: sc.region }) }] : []),
    ...(sc.city ? [{ name: sc.short!, path: listPath(o) }] : []),
  ]);
  const sorted = golfSort(s, sc.pages, byListing, now, null);
  const ul = (ps: GolfPageRow[]) => `<ul>\n  ${ps.map((p) => golfCourseLi(s, p, byListing)).join("\n  ")}\n  </ul>`;
  /** 한 지역의 시군 링크 — 골프장 많은 순. */
  const cityLinks = (region: string, current?: string | null) => {
    const m = new Map<string, { city: string; n: number }>();
    for (const p of s.pages) if (p.region === region && p.city) {
      const k = cityShort(p.city);
      const e = m.get(k);
      if (e) e.n++; else m.set(k, { city: p.city, n: 1 });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ko"))
      .map(([k, v]) => k === current ? `<strong>${esc(k)}</strong> (${v.n})` : `<a href="${esc(listPath({ region, city: v.city }))}">${esc(k)} 골프장</a> (${v.n})`).join(" · ");
  };

  let listHtml = "";
  if (!sc.region) {
    // 전국: 지역마다 절 하나 — 시군 링크 + 골프장 전부
    listHtml = GOLF_REGIONS.map((r) => {
      const ps = sorted.filter((p) => p.region === r);
      if (!ps.length) return "";
      return `
  <h2><a href="${esc(listPath({ region: r }))}">${esc(REGION_LABEL[r] ?? r)} 골프장</a> ${ps.length}곳</h2>
  <p>${cityLinks(r)}</p>
  ${ul(ps)}`;
    }).join("");
  } else if (!sc.city) {
    // 지역: 시군 링크 → 시군별 골프장
    const groups = new Map<string, GolfPageRow[]>();
    for (const p of sorted) {
      const k = p.city ? cityShort(p.city) : "";
      const a = groups.get(k);
      if (a) a.push(p); else groups.set(k, [p]);
    }
    const keys = [...groups.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || groups.get(b)!.length - groups.get(a)!.length || a.localeCompare(b, "ko"));
    listHtml = `
  <h2>${esc(where)} 시군별 골프장</h2>
  <p>${cityLinks(sc.region)}</p>
  <h2>${esc(where)} 골프장 목록</h2>
  ${keys.map((k) => {
      const ps = groups.get(k)!;
      const head = k ? `<a href="${esc(listPath({ region: sc.region, city: ps[0].city }))}">${esc(k)}</a> ${ps.length}곳` : `그 밖의 골프장 ${ps.length}곳`;
      return `<h3>${head}</h3>\n  ${ul(ps)}`;
    }).join("\n  ")}`;
  } else {
    listHtml = `
  <h2>${esc(sc.short!)} 골프장 목록</h2>
  ${ul(sorted)}
  <h2>${esc(REGION_LABEL[sc.region] ?? sc.region)}의 다른 시군</h2>
  <p>${cityLinks(sc.region, sc.short)}</p>`;
  }
  const otherRegions = sc.region
    ? `\n  <h2>다른 지역 골프장</h2>\n  <p>${GOLF_REGIONS.filter((r) => r !== sc.region && s.pages.some((p) => p.region === r)).map((r) => `<a href="${esc(listPath({ region: r }))}">${esc(REGION_LABEL[r] ?? r)} 골프장</a>`).join(" · ")}</p>`
    : "";
  const liveHtml = live.length
    ? `\n  <h2>지금 올라온 티타임 ${live.length}건</h2>\n  <ul>\n  ${live.slice(0, 30).map((l) => golfListingLi(s, l, true)).join("\n  ")}\n  </ul>`
    : "";

  const html = page({
    title,
    desc,
    canonical,
    image: golfImage(`${where} 골프장 — 랭큐 골프`),
    jsonLd: [{
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ItemList",
          name: `${where} 골프장`,
          numberOfItems: sorted.length,
          itemListElement: sorted.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${ORIGIN}${coursePath(p.slug)}` })),
        },
        crumbs.ld,
      ],
    }],
    body: `<main>
  ${crumbs.html}
  <h1>${esc(where)} 골프장 ${sc.pages.length}곳</h1>
  <p>${esc(desc)}</p>${liveHtml}${listHtml}
  <h2>${esc(where)} 티타임</h2>
  <nav aria-label="티타임">${golfIntentLinks(s, sc, now)}</nav>${otherRegions}
  ${hubNav("ko")}
</main>`,
  });
  return { status: 200, tag: `golf-courses:${encodeURIComponent(sc.short ?? sc.region ?? "all")}`, html };
}

// ── /golf/{booking|join|urgent}[/:region[/:city]] ────────────────
function renderGolfIntent(s: GolfSummary, intent: GolfIntent, sc: GolfScope, now: number): GolfRender {
  const byListing = golfListingsBySlug(s);
  const live = golfScopeListings(s, sc, intent, now);
  const o = { intent, region: sc.region, city: sc.city };
  const title = listTitle(o);
  const desc = listDescription({ ...o, courseCount: sc.pages.length, listingCount: live.length });
  const canonical = `${ORIGIN}${listPath(o)}`;
  const where = sc.short ?? (sc.region ? (REGION_LABEL[sc.region] ?? sc.region) : "전국");
  const label = INTENT_LABEL[intent];
  // 빈 조합(지역·시군 × 의도)을 색인시키면 거의 같은 빈 페이지 수백 장이 된다 — 사이트 전체 품질 신호를 끌어내린다.
  const noindex = !!sc.region && live.length === 0;
  const crumbs = golfCrumbs([
    { name: `전국 ${label}`, path: listPath({ intent }) },
    ...(sc.region ? [{ name: REGION_LABEL[sc.region] ?? sc.region, path: listPath({ intent, region: sc.region }) }] : []),
    ...(sc.city ? [{ name: sc.short!, path: listPath(o) }] : []),
  ]);
  const liveHtml = live.length
    ? `\n  <h2>${esc(where)} ${esc(label)} ${live.length}건</h2>\n  <ul>\n  ${live.slice(0, 100).map((l) => golfListingLi(s, l, true)).join("\n  ")}\n  </ul>`
    : "";
  // 아래 범위(지역·시군) 중 그 의도의 글이 있는 곳만 — 빈 조합은 noindex 라 링크하지 않는다.
  let subHtml = "";
  if (!sc.city) {
    const subs: { name: string; path: string; n: number }[] = [];
    if (!sc.region) {
      for (const r of GOLF_REGIONS) {
        const n = golfScopeListings(s, { region: r, short: null }, intent, now).length;
        if (n) subs.push({ name: REGION_LABEL[r] ?? r, path: listPath({ intent, region: r }), n });
      }
    } else {
      const seen = new Set<string>();
      for (const p of sc.pages) {
        if (!p.city) continue;
        const k = cityShort(p.city);
        if (seen.has(k)) continue;
        seen.add(k);
        const n = golfScopeListings(s, { region: sc.region, short: k }, intent, now).length;
        if (n) subs.push({ name: k, path: listPath({ intent, region: sc.region, city: p.city }), n });
      }
    }
    if (subs.length) subHtml = `\n  <h2>${esc(sc.region ? "시군별" : "지역별")} ${esc(label)}</h2>\n  <p>${subs.sort((a, b) => b.n - a.n).map((x) => `<a href="${esc(x.path)}">${esc(x.name)} ${esc(label)}</a> (${x.n})`).join(" · ")}</p>`;
  }
  // 이 범위의 골프장 — 전국은 앞의 60곳만(전부는 /golf/courses 가 싣는다)
  const sorted = golfSort(s, sc.pages, byListing, now, intent);
  const shown = sc.region ? sorted : sorted.slice(0, 60);
  const coursesHtml = `
  <h2>${esc(where)} 골프장</h2>
  <ul>
  ${shown.map((p) => golfCourseLi(s, p, byListing, { where: !sc.region })).join("\n  ")}
  </ul>
  <p><a href="${esc(listPath({ region: sc.region, city: sc.city }))}">${esc(where)} 골프장 ${sc.pages.length}곳 전체</a></p>`;
  const html = page({
    title,
    desc,
    canonical,
    noindex,
    image: golfImage(`${title.split(" | ")[0]} — 랭큐 골프`),
    jsonLd: [{ "@context": "https://schema.org", "@graph": [crumbs.ld] }],
    body: `<main>
  ${crumbs.html}
  <h1>${esc(title.split(" | ")[0])}</h1>
  <p>${esc(desc)}</p>${liveHtml}${subHtml}${coursesHtml}
  <h2>다른 티타임</h2>
  <nav aria-label="티타임">${golfIntentLinks(s, sc, now, intent)}</nav>
  ${hubNav("ko")}
</main>`,
  });
  return { status: 200, tag: `golf-${intent}:${encodeURIComponent(sc.short ?? sc.region ?? "all")}${noindex ? ":noindex" : ""}`, html };
}

/**
 * 골프장 페이지 경로 하나를 렌더한다(검증 스크립트가 Express 없이 부른다). pathname 은 **인코딩된 그대로**(req.path).
 * DB 예외는 그대로 던진다 — 부른 쪽이 503 으로 바꾼다(404 로 내면 일시 장애 동안 정본 URL 이 색인에서 빠진다).
 */
export async function renderGolfPath(pathname: string): Promise<GolfRender | null> {
  const path = pathname.replace(/\/+$/, "");
  if (!GOLF_PAGE_RE.test(path)) return null;
  const [, , kind, ...rest] = path.split("/");
  const s = golfView(await loadGolfCourseSummary());
  const now = Date.now();
  if (kind === "course") {
    if (rest.length !== 1) return golfGone("골프장을 찾을 수 없습니다.", "요청한 골프장 정보가 없습니다.");
    return renderGolfCourse(s, rest[0], now);
  }
  const intent = kind === "courses" ? null : (kind as GolfIntent);
  const sc = golfScope(s, rest, intent);
  if (!sc) return golfGone("지역을 찾을 수 없습니다.", "요청한 지역의 골프장 정보가 없습니다.");
  if ("redirect" in sc) return { status: 301, tag: `golf:301`, html: "", location: sc.redirect };
  return intent ? renderGolfIntent(s, intent, sc, now) : renderGolfList(s, sc, now);
}

export function registerPrerender(app: Express) {
  // ── 홈(/) 은 일부러 프리렌더하지 않는다 ────────────────────────────
  // client/index.html 의 정적 홈이 이미 더 낫다:
  //   · title·description·canonical 이 이미 홈 기준으로 정확하다(홈이 문제였던 적이 없다.
  //     문제는 **다른 페이지들이 홈의 메타를 물려받는** 것이었고, 그건 아래 라우트들이 고친다)
  //   · @graph 로 Organization + WebSite + MobileApplication + FAQPage 4종을 이미 낸다
  //     — 여기서 만들 수 있는 SoftwareApplication 하나보다 풍부하다
  //   · naver-site-verification 2개 + google-site-verification 이 들어 있다.
  //     홈을 프리렌더로 대체하면 이 메타가 사라져 **소유확인이 풀릴 위험**이 있다
  //   · og:image 와 hreflang 4개 언어도 이미 선언돼 있다
  // 반면 홈의 실제 렌더 결과는 로그인 폼 4줄(landing.tsx)뿐이라 프리렌더로 얻을 본문이 없다.
  // → 홈은 정적 셸에 맡긴다. vercel.json 의 봇 라우트에서도 "/" 를 제외해야 한다.

  // ── /about ─────────────────────────────────────────────────────────
  // 홈(/) — 검색 방문자에게 보이는 랜딩과 **같은 문안**을 봇에게 텍스트로 준다.
  // 구글은 JS를 렌더링해 랜딩 본문을 읽지만 네이버(Yeti)는 그러지 않아, 프리렌더가 없으면
  // 정적 셸의 메타 태그만 보고 본문(기능·크루·FAQ)을 통째로 못 본다.
  // 문안은 shared/landingContent.ts 정본을 그대로 써서 클로킹이 되지 않게 한다.
  // 홈 섹션 소제목 — 본문(features/faq)과 같은 언어로 나가야 한다. 한국어로 고정해 두면
  // 언어판이 반쪽짜리가 되어 "번역된 척"이 된다.
  const HOME_H: Record<string, { canH: string; canP: string; faqH: string; about: string; stores: string; support: string }> = {
    ko: { canH: "이런 걸 할 수 있어요", canP: "점수판부터 매칭, 기록, 당구 커뮤니티까지 — 당구장에서 필요한 게 한 앱에 모여 있습니다.", faqH: "자주 묻는 질문", about: "랭큐 소개", stores: "매장 찾기", support: "고객지원" },
    en: { canH: "What you can do", canP: "Scoreboard, matched games, history and a billiards community — everything you need at the hall, in one app.", faqH: "Frequently asked questions", about: "About RANKUE", stores: "Find a venue", support: "Support" },
    vi: { canH: "Bạn có thể làm gì", canP: "Bảng điểm, đấu ghép cặp, lịch sử và cộng đồng bida — mọi thứ bạn cần ở quán, gói trong một app.", faqH: "Câu hỏi thường gặp", about: "Giới thiệu RANKUE", stores: "Tìm quán", support: "Hỗ trợ" },
    tr: { canH: "Neler yapabilirsiniz", canP: "Skor tablosu, eşleşmeli maç, geçmiş ve bilardo topluluğu — salonda gereken her şey tek uygulamada.", faqH: "Sıkça sorulan sorular", about: "RANKUE Hakkında", stores: "Salon bul", support: "Destek" },
    es: { canH: "Qué puedes hacer", canP: "Marcador, partidas emparejadas, historial y comunidad del billar: todo lo que necesitas en la sala, en una app.", faqH: "Preguntas frecuentes", about: "Acerca de RANKUE", stores: "Buscar sala", support: "Soporte" },
  };

  app.get("/", async (req, res, next) => {
    if (!isBot(req)) return next();
    // 언어판 — 사이트맵이 홈에 en·vi·tr·es 를 선언하므로 실제로 그 언어를 서빙해야 한다.
    // 화이트리스트 밖 값(?lang=zz)은 ko 로 접고 canonical 도 ko 판을 가리켜 soft-404 를 막는다.
    const q = String(req.query.lang ?? "");
    const lang = (LANDING_LANGS as readonly string[]).includes(q) ? q : "ko";
    const c = landingContent(lang);
    const h = HOME_H[lang] ?? HOME_H.ko;
    // 세계랭킹 톱 10 — 홈에서 선수 페이지로 가는 서버 렌더 링크(크롤 경로). 실패해도 홈은 나간다.
    let top10Html = "";
    try {
      const data = await storage.umb.getRankings("players", { limit: 10 });
      const ls = lang === "ko" ? "" : `?lang=${lang}`;
      if (data.rows.length) {
        const disp = (r: any) => lang === "ko" && r.nativeName ? `${r.nativeName} (${r.playerName})` : r.playerName;
        top10Html = `<h2><a href="/world-ranking${ls}">${esc((WR_L10N[lang] ?? WR_L10N.ko).topH)}</a></h2>
  <ol>
  ${data.rows.map((r: any) => `<li><a href="/player/players/${esc(r.playerUmbId)}${ls}">${esc(disp(r))}</a> (${esc(r.fed)})</li>`).join("\n  ")}
  </ol>`;
      }
    } catch (e) {
      console.warn("[prerender] home top10 failed:", (e as Error)?.message);
    }
    res.setHeader("X-Prerender", "home");
    noStore(res);
    res.send(
      page({
        lang,
        title: c.title,
        desc: c.desc,
        // 언어판은 자기 URL 을 self-canonical 해야 한다(안 그러면 전부 ko 의 중복으로 색인 제외).
        canonical: lang === "ko" ? `${ORIGIN}/` : `${ORIGIN}/?lang=${lang}`,
        altLangs: LANDING_LANGS.filter((l) => l !== "ko") as unknown as string[],
        altBase: `${ORIGIN}/`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: c.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          APP_LD,
        ],
        body: `<main>
  <h1>${esc(c.h1)}</h1>
  <p>${esc(c.lead)}</p>

  <h2>${esc(h.canH)}</h2>
  <p>${esc(h.canP)}</p>
  ${c.features.map((f) => `<section><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p></section>`).join("\n  ")}

  <h2>${esc(c.crew.title)}</h2>
  <p>${esc(c.crew.desc)}</p>
  <ul>
  ${c.crew.items.map((i) => `<li>${esc(i.t)} — ${esc(i.d)}</li>`).join("\n  ")}
  </ul>

  <h2>${esc(h.faqH)}</h2>
  ${c.faqs.map((f) => `<section><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></section>`).join("\n  ")}

  ${top10Html}
  ${hubNav(lang)}
</main>`,
      }),
    );
  });

  // ── /world-ranking ─────────────────────────────────────────────────
  // UMB 세계랭킹 — 사이트맵에 등록된 검색 유입 타깃이라 봇에게 빈 SPA 셸이 아니라
  // 실제 톱10이 담긴 HTML을 내보낸다. DB 조회 실패 시에도 메타는 나가야 한다.
  // 목록 페이지 언어별 문구 — 각 언어의 핵심 키워드("bilardo dünya sıralaması" 등)를 정면 타깃
  const WR_L10N: Record<string, {
    title: string; desc: string; intro: string; topH: string;
    faqH: string; faq1q: string; faq1a: (name: string, pts: number, updated: string) => string;
    fedFaq: { fed: string; q: string; a: (name: string, rank: number, count: number) => string } | null;
    freqQ: string; freqA: string; loading: string; source: string;
    gapQ: string; gapA: (n1: string, n2: string, diff: number) => string;
    no1H: string; weeksWord: (n: number) => string; nowWord: string;
    watchNote: string;
    ladiesH: string; juniorsH: string; fedH: string | null; moreH: string;
  }> = {
    ko: {
      title: "당구 세계랭킹 — UMB 공식 3쿠션 랭킹 | 랭큐 RANKUE",
      desc: "UMB 공식 3쿠션 세계랭킹을 매주 업데이트. 남자·여자·주니어 전체 순위와 한국 선수, 선수별 순위 히스토리를 랭큐에서 확인하세요.",
      intro: "UMB(세계당구연맹) 공식 3쿠션 세계랭킹입니다. 매주 갱신되며 남자·여자·주니어 부문 전체 순위와 선수별 순위 변동을 볼 수 있습니다.",
      topH: "남자 세계랭킹 톱 10", faqH: "자주 묻는 질문",
      faq1q: "당구 세계랭킹 1위는 누구인가요?",
      faq1a: (n, p, u) => `${u ? `${u} 기준 ` : ""}UMB 공식 3쿠션 세계랭킹 1위는 ${n} 선수입니다 (${p}점).`,
      fedFaq: { fed: "KR", q: "한국 당구 선수 최고 순위는?", a: (n, r, c) => `한국 선수 최고 순위는 ${n} 선수의 세계 ${r}위이며, 한국 선수 ${c}명이 랭킹에 올라 있습니다.` },
      freqQ: "당구 세계랭킹은 얼마나 자주 갱신되나요?",
      freqA: "UMB(세계당구연맹)가 대회 결과를 반영해 주 단위로 발표하며, 랭큐는 이를 자동 수집해 함께 갱신합니다.",
      loading: "랭킹 데이터를 불러오는 중입니다.", source: "출처: UMB 공식 랭킹",
      gapQ: "1위와 2위의 포인트 격차는 얼마나 되나요?",
      gapA: (n1, n2, d) => `현재 1위 ${n1}와(과) 2위 ${n2}의 격차는 ${d}점입니다.`,
      no1H: "역대 세계 1위", weeksWord: (n) => `${n}주`, nowWord: "현재",
      watchNote: "공식 중계: SOOP Live · 대회 공식 채널 (TRT Spor·HTV 등 지역별 상이)",
      ladiesH: "여자 세계랭킹 톱 20", juniorsH: "주니어 세계랭킹 톱 10", fedH: "한국 선수 세계랭킹 톱 20", moreH: "남자 세계랭킹 11~50위",
    },
    en: {
      title: "Billiards World Ranking — Official UMB 3-Cushion Rankings | RANKUE",
      desc: "Official UMB 3-cushion world rankings, updated weekly. Full men's, women's and junior standings with per-player rank history on RANKUE.",
      intro: "The official UMB (Union Mondiale de Billard) 3-cushion world ranking, updated weekly with full men's, women's and junior standings.",
      topH: "Men's world ranking top 10", faqH: "Frequently asked questions",
      faq1q: "Who is No.1 in the billiards world ranking?",
      faq1a: (n, p, u) => `${u ? `As of ${u}, ` : ""}the No.1 in the official UMB 3-cushion world ranking is ${n} (${p} points).`,
      fedFaq: null,
      freqQ: "How often is the billiards world ranking updated?",
      freqA: "The UMB publishes updated rankings weekly after each event, and RANKUE ingests them automatically.",
      loading: "Loading ranking data.", source: "Source: official UMB rankings",
      gapQ: "How close is the race for No.1?",
      gapA: (n1, n2, d) => `No.1 ${n1} currently leads No.2 ${n2} by ${d} points.`,
      no1H: "All-time world No.1s", weeksWord: (n) => `${n} wks`, nowWord: "current",
      watchNote: "Official broadcasts: SOOP Live and official event channels (TRT Spor, HTV by region)",
      ladiesH: "Women's world ranking top 20", juniorsH: "Junior world ranking top 10", fedH: null, moreH: "Men's world ranking No.11–50",
    },
    tr: {
      title: "Bilardo Dünya Sıralaması — Resmî UMB 3 Bant Sıralaması | RANKUE",
      desc: "Resmî UMB 3 bant dünya sıralaması, her hafta güncellenir. Erkekler, kadınlar ve gençler tam sıralama ve oyuncu bazlı sıralama geçmişi RANKUE'de.",
      intro: "UMB (Dünya Bilardo Birliği) resmî 3 bant dünya sıralaması. Her hafta güncellenir; erkekler, kadınlar ve gençler kategorilerinin tam sıralamasını içerir.",
      topH: "Erkekler dünya sıralaması ilk 10", faqH: "Sık sorulan sorular",
      faq1q: "Bilardo dünya sıralamasında 1 numara kim?",
      faq1a: (n, p, u) => `${u ? `${u} itibarıyla ` : ""}resmî UMB 3 bant dünya sıralamasının 1 numarası ${n} (${p} puan).`,
      fedFaq: { fed: "TR", q: "Türk oyuncuların en yüksek sıralaması kaç?", a: (n, r, c) => `En yüksek sıradaki Türk oyuncu, dünya ${r}. sırasındaki ${n}. Sıralamada toplam ${c} Türk oyuncu var.` },
      freqQ: "Bilardo dünya sıralaması ne sıklıkla güncellenir?",
      freqA: "UMB, turnuva sonuçlarını yansıtarak sıralamayı haftalık yayımlar; RANKUE bunları otomatik toplar.",
      loading: "Sıralama verileri yükleniyor.", source: "Kaynak: resmî UMB sıralaması",
      gapQ: "1 numara ile 2 numara arasındaki puan farkı ne kadar?",
      gapA: (n1, n2, d) => `Şu anda 1 numara ${n1}, 2 numara ${n2}'nin ${d} puan önünde.`,
      no1H: "Tüm zamanların dünya 1 numaraları", weeksWord: (n) => `${n} hafta`, nowWord: "güncel",
      watchNote: "Resmî yayınlar: TRT Spor, SOOP Live ve turnuva resmî kanalları",
      ladiesH: "Kadınlar dünya sıralaması ilk 20", juniorsH: "Gençler dünya sıralaması ilk 10", fedH: "Türk oyuncular — dünya sıralaması ilk 20", moreH: "Erkekler dünya sıralaması 11–50",
    },
    vi: {
      title: "BXH Bida Thế giới — BXH 3 băng chính thức của UMB | RANKUE",
      desc: "BXH bida 3 băng thế giới chính thức của UMB, cập nhật hằng tuần. Đầy đủ nam, nữ, trẻ và diễn biến thứ hạng từng cơ thủ trên RANKUE.",
      intro: "BXH bida 3 băng thế giới chính thức của UMB (Liên đoàn Bida Thế giới), cập nhật hằng tuần với đầy đủ các hạng mục nam, nữ và trẻ.",
      topH: "Top 10 BXH nam thế giới", faqH: "Câu hỏi thường gặp",
      faq1q: "Ai đang đứng số 1 BXH bida thế giới?",
      faq1a: (n, p, u) => `${u ? `Tính đến ${u}, ` : ""}số 1 BXH bida 3 băng thế giới chính thức của UMB là ${n} (${p} điểm).`,
      fedFaq: { fed: "VN", q: "Cơ thủ Việt Nam xếp hạng cao nhất là ai?", a: (n, r, c) => `Cơ thủ Việt Nam xếp cao nhất là ${n}, hạng ${r} thế giới. Có tổng cộng ${c} cơ thủ Việt Nam trong BXH.` },
      freqQ: "BXH bida thế giới cập nhật bao lâu một lần?",
      freqA: "UMB công bố BXH hằng tuần theo kết quả các giải; RANKUE tự động thu thập và cập nhật cùng lúc.",
      loading: "Đang tải dữ liệu BXH.", source: "Nguồn: BXH chính thức UMB",
      gapQ: "Khoảng cách điểm giữa hạng 1 và hạng 2 là bao nhiêu?",
      gapA: (n1, n2, d) => `Hiện tại hạng 1 ${n1} hơn hạng 2 ${n2} ${d} điểm.`,
      no1H: "Các số 1 thế giới qua các thời kỳ", weeksWord: (n) => `${n} tuần`, nowWord: "hiện tại",
      watchNote: "Phát sóng chính thức: SOOP Live, HTV và kênh chính thức của giải",
      ladiesH: "Top 20 BXH nữ thế giới", juniorsH: "Top 10 BXH trẻ thế giới", fedH: "Top 20 cơ thủ Việt Nam trên BXH thế giới", moreH: "BXH nam thế giới hạng 11–50",
    },
    es: {
      title: "Ranking Mundial de Billar — Ranking oficial UMB de tres bandas | RANKUE",
      desc: "Ranking mundial oficial UMB de billar a tres bandas, actualizado cada semana. Clasificación completa masculina, femenina y juvenil en RANKUE.",
      intro: "Ranking mundial oficial de billar a tres bandas de la UMB (Unión Mundial de Billar), actualizado semanalmente con las categorías masculina, femenina y juvenil.",
      topH: "Top 10 del ranking mundial masculino", faqH: "Preguntas frecuentes",
      faq1q: "¿Quién es el N.º 1 del ranking mundial de billar?",
      faq1a: (n, p, u) => `${u ? `A ${u}, ` : ""}el N.º 1 del ranking mundial oficial UMB de tres bandas es ${n} (${p} puntos).`,
      fedFaq: { fed: "ES", q: "¿Cuál es el mejor jugador español del ranking?", a: (n, r, c) => `El español mejor clasificado es ${n}, N.º ${r} del mundo. Hay ${c} jugadores españoles en el ranking.` },
      freqQ: "¿Con qué frecuencia se actualiza el ranking mundial de billar?",
      freqA: "La UMB publica el ranking semanalmente tras cada torneo; RANKUE lo recoge automáticamente.",
      loading: "Cargando datos del ranking.", source: "Fuente: ranking oficial UMB",
      gapQ: "¿Qué diferencia de puntos hay entre el N.º 1 y el N.º 2?",
      gapA: (n1, n2, d) => `Actualmente el N.º 1 ${n1} supera al N.º 2 ${n2} por ${d} puntos.`,
      no1H: "N.º 1 mundiales de todos los tiempos", weeksWord: (n) => `${n} sem`, nowWord: "actual",
      watchNote: "Emisiones oficiales: SOOP Live y canales oficiales del torneo",
      ladiesH: "Top 20 del ranking mundial femenino", juniorsH: "Top 10 del ranking mundial juvenil", fedH: "Top 20 de jugadores españoles en el ranking mundial", moreH: "Ranking mundial masculino N.º 11–50",
    },
  };

  app.get("/world-ranking", async (req, res, next) => {
    if (!isBot(req)) return next();
    const qLang = typeof req.query.lang === "string" ? req.query.lang : "";
    const lang = ["en", "tr", "vi", "es"].includes(qLang) ? qLang : "ko";
    const W = WR_L10N[lang];
    let listHtml = "";
    let moreHtml = "";
    let editionLabel = "";
    let faqHtml = "";
    const jsonLd: unknown[] = [];
    const langSuffix = lang === "ko" ? "" : `?lang=${lang}`;
    // ko만 한글 이름 병기, 그 외 언어는 로마자
    const disp = (r: any) => lang === "ko" && r.nativeName ? `${r.nativeName} (${r.playerName})` : r.playerName;
    const playerLi = (cat: string) => (r: any) =>
      `  <li><a href="/player/${cat}/${esc(r.playerUmbId)}${langSuffix}">${esc(disp(r))}</a> (${esc(r.fed)}) — ${r.points}pts</li>`;
    try {
      // 톱 50 을 받아 1~10 은 본문, 11~50 은 이어지는 목록으로 — 선수 페이지로 가는 서버 렌더 링크를 늘린다(크롤 경로).
      const data = await storage.umb.getRankings("players", { limit: 50 });
      if (data.rows.length) {
        editionLabel = data.edition ? ` (Edition ${data.edition})` : "";
        listHtml = `<ol>\n${data.rows.slice(0, 10).map(playerLi("players")).join("\n")}\n</ol>`;
        if (data.rows.length > 10) {
          moreHtml = `<h2>${esc(W.moreH)}</h2>\n  <ol start="11">\n${data.rows.slice(10).map(playerLi("players")).join("\n")}\n</ol>`;
        }

        // AEO 문답 — 언어별 "관련 질문" 직격. 데이터 기반이라 매주 자동 갱신.
        const top = data.rows[0] as any;
        const updated = data.editionDate ? new Date(data.editionDate).toLocaleDateString(DATE_LOCALE[lang as UmbLang], { year: "numeric", month: "long" }) : "";
        let fedFaqHtml = "";
        if (W.fedFaq) {
          const summary = await storage.umb.getSummary("players", W.fedFaq.fed);
          const fedTop = summary?.fedTop as any;
          if (fedTop) {
            const fedName = lang === "ko" && fedTop.nativeName ? fedTop.nativeName : fedTop.playerName;
            fedFaqHtml = `<section><h3>${esc(W.fedFaq.q)}</h3>\n  <p>${esc(W.fedFaq.a(fedName, fedTop.rank, summary!.fedCount))}</p></section>`;
          }
        }
        // 1·2위 격차 — "2점차" 같은 수치가 그 자체로 뉴스 헤드라인 소재가 되는 종목이다
        const second = data.rows[1] as any;
        const gapHtml = second
            ? `<section><h3>${esc(W.gapQ)}</h3>\n  <p>${esc(W.gapA(disp(top), disp(second), top.points - second.points))}</p></section>`
            : "";

        // 역대 1위 계보 — AI·위키가 전임 1위를 현 1위로 잘못 답하는 공백을 정면으로 메운다
        let no1Html = "";
        try {
            const reigns = await storage.umb.getNo1History("players");
            if (reigns.length) {
                const fmt = (d: Date) => new Date(d).toLocaleDateString(DATE_LOCALE[lang as UmbLang], { year: "numeric", month: "short" });
                no1Html = `
  <h2>${esc(W.no1H)}</h2>
  <ul>
  ${reigns.slice(0, 8).map(rg => {
                    const nm = lang === "ko" && rg.nativeName ? rg.nativeName : rg.playerName;
                    return `  <li>${esc(nm)} (${esc(rg.fed)}) — ${esc(fmt(rg.from))} ~ ${rg.current ? esc(W.nowWord) : esc(fmt(rg.to))}, ${esc(W.weeksWord(rg.weeks))}</li>`;
                }).join("\n")}
  </ul>`;
            }
        } catch (e) {
            console.warn("[prerender] no1 history failed:", (e as Error)?.message);
        }

        faqHtml = `
  <h2>${esc(W.faqH)}</h2>
  <section><h3>${esc(W.faq1q)}</h3>
  <p>${esc(W.faq1a(disp(top), top.points, updated))}</p></section>
  ${gapHtml}
  ${fedFaqHtml}
  <section><h3>${esc(W.freqQ)}</h3>
  <p>${esc(W.freqA)}</p></section>
  ${no1Html}
  <p>${esc(W.watchNote)}</p>`;

        jsonLd.push({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "UMB 3-Cushion World Ranking Top 10",
          itemListElement: data.rows.slice(0, 10).map((r: any, i: number) => ({
            "@type": "ListItem",
            position: i + 1,
            name: lang === "ko" ? (r.nativeName || r.playerName) : r.playerName,
            url: `${ORIGIN}/player/players/${r.playerUmbId}${langSuffix}`,
          })),
        });
      }
    } catch (e) {
      console.warn("[prerender] world-ranking rows failed:", (e as Error)?.message);
    }
    // 여자·주니어·자국 선수 — 부문별 선수 페이지로 가는 링크 층. 각각 실패해도 나머지는 나간다.
    let sectionsHtml = "";
    const section = async (title: string, cat: "ladies" | "juniors" | "players", opts: { limit: number; fed?: string }) => {
      try {
        const d = await storage.umb.getRankings(cat, opts);
        if (!d.rows.length) return;
        sectionsHtml += `\n  <h2>${esc(title)}</h2>\n  <ol>\n${d.rows.map(playerLi(cat)).join("\n")}\n  </ol>`;
      } catch (e) {
        console.warn(`[prerender] world-ranking ${cat} failed:`, (e as Error)?.message);
      }
    };
    await section(W.ladiesH, "ladies", { limit: 20 });
    await section(W.juniorsH, "juniors", { limit: 10 });
    if (W.fedH && W.fedFaq) await section(W.fedH, "players", { limit: 20, fed: W.fedFaq.fed });
    res.setHeader("X-Prerender", `world-ranking:${lang}`);
    res.send(
      page({
        title: W.title,
        desc: W.desc,
        canonical: `${ORIGIN}/world-ranking${langSuffix}`,
        lang,
        altLangs: ["en", "tr", "vi", "es"],
        altBase: `${ORIGIN}/world-ranking`,
        jsonLd,
        body: `<main>
  <h1>${esc(W.title.split(" | ")[0])}${esc(editionLabel)}</h1>
  <p>${esc(W.intro)}</p>
  <h2>${esc(W.topH)}</h2>
  ${listHtml || `<p>${esc(W.loading)}</p>`}
  ${faqHtml}
  ${moreHtml}${sectionsHtml}
  ${lang === "ko" ? `<nav><a href="/world-ranking/country/KR">대한민국 선수 세계랭킹 전체</a> · <a href="/world-ranking/movers">이번 회차 순위 변동</a></nav>` : ""}
  <p>${esc(W.source)} — <a href="https://www.umb-carom.org" rel="noopener">umb-carom.org</a></p>
  ${hubNav(lang)}
</main>`,
      }),
    );
  });

  // ── /world-ranking/country/:fed · /world-ranking/movers (2026-09-24) ──
  // 한국어 전용(?lang= 무시). "/world-ranking" 은 문자열 라우트라 정확 일치 — 이 하위 경로를 먹지 않는다.
  // ⚠️ vercel.json 봇 라우트에도 같은 경로가 있어야 봇이 여기까지 온다.
  app.get(/^\/world-ranking\/(?:country\/[^/]+|movers)\/?$/, async (req, res, next) => {
    if (!isBot(req)) return next();
    let r: RankingExtraRender | null;
    try {
      r = await renderRankingExtra(req.path, req.query as Record<string, string>);
    } catch (e) {
      console.warn("[prerender] ranking extra failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!r) return next();
    noStore(res);
    res.setHeader("X-Prerender", r.tag); // 이미 ASCII(국가 코드·고정 꼬리표)
    if (r.status === 301 && r.location) return res.redirect(301, r.location);
    res.status(r.status).send(r.html);
  });

  // ── /player/:category/:umbId ──────────────────────────────────────
  // UMB 선수 페이지 — 사이트맵(톱1000+한국 전원) 대상. ?lang=en·tr·vi·es 4개 언어 버전.
  // 터키·베트남은 3쿠션 인구가 커서 현지어 제목·문답이 유입의 핵심이다.
  // 데이터(순위·포인트)는 언어 중립 — 템플릿 문장만 언어별로 바꾼다.
  const UMB_LANGS = ["en", "tr", "vi", "es"] as const;
  type UmbLang = "ko" | (typeof UMB_LANGS)[number];
  const UMB_L10N: Record<UmbLang, {
    cat: Record<string, string>;
    rankingName: string;              // "당구 세계랭킹" — h1·브레드크럼 공용
    playerTitle: (name: string, rank: number) => string;
    playerDesc: (name: string, fed: string, cat: string, rank: number, pts: number, best: number) => string;
    statsLine: (fed: string, rank: number, pts: number, best: number, natl: string, updated: string) => string;
    faqH: string;
    faq1q: (name: string) => string;
    faq1a: (name: string, cat: string, rank: number, pts: number, updated: string) => string;
    faq2q: (name: string) => string;
    faq2a: (best: number, natl: number | null) => string;
    histH: string;
    evHistH: string; // 대회 이력 표 절 제목
    evKind: Record<string, string>; // worldcup·worldchamp·confederal·national
    rankWord: (rank: number) => string; // 히스토리 목록의 "12위" / "No.12"
    source: string;
    navAll: string;
    navHome: string;
    reignNote: (n: number) => string; // "세계 1위 통산 N주"
    nearH: string; // "비슷한 순위의 선수" — 인접 순위 링크 제목
  }> = {
    ko: {
      cat: { players: "남자", ladies: "여자", juniors: "주니어" },
      rankingName: "당구 세계랭킹",
      playerTitle: (n, r) => `${n} — 당구 세계랭킹 ${r}위 | 랭큐 RANKUE`,
      playerDesc: (n, f, c, r, p, b) => `${n} (${f}) UMB 공식 3쿠션 ${c} 세계랭킹 ${r}위, ${p}점. 역대 최고 ${b}위. 주간 순위 히스토리와 대회별 포인트를 랭큐에서 확인하세요.`,
      statsLine: (f, r, p, b, natl, u) => `UMB 공식 3쿠션 세계랭킹. 국가 ${f} · 현재 ${r}위 · ${p}점 · 역대 최고 ${b}위 · 국내 ${natl}위${u ? ` · ${u} 기준` : ""}`,
      faqH: "자주 묻는 질문",
      faq1q: (n) => `${n}의 현재 세계랭킹은 몇 위인가요?`,
      faq1a: (n, c, r, p, u) => `${n} 선수는 UMB 공식 3쿠션 ${c} 세계랭킹 ${r}위입니다 (${p}점${u ? `, ${u} 기준` : ""}).`,
      faq2q: (n) => `${n}의 역대 최고 순위는?`,
      faq2a: (b, natl) => `역대 최고 세계랭킹은 ${b}위입니다.${natl ? ` 현재 국내 순위는 ${natl}위입니다.` : ""}`,
      histH: "최근 순위 히스토리",
      evHistH: "대회 이력 — 같은 대회의 연도별 포인트",
      evKind: { worldcup: "월드컵", worldchamp: "세계선수권", confederal: "대륙선수권", national: "국가선수권" },
      rankWord: (r) => `${r}위`,
      source: "출처: UMB 공식 랭킹 — 매주 갱신",
      navAll: "당구 세계랭킹 전체", navHome: "랭큐 홈",
      reignNote: (n) => `세계 1위 통산 ${n}주.`,
      nearH: "비슷한 순위의 선수",
    },
    en: {
      cat: { players: "Men's", ladies: "Women's", juniors: "Junior" },
      rankingName: "Billiards World Ranking",
      playerTitle: (n, r) => `${n} — 3-Cushion Billiards World Ranking No.${r} | RANKUE`,
      playerDesc: (n, f, c, r, p, b) => `${n} (${f}) is No.${r} in the official UMB 3-cushion ${c.toLowerCase()} world ranking with ${p} points. Career best No.${b}. Weekly rank history and points by tournament on RANKUE.`,
      statsLine: (f, r, p, b, natl, u) => `Official UMB 3-cushion world ranking. Country ${f} · current No.${r} · ${p} pts · career best No.${b} · national No.${natl}${u ? ` · as of ${u}` : ""}`,
      faqH: "Frequently asked questions",
      faq1q: (n) => `What is ${n}'s current world ranking?`,
      faq1a: (n, c, r, p, u) => `${n} is ranked No.${r} in the official UMB 3-cushion ${c.toLowerCase()} world ranking (${p} points${u ? `, as of ${u}` : ""}).`,
      faq2q: (n) => `What is ${n}'s career-best ranking?`,
      faq2a: (b, natl) => `The career-best world ranking is No.${b}.${natl ? ` Current national ranking is No.${natl}.` : ""}`,
      histH: "Recent ranking history",
      evHistH: "Tournament history — points by year at the same event",
      evKind: { worldcup: "World Cup", worldchamp: "World Championship", confederal: "Confederal Championship", national: "National Championship" },
      rankWord: (r) => `No.${r}`,
      source: "Source: official UMB rankings — updated weekly",
      navAll: "Full billiards world ranking", navHome: "RANKUE home",
      reignNote: (n) => `${n} total weeks at world No.1.`,
      nearH: "Players ranked nearby",
    },
    tr: {
      cat: { players: "Erkekler", ladies: "Kadınlar", juniors: "Gençler" },
      rankingName: "Bilardo Dünya Sıralaması",
      playerTitle: (n, r) => `${n} — 3 Bant Bilardo Dünya Sıralaması ${r}. | RANKUE`,
      playerDesc: (n, f, c, r, p, b) => `${n} (${f}), resmî UMB 3 bant ${c.toLowerCase()} dünya sıralamasında ${p} puanla ${r}. sırada. Kariyer rekoru ${b}. sıra. Haftalık sıralama geçmişi RANKUE'de.`,
      statsLine: (f, r, p, b, natl, u) => `Resmî UMB 3 bant dünya sıralaması. Ülke ${f} · güncel ${r}. · ${p} puan · kariyer rekoru ${b}. · ulusal ${natl}.${u ? ` · ${u} itibarıyla` : ""}`,
      faqH: "Sık sorulan sorular",
      faq1q: (n) => `${n}'in güncel dünya sıralaması kaç?`,
      faq1a: (n, c, r, p, u) => `${n}, resmî UMB 3 bant ${c.toLowerCase()} dünya sıralamasında ${r}. sırada (${p} puan${u ? `, ${u} itibarıyla` : ""}).`,
      faq2q: (n) => `${n}'in kariyer rekoru kaçıncı sıra?`,
      faq2a: (b, natl) => `Kariyer rekoru dünya ${b}. sıralık.${natl ? ` Güncel ulusal sıralaması ${natl}.` : ""}`,
      histH: "Son sıralama geçmişi",
      evHistH: "Turnuva geçmişi — aynı turnuvada yıllara göre puan",
      evKind: { worldcup: "Dünya Kupası", worldchamp: "Dünya Şampiyonası", confederal: "Kıta Şampiyonası", national: "Ulusal Şampiyona" },
      rankWord: (r) => `${r}.`,
      source: "Kaynak: resmî UMB sıralaması — haftalık güncellenir",
      navAll: "Tüm bilardo dünya sıralaması", navHome: "RANKUE ana sayfa",
      reignNote: (n) => `Toplam ${n} hafta dünya 1 numarası.`,
      nearH: "Yakın sıradaki oyuncular",
    },
    vi: {
      cat: { players: "Nam", ladies: "Nữ", juniors: "Trẻ" },
      rankingName: "BXH Bida Thế giới",
      playerTitle: (n, r) => `${n} — BXH Bida 3 băng Thế giới hạng ${r} | RANKUE`,
      playerDesc: (n, f, c, r, p, b) => `${n} (${f}) đứng hạng ${r} BXH bida 3 băng ${c.toLowerCase()} thế giới chính thức của UMB với ${p} điểm. Cao nhất sự nghiệp hạng ${b}. Xem diễn biến thứ hạng hằng tuần trên RANKUE.`,
      statsLine: (f, r, p, b, natl, u) => `BXH bida 3 băng thế giới chính thức của UMB. Quốc gia ${f} · hiện tại hạng ${r} · ${p} điểm · cao nhất hạng ${b} · trong nước hạng ${natl}${u ? ` · tính đến ${u}` : ""}`,
      faqH: "Câu hỏi thường gặp",
      faq1q: (n) => `Thứ hạng thế giới hiện tại của ${n} là bao nhiêu?`,
      faq1a: (n, c, r, p, u) => `${n} đang đứng hạng ${r} BXH bida 3 băng ${c.toLowerCase()} thế giới chính thức của UMB (${p} điểm${u ? `, tính đến ${u}` : ""}).`,
      faq2q: (n) => `Thứ hạng cao nhất sự nghiệp của ${n}?`,
      faq2a: (b, natl) => `Thứ hạng thế giới cao nhất là hạng ${b}.${natl ? ` Hiện xếp hạng ${natl} trong nước.` : ""}`,
      histH: "Diễn biến thứ hạng gần đây",
      evHistH: "Lịch sử giải đấu — điểm theo năm tại cùng giải",
      evKind: { worldcup: "World Cup", worldchamp: "Giải vô địch thế giới", confederal: "Giải châu lục", national: "Giải quốc gia" },
      rankWord: (r) => `hạng ${r}`,
      source: "Nguồn: BXH chính thức UMB — cập nhật hằng tuần",
      navAll: "BXH bida thế giới đầy đủ", navHome: "Trang chủ RANKUE",
      reignNote: (n) => `Tổng cộng ${n} tuần giữ vị trí số 1 thế giới.`,
      nearH: "Cơ thủ có thứ hạng gần",
    },
    es: {
      cat: { players: "Masculino", ladies: "Femenino", juniors: "Juvenil" },
      rankingName: "Ranking Mundial de Billar",
      playerTitle: (n, r) => `${n} — Ranking Mundial de Billar a Tres Bandas N.º ${r} | RANKUE`,
      playerDesc: (n, f, c, r, p, b) => `${n} (${f}) es N.º ${r} del ranking mundial oficial UMB de billar a tres bandas (${c.toLowerCase()}) con ${p} puntos. Mejor puesto histórico: N.º ${b}. Historial semanal en RANKUE.`,
      statsLine: (f, r, p, b, natl, u) => `Ranking mundial oficial UMB de tres bandas. País ${f} · actual N.º ${r} · ${p} pts · mejor histórico N.º ${b} · nacional N.º ${natl}${u ? ` · a ${u}` : ""}`,
      faqH: "Preguntas frecuentes",
      faq1q: (n) => `¿Cuál es el ranking mundial actual de ${n}?`,
      faq1a: (n, c, r, p, u) => `${n} es N.º ${r} del ranking mundial oficial UMB de tres bandas (${c.toLowerCase()}) con ${p} puntos${u ? `, a ${u}` : ""}.`,
      faq2q: (n) => `¿Cuál es el mejor puesto histórico de ${n}?`,
      faq2a: (b, natl) => `Su mejor puesto histórico es el N.º ${b}.${natl ? ` Actualmente es N.º ${natl} en su país.` : ""}`,
      histH: "Historial reciente",
      evHistH: "Historial de torneos — puntos por año en el mismo torneo",
      evKind: { worldcup: "Copa del Mundo", worldchamp: "Campeonato Mundial", confederal: "Campeonato Confederal", national: "Campeonato Nacional" },
      rankWord: (r) => `N.º ${r}`,
      source: "Fuente: ranking oficial UMB — actualización semanal",
      navAll: "Ranking mundial completo", navHome: "Inicio RANKUE",
      reignNote: (n) => `${n} semanas en total como N.º 1 mundial.`,
      nearH: "Jugadores con ranking cercano",
    },
  };
  const DATE_LOCALE: Record<UmbLang, string> = { ko: "ko-KR", en: "en-US", tr: "tr-TR", vi: "vi-VN", es: "es-ES" };

  app.get("/player/:category/:umbId", async (req, res, next) => {
    if (!isBot(req)) return next();
    // soft-404 방지: 예전에는 next() 로 흘려보내 정적 셸(=한국어 홈 문서)이 200 으로 나갔다.
    // 봇에게는 "없는 선수 URL 이 홈 내용으로 색인 가능"한 상태였다(2026-08-18 실측).
    // /stores/:code·/pba-player/:code 와 같은 규칙으로 404 를 준다.
    const category = ["players", "ladies", "juniors"].includes(req.params.category) ? req.params.category : null;
    if (!category || !/^\d{1,6}$/.test(req.params.umbId)) {
      return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
    }
    const qLang = typeof req.query.lang === "string" ? req.query.lang : "";
    const lang: UmbLang = (UMB_LANGS as readonly string[]).includes(qLang) ? (qLang as UmbLang) : "ko";
    const L = UMB_L10N[lang];
    try {
      const data = await storage.umb.getPlayerHistory(category as any, req.params.umbId);
      if (!data?.player) return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
      const p = data.player as any;
      const catName = L.cat[category];
      // ko는 한글 이름 우선("조명우 (CHO Myung Woo)"), 그 외 언어는 로마자 원표기
      const nameMain = lang === "ko" ? (p.nativeName || p.playerName) : p.playerName;
      const nameFull = lang === "ko" && p.nativeName ? `${p.nativeName} (${p.playerName})` : p.playerName;
      const base = `${ORIGIN}/player/${category}/${req.params.umbId}`;
      const canonical = lang === "ko" ? base : `${base}?lang=${lang}`;
      const historySummary = data.history.slice(-10).map((h: any) =>
        `<li>Edition ${esc(h.edition)}: ${esc(L.rankWord(h.rank))} (${h.points}pts)</li>`).join("\n  ");
      const updatedAt = data.history.length
        ? new Date(data.history[data.history.length - 1].editionDate).toLocaleDateString(DATE_LOCALE[lang], { year: "numeric", month: "long" })
        : "";
      // 대회 이력 표 — "월드컵 · Antwerp: 2024 40 · 2025 64 (▲24)" 줄. 절 제목이 있어 검색결과 칩 후보가 된다.
      const eh = data.eventHistory;
      const evHistHtml = eh && eh.rows.length
        ? `\n  <h2>${esc(L.evHistH)}</h2>\n  <ul>\n  ${eh.rows.slice(0, 12).map((r) => {
            const title = [L.evKind[r.kind] ?? r.label, r.city].filter(Boolean).join(" · ");
            const cells = r.cells.map((c) => `${c.year} ${c.points}`).join(" · ");
            const d = r.delta == null || r.delta === 0 ? "" : r.delta > 0 ? ` (▲${r.delta})` : ` (▼${-r.delta})`;
            return `<li>${esc(title)}: ${esc(cells)}${esc(d)}</li>`;
          }).join("\n  ")}\n  </ul>`
        : "";
      // 인접 순위 ±5 — 선수 페이지끼리 사슬로 이어져 사이트맵에 없는 하위 순위도 크롤러가 따라간다.
      let nearHtml = "";
      try {
        const near = await storage.umb.getRankNeighbors(category as any, p.rank, 5);
        if (near.length) {
          nearHtml = `\n  <h2>${esc(L.nearH)}</h2>\n  <ul>\n  ${near.map((n) => {
            const nm = lang === "ko" && n.nativeName ? `${n.nativeName} (${n.playerName})` : n.playerName;
            return `<li>${esc(L.rankWord(n.rank))} <a href="/player/${category}/${esc(n.playerUmbId)}${lang === "ko" ? "" : `?lang=${lang}`}">${esc(nm)}</a> (${esc(n.fed)})</li>`;
          }).join("\n  ")}\n  </ul>`;
        }
      } catch (e) {
        console.warn("[prerender] player neighbors failed:", (e as Error)?.message);
      }
      // 선수 카드(정사각형 PNG) — 검색 썸네일·미리보기의 재료. 클라이언트 useSeo 와 같은 주소(playerCardUrl).
      const card = playerCardUrl(ORIGIN, category, req.params.umbId, lang);
      const cardAlt = `${nameFull} — ${L.rankingName} ${L.rankWord(p.rank)}`;
      res.setHeader("X-Prerender", `umb-player:${lang}`);
      res.send(
        page({
          title: L.playerTitle(nameFull, p.rank),
          desc: L.playerDesc(nameFull, p.fed, catName, p.rank, p.points, data.bestRank),
          canonical,
          lang,
          altLangs: [...UMB_LANGS],
          altBase: base, // 상호 hreflang 클러스터 — ko가 기준, ?lang=xx가 변형
          image: { url: card, width: CARD_SIZE, height: CARD_SIZE, alt: cardAlt },
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "Person",
              name: nameMain,
              alternateName: p.nativeName && lang === "ko" ? p.playerName : (p.nativeName || undefined),
              nationality: { "@type": "Country", name: p.fed },
              description: L.playerDesc(nameMain, p.fed, catName, p.rank, p.points, data.bestRank),
              url: canonical,
              image: card,
              knowsAbout: "Three-cushion billiards",
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: L.rankingName, item: `${ORIGIN}/world-ranking${lang === "ko" ? "" : `?lang=${lang}`}` },
                { "@type": "ListItem", position: 2, name: nameMain, item: canonical },
              ],
            },
          ],
          body: `<main>
  <h1>${esc(nameFull)} — ${esc(L.rankingName)} ${esc(L.rankWord(p.rank))}</h1>
  <img src="${esc(card)}" width="${CARD_SIZE}" height="${CARD_SIZE}" alt="${esc(cardAlt)}" />
  <p>${esc(L.statsLine(p.fed, p.rank, p.points, data.bestRank, String(p.nationalRank ?? "-"), updatedAt))}${(() => {
      const w = data.history.filter((h: any) => h.rank === 1).length;
      return w > 0 ? " " + esc(L.reignNote(w)) : "";
    })()}</p>

  <h2>${esc(L.faqH)}</h2>
  <section><h3>${esc(L.faq1q(nameMain))}</h3>
  <p>${esc(L.faq1a(nameMain, catName, p.rank, p.points, updatedAt))}</p></section>
  <section><h3>${esc(L.faq2q(nameMain))}</h3>
  <p>${esc(L.faq2a(data.bestRank, p.nationalRank))}</p></section>

  <h2>${esc(L.histH)}</h2>
  <ul>
  ${historySummary}
  </ul>${evHistHtml}${nearHtml}
  <p>${esc(L.source)} — <a href="https://www.umb-carom.org" rel="noopener">umb-carom.org</a></p>
  <nav><a href="/world-ranking${lang === "ko" ? "" : `?lang=${lang}`}">${esc(L.navAll)}</a></nav>
  ${hubNav(lang)}
</main>`,
        }),
      );
    } catch (e) {
      console.warn("[prerender] player failed:", (e as Error)?.message);
      return next();
    }
  });

  // ── /golf-ranking, /golfer/:tour/:id ──────────────────────────────
  // 골프 랭킹(2026-09-13 오너: 공개 전체·검색 유입). 출처 표기는 작게 한 줄. 언어판은 ko·en 만 — 나머지는 ko 로 떨어진다.
  const GOLF_L10N = {
    ko: {
      listTitle: "골프 랭킹 — 세계·KPGA·KLPGA 공식 순위 | 랭큐 RANKUE",
      listDesc: "남자·여자 세계 골프 랭킹(OWGR·롤렉스)과 KPGA·KLPGA 투어 순위, 드라이브 거리·페어웨이·그린 적중률 등 시즌 기록을 매주 업데이트.",
      tour: { owgr: "남자 세계 골프랭킹", rolex: "여자 세계 골프랭킹", kpga: "KPGA 코리안투어", klpga: "KLPGA 투어" } as Record<string, string>,
      rankWord: (r: number) => `${r}위`,
      playerTitle: (n: string, tour: string, r: number | null) => `${n} — ${tour} ${r === null ? "" : `${r}위`} | 랭큐 RANKUE`,
      playerDesc: (n: string, c: string, tour: string, r: number | null, best: number | null) => `${n} (${c}) ${tour} ${r === null ? "순위" : `${r}위`}${best !== null ? `, 역대 최고 ${best}위` : ""}. 순위 추이와 시즌 기록(드라이브 거리·페어웨이·그린 적중률)을 랭큐에서 확인하세요.`,
      statsH: "시즌 기록", histH: "최근 순위", source: (n: string) => `출처: ${n}`, navAll: "골프 랭킹 전체", navHome: "랭큐 홈",
    },
    en: {
      listTitle: "Golf Rankings — World, KPGA & KLPGA | RANKUE",
      listDesc: "Men's and women's world golf rankings (OWGR, Rolex) plus KPGA & KLPGA tour standings with season stats — driving distance, fairways, GIR — updated weekly.",
      tour: { owgr: "Men's World Golf Ranking", rolex: "Women's World Golf Ranking", kpga: "KPGA Korean Tour", klpga: "KLPGA Tour" } as Record<string, string>,
      rankWord: (r: number) => `No.${r}`,
      playerTitle: (n: string, tour: string, r: number | null) => `${n} — ${tour} ${r === null ? "" : `No.${r}`} | RANKUE`,
      playerDesc: (n: string, c: string, tour: string, r: number | null, best: number | null) => `${n} (${c}) is ${r === null ? "ranked" : `No.${r}`} in the ${tour}${best !== null ? `, career best No.${best}` : ""}. Rank history and season stats (driving distance, fairways, GIR) on RANKUE.`,
      statsH: "Season stats", histH: "Recent ranks", source: (n: string) => `Source: ${n}`, navAll: "All golf rankings", navHome: "RANKUE home",
    },
  };
  const GOLF_TOURS_ALL = ["owgr", "rolex", "kpga", "klpga"] as const;
  const golfLang = (req: Request): "ko" | "en" => (String(req.query.lang ?? "") === "en" ? "en" : "ko");

  app.get("/golf-ranking", async (req, res, next) => {
    if (!isBot(req)) return next();
    const lang = golfLang(req);
    const G = GOLF_L10N[lang];
    const tq = String(req.query.tour ?? "owgr");
    const tour = (GOLF_TOURS_ALL as readonly string[]).includes(tq) ? tq as (typeof GOLF_TOURS_ALL)[number] : "owgr";
    try {
      const { GOLF_TOUR_META } = await import("../shared/golfTours.js");
      const data = await storage.golfRank.getRankings(tour, { limit: 50 });
      if (!data.rows.length) return sendUnavailable(res);
      const langSuffix = lang === "ko" ? "" : `?lang=${lang}`;
      const disp = (r: { playerName: string; nameKo: string | null }) => lang === "ko" && r.nameKo ? `${r.nameKo} (${r.playerName})` : r.playerName;
      const list = data.rows.map((r) => `  <li><a href="/golfer/${tour}/${esc(r.playerId)}${langSuffix}">${esc(disp(r))}</a> (${esc(r.country)}) — ${r.points}</li>`).join("\n");
      const tabs = GOLF_TOURS_ALL.map((tid) => `<a href="/golf-ranking?tour=${tid}">${esc(G.tour[tid])}</a>`).join(" · ");
      res.setHeader("X-Prerender", `golf-ranking:${tour}:${lang}`);
      noStore(res);
      res.send(page({
        title: `${esc(G.tour[tour])} — ${G.listTitle}`,
        desc: G.listDesc,
        /*
         * 기본 투어(owgr)는 맨 주소 /golf-ranking 이 대표다. 예전엔 /golf-ranking 이 canonical 로 ?tour=owgr 을 가리키고,
         * 사이트맵에는 둘 다 올라가 있어 구글이 같은 페이지 둘로 보고 하나를 버렸다(2026-09-18 서치 콘솔).
         */
        canonical: tour === "owgr"
          ? `${ORIGIN}/golf-ranking${lang === "ko" ? "" : `?lang=${lang}`}`
          : `${ORIGIN}/golf-ranking?tour=${tour}${lang === "ko" ? "" : `&lang=${lang}`}`,
        lang,
        jsonLd: [{
          "@context": "https://schema.org", "@type": "ItemList", name: G.tour[tour],
          itemListElement: data.rows.slice(0, 20).map((r, i) => ({ "@type": "ListItem", position: i + 1, name: lang === "ko" ? (r.nameKo || r.playerName) : r.playerName, url: `${ORIGIN}/golfer/${tour}/${r.playerId}${langSuffix}` })),
        }],
        body: `<main>
  <h1>${esc(G.tour[tour])} — ${esc(G.listTitle.split(" | ")[0])}</h1>
  <p>${esc(G.listDesc)} (${esc(data.edition ?? "")})</p>
  <nav>${tabs}</nav>
  <ol>
${list}
  </ol>
  <p>${esc(G.source(GOLF_TOUR_META[tour].sourceName))} — <a href="${esc(GOLF_TOUR_META[tour].sourceUrl)}" rel="noopener">${esc(GOLF_TOUR_META[tour].sourceUrl.replace("https://", ""))}</a></p>
  <nav><a href="/golf-ranking${langSuffix}">${esc(G.navAll)}</a></nav>
  ${hubNav(lang)}
</main>`,
      }));
    } catch (e) {
      console.warn("[prerender] golf-ranking failed:", (e as Error)?.message);
      return next();
    }
  });

  app.get("/golfer/:tour/:id", async (req, res, next) => {
    if (!isBot(req)) return next();
    const tour = (GOLF_TOURS_ALL as readonly string[]).includes(req.params.tour) ? req.params.tour as (typeof GOLF_TOURS_ALL)[number] : null;
    if (!tour || !/^\d{1,10}$/.test(req.params.id)) return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
    const lang = golfLang(req);
    const G = GOLF_L10N[lang];
    try {
      const { GOLF_TOUR_META } = await import("../shared/golfTours.js");
      const data = await storage.golfRank.getPlayer(tour, req.params.id);
      if (!data?.player) return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
      const p = data.player;
      const nameMain = lang === "ko" ? (p.nameKo || p.playerName) : p.playerName;
      const nameFull = lang === "ko" && p.nameKo && p.nameKo !== p.playerName ? `${p.nameKo} (${p.playerName})` : p.playerName;
      const base = `${ORIGIN}/golfer/${tour}/${req.params.id}`;
      const canonical = lang === "ko" ? base : `${base}?lang=${lang}`;
      const langSuffix = lang === "ko" ? "" : `?lang=${lang}`;
      const hist = data.history.slice(-10).map((h) => `<li>${esc(h.edition)}: ${esc(G.rankWord(h.rank))} (${h.points})</li>`).join("\n  ");
      const stats = data.stats.slice(0, 12).map((s) => `<li>${esc(s.label)}: ${s.value}${s.unit ? ` ${esc(s.unit)}` : ""} — ${esc(G.rankWord(s.rank))}${s.of ? `/${s.of}` : ""}</li>`).join("\n  ");
      // 선수 카드(정사각형 PNG) — 클라이언트 golfer.tsx useSeo 와 같은 주소(golferCardUrl)
      const card = golferCardUrl(ORIGIN, tour, req.params.id, lang);
      const cardAlt = `${nameFull} — ${G.tour[tour]}${p.rank === null ? "" : ` ${G.rankWord(p.rank)}`}`;
      res.setHeader("X-Prerender", `golfer:${lang}`);
      res.send(page({
        title: G.playerTitle(nameFull, G.tour[tour], p.rank),
        desc: G.playerDesc(nameFull, p.country, G.tour[tour], p.rank, data.bestRank),
        canonical, lang, altLangs: ["en"], altBase: base,
        image: { url: card, width: CARD_SIZE, height: CARD_SIZE, alt: cardAlt },
        jsonLd: [
          { "@context": "https://schema.org", "@type": "Person", name: nameMain, alternateName: p.nameKo && p.nameKo !== p.playerName ? p.playerName : undefined,
            nationality: { "@type": "Country", name: p.country }, description: G.playerDesc(nameMain, p.country, G.tour[tour], p.rank, data.bestRank), url: canonical, image: card, knowsAbout: "Golf" },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: G.tour[tour], item: `${ORIGIN}/golf-ranking?tour=${tour}${lang === "ko" ? "" : `&lang=${lang}`}` },
            { "@type": "ListItem", position: 2, name: nameMain, item: canonical },
          ] },
        ],
        body: `<main>
  <h1>${esc(nameFull)} — ${esc(G.tour[tour])} ${p.rank === null ? "" : esc(G.rankWord(p.rank))}</h1>
  <img src="${esc(card)}" width="${CARD_SIZE}" height="${CARD_SIZE}" alt="${esc(cardAlt)}" />
  <p>${esc(G.playerDesc(nameMain, p.country, G.tour[tour], p.rank, data.bestRank))}</p>
  ${stats ? `<h2>${esc(G.statsH)}</h2>\n  <ul>\n  ${stats}\n  </ul>` : ""}
  ${hist ? `<h2>${esc(G.histH)}</h2>\n  <ul>\n  ${hist}\n  </ul>` : ""}
  <p>${esc(G.source(GOLF_TOUR_META[tour].sourceName))} — <a href="${esc(GOLF_TOUR_META[tour].sourceUrl)}" rel="noopener">${esc(GOLF_TOUR_META[tour].sourceUrl.replace("https://", ""))}</a></p>
  <nav><a href="/golf-ranking?tour=${tour}${lang === "ko" ? "" : `&lang=${lang}`}">${esc(G.navAll)}</a> <a href="/">${esc(G.navHome)}</a></nav>
</main>`,
      }));
    } catch (e) {
      console.warn("[prerender] golfer failed:", (e as Error)?.message);
      return next();
    }
  });

  // ── /golf/course/:slug · /golf/courses[/…] · /golf/{booking|join|urgent}[/…] (2026-09-24) ──
  // 정규식(캡처 없음) 라우트라 Express 가 경로를 미리 디코드하지 않는다 — 잘못된 인코딩이 400 이 아니라 404 가 된다.
  // ⚠️ vercel.json 봇 라우트에도 같은 경로가 있어야 봇이 여기까지 온다.
  app.get(GOLF_PAGE_RE, async (req, res, next) => {
    if (!isBot(req)) return next();
    let r: GolfRender | null;
    try {
      r = await renderGolfPath(req.path);
    } catch (e) {
      console.warn("[prerender] golf course page failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!r) return next();
    noStore(res);
    // X-Prerender 에 한글을 그대로 넣으면 Node 가 ERR_INVALID_CHAR 로 죽는다 — tag 는 이미 encodeURIComponent 된 값이다.
    res.setHeader("X-Prerender", r.tag);
    if (r.status === 301 && r.location) return res.redirect(301, r.location);
    res.status(r.status).send(r.html);
  });

  // ── /billiards/terms[/:slug] 당구 용어 사전(2026-09-24) ──────────────
  // 정규식 라우트라 req.path 가 인코딩된 채로 온다(한글 슬러그) — 디코드는 renderBilliardsTerms 가 한다.
  // 본문이 코드에 있어 DB 를 안 타지만, 예외가 나도 404 로 떨어지지 않게 다른 핸들러와 같이 503 으로 낸다.
  // ⚠️ vercel.json 봇 라우트에도 같은 경로가 있어야 봇이 여기까지 온다.
  app.get(/^\/billiards\/terms(?:\/[^/]+)?\/?$/, async (req, res, next) => {
    if (!isBot(req)) return next();
    let r: TermsRender | null;
    try {
      r = await renderBilliardsTerms(req.path, req.query as Record<string, string>);
    } catch (e) {
      console.warn("[prerender] billiards terms failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!r) return next();
    noStore(res);
    res.setHeader("X-Prerender", r.tag); // 슬러그는 인코딩돼 ASCII
    if (r.status === 301 && r.location) return res.redirect(301, r.location);
    res.status(r.status).send(r.html);
  });

  // ── /pba, /pba-player/:memCode ────────────────────────────────────
  // PBA 투어 — pbatour.org 공개 데이터 재가공(사실 정보). "스롱 피아비 상금" 같은
  // 국내 롱테일 검색 타깃이라 ko 단일 언어로 서빙한다.
  // 표기 유틸은 클라이언트와 shared/pbaMeta 를 공유해 문자 단위 일치를 구조로 보장한다.
  const formatPrizeKo = pbaFormatPrizeKo;
  const pbaSeasonLabel = pbaSeasonLabelShared;

  app.get("/pba", async (req, res, next) => {
    if (!isBot(req)) return next();
    // 언어판 — PBA 에는 베트남·터키·스페인 선수가 뛴다. ko 고정이면 그 나라 검색은 못 잡는다.
    const pq = String(req.query.lang ?? "");
    const plang = (PBA_LANGS as readonly string[]).includes(pq) ? pq : "ko";
    const PL = pbaL10n(plang);
    try {
      const { currentPbaSeason } = await import("./services/pbaSync.js");
      // 시즌 롤오버 공백에도 비지 않게 — DB 에 행이 실존하는 최신 시즌 기준 (라우트와 동일 규칙)
      const season = await storage.pba.getDisplaySeason("PBA", currentPbaSeason());
      const rows = (await storage.pba.getRankings("PBA", season, "prize", 50)) as any[];
      if (!rows.length) return sendUnavailable(res);
      res.setHeader("X-Prerender", "pba");
      noStore(res);
      res.send(
        page({
          lang: plang,
          title: PL.listTitle,
          desc: PL.listDesc,
          canonical: plang === "ko" ? `${ORIGIN}/pba` : `${ORIGIN}/pba?lang=${plang}`,
          altLangs: PBA_LANGS.filter((l) => l !== "ko") as unknown as string[],
          altBase: `${ORIGIN}/pba`,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: PL.listTitle,
              itemListElement: rows.slice(0, 20).map((r, i) => ({
                "@type": "ListItem", position: i + 1, name: r.nameKo,
                url: `${ORIGIN}/pba-player/${r.memCode}`,
              })),
            },
          ],
          body: `<main>
  <h1>${esc(PL.navList)}</h1>
  <p>${esc(PL.listDesc)}</p>
  <p>${esc(pbaSeasonLabel(season))}</p>
  <ol>
  ${rows.map((r) => `<li><a href="/pba-player/${esc(r.memCode)}">${esc(r.nameKo)}</a>${r.nameEn ? ` (${esc(r.nameEn)})` : ""} — 상금 ${esc(formatPrizeKo(r.prize))}원, 랭킹포인트 ${r.rankingPoint.toLocaleString("ko-KR")}점</li>`).join("\n  ")}
  </ol>
  <p>${esc(PL.incomeNote)}</p>
  <p>${esc(PL.source)} — <a href="https://www.pbatour.org" rel="noopener">pbatour.org</a></p>
  ${hubNav(plang)}
</main>`,
        }),
      );
    } catch (e) {
      console.warn("[prerender] pba failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
  });

  app.get("/pba-player/:memCode", async (req, res, next) => {
    if (!isBot(req)) return next();
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(req.params.memCode)) {
      return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
    }
    let p: any = null;
    try {
      p = await storage.pba.getPlayer(req.params.memCode);
    } catch (e) {
      console.warn("[prerender] pba-player failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!p) return sendGone(res, "선수를 찾을 수 없습니다.", "요청한 선수 정보가 없습니다.");
    const games = (p.win ?? 0) + (p.lose ?? 0) + (p.draw ?? 0);
    const winRate = games > 0 ? Math.round(((p.win ?? 0) / games) * 100) : null;
    const ppq = String(req.query.lang ?? "");
    const pplang = (PBA_LANGS as readonly string[]).includes(ppq) ? ppq : "ko";
    const PP = pbaL10n(pplang);
    const prizeStr = p.careerPrize != null ? `${formatPrizeKo(p.careerPrize)}${pplang === "ko" ? "원" : " KRW"}` : "-";
    // 선수 카드(정사각형 PNG) — 클라이언트 pba-player.tsx useSeo 와 같은 주소(pbaCardUrl)
    const pbaCard = pbaCardUrl(ORIGIN, p.memCode, pplang);
    const pbaCardAlt = `${p.nameKo}${p.nameEn ? ` (${p.nameEn})` : ""} — ${p.league}`;
    res.setHeader("X-Prerender", "pba-player");
    noStore(res);
    res.send(
      page({
        // client/src/pages/hiq/pba-player.tsx 의 useSeo(ko) 와 문자 단위로 같아야 한다
        lang: pplang,
        image: { url: pbaCard, width: CARD_SIZE, height: CARD_SIZE, alt: pbaCardAlt },
        // ko 는 한글 이름, 그 외 언어는 로마자 원표기(현지 팬이 검색하는 형태)
        title: PP.playerTitle(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo), p.league),
        desc: PP.playerDesc(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo), pplang === "ko" ? p.nameEn : null, p.league, prizeStr, p.average, p.highRun),
        canonical: pplang === "ko"
          ? `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}`
          : `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}?lang=${pplang}`,
        altLangs: PBA_LANGS.filter((l) => l !== "ko") as unknown as string[],
        altBase: `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Person",
            name: p.nameKo,
            ...(p.nameEn ? { alternateName: p.nameEn } : {}),
            ...(p.nationCode ? { nationality: p.nationCode } : {}),
            jobTitle: "Professional billiards player",
            memberOf: { "@type": "SportsOrganization", name: `${p.league} Tour` },
            url: `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}`,
            image: pbaCard,
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "PBA 투어 랭킹", item: `${ORIGIN}/pba` },
              { "@type": "ListItem", position: 2, name: p.nameKo, item: `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}` },
            ],
          },
          // "OOO 연봉" 은 조회가 많은 질의인데 프로당구엔 연봉 자체가 없다. 없는 수치를 지어내지 않고
          // 질문에 정확히 답하는 FAQ 를 준다 — AI 검색·구글 FAQ 리치결과 대응.
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: PP.incomeQ(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo)),
                acceptedAnswer: { "@type": "Answer", text: PP.incomeA(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo), prizeStr) },
              },
            ],
          },
        ],
        body: `<main>
  <nav><a href="/pba">← PBA 투어 랭킹</a></nav>
  <h1>${esc(p.nameKo)}</h1>
  <img src="${esc(pbaCard)}" width="${CARD_SIZE}" height="${CARD_SIZE}" alt="${esc(pbaCardAlt)}" />
  <p>${esc(p.nameEn ?? "")} · ${esc(p.league)}${p.nationCode ? ` · ${esc(p.nationCode)}` : ""}</p>
  <dl>
    <dt>${esc(PP.careerPrize)}</dt><dd>${esc(prizeStr)}</dd>
    ${p.win != null ? `<dt>승-패</dt><dd>${p.win}-${p.lose ?? 0}${winRate != null ? ` (승률 ${winRate}%)` : ""}</dd>` : ""}
    ${p.average != null ? `<dt>에버리지</dt><dd>${p.average}</dd>` : ""}
    ${p.bankShotRate != null ? `<dt>뱅크샷 성공률</dt><dd>${p.bankShotRate}%</dd>` : ""}
    ${p.highRun != null ? `<dt>하이런</dt><dd>${p.highRun}</dd>` : ""}
  </dl>
  <p>${esc(PP.incomeNote)}</p>
  <h2>${esc(PP.incomeQ(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo)))}</h2>
  <p>${esc(PP.incomeA(pplang === "ko" ? p.nameKo : (p.nameEn || p.nameKo), prizeStr))}</p>
  <h2>${esc(PP.seasonH)}</h2>
  <ul>
  ${(p.seasons ?? []).map((s: any) => `<li>${esc(pbaSeasonLabel(s.season))} 시즌 — ${s.prizeRank != null ? `상금랭킹 ${s.prizeRank}위, ` : ""}상금 ${esc(formatPrizeKo(s.prize))}원, 포인트 ${s.rankingPoint.toLocaleString("ko-KR")}점</li>`).join("\n  ")}
  </ul>
  ${p.umbPlayerId && p.umbCategory ? `<p><a href="/player/${esc(p.umbCategory)}/${esc(p.umbPlayerId)}">이 선수의 UMB 세계랭킹 기록 보기</a></p>` : ""}
  <p>출처: PBA 투어 공식 기록 — <a href="https://www.pbatour.org" rel="noopener">pbatour.org</a></p>
</main>`,
      }),
    );
  });

  // ── /briefing, /briefing/:date ────────────────────────────────────
  // 날짜별 고정 URL 아카이브 — "당구 브리핑"류 질문형 검색(AEO)의 착지점. ko 단일 언어.
  // 문구는 shared/briefingMeta 로 클라이언트와 문자 단위 일치.
  const briefingHandler = async (req: Parameters<Parameters<Express["get"]>[1]>[0], res: Parameters<Parameters<Express["get"]>[1]>[1], next: () => void) => {
    if (!isBot(req)) return next();
    const raw = (req.params as any).date as string | undefined;
    const today = todayKst();
    const date = raw ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || Number(date.slice(0, 4)) < 2024) {
      return sendGone(res, "브리핑이 없는 날짜입니다.", "요청한 날짜의 브리핑이 없습니다.");
    }
    let b: any = null;
    try {
      b = await storage.umb.getBriefing(date);
    } catch (e) {
      console.warn("[prerender] briefing failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    res.setHeader("X-Prerender", "briefing");
    noStore(res);
    /*
     * 2026-09-18 서치 콘솔 "크롤링됨 - 색인 안 됨": 날짜별 브리핑은 본문이 한 문장(276자)이고 매일 하나씩 생겨
     * 핵심 사이트맵 64개 중 30개를 차지했다 — 거의 같은 얇은 페이지를 자동으로 찍어 내는 전형적인 저품질 신호다.
     * 게다가 /briefing 의 canonical 이 "오늘 날짜"라 대표 주소가 매일 바뀌었다.
     * 이제 /briefing 한 장만 색인한다(자기 자신이 대표). 날짜 페이지는 링크로는 남기되 noindex.
     */
    const isArchive = Boolean(raw);
    res.send(
      page({
        title: briefingTitle(date),
        desc: briefingDesc(b, date),
        canonical: isArchive ? `${ORIGIN}/briefing/${date}` : `${ORIGIN}/briefing`,
        noindex: isArchive,
        body: `<main>
  <nav><a href="/world-ranking">← 세계 랭킹</a></nav>
  <h1>오늘의 당구 브리핑 — ${esc(briefingDateKo(date))}</h1>
  ${b ? `<p><a href="/player/players/${esc(b.playerUmbId)}">${esc(briefingLineKo(b))}</a></p>` : "<p>이 날짜의 브리핑이 없습니다.</p>"}
  <p>출처: UMB 공식 랭킹 — <a href="https://www.umb-carom.org" rel="noopener">umb-carom.org</a> · 매일 자동 갱신</p>
</main>`,
      }),
    );
  };
  app.get("/briefing", briefingHandler);
  app.get("/briefing/:date", briefingHandler);

  // ── /community, /community/:id ────────────────────────────────────
  // 커뮤니티는 공개 게시판이라 색인 대상 (크루 내부 콘텐츠는 색인 제외 원칙과 구분).
  app.get("/community", async (req, res, next) => {
    if (!isBot(req)) return next();
    let listHtml = "";
    try {
      const posts = await storage.community.getPosts({ limit: 20 });
      listHtml = posts.filter((p: any) => !p.isBlinded).map((p: any) =>
        `<li><a href="/community/${esc(p.id)}">${esc((p.title || p.content || "").slice(0, 60))}</a></li>`).join("\n  ");
    } catch (e) {
      console.warn("[prerender] community list failed:", (e as Error)?.message);
    }
    res.setHeader("X-Prerender", "community");
    res.send(
      page({
        title: "당구 커뮤니티 — 한 큐 자랑·질문·매장·레슨 | 랭큐 RANKUE",
        desc: "전국 당구인들의 커뮤니티. 한 큐 자랑, 당구 질문, 매장 소식, 레슨 정보를 나눠보세요.",
        canonical: `${ORIGIN}/community`,
        body: `<main>
  <h1>당구 커뮤니티</h1>
  <p>전국 당구인들과 이야기하는 공간입니다. 한 큐 자랑, 물어보기, 우리 매장, 레슨 게시판이 있습니다.</p>
  <ul>
  ${listHtml || "<li>첫 글을 남겨보세요.</li>"}
  </ul>
  <nav><a href="/">랭큐 홈</a> <a href="/world-ranking">당구 세계랭킹</a></nav>
</main>`,
      }),
    );
  });

  app.get("/community/:id", async (req, res, next) => {
    if (!isBot(req)) return next();
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return next();
    try {
      const post = await storage.community.getPost(req.params.id);
      if (!post || post.isBlinded) return next(); // 블라인드 글은 색인시키지 않는다
      const title = (post.title || post.content.split("\n")[0] || "당구 커뮤니티 글").slice(0, 60);
      res.setHeader("X-Prerender", "community-post");
      res.send(
        page({
          title: `${title} | 랭큐 당구 커뮤니티`,
          desc: post.content.slice(0, 150).replace(/\n/g, " "),
          canonical: `${ORIGIN}/community/${req.params.id}`,
          body: `<main>
  <h1>${esc(title)}</h1>
  <p>${esc(post.content.slice(0, 1000))}</p>
  <p>작성: ${esc(post.author?.name || "")} · ${esc(new Date(post.createdAt).toLocaleDateString("ko-KR"))}</p>
  <nav><a href="/community">당구 커뮤니티</a> <a href="/">랭큐 홈</a></nav>
</main>`,
        }),
      );
    } catch (e) {
      console.warn("[prerender] community post failed:", (e as Error)?.message);
      return next();
    }
  });

  app.get("/about", (req, res, next) => {
    if (!isBot(req)) return next();
    const q = typeof req.query.lang === "string" ? req.query.lang : "";
    // 화이트리스트로 검사한다. `ABOUT_CONTENT[q]` 로 검사하면 ?lang=constructor 처럼
    // Object.prototype 속성명이 truthy 로 통과해 c.metaTitle 접근에서 500 이 난다.
    const lang = (ABOUT_LANGS as readonly string[]).includes(q) ? q : "ko";
    const c = ABOUT_CONTENT[lang];
    res.setHeader("X-Prerender", `about:${lang}`);
    noStore(res);
    res.send(
      page({
        lang,
        title: c.metaTitle,
        desc: c.metaDesc,
        // 언어판은 자기 URL 을 self-canonical 해야 한다. 전부 /about 을 가리키면 구글이
        // "ko판의 중복"으로 보고 6개 언어판을 통째로 색인에서 빼 버린다.
        // client/src/pages/about.tsx 의 useSeo path 와 **같은 규칙**이어야 한다.
        canonical: lang === "ko" ? `${ORIGIN}/about` : `${ORIGIN}/about?lang=${lang}`,
        // 사이트맵이 about 에 6개 대체 언어를 선언한다(server/sitemap.ts ABOUT_LANGS).
        // 어느 언어판이든 같은 전체 클러스터를 내야 상호 선언이 성립한다.
        altBase: `${ORIGIN}/about`,
        altLangs: ["en", "vi", "tr", "es", "ja", "zh"],
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: c.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          APP_LD,
        ],
        body: aboutBody(c),
      }),
    );
  });

  // ── /stores ────────────────────────────────────────────────────────
  // 지역 허브 링크 목록 — /stores 본문과 /stores?region= 페이지 하단, 매장 상세가 공유.
  const regionLinks = (regions: { region: string; n: number }[], current?: string) =>
    `<ul>${regions.map((r) => `<li>${r.region === current
      ? `<strong>${esc(r.region)}</strong>`
      : `<a href="/stores?region=${esc(encodeURIComponent(r.region))}">${esc(r.region)} 당구장</a>`} (${r.n.toLocaleString("ko-KR")})</li>`).join("")}</ul>`;
  const listRegions = () => db.select({ region: storeListings.region, n: sql<number>`count(*)::int` })
    .from(storeListings).groupBy(storeListings.region).orderBy(sql`count(*) DESC`);

  app.get("/stores", async (req, res, next) => {
    if (!isBot(req)) return next();
    const regionQ = typeof req.query.region === "string" ? req.query.region.slice(0, 10) : "";
    let items: { slug: string | null; name: string; region: string | null; address: string | null }[] = [];
    let dirRows: { code: string; name: string; region: string; address: string }[] = [];
    let dirTotal = 0;
    let regions: { region: string; n: number }[] = [];
    try {
      // 디렉터리는 SPA 초기 화면과 같은 30곳(이름순)만 싣는다 — 전체 1,195곳은 지역 허브(/stores?region=)와 사이트맵으로.
      [items, dirRows, [{ total: dirTotal }], regions] = await Promise.all([
        storage.getPublicStores() as Promise<typeof items>,
        db.select({
          code: storeListings.code, name: storeListings.name,
          region: storeListings.region, address: storeListings.address,
        }).from(storeListings).where(regionQ ? eq(storeListings.region, regionQ) : undefined)
          .orderBy(asc(storeListings.name)).limit(regionQ ? 400 : 30),
        db.select({ total: sql<number>`count(*)::int` }).from(storeListings),
        listRegions(),
      ]);
    } catch (e) {
      // 빈 목록("총 0개 매장")을 200 으로 내보내면 크롤러가 "매장이 없는 사이트"로 학습한다.
      console.warn("[prerender] stores failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    // ── 지역 허브 /stores?region=서울 — "서울 당구장" 로컬 검색 타깃. 그 지역 매장 전부를 링크로 싣는다.
    // 없는 지역(?region=zz)은 404 — 검색 파라미터 조합이 무한히 색인되는 것을 막는다.
    if (regionQ) {
      const hit = regions.find((r) => r.region === regionQ);
      if (!hit) return sendGone(res, "지역을 찾을 수 없습니다.", "요청한 지역의 당구장 정보가 없습니다.");
      const canonical = `${ORIGIN}/stores?region=${encodeURIComponent(regionQ)}`;
      res.setHeader("X-Prerender", `stores-region:${encodeURIComponent(regionQ)}`);
      noStore(res);
      return res.send(
        page({
          // client/src/pages/stores.tsx 의 지역 useSeo 와 문자 단위로 같아야 한다(shared/storeMeta.ts 공유).
          title: regionTitleKo(regionQ),
          desc: regionDescKo(regionQ, hit.n),
          canonical,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `${regionQ} 당구장`,
              numberOfItems: hit.n,
              itemListElement: dirRows.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${ORIGIN}/stores/${s.code}` })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "매장 찾기", item: `${ORIGIN}/stores` },
                { "@type": "ListItem", position: 2, name: `${regionQ} 당구장`, item: canonical },
              ],
            },
          ],
          body: `<main>
  <nav><a href="/stores">← 매장 찾기</a></nav>
  <h1>${esc(regionQ)} 당구장 ${hit.n.toLocaleString("ko-KR")}곳</h1>
  <p>${esc(regionQ)} 지역 당구장의 주소·영업시간·테이블 구성·요금을 확인하세요.</p>
  <h2>${esc(regionQ)} 당구장 목록</h2>
  ${dirRows.map((s) => `<section><h3><a href="/stores/${esc(s.code)}">${esc(s.name)}</a></h3><p>${esc(s.address)}</p></section>`).join("\n  ")}
  <h2>다른 지역 당구장</h2>
  ${regionLinks(regions, regionQ)}
  ${hubNav("ko")}
</main>`,
        }),
      );
    }
    res.setHeader("X-Prerender", "stores");
    noStore(res);
    res.send(
      page({
        // client/src/pages/stores.tsx 의 ko metaTitle/metaDesc·title/subtitle 과 문자 단위로 같아야 한다.
        title: "당구장 찾기 · 전국 당구장 디렉토리 | 랭큐",
        desc: "전국 1,200여 개 당구장을 지역·이름으로 검색하세요. 주소·영업시간·테이블 구성, 랭큐 파트너 매장의 랭킹·매칭까지.",
        canonical: `${ORIGIN}/stores`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            numberOfItems: dirTotal + items.length,
            itemListElement: [
              ...items.map((s) => ({
                name: s.name,
                url: s.slug ? `${ORIGIN}/store/${encodeURIComponent(s.slug)}` : undefined,
              })),
              ...dirRows.map((s) => ({ name: s.name, url: `${ORIGIN}/stores/${s.code}` })),
            ].map((e, i) => ({ "@type": "ListItem", position: i + 1, ...e })),
          },
        ],
        body: `<main>
  <h1>매장 찾기</h1>
  <p>전국 당구장을 지역·이름으로 찾아보세요</p>
  <p>총 ${(dirTotal + items.length).toLocaleString("ko-KR")}개 매장</p>
  <h2>랭큐 파트너 매장</h2>
  ${
    items.length
      ? items
          .map(
            (s) =>
              `<section><h3>${
                s.slug ? `<a href="/store/${esc(encodeURIComponent(s.slug))}">${esc(s.name)}</a>` : esc(s.name)
              }</h3>${s.region ? `<p>${esc(s.region)}</p>` : ""}${s.address ? `<p>${esc(s.address)}</p>` : ""}</section>`,
          )
          .join("\n  ")
      : "<p>표시할 매장이 없습니다.</p>"
  }
  <h2>지역별 당구장</h2>
  ${regionLinks(regions)}
  <h2>전국 당구장 디렉토리</h2>
  ${dirRows
    .map(
      (s) =>
        `<section><h3><a href="/stores/${esc(s.code)}">${esc(s.name)}</a></h3><p>${esc(s.region)}</p><p>${esc(s.address)}</p></section>`,
    )
    .join("\n  ")}
  ${hubNav("ko")}
</main>`,
      }),
    );
  });

  // ── /stores/:code — 수집 디렉토리 매장 상세 ─────────────────────────
  // "김해 당구장"류 로컬 검색이 타깃. 객관 정보(주소·전화·영업시간·테이블)만 싣는다
  // (수집 원문 소개·요금 미전재 원칙 — 소개는 사장님 인증 후 직접 작성).
  app.get("/stores/:code", async (req, res, next) => {
    if (!isBot(req)) return next();
    // /stores/register 는 등록 폼 페이지 — 코드 정규식(영문 소문자 매치)에 걸려 410 이 나가면
    // 카톡·페북 스크래퍼가 미리보기를 못 만든다. 봇에게도 SPA 셸을 주도록 통과시킨다.
    if (req.params.code === "register") return next();
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(req.params.code)) {
      return sendGone(res, "매장을 찾을 수 없습니다.", "요청한 당구장 정보가 없습니다.");
    }
    let s: Record<string, any> | null = null;
    try {
      [s = null] = await db.select().from(storeListings).where(eq(storeListings.code, req.params.code));
    } catch (e) {
      // /store/:slug 와 같은 이유 — DB 장애를 404 로 내면 유효 URL 이 색인에서 빠진다.
      console.warn("[prerender] listing failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!s) return sendGone(res, "매장을 찾을 수 없습니다.", "요청한 당구장 정보가 없습니다.");
    // 활동 크루 — 클라이언트 상세와 같은 공개 필드
    let crews: { id: string; name: string }[] = [];
    try {
      const { hiqCrews } = await import("../shared/schema.js");
      crews = await db.select({ id: hiqCrews.id, name: hiqCrews.name })
        .from(hiqCrews).where(eq(hiqCrews.baseListingCode, s.code)).limit(10);
    } catch { /* 크루 조회 실패는 본문 축소로만 — 페이지는 나간다 */ }
    // 같은 지역 당구장 6곳 — 좌표가 있으면 가까운 순, 없으면 이름순. 상세끼리 이어지는 내부 링크(크롤 경로).
    let nearby: { code: string; name: string; address: string }[] = [];
    try {
      const dist = s.latitude != null && s.longitude != null
        ? sql`CASE WHEN ${storeListings.latitude} IS NULL THEN 1e9 ELSE
            (6371 * acos(least(1.0, cos(radians(${s.latitude})) * cos(radians(${storeListings.latitude})) *
            cos(radians(${storeListings.longitude}) - radians(${s.longitude})) +
            sin(radians(${s.latitude})) * sin(radians(${storeListings.latitude}))))) END`
        : sql`0`;
      nearby = await db.select({ code: storeListings.code, name: storeListings.name, address: storeListings.address })
        .from(storeListings)
        .where(and(eq(storeListings.region, s.region), ne(storeListings.code, s.code)))
        .orderBy(dist, asc(storeListings.name)).limit(6);
    } catch { /* 이웃 조회 실패는 본문 축소로만 */ }
    const regionHref = `/stores?region=${encodeURIComponent(s.region)}`;
    const tables = [
      s.tableLarge ? `대대 ${s.tableLarge}` : "",
      s.tableMedium ? `중대 ${s.tableMedium}` : "",
      s.tablePocket ? `포켓 ${s.tablePocket}` : "",
    ].filter(Boolean);
    // 요금 — 구조화 숫자만 (자유텍스트 요금안내는 미전재 정책)
    const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
    const rates = ([["대대", s.rate10Large, s.flatLarge], ["중대", s.rate10Medium, s.flatMedium], ["포켓", s.rate10Pocket, s.flatPocket]] as const)
      .filter(([, r, f]) => r != null || f != null)
      .map(([label, r, f]) => `${label} ${[r != null ? `10분당 ${won(r)}` : "", f != null ? `정액 ${won(f)}` : ""].filter(Boolean).join(" · ")}`);
    res.setHeader("X-Prerender", "store-listing");
    noStore(res);
    res.send(
      page({
        // client/src/pages/store-listing.tsx 의 useSeo title/desc 와 문자 단위로 같아야 한다.
        title: storeTitleKo(s.name, s.region),
        desc: storeDescKo(s.name, s.address, s as any, s.openHours),
        canonical: `${ORIGIN}/stores/${encodeURIComponent(s.code)}`,
        jsonLd: [
          storeJsonLd(s as any, ORIGIN),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "매장 찾기", item: `${ORIGIN}/stores` },
              { "@type": "ListItem", position: 2, name: `${s.region} 당구장`, item: `${ORIGIN}${regionHref}` },
              { "@type": "ListItem", position: 3, name: s.name, item: `${ORIGIN}/stores/${encodeURIComponent(s.code)}` },
            ],
          },
        ],
        body: `<main>
  <nav><a href="/stores">← 매장 찾기</a> › <a href="${esc(regionHref)}">${esc(s.region)} 당구장</a></nav>
  <h1>${esc(s.name)}</h1>
  <p>${esc(s.region)}</p>
  <p><a href="${esc(mapLink(s as any))}" rel="noopener">길찾기 · 지도에서 보기</a>${s.phone ? ` · <a href="tel:${esc(s.phone)}">전화 걸기</a>` : ""}</p>
  <h2>매장 정보 · 영업시간 · 요금</h2>
  <dl>
    <dt>주소</dt><dd>${esc(s.address)}</dd>
    ${s.phone ? `<dt>전화</dt><dd>${esc(s.phone)}</dd>` : ""}
    ${s.openHours ? `<dt>영업시간</dt><dd>${esc(s.openHours)}</dd>` : ""}
    ${tables.length ? `<dt>테이블</dt><dd>${esc(tables.join(" · "))}</dd>` : ""}
    ${rates.length ? `<dt>요금</dt><dd>${esc(rates.join(", "))}</dd>` : ""}
  </dl>
  ${crews.length ? `<h2>이 매장에서 활동하는 크루</h2><ul>${crews.map((c) => `<li><a href="/club/${esc(c.id)}">${esc(c.name)}</a></li>`).join("")}</ul>` : ""}
  ${nearby.length ? `<h2>${esc(s.region)}의 다른 당구장</h2><ul>${nearby.map((n) => `<li><a href="/stores/${esc(n.code)}">${esc(n.name)}</a> — ${esc(n.address)}</li>`).join("")}</ul><p><a href="${esc(regionHref)}">${esc(s.region)} 당구장 전체 보기</a></p>` : ""}
  ${hubNav("ko")}
</main>`,
      }),
    );
  });

  // ── /store/:slug ───────────────────────────────────────────────────
  app.get("/store/:slug", async (req, res, next) => {
    if (!isBot(req)) return next();
    let s: Record<string, any> | null = null;
    try {
      s = (await storage.getPublicStoreBySlug(req.params.slug)) as Record<string, any> | null;
    } catch (e) {
      // 예외(=DB 장애)와 "조회는 됐고 행이 없음"을 반드시 구분한다. 전자를 404 로 내면
      // 장애가 끝난 뒤에도 유효한 매장 URL 이 색인에서 빠진 상태로 남는다.
      console.warn("[prerender] store failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    // 디렉토리에 연결된 매장은 /stores/:code 가 정본 — 301 로 크롤러 색인을 그쪽에 모은다.
    if (s && (s as any).listingCode) {
      return res.redirect(301, `${ORIGIN}/stores/${encodeURIComponent((s as any).listingCode)}`);
    }
    // 없는 매장 = 404. 크롤러에게 "이 URL 은 없다"를 정확히 알리는 것이 맞는 응답이다.
    if (!s) return sendGone(res, "매장을 찾을 수 없습니다.", "요청한 당구장 정보가 없습니다.");
    // client/src/pages/store-detail.tsx:39 의 useSeo title 과 **문자 단위로 같아야** 한다.
    // 거기서는 region 이 null 이어도 "·" 를 남기고 공백만 정규화한다("랭큐 · 당구장 · 랭큐").
    // 크롤러가 JS 를 실행했을 때의 제목과 어긋나지 않게 같은 식을 그대로 쓴다.
    const title = `${s.name} · ${s.region ?? ""} 당구장 · 랭큐`.replace(/\s+/g, " ").trim();
    res.setHeader("X-Prerender", "store");
    noStore(res);
    res.send(
      page({
        title,
        desc:
          s.description ||
          `${s.name}${s.region ? ` (${s.region})` : ""} — 랭큐 파트너 당구장. 매장 랭킹·매칭·크루.`,
        canonical: `${ORIGIN}/store/${encodeURIComponent(s.slug)}`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "SportsActivityLocation",
            name: s.name,
            url: `${ORIGIN}/store/${encodeURIComponent(s.slug)}`,
            ...(s.description ? { description: s.description } : {}),
            ...(s.phone ? { telephone: s.phone } : {}),
            ...(s.address || s.region
              ? {
                  address: {
                    "@type": "PostalAddress",
                    ...(s.address ? { streetAddress: s.address } : {}),
                    ...(s.region ? { addressLocality: s.region } : {}),
                    addressCountry: "KR",
                  },
                }
              : {}),
            ...(s.latitude && s.longitude
              ? { geo: { "@type": "GeoCoordinates", latitude: s.latitude, longitude: s.longitude } }
              : {}),
          },
        ],
        body: `<main>
  <nav><a href="/stores">← 매장 목록</a></nav>
  <h1>${esc(s.name)}</h1>
  ${s.region ? `<p>${esc(s.region)}</p>` : ""}
  ${s.description ? `<p>${esc(s.description)}</p>` : ""}
  <dl>
    ${s.address ? `<dt>주소</dt><dd>${esc(s.address)}</dd>` : ""}
    ${s.phone ? `<dt>전화</dt><dd>${esc(s.phone)}</dd>` : ""}
    ${s.notice ? `<dt>공지</dt><dd>${esc(s.notice)}</dd>` : ""}
  </dl>
</main>`,
      }),
    );
  });

  // ── /club/:id ──────────────────────────────────────────────────────
  // 크루 상세는 비로그인·쿠키 없이 200 으로 열린다(GET /api/hiq/crews/:id 로 확인).
  // 즉 공개 데이터라서 프리렌더가 사용자 화면의 충실한 재현이 된다.
  // 공유 링크(/r/:id) — 카톡·문자에 붙였을 때 뜨는 미리보기 카드를 만든다.
  // 이미지 파일을 주고받는 대신 링크를 던지는 방식이라, 미리보기가 결과 요약을 대신한다.
  app.get("/r/:id", async (req, res, next) => {
    if (!isBot(req)) return next();
    const id = req.params.id;
    let game: Record<string, any> | null = null;
    try {
      game = (await storage.getHiqGameById(id)) as Record<string, any> | null;
    } catch (e) {
      console.warn("[prerender] shared result failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!game) return sendGone(res, "경기를 찾을 수 없습니다.", "요청한 경기 결과가 없습니다.");

    const typeLabel = game.gameType === "3c" ? "3쿠션" : "4구";
    // 이름이 있는 슬롯만. 회원 id 같은 식별자는 넣지 않는다(공개 페이지).
    const rows = [1, 2, 3, 4]
      .map((n) => ({ name: game![`player${n}Name`] as string | null, score: Number(game![`player${n}Score`]) || 0 }))
      .filter((p) => p.name);
    const scoreLine = rows.map((p) => `${p.name} ${p.score}`).join(" : ");
    const innings = Number(game.totalInnings) || 0;

    const title = `${typeLabel} ${scoreLine} · 랭큐`;
    res.setHeader("X-Prerender", "shared-result");
    noStore(res);
    res.send(
      page({
        title,
        desc: `${typeLabel} 경기 결과 — ${scoreLine}${innings ? ` (${innings}이닝)` : ""}. 손안의 당구 점수판, 랭큐.`,
        canonical: `${ORIGIN}/r/${encodeURIComponent(id)}`,
        body: `<main>
  <h1>${esc(typeLabel)} 경기 결과</h1>
  <p>${esc(scoreLine)}</p>
  ${innings ? `<p>총 ${esc(innings)}이닝</p>` : ""}
  <nav><a href="/">랭큐 시작하기</a> <a href="/about">랭큐 소개</a></nav>
</main>`,
      }),
    );
  });

  app.get("/club/:id", async (req, res, next) => {
    if (!isBot(req)) return next();
    const id = req.params.id;
    // /club/create 는 로그인 후 쓰는 크루 생성 폼이다 — 공개 콘텐츠가 아니라 색인 대상이 아니다.
    if (id === "create") return sendNoindex(res, "크루 만들기 · 랭큐");
    let crew: Record<string, any> | null = null;
    try {
      // getCrew 는 { crew, baseStore, members } 로 중첩 반환한다 — crew 만 쓴다.
      // members 는 절대 넣지 않는다: 공개 프리렌더에 회원 명단을 노출하지 않기 위함
      // (server/storage/crew.repo.ts:69 의 민감 컬럼 금지 주석과 같은 이유).
      const r = (await storage.getCrew(id)) as { crew?: Record<string, any> } | null;
      crew = r?.crew ?? null;
    } catch (e) {
      // 위 /store/:slug 와 같은 이유로 예외는 404 가 아니라 503 이다.
      console.warn("[prerender] crew failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    if (!crew?.name) return sendGone(res, "크루를 찾을 수 없습니다.", "요청한 크루 정보가 없습니다.");
    // 조립식은 shared/crewMeta.ts 가 정본 — club-detail.tsx 의 useSeo 와 같은 함수를 쓴다.
    const title = crewTitle(crew as { name: string });
    res.setHeader("X-Prerender", "club");
    noStore(res);
    res.send(
      page({
        title,
        desc: crewDescription(crew as { name: string }),
        canonical: `${ORIGIN}/club/${encodeURIComponent(id)}`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: crew.name,
            sport: "Billiards",
            url: `${ORIGIN}/club/${encodeURIComponent(id)}`,
            ...(crew.description ? { description: crew.description } : {}),
          },
        ],
        body: `<main>
  <h1>${esc(crew.name)}</h1>
  ${crew.shortIntro ? `<p>${esc(crew.shortIntro)}</p>` : ""}
  ${crew.description ? `<p>${esc(crew.description)}</p>` : ""}
  ${crew.region ? `<p>${esc(crew.region)}</p>` : ""}
  <nav><a href="/">홈으로</a> <a href="/about">랭큐 소개</a></nav>
</main>`,
      }),
    );
  });

  // ── 정적 문서 3종 ──────────────────────────────────────────────────
  // 본문만 여기 둔다. title·description 은 shared/docMeta.ts 가 정본이고
  // 각 페이지의 useSeo() 도 같은 값을 쓴다 — 그래서 렌더 후 제목과 어긋나지 않는다.
  const STATIC_DOC_BODY: Record<string, string> = {
    "/support": `<main>
  <h1>랭큐 고객지원</h1>
  <p>랭큐(RANKUE) · 개발자: 제이에이치스퀘어</p>

  <h2>문의하기</h2>
  <p>이용 중 궁금한 점이나 문제가 있으면 아래로 연락해 주세요. 영업일 기준 1~3일 이내에 답변드립니다.</p>
  <p>이메일: petudy@kakao.com</p>
  <p>앱 내 문의: 전체 메뉴 → 건의함 · 제휴 문의</p>

  <h2>자주 묻는 질문</h2>
  <section><h3>Q. 로그인은 어떻게 하나요?</h3><p>휴대폰 번호로 가입·로그인합니다. 별도 비밀번호 없이 번호 인증으로 입장할 수 있습니다.</p></section>
  <section><h3>Q. 매칭 대결의 PIN 번호는 무엇인가요?</h3><p>경기를 만들면 4자리 PIN이 생성됩니다. 상대가 홈 화면의 "핀 참여"에서 이 번호를 입력하면 같은 경기에 입장해 함께 점수를 기록할 수 있습니다.</p></section>
  <section><h3>Q. 당구 점수는 어떻게 기록하나요?</h3><p>화면의 점수판에서 터치로 득점을 입력하면 이닝·평균·하이런이 자동으로 계산되고 음성으로 안내됩니다. 되돌리기도 되고, 경기가 끝나면 전적으로 자동 저장됩니다.</p></section>
  <section><h3>Q. 계정을 삭제하고 싶어요.</h3><p>앱의 전체 메뉴 → 계정 삭제에서 직접 삭제할 수 있습니다. 자세한 내용은 계정 삭제 안내를 확인해 주세요.</p></section>

  <h2>관련 문서</h2>
  <nav><a href="/about">랭큐 소개 (About)</a> <a href="/privacy">개인정보처리방침</a> <a href="/account-delete">계정 삭제 안내</a></nav>
  <p>문의: petudy@kakao.com · 랭큐(RANKUE)</p>
</main>`,
    "/privacy": `<main>
  <h1>개인정보처리방침</h1>
  <p>랭큐(RANKUE) · 운영: 제이에이치스퀘어 · 문의: petudy@kakao.com</p>

  <h2>1. 수집하는 개인정보 항목</h2>
  <ul>
    <li>휴대폰 번호 — 계정 식별 및 로그인</li>
    <li>이름/닉네임 — 프로필 표시</li>
    <li>당구 경기 기록(점수, 이용 매장) — 경기 기록·RP 레이팅·랭킹 기능 제공</li>
    <li>사진(선택) — 사용자가 프로필 등에 직접 업로드하는 경우에만</li>
    <li>푸시 토큰(FCM) — 알림 수신에 동의한 경우에만</li>
  </ul>

  <h2>2. 이용 목적</h2>
  <ul>
    <li>계정 생성·관리 및 본인 식별</li>
    <li>경기 기록, RP 레이팅, 랭킹, 크루 매칭 등 핵심 기능 제공</li>
    <li>서비스 관련 푸시 알림 발송(동의 시)</li>
  </ul>

  <h2>3. 보관 및 파기</h2>
  <p>회원 탈퇴(계정 삭제) 시 수집된 개인정보를 지체 없이 파기합니다. 다만 관계 법령에 따라 보존 의무가 있는 정보는 해당 법령이 정한 기간 동안만 분리 보관 후 파기합니다(예: 전자상거래 등에서의 소비자 보호에 관한 법률에 따른 기록).</p>
  <p>계정 삭제 요청 방법은 <a href="/account-delete">계정 삭제 안내</a> 페이지를 참고하세요.</p>

  <h2>4. 제3자 제공 및 처리 위탁</h2>
  <p>개인정보를 제3자에게 제공하지 않습니다. 서비스 운영을 위해 클라우드 인프라 (호스팅·데이터베이스) 처리를 위탁하며, 위탁받은 업체는 개인정보 보호 관련 법령을 준수합니다.</p>

  <h2>5. 안전성 확보 조치</h2>
  <p>모든 데이터는 암호화된 통신(HTTPS)으로 전송되며, 접근 권한을 최소화하여 관리합니다.</p>

  <h2>6. 이용자의 권리</h2>
  <p>이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제를 petudy@kakao.com 으로 요청할 수 있으며, 지체 없이 처리합니다.</p>

  <p>시행일: 2026년 7월 14일</p>
</main>`,
    "/account-delete": `<main>
  <h1>계정 삭제 안내</h1>
  <p>랭큐(RANKUE) · 개발자: 제이에이치스퀘어</p>

  <h2>앱에서 바로 삭제하기</h2>
  <ol>
    <li>랭큐 앱에 로그인합니다.</li>
    <li>하단 탭 전체 → 관리 · 안내 → 계정 삭제를 선택합니다.</li>
    <li>안내를 확인하고 "삭제"를 입력하면 즉시 영구 삭제됩니다.</li>
  </ol>

  <h2>앱을 이용할 수 없는 경우 (이메일 요청)</h2>
  <ol>
    <li>petudy@kakao.com 으로 이메일을 보냅니다.</li>
    <li>제목에 "계정 삭제 요청", 본문에 가입한 휴대폰 번호를 적어주세요.</li>
    <li>본인 확인 후 영업일 기준 3일 이내에 삭제가 완료됩니다.</li>
  </ol>

  <h2>삭제되는 데이터</h2>
  <ul>
    <li>계정 정보(휴대폰 번호, 이름/닉네임) — 즉시 삭제</li>
    <li>당구 경기 기록·RP 레이팅·랭킹 데이터 — 즉시 삭제</li>
    <li>업로드한 사진 — 즉시 삭제</li>
    <li>푸시 토큰 — 즉시 삭제</li>
  </ul>

  <h2>보관되는 데이터(예외)</h2>
  <p>관계 법령에 따라 보존 의무가 있는 기록(예: 전자상거래 관련 거래 기록)은 해당 법령이 정한 기간(최대 5년) 동안 다른 데이터와 분리하여 보관한 뒤 파기합니다. 그 외 데이터는 보관하지 않습니다.</p>

  <p>문의: petudy@kakao.com · 시행일: 2026년 7월 14일</p>
</main>`,
  };

  for (const [path, body] of Object.entries(STATIC_DOC_BODY)) {
    const meta = DOC_META[path];
    app.get(path, (req, res, next) => {
      if (!isBot(req)) return next();
      res.setHeader("X-Prerender", path.slice(1));
      noStore(res);
      res.send(page({ title: meta.title, desc: meta.description, canonical: `${ORIGIN}${path}`, body }));
    });
  }
}
