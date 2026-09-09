/**
 * 이모지가 화면에 실제로 보이는지 브라우저 둘(방장·게스트)로 확인. 보내기 버튼 위치와 받은 표시까지 본다.
 * `npx tsx scripts/sim-e2e/emoji-ui.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:5001";
const OUT = "/private/tmp/claude-501/-Users-choejeonghwan-rankue-app/5779d2d1-b7e1-40c7-9c95-65cf3e0c9ae9/scratchpad/shots";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const raw = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${encodeURIComponent(raw(id))}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as any;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as any).id as string;
const host = await mk("000-e2e-eui-h", "이모지방장"), guest = await mk("000-e2e-eui-g", "이모지손님");
let browser: any = null;
try {
  const created = await api(cookieFor(host), "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(cookieFor(guest), "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const open = async (id: string, tag: string) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
    await ctx.addCookies([{ name: "hiq_user_id", value: `s:${id}.${raw(id)}`, url: BASE }]);
    const page = await ctx.newPage();
    page.on("response", async (res) => {
      if (tag === "손님" && res.url().includes(`/sim/matches/${m.id}`) && res.request().method() === "GET") {
        const j: any = await res.json().catch(() => null);
        if (j?.data) console.log(`   [손님 폴링] emoji=${JSON.stringify(j.data.emoji)} version=${j.data.version}`);
      }
    });
    await page.goto(`${BASE}/online-game?match=${m.id}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => /이모지/.test(document.body.innerText) || document.querySelector('[aria-label="인사 보내기"]') !== null, null, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    console.log(`[${tag}] 보내기 버튼:`, await page.locator('button[aria-label="인사 보내기"]').count());
    return page;
  };
  const hp = await open(host, "방장");
  const gp = await open(guest, "손님");
  await hp.screenshot({ path: `${OUT}/emoji-host-before.png` });
  // 방장이 인사 보내기
  const btn = hp.locator('button[aria-label="인사 보내기"]').first();
  if (await btn.count() === 0) throw new Error("보내기 버튼이 화면에 없다");
  await btn.click();
  await hp.waitForTimeout(400);
  await hp.screenshot({ path: `${OUT}/emoji-open.png` });
  const hi = hp.locator('button[aria-label="하이"]').first();
  console.log("펼친 뒤 하이 버튼:", await hi.count());
  await hi.click();
  await hp.waitForTimeout(1500);
  await hp.screenshot({ path: `${OUT}/emoji-sent.png` });
  // 손님 화면에 뜨는지(폴링)
  const seen = await gp.waitForFunction(() => document.body.innerHTML.includes("👋"), null, { timeout: 15000 }).then(() => true).catch(() => false);
  console.log("손님 폴링 횟수 확인용 대기 끝");
  console.log("손님 화면에 표시:", seen);
  await gp.screenshot({ path: `${OUT}/emoji-received.png` });
  const where = await gp.evaluate(() => {
    const el = Array.from(document.querySelectorAll("span")).find((s) => s.textContent === "👋");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), visible: r.width > 0 && r.y >= 0 && r.y < 812 };
  });
  console.log("표시 위치:", JSON.stringify(where));
} finally {
  if (browser) await browser.close();
  await sleep(300);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    await db.execute(sql`delete from hiq_visit_logs where member_id=${id}`);
    await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
    await db.execute(sql`delete from hiq_members where id=${id}`);
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int n from hiq_members where id in (${host}, ${guest})`)).rows[0] as any).n);
}
process.exit(0);
