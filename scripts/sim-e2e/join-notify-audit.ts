/** 최근 '대전 시작' 알림이 실제로 기기까지 갔을지 점검(읽기만): 받는 사람의 푸시 토큰 유무. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const rows = (await db.execute(sql`
  select n.created_at, n.title, left(n.body, 30) as body, m.name,
         (p.push_token is not null) as has_token
  from hiq_notifications n
  join hiq_members m on m.id = n.member_id
  left join profiles p on p.id = m.profile_id
  where n.title like '온라인게임 대전%' order by n.created_at desc limit 8`)).rows as any[];
for (const r of rows) console.log(`${String(r.created_at).slice(5, 19)}  ${String(r.name).padEnd(10)} 기기알림 ${r.has_token ? "감" : "못감(앱 미설치·알림 거부)"}  ${r.title} · ${r.body}`);
const t = (await db.execute(sql`select count(*)::int total, count(*) filter (where p.push_token is not null)::int with_token from hiq_members m left join profiles p on p.id = m.profile_id`)).rows[0] as any;
console.log("전체 회원 중 기기 알림 가능:", JSON.stringify(t));
process.exit(0);
