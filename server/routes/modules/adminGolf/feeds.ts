import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../../db.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { GOLF_TEE_SOURCES, openTeeDays, teeQuietHour } from "../../../../shared/golfOpenTee.js";
import { latestMidBase, latestShortBase, landOf, toGrid } from "../../../../shared/golfWeather.js";
import { weatherPoint } from "../../../../shared/golfWeatherZones.js";
import { eveRunOf, gridFresh, type GolfFeeds, type TeeClubRow } from "../../../../shared/golfFeeds.js";

/**
 * 골프 관리 — 외부 수집(2026-10-17 어드민 전수 조사 골프 ⑤, shared/golfFeeds 머리말).
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/feeds 로 붙인다.
 *
 *   GET  /               남은 티(골프장마다 이레) · 날씨(지금 쓰는 격자) · 전날 저녁 알림 실행 기록
 *   GET  /eve-preview    전날 저녁 알림 미리보기 — 내일 라운드에 무엇이 갈지(보내지 않는다 · 회원 id 없음). 조회라 보기 전용 관리자도 본다
 *   POST /open-tees/run  { only? } 남은 티 지금 받기 — only 를 주면 그 한 곳을 때가 안 됐어도(밤에도) 받는다. 크론(20분)과 같은 일
 *   POST /weather/run    날씨 지금 받기 — 낡은 격자부터 6초만큼. 크론(20분)과 같은 일
 */
const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);
const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());

export async function teeClubs(nowMs: number): Promise<TeeClubRow[]> {
    const days = openTeeDays(nowMs);
    let rows: any[] = [];
    try {
        rows = rowsOf(await db.execute(sql`
            select slug, count(*)::int as days, count(*) filter (where ok)::int as ok, count(*) filter (where not ok)::int as miss, coalesce(sum(tees), 0)::int as tees,
                   max(checked_at) as last_at, (array_agg(note order by checked_at desc) filter (where not ok))[1] as last_error
            from golf_open_tee_days where play_date >= ${days[0]} group by slug`));
    } catch (e) { if (!missing(e)) throw e; }
    const by = new Map(rows.map((r) => [String(r.slug), r]));
    return GOLF_TEE_SOURCES.map((s) => {
        const r = by.get(s.slug);
        return { slug: s.slug, family: s.family, page: s.page, days: Number(r?.days) || 0, ok: Number(r?.ok) || 0, miss: Number(r?.miss) || 0, tees: Number(r?.tees) || 0, lastAt: iso(r?.last_at), lastError: r?.last_error ?? null };
    });
}

export async function weatherState(nowMs: number): Promise<GolfFeeds["weather"]> {
    const { loadGolfCourseSummary } = await import("../golfCourses.js");
    const s = await loadGolfCourseSummary();
    const grids = new Set<string>(), mids = new Set<string>();
    for (const p of s.pages) {
        const pt = weatherPoint(p);
        if (!pt) continue;
        const g = toGrid(pt.lat, pt.lng);
        grids.add(`${g.nx},${g.ny}`);
        mids.add(landOf(pt.zone.ta).regId); mids.add(pt.zone.ta);
    }
    const latest = latestShortBase(nowMs), previous = latestShortBase(nowMs, 1), midLatest = latestMidBase(nowMs), midPrev = latestMidBase(nowMs, 1);
    let have: any[] = [], midHave: any[] = [];
    try {
        [have, midHave] = await Promise.all([
            db.execute(sql`select nx, ny, base, fetched_at from golf_weather_grid`).then(rowsOf),
            db.execute(sql`select reg_id, base from golf_weather_mid`).then(rowsOf),
        ]);
    } catch (e) { if (!missing(e)) throw e; }
    const gridMap = new Map(have.map((r) => [`${r.nx},${r.ny}`, r]));
    let fresh = 0, stale = 0, miss = 0, oldest: number | null = null;
    for (const k of grids) {
        const r = gridMap.get(k);
        if (!r) { miss++; continue; }
        if (gridFresh(String(r.base), latest, previous)) fresh++; else stale++;
        const t = Date.parse(String(r.fetched_at));
        if (Number.isFinite(t) && (oldest == null || t < oldest)) oldest = t;
    }
    const midMap = new Map(midHave.map((r) => [String(r.reg_id), String(r.base)]));
    const midsFresh = [...mids].filter((id) => gridFresh(midMap.get(id) ?? null, midLatest, midPrev)).length;
    return {
        enabled: !!process.env.DATA_GO_KR_KEY, grids: grids.size, gridsFresh: fresh, gridsStale: stale, gridsMissing: miss, latestBase: latest,
        oldestAt: oldest == null ? null : new Date(oldest).toISOString(), mids: mids.size, midsFresh, latestMidBase: midLatest,
    };
}

export async function eveRuns(): Promise<GolfFeeds["eve"]> {
    try {
        return rowsOf(await db.execute(sql`select ran_at, ok, result from hiq_cron_runs where job = 'golf_eve' order by ran_at desc limit 14`))
            .map((r) => eveRunOf({ at: iso(r.ran_at) ?? "", ok: r.ok === true, result: r.result }));
    } catch (e) { if (missing(e)) return []; throw e; }
}

router.get("/", asyncHandler(async (_req: any, res: any) => {
    const nowMs = Date.now();
    const { openTeesEnabled } = await import("../../../services/golfOpenTees.js");
    const [clubs, weather, eve] = await Promise.all([teeClubs(nowMs), weatherState(nowMs), eveRuns()]);
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, { tees: { enabled: openTeesEnabled(), quiet: teeQuietHour(nowMs), clubs }, weather, eve } satisfies GolfFeeds);
}));

router.get("/eve-preview", asyncHandler(async (_req: any, res: any) => {
    const { runGolfRoundEve } = await import("../../../services/golfRoundEve.js");
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await runGolfRoundEve(Date.now(), { dry: true, force: true }));
}));

router.post("/open-tees/run", asyncHandler(async (req: any, res: any) => {
    const only = typeof req.body?.only === "string" ? req.body.only.normalize("NFC") : undefined;
    if (only && !GOLF_TEE_SOURCES.some((s) => s.slug === only)) return sendError(res, 404, "받는 곳이 아닙니다");
    const { collectOpenTees } = await import("../../../services/golfOpenTees.js");
    const t0 = Date.now();
    const out = await collectOpenTees({ budgetMs: 6000, force: !!only, only });
    adminLog(req, "golf.feeds.open-tees", { only: only ?? null, ...out });
    return sendSuccess(res, { ...out, ms: Date.now() - t0 });
}));

router.post("/weather/run", asyncHandler(async (req: any, res: any) => {
    const { loadGolfCourseSummary } = await import("../golfCourses.js");
    const { warmWeather } = await import("../../../services/golfWeather.js");
    const t0 = Date.now();
    const s = await loadGolfCourseSummary();
    const out = await warmWeather(s.pages, { budgetMs: Math.max(1000, 6000 - (Date.now() - t0)) });
    adminLog(req, "golf.feeds.weather", out);
    return sendSuccess(res, { ...out, ms: Date.now() - t0 });
}));

export default router;
