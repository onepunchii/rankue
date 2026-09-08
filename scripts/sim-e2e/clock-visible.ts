/**
 * 40초 시계가 실제로 뜨는지 브라우저로 확인(2026-09-08 오너 확인 요청).
 *  (1) 상대 샷 뒤 재생 여유(10 s) 동안엔 시계를 안 그린다 → 그 뒤 40부터 줄어든다
 *  (2) 창을 포커스·전환하지 않아도 시계가 뜬다(조준 중 폴링으로 ack 가 걸린다)
 * 임시 회원 둘을 만들어 확인하고 전부 지운다. `npx tsx scripts/sim-e2e/clock-visible.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { chromium } from "playwright";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const raw = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${encodeURIComponent(raw(id))}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; data?: any; message?: string };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;
const host = await mk("000-e2e-vis-h", "시계호스트"), guest = await mk("000-e2e-vis-g", "시계게스트");
const H = cookieFor(host), G = cookieFor(guest);
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  await ctx.addCookies([{ name: "hiq_user_id", value: `s:${guest}.${raw(guest)}`, url: BASE }]);
  const page = await ctx.newPage();
  // 고리 안엔 눈에 보이는 숫자와 읽기 도우미용 "40초" 가 함께 있다 — 보이는 숫자만 읽는다
  const timer = () => page.evaluate(() => {
    const el = document.querySelector('[role="timer"]');
    if (!el) return null;
    const span = Array.from(el.querySelectorAll("span")).find((s) => !s.className.includes("sr-only"));
    return (span?.textContent ?? "").trim() || null;
  });
  // 게스트 화면을 연다(호스트 차례라 대기). 이 뒤로 포커스·탭 전환을 하지 않는다.
  await page.goto(`${BASE}/online-game?match=${m.id}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => /상대 차례/.test(document.body.innerText), null, { timeout: 30000 });
  ok(true, "게스트 화면 진입(상대 차례)");
  // 호스트가 헛샷 → 게스트 차례. 게스트는 화면을 보고 있으므로 서버가 '샷 + 재생 여유 10 s' 로 시계를 적는다.
  const t0 = Date.now();
  const shot = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/shots`, { idx: 0, input: { cueBallId: "white", phi: Math.PI / 2, V0: 2, a: 0, b: 0, theta: 0 } });
  ok(shot.status === 200 && shot.data.turn === 1, `호스트 샷 → 게스트 차례 (${shot.status})`);
  const seen: { at: number; text: string | null }[] = [];
  while (Date.now() - t0 < 26000) { seen.push({ at: Math.round((Date.now() - t0) / 1000), text: await timer() }); await sleep(1000); }
  console.log("   초별 시계:", seen.map((s) => `${s.at}s:${s.text ?? "-"}`).join(" "));
  const early = seen.filter((s) => s.at <= 8);
  ok(early.every((s) => s.text === null), "재생 여유(10초) 동안엔 시계를 안 그린다");
  const shown = seen.filter((s) => s.text !== null);
  ok(shown.length > 0, "여유가 끝나면 시계가 뜬다(창을 만지지 않았는데도)");
  const nums = shown.map((s) => Number(s.text)).filter((n) => Number.isFinite(n));
  ok(nums[0] <= 40 && nums[0] >= 36, `처음 보이는 값이 40 근처 (${nums[0]})`);
  ok(nums[nums.length - 1] < nums[0], `줄어든다 (${nums[0]} → ${nums[nums.length - 1]})`);
  console.log("ALL OK");
} finally {
  if (browser) await browser.close();
  await sleep(500);
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}) or guest_id in (${host}, ${guest})`);
  for (const id of [host, guest]) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    // 브라우저로 앱을 열면 방문 기록이 남는다(GET /me → hiq_visit_logs) — 회원보다 먼저 지운다
    await db.execute(sql`delete from hiq_visit_logs where member_id=${id}`);
    for (let i = 0; i < 5; i++) { try { await db.execute(sql`delete from hiq_notifications where member_id=${id}`); await db.execute(sql`delete from hiq_members where id=${id}`); break; } catch (e) { if (i === 4) throw e; await sleep(800); } }
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where id in (${host}, ${guest})`)).rows[0] as { n: number }).n);
}
process.exit(0);
