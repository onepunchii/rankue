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
 *   GET    /api/hiq/fishing/index-map    낚시지수 지도 — 지점 마흔아홉 곳에서 어종마다 그날이 어떤가(?day=)
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
import { getIndexMap, getPortBrief } from "../../services/fishingPort.js";
import { nearestWeather, type CatchWeather } from "../../../shared/fishingSpot.js";
import { rankColumn, rankRows, type FishingRankBoard, type FishingRankSpecies } from "../../../shared/fishingRank.js";
import { fishByName, fishRecords } from "../../../shared/fishingFish.js";
import { DECOR, DECOR_SLOTS, SLOT_KIND, cleanLayout, decorItem, decorProgress, resolveLayout, type CrewTankRow, type DecorCatch, type DecorLayout, type DecorRow, type TankView } from "../../../shared/fishingDecor.js";
import { GEAR_MAX, addLineChange, cleanGear, cleanLineChange, type FishingGear, type LineChange } from "../../../shared/fishingGear.js";
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
    lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), weather: (r.weather ?? null) as CatchWeather | null, isPublic: r.is_public === true,
    createdAt: new Date(r.created_at).toISOString(),
});

/** 그날 · 그 자리의 바다 — 가까운 낚시지수 지점(40km 안). 못 받으면 기록은 그대로 적는다 */
async function seaAt(day: string, lat: number, lng: number): Promise<CatchWeather | null> {
    try {
        const map = await getIndexMap(day);
        return map && map.day === day ? nearestWeather(map.spots, lat, lng) : null;
    } catch (e) {
        console.warn("[fishing] 그날 바다를 못 받았다", e instanceof Error ? e.message : e);
        return null;
    }
}

const gearView = (r: any): FishingGear => ({
    id: String(r.id), kind: r.kind, name: String(r.name), brand: r.brand ?? null, spec: r.spec ?? null, note: r.note ?? null,
    lineLog: Array.isArray(r.line_log) ? (r.line_log as LineChange[]) : [], createdAt: new Date(r.created_at).toISOString(),
});

router.get("/gear", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const rows = rowsOf(await db.execute(sql`select * from fishing_gear where member_id = ${req.userId!} order by kind, created_at desc limit ${GEAR_MAX}`));
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, rows.map(gearView));
}));

router.post("/gear", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const g = cleanGear(req.body);
    if (!g.ok) return sendError(res, 400, g.error);
    const [{ n }] = rowsOf(await db.execute(sql`select count(*)::int as n from fishing_gear where member_id = ${req.userId!}`));
    if (Number(n) >= GEAR_MAX) return sendError(res, 400, `장비는 ${GEAR_MAX}개까지 적을 수 있어요`);
    const v = g.value;
    const [row] = rowsOf(await db.execute(sql`insert into fishing_gear (member_id, kind, name, brand, spec, note) values (${req.userId!}, ${v.kind}, ${v.name}, ${v.brand}, ${v.spec}, ${v.note}) returning *`));
    return sendSuccess(res, gearView(row));
}));

router.post("/gear/:id/line", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "장비를 찾을 수 없어요");
    const c = cleanLineChange(req.body, fishingKstDay(Date.now()));
    if (!c.ok) return sendError(res, 400, c.error);
    const [cur] = rowsOf(await db.execute(sql`select * from fishing_gear where id = ${req.params.id}::uuid and member_id = ${req.userId!} and kind = 'reel'`));
    if (!cur) return sendError(res, 404, "릴을 찾을 수 없어요");
    const log = addLineChange(Array.isArray(cur.line_log) ? cur.line_log : [], c.value);
    const [row] = rowsOf(await db.execute(sql`update fishing_gear set line_log = ${JSON.stringify(log)}::jsonb where id = ${req.params.id}::uuid and member_id = ${req.userId!} returning *`));
    return sendSuccess(res, gearView(row));
}));

router.delete("/gear/:id", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "장비를 찾을 수 없어요");
    const gone = rowsOf(await db.execute(sql`delete from fishing_gear where id = ${req.params.id}::uuid and member_id = ${req.userId!} returning id`));
    if (!gone.length) return sendError(res, 404, "장비를 찾을 수 없어요");
    return sendSuccess(res, { id: req.params.id });
}));

router.get("/ranking/species", requireAuth, gate, asyncHandler(async (_req: AuthRequest, res: any) => {
    const rows = rowsOf(await db.execute(sql`select species, count(distinct member_id)::int as people from fishing_catches where is_public group by species order by people desc, species limit 60`));
    return sendSuccess(res, rows.map((r): FishingRankSpecies => ({ species: String(r.species), people: Number(r.people) })));
}));

router.get("/ranking", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const fish = fishByName(typeof req.query.species === "string" ? req.query.species : "");
    if (!fish) return sendError(res, 400, "어종을 골라 주세요");
    const col = sql.raw(rankColumn(fish.unit));
    const rows = rowsOf(await db.execute(sql`
        select * from (
            select distinct on (c.member_id) c.member_id, coalesce(nullif(p.nickname, ''), m.name) as name, c.${col} as value, c.fished_on as day, c.thumb_url
            from fishing_catches c join hiq_members m on m.id::text = c.member_id left join profiles p on p.id = m.profile_id
            where c.is_public and c.species = ${fish.name} and c.${col} is not null
            order by c.member_id, c.${col} desc, c.fished_on asc
        ) best order by value desc, day asc limit 200`));
    const board: FishingRankBoard = { species: fish.name, unit: fish.unit, rows: rankRows(rows, req.userId ?? null) };
    return sendSuccess(res, board);
}));

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
    const weather = v.lat != null && v.lng != null ? await seaAt(v.day, v.lat, v.lng) : null;
    const [row] = rowsOf(await db.execute(sql`
        insert into fishing_catches (member_id, fished_on, place, spot, species, length_cm, fish_count, weight_kg, ji, released, photo_url, thumb_url, note, trip_id, tide_sea, lat, lng, weather, is_public)
        values (${req.userId!}, ${v.day}, ${v.place}, ${v.spot}, ${v.species}, ${v.lengthCm}, ${v.count}, ${v.weightKg}, ${v.ji}, ${v.released}, ${v.photoUrl}, ${v.thumbUrl}, ${v.note}, ${tripId}::uuid, ${v.tideSea ?? null}, ${v.lat ?? null}, ${v.lng ?? null}, ${weather ? JSON.stringify(weather) : null}::jsonb, ${v.isPublic === true}) returning *`));
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

/** 낚시지수 지도 — 국립해양조사원이 지점 · 어종마다 매긴 단계. 못 받았으면 null(화면은 특보 지도만 그린다) */
router.get("/index-map", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day ?? "")) ? String(req.query.day) : null;
    res.setHeader("Cache-Control", "private, max-age=600");
    return sendSuccess(res, await getIndexMap(day).catch(() => null));
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

/* ── 수족관 꾸미기(shared/fishingDecor) — 장식은 조과 기록으로만. 받은 것은 fishing_decor_awards, 자리는 fishing_tanks ── */

async function decorCatches(memberId: string): Promise<DecorCatch[]> {
    return rowsOf(await db.execute(sql`select fished_on, spot, species, length_cm, fish_count, weight_kg, ji, released, photo_url is not null as photo, trip_id from fishing_catches where member_id = ${memberId}`))
        .map((r) => ({ day: String(r.fished_on), spot: r.spot ?? null, species: String(r.species), released: r.released === true, photo: r.photo === true, tripId: r.trip_id ? String(r.trip_id) : null, lengthCm: r.length_cm == null ? null : Number(r.length_cm), count: Number(r.fish_count) || 1, weightKg: r.weight_kg == null ? null : Number(r.weight_kg), ji: r.ji == null ? null : Number(r.ji) }));
}
/** 조건을 채운 장식을 받은 기록에 넣는다 — 몇 번째 주인(serial)은 max + 1, 한정은 그 수를 넘지 않게(겹치면 다시) */
async function awardDecor(memberId: string, list: readonly DecorCatch[]): Promise<Map<string, { serial: number; earnedAt: string }>> {
    const have = new Map(rowsOf(await db.execute(sql`select item_id, serial, earned_at from fishing_decor_awards where member_id = ${memberId}`))
        .map((r) => [String(r.item_id), { serial: Number(r.serial), earnedAt: new Date(r.earned_at).toISOString() }] as const));
    const prog = decorProgress(list);
    for (const d of DECOR) {
        if (have.has(d.id) || !prog[d.id]?.done) continue;
        const cap = d.limit ?? 2_147_483_647;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const [row] = rowsOf(await db.execute(sql`
                    insert into fishing_decor_awards (member_id, item_id, serial)
                    select ${memberId}, ${d.id}, coalesce(max(serial), 0) + 1 from fishing_decor_awards where item_id = ${d.id}
                    having coalesce(max(serial), 0) < ${cap}
                    on conflict (member_id, item_id) do nothing
                    returning serial, earned_at`));
                if (row) have.set(d.id, { serial: Number(row.serial), earnedAt: new Date(row.earned_at).toISOString() });
                break;
            } catch (e: any) {
                if (e?.code === "23505" && attempt < 4) continue;
                throw e;
            }
        }
    }
    return have;
}
function tankFish(list: readonly DecorCatch[]) {
    const by = new Map<string, number>();
    for (const c of list) { const n = c.species.trim(); if (n) by.set(n, (by.get(n) ?? 0) + Math.max(1, c.count || 1)); }
    const fish = [...by.entries()].map(([species, count]) => ({ species, count }));
    const seals = fishRecords(list).filter((r) => r.tier).map((r) => [r.fish.id, r.tier!.name] as [string, string]);
    return { fish, seals };
}
async function tankOf(memberId: string, mine: boolean): Promise<TankView> {
    const list = await decorCatches(memberId);
    const [have, [meRow], [tank]] = await Promise.all([
        awardDecor(memberId, list),
        db.select({ name: hiqMembers.name }).from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1),
        db.execute(sql`select layout from fishing_tanks where member_id = ${memberId}`).then(rowsOf),
    ]);
    const owned = new Set(have.keys());
    const layout = cleanLayout(tank?.layout ?? {}, owned);
    const { fish, seals } = tankFish(list);
    let items: DecorRow[] | null = null;
    if (mine) {
        const owners = new Map(rowsOf(await db.execute(sql`select item_id, count(*)::int as n from fishing_decor_awards group by item_id`)).map((r) => [String(r.item_id), Number(r.n)] as const));
        const prog = decorProgress(list);
        items = DECOR.map((d) => ({ id: d.id, cur: prog[d.id].cur, need: prog[d.id].need, have: owned.has(d.id), serial: have.get(d.id)?.serial ?? null, owners: owners.get(d.id) ?? 0, earnedAt: have.get(d.id)?.earnedAt ?? null }));
    }
    return { mine, name: String(meRow?.name ?? "회원"), fish, seals, layout, placed: resolveLayout(layout, owned), owned: owned.size, items };
}

router.get("/tank", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await tankOf(req.userId!, true));
}));

/** 한 칸 바꾸기 — item: 장식 id · "" = 비움 · null = 알아서 */
router.post("/tank/layout", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const slot = String(req.body?.slot ?? "");
    if (!(DECOR_SLOTS as readonly string[]).includes(slot)) return sendError(res, 400, "자리를 찾을 수 없어요");
    const item = req.body?.item;
    if (item !== null && item !== "") {
        const d = decorItem(typeof item === "string" ? item : "");
        if (!d || d.kind !== SLOT_KIND[slot as keyof typeof SLOT_KIND]) return sendError(res, 400, "그 자리에 놓을 수 없는 장식이에요");
        const [own] = rowsOf(await db.execute(sql`select 1 from fishing_decor_awards where member_id = ${req.userId!} and item_id = ${d.id}`));
        if (!own) return sendError(res, 403, "아직 받지 않은 장식이에요");
    }
    const owned = new Set(rowsOf(await db.execute(sql`select item_id from fishing_decor_awards where member_id = ${req.userId!}`)).map((r) => String(r.item_id)));
    const [cur] = rowsOf(await db.execute(sql`select layout from fishing_tanks where member_id = ${req.userId!}`));
    const next: Record<string, string> = { ...cleanLayout(cur?.layout ?? {}, owned) };
    // 같은 장식을 다른 칸에 두었으면 그 칸은 '알아서'로
    if (typeof item === "string" && item) for (const k of Object.keys(next)) if (next[k] === item) delete next[k];
    if (item === null) delete next[slot]; else next[slot] = String(item);
    const layout: DecorLayout = cleanLayout(next, owned);
    await db.execute(sql`insert into fishing_tanks (member_id, layout, updated_at) values (${req.userId!}, ${JSON.stringify(layout)}::jsonb, now())
        on conflict (member_id) do update set layout = excluded.layout, updated_at = now()`);
    return sendSuccess(res, { layout, placed: resolveLayout(layout, owned) });
}));

/** 크루원 수족관 — 같은 낚시 크루의 사람만. 잡은 곳 · 날은 나가지 않는다(어종과 마릿수 · 장식만) */
router.get("/crews/:crewId/tanks", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = String(req.params.crewId ?? "");
    if (!(await inCrew(req.userId!, crewId))) return sendError(res, 403, "그 크루의 사람만 볼 수 있어요");
    const rows = rowsOf(await db.execute(sql`
        select m.id::text as id, m.name,
            (select count(distinct c.species)::int from fishing_catches c where c.member_id = m.id::text) as species,
            (select count(*)::int from fishing_decor_awards a where a.member_id = m.id::text) as decor,
            (select c.species from fishing_catches c where c.member_id = m.id::text group by c.species order by sum(c.fish_count) desc, c.species limit 1) as top
        from hiq_crew_members cm join hiq_members m on m.id = cm.member_id
        where cm.crew_id = ${crewId}::uuid and cm.role <> 'pending'
        order by species desc, m.name limit 60`));
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, rows.map((r): CrewTankRow => ({ memberId: String(r.id), name: String(r.name ?? "회원"), species: Number(r.species) || 0, decor: Number(r.decor) || 0, me: String(r.id) === req.userId, top: r.top ? String(r.top) : null })));
}));

router.get("/tank/member/:memberId", requireAuth, gate, asyncHandler(async (req: AuthRequest, res: any) => {
    const memberId = String(req.params.memberId ?? ""), crewId = String(req.query.crewId ?? "");
    if (!UUID.test(memberId)) return sendError(res, 404, "수족관을 찾을 수 없어요");
    if (memberId === req.userId) return sendSuccess(res, await tankOf(memberId, true));
    if (!(await inCrew(req.userId!, crewId)) || !(await inCrew(memberId, crewId))) return sendError(res, 403, "같은 크루의 수족관만 볼 수 있어요");
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await tankOf(memberId, false));
}));

export default router;
