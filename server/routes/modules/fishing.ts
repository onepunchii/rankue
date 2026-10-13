/**
 * 낚시(2026-10-14) — 조과 기록의 첫 길. 지금은 운영자만 쓴다(server/lib/fishingAccess).
 *   GET    /api/hiq/fishing/catches      내 조과(최근 것부터, 500줄까지)
 *   POST   /api/hiq/fishing/catches      한 줄 적기
 *   DELETE /api/hiq/fishing/catches/:id  내 줄 지우기
 *   GET    /api/hiq/fishing/places       낚시터 찾기(지역 · 글자)
 * 값의 규칙은 shared/fishing.ts(cleanCatch). 남의 기록은 여기서 보이지 않는다 — 크루 소식 · 공개는 다음 단계에서 따로 정한다.
 */
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { hiqMembers, profiles } from "../../../shared/schema.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { fishingAllowed } from "../../lib/fishingAccess.js";
import { cleanCatch, fishingKstDay, type FishingCatch, type FishingPlace } from "../../../shared/fishing.js";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 로그인 + 낚시를 쓸 수 있는 회원 */
const gate = asyncHandler(async (req: AuthRequest, res: any, next: any) => {
    const [row] = await db.select({ id: hiqMembers.id, role: profiles.role }).from(hiqMembers)
        .leftJoin(profiles, eq(profiles.id, hiqMembers.profileId)).where(eq(hiqMembers.id, req.userId!)).limit(1);
    if (!fishingAllowed(row, row?.role)) return sendError(res, 403, "아직 쓸 수 없는 기능이에요");
    next();
});

const view = (r: any): FishingCatch => ({
    id: String(r.id), day: String(r.fished_on), place: String(r.place), spot: r.spot ?? null, species: String(r.species),
    lengthCm: r.length_cm == null ? null : Number(r.length_cm), count: Number(r.fish_count) || 1, note: r.note ?? null,
    createdAt: new Date(r.created_at).toISOString(),
});

router.get("/catches", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = rowsOf(await db.execute(sql`select * from fishing_catches where member_id = ${req.userId!} order by fished_on desc, created_at desc limit 500`));
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, rows.map(view));
}));

router.post("/catches", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const c = cleanCatch(req.body, fishingKstDay(Date.now()));
    if (!c.ok) return sendError(res, 400, c.error);
    const v = c.value;
    const [row] = rowsOf(await db.execute(sql`
        insert into fishing_catches (member_id, fished_on, place, spot, species, length_cm, fish_count, note)
        values (${req.userId!}, ${v.day}, ${v.place}, ${v.spot}, ${v.species}, ${v.lengthCm}, ${v.count}, ${v.note}) returning *`));
    return sendSuccess(res, view(row));
}));

router.delete("/catches/:id", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "기록을 찾을 수 없어요");
    const gone = rowsOf(await db.execute(sql`delete from fishing_catches where id = ${req.params.id}::uuid and member_id = ${req.userId!} returning id`));
    if (!gone.length) return sendError(res, 404, "기록을 찾을 수 없어요");
    return sendSuccess(res, { id: req.params.id });
}));

/**
 * 낚시터 찾기 — 지역(시도) · 글자(이름 · 시군구 · 어종). 60곳까지, 지역별 곳 수를 같이 준다.
 * 실은 자료는 받은 것을 걸러 넣은 것이고(server/scripts/fishing-load-places), 요금 · 전화는 오래된 값일 수 있어 자료 기준일을 같이 준다.
 */
router.get("/places", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const q = String(req.query.q ?? "").trim().slice(0, 30);
    const sido = String(req.query.sido ?? "").trim().slice(0, 20);
    const like = `%${q.replace(/[%_\\]/g, "")}%`;
    const [items, regions] = await Promise.all([
        db.execute(sql`
            select id, name, kind, sido, sigungu, address, species, fee, tel, data_date, count(*) over()::int as total from fishing_places
            where (${sido} = '' or sido = ${sido}) and (${q} = '' or name ilike ${like} or sigungu ilike ${like} or ${q} = any(species))
            order by name limit 60`),
        db.execute(sql`select sido, count(*)::int as n from fishing_places where sido is not null group by sido order by n desc`),
    ]);
    const list = rowsOf(items);
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, {
        total: Number(list[0]?.total) || 0,
        regions: rowsOf(regions).map((r) => ({ sido: String(r.sido), n: Number(r.n) })),
        items: list.map((r): FishingPlace => ({ id: String(r.id), name: String(r.name), kind: r.kind ?? null, sido: r.sido ?? null, sigungu: r.sigungu ?? null, address: r.address ?? null, species: Array.isArray(r.species) ? r.species.map(String) : [], fee: r.fee ?? null, tel: r.tel ?? null, dataDate: r.data_date ?? null })),
    });
}));

export default router;
