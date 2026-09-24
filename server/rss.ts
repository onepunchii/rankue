import type { Express } from "express";
import { storage } from "./storage/index.js";
import { briefingTitle, briefingDesc, todayKst } from "../shared/briefingMeta.js";

// RSS 2.0 피드 — 네이버 서치어드바이저 "RSS 제출"용.
//
// 왜 필요한가: /rss.xml 은 라우트가 없어 SPA 폴백이 HTML 을 200 으로 돌려주고 있었다
// (2026-08-18 실측). 네이버에 제출해도 피드로 인식되지 않는다. 네이버는 사이트맵보다
// RSS 를 자주 확인하므로, 매일 바뀌는 콘텐츠(브리핑·커뮤니티)를 여기에 싣는 게
// 신규 페이지 수집을 앞당기는 가장 싼 수단이다.
//
// 사이트맵과의 역할 분담: 사이트맵은 "전체 URL 목록"(3,670개), RSS 는 "최근에 바뀐 것".
// 그래서 여기엔 선수·매장 같은 정적 대량 페이지를 넣지 않는다.

const ORIGIN = "https://www.rankue.co.kr";
const BOARD_KO: Record<string, string> = { brag: "한 큐 자랑", ask: "물어보기", store: "우리 매장", lesson: "레슨" };

function esc(s: unknown): string {
    return String(s ?? "").replace(/[<>&'"]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

/** 본문에서 미리보기 한 줄 — 개행·공백 정리 후 자른다. */
function excerpt(s: string, n = 160): string {
    const flat = String(s ?? "").replace(/\s+/g, " ").trim();
    return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

interface Item { title: string; link: string; desc: string; date: Date; guid: string; }

function renderItem(i: Item): string {
    return `    <item>
      <title>${esc(i.title)}</title>
      <link>${esc(i.link)}</link>
      <guid isPermaLink="false">${esc(i.guid)}</guid>
      <pubDate>${i.date.toUTCString()}</pubDate>
      <description>${esc(i.desc)}</description>
    </item>`;
}

export async function generateRss(): Promise<string> {
    const items: Item[] = [];

    // 1) 오늘의 브리핑 한 건 — 링크는 색인되는 /briefing 한 장.
    // 날짜별 /briefing/:date 는 noindex 라(2026-09-18) 피드에 실으면 "제출했는데 noindex" 경고만 쌓인다(2026-09-24).
    // guid 는 날짜별로 달라 네이버가 매일 새 글로 보고 /briefing 을 다시 가져간다.
    try {
        const d = todayKst();
        const b = await storage.umb.getBriefing(d).catch(() => null);
        if (b) {
            items.push({
                title: briefingTitle(d),
                link: `${ORIGIN}/briefing`,
                desc: briefingDesc(b as any, d),
                date: new Date(`${d}T00:00:00Z`),
                guid: `briefing-${d}`,
            });
        }
    } catch (e) {
        console.warn("[rss] briefing failed:", (e as Error)?.message);
    }

    // 2) 커뮤니티 최신 글 — 블라인드 제외(사이트맵과 같은 기준)
    try {
        const posts = await storage.community.getPostsForRss(30);
        for (const p of posts as any[]) {
            const board = BOARD_KO[p.board] ?? "커뮤니티";
            items.push({
                title: p.title?.trim() || `[${board}] ${excerpt(p.content, 40)}`,
                link: `${ORIGIN}/community/${p.id}`,
                desc: excerpt(p.content),
                date: new Date(p.createdAt),
                guid: `post-${p.id}`,
            });
        }
    } catch (e) {
        console.warn("[rss] community failed:", (e as Error)?.message);
    }

    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = items[0]?.date ?? new Date(`${todayKst()}T00:00:00Z`);

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>랭큐 RANKUE — 당구 브리핑 · 커뮤니티</title>
    <link>${ORIGIN}/</link>
    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml" />
    <description>손안의 당구 점수판 랭큐. 매일의 당구 브리핑과 커뮤니티 새 글을 전합니다.</description>
    <language>ko</language>
    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>
${items.slice(0, 50).map(renderItem).join("\n")}
  </channel>
</rss>
`;
}

export function registerRss(app: Express) {
    // /feed.xml 은 별칭 — 네이버·구글리더류가 관행적으로 둘 다 찾는다.
    const handler = async (_req: unknown, res: any) => {
        try {
            const xml = await generateRss();
            res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");
            res.send(xml);
        } catch (e) {
            console.error("[rss] error:", e);
            res.status(500).send("rss error");
        }
    };
    app.get("/rss.xml", handler);
    app.get("/feed.xml", handler);
}
