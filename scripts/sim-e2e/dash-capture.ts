/**
 * 시뮬레이터 대시보드 헤드리스 캡처 — 오너 계정(서명 쿠키)으로 진입 화면 → 대시보드 → 대전 섹션.
 * 실행: COOKIE_SECRET 은 .env 에서. `npx tsx scripts/sim-e2e/dash-capture.ts [base]`. 결과 PNG 는 OUT 폴더.
 * 데이터를 만들거나 지우지 않는다(읽기만).
 */
import "dotenv/config";
import { createHmac } from "crypto";
import { mkdirSync } from "fs";
import { chromium } from "playwright";

const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OUT = process.env.OUT || "/private/tmp/claude-501/-Users-choejeonghwan-rankue-app/5779d2d1-b7e1-40c7-9c95-65cf3e0c9ae9/scratchpad/shots";
const MEMBER = process.env.MEMBER_ID || "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET;
if (!secret) throw new Error("COOKIE_SECRET missing");
const sig = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");
const cookieValue = `s:${MEMBER}.${sig(MEMBER)}`;
mkdirSync(OUT, { recursive: true });

// 1) API 그대로 — 대시보드 응답 요약
const r = await fetch(`${BASE}/api/hiq/sim/stats/me`, { headers: { cookie: `hiq_user_id=${encodeURIComponent(cookieValue)}` } });
const j = (await r.json()) as { success: boolean; data?: { ratings: unknown[]; sessions: { status: string; kind: string }[]; ranks: unknown[]; drillWeeks: unknown[]; currentWeekId: string } };
console.log("stats/me", r.status, j.success ? {
  ratings: j.data!.ratings.length, sessions: j.data!.sessions.length,
  finishedSolo: j.data!.sessions.filter((s) => s.status === "finished" && s.kind === "solo").length,
  ranks: j.data!.ranks, drillWeeks: j.data!.drillWeeks.length, week: j.data!.currentWeekId,
} : j);

// 2) 화면
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
await ctx.addCookies([{ name: "hiq_user_id", value: cookieValue, url: BASE }]);
const page = await ctx.newPage();
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ");
await page.goto(`${BASE}/online-game`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-entry="dash"]', { timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/dash-0-entry.png` });
await page.click('[data-entry="dash"]');
await page.waitForFunction(() => /에버리지|기록이 없어요|불러오지/.test(document.body.innerText), null, { timeout: 20000 });
await page.waitForTimeout(900);
console.log("url", page.url());
console.log("dash text", (await text()).slice(0, 700));
await page.screenshot({ path: `${OUT}/dash-1-top.png` });
await page.screenshot({ path: `${OUT}/dash-2-full.png`, fullPage: true });
// 차트 문지르기: 선 그래프 가운데를 누르면 읽기 줄이 그 세션으로
const svg = await page.$('svg[aria-label="세션별 에버리지 선 그래프"]');
if (svg) {
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  const card = await svg.evaluateHandle((el) => el.closest("section")!);
  await (card as any).screenshot({ path: `${OUT}/dash-3-trend-scrub.png` });
  console.log("readout after scrub:", await svg.evaluate((el) => el.parentElement!.querySelector("[aria-live]")!.textContent));
}
// 대전 섹션으로(진입 화면 "내 대전" 경로)
await page.goto(`${BASE}/online-game?dash=1&sec=matches`, { waitUntil: "networkidle" });
await page.waitForFunction(() => /친구와 대전/.test(document.body.innerText), null, { timeout: 20000 });
await page.waitForTimeout(900);
console.log("scrolled to matches:", await page.evaluate(() => { const el = document.getElementById("sim-dash-matches"); return el ? Math.round(el.getBoundingClientRect().top) : null; }));
await page.screenshot({ path: `${OUT}/dash-4-matches.png` });
// 로비: 목록 대신 "내 대전은 대시보드에서" 버튼
await page.goto(`${BASE}/online-game?lobby=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
console.log("lobby has link:", (await text()).includes("내 대전은 대시보드에서"), "| has list heading:", (await text()).includes("내 대전 |"));
await page.screenshot({ path: `${OUT}/dash-5-lobby.png`, fullPage: true });
await browser.close();
