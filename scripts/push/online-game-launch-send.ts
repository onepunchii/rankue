/**
 * 오픈 알림을 **프로덕션 자격으로** 발송한다(로컬엔 FCM/APNs 키가 없어 기기 알림이 안 나간다).
 * 방금 로컬에서 인앱 알림함에만 저장된 같은 제목의 알림은 지우고, 어드민 발송 API 로 언어별로 다시 보낸다(인앱 + 기기).
 * `npx tsx scripts/push/online-game-launch-send.ts [base] [--send]` — --send 없으면 대상만 센다.
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { COPY, langFor } from "./onlineGameCopy";

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "https://www.rankue.co.kr";
const send = process.argv.includes("--send");
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sign = (v: string) => `s%3A${v}.${encodeURIComponent(createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, ""))}`;

const me = (await db.execute(sql`select m.profile_id, p.role from hiq_members m join profiles p on p.id = m.profile_id where m.id=${OWNER}`)).rows[0] as { profile_id: string; role: string };
if (!me?.profile_id || (me.role !== "super_admin" && me.role !== "admin")) throw new Error("어드민 권한 없음: " + JSON.stringify(me));
const cookie = `hiq_partner_auth=${sign(me.profile_id)}`;

const rows = (await db.execute(sql`
  select m.id, m.phone, m.country, p.country_code, (p.push_token is not null) as has_token
  from hiq_members m left join profiles p on p.id = m.profile_id
  where m.phone not like '000-e2e-%' and m.phone not like 'del%'`)).rows as
  { id: string; phone: string; country: string | null; country_code: string | null; has_token: boolean }[];

const groups = new Map<string, { ids: string[]; tokens: number }>();
for (const r of rows) {
  const lang = langFor({ country: r.country, countryCode: r.country_code, phone: r.phone });
  const g = groups.get(lang) ?? { ids: [], tokens: 0 };
  g.ids.push(r.id); if (r.has_token) g.tokens++;
  groups.set(lang, g);
}
console.log("대상:", [...groups].map(([l, g]) => `${l} ${g.ids.length}명(기기 ${g.tokens})`).join(" · "));
if (!send) { console.log("dry run — 실제 발송은 --send"); process.exit(0); }

// 로컬에서 인앱에만 저장된 같은 제목의 알림 정리(중복 방지)
const titles = Object.values(COPY).map((c) => c.title);
const del = await db.execute(sql`delete from hiq_notifications where title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)}) and created_at > now() - interval '2 hours' returning id`);
console.log("먼저 지운 인앱 알림:", del.rows.length, "건");

for (const [lang, g] of groups) {
  const copy = COPY[lang as keyof typeof COPY];
  const r = await fetch(`${BASE}/api/hiq/admin/push`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ memberIds: g.ids, title: copy.title, body: copy.body, url: "/online-game" }),
  });
  const j: any = await r.json().catch(() => ({}));
  console.log(`${lang}: ${r.status} ${JSON.stringify(j.data ?? j.message ?? j)}`);
}
const after = (await db.execute(sql`select title, count(*)::int n from hiq_notifications where title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)}) group by 1`)).rows;
console.log("인앱 알림함 저장:", JSON.stringify(after));
process.exit(0);
