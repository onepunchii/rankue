/**
 * www.rankue.kr 의 사람용 첫 문서(dist/public/index.kr.html)를 만든다 — vite build 바로 뒤에 돈다(package.json build).
 *
 * 왜: 앱 셸(index.html)의 머리에는 당구 제목 · co.kr 을 가리키는 hreflang 여섯 줄 · og:url · 조직/사이트 JSON-LD 가 박혀 있다.
 * .kr 에서 그대로 내면 골프 도메인의 문서가 '다른 도메인의 당구 사이트'라고 적힌 채 나간다(도메인 나누기 규칙 2 · shared/siteSplit.ts).
 * 스크립트 · 스타일은 그대로 두고 머리의 그 줄들만 골프 것으로 바꾼다. vercel.json 의 맨 끝 .kr 규칙이 이 파일을 내보낸다.
 *
 * 바꿀 줄을 못 찾으면 **빌드를 멈춘다** — 조용히 넘어가면 co.kr 주소가 섞인 문서가 .kr 로 나간다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "dist/public");
const KR = "https://www.rankue.kr";
const TITLE = "랭큐 골프 — 수수료 없는 골프 조인 · 부킹 · 전국 골프장 날씨 · 코스";
const DESC = "전국 골프장 490곳의 날씨 · 그린피 · 코스 정보와 수수료 없는 골프 조인 · 부킹. 티타임별 날씨와 남은 티를 한 화면에서 봅니다.";
const KEYWORDS = "랭큐 골프, 골프 조인, 골프 부킹, 골프장 날씨, 그린피, 전국 골프장, 긴급 티";

let html = readFileSync(resolve(dir, "index.html"), "utf8");
let steps = 0;
const swap = (name, re, to, { min = 1 } = {}) => {
    const n = (html.match(re) ?? []).length;
    if (n < min) throw new Error(`[make-kr-shell] '${name}' 줄을 못 찾았습니다(${n}/${min}) — client/index.html 의 머리가 바뀌었는지 보세요`);
    html = html.replace(re, to);
    steps++;
};
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

swap("title", /<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
swap("description", /<meta name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${attr(DESC)}" />`);
swap("keywords", /<meta name="keywords" content="[^"]*"\s*\/>/, `<meta name="keywords" content="${attr(KEYWORDS)}" />`);
swap("hreflang", /\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>/g, "", { min: 2 });
swap("og:url", /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${KR}/golf" />`);
swap("og:title", /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${attr(TITLE)}" />`);
swap("og:description", /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${attr(DESC)}" />`);
swap("og:image", /<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${KR}/og-golf.png" />`);
swap("og:image:alt", /<meta property="og:image:alt" content="[^"]*"\s*\/>/, `<meta property="og:image:alt" content="랭큐 골프" />`);
swap("og:locale:alternate", /\s*<meta property="og:locale:alternate" content="[^"]*"\s*\/>/g, "");
swap("twitter:url", /<meta name="twitter:url" content="[^"]*"\s*\/>/, `<meta name="twitter:url" content="${KR}/golf" />`);
swap("twitter:title", /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${attr(TITLE)}" />`);
swap("twitter:description", /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${attr(DESC)}" />`);
swap("twitter:image", /<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${KR}/og-golf.png" />`);
// co.kr 의 소유 확인 값 — .kr 은 서치어드바이저에 따로 등록한다(HTML 파일 방식)
swap("site-verification", /\s*<meta name="(?:naver|google)-site-verification" content="[^"]*"\s*\/>/g, "");
// 조직 · 사이트 · 앱 · FAQ(당구) 구조화 데이터 — 전부 co.kr 을 가리킨다
swap("json-ld", /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");

// 머리에 co.kr 이 한 글자라도 남으면 멈춘다(몸통의 스크립트 · 주석은 따로 본다)
const head = html.slice(0, html.indexOf("</head>"));
const left = head.match(/[^\n]*rankue\.co\.kr[^\n]*/g) ?? [];
if (left.length) throw new Error(`[make-kr-shell] 머리에 co.kr 주소가 남았습니다:\n${left.map((l) => "  " + l.trim().slice(0, 160)).join("\n")}`);

writeFileSync(resolve(dir, "index.kr.html"), html);
const body = (html.slice(html.indexOf("</head>")).match(/rankue\.co\.kr/g) ?? []).length;
console.log(`[make-kr-shell] index.kr.html — 머리 ${steps}곳 고침, 몸통에 남은 co.kr ${body}곳`);
