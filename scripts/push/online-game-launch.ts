/**
 * 온라인게임 오픈 알림 — 회원마다 언어를 정해 그 언어의 제목·내용으로 보낸다(인앱 알림함 + 푸시 토큰이 있으면 기기 알림, 누르면 /online-game).
 * 언어: 회원 country(직접 설정) → 프로필 countryCode(가입 IP) → 전화(010·+82 = ko) → 소셜 가입은 카카오/네이버 = ko, 그 밖엔 en.
 * 실행: `npx tsx scripts/push/online-game-launch.ts` = 대상 집계만(dry run). 실제 발송은 `--send`. 같은 제목의 알림이 이미 있는 회원은 건너뛴다(중복 방지).
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { notificationService } from "../../server/services/notificationService";
import { COPY, langFor } from "./onlineGameCopy";

const send = process.argv.includes("--send");
const rows = (await db.execute(sql`
  select m.id, m.name, m.phone, m.country, p.country_code, (p.push_token is not null) as has_token
  from hiq_members m left join profiles p on p.id = m.profile_id
  where m.phone not like '000-e2e-%' and m.phone not like 'del%'`)).rows as { id: string; name: string; phone: string; country: string | null; country_code: string | null; has_token: boolean }[];
const plan = rows.map((r) => ({ ...r, lang: langFor({ country: r.country, countryCode: r.country_code, phone: r.phone }) }));
const byLang: Record<string, { n: number; tokens: number }> = {};
for (const p of plan) { byLang[p.lang] = byLang[p.lang] || { n: 0, tokens: 0 }; byLang[p.lang].n++; if (p.has_token) byLang[p.lang].tokens++; }
console.log("대상", plan.length, "명 / 언어별(명·기기 토큰):", JSON.stringify(byLang));
if (!send) { console.log("dry run — 발송하려면 --send"); process.exit(0); }
let sent = 0, skipped = 0;
for (const p of plan) {
  const copy = COPY[p.lang];
  const dup = (await db.execute(sql`select 1 from hiq_notifications where member_id = ${p.id} and title = ${copy.title} limit 1`)).rows.length > 0;
  if (dup) { skipped++; continue; }
  await notificationService.sendAndSaveNotification({ memberId: p.id, title: copy.title, body: copy.body, category: "admin", type: "broadcast", params: { url: "/online-game" } });
  sent++;
}
console.log("sent", sent, "skipped(dup)", skipped);
process.exit(0);
