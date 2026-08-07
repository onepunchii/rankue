import type { Express, Request } from "express";
import { storage } from "./storage/index.js";
import { ABOUT_CONTENT, ABOUT_LANGS, type AboutContent } from "../shared/aboutContent.js";
import { DOC_META } from "../shared/docMeta.js";
import { crewTitle, crewDescription } from "../shared/crewMeta.js";
import { LANDING_META, LANDING_FEATURES, LANDING_FAQS, LANDING_CREW } from "../shared/landingContent.js";

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
function isBot(req: Request): boolean {
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
function noStore(res: { setHeader: (k: string, v: string) => unknown }) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "User-Agent"); // 혹시 어딘가 캐시돼도 UA 별로 분리되게
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// 링크 미리보기용 기본 이미지. client/index.html:34 과 각 페이지 useSeo 의 image 인자가
// 쓰는 것과 **같은 값**이어야 한다. 이게 없으면 카카오톡·페이스북·슬랙 미리보기 카드에서
// 썸네일이 사라진다(스크래퍼 UA 인 kakaotalk-scrap·facebookexternalhit·Twitterbot 이
// 모두 봇 패턴에 걸려 이 프리렌더를 받기 때문이다).
const OG_IMAGE = `${ORIGIN}/og.png`;
const OG_LOCALE: Record<string, string> = {
  ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES", ja: "ja_JP", zh: "zh_CN",
};

interface PageParts {
  lang?: string;
  title: string;
  desc: string;
  canonical: string;
  /** hreflang 대체 URL 을 선언할 언어들. 사이트맵의 hreflang 과 짝을 맞춘다. */
  altLangs?: string[];
  /**
   * hreflang 클러스터의 기준(=ko판) URL. 대체 URL 은 여기에 ?lang= 을 붙여 만든다.
   * canonical 과 분리한 이유: 언어판은 자기 URL 을 self-canonical 해야 하는데(안 그러면
   * 전부 "ko판의 중복"으로 색인 제외된다), 그러면 canonical 에 ?lang= 이 이미 붙어 있어
   * 거기에 또 ?lang= 을 이어붙이는 실수가 난다.
   */
  altBase?: string;
  body: string;
  jsonLd?: unknown[];
}

function page(p: PageParts): string {
  // 상호(reciprocal) hreflang: 어느 언어판을 내보내든 **같은 전체 클러스터**를 선언해야
  // 구글이 묶음으로 인식한다. 한쪽만 선언하면 선언 전체가 무시된다.
  const base = p.altBase ?? p.canonical;
  const alts = (p.altLangs ?? []).length
    ? `\n  <link rel="alternate" hreflang="ko" href="${esc(base)}" />` +
      (p.altLangs ?? [])
        .map((l) => `\n  <link rel="alternate" hreflang="${l}" href="${esc(base + "?lang=" + l)}" />`)
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
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <link rel="canonical" href="${esc(p.canonical)}" />${alts}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="RANKUE" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:url" content="${esc(p.canonical)}" />
  <meta property="og:locale" content="${esc(OG_LOCALE[lang] ?? "ko_KR")}" />
  <meta property="og:image" content="${esc(OG_IMAGE)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="랭큐 RANKUE — 당구 실력 랭킹·매칭 앱" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)}" />
  <meta name="twitter:description" content="${esc(p.desc)}" />
  <meta name="twitter:image" content="${esc(OG_IMAGE)}" />${ld}
</head>
<body>
${p.body}
</body>
</html>
`;
}

// 이 함수에 도달한 봇 요청은 **반드시 여기서 끝내야 한다**.
// next() 로 흘리면 serveStatic 의 SPA 폴백이 index.html 을 sendFile 하려 하는데,
// api 함수 번들에는 dist/public 이 없어서(vercel.json 의 api 빌드에 includeFiles 미지정)
// 500 이 된다. 없는 리소스는 404, 색인 대상이 아닌 화면은 noindex 로 명시해 끝낸다.
function sendGone(res: Parameters<Parameters<Express["get"]>[1]>[1], title: string, msg: string) {
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

function sendNoindex(res: Parameters<Parameters<Express["get"]>[1]>[1], title: string) {
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
function sendUnavailable(res: Parameters<Parameters<Express["get"]>[1]>[1]) {
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
  app.get("/", (req, res, next) => {
    if (!isBot(req)) return next();
    res.setHeader("X-Prerender", "home");
    noStore(res);
    res.send(
      page({
        title: LANDING_META.title,
        desc: LANDING_META.desc,
        canonical: `${ORIGIN}/`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: LANDING_FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          APP_LD,
        ],
        body: `<main>
  <h1>${esc(LANDING_META.h1)}</h1>
  <p>${esc(LANDING_META.lead)}</p>

  <h2>이런 걸 할 수 있어요</h2>
  <p>점수판부터 매칭, 기록, 당구 커뮤니티까지 — 당구장에서 필요한 게 한 앱에 모여 있습니다.</p>
  ${LANDING_FEATURES.map((f) => `<section><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p></section>`).join("\n  ")}

  <h2>${esc(LANDING_CREW.title)}</h2>
  <p>${esc(LANDING_CREW.desc)}</p>
  <ul>
  ${LANDING_CREW.items.map((i) => `<li>${esc(i.t)} — ${esc(i.d)}</li>`).join("\n  ")}
  </ul>

  <h2>자주 묻는 질문</h2>
  ${LANDING_FAQS.map((f) => `<section><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></section>`).join("\n  ")}

  <nav><a href="/about">랭큐 소개</a> <a href="/stores">매장 찾기</a> <a href="/support">고객지원</a></nav>
</main>`,
      }),
    );
  });

  // ── /world-ranking ─────────────────────────────────────────────────
  // UMB 세계랭킹 — 사이트맵에 등록된 검색 유입 타깃이라 봇에게 빈 SPA 셸이 아니라
  // 실제 톱10이 담긴 HTML을 내보낸다. DB 조회 실패 시에도 메타는 나가야 한다.
  app.get("/world-ranking", async (req, res, next) => {
    if (!isBot(req)) return next();
    let listHtml = "";
    let editionLabel = "";
    try {
      const data = await storage.umb.getRankings("players", { limit: 10 });
      if (data.rows.length) {
        editionLabel = data.edition ? ` (Edition ${data.edition})` : "";
        listHtml = `<ol>\n${data.rows.map((r: any) =>
          `  <li>${esc(r.playerName)} (${esc(r.fed)}) — ${r.points}점</li>`).join("\n")}\n</ol>`;
      }
    } catch (e) {
      console.warn("[prerender] world-ranking rows failed:", (e as Error)?.message);
    }
    res.setHeader("X-Prerender", "world-ranking");
    res.send(
      page({
        title: "당구 세계랭킹 — UMB 공식 3쿠션 랭킹 | 랭큐 RANKUE",
        desc: "UMB 공식 3쿠션 세계랭킹을 매주 업데이트. 남자·여자·주니어 전체 순위와 한국 선수, 선수별 순위 히스토리를 랭큐에서 확인하세요.",
        canonical: `${ORIGIN}/world-ranking`,
        body: `<main>
  <h1>당구 세계랭킹${esc(editionLabel)}</h1>
  <p>UMB(세계당구연맹) 공식 3쿠션 세계랭킹입니다. 매주 갱신되며 남자·여자·주니어 부문 전체 순위와 선수별 순위 변동을 볼 수 있습니다.</p>
  <h2>남자 세계랭킹 톱 10</h2>
  ${listHtml || "<p>랭킹 데이터를 불러오는 중입니다.</p>"}
  <p>출처: <a href="https://www.umb-carom.org" rel="noopener">UMB 공식 랭킹</a></p>
  <nav><a href="/">홈으로</a> <a href="/about">랭큐 소개</a> <a href="/stores">매장 찾기</a></nav>
</main>`,
      }),
    );
  });

  // ── /player/:category/:umbId ──────────────────────────────────────
  // UMB 선수 페이지 — 사이트맵(톱200+한국 전원) 대상. 봇에게 순위·히스토리 요약 HTML.
  app.get("/player/:category/:umbId", async (req, res, next) => {
    if (!isBot(req)) return next();
    const category = ["players", "ladies", "juniors"].includes(req.params.category) ? req.params.category : null;
    if (!category || !/^\d{1,6}$/.test(req.params.umbId)) return next();
    try {
      const data = await storage.umb.getPlayerHistory(category as any, req.params.umbId);
      if (!data?.player) return next();
      const p = data.player as any;
      const catKo = category === "players" ? "남자" : category === "ladies" ? "여자" : "주니어";
      // 한글 이름이 있으면 병기 — "조명우 (CHO Myung Woo)". 한글 검색 매칭의 핵심.
      const nameFull = p.nativeName ? `${p.nativeName} (${p.playerName})` : p.playerName;
      const historySummary = data.history.slice(-10).map((h: any) =>
        `<li>Edition ${esc(h.edition)}: ${h.rank}위 (${h.points}점)</li>`).join("\n  ");
      res.setHeader("X-Prerender", "umb-player");
      res.send(
        page({
          title: `${nameFull} — 당구 세계랭킹 ${p.rank}위 | 랭큐 RANKUE`,
          desc: `${nameFull} (${p.fed}) UMB 공식 3쿠션 ${catKo} 세계랭킹 ${p.rank}위, ${p.points}점. 역대 최고 ${data.bestRank}위. 주간 순위 히스토리와 대회별 포인트를 랭큐에서 확인하세요.`,
          canonical: `${ORIGIN}/player/${category}/${req.params.umbId}`,
          body: `<main>
  <h1>${esc(nameFull)} — 당구 세계랭킹 ${p.rank}위</h1>
  <p>UMB 공식 3쿠션 ${catKo} 세계랭킹. 국가 ${esc(p.fed)} · 현재 ${p.rank}위 · ${p.points}점 · 역대 최고 ${data.bestRank}위 · 국내 ${p.nationalRank ?? "-"}위</p>
  <h2>최근 순위 히스토리</h2>
  <ul>
  ${historySummary}
  </ul>
  <p>출처: <a href="https://www.umb-carom.org" rel="noopener">UMB 공식 랭킹</a></p>
  <nav><a href="/world-ranking">당구 세계랭킹 전체</a> <a href="/">랭큐 홈</a></nav>
</main>`,
        }),
      );
    } catch (e) {
      console.warn("[prerender] player failed:", (e as Error)?.message);
      return next();
    }
  });

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
  app.get("/stores", async (req, res, next) => {
    if (!isBot(req)) return next();
    let items: { slug: string | null; name: string; region: string | null; address: string | null }[] = [];
    try {
      items = (await storage.getPublicStores()) as typeof items;
    } catch (e) {
      // 빈 목록("총 0개 매장")을 200 으로 내보내면 크롤러가 "매장이 없는 사이트"로 학습한다.
      console.warn("[prerender] stores failed:", (e as Error)?.message);
      return sendUnavailable(res);
    }
    res.setHeader("X-Prerender", "stores");
    noStore(res);
    res.send(
      page({
        title: "매장 찾기 · 랭큐 당구장 디렉토리",
        desc: "랭큐와 함께하는 당구장을 지역·이름으로 찾아보세요. 매장 랭킹, 매칭, 크루 활동이 가능한 파트너 당구장 목록.",
        canonical: `${ORIGIN}/stores`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: items.slice(0, 100).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: s.name,
              url: s.slug ? `${ORIGIN}/store/${encodeURIComponent(s.slug)}` : undefined,
            })),
          },
        ],
        body: `<main>
  <h1>매장 찾기</h1>
  <p>랭큐 파트너 당구장을 찾아보세요</p>
  <p>총 ${items.length}개 매장</p>
  ${
    items.length
      ? items
          .map(
            (s) =>
              `<section><h2>${
                s.slug ? `<a href="/store/${esc(encodeURIComponent(s.slug))}">${esc(s.name)}</a>` : esc(s.name)
              }</h2>${s.region ? `<p>${esc(s.region)}</p>` : ""}${s.address ? `<p>${esc(s.address)}</p>` : ""}</section>`,
          )
          .join("\n  ")
      : "<p>표시할 매장이 없습니다.</p>"
  }
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
