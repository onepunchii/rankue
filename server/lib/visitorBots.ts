/**
 * 방문자 발자국용 봇 판별(2026-10-08) — 폴리(server/lib/bots.ts)에서 실측으로 다듬은 것을 옮겼다.
 *
 * ⚠️ prerender.ts 의 BOT_RE 와 **목적이 반대라** 재사용하지 않는다.
 * 그쪽은 "프리렌더된 HTML 을 줄 대상"을 고른다 — 넓게 잡아도 손해가 없다.
 * 여기는 "손님 수에서 뺄 대상"을 고른다 — 잘못 걸리면 **사람이 통계에서 사라진다**.
 *
 * 그래서 순서가 중요하다 — **인앱브라우저를 먼저 통과시키고** 그다음 봇을 본다.
 * (카카오톡·네이버 앱·다음 앱·라인에서 링크를 눌러 들어오는 사람이 한국에서 많다. UA 에 앱사 이름이 들어가 봇 패턴과 겹친다.)
 */

const IN_APP_RE =
    // KAKAOTALK 뒤에 하이픈이 오면 안 된다 — 인앱브라우저는 `KAKAOTALK 10.5.5`(공백)이고 `kakaotalk-scrap` 은 링크 미리보기 스크래퍼다.
    /(KAKAOTALK(?!-)|NAVER\(inapp|DaumApps|Line\/\d|Instagram|FBAV|FB_IAB|everytimeApp|Whale)/i;

const BOT_UA_RE = new RegExp([
    // 검색엔진
    "Googlebot", "Google-InspectionTool", "Storebot-Google", "AdsBot-Google", "Google-Extended",
    "bingbot", "Yeti", "Daumoa", "NaverBot", "Applebot", "Baiduspider", "DuckDuckBot",
    // Yandex 는 이름 사이에 다른 낱말이 낀다(YandexRenderResourcesBot). "Yandex" 로 넓히면 얀덱스 검색앱 사용자가 봇이 된다.
    "Yandex\\w*Bot",
    // 링크 미리보기 (사람이 아니다 — 카톡에 링크를 붙이면 이게 먼저 온다)
    "kakaotalk-scrap", "facebookexternalhit", "Facebot", "Twitterbot", "LinkedInBot",
    "Slackbot", "TelegramBot", "Discordbot", "SkypeUriPreview", "redditbot", "Pinterest",
    // AI 크롤러
    "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "Claude-User", "anthropic-ai",
    "PerplexityBot", "Perplexity-User", "CCBot", "Bytespider", "Amazonbot", "Applebot-Extended", "meta-externalagent", "cohere-ai",
    // 헤드리스·스크립트 — localStorage 가 매번 비어 새 방문자 ID 를 만드는 주범
    "HeadlessChrome", "PhantomJS", "Puppeteer", "Playwright", "Selenium",
    "python-requests", "aiohttp", "httpx", "Go-http-client", "node-fetch", "axios",
    "curl/", "Wget", "libwww-perl", "Apache-HttpClient", "okhttp", "Java/",
    // 모니터링
    "UptimeRobot", "Pingdom", "StatusCake", "Better Uptime", "Lighthouse", "Chrome-Lighthouse",
    // 일반형 — 이름을 모르는 것까지
    "\\bbot\\b", "\\bbots\\b", "spider", "crawl", "scrap",
].join("|"), "i");

/** 이 요청을 발자국에서 뺄 것인가 */
export function isBotUA(ua: unknown): boolean {
    const s = String(ua ?? "");
    if (!s) return true;                  // UA 없는 요청은 브라우저가 아니다
    if (IN_APP_RE.test(s)) return false;  // 인앱브라우저는 사람이다 — 봇 검사보다 먼저
    return BOT_UA_RE.test(s);
}
