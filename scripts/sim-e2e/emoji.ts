/**
 * 이모지 인사 e2e: 상대에게 보내면 상대 폴링에 실려 오고, 5초 안에 또 보내면 거부(429 TOO_FAST),
 * 정해진 여섯 개가 아니면 400, 한 대전 10회를 넘기면 거부. 끝나면 전부 정리.
 * `npx tsx scripts/sim-e2e/emoji.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { EMOJI_MAX_PER_MATCH } from "../../shared/sim/rules";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as any;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (c: unknown, m: string) => { if (!c) throw new Error("ASSERT " + m); console.log("ok  ", m); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as any;
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as any).id as string;
const host = await mk("000-e2e-emo-h", "이모지호스트"), guest = await mk("000-e2e-emo-g", "이모지게스트");
const H = cookieFor(host), G = cookieFor(guest);
try {
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15 });
  const m = created.data;
  await api(G, "POST", `/api/hiq/sim/matches/code/${m.code}/join`, { target: 15 });
  const bad = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/emoji`, { code: "🤬" });
  ok(bad.status === 400, "정해진 인사가 아니면 거부");
  const sent = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/emoji`, { code: "hi" });
  ok(sent.status === 200 && sent.data.emoji?.code === "hi" && sent.data.emoji?.from === 0, `보내기 (${JSON.stringify(sent.data?.emoji)})`);
  const seen = await api(G, "GET", `/api/hiq/sim/matches/${m.id}`);
  ok(seen.data.emoji?.code === "hi" && seen.data.emoji?.from === 0, "상대 화면(폴링)에 그대로 온다");
  const fast = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/emoji`, { code: "nice" });
  ok(fast.status === 429 && fast.code === "TOO_FAST", "5초 안에 또 보내면 거부");
  const other = await api(G, "POST", `/api/hiq/sim/matches/${m.id}/emoji`, { code: "wow" });
  ok(other.status === 200 && other.data.emoji?.from === 1, "상대는 바로 보낼 수 있다(사람별 간격)");
  // 횟수 상한
  let blocked = false;
  for (let i = 0; i < EMOJI_MAX_PER_MATCH + 2; i++) {
    await sleep(5100);
    const r = await api(H, "POST", `/api/hiq/sim/matches/${m.id}/emoji`, { code: "fight" });
    if (r.status === 429 && r.code === "LIMIT") { blocked = true; console.log(`   ${i + 2}번째에서 상한`); break; }
  }
  ok(blocked, `한 대전 ${EMOJI_MAX_PER_MATCH}회를 넘기면 거부`);
  console.log("ALL OK");
} finally {
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
