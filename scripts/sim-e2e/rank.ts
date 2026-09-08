/**
 * 랭킹 e2e: 임시 회원 넷(KR·KR·MX 배치 완료 + 배치 전 1명)의 성적 행을 hiq_sim_ratings 에 넣고 GET /sim/rank 전체·국가별, PATCH /me country 를 확인한 뒤 전부 지운다.
 * `npx tsx scripts/sim-e2e/rank.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (id: string) => encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; data?: any };
}
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("ASSERT " + msg); console.log("ok  ", msg); };
const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string, country: string | null) =>
  ((await db.execute(sql`insert into hiq_members (store_id, phone, name, country) values (${store.store_id}, ${phone}, ${name}, ${country}) returning id`)).rows[0] as { id: string }).id;
const a = await mk("000-e2e-rank-a", "랭커A", "KR"), b = await mk("000-e2e-rank-b", "랭커B", "KR"), c = await mk("000-e2e-rank-c", "랭커C", "MX"), d = await mk("000-e2e-rank-d", "배치중D", null);
const ids = [a, b, c, d];
try {
  const put = (id: string, rating: number, matches: number, wins: number) => db.execute(sql`insert into hiq_sim_ratings (member_id, game_type, table_id, sim_rating, matches, wins) values (${id}, '3c', 'DAEDAE', ${rating}, ${matches}, ${wins})`);
  await put(a, 1200, 5, 4); await put(b, 1100, 4, 2); await put(c, 1150, 3, 2); await put(d, 1030, 1, 1);
  const all = await api(cookieFor(d), "GET", "/api/hiq/sim/rank?gameType=3c&tableId=DAEDAE");
  const mine = (all.data.rows as any[]).filter((r) => ids.includes(r.memberId));
  assert(all.status === 200 && mine.map((r) => r.name).join(",") === "랭커A,랭커C,랭커B", `전체 순서 A(1200) C(1150) B(1100): ${mine.map((r) => r.name).join(",")}`);
  const ranks = new Map(mine.map((r) => [r.name, r]));
  assert(ranks.get("랭커A").rank < ranks.get("랭커C").rank && ranks.get("랭커C").rank < ranks.get("랭커B").rank, "전역 순위가 단조");
  assert(ranks.get("랭커A").countryRank === 1 && ranks.get("랭커B").countryRank === 2 && ranks.get("랭커C").countryRank === 1, "국가 순위 KR 1·2, MX 1");
  assert(all.data.me && all.data.me.matches === 1 && all.data.me.rank === null && all.data.me.rating === 1030, "배치 전 회원의 me: 순위 없음·레이팅 있음");
  assert((all.data.countries as any[]).some((x) => x.country === "MX" && x.players >= 1), "국가 목록에 MX");
  const kr = await api(cookieFor(d), "GET", "/api/hiq/sim/rank?gameType=3c&tableId=DAEDAE&country=KR");
  const krMine = (kr.data.rows as any[]).filter((r) => ids.includes(r.memberId));
  assert(krMine.length === 2 && krMine.every((r) => r.country === "KR") && krMine[0].rank === ranks.get("랭커A").rank, "KR 필터: 두 명, 전역 순위 유지");
  const patch = await api(cookieFor(d), "PATCH", "/api/hiq/me", { country: "vn" });
  const after = (await db.execute(sql`select country from hiq_members where id=${d}`)).rows[0] as { country: string };
  assert(patch.status === 200 && after.country === "VN", "PATCH /me country → VN(대문자)");
  const bad = await api(cookieFor(d), "PATCH", "/api/hiq/me", { country: "korea" });
  const still = (await db.execute(sql`select country from hiq_members where id=${d}`)).rows[0] as { country: string };
  assert(bad.status === 200 && still.country === "VN", "잘못된 국가 코드는 무시");
  console.log("ALL OK");
} finally {
  for (const id of ids) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
    await db.execute(sql`delete from profiles where id in (select profile_id from hiq_members where id=${id} and profile_id is not null)`).catch(() => undefined);
    await db.execute(sql`delete from hiq_members where id=${id}`);
  }
  console.log("cleanup left:", ((await db.execute(sql`select count(*)::int as n from hiq_members where id in (${a}, ${b}, ${c}, ${d})`)).rows[0] as { n: number }).n);
}
process.exit(0);
