/**
 * 어드민 · 낚시(2026-10-17 어드민 전수 조사 → 오너가 정한 순서의 '낚시' — 공개 전). 지금은 '조과 검수'.
 *
 * GET /admin/fishing/catches?filter=public|hidden|appealed|all&course=&days=   남이 볼 수 있었던 조과 전부(storage/adminFishingCatches — 라운드 사진과 같은 모양)
 * POST /admin/fishing/catches/:id/hide { hidden } · /:id/appeal { decision, note } · DELETE /:id     신고 큐와 같은 실행기(targetType 'fishing_catch')
 * GET /admin/fishing/ranking/species · GET /admin/fishing/ranking?species=   랭킹 점검 — 어종마다 큰 순 100줄(뺀 것 · 가린 것도), 다시 볼 것(shared/fishingRankAudit)
 * POST /admin/fishing/catches/:id/rank-void { reason, notify } · /:id/rank-restore { reason }   랭킹에서만 빼기 · 되돌리기(일지 · 수족관은 그대로)
 * GET /admin/fishing/feeds · POST /admin/fishing/feeds/warm    공공자료 상태판(받아 둔 곳 · 출처마다 성공/실패) · 지금 받기(매시 크론과 같은 일)
 * GET /admin/fishing/decor-audit · POST /admin/fishing/decor/:memberId/take-back { itemIds, reason }   장식 맞춰 보기 · 받쳐 주지 않는 것만 거두기(shared/fishingDecorAudit)
 * 까닭 · 처리는 신고 큐의 처리 기록에 쌓이고, 올린 사람에게 낚시 알림함으로 결과가 간다(services/moderation).
 */
import { Router } from "express";
import { checkSuperAdmin, adminLog } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { applyModerationAction } from "../../services/moderation.js";
import { listAdminFishingCatches } from "../../storage/adminFishingCatches.js";
import { parsePhotoListQuery } from "../../storage/adminGolfPhotos.js";
import { get as getCatch } from "../../storage/fishingCatches.js";
import type { ModerationAction } from "../../lib/reportQueue.js";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage/index.js";
import { notificationService } from "../../services/notificationService.js";
import { msg } from "../../lib/i18n.js";
import { FISH, fishByName } from "../../../shared/fishingFish.js";
import { rankColumn } from "../../../shared/fishingRank.js";
import { rankReview, type AdminRankBoard, type AdminRankRow, type AdminRankSpecies } from "../../../shared/fishingRankAudit.js";
import { FISHING_FEEDS, SOURCE_LABEL, feedState, type FishingFeeds } from "../../../shared/fishingFeeds.js";
import { recentCronRuns } from "../../storage/cronRuns.js";
import { DECOR, decorItem, decorProgress } from "../../../shared/fishingDecor.js";
import { canTakeBackDecor, type DecorAuditMember, type DecorAuditSweep } from "../../../shared/fishingDecorAudit.js";
import { decorCatchesOf } from "../../storage/fishingCatches.js";

const router = Router();
router.use(checkSuperAdmin);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GONE = "기록을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.";

router.get("/catches", asyncHandler(async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await listAdminFishingCatches(parsePhotoListQuery(req.query ?? {})));
}));

async function act(req: any, res: any, action: ModerationAction, logName: string, note: string | null = null) {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, GONE);
    if (!(await getCatch(id))) return sendError(res, 404, GONE);
    const result = await applyModerationAction({ targetType: "fishing_catch", targetId: id, action, adminProfileId: req.signedCookies?.hiq_partner_auth ?? null, allowUnreported: true, note });
    if (!result.ok) return sendError(res, result.status, result.status === 404 ? GONE : result.message);
    adminLog(req, logName, { id, action, closedReports: result.closed, ...(note ? { note } : {}) });
    return sendSuccess(res, { id, action, closedReports: result.closed });
}

router.post("/catches/:id/hide", asyncHandler(async (req: any, res: any) => {
    const hidden = req.body?.hidden;
    if (typeof hidden !== "boolean") return sendError(res, 400, "가릴지 다시 보일지 골라 주세요");
    return act(req, res, hidden ? "blind" : "unblind", hidden ? "fishing_catch_hide" : "fishing_catch_unhide");
}));

router.post("/catches/:id/appeal", asyncHandler(async (req: any, res: any) => {
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") return sendError(res, 400, "받아들일지 거절할지 골라 주세요");
    const raw = req.body?.note;
    if (raw != null && typeof raw !== "string") return sendError(res, 400, "메모는 글로 적어 주세요");
    const note = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
    return act(req, res, decision === "approve" ? "appeal_approve" : "appeal_reject", `fishing_catch_appeal_${decision}`, note);
}));

router.delete("/catches/:id", asyncHandler(async (req: any, res: any) => act(req, res, "delete", "fishing_catch_delete")));

// ── 랭킹 점검 ─────────────────────────────────────────────────────────────
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const reasonOf = (req: any) => (typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "");
const adminNameOf = async (req: any) => String(((await storage.getProfile(req.adminProfileId).catch(() => null)) as any)?.nickname ?? "관리자").slice(0, 40);

router.get("/ranking/species", asyncHandler(async (_req: any, res: any) => {
    const rows = rowsOf(await db.execute(sql`select species, count(distinct member_id)::int as people,
            max(length_cm) as cm, max(fish_count) as cnt, max(weight_kg) as kg, max(ji) as ji
        from fishing_catches where is_public group by species`).catch(() => ({ rows: [] })));
    const by = new Map(rows.map((r) => [String(r.species), r]));
    // 랭킹이 있는 어종(shared/fishingFish)만 — 자유 입력 어종은 랭킹이 없다
    const out: AdminRankSpecies[] = [];
    for (const f of FISH) {
        const r = by.get(f.name);
        if (!r) continue;
        const best = Number(f.unit === "cm" ? r.cm : f.unit === "count" ? r.cnt : f.unit === "kg" ? r.kg : r.ji);
        out.push({ species: f.name, people: Number(r.people) || 0, review: rankReview(f.name, Number.isFinite(best) ? best : null) ? 1 : 0 });
    }
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, out.sort((a, b) => b.review - a.review || b.people - a.people));
}));

router.get("/ranking", asyncHandler(async (req: any, res: any) => {
    const fish = fishByName(typeof req.query.species === "string" ? req.query.species : "");
    if (!fish) return sendError(res, 400, "어종을 골라 주세요");
    const col = sql.raw(rankColumn(fish.unit));
    const rows = rowsOf(await db.execute(sql`
        select c.id::text as id, c.member_id, coalesce(m.name, '회원') as name, c.${col} as value, c.fished_on as day, c.place, c.thumb_url, c.rank_void, (c.hidden_at is not null) as hidden
        from fishing_catches c left join hiq_members m on m.id::text = c.member_id
        where c.is_public and c.species = ${fish.name} and c.${col} is not null
        order by c.${col} desc, c.fished_on asc limit 100`));
    const out: AdminRankBoard = {
        species: fish.name, unit: fish.unit,
        rows: rows.map((r): AdminRankRow => ({
            catchId: String(r.id), memberId: String(r.member_id), name: String(r.name), value: Number(r.value), day: String(r.day), place: String(r.place ?? ""), thumbUrl: r.thumb_url ?? null,
            review: rankReview(fish.name, Number(r.value)), voided: r.rank_void ? { at: String(r.rank_void.at ?? ""), reason: String(r.rank_void.reason ?? ""), by: String(r.rank_void.by ?? "관리자") } : null, hidden: r.hidden === true,
        })),
    };
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, out);
}));

router.post("/catches/:id/rank-void", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, GONE);
    if (!reason) return sendError(res, 400, "빼는 까닭을 적어 주세요");
    const mark = { at: new Date().toISOString(), reason, by: await adminNameOf(req) };
    const [r] = rowsOf(await db.execute(sql`update fishing_catches set rank_void = ${JSON.stringify(mark)}::jsonb where id = ${id}::uuid and rank_void is null returning member_id, species`));
    if (!r) return sendError(res, 409, "이미 뺐거나 없는 기록이에요");
    // 올린 사람에게 — 잘못 적었다면 지우고 다시 적으라고(낚시 알림함). 알림 실패가 조치를 실패로 만들지 않는다
    if (req.body?.notify !== false) {
        await notificationService.sendAndSaveNotification({
            memberId: String(r.member_id), title: "notif.fishingCatch.rankVoid.title", body: msg("notif.fishingCatch.rankVoid.body", { species: String(r.species) }),
            category: "FISHING", type: "MODERATION", params: { url: "/fishing/log" },
        }).catch((e: unknown) => console.error("[Notify] 랭킹에서 뺌:", e));
    }
    return sendSuccess(res, { ok: true });
}));

router.post("/catches/:id/rank-restore", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, GONE);
    if (!reason) return sendError(res, 400, "되돌리는 까닭을 적어 주세요");
    const done = rowsOf(await db.execute(sql`update fishing_catches set rank_void = null where id = ${id}::uuid and rank_void is not null returning id`));
    if (!done.length) return sendError(res, 409, "랭킹에서 뺀 기록이 아니에요");
    return sendSuccess(res, { ok: true });
}));

// ── 공공자료 상태판 ───────────────────────────────────────────────────────
const TS = (col: string) => sql.raw(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

router.get("/feeds", asyncHandler(async (_req: any, res: any) => {
    const now = Date.now();
    const kinds = rowsOf(await db.execute(sql`select kind, count(*)::int as keys, ${TS("max(fetched_at)")} as newest, ${TS("min(fetched_at)")} as oldest from fishing_obs where kind <> 'health' group by kind`).catch(() => ({ rows: [] })));
    const [sea] = rowsOf(await db.execute(sql`select ${TS("fetched_at")} as newest from fishing_sea_status where id = 'pwn'`).catch(() => ({ rows: [] })));
    const health = new Map(rowsOf(await db.execute(sql`select key, data from fishing_obs where kind = 'health'`).catch(() => ({ rows: [] }))).map((r) => [String(r.key), r.data ?? {}]));
    const byKind = new Map(kinds.map((k) => [String(k.kind), k]));
    const out: FishingFeeds = {
        keyPresent: !!process.env.DATA_GO_KR_KEY,
        feeds: FISHING_FEEDS.map((f) => {
            const k = f.kind === "sea" ? (sea ? { keys: 1, newest: sea.newest, oldest: sea.newest } : null) : byKind.get(f.kind);
            const newest = k?.newest ? String(k.newest) : null;
            return {
                id: f.id, label: f.label, use: f.use, ttlMin: f.ttlMin, keys: Number(k?.keys) || 0, newestAt: newest, oldestAt: k?.oldest ? String(k.oldest) : null,
                state: feedState(newest ? Date.parse(newest) : null, f.ttlMin, now),
                sources: f.sources.map((src) => { const h = health.get(src) ?? {}; return { source: src, label: SOURCE_LABEL[src] ?? src, okAt: h.okAt ?? null, failAt: h.failAt ?? null, fails: Number(h.fails) || 0, lastError: h.lastError ?? null }; }),
            };
        }),
        warmFails: (await recentCronRuns("fishing_warm", 10)).map((r) => ({ at: r.at, error: String(r.result?.error ?? "") })),
    };
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, out);
}));

router.post("/feeds/warm", asyncHandler(async (_req: any, res: any) => {
    const { warmFishingFeeds } = await import("../../services/fishingWarm.js");
    return sendSuccess(res, await warmFishingFeeds());
}));

// ── 장식 맞춰 보기 ────────────────────────────────────────────────────────
const LIMITED_DECOR = DECOR.filter((d) => typeof d.limit === "number");

async function decorAudit(memberId: string, name: string): Promise<DecorAuditMember> {
    const list = await decorCatchesOf(memberId);
    const prog = decorProgress(list);
    const awards = rowsOf(await db.execute(sql`select item_id, serial, to_char(earned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as earned from fishing_decor_awards where member_id = ${memberId} order by earned_at`));
    const granted = new Set(rowsOf(await db.execute(sql`select item from hiq_goods_grants where member_id::text = ${memberId} and sport = 'fishing' and revoked_at is null`).catch(() => ({ rows: [] }))).map((g) => String(g.item)));
    const rows = awards.filter((a) => decorItem(String(a.item_id))).map((a) => {
        const id = String(a.item_id);
        return { itemId: id, name: decorItem(id)!.name, serial: Number(a.serial) || 0, earnedAt: String(a.earned), granted: granted.has(id), supported: prog[id]?.done === true };
    });
    const holdsLimited = rows.some((r) => LIMITED_DECOR.some((d) => d.id === r.itemId));
    return {
        memberId, name, rows, unsupported: rows.filter(canTakeBackDecor).length,
        evidence: holdsLimited ? { yearSpecies: prog.goldanchor?.cur ?? 0, photos: list.filter((c) => c.photo).length, days: new Set(list.map((c) => c.day)).size, catches: list.length } : null,
    };
}

router.get("/decor-audit", asyncHandler(async (_req: any, res: any) => {
    const holders = rowsOf(await db.execute(sql`select a.member_id, coalesce(m.name, '회원') as name, m.phone, count(*)::int as n
        from fishing_decor_awards a left join hiq_members m on m.id::text = a.member_id group by a.member_id, m.name, m.phone order by count(*) desc limit 300`).catch(() => ({ rows: [] })));
    const members: DecorAuditMember[] = [];
    for (const h of holders) members.push(await decorAudit(String(h.member_id), String(h.phone ?? "").startsWith("del-") ? "탈퇴한 회원" : String(h.name)));
    members.sort((a, b) => b.unsupported - a.unsupported || Number(!!b.evidence) - Number(!!a.evidence) || b.rows.length - a.rows.length);
    const given = new Map(rowsOf(await db.execute(sql`select item_id, count(*)::int as n from fishing_decor_awards group by item_id`).catch(() => ({ rows: [] }))).map((r) => [String(r.item_id), Number(r.n) || 0]));
    const out: DecorAuditSweep = { members, limited: LIMITED_DECOR.map((d) => ({ itemId: d.id, name: d.name, given: given.get(d.id) ?? 0, limit: d.limit! })) };
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, out);
}));

router.post("/decor/:memberId/take-back", asyncHandler(async (req: any, res: any) => {
    const memberId = String(req.params.memberId ?? ""), reason = reasonOf(req);
    const ids: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 60) : [];
    if (!UUID.test(memberId)) return sendError(res, 404, "회원을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "거두는 까닭을 적어 주세요");
    if (!ids.length) return sendError(res, 400, "거둘 것을 골라 주세요");
    // 다시 맞춰 보고 받쳐 주지 않는 것만(증정 아님) — 화면이 보낸 목록을 그대로 믿지 않는다
    const a = await decorAudit(memberId, "");
    const allowed = new Set(a.rows.filter(canTakeBackDecor).map((r) => r.itemId));
    const take = [...new Set(ids)].filter((id) => allowed.has(id));
    if (!take.length) return sendError(res, 409, "지금 기록이 받쳐 주는 장식은 거둘 수 없어요");
    for (const id of take) await db.execute(sql`delete from fishing_decor_awards where member_id = ${memberId} and item_id = ${id}`);
    return sendSuccess(res, { ok: true, taken: take });
}));

export default router;
