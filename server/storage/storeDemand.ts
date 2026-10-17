/**
 * 손님이 찾는 매장(2026-10-18) — 방문자 발자국(ui_events)을 매장 페이지별로 접는다. 셈의 규칙은 shared/storeDemand.
 * 읽기만 한다. created_at 은 timestamptz — 기간 시작은 한국 자정(adminVisitors 와 같은 꼴, 인덱스를 탄다).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { CALL_LABELS, CLAIM_LABEL_PREFIX, DIRECTIONS_LABELS, STORE_PAGE_RE, type StoreDemandList, type StoreDemandRow, type StoreReport } from "../../shared/storeDemand.js";

const rowsOf = <T = any>(r: unknown): T[] => ((r as { rows?: T[] })?.rows ?? []);
const since = (days: number) => sql`((date_trunc('day', now() at time zone 'Asia/Seoul') - make_interval(days => ${days - 1})) at time zone 'Asia/Seoul')`;
const list = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const ymd = (col: ReturnType<typeof sql>) => sql`to_char(${col} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;

/** 매장마다의 칸(e = 그 매장의 발자국, l = store_listings) */
const AGG = sql`
    count(*) filter (where e.name = 'page')::int as views,
    count(distinct e.visitor) filter (where e.name = 'page')::int as visitors,
    count(distinct e.visitor) filter (where e.name = 'page' and e.meta->>'ref' like '%naver.com')::int as naver,
    count(*) filter (where e.name = 'click' and e.meta->>'l' in (${list(DIRECTIONS_LABELS)}))::int as directions,
    count(*) filter (where e.name = 'click' and e.meta->>'l' in (${list(CALL_LABELS)}))::int as calls,
    count(*) filter (where e.name = 'click' and l.address is not null and e.meta->>'l' = l.address)::int as "addressTaps",
    count(*) filter (where e.name = 'click' and e.meta->>'l' like ${`${CLAIM_LABEL_PREFIX}%`})::int as "claimTaps",
    to_char(max(e.created_at) at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI') as "lastAt"`;
const COLS = sql`l.code, l.name, l.region, l.address, l.phone, coalesce(l.claimed, false) as claimed`;

const evOf = (days: number, code?: string) => sql`
    select split_part(path, '/', 3) as code, name, visitor, meta, created_at from ui_events
    where created_at >= ${since(days)} and ${code ? sql`path = ${`/stores/${code}`}` : sql`path ~ ${STORE_PAGE_RE}`}`;

/** 실제로 발자국이 있는 기간(한국 날짜) */
async function rangeOf(days: number, code?: string): Promise<{ from: string | null; to: string | null }> {
    const [r] = rowsOf<{ from: string | null; to: string | null }>(await db.execute(sql`
        select ${ymd(sql`min(created_at)`)} as "from", ${ymd(sql`max(created_at)`)} as "to" from (${evOf(days, code)}) e`));
    return { from: r?.from ?? null, to: r?.to ?? null };
}

/** 손님이 찾는 매장 — 본 사람 순, 150곳까지 */
export async function storeDemandList(days: number): Promise<StoreDemandList> {
    const [rows, range] = await Promise.all([
        db.execute(sql`with e as (${evOf(days)})
            select ${COLS}, ${AGG} from e join store_listings l on l.code = e.code
            group by l.id order by visitors desc, views desc limit 150`),
        rangeOf(days),
    ]);
    const list = rowsOf<StoreDemandRow>(rows);
    const [t] = rowsOf<{ visitors: number; views: number; stores: number; naver: number }>(await db.execute(sql`with e as (${evOf(days)})
        select count(distinct visitor) filter (where name = 'page')::int as visitors, count(*) filter (where name = 'page')::int as views,
               count(distinct code) filter (where name = 'page')::int as stores,
               count(distinct visitor) filter (where name = 'page' and meta->>'ref' like '%naver.com')::int as naver from e`));
    const intents = list.reduce((a, r) => a + r.directions + r.calls + r.addressTaps, 0);
    return { days, ...range, rows: list, totals: { visitors: t?.visitors ?? 0, views: t?.views ?? 0, stores: t?.stores ?? 0, naver: t?.naver ?? 0, intents } };
}

/** 매장 한 곳의 리포트 — 날마다 본 사람(발자국이 있는 기간의 날을 빠짐없이, 없는 날은 0) */
export async function storeReport(code: string, days: number): Promise<StoreReport | null> {
    const [one] = rowsOf<StoreDemandRow>(await db.execute(sql`
        select ${COLS}, ${AGG} from store_listings l left join (${evOf(days, code)}) e on e.code = l.code
        where l.code = ${code} group by l.id`));
    if (!one) return null;
    const range = await rangeOf(days);
    const daily = rowsOf<{ day: string; visitors: number }>(await db.execute(sql`
        with e as (${evOf(days, code)})
        select to_char(g, 'YYYY-MM-DD') as day, (select count(distinct visitor) from e where e.name = 'page' and ${ymd(sql`e.created_at`)} = to_char(g, 'YYYY-MM-DD'))::int as visitors
        from generate_series(${range.from ?? "2026-10-08"}::date, ${range.to ?? "2026-10-08"}::date, interval '1 day') g order by 1`));
    return { ...one, days, ...range, daily };
}
