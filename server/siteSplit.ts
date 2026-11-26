/**
 * 도메인 나누기 — 요청을 받아 가르는 곳(규칙과 까닭은 shared/siteSplit.ts 머리말).
 *
 * 봇 화면은 수십 군데(server/prerender.ts · server/seo/*)에서 나간다. 한 곳씩 고치면 빠뜨린다 — 그래서 **맨 앞 미들웨어 하나**가
 * Host 를 보고 ① 막을 것은 여기서 끝내고 ② 내보낼 것은 res.send 를 감싸 나가는 글(HTML · 사이트맵)을 고친다.
 * registerRoutes 의 첫 줄에서 건다(사이트맵 · 프리렌더보다 먼저).
 *
 * 이 함수에 닿는 요청(Vercel): /api · /og · 사이트맵 · 봇의 모든 화면 요청 · (.kr 만) robots.txt · '/' · 안 여는 주소의 사람 요청.
 * .kr 의 여는 주소를 사람이 열면 여기 오지 않는다 — 정적 셸(index.kr.html)이 나간다(vercel.json).
 */
import type { Express, Request, Response, NextFunction } from "express";
import {
    KR_SITEMAP_SECTIONS, isAssetPath, krAllowed, krHtml, krRobotsTxt, krSitemapIndex, krSitemapXml,
    mainDeindexed, mainNoindexHtml, mainSitemapXml, mainUrlFor, siteOfHost, type Site,
} from "../shared/siteSplit.js";
import { isBot } from "./prerender.js";

/** co.kr 쪽 변경(noindex · 사이트맵 제외)을 끄는 스위치 — 되돌릴 일이 생기면 SITE_SPLIT=off */
export const splitOn = () => process.env.SITE_SPLIT !== "off";

export function siteOfReq(req: Request): Site {
    // Vercel 은 Host 에 사용자가 연 도메인을 그대로 준다. 앞단이 바꿔 주는 환경을 위해 x-forwarded-host 를 먼저 본다
    const fwd = String(req.headers["x-forwarded-host"] ?? "").split(",")[0].trim();
    return siteOfHost(fwd || req.headers.host);
}

const noStore = (res: Response) => res.setHeader("Cache-Control", "no-store");

/** 나가는 글자 응답을 고친다 — 핸들러는 그대로 두고 res.send 만 감싼다(글자가 아닌 응답은 건드리지 않는다) */
function rewriteBody(res: Response, fn: (body: string) => string) {
    const send = res.send.bind(res);
    res.send = ((body?: unknown) => send(typeof body === "string" ? fn(body) : body)) as Response["send"];
}

const SITEMAP_RE = /^\/sitemap(?:-([a-z]+(?:-[a-z]+)*))?\.xml$/;

function krGone(res: Response) {
    noStore(res);
    res.status(404).setHeader("X-Prerender", "kr-404");
    res.send(`<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>페이지를 찾을 수 없습니다 · 랭큐 골프</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>페이지를 찾을 수 없습니다</h1><nav><a href="/golf">랭큐 골프</a> <a href="/golf/courses">전국 골프장</a></nav></main></body>
</html>
`);
}

function krSite(req: Request, res: Response, next: NextFunction) {
    const path = req.path;
    if (path === "/robots.txt") {
        noStore(res);
        return res.type("text/plain; charset=utf-8").send(krRobotsTxt());
    }
    const sm = SITEMAP_RE.exec(path);
    if (sm) {
        // 캐시에 싣지 않는다 — 같은 경로가 도메인에 따라 다른 글이다. CDN 이 co.kr 것을 .kr 에 내주면 사이트맵이 통째로 틀린다
        if (!sm[1]) {
            noStore(res);
            return res.type("application/xml; charset=utf-8").send(krSitemapIndex());
        }
        if (!(KR_SITEMAP_SECTIONS as readonly string[]).includes(sm[1])) return res.status(404).end();
        rewriteBody(res, krSitemapXml);
        const setHeader = res.setHeader.bind(res);
        res.setHeader = ((k: string, v: number | string | readonly string[]) =>
            setHeader(k, k.toLowerCase() === "cache-control" ? "no-store" : v)) as Response["setHeader"];
        return next();
    }
    if (/^\/(?:rss|feed)\.xml$/.test(path)) return res.status(404).end(); // 피드는 당구 소식이다
    if (isAssetPath(path)) return next();
    // 첫 주소 — 골프 홈으로(같은 도메인 안의 이동이라 규칙 2 와 무관하다)
    if (path === "/") {
        noStore(res);
        return res.redirect(301, "/golf");
    }
    if (krAllowed(path)) {
        if (isBot(req)) rewriteBody(res, krHtml);
        return next();
    }
    // 안 여는 주소 — 봇에게는 '없다', 사람은 원래 사이트로(일시 이동 302: 평가를 넘기라는 뜻이 아니다)
    if (isBot(req)) return krGone(res);
    noStore(res);
    return res.redirect(302, mainUrlFor(req.originalUrl));
}

function mainSite(req: Request, res: Response, next: NextFunction) {
    if (!splitOn()) return next();
    const path = req.path;
    if (SITEMAP_RE.test(path)) {
        rewriteBody(res, mainSitemapXml);
        return next();
    }
    if (!isAssetPath(path) && mainDeindexed(path) && isBot(req)) {
        res.setHeader("X-Robots-Tag", "noindex, follow");
        rewriteBody(res, mainNoindexHtml);
    }
    return next();
}

export function registerSiteSplit(app: Express) {
    app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        return siteOfReq(req) === "kr" ? krSite(req, res, next) : mainSite(req, res, next);
    });
}
