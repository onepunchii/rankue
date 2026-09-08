/**
 * 대시보드 캡처(연습 기록이 있는 모습) — 임시 회원을 만들어 마친 솔로 세션 16개·성적 행·드릴 시도를 hiq_sim_* 에만 넣고,
 * 그 회원의 서명 쿠키로 대시보드를 찍은 뒤 전부 지운다(실전 테이블은 건드리지 않는다). 실행: `npx tsx scripts/sim-e2e/dash-seed-capture.ts [base]`.
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { chromium } from "playwright";
import { TABLES, drillsForWeek, weekIdFor } from "../../shared/sim/index";
import { DEFAULT_3C_RULES, createSession } from "../../shared/sim/rules/index";
import { openingLayout } from "../../shared/sim/layouts";

const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OUT = process.env.OUT || "/private/tmp/claude-501/-Users-choejeonghwan-rankue-app/5779d2d1-b7e1-40c7-9c95-65cf3e0c9ae9/scratchpad/shots";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");

const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const g = (await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, '000-e2e-dash', '대시보드테스트') returning id`)).rows[0] as { id: string };
const id = g.id;
console.log("temp member", id);
try {
  const rules = JSON.stringify(DEFAULT_3C_RULES);
  const state = JSON.stringify(createSession({ rules: DEFAULT_3C_RULES, players: [{ id, target: 15 }] }));
  const balls = JSON.stringify(openingLayout("3c", TABLES.DAEDAE, "white"));
  const scores = [3, 4, 5, 4, 6, 7, 5, 8, 9, 7, 10, 11, 9, 12, 10, 13];
  const runs = [1, 1, 2, 1, 2, 3, 2, 3, 3, 2, 4, 3, 3, 5, 4, 4];
  const now = Date.now();
  let total = 0;
  for (let i = 0; i < scores.length; i++) {
    const at = new Date(now - (scores.length - i) * 86_400_000 - 3_600_000);
    const fin = new Date(at.getTime() + 1_800_000);
    total += scores[i];
    await db.execute(sql`insert into hiq_sim_sessions (member_id, kind, game_type, table_id, rules, state, balls, target_score, score, innings, high_run, shots, status, engine_version, params_hash, started_at, finished_at)
      values (${id}, 'solo', '3c', 'DAEDAE', ${rules}::jsonb, ${state}::jsonb, ${balls}::jsonb, 15, ${scores[i]}, 20, ${runs[i]}, ${scores[i] + 20}, 'finished', 'e2e', 'e2e', ${at.toISOString()}::timestamp, ${fin.toISOString()}::timestamp)`);
  }
  await db.execute(sql`insert into hiq_sim_ratings (member_id, game_type, table_id, sessions, total_score, total_innings, best_avg, best_high_run, sim_rating, matches, wins)
    values (${id}, '3c', 'DAEDAE', ${scores.length}, ${total}, ${scores.length * 20}, ${13 / 20}, 5, 1000, 0, 0)`);
  const thisWeek = weekIdFor(now), lastWeek = weekIdFor(now - 7 * 86_400_000), twoAgo = weekIdFor(now - 14 * 86_400_000);
  const seed = async (weekId: string, n: number, ok: number) => {
    const ds = drillsForWeek(weekId);
    for (let k = 0; k < n; k++) {
      await db.execute(sql`insert into hiq_sim_drill_attempts (member_id, week_id, drill_id, table_id, input, hash, success, cushions, outcome_code, engine_version)
        values (${id}, ${weekId}, ${ds[k].id}, 'DAEDAE', '{}'::jsonb, 'e2e', ${k < ok}, ${k < ok ? 3 : 0}, 'e2e', 'e2e')`);
    }
  };
  await seed(twoAgo, 5, 2); await seed(lastWeek, 5, 4); await seed(thisWeek, 3, 2);

  const cookieValue = `s:${id}.${sig(id)}`;
  const r = await fetch(`${BASE}/api/hiq/sim/stats/me`, { headers: { cookie: `hiq_user_id=${encodeURIComponent(cookieValue)}` } });
  const j = (await r.json()) as { data: { ranks: unknown[]; sessions: unknown[]; drillWeeks: unknown[] } };
  console.log("stats/me", r.status, "sessions", j.data.sessions.length, "ranks", JSON.stringify(j.data.ranks), "drillWeeks", j.data.drillWeeks.length);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  await ctx.addCookies([{ name: "hiq_user_id", value: cookieValue, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/online-game?dash=1`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-hero]", { timeout: 20000 });
  await page.waitForTimeout(900);
  console.log("dash text", (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 520));
  await page.screenshot({ path: `${OUT}/dash-seed-1-top.png` });
  await page.screenshot({ path: `${OUT}/dash-seed-2-full.png`, fullPage: true });
  const svg = await page.$('svg[aria-label="세션별 에버리지 선 그래프"]');
  const box = (await svg!.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  const card = await svg!.evaluateHandle((el) => el.closest("section")!);
  await (card as any).screenshot({ path: `${OUT}/dash-seed-3-scrub.png` });
  console.log("readout after scrub:", await svg!.evaluate((el) => el.parentElement!.querySelector("[aria-live]")!.textContent));
  await browser.close();
} finally {
  await db.execute(sql`delete from hiq_sim_drill_attempts where member_id=${id}`);
  await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
  await db.execute(sql`delete from hiq_sim_shots where session_id in (select id from hiq_sim_sessions where member_id=${id})`);
  await db.execute(sql`delete from hiq_sim_sessions where member_id=${id}`);
  await db.execute(sql`delete from hiq_members where id=${id}`);
  const left = (await db.execute(sql`select (select count(*) from hiq_sim_sessions where member_id=${id}) s, (select count(*) from hiq_members where id=${id}) m`)).rows[0];
  console.log("cleanup", JSON.stringify(left));
}
process.exit(0);
