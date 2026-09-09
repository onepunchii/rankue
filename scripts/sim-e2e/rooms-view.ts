/** 멀티방 목록에 방이 있을 때의 화면 확인(임시 방을 만들고 캡처한 뒤 지운다). `npx tsx scripts/sim-e2e/rooms-view.ts [base]` */
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
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as any).id as string;
const hosts = [await mk("000-e2e-rv-1", "김선수"), await mk("000-e2e-rv-2", "박고수"), await mk("000-e2e-rv-3", "이당구")];
let b: any = null;
try {
  const setup = [{ gameType: "3c", tableId: "DAEDAE", target: 15 }, { gameType: "4c", tableId: "JUNGDAE_KR", target: 30, password: "1234" }, { gameType: "3c", tableId: "JUNGDAE_KR", target: 20 }];
  for (let i = 0; i < hosts.length; i++) {
    await fetch(`${BASE}/api/hiq/sim/matches`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `hiq_user_id=s%3A${hosts[i]}.${encodeURIComponent(raw(hosts[i]))}` },
      body: JSON.stringify({ ...setup[i], isPublic: true }),
    });
  }
  b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  await ctx.addCookies([{ name: "hiq_user_id", value: `s:${OWNER}.${raw(OWNER)}`, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/online-game?rooms=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => /김선수|박고수|이당구/.test(document.body.innerText), null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/arcade-rooms-full.png`, fullPage: true });
  console.log("캡처 완료");
} finally {
  if (b) await b.close();
  for (const id of hosts) await db.execute(sql`delete from hiq_sim_matches where host_id=${id}`);
  await db.execute(sql`delete from hiq_notifications where title = '멀티방이 열렸어요' and created_at > now() - interval '10 minutes'`);
  for (const id of hosts) {
    await db.execute(sql`delete from hiq_visit_logs where member_id=${id}`);
    await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
    await db.execute(sql`delete from hiq_members where id=${id}`);
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int n from hiq_members where phone like '000-e2e-rv-%'`)).rows[0] as any).n);
}
process.exit(0);
