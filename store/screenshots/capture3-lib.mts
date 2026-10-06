// 스토어 스크린샷 촬영 공용(1.3, 2026-10-07).
//
// 옛 촬영(capture.py · capture2.py)은 운영에 데모 계정으로 로그인해 운영 DB 에 경기를 만들었다 — 다시 돌리지 않는다.
// 여기서는 로컬 Vite(5177)만 띄우고 /api/** 를 전부 가짜로 답한다. 운영에 로그인하지 않고, 아무것도 쓰지 않는다.
//
//  - 먼저 Vite 를 5177 로 띄운다(진짜 개발 서버 npm run dev 는 띄우지 않는다 — .env 가 운영 DB 를 가리킨다).
//  - 서비스 워커를 막지 않으면 가짜 응답이 무시된다(serviceWorkers: "block").
//  - 뷰포트 440×956 @3배 = 1320×2868(애플 6.9형 원본). 틀·문구는 generate3.mjs 가 입힌다.
//  - 화면에 나오는 사람 이름은 전부 지어낸 별명이다(shared/guestSample 과 같은 결). 실제 선수 사진·실명, 타사 로고,
//    지어낸 가격, 내기 표시는 찍지 않는다(store/1.3-제출-메모.md · reports 의 구성안 (5)).
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = dirname(fileURLToPath(import.meta.url));
export const BASE = process.env.SHOT_BASE || "http://localhost:5177";
export const VIEW = { width: 440, height: 956 };
export const SCALE = 3;
export const RAW_DIR = resolve(DIR, "raw3", "ko");

/** 예시 회원 — 로그인한 회원 상태로 찍는다(비로그인은 '예시' 배지와 가입 안내 띠가 붙는다). */
export const ME_ID = "00000000-0000-4000-8000-000000000001";
export const ME = {
    id: ME_ID, name: "초록큐", nickname: "초록큐", profileImageUrl: null, role: "member", locale: "ko",
    primarySport: "BILLIARDS", sportCategory: "BILLIARDS", golfAccess: true, termsVersion: "9999", gender: "male", birthYear: 1988,
    handi3c: 20, handi4c: 200, rating3c: 1124, rating4c: 1068, avg3c: 0.553, avg4c: 0.681, average: 0.553,
    highRun3c: 5, highRun4c: 7, totalGames: 20, wins: 13, losses: 7,
    golfHandicap: 14, golfAvgScore: 86.4, golfBestScore: 81, totalGolfGames: 9,
    connections: [], createdAt: "2026-03-02T03:00:00.000Z",
};

export type Handler = (r: { path: string; method: string; url: URL; body: any; route: Route }) => unknown | Promise<unknown>;
/** 돌려주면 그대로 내보낸다(성공 봉투로 싸지 않는다) */
export class Raw { constructor(public status: number, public body: unknown) {} }
/** 아무것도 답하지 않고 기본 응답으로 넘긴다 */
export const PASS = Symbol("pass");

export interface Shot { ctx: BrowserContext; page: Page; warns: string[]; errors: string[]; writes: string[]; unknown: Set<string> }

/**
 * 새 컨텍스트 + 가짜 응답. handler 가 PASS 를 돌려주면 기본 응답(회원·읽지 않은 수·빈 목록)으로 넘어간다.
 * 쿼리 캐시가 localStorage 에 남으므로 화면마다 컨텍스트를 새로 만든다.
 */
export async function openShot(browser: Browser, opts: {
    sport: "BILLIARDS" | "GOLF"; me?: Record<string, unknown>; handler?: Handler; storage?: Record<string, string>;
    geolocation?: { latitude: number; longitude: number }; blockImages?: RegExp;
}): Promise<Shot> {
    const me = opts.me ?? ME;
    const ctx = await browser.newContext({
        viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul",
        serviceWorkers: "block", colorScheme: "light",
        ...(opts.geolocation ? { geolocation: opts.geolocation, permissions: ["geolocation"] } : {}),
    });
    const storage = { rankue_locale: "ko", "rankue-locale": "ko", rankue_current_sport: opts.sport, "rankue-intro-seen": "1", "rankue.sim.onboarded": "1", "rankue.sim.reality-hint": "1", ...(opts.storage ?? {}) };
    await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v as string); } catch { /* 저장소가 막힌 곳 */ } }, storage);
    const page = await ctx.newPage();
    const shot: Shot = { ctx, page, warns: [], errors: [], writes: [], unknown: new Set() };
    page.on("console", (m) => {
        const t = m.text();
        if (/same key|Encountered two children|validateDOMNesting|cannot appear as a descendant/i.test(t)) shot.warns.push(t.slice(0, 200));
        else if (m.type() === "error" && !/401|Service ?Worker|Failed to load resource|favicon|net::ERR|AudioContext/i.test(t)) shot.errors.push(t.slice(0, 240));
    });
    page.on("pageerror", (e) => shot.errors.push("pageerror: " + e.message.slice(0, 240)));
    if (opts.blockImages) await page.route(opts.blockImages, (route) => route.abort());
    await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        const path = decodeURIComponent(url.pathname);
        const method = route.request().method();
        let body: any = null;
        try { body = JSON.parse(route.request().postData() || "null"); } catch { /* JSON 이 아닌 본문 */ }
        const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
        const ok = (d: unknown) => json({ success: true, data: d });
        if (method !== "GET") shot.writes.push(`${method} ${path}`);
        if (opts.handler) {
            const out = await opts.handler({ path, method, url, body, route });
            if (out instanceof Raw) return json(out.body, out.status);
            if (out !== PASS) return ok(out);
        }
        if (path === "/api/hiq/me") return ok(me);
        if (method !== "GET") return ok({ ok: true });
        if (path.endsWith("/unread-count") || path.endsWith("/unread")) return ok({ unread: 0, count: 0 });
        if (path === "/api/hiq/presence/arrivals") return ok({ now: new Date().toISOString(), arrivals: [] });
        // 모르는 GET — JSON 이 아니면 화면이 깨지므로 빈 답을 준다. 무엇을 불렀는지는 적어 둔다(화면이 비면 여기부터 본다).
        shot.unknown.add(path);
        const listy = /(s|mine|history|list|rooms|opponents|posts|members|rankings|bookings|joins|photos|footprints|alerts|watches)$/.test(path);
        return ok(listy ? [] : null);
    });
    return shot;
}

/** 화면을 찍는다 — 뷰포트 한 장(1320×2868). 이름은 "01-scoreboard" 처럼. */
export async function capture(shot: Shot, name: string): Promise<string> {
    mkdirSync(RAW_DIR, { recursive: true });
    const out = resolve(RAW_DIR, `${name}.png`);
    await shot.page.screenshot({ path: out });
    return out;
}

/** 찍은 뒤 한 줄 요약 — 경고·오류·쓰기 요청·모르는 GET. 쓰기 요청이 있으면 무엇이었는지 본다(가짜라 실제로 나가지는 않는다). */
export function report(shot: Shot, name: string): void {
    console.log(`[${name}] 경고 ${shot.warns.length} · 오류 ${shot.errors.length} · 쓰기 ${shot.writes.length} · 모르는 GET ${shot.unknown.size}`);
    for (const e of shot.errors.slice(0, 4)) console.log("   오류:", e);
    for (const w of shot.warns.slice(0, 2)) console.log("   경고:", w);
    if (shot.writes.length) console.log("   쓰기:", [...new Set(shot.writes)].slice(0, 6).join(" | "));
    if (shot.unknown.size) console.log("   모르는 GET:", [...shot.unknown].slice(0, 14).join(" | "));
}

export const isoAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
export const dayAgo = (d: number, h = 20) => { const x = new Date(Date.now() - d * 86_400_000); x.setHours(h, 10, 0, 0); return x.toISOString(); };
export { chromium };
