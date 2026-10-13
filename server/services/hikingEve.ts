/**
 * 산행 전날 저녁 브리핑(2026-10-13) — 내일 산악회 산행에 가는 사람에게 저녁 7~8시대에 한 번(규칙 · 글은 shared/hikingEve).
 *
 * 누구에게: 산을 고른(mountain_slug) 산악회 일정에 참가를 누른 사람(status = joined — 대기자는 빼낸다).
 *   등산을 쓸 수 없는 사람에게는 가지 않는다 — 산악회에 들어 있다는 것이 곧 등산이 열린 회원이다(가입 문이 서버에 있다).
 * 무엇을: 내일 그 산 아래의 하늘 · 기온 · 비 올 확률, 해 뜨는 시각 · 지는 시각, 챙길 것. 누르면 그 산의 날씨 구역이 열린다.
 *   날씨는 받아 둔 예보에서만 읽는다(기상청을 새로 부르지 않는다 — fetch:false). 못 읽으면 해의 시각과 준비물만.
 * 언제: 한국 시각 19:00~20:59(골프의 라운드 전날 알림과 같은 창 — shared/golfRoundShare eveWindow). 매시 도는 리마인더 크론에 얹는다.
 * 한 번만: 알림함의 params.reminderKey('hiking-eve:<일정 id>').
 * 일정 표에 mountain_slug 칸이 아직 없으면(배포 순서가 어긋났을 때) 아무 일도 하지 않는다.
 *
 * dry: 보내지 않고 무엇이 갈지 세기만 한다(점검용 — /api/cron/hiking-eve?dry=1). 회원 id 는 응답에 싣지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { notificationService } from "./notificationService.js";
import { eveWindow } from "../../shared/golfRoundShare.js";
import { ymdToKey } from "../../shared/golfWeather.js";
import { hikingEveKey, hikingEveNotice, hikingEveUrl } from "../../shared/hikingEve.js";
import { sunTimes } from "../../shared/hikingSun.js";
import { pgTextArray, utcMs } from "./golfRoundEve.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const textArray = (xs: readonly string[]) => `{${xs.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`;
/** 아직 없는 칸 · 표 — 옮기기(migration) 전에 불려도 조용히 넘어간다 */
const notReady = (e: any) => ["42703", "42P01"].includes(String(e?.code ?? e?.cause?.code ?? ""));
/** 날씨를 읽는 데 쓰는 시간의 뚜껑(크론은 10초 안에 끝나야 한다) */
const WEATHER_BUDGET_MS = 3500;

export interface HikingEveResult {
    due: boolean; ymd: string; trips: number; people: number; sent: number; already: number; failed: number; dry: boolean;
    preview?: { title: string; body: string; url: string; to: number }[];
}

export async function runHikingEve(nowMs = Date.now(), opts: { dry?: boolean; force?: boolean } = {}): Promise<HikingEveResult> {
    const w = eveWindow(nowMs);
    const out: HikingEveResult = { due: w.due, ymd: w.ymd, trips: 0, people: 0, sent: 0, already: 0, failed: 0, dry: !!opts.dry };
    if (!w.due && !opts.force) return out;

    let rows: any[];
    try {
        rows = rowsOf(await db.execute(sql`
            select a.id::text as id, a.activity_date, a.mountain_slug,
                   coalesce(array_agg(p.member_id::text) filter (where p.status = 'joined'), '{}') as members
            from hiq_crew_activities a
            join hiq_crews c on c.id = a.crew_id and c.sport_category = 'HIKING'
            left join hiq_crew_activity_participants p on p.activity_id = a.id
            where a.mountain_slug is not null
              and a.activity_date >= ${w.fromUtc}::timestamp and a.activity_date < ${w.toUtc}::timestamp
            group by a.id order by a.activity_date asc limit 300`));
    } catch (e) {
        if (notReady(e)) return out;
        throw e;
    }
    const { mountainBySlug } = await import("../storage/hiking.js");
    const plan: { id: string; startMs: number; m: NonNullable<Awaited<ReturnType<typeof mountainBySlug>>>; to: string[] }[] = [];
    for (const r of rows) {
        const to = [...new Set(pgTextArray(r.members))];
        const startMs = utcMs(r.activity_date);
        const m = await mountainBySlug(String(r.mountain_slug));
        if (m && to.length > 0 && Number.isFinite(startMs)) plan.push({ id: String(r.id), startMs, m, to });
    }
    out.trips = plan.length;
    out.people = plan.reduce((n, x) => n + x.to.length, 0);
    if (!plan.length) return out;

    // 이미 보낸 것 — 같은 일정 · 같은 사람
    const keys = plan.map((x) => hikingEveKey(x.id));
    const sentRows = rowsOf(await db.execute(sql`
        select member_id::text as member_id, params->>'reminderKey' as k from hiq_notifications
        where created_at > now() - interval '36 hours' and params->>'reminderKey' = any(${textArray(keys)}::text[])`));
    const done = new Set(sentRows.map((x) => `${x.k}|${x.member_id}`));

    const { getCourseWeather } = await import("./golfWeather.js");
    const day = { y: +w.ymd.slice(0, 4), m: +w.ymd.slice(4, 6), d: +w.ymd.slice(6, 8) };
    const dateKey = ymdToKey(w.ymd);
    const startedAt = Date.now();
    const sends: Promise<unknown>[] = [];
    if (opts.dry) out.preview = [];
    for (const x of plan) {
        const at = x.m.lat != null && x.m.lng != null ? { lat: x.m.lat, lng: x.m.lng } : null;
        // 받아 둔 예보만 — 뚜껑을 넘겼으면 날씨 없이(알림 자체는 빠뜨리지 않는다)
        const wx = at && Date.now() - startedAt < WEATHER_BUDGET_MS ? await getCourseWeather(at, { fetch: false }).catch(() => null) : null;
        const t = hikingEveNotice({ mountain: x.m.name, startMs: x.startMs, day: wx?.days?.find((d) => d.date === dateKey) ?? null, sun: at ? sunTimes(day, at.lat, at.lng) : null });
        const url = hikingEveUrl(x.m.slug);
        const fresh = x.to.filter((id) => !done.has(`${hikingEveKey(x.id)}|${id}`));
        out.already += x.to.length - fresh.length;
        if (opts.dry) { out.preview!.push({ ...t, url, to: fresh.length }); continue; }
        for (const memberId of fresh) {
            sends.push(notificationService.sendAndSaveNotification({
                memberId, title: t.title, body: t.body, category: "HIKING", type: "CREW",
                params: { url, reminderKey: hikingEveKey(x.id), startAt: new Date(x.startMs).toISOString() },
            }).then(() => { out.sent++; }, (e: unknown) => { out.failed++; console.error("[HikingEve]", e); }));
        }
    }
    await Promise.allSettled(sends);
    return out;
}
