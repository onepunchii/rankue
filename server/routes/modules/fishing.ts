/**
 * 낚시(2026-10-14) — 조과 기록의 첫 길. 지금은 운영자만 쓴다(server/lib/fishingAccess).
 *   GET    /api/hiq/fishing/catches      내 조과(최근 것부터, 500줄까지)
 *   POST   /api/hiq/fishing/catches      한 줄 적기
 *   DELETE /api/hiq/fishing/catches/:id  내 줄 지우기
 *   GET    /api/hiq/fishing/places       낚시터 찾기(지역 · 글자)
 *   GET    /api/hiq/fishing/crews        내가 든 크루
 *   GET    /api/hiq/fishing/trips        그 크루의 정출들 + 올해의 판(?crewId=)
 *   POST   /api/hiq/fishing/trips        정출 만들기(그 크루의 사람만)
 *   GET    /api/hiq/fishing/trips/:id    한 정출의 판 — 최대어 · 마릿수 · 잡어상(그 크루의 사람만 본다)
 * 값의 규칙은 shared/fishing.ts(cleanCatch). 남의 기록은 여기서 보이지 않는다 — 크루 소식 · 공개는 다음 단계에서 따로 정한다.
 */
import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { hiqCrewMembers, hiqCrews, hiqMembers, profiles } from "../../../shared/schema.js";
import { cleanTrip, seasonTable, tripBoard, type TripCatch } from "../../../shared/fishingTrip.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { fishingAllowed } from "../../lib/fishingAccess.js";
import { FISHING_PHOTO_CATEGORY, FISHING_THUMB_CATEGORY, cleanCatch, fishingKstDay, isOwnFishingPhotoUrl, type FishingCatch, type FishingPlace } from "../../../shared/fishing.js";

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
    lengthCm: r.length_cm == null ? null : Number(r.length_cm), count: Number(r.fish_count) || 1,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg), ji: r.ji == null ? null : Number(r.ji), released: r.released === true,
    photoUrl: r.photo_url ?? null, thumbUrl: r.thumb_url ?? null, note: r.note ?? null,
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
    // 정출에 붙이는 조과 — 그 정출의 크루에 든 사람만. 붙인 조과는 그 크루가 본다(정출판)
    const tripId = typeof req.body?.tripId === "string" && UUID.test(req.body.tripId) ? req.body.tripId : null;
    if (req.body?.tripId && !tripId) return sendError(res, 400, "정출을 찾을 수 없어요");
    if (tripId) {
        const [trip] = rowsOf(await db.execute(sql`select crew_id from fishing_trips where id = ${tripId}::uuid`));
        if (!trip || !(await inCrew(req.userId!, String(trip.crew_id)))) return sendError(res, 403, "그 크루의 정출에만 붙일 수 있어요");
    }
    // 사진은 둘 다 있거나 둘 다 없다 — 그리고 이 회원이 우리 저장소에 올린 것만
    if (v.photoUrl || v.thumbUrl) {
        if (!isOwnFishingPhotoUrl(v.photoUrl, req.userId!, FISHING_PHOTO_CATEGORY) || !isOwnFishingPhotoUrl(v.thumbUrl, req.userId!, FISHING_THUMB_CATEGORY)) return sendError(res, 400, "사진 주소가 올바르지 않아요");
    }
    const [row] = rowsOf(await db.execute(sql`
        insert into fishing_catches (member_id, fished_on, place, spot, species, length_cm, fish_count, weight_kg, ji, released, photo_url, thumb_url, note, trip_id)
        values (${req.userId!}, ${v.day}, ${v.place}, ${v.spot}, ${v.species}, ${v.lengthCm}, ${v.count}, ${v.weightKg}, ${v.ji}, ${v.released}, ${v.photoUrl}, ${v.thumbUrl}, ${v.note}, ${tripId}::uuid) returning *`));
    return sendSuccess(res, view(row));
}));

router.delete("/catches/:id", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "기록을 찾을 수 없어요");
    const gone = rowsOf(await db.execute(sql`delete from fishing_catches where id = ${req.params.id}::uuid and member_id = ${req.userId!} returning id`));
    if (!gone.length) return sendError(res, 404, "기록을 찾을 수 없어요");
    return sendSuccess(res, { id: req.params.id });
}));

/* ── 크루 정출판 — 정출마다 최대어 · 마릿수 · 잡어상, 한 해의 점수(shared/fishingTrip). 크루는 있는 크루(hiq_crews)를 그대로 쓴다 ── */

const myCrews = (memberId: string) => db.select({ id: hiqCrews.id, name: hiqCrews.name, emblem: hiqCrews.emblem }).from(hiqCrewMembers)
    .innerJoin(hiqCrews, eq(hiqCrews.id, hiqCrewMembers.crewId))
    .where(and(eq(hiqCrewMembers.memberId, memberId), sql`${hiqCrewMembers.role} <> 'pending'`));
async function inCrew(memberId: string, crewId: string): Promise<boolean> {
    if (!UUID.test(crewId)) return false;
    return (await myCrews(memberId)).some((c) => String(c.id) === crewId);
}
/** 정출에 붙은 조과들 — 이름과 함께(그 크루의 사람에게만 나간다) */
async function tripCatches(tripIds: readonly string[]): Promise<Map<string, (TripCatch & { id: string; weightKg: number | null; ji: number | null; released: boolean; thumbUrl: string | null; photoUrl: string | null })[]>> {
    const out = new Map<string, any[]>();
    // 아래에서 글자로 이어 붙이는 값이다 — uuid 꼴만 남긴다
    tripIds = tripIds.filter((id) => UUID.test(id));
    if (!tripIds.length) return out;
    const rows = rowsOf(await db.execute(sql`
        select c.id, c.trip_id, c.member_id, coalesce(m.name, '회원') as name, c.species, c.length_cm, c.fish_count, c.weight_kg, c.ji, c.released, c.thumb_url, c.photo_url
        from fishing_catches c left join hiq_members m on m.id::text = c.member_id
        where c.trip_id = any(${sql.raw(`array[${tripIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)}) order by c.created_at`));
    for (const r of rows) {
        const list = out.get(String(r.trip_id)) ?? [];
        list.push({ id: String(r.id), memberId: String(r.member_id), name: String(r.name), species: String(r.species), lengthCm: r.length_cm == null ? null : Number(r.length_cm), count: Number(r.fish_count) || 1, weightKg: r.weight_kg == null ? null : Number(r.weight_kg), ji: r.ji == null ? null : Number(r.ji), released: r.released === true, thumbUrl: r.thumb_url ?? null, photoUrl: r.photo_url ?? null });
        out.set(String(r.trip_id), list);
    }
    return out;
}
const tripView = (t: any) => ({ id: String(t.id), crewId: String(t.crew_id), day: String(t.fished_on), place: String(t.place), title: t.title ?? null });

router.get("/crews", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, (await myCrews(req.userId!)).map((c) => ({ id: String(c.id), name: c.name, emblem: c.emblem ?? null })));
}));

router.get("/trips", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = String(req.query.crewId ?? "");
    if (!(await inCrew(req.userId!, crewId))) return sendError(res, 403, "그 크루의 사람만 볼 수 있어요");
    const trips = rowsOf(await db.execute(sql`select * from fishing_trips where crew_id = ${crewId}::uuid order by fished_on desc, created_at desc limit 60`)).map(tripView);
    // UUID 는 위에서 꼴을 확인한 값만 들어간다(tripView 의 id 는 DB 가 준 uuid)
    const catches = await tripCatches(trips.map((t) => t.id).filter((id) => UUID.test(id)));
    const year = fishingKstDay(Date.now()).slice(0, 4);
    const boards = trips.map((t) => ({ trip: t, board: tripBoard(catches.get(t.id) ?? []) }));
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, {
        trips: boards.map(({ trip, board }) => ({ ...trip, people: board.members.length, fish: board.members.reduce((n, m) => n + m.fish, 0), top: board.members.find((m) => board.awards.biggest.includes(m.memberId)) ?? null })),
        year,
        season: seasonTable(boards.filter((b) => b.trip.day.startsWith(year)).map((b) => b.board)),
    });
}));

router.post("/trips", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = String(req.body?.crewId ?? "");
    if (!(await inCrew(req.userId!, crewId))) return sendError(res, 403, "그 크루의 사람만 정출을 만들 수 있어요");
    const c = cleanTrip(req.body, fishingKstDay(Date.now()));
    if (!c.ok) return sendError(res, 400, c.error);
    const [row] = rowsOf(await db.execute(sql`insert into fishing_trips (crew_id, fished_on, place, title, created_by) values (${crewId}::uuid, ${c.value.day}, ${c.value.place}, ${c.value.title}, ${req.userId!}) returning *`));
    return sendSuccess(res, tripView(row));
}));

router.get("/trips/:id", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "정출을 찾을 수 없어요");
    const [row] = rowsOf(await db.execute(sql`select * from fishing_trips where id = ${req.params.id}::uuid`));
    if (!row) return sendError(res, 404, "정출을 찾을 수 없어요");
    if (!(await inCrew(req.userId!, String(row.crew_id)))) return sendError(res, 403, "그 크루의 사람만 볼 수 있어요");
    const catches = (await tripCatches([String(row.id)])).get(String(row.id)) ?? [];
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, { trip: tripView(row), board: tripBoard(catches), catches });
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
