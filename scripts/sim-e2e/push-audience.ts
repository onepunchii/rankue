/** 푸시 대상 분포(읽기만): 푸시 토큰 보유·플랫폼·국가코드. */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const rows = (await db.execute(sql`
  select coalesce(p.country_code, '-') as cc,
         case when p.push_token like 'apns:%' then 'ios' when p.push_token like 'fcm:%' then 'android' when p.push_token is not null then 'other' else 'none' end as platform,
         count(*)::int as n
  from hiq_members m left join profiles p on p.id = m.profile_id
  group by 1, 2 order by n desc`)).rows;
console.log(JSON.stringify(rows));
const mem = (await db.execute(sql`select count(*)::int as n, count(*) filter (where m.profile_id is null)::int as no_profile from hiq_members m`)).rows[0];
console.log("members:", JSON.stringify(mem));
process.exit(0);
