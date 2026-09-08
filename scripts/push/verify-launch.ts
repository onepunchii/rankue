/** 오픈 알림이 인앱 알림함에 제대로 들어갔는지 확인(읽기만): 제목별 건수·딥링크·중복 여부. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { COPY } from "./onlineGameCopy";
const titles = Object.values(COPY).map((c) => c.title);
const rows = (await db.execute(sql`
  select title, count(*)::int n, count(distinct member_id)::int members, min(params->>'url') as url, max(created_at) as last
  from hiq_notifications where title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)}) group by 1 order by n desc`)).rows;
for (const r of rows) console.log(JSON.stringify(r));
const dup = (await db.execute(sql`
  select count(*)::int n from (select member_id, count(*) c from hiq_notifications
  where title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)}) group by 1 having count(*) > 1) x`)).rows[0];
console.log("두 번 받은 사람:", JSON.stringify(dup));
process.exit(0);
