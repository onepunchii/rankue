/**
 * 어드민 · 등산(2026-10-16 어드민 전수 조사 → 오너가 정한 순서의 '등산'). 지금은 '정상 인증' — 회원을 한 명씩 열지 않고 전부를 본다.
 *
 * GET /admin/hiking/summits?days=30&q=                    정상 인증 전부(취소한 것 포함) — 회원 · 산 · 때 · 거리 구간 · 다시 볼 것(shared/hikingSummitFlags)
 * GET /admin/hiking/summit-misses?days=30&q=              정상 인증 실패(2026-10-24) — 까닭 · 거리/정확도 구간 · 기기 · 그 뒤의 결과(인증함 · 다녀왔어요 · 그만둠). 좌표 없음
 * GET /admin/hiking/summits/:id/revoke-preview            인증을 취소하면 거둘 와펜 · 핀 · 등급(계산만)
 * POST /admin/hiking/summits/:id/revoke { reason }        인증 취소 — '인증 없는 기록'으로 내리고(admin_void), 남은 기록이 받쳐 주지 않는 받은 것을 거둔다
 * POST /admin/hiking/summits/:id/restore { reason }       되살리기 — 다시 인증으로, 받을 것을 다시 적는다(번호는 새로)
 * GET /admin/hiking/mountains?view=kfs100|kept|all&q=        산 자료 — 정상 자리 · 높이 · 코스가 정상을 지나는가(가장 가까운 거리) · 인증 수 · 고친 칸
 * GET /admin/hiking/mountains/:id                         한 산 — 코스 선(그리기용) · 정상 후보(코스마다 가장 높은 점)
 * POST /admin/hiking/mountains/:id { lat, lng, heightM, peakName, reason }  고치기 — admin_keep 에 적혀 다시 적재해도 남는다, 코스의 정상 자리(summit_km)도 다시 셈
 * GET /admin/hiking/photos?filter=public|hidden|appealed|all&course=&days=   산행 사진 전부(storage/adminHikingPhotos — 골프 라운드 사진과 같은 모양)
 * POST /admin/hiking/photos/:id/hide { hidden } · /:id/appeal { decision, note } · DELETE /:id   신고 큐와 같은 실행기(targetType 'hiking_photo')
 * GET /admin/hiking/overview                              현황 — 합계 · 30일 · 많이 오른 산 · 산악회(다음 산행 · 함께 정상) · 전날 브리핑 실행 기록
 * GET /admin/hiking/eve-preview                           오늘 저녁 브리핑에 무엇이 갈지(보내지 않고 세기만 — services/hikingEve dry)
 * 운영자가 '굿즈 · 배지'로 증정한 것은 거두지 않는다(증정 기록이 따로 있다). 까닭은 작업 기록에 남는다(가드).
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { allMountains, forgetMountainCache } from "../../storage/hiking.js";
import { listAdminHikingPhotos } from "../../storage/adminHikingPhotos.js";
import { parsePhotoListQuery } from "../../storage/adminGolfPhotos.js";
import { applyModerationAction } from "../../services/moderation.js";
import { adminLog } from "../../middleware/adminAuth.js";
import * as hikingPhotos from "../../storage/hikingPhotos.js";
import type { ModerationAction } from "../../lib/reportQueue.js";
import { crewSummits } from "../../storage/hikingStamps.js";
import { recentCronRuns } from "../../storage/cronRuns.js";
import { fillDays, type HikingOverview } from "../../../shared/hikingOverview.js";
import { listSummits, syncHikingAwards } from "../../storage/hikingStamps.js";
import { isWithdrawnMember } from "../../../shared/chatSupport.js";
import { goodsItem } from "../../../shared/goods.js";
import { hikingAwardsDue, hikingAwardId, type Summit } from "../../../shared/hikingStamps.js";
import { summitFlags, type AdminHikingAwardLoss, type AdminSummitRow, type MountainSpot } from "../../../shared/hikingSummitFlags.js";
import { ACCURACY_BANDS, isSummitClient, isSummitMissReason, type AccuracyBand, type AdminSummitMissRow, type SummitMissAfter } from "../../../shared/hikingSummitMiss.js";
import { distM, nearestOnLine, summitCandidates, summitKmOn, validSpot, type AdminKeep, type AdminMountainDetail, type AdminMountainRow, type KeepField, type LinePoint } from "../../../shared/hikingMountainEdit.js";

const router = Router();
router.use(checkSuperAdmin);
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TS = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
const shownName = (name: unknown, phone: unknown) => (isWithdrawnMember({ phone }) ? "탈퇴한 회원" : String(name ?? "회원"));
const reasonOf = (req: any) => (typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "");
const adminNameOf = async (req: any) => String(((await storage.getProfile(req.adminProfileId).catch(() => null)) as any)?.nickname ?? "관리자").slice(0, 40);

router.get("/summits", asyncHandler(async (req: any, res: any) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 30) : "";
    const like = `%${term.replace(/[%_\\]/g, "")}%`;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    let rows: any[] = [];
    try {
        rows = rowsOf(await db.execute(sql`
            select s.id::text as id, s.member_id::text as member_id, s.mountain_id, s.day, s.bucket, s.verified, s.admin_void, ${TS("s.at")} as at_iso,
                m.name as member_name, m.phone, hm.name as mountain_name, hm.height_m
            from hiking_summits s left join hiq_members m on m.id = s.member_id left join hiking_mountains hm on hm.id = s.mountain_id
            where (s.verified or s.admin_void is not null) and s.at >= (${since}::timestamptz at time zone 'UTC')
              and (${term} = '' or m.name ilike ${like} or hm.name ilike ${like})
            order by s.at desc limit 1000`));
    } catch (e: any) { if ((e?.code ?? e?.cause?.code) !== "42P01" && (e?.code ?? e?.cause?.code) !== "42703") throw e; }
    const spots = new Map<string, MountainSpot>((await allMountains()).map((m) => [m.id, { name: m.name, lat: m.lat, lng: m.lng }]));
    const live = rows.filter((r) => r.verified);
    const flags = summitFlags(live.map((r) => ({ id: r.id, memberId: r.member_id, mountainId: r.mountain_id, atMs: Date.parse(r.at_iso), day: String(r.day) })), spots);
    const out: AdminSummitRow[] = rows.map((r) => ({
        id: r.id, memberId: r.member_id, memberName: shownName(r.member_name, r.phone), mountainId: r.mountain_id, mountainName: String(r.mountain_name ?? r.mountain_id),
        heightM: r.height_m == null ? null : Number(r.height_m), at: String(r.at_iso), day: String(r.day), bucket: r.bucket ?? null,
        flags: r.verified ? flags.get(r.id) ?? [] : [],
        voided: !r.verified && r.admin_void ? { at: String(r.admin_void.at ?? ""), reason: String(r.admin_void.reason ?? ""), by: String(r.admin_void.by ?? "관리자") } : null,
    }));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

/**
 * 정상 인증 실패(2026-10-24 오너: "진행") — 실패할 때 남긴 까닭(좌표 없음)과, 같은 회원 · 같은 산 · 같은 날 그 뒤에 어떻게 됐는지.
 * 뒤에 인증했으면 '뒤에 인증함', 인증 없이 적었으면 '다녀왔어요로 적음', 아무것도 없으면 '그만둠'.
 */
router.get("/summit-misses", asyncHandler(async (req: any, res: any) => {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 30) : "";
    const like = `%${term.replace(/[%_\\]/g, "")}%`;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    let rows: any[] = [];
    try {
        rows = rowsOf(await db.execute(sql`
            select x.id::text as id, x.member_id::text as member_id, x.mountain_id, x.reason, x.bucket, x.accuracy, x.client, ${TS("x.created_at")} as at_iso,
                m.name as member_name, m.phone, hm.name as mountain_name,
                (select case when bool_or(s.verified) then 'verified' when count(*) > 0 then 'recorded' else 'none' end
                   from hiking_summits s
                  where s.member_id = x.member_id and s.mountain_id = x.mountain_id
                    and s.day = to_char(x.created_at + interval '9 hours', 'YYYY-MM-DD') and s.created_at >= x.created_at) as after
            from hiking_summit_misses x left join hiq_members m on m.id = x.member_id left join hiking_mountains hm on hm.id = x.mountain_id
            where x.created_at >= (${since}::timestamptz at time zone 'UTC')
              and (${term} = '' or m.name ilike ${like} or hm.name ilike ${like})
            order by x.created_at desc limit 500`));
    } catch (e: any) { if ((e?.code ?? e?.cause?.code) !== "42P01") throw e; }
    const out: AdminSummitMissRow[] = rows.filter((r) => isSummitMissReason(r.reason)).map((r) => ({
        id: r.id, at: String(r.at_iso), memberId: r.member_id, memberName: shownName(r.member_name, r.phone),
        mountainId: r.mountain_id, mountainName: String(r.mountain_name ?? r.mountain_id),
        reason: r.reason, bucket: r.bucket ?? null, accuracy: ACCURACY_BANDS.includes(r.accuracy) ? (r.accuracy as AccuracyBand) : null,
        client: isSummitClient(r.client) ? r.client : null,
        after: (r.after === "verified" || r.after === "recorded" ? r.after : "none") as SummitMissAfter,
    }));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

/** 그 사람의 받은 것 가운데, 바뀐 기록(summits)이 받쳐 주지 않는 것 — 증정한 것은 빼고 */
async function lossesFor(memberId: string, summits: readonly Summit[]): Promise<AdminHikingAwardLoss[]> {
    const due = new Set(hikingAwardsDue(await allMountains(), summits).map((d) => hikingAwardId(d.kind, d.key)));
    const have = rowsOf(await db.execute(sql`select kind, key from hiking_awards where member_id = ${memberId}::uuid`).catch(() => ({ rows: [] })));
    const granted = new Set(rowsOf(await db.execute(sql`select item from hiq_goods_grants where member_id = ${memberId}::uuid and sport = 'hiking' and revoked_at is null`).catch(() => ({ rows: [] }))).map((g) => String(g.item)));
    return have.filter((a) => !due.has(hikingAwardId(a.kind, a.key)) && !granted.has(`${a.kind}:${a.key}`))
        .map((a) => ({ kind: String(a.kind), key: String(a.key), name: goodsItem("hiking", `${a.kind}:${a.key}`)?.name ?? `${a.kind}:${a.key}` }));
}

async function summitOf(id: string) {
    const [s] = rowsOf(await db.execute(sql`select id::text as id, member_id::text as member_id, mountain_id, day, verified, admin_void from hiking_summits where id = ${id}::uuid`));
    return s ?? null;
}
const asSummits = (list: Awaited<ReturnType<typeof listSummits>>, without?: string): Summit[] =>
    list.map((x) => ({ mountainId: x.mountainId, at: x.at, verified: x.verified && x.id !== without }));

router.get("/summits/:id/revoke-preview", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, "인증 기록을 찾을 수 없어요");
    const s = await summitOf(id);
    if (!s || !s.verified) return sendError(res, 404, "인증 기록을 찾을 수 없어요");
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, { losses: await lossesFor(s.member_id, asSummits(await listSummits(s.member_id), id)) });
}));

router.post("/summits/:id/revoke", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, "인증 기록을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "취소하는 까닭을 적어 주세요");
    const s = await summitOf(id);
    if (!s || !s.verified) return sendError(res, 404, "인증 기록을 찾을 수 없어요");
    const by = await adminNameOf(req), at = new Date().toISOString();
    // 같은 산 · 같은 날에 인증 없는 기록이 이미 있으면(고유 묶음) 내릴 자리가 없다 — 그때는 인증 줄을 지운다(기록은 남아 있다)
    const [twin] = rowsOf(await db.execute(sql`select 1 from hiking_summits where member_id = ${s.member_id}::uuid and mountain_id = ${s.mountain_id} and day = ${s.day} and not verified`));
    if (twin) await db.execute(sql`delete from hiking_summits where id = ${id}::uuid and verified`);
    else await db.execute(sql`update hiking_summits set verified = false, admin_void = ${JSON.stringify({ at, reason, by })}::jsonb where id = ${id}::uuid and verified`);
    const losses = await lossesFor(s.member_id, asSummits(await listSummits(s.member_id)));
    for (const l of losses) await db.execute(sql`delete from hiking_awards where member_id = ${s.member_id}::uuid and kind = ${l.kind} and key = ${l.key}`);
    return sendSuccess(res, { ok: true, removed: !!twin, losses });
}));

router.post("/summits/:id/restore", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, "인증 기록을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "되살리는 까닭을 적어 주세요");
    const s = await summitOf(id);
    if (!s || s.verified || !s.admin_void) return sendError(res, 404, "취소한 인증이 아니에요");
    const by = await adminNameOf(req), at = new Date().toISOString();
    const done = rowsOf(await db.execute(sql`update hiking_summits set verified = true, admin_void = admin_void || ${JSON.stringify({ restoredAt: at, restoreReason: reason, restoredBy: by })}::jsonb
        where id = ${id}::uuid and not verified and admin_void is not null
          and not exists (select 1 from hiking_summits o where o.member_id = hiking_summits.member_id and o.mountain_id = hiking_summits.mountain_id and o.day = hiking_summits.day and o.verified)
        returning id`));
    if (!done.length) return sendError(res, 409, "그날 그 산의 인증이 이미 있어요");
    const fresh = await syncHikingAwards(s.member_id, await allMountains(), (await listSummits(s.member_id)).map((x) => ({ mountainId: x.mountainId, at: x.at, verified: x.verified })));
    return sendSuccess(res, { ok: true, awarded: fresh.length });
}));

// ── 산 자료 ─────────────────────────────────────────────────────────────
const MOUNTAIN_COLS = sql`m.id, m.slug, m.name, m.peak_name, m.height_m, m.lat, m.lng, m.sido, m.sigungu, m.lists, m.course_count, m.admin_keep,
    (select count(*)::int from hiking_summits s where s.mountain_id = m.id and s.verified) as summits`;
const kfsNo = (lists: unknown) => (Array.isArray(lists) ? (lists as any[]).find((l) => l?.list === "kfs100")?.no ?? null : null);

async function linesOf(ids: readonly string[]): Promise<Map<string, { id: string; km: number; line: LinePoint[]; summitKm: number | null }[]>> {
    const out = new Map<string, { id: string; km: number; line: LinePoint[]; summitKm: number | null }[]>();
    if (!ids.length) return out;
    for (const c of rowsOf(await db.execute(sql`select id, mountain_id, km, summit_km, line from hiking_courses where mountain_id = any(${`{${ids.map((x) => `"${x.replace(/"/g, "")}"`).join(",")}}`}::text[])`))) {
        const l = out.get(String(c.mountain_id)) ?? [];
        l.push({ id: String(c.id), km: Number(c.km) || 0, line: Array.isArray(c.line) ? c.line : [], summitKm: c.summit_km == null ? null : Number(c.summit_km) });
        out.set(String(c.mountain_id), l);
    }
    return out;
}

function mountainRow(r: any, lines: { line: LinePoint[] }[] | undefined): AdminMountainRow {
    const lat = r.lat == null ? null : Number(r.lat), lng = r.lng == null ? null : Number(r.lng);
    const near = lat == null || lng == null || !lines?.length ? null : Math.min(...lines.map((l) => nearestOnLine(l.line, lat, lng)?.offM ?? Infinity));
    return {
        id: String(r.id), slug: String(r.slug), name: String(r.name), peakName: r.peak_name ?? null, heightM: r.height_m == null ? null : Number(r.height_m), lat, lng,
        place: [r.sido, r.sigungu].filter(Boolean).join(" "), kfs100: kfsNo(r.lists), courses: Number(r.course_count) || 0,
        nearestM: near == null || !Number.isFinite(near) ? null : Math.round(near), summits: Number(r.summits) || 0, keep: (r.admin_keep ?? {}) as AdminKeep,
    };
}

router.get("/mountains", asyncHandler(async (req: any, res: any) => {
    const view = req.query.view === "kept" || req.query.view === "all" ? req.query.view : "kfs100";
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 30) : "";
    const like = `%${term.replace(/[%_\\]/g, "")}%`;
    const rows = rowsOf(await db.execute(sql`select ${MOUNTAIN_COLS} from hiking_mountains m
        where (${term} <> '' and (m.name ilike ${like} or m.slug ilike ${like} or m.peak_name ilike ${like}))
           or (${term} = '' and ((${view} = 'kfs100' and m.lists @> '[{"list":"kfs100"}]'::jsonb) or (${view} = 'kept' and m.admin_keep is not null) or ${view} = 'all'))
        order by (m.lists @> '[{"list":"kfs100"}]'::jsonb) desc, m.tier, m.height_m desc nulls last limit ${term ? 60 : view === "all" ? 60 : 120}`));
    const lines = await linesOf(rows.map((r) => String(r.id)));
    const out = rows.map((r) => mountainRow(r, lines.get(String(r.id)))).sort((a, b) => (a.kfs100 ?? 999) - (b.kfs100 ?? 999));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

router.get("/mountains/:id", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "").slice(0, 80);
    const [r] = rowsOf(await db.execute(sql`select ${MOUNTAIN_COLS} from hiking_mountains m where m.id = ${id}`));
    if (!r) return sendError(res, 404, "산을 찾을 수 없어요");
    const lines = (await linesOf([id])).get(id) ?? [];
    const row = mountainRow(r, lines);
    // 그리기용 — 코스마다 120점 안으로 줄인다
    const thin = (l: LinePoint[]) => { const step = Math.max(1, Math.ceil(l.length / 120)); return l.filter((_, i) => i % step === 0 || i === l.length - 1).map((p) => [p[0], p[1], Math.round(p[2])] as [number, number, number]); };
    const out: AdminMountainDetail = {
        ...row,
        lines: lines.map((l) => ({ id: l.id, km: l.km, line: thin(l.line), nearestM: row.lat == null || row.lng == null ? null : Math.round(nearestOnLine(l.line, row.lat, row.lng)?.offM ?? 0), summitKm: l.summitKm })),
        candidates: summitCandidates(lines.map((l) => l.line), row.heightM),
    };
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

router.post("/mountains/:id", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "").slice(0, 80), reason = reasonOf(req);
    if (!reason) return sendError(res, 400, "고치는 까닭을 적어 주세요");
    const [r] = rowsOf(await db.execute(sql`select id, lat, lng, height_m, peak_name, admin_keep from hiking_mountains where id = ${id}`));
    if (!r) return sendError(res, 404, "산을 찾을 수 없어요");
    const spot = validSpot(req.body?.lat, req.body?.lng);
    if (!spot.ok) return sendError(res, 400, spot.why);
    const height = req.body?.heightM == null || req.body?.heightM === "" ? null : Math.round(Number(req.body.heightM));
    if (height !== null && (!Number.isFinite(height) || height < 1 || height > 2000)) return sendError(res, 400, "높이는 1 ~ 2,000m 로 적어 주세요");
    const peak = typeof req.body?.peakName === "string" ? req.body.peakName.trim().slice(0, 30) || null : (r.peak_name ?? null);
    const by = await adminNameOf(req), at = new Date().toISOString();
    const moved = r.lat == null || r.lng == null ? Infinity : distM(Number(r.lat), Number(r.lng), spot.lat, spot.lng);
    const changes: Partial<Record<KeepField, { at: string; by: string; reason: string; was: string }>> = {};
    if (moved > 1) changes.coords = { at, by, reason, was: r.lat == null ? "없음" : `${r.lat}, ${r.lng}` };
    if (height !== null && height !== (r.height_m == null ? null : Number(r.height_m))) changes.height = { at, by, reason, was: r.height_m == null ? "없음" : `${r.height_m}m` };
    if (peak !== (r.peak_name ?? null)) changes.peak = { at, by, reason, was: r.peak_name ?? "없음" };
    if (!Object.keys(changes).length) return sendError(res, 400, "지금 값과 같아요");
    await db.execute(sql`update hiking_mountains set lat = ${spot.lat}, lng = ${spot.lng}, height_m = ${height ?? r.height_m ?? null}, peak_name = ${peak},
        admin_keep = coalesce(admin_keep, '{}'::jsonb) || ${JSON.stringify(changes)}::jsonb, updated_at = now() where id = ${id}`);
    // 코스의 정상 자리 — 적재와 같은 셈(150m 안일 때만)
    let onCourse = 0;
    if (changes.coords) for (const l of (await linesOf([id])).get(id) ?? []) {
        const km = summitKmOn(l.line, spot.lat, spot.lng);
        if (km !== null) onCourse++;
        if (km !== l.summitKm) await db.execute(sql`update hiking_courses set summit_km = ${km}, updated_at = now() where id = ${l.id}`);
    }
    forgetMountainCache();
    return sendSuccess(res, { ok: true, changed: Object.keys(changes), movedM: Number.isFinite(moved) ? Math.round(moved) : null, onCourse });
}));

// ── 산행 사진 ─────────────────────────────────────────────────────────────
const PHOTO_GONE = "사진을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.";

router.get("/photos", asyncHandler(async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await listAdminHikingPhotos(parsePhotoListQuery(req.query ?? {})));
}));

/** 조치 하나 — 골프 라운드 사진과 같은 길(신고 큐의 실행기 · 신고가 없는 사진에도) */
async function photoAct(req: any, res: any, action: ModerationAction, logName: string, note: string | null = null) {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, PHOTO_GONE);
    if (!(await hikingPhotos.get(id))) return sendError(res, 404, PHOTO_GONE);
    const result = await applyModerationAction({ targetType: "hiking_photo", targetId: id, action, adminProfileId: req.signedCookies?.hiq_partner_auth ?? null, allowUnreported: true, note });
    if (!result.ok) return sendError(res, result.status, result.status === 404 ? PHOTO_GONE : result.message);
    adminLog(req, logName, { id, action, closedReports: result.closed, ...(note ? { note } : {}) });
    return sendSuccess(res, { id, action, closedReports: result.closed });
}

router.post("/photos/:id/hide", asyncHandler(async (req: any, res: any) => {
    const hidden = req.body?.hidden;
    if (typeof hidden !== "boolean") return sendError(res, 400, "가릴지 다시 보일지 골라 주세요");
    return photoAct(req, res, hidden ? "blind" : "unblind", hidden ? "hiking_photo_hide" : "hiking_photo_unhide");
}));

router.post("/photos/:id/appeal", asyncHandler(async (req: any, res: any) => {
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") return sendError(res, 400, "받아들일지 거절할지 골라 주세요");
    const raw = req.body?.note;
    if (raw != null && typeof raw !== "string") return sendError(res, 400, "메모는 글로 적어 주세요");
    const note = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
    return photoAct(req, res, decision === "approve" ? "appeal_approve" : "appeal_reject", `hiking_photo_appeal_${decision}`, note);
}));

router.delete("/photos/:id", asyncHandler(async (req: any, res: any) => photoAct(req, res, "delete", "hiking_photo_delete")));

// ── 현황 ─────────────────────────────────────────────────────────────────
const safeRows = async (q: ReturnType<typeof sql>) => { try { return rowsOf(await db.execute(q)); } catch (e: any) { if (["42P01", "42703"].includes(e?.code ?? e?.cause?.code)) return []; throw e; } };
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

router.get("/overview", asyncHandler(async (_req: any, res: any) => {
    const [[t], [p], [a], [mem], [cr]] = await Promise.all([
        safeRows(sql`select count(*) filter (where verified)::int as summits, count(distinct member_id) filter (where verified)::int as summit_members,
            count(*) filter (where not verified)::int as records,
            (select count(*)::int from hiking_trips) as trips, (select count(*) filter (where reached_summit)::int from hiking_trips) as reached from hiking_summits`),
        safeRows(sql`select count(*)::int as photos, count(*) filter (where is_public and hidden_at is null)::int as public, count(*) filter (where hidden_at is not null)::int as hidden from hiking_photos`),
        safeRows(sql`select count(*)::int as n from hiking_awards`),
        safeRows(sql`select count(*)::int as n from hiq_members where primary_sport = 'HIKING' and phone not like 'del-%'`),
        safeRows(sql`select count(*)::int as crews, (select count(*)::int from hiq_crew_members cm join hiq_crews c2 on c2.id = cm.crew_id where c2.sport_category = 'HIKING' and cm.role <> 'pending') as members from hiq_crews where sport_category = 'HIKING'`),
    ]);
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const KDAY = (col: string) => sql.raw(`to_char(${col} + interval '9 hours', 'YYYY-MM-DD')`);
    const [sd, td, pd] = await Promise.all([
        safeRows(sql`select ${KDAY("at")} as day, count(*) filter (where verified)::int as summits, count(*) filter (where not verified)::int as records from hiking_summits where at >= (${since}::timestamptz at time zone 'UTC') group by 1`),
        safeRows(sql`select ${KDAY("started_at")} as day, count(*)::int as n from hiking_trips where started_at >= (${since}::timestamptz at time zone 'UTC') group by 1`),
        safeRows(sql`select ${KDAY("created_at")} as day, count(*)::int as n from hiking_photos where created_at >= (${since}::timestamptz at time zone 'UTC') group by 1`),
    ]);
    const merged = new Map<string, { day: string; summits: number; records: number; trips: number; photos: number }>();
    const at = (day: string) => { let x = merged.get(day); if (!x) { x = { day, summits: 0, records: 0, trips: 0, photos: 0 }; merged.set(day, x); } return x; };
    for (const r of sd) { const x = at(String(r.day)); x.summits = Number(r.summits) || 0; x.records = Number(r.records) || 0; }
    for (const r of td) at(String(r.day)).trips = Number(r.n) || 0;
    for (const r of pd) at(String(r.day)).photos = Number(r.n) || 0;
    const mountains = await safeRows(sql`select s.mountain_id as id, hm.name, hm.slug, count(*) filter (where s.verified)::int as summits, count(*) filter (where not s.verified)::int as records
        from hiking_summits s join hiking_mountains hm on hm.id = s.mountain_id where s.at >= (${since}::timestamptz at time zone 'UTC')
        group by 1, 2, 3 order by count(*) filter (where s.verified) desc, count(*) desc limit 10`);
    const crews = await safeRows(sql`select c.id, c.name,
            (select count(*)::int from hiq_crew_members cm where cm.crew_id = c.id and cm.role <> 'pending') as members,
            (select json_build_object('title', a.title, 'at', to_char(a.activity_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'mountain', hm.name)
               from hiq_crew_activities a left join hiking_mountains hm on hm.slug = a.mountain_slug
               where a.crew_id = c.id and a.activity_date >= now() at time zone 'UTC' order by a.activity_date limit 1) as next,
            (select to_char(max(a.activity_date), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from hiq_crew_activities a where a.crew_id = c.id and a.activity_date < now() at time zone 'UTC') as last_at
        from hiq_crews c where c.sport_category = 'HIKING' order by members desc, c.created_at limit 60`);
    const together = await Promise.all(crews.map((c) => crewSummits(String(c.id)).then((x) => x.length).catch(() => 0)));
    const eve = await recentCronRuns("hiking_eve", 10);
    const out: HikingOverview = {
        totals: {
            summits: Number(t?.summits) || 0, summitMembers: Number(t?.summit_members) || 0, records: Number(t?.records) || 0, trips: Number(t?.trips) || 0, reachedTrips: Number(t?.reached) || 0,
            photos: Number(p?.photos) || 0, publicPhotos: Number(p?.public) || 0, hiddenPhotos: Number(p?.hidden) || 0, awards: Number(a?.n) || 0, primaryMembers: Number(mem?.n) || 0,
            crews: Number(cr?.crews) || 0, crewMembers: Number(cr?.members) || 0,
        },
        days: fillDays([...merged.values()], kstToday(), 30, (day) => ({ day, summits: 0, records: 0, trips: 0, photos: 0 })),
        mountains: mountains.map((m) => ({ id: String(m.id), name: String(m.name), slug: String(m.slug), summits: Number(m.summits) || 0, records: Number(m.records) || 0 })),
        crews: crews.map((c, i) => ({ id: String(c.id), name: String(c.name), members: Number(c.members) || 0, next: c.next ? { title: String(c.next.title), at: String(c.next.at), mountain: c.next.mountain ?? null } : null, lastAt: c.last_at ?? null, together: together[i] })),
        eveRuns: eve.map((r) => ({ at: r.at, ok: r.ok, trips: Number(r.result?.trips) || 0, people: Number(r.result?.people) || 0, sent: Number(r.result?.sent) || 0, failed: Number(r.result?.failed) || 0, error: typeof r.result?.error === "string" ? r.result.error : null })),
    };
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

router.get("/eve-preview", asyncHandler(async (_req: any, res: any) => {
    const { runHikingEve } = await import("../../services/hikingEve.js");
    const r = await runHikingEve(Date.now(), { dry: true, force: true });
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, r);
}));

export default router;
