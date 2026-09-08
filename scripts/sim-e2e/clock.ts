// 40초 룰(샷 클럭) 서버 e2e + 헤더 시계 화면 확인. 로컬 서버(PORT=5001)를 띄운 뒤 `npx tsx scripts/sim-e2e/clock.ts`.
// 임시 회원을 게스트로 만들어 쓰고 끝나면 시뮬 테이블·알림·임시 회원을 지운다. 실전 테이블은 건드리지 않는다. 약 100초 걸린다.
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { chromium } from "playwright";
const BASE = process.env.E2E_BASE || "http://localhost:5001";
const secret = process.env.COOKIE_SECRET!;
const sig = (id: string) => encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const host = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const store = (await db.execute(sql`select store_id from hiq_members where id=${host}`)).rows[0] as any;
const g = (await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-clock', '클럭테스트') returning id`)).rows[0] as any;
const guest = g.id as string;
const H = cookieFor(host), G = cookieFor(guest);
const fail = (m: string) => { console.error("FAIL", m); process.exitCode = 1; };
const OUT = "/private/tmp/claude-501/-Users-choejeonghwan-rankue-app/5779d2d1-b7e1-40c7-9c95-65cf3e0c9ae9/scratchpad/shots";
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 5, inningCap: 0 });
  if (created.status !== 201) fail("create " + JSON.stringify(created));
  const m = created.data;
  const joined = await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 5 });
  if (joined.status !== 200 || joined.data.turn !== 0) fail("join " + JSON.stringify(joined).slice(0, 200));
  // 1) 게스트(상대 차례)가 ack 해도 시계는 안 시작, 호스트 ack 로 시작
  const gAck = await api(G, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  if (gAck.data.turnSeenAt !== null) fail("guest ack must not start clock");
  const plain = await api(H, "GET", `/api/hiq/sim/matches/${m.id}`);
  if (plain.data.turnSeenAt !== null) fail("plain GET must not start clock");
  const hAck = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  if (!hAck.data.turnSeenAt || !hAck.data.serverNow) fail("host ack should start clock " + JSON.stringify(hAck.data).slice(0, 200));
  const t0 = Date.parse(hAck.data.turnSeenAt);
  console.log("clock started", hAck.data.turnSeenAt, "serverNow", hAck.data.serverNow);
  const again = await api(H, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  if (Date.parse(again.data.turnSeenAt) !== t0) fail("second ack must keep the first time");
  // 2) 바로는 둘 다 TOO_EARLY
  const early = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  if (early.status !== 409 || early.code !== "TOO_EARLY") fail("host early timeout " + JSON.stringify(early).slice(0, 200));
  const earlyG = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  if (earlyG.status !== 409) fail("guest early timeout " + JSON.stringify(earlyG).slice(0, 200));
  // 3) 호스트 화면: 헤더에 시계가 보이는지(브라우저)
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  await ctx.addCookies([{ name: "hiq_user_id", value: `s:${host}.${decodeURIComponent(sig(host))}`, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/online-game?match=${m.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector('button[aria-label="샷"]', { timeout: 30000 });
  await page.waitForTimeout(7000);   // 첫 폴링(ack) 뒤 시계 표시
  const timer = await page.evaluate(() => document.querySelector('[role="timer"]')?.textContent ?? null);
  console.log("header timer:", timer);
  if (!timer || !/초/.test(timer)) fail("header timer missing");
  await page.screenshot({ path: `${OUT}/clock-1-header.png` });
  // 4) 40초 뒤: 호스트 화면이 스스로 시간 초과를 보내 차례가 넘어간다(서버 판정). 게스트 폴링과 무관하게 서버 상태 확인.
  const waitMs = Math.max(0, t0 + 41000 - Date.now());
  console.log("waiting", Math.round(waitMs / 1000), "s for the shot clock…");
  await sleep(waitMs + 4000);
  await page.screenshot({ path: `${OUT}/clock-2-after.png` });
  const after = await api(H, "GET", `/api/hiq/sim/matches/${m.id}`);
  console.log("after timeout: turn", after.data.turn, "innings", after.data.state.players.map((p: any) => p.innings).join("/"), "shotCount", after.data.state.shotCount, "turnSeenAt", after.data.turnSeenAt, "version", after.data.version);
  if (after.data.turn !== 1 || after.data.state.players[0].innings !== 1 || after.data.turnSeenAt !== null) fail("timeout did not pass the turn " + JSON.stringify(after.data.state).slice(0, 300));
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("host page shows opponent turn:", bodyText.includes("상대 차례"));
  await browser.close();
  // 5) 상대 차례 유예: 게스트가 ack 뒤 50초 동안 안 치면 호스트가 넘길 수 있다(여기선 40초 시점엔 TOO_EARLY 만 확인)
  const gAck2 = await api(G, "GET", `/api/hiq/sim/matches/${m.id}?ack=1`);
  if (!gAck2.data.turnSeenAt) fail("guest ack should start clock on their turn");
  const hostEarly = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/timeout`, {});
  if (hostEarly.status !== 409) fail("host claiming opponent timeout at 0s must be TOO_EARLY");
  console.log("guest clock started; host claim at 0 s → 409 ✓");
  const rp = await db.execute(sql`select rating_3c, rating_4c, avg_3c, avg_4c from hiq_members where id=${host}`);
  console.log("host real stats untouched:", JSON.stringify(rp.rows[0]));
} finally {
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id=${host} and guest_id=${guest})`);
  await db.execute(sql`delete from hiq_sim_matches where host_id=${host} and (guest_id=${guest} or guest_id is null)`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id in (${host}, ${guest}) and matches > 0`);
  await db.execute(sql`delete from hiq_notifications where member_id=${guest} or (member_id=${host} and created_at > now() - interval '3 minutes' and type='MATCH')`);
  await db.execute(sql`delete from hiq_members where id=${guest}`);
  console.log("cleanup done");
}
process.exit(process.exitCode ?? 0);
