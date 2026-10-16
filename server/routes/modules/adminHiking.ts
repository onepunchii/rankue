/**
 * 어드민 · 등산(2026-10-16 어드민 전수 조사 → 오너가 정한 순서의 '등산'). 지금은 '정상 인증' — 회원을 한 명씩 열지 않고 전부를 본다.
 *
 * GET /admin/hiking/summits?days=30&q=                    정상 인증 전부(취소한 것 포함) — 회원 · 산 · 때 · 거리 구간 · 다시 볼 것(shared/hikingSummitFlags)
 * GET /admin/hiking/summits/:id/revoke-preview            인증을 취소하면 거둘 와펜 · 핀 · 등급(계산만)
 * POST /admin/hiking/summits/:id/revoke { reason }        인증 취소 — '인증 없는 기록'으로 내리고(admin_void), 남은 기록이 받쳐 주지 않는 받은 것을 거둔다
 * POST /admin/hiking/summits/:id/restore { reason }       되살리기 — 다시 인증으로, 받을 것을 다시 적는다(번호는 새로)
 * 운영자가 '굿즈 · 배지'로 증정한 것은 거두지 않는다(증정 기록이 따로 있다). 까닭은 작업 기록에 남는다(가드).
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { allMountains } from "../../storage/hiking.js";
import { listSummits, syncHikingAwards } from "../../storage/hikingStamps.js";
import { isWithdrawnMember } from "../../../shared/chatSupport.js";
import { goodsItem } from "../../../shared/goods.js";
import { hikingAwardsDue, hikingAwardId, type Summit } from "../../../shared/hikingStamps.js";
import { summitFlags, type AdminHikingAwardLoss, type AdminSummitRow, type MountainSpot } from "../../../shared/hikingSummitFlags.js";

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

export default router;
