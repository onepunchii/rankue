/**
 * 어드민을 모바일 크기로 열어 확인(읽기만): 메뉴 서랍이 스크롤되어 마지막 항목까지 닿는지, 고르면 닫히는지,
 * 각 탭이 가로로 넘치지 않는지. `npx tsx scripts/sim-e2e/admin-mobile.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { chromium } from "playwright";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OUT = "/private/tmp/claude-501/-Users-choejeonghwan-rankue-app/5779d2d1-b7e1-40c7-9c95-65cf3e0c9ae9/scratchpad/shots";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const raw = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");
const me = (await db.execute(sql`select m.profile_id, p.role from hiq_members m join profiles p on p.id=m.profile_id where m.id=${OWNER}`)).rows[0] as { profile_id: string; role: string };
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
await ctx.addCookies([
  { name: "hiq_partner_auth", value: `s:${me.profile_id}.${raw(me.profile_id)}`, url: BASE },
  { name: "hiq_user_id", value: `s:${OWNER}.${raw(OWNER)}`, url: BASE },
]);
const page = await ctx.newPage();
const errs: string[] = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
try {
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector('button[aria-label="메뉴"]', { timeout: 30000 });
  await page.click('button[aria-label="메뉴"]');
  await page.waitForTimeout(700);
  const nav = page.locator('[role="dialog"] nav').first();   // 데스크탑 사이드바의 nav 는 숨어 있어 크기가 0 이다
  const box = await nav.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, items: el.querySelectorAll("button").length }));
  console.log("   메뉴:", JSON.stringify(box));
  ok(box.items >= 14, `메뉴 항목 ${box.items}개`);
  ok(box.scroll > box.client, "목록이 화면보다 길다(스크롤이 필요한 상황)");
  await nav.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const scrolled = await nav.evaluate((el) => el.scrollTop);
  ok(scrolled > 0, `스크롤된다 (scrollTop ${scrolled})`);
  const last = page.locator('[role="dialog"] nav button', { hasText: "신고/제재" }).first();
  ok(await last.isVisible(), "마지막 항목(신고/제재)이 보인다");
  await page.screenshot({ path: `${OUT}/admin-menu.png` });
  await last.click();                                   // 고르면 서랍이 닫혀야 한다
  await page.waitForTimeout(700);
  ok(!(await page.locator('[role="dialog"] nav').first().isVisible().catch(() => false)), "메뉴를 고르면 서랍이 닫힌다");
  // 탭마다 가로 넘침 확인
  const tabs = ["온라인게임", "회원 관리", "푸시 발송", "매장 리스트", "크루 현황"];
  for (const name of tabs) {
    await page.click('button[aria-label="메뉴"]');
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] nav button', { hasText: name }).first().click();
    await page.waitForTimeout(1200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`   ${name}: 가로 넘침 ${over}px`);
    ok(over <= 1, `${name} 화면이 가로로 안 넘친다`);
    await page.screenshot({ path: `${OUT}/admin-${name}.png` });
  }
  // 넓은 표는 가로로 밀 수 있어야 한다(회원 관리)
  await page.click('button[aria-label="메뉴"]');
  await page.waitForTimeout(500);
  await page.locator('[role="dialog"] nav button', { hasText: "회원 관리" }).first().click();
  await page.waitForTimeout(1500);
  const table = await page.evaluate(() => {
    const box = Array.from(document.querySelectorAll("div")).find((d) => d.className.includes("overflow-x-auto") && d.querySelector("table"));
    if (!box) return null;
    box.scrollLeft = 9999;
    return { scrollW: box.scrollWidth, clientW: box.clientWidth, scrolled: box.scrollLeft };
  });
  console.log("   회원 표:", JSON.stringify(table));
  ok(table && table.scrollW > table.clientW && table.scrolled > 0, "넓은 표를 가로로 밀 수 있다");
  // 온라인게임 탭이 실제로 내용을 그린다(불러오는 중에서 멈추지 않는다)
  await page.click('button[aria-label="메뉴"]');
  await page.waitForTimeout(500);
  await page.locator('[role="dialog"] nav button', { hasText: "온라인게임" }).first().click();
  await page.waitForFunction(() => !/불러오는 중/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => undefined);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 160);
  console.log("   온라인게임 탭:", text);
  ok(!/불러오는 중/.test(text), "온라인게임 탭이 내용을 보여 준다");
  await page.screenshot({ path: `${OUT}/admin-online-game.png` });
  ok(errs.length === 0, `콘솔 오류 없음 ${JSON.stringify(errs.slice(0, 2))}`);
  console.log("ALL OK");
} finally {
  await b.close();
}
process.exit(0);
