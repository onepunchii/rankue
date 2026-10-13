/**
 * 낚시(2026-10-14) — 조과 기록의 첫 길. 지금은 운영자만 쓴다(server/lib/fishingAccess).
 *   GET    /api/hiq/fishing/catches      내 조과(최근 것부터, 500줄까지)
 *   POST   /api/hiq/fishing/catches      한 줄 적기
 *   DELETE /api/hiq/fishing/catches/:id  내 줄 지우기
 *   GET    /api/hiq/fishing/places       낚시터 찾기(지역 · 글자)
 *   GET    /api/hiq/fishing/sea          오늘의 바다 — 해역 일곱 곳의 풍랑특보(기상청)
 *   GET    /api/hiq/fishing/reservoirs         민물 — 고른 저수지들의 저수율(?codes= 여섯 곳까지 · 없으면 처음 보이는 여섯 곳)
 *   GET    /api/hiq/fishing/reservoirs/search  시군 이름으로 저수지 찾기(?county=)
 *   GET    /api/hiq/fishing/boats        낚시어선 명부 찾기(?q= 지역 · 항 · 배 이름) — 신고 정보 그대로
 *   GET    /api/hiq/fishing/market       위판장 소식 — 지난 이레 어종별 경매 건수(해양수산부)
 *   GET    /api/hiq/fishing/ports/:code  항구 브리핑 — 조석 곡선 · 해와 달 · 지금의 바다 · 바다낚시지수(?day=)
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
import { getSeaNow } from "../../services/fishingSea.js";
import { getPortBrief } from "../../services/fishingPort.js";
import { getMarketWeek } from "../../services/fishingMarket.js";
import { cleanBoatQuery, type FishingBoat } from "../../../shared/fishingBoats.js";
import { getReservoirs, searchReservoirs } from "../../services/fishingReservoir.js";
import { RESERVOIR_MAX, RESERVOIR_STARTERS, cleanCountyQuery, isReservoirCode, type ReservoirRef } from "../../../shared/fishingReservoir.js";
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
    photoUrl: r.photo_url ?? null, thumbUrl: r.thumb_url ?? null, note: r.note ?? null, tideSea: r.tide_sea === "west" || r.tide_sea === "south" ? r.tide_sea : null,
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
        insert into fishing_catches (member_id, fished_on, place, spot, species, length_cm, fish_count, weight_kg, ji, released, photo_url, thumb_url, note, trip_id, tide_sea)
        values (${req.userId!}, ${v.day}, ${v.place}, ${v.spot}, ${v.species}, ${v.lengthCm}, ${v.count}, ${v.weightKg}, ${v.ji}, ${v.released}, ${v.photoUrl}, ${v.thumbUrl}, ${v.note}, ${tripId}::uuid, ${v.tideSea ?? null}) returning *`));
    return sendSuccess(res, view(row));
}));

router.delete("/catches/:id", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "기록을 찾을 수 없어요");
    const gone = rowsOf(await db.execute(sql`delete from fishing_catches where id = ${req.params.id}::uuid and member_id = ${req.userId!} returning id`));
    if (!gone.length) return sendError(res, 404, "기록을 찾을 수 없어요");
    return sendSuccess(res, { id: req.params.id });
}));

/** 오늘의 바다 — 받아 둔 특보 현황(15분보다 낡았으면 그 자리에서 다시 받는다). 받지 못했으면 null(화면은 판을 그리지 않는다) */
router.get("/sea", requireAuth, gate, asyncHandler(async (_req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "private, max-age=120");
    return sendSuccess(res, await getSeaNow().catch(() => null));
}));

/**
 * 낚시어선 명부 — 받아 둔 신고 정보(fishing_boats)에서 지역 · 선적항 · 배 이름으로 찾는다. 60척까지, 많이 등록된 시군 열두 곳을 같이 준다.
 * 유효기간이 지난 배도 준다(화면이 '지남'이라고 적는다 — 숨기면 '없는 배'로 보인다).
 */
router.get("/boats", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const q = cleanBoatQuery(req.query.q);
    const like = `%${q ?? ""}%`;
    const [items, top] = await Promise.all([
        q ? db.execute(sql`
            select id, name, region, port, tons, passengers, valid_until, count(*) over()::int as total from fishing_boats
            where replace(region, ' ', '') ilike ${like} or replace(coalesce(port, ''), ' ', '') ilike ${like} or replace(name, ' ', '') ilike ${like}
            order by region, name limit 60`).then(rowsOf) : Promise.resolve([] as any[]),
        db.execute(sql`select region, count(*)::int as n from fishing_boats where region <> '' group by region order by n desc limit 12`).then(rowsOf),
    ]);
    const view = (r: any): FishingBoat => ({ id: String(r.id), name: String(r.name), region: String(r.region ?? ""), port: r.port ?? null, tons: r.tons == null ? null : Number(r.tons), passengers: r.passengers == null ? null : Number(r.passengers), validUntil: r.valid_until ? (r.valid_until instanceof Date ? new Date(r.valid_until.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : String(r.valid_until).slice(0, 10)) : null });
    res.setHeader("Cache-Control", "private, max-age=600");
    return sendSuccess(res, { total: items[0]?.total ?? 0, items: items.map(view), top: top.map((r: any) => ({ region: String(r.region), n: Number(r.n) })) });
}));

/** 시군 이름으로 저수지 찾기 — 두 글자 이상의 한글. 못 받았으면 null */
router.get("/reservoirs/search", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const county = cleanCountyQuery(req.query.county);
    if (!county) return sendError(res, 400, "시군 이름을 두 글자 넘게 적어 주세요");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return sendSuccess(res, await searchReservoirs(county).catch(() => null));
}));

/**
 * 고른 저수지들의 저수율 — 화면이 기기에 담아 둔 것(코드 · 이름 · 주소)을 보낸다. 이름 · 주소는 화면에 도로 보여 줄 글이라 길이만 자른다.
 * 아무것도 안 보내면 처음 보이는 여섯 곳.
 */
router.get("/reservoirs", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    let refs: ReservoirRef[] = [...RESERVOIR_STARTERS];
    const raw = String(req.query.pick ?? "");
    if (raw) {
        const picked = raw.split("|").map((s) => s.split("~")).filter((p) => isReservoirCode(p[0]))
            .map((p) => ({ code: p[0], name: String(p[1] ?? "").replace(/[^가-힣0-9A-Za-z ]/g, "").slice(0, 16) || "저수지", county: String(p[2] ?? "").replace(/[^가-힣 ]/g, "").slice(0, 16) }));
        if (picked.length) refs = picked.slice(0, RESERVOIR_MAX);
    }
    res.setHeader("Cache-Control", "private, max-age=900");
    return sendSuccess(res, await getReservoirs(refs).catch(() => []));
}));

/** 위판장 소식 — 받아 둔 건수로 만든 한 주의 표. 받은 것이 없으면 null(화면은 구역을 그리지 않는다) */
router.get("/market", requireAuth, gate, asyncHandler(async (_req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "private, max-age=900");
    return sendSuccess(res, await getMarketWeek().catch(() => null));
}));

/** 항구 브리핑 — 받아 둔 공공 자료를 엮은 한 장. 조석을 못 받았으면 null(화면은 '잠시 뒤에'를 적는다). 모르는 항구는 404 */
router.get("/ports/:code", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const code = String(req.params.code ?? "");
    if (!/^DT_\d{4}$/.test(code)) return sendError(res, 404, "항구를 찾을 수 없어요");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day ?? "")) ? String(req.query.day) : null;
    res.setHeader("Cache-Control", "private, max-age=300");
    return sendSuccess(res, await getPortBrief(code, day).catch(() => null));
}));

/* ── 크루 정출판 — 정출마다 최대어 · 마릿수 · 잡어상, 한 해의 점수(shared/fishingTrip). 크루는 있는 크루(hiq_crews)를 그대로 쓴다 ── */

const myCrews = (memberId: string) => db.select({ id: hiqCrews.id, name: hiqCrews.name, emblem: hiqCrews.emblem }).from(hiqCrewMembers)
    .innerJoin(hiqCrews, eq(hiqCrews.id, hiqCrewMembers.crewId))
    // 낚시 크루만 — 당구 · 골프 · 산악회는 여기 섞이지 않는다(2026-10-14 오너: "크루가 섞여 있다")
    .where(and(eq(hiqCrewMembers.memberId, memberId), sql`${hiqCrewMembers.role} <> 'pending'`, eq(hiqCrews.sportCategory, "FISHING")));
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
