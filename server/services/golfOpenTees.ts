/**
 * 골프장 공식 사이트의 남은 티 — 받아서 담고, 화면에 줄 꼴로 읽는다(2026-10-13). 규칙 · 받는 곳은 shared/golfOpenTee, 바깥 요청은 golfOpenTeeFetch.
 *
 * 담는 법: 그 골프장 · 그 날짜를 받을 때마다 받은 줄을 넣고(이미 있으면 본 시각만 고친다), 이번에 없는 줄은 지운다(예약됐다).
 *          못 받은 날(답 없음 · 표 없음)은 줄을 건드리지 않고 '못 받음'만 적는다 — 화면은 오래된 날을 보이지 않는다(FRESH_MS).
 * 끄는 법: 환경변수 GOLF_OPEN_TEES=false(받지도 보이지도 않는다) · 한 곳만 빼려면 shared/golfOpenTee 의 목록에서 지운다.
 * ⚠️ 표가 먼저 있어야 한다: migrations/golf_open_tees.sql(더하기만). 표가 없으면 받지 않고 빈 답을 준다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
    GOLF_TEE_SOURCES, isNewTee, teeRequests, kstDay, openTeeDays, openTeeDue, teeQuietHour, teeSource, teeStillAhead,
    type CourseOpenTees, type OpenTee, type OpenTeeDay, type OpenTeeFeedRow, type OpenTeeRow, type TeeSource,
} from "../../shared/golfOpenTee.js";
import { fetchOpenTees, robotsAllows } from "./golfOpenTeeFetch.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const missingTable = (e: unknown) => /relation .* does not exist|42P01/.test(String((e as any)?.message ?? e) + String((e as any)?.code ?? ""));
export const openTeesEnabled = () => process.env.GOLF_OPEN_TEES !== "false";
/** 이보다 오래 못 본 날은 화면에 싣지 않는다(그사이 팔린 티를 남은 것처럼 보이지 않게) */
const FRESH_MS = 12 * 3_600_000;

async function saveDay(s: TeeSource, day: string, tees: OpenTee[]): Promise<void> {
    // 받은 줄을 JSON 한 덩이로 넘긴다(줄마다 왕복하지 않게) — 배열을 그대로 넘기면 drizzle 이 값 목록으로 풀어 버린다
    const json = JSON.stringify(tees.map((t) => ({ t: t.time, c: t.course, h: t.holes, l: t.listPrice, p: t.price })));
    await db.transaction(async (tx) => {
        // 이번에 없는 줄은 지운다(예약됐다)
        await tx.execute(sql`
            delete from golf_open_tees o where o.slug = ${s.slug} and o.play_date = ${day}
              and not exists (select 1 from jsonb_to_recordset(${json}::jsonb) as x(t text, c text) where x.t = o.tee_time and x.c = o.course)`);
        if (tees.length) {
            await tx.execute(sql`
                insert into golf_open_tees (slug, play_date, tee_time, course, holes, list_price, price)
                select ${s.slug}, ${day}, x.t, x.c, x.h, x.l, x.p from jsonb_to_recordset(${json}::jsonb) as x(t text, c text, h integer, l integer, p integer)
                on conflict (slug, play_date, tee_time, course) do update set holes = excluded.holes, list_price = excluded.list_price, price = excluded.price, seen_at = now()`);
        }
        await tx.execute(sql`
            insert into golf_open_tee_days (slug, play_date, ok, note, tees) values (${s.slug}, ${day}, true, null, ${tees.length})
            on conflict (slug, play_date) do update set checked_at = now(), ok = true, note = null, tees = excluded.tees`);
    });
}
async function saveMiss(s: TeeSource, day: string, note: string): Promise<void> {
    await db.execute(sql`
        insert into golf_open_tee_days (slug, play_date, ok, note, tees) values (${s.slug}, ${day}, false, ${note.slice(0, 80)}, 0)
        on conflict (slug, play_date) do update set checked_at = now(), ok = false, note = excluded.note`);
}

/**
 * 볼 때가 된 날을 시간 예산만큼 받는다 — 한 번도 안 본 날 먼저, 그다음 가장 오래된 날. 한 곳에는 한 번에 요청 하나(곳끼리만 나란히).
 * 한 번에 다 못 돌아도 된다 — 다음 크론이 이어서 돈다.
 */
export async function collectOpenTees(opts: { budgetMs?: number; nowMs?: number; force?: boolean; only?: string } = {}): Promise<Record<string, number | string>> {
    if (!openTeesEnabled()) return { skipped: "GOLF_OPEN_TEES=false" };
    const nowMs = opts.nowMs ?? Date.now();
    if (!opts.force && teeQuietHour(nowMs)) return { skipped: "밤(23 ~ 06시)" };
    const until = Date.now() + (opts.budgetMs ?? 4500);
    const days = openTeeDays(nowMs);
    let seen: Map<string, number>;
    try {
        seen = new Map(rowsOf(await db.execute(sql`select slug, play_date, (extract(epoch from checked_at) * 1000)::bigint as ms from golf_open_tee_days where play_date >= ${days[0]}`))
            .map((r) => [`${r.slug}|${r.play_date}`, Number(r.ms)]));
    } catch (e) {
        if (missingTable(e)) return { skipped: "표 없음(migrations/golf_open_tees.sql)" };
        throw e;
    }
    // 지난 날의 줄은 치운다
    await db.execute(sql`delete from golf_open_tees where play_date < ${days[0]}`);
    await db.execute(sql`delete from golf_open_tee_days where play_date < ${days[0]}`);

    const sources = GOLF_TEE_SOURCES.filter((s) => !opts.only || s.slug === opts.only);
    const due = sources.map((s) => ({
        s,
        days: days.filter((d) => opts.force || openTeeDue(d, seen.get(`${s.slug}|${d}`) ?? null, nowMs)).sort((a, b) => (seen.get(`${s.slug}|${a}`) ?? 0) - (seen.get(`${s.slug}|${b}`) ?? 0)),
    })).filter((x) => x.days.length)
        // 가장 오래 못 본 곳부터
        .sort((a, b) => (seen.get(`${a.s.slug}|${a.days[0]}`) ?? 0) - (seen.get(`${b.s.slug}|${b.days[0]}`) ?? 0));
    const total = due.reduce((n, x) => n + x.days.length, 0);
    let ok = 0, miss = 0, blocked = 0, rows = 0, i = 0;
    const worker = async () => {
        while (i < due.length && Date.now() < until) {
            const { s, days: list } = due[i++];
            // 요청이 가는 자리(예약 화면과 다른 API 자리일 수 있다)의 robots 를 본다
            const first = new URL(teeRequests(s, list[0])[0].url);
            if (!(await robotsAllows(first.origin, first.pathname))) {
                // 막은 곳은 부르지 않는다 — '못 받음'으로 적어 둬야 다음 차례까지 다시 묻지 않는다(안 적으면 크론마다 robots.txt 를 받는다)
                for (const day of list) await saveMiss(s, day, "robots 가 막음");
                blocked++;
                continue;
            }
            for (const day of list) {
                // 끝날 무렵 시작한 요청이 서버리스 시간 제한까지 끌고 가지 않게 — 남은 시간만큼만 기다린다
                const left = until - Date.now();
                if (left < 800) break;
                const r = await fetchOpenTees(s, day, Math.min(4000, left));
                if (r.ok) { await saveDay(s, day, r.tees); ok++; rows += r.tees.length; }
                else { await saveMiss(s, day, r.note); miss++; }
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, due.length) }, worker));
    return { due: total, ok, miss, blocked, rows, left: total - ok - miss };
}

/** 그 골프장의 남은 티 — 받는 곳이 아니면 null. 못 본 지 오래된 날 · 이미 지난 티는 싣지 않는다 */
export async function courseOpenTees(slug: string, nowMs = Date.now()): Promise<CourseOpenTees | null> {
    const s = teeSource(slug);
    if (!s || !openTeesEnabled()) return null;
    try {
        const today = kstDay(nowMs);
        const [dayRows, teeRows] = await Promise.all([
            db.execute(sql`select play_date, (extract(epoch from first_checked) * 1000)::bigint as first_ms, (extract(epoch from checked_at) * 1000)::bigint as ms
                           from golf_open_tee_days where slug = ${slug} and ok and play_date >= ${today} order by play_date`),
            db.execute(sql`select play_date, tee_time, course, holes, list_price, price, (extract(epoch from first_seen) * 1000)::bigint as first_ms
                           from golf_open_tees where slug = ${slug} and play_date >= ${today} order by play_date, tee_time, course`),
        ]);
        const byDay = new Map<string, any[]>();
        for (const t of rowsOf(teeRows)) { const a = byDay.get(t.play_date) ?? []; a.push(t); byDay.set(t.play_date, a); }
        const days: OpenTeeDay[] = [];
        for (const d of rowsOf(dayRows)) {
            const checkedAt = Number(d.ms);
            if (nowMs - checkedAt > FRESH_MS) continue;
            const tees = (byDay.get(d.play_date) ?? []).filter((t) => teeStillAhead(d.play_date, t.tee_time, nowMs)).map((t): OpenTeeRow => ({
                time: t.tee_time, course: t.course, holes: t.holes ?? null, listPrice: t.list_price ?? null, price: t.price ?? null,
                fresh: isNewTee(Number(t.first_ms), Number(d.first_ms), nowMs),
            }));
            days.push({ day: d.play_date, checkedAt, tees });
        }
        return { page: s.page, days };
    } catch (e) {
        if (missingTable(e)) return null;
        throw e;
    }
}

/**
 * 기간(한국 날짜 startDay ~ endDay)의 남은 티 전부 — 부킹 목록 · 날짜 띠의 건수가 쓴다(services/golfOfficialListings).
 * 화면에 싣는 기준은 같다: 받는 곳의 줄만 · 12시간 안에 확인한 날만 · 이미 지난 시각은 뺀다. 이른 시각부터.
 */
export async function openTeesBetween(startDay: string, endDay: string, nowMs = Date.now()): Promise<OpenTeeFeedRow[]> {
    if (!openTeesEnabled()) return [];
    try {
        const raw = rowsOf(await db.execute(sql`
            select t.slug, t.play_date, t.tee_time, t.course, t.holes, t.list_price, t.price,
                   (extract(epoch from t.first_seen) * 1000)::bigint as first_ms,
                   (extract(epoch from d.first_checked) * 1000)::bigint as day_first_ms, (extract(epoch from d.checked_at) * 1000)::bigint as ms
            from golf_open_tees t join golf_open_tee_days d on d.slug = t.slug and d.play_date = t.play_date and d.ok
            where t.play_date >= ${startDay} and t.play_date <= ${endDay} and d.checked_at > now() - interval '12 hours'
            order by t.play_date, t.tee_time, t.slug, t.course`));
        const out: OpenTeeFeedRow[] = [];
        for (const t of raw) {
            const s = teeSource(t.slug);
            if (!s || !teeStillAhead(t.play_date, t.tee_time, nowMs)) continue;
            out.push({ slug: t.slug, day: t.play_date, time: t.tee_time, course: t.course, holes: t.holes ?? null, listPrice: t.list_price ?? null, price: t.price ?? null,
                fresh: isNewTee(Number(t.first_ms), Number(t.day_first_ms), nowMs), checkedAt: Number(t.ms), page: s.page });
        }
        return out;
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

/** 여러 골프장의 남은 티 한 줄씩 — 새로 나온 것 먼저, 그다음 가까운 날 · 이른 시각. 골프장마다 몇 줄까지만(한 곳이 목록을 다 차지하지 않게) */
export async function openTeeFeed(nowMs = Date.now(), limit = 24, perCourse = 3): Promise<OpenTeeFeedRow[]> {
    if (!openTeesEnabled()) return [];
    try {
        const today = kstDay(nowMs);
        const raw = rowsOf(await db.execute(sql`
            select t.slug, t.play_date, t.tee_time, t.course, t.holes, t.list_price, t.price,
                   (extract(epoch from t.first_seen) * 1000)::bigint as first_ms,
                   (extract(epoch from d.first_checked) * 1000)::bigint as day_first_ms, (extract(epoch from d.checked_at) * 1000)::bigint as ms
            from golf_open_tees t join golf_open_tee_days d on d.slug = t.slug and d.play_date = t.play_date and d.ok
            where t.play_date >= ${today} and d.checked_at > now() - interval '12 hours'
            order by t.play_date, t.tee_time`));
        const all: OpenTeeFeedRow[] = [];
        for (const t of raw) {
            const s = teeSource(t.slug);
            if (!s || !teeStillAhead(t.play_date, t.tee_time, nowMs)) continue;
            all.push({ slug: t.slug, day: t.play_date, time: t.tee_time, course: t.course, holes: t.holes ?? null, listPrice: t.list_price ?? null, price: t.price ?? null,
                fresh: isNewTee(Number(t.first_ms), Number(t.day_first_ms), nowMs), checkedAt: Number(t.ms), page: s.page });
        }
        all.sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
        const taken = new Map<string, number>();
        const out: OpenTeeFeedRow[] = [];
        for (const t of all) {
            const n = taken.get(t.slug) ?? 0;
            if (n >= perCourse) continue;
            taken.set(t.slug, n + 1);
            out.push(t);
            if (out.length >= limit) break;
        }
        return out;
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
