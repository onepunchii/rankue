/**
 * 등산 — 공개 읽기(2026-10-13). 산 허브 · 목록 · 산 한 곳 · 산의 날씨. 로그인 없이 열리고 아무것도 쓰지 않는다.
 * 자료는 server/storage/hiking(표 hiking_*), 규칙은 shared/hikingMountains · hikingPage.
 * 당구 · 골프의 라우트와 섞지 않는다 — 등산은 /api/hiq/hiking 아래에만 산다.
 */
import { Router, type NextFunction, type Response } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { allMountains, getMountainDetail, mountainById, mountainBySlug, nearbyMountains, type MountainSummary } from "../../storage/hiking.js";
import { trailheadPoint, type SummitBase } from "../../../shared/hikingSummitWx.js";
import { addSummit, listHikingAwards, listSummits, removeRecord, syncHikingAwards, CREW_TOGETHER, crewSummits } from "../../storage/hikingStamps.js";
import { addTrip, listTrips } from "../../storage/hikingTrips.js";
import { cleanTrip } from "../../../shared/hikingTrail.js";
import { addPhoto, appealPhoto, listMountainPhotos, listPhotos, photoCounts, removePhoto, setPhotoPublic } from "../../storage/hikingPhotos.js";
import { HIKING_GALLERY_LIMIT, HIKING_GALLERY_MAX, HIKING_PHOTO_CATEGORY, HIKING_PHOTO_DAILY_MAX, HIKING_PHOTO_LABEL, HIKING_PHOTO_PER_MOUNTAIN_MAX, HIKING_THUMB_CATEGORY, isOwnHikingPhotoUrl, validPhotoSize } from "../../../shared/hikingPhotos.js";
import { HIKING_ALBUM_MAX, groupHikingAlbum, type AlbumMountainInfo } from "../../../shared/hikingAlbum.js";
import { deleteBlobs, isOnOwnBlobHost } from "../../utils/blob.js";
import { checkHiking, requireHikingAccess } from "../../middleware/hikingAccess.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { distM } from "../../../shared/hikingGeo.js";
import { judgeSummit, summitHint } from "../../../shared/hikingStamps.js";
import { getCourseWeather } from "../../services/golfWeather.js";
import { mountObsAll } from "../../services/hikingMountObs.js";
import { fireRiskAll } from "../../services/hikingFireRisk.js";
import { fireFor } from "../../../shared/hikingFireRisk.js";
import { obsFresh, stationFor } from "../../../shared/hikingMountObs.js";
import { HIKING_LISTS, HIKING_REGIONS, HIKING_TRAITS, hikingGroup, hikingRegion, inHikingGroup } from "../../../shared/hikingMountains.js";
import { toMountainPoint, type MountainPoint } from "../../../shared/hikingNear.js";
import { HIKING_NEARBY_RADIUS_KM, hikingNearbyNames, hikingNearbyWord, isHikingNearbyKind } from "../../../shared/hikingAround.js";

const router = Router();
const PUBLIC_CACHE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
/** 목록 한 번에 주는 산의 수 — 권역 하나가 700곳쯤이다 */
const LIST_MAX = 1000;

/** 허브 — 명산(지도에 찍는 산) · 권역마다의 수 · 목록마다의 수 */
router.get("/hub", asyncHandler(async (_req: any, res: any) => {
    const all = await allMountains();
    const famous = all.filter((m) => m.tier === 1);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, {
        counts: { total: all.length, famous: famous.length, courses: all.reduce((a, m) => a + m.courses, 0), withCourse: all.filter((m) => m.courses > 0).length },
        famous,
        regions: HIKING_REGIONS.map((r) => ({ id: r.id, name: r.name, total: all.filter((m) => m.region === r.id).length, famous: famous.filter((m) => m.region === r.id).length })),
        lists: HIKING_LISTS.map((l) => ({ id: l.id, name: l.name, short: l.short, count: all.filter((m) => m.lists.includes(l.id)).length })),
        traits: HIKING_TRAITS.map((t) => ({ id: t.id, name: t.name, how: t.how, count: all.filter((m) => m.traits.includes(t.id)).length })),
    });
}));

/** 목록 — 권역 · 목록 · 특성 · 이름으로 거른다. 명산 먼저, 높은 산부터(저장소의 순서) */
router.get("/mountains", asyncHandler(async (req: any, res: any) => {
    const region = hikingRegion(String(req.query.region ?? ""))?.id ?? null;
    // list 는 공식 목록이거나 특성(높이 · 섬)이다 — 화면의 주소(/hiking/lists/<id>)가 둘을 같이 쓴다
    const group = hikingGroup(String(req.query.list ?? ""));
    const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 30);
    let out: MountainSummary[] = await allMountains();
    if (region) out = out.filter((m) => m.region === region);
    if (group) out = out.filter((m) => inHikingGroup(group, m));
    if (q) out = out.filter((m) => m.name.toLowerCase().includes(q));
    // 목록의 산은 그 목록의 높이 순이 읽기 좋다(100대 명산은 저장소가 이미 목록 순번으로 준다)
    if (group && group.id !== "kfs100") out = [...out].sort((a, b) => (b.heightM ?? 0) - (a.heightM ?? 0));
    res.set("Cache-Control", q ? "public, max-age=60" : PUBLIC_CACHE);
    return sendSuccess(res, { total: out.length, items: out.slice(0, LIST_MAX) });
}));

/**
 * 산의 자리 표 — '내 근처의 산'을 기기에서 셈하라고 주는 것(shared/hikingNear). **요청의 값을 하나도 읽지 않는다**:
 * 내 위치를 서버로 보내지 않게 하려고, 누구에게나 같은 표를 주고 가까운 산은 화면이 고른다.
 */
router.get("/points", asyncHandler(async (_req: any, res: any) => {
    const points = (await allMountains()).map(toMountainPoint).filter((p): p is MountainPoint => p !== null);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { points });
}));

/** 산 한 곳 — 글 · 코스(선) · 지점 · 가까운 산 */
router.get("/mountains/:slug", asyncHandler(async (req: any, res: any) => {
    const d = await getMountainDetail(String(req.params.slug));
    if (!d) return sendError(res, 404, "없는 산이에요");
    const near = nearbyMountains(await allMountains(), d);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { ...d, nearby: near });
}));

/** 산의 들머리(코스의 가장 낮은 곳) — 코스 선을 다 읽어야 해서 인스턴스가 6시간 기억한다. 못 구하면 null */
const trailheads = new Map<string, { at: number; v: { lat: number; lng: number; m: number } | null }>();
async function trailheadOf(slug: string, heightM: number | null): Promise<{ lat: number; lng: number; m: number } | null> {
    const hit = trailheads.get(slug);
    if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.v;
    const d = await getMountainDetail(slug).catch(() => null);
    const v = d ? trailheadPoint(heightM, d.courseList) : null;
    trailheads.set(slug, { at: Date.now(), v });
    return v;
}

/** 산의 날씨 — 들머리 자리의 격자(기상청 단기 · 중기), 들머리를 모르면 정상 좌표의 격자. 받아 둔 것이 낡았으면 그 자리에서 새로 받는다 */
router.get("/mountains/:slug/weather", asyncHandler(async (req: any, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    // 산 아래의 예보는 들머리(코스의 가장 낮은 곳) 자리의 격자에서 받는다 — 정상 좌표의 격자는 이미 그 높이만큼 낮아서 '산 아래'가 아니다.
    // 들머리를 모르는 산(코스가 없거나 높이 자료를 못 믿는 산)은 예전대로 정상 좌표의 격자, 정상 칸은 없다(shared/hikingSummitWx).
    const base = await trailheadOf(m.slug, m.heightM);
    const at = base ?? (m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng } : null);
    // 산 위 관측(산악기상관측소 — 이름 · 시군이 둘 다 맞는 산에만, shared/hikingMountObs). 예보와 같이 받는다 — 못 받아도 예보는 그대로
    // 산불 위험(시군구 — shared/hikingFireRisk)도 같이. 12시간 넘은 분석은 싣지 않는다
    const [weather, stations, fires] = await Promise.all([
        at ? getCourseWeather({ lat: at.lat, lng: at.lng }, { fetch: true }).catch((e) => { console.error("[HikingWeather]", e); return null; }) : Promise.resolve(null),
        mountObsAll().catch(() => null),
        fireRiskAll().catch(() => null),
    ]);
    const hit = stations ? stationFor(stations, m) : null;
    const obs = hit && obsFresh(hit, Date.now()) ? hit : null;
    const fireHit = fires ? fireFor(fires, m) : null;
    const fire = fireHit && Date.now() - Date.parse(fireHit.at) < 12 * 3600_000 ? fireHit : null;
    res.set("Cache-Control", weather || obs || fire ? "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" : "no-store");
    const summit: SummitBase | null = weather && base && m.heightM != null ? { heightM: m.heightM, baseM: base.m } : null;
    if (!weather && !obs && !fire) return sendSuccess(res, null);
    return sendSuccess(res, weather ? { ...weather, summit, obs, fire } : { days: [], hours: [], summit: null, obs, fire });
}));

// ── 산 근처의 맛집 · 카페(2026-10-13) ─────────────────────────────────────
// 네이버 지역 검색을 그 자리에서 불러 그대로 돌려준다 — 골프장 '근처'(golfCourses 의 /:slug/nearby)와 같은 약관 · 같은 규칙이다(shared/hikingAround 머리말).
// 응답은 no-store 이고 순서 · 낱말도 그대로다. 어디에도 저장하지 않고, 검색엔진용 화면(server/seo/hiking)에도 싣지 않는다.
// 검색어는 서버가 만든다 — 산 이름(과 시군구)에 정해 둔 낱말(맛집 · 카페)을 붙인 것뿐이다. 손님이 친 말은 받지 않는다(아무 말이나 받아 주면 남의 검색 대리가 된다).
// 응답의 query 는 실제로 답을 낸 검색어다 — 화면의 '네이버 지도에서 더 보기'가 그 말로 연다.
// 하루 한도를 한 사람이 태우지 못하게 인스턴스 안에서 IP 당 1분 30회로 막는다(골프의 막이와 같은 값 — 서버리스라 느슨한 막이다).
const nearbyHits = new Map<string, { n: number; until: number }>();
function nearbyAllow(ip: string, now = Date.now()): boolean {
    if (nearbyHits.size > 5000) nearbyHits.clear();
    const h = nearbyHits.get(ip);
    if (!h || h.until < now) { nearbyHits.set(ip, { n: 1, until: now + 60_000 }); return true; }
    return ++h.n <= 30;
}
router.get("/mountains/:slug/nearby", asyncHandler(async (req: any, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const kind = isHikingNearbyKind(req.query.kind) ? req.query.kind : "food";
    res.set("Cache-Control", "no-store");
    if (!nearbyAllow(String(req.ip ?? ""))) return sendError(res, 429, "잠시 뒤에 다시 시도해 주세요");
    const { searchNearbyWord } = await import("../../services/naverLocal.js");
    // 정상의 자리(at)는 다른 고장의 같은 이름 산이 낸 답을 통째로 버리는 데만 쓴다 — 줄을 거르거나 다시 줄 세우지 않는다
    const target = { names: hikingNearbyNames(m), at: m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng, radiusKm: HIKING_NEARBY_RADIUS_KM } : null };
    const r = await searchNearbyWord(target, hikingNearbyWord(kind));
    if (!r.ok) return sendError(res, r.reason === "nokey" ? 501 : r.reason === "quota" ? 429 : 502, "지금은 불러올 수 없어요", `NEARBY_${r.reason.toUpperCase()}`);
    return sendSuccess(res, { query: r.query, items: r.items });
}));

// ── 내 도장(등산을 쓸 수 있는 회원만) ────────────────────────────────────
const outSummit = (s: { id: string; mountainId: string; at: Date; verified: boolean }) => ({ id: s.id, mountainId: s.mountainId, at: s.at.toISOString(), verified: s.verified });
const outAward = (a: { id: string; kind: string; key: string; serial: number; earnedAt: Date }) => ({ id: a.id, kind: a.kind, key: a.key, serial: a.serial, earnedAt: a.earnedAt.toISOString() });

/** 내 기록과 받은 것 — 읽기만. 도장첩 · 배낭 · 홈이 이것 하나로 그린다 */
router.get("/me/stamps", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const [summits, awards] = await Promise.all([listSummits(req.userId!), listHikingAwards(req.userId!)]);
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { summits: summits.map(outSummit), awards: awards.map(outAward) });
}));

/**
 * 정상 인증 — 지금 위치가 그 산의 정상에서 SUMMIT_RADIUS_M 안이면 인증 도장이 찍힌다.
 * **좌표는 저장하지 않는다**: 서버가 거리를 재고 인증 여부와 거리 구간만 남긴다(골프의 현장 인증과 같은 원칙).
 * 인증이 안 되면 아무것도 적지 않고 까닭만 돌려준다. 같은 산의 인증은 하루에 한 번.
 */
router.post("/summits", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await mountainById(String(req.body?.mountainId ?? ""));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    const acc = req.body?.accuracy == null ? null : Number(req.body.accuracy);
    const hasFix = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const judged = m.lat == null || m.lng == null
        ? { verified: false, bucket: "no-fix" as const, reason: "no-summit" as const }
        : judgeSummit(hasFix ? distM(lat, lng, m.lat, m.lng) : null, acc);
    if (!judged.verified) return sendSuccess(res, { verified: false, reason: judged.reason, bucket: judged.bucket, hint: summitHint(judged.reason, judged.bucket), added: false, awards: [] });
    const now = Date.now();
    const added = await addSummit(req.userId!, m.id, { atMs: now, verified: true, bucket: judged.bucket });
    const fresh = added ? await syncHikingAwards(req.userId!, await allMountains(), (await listSummits(req.userId!)).map((s) => ({ mountainId: s.mountainId, at: s.at, verified: s.verified }))) : [];
    return sendSuccess(res, { verified: true, reason: "ok", bucket: judged.bucket, hint: null, added, awards: fresh.map(outAward) });
}));

/** 인증 없이 적는 기록("다녀왔어요") — 흐린 도장이 된다(도장첩의 칸은 차지 않는다). 날짜를 안 주면 오늘 */
router.post("/summits/record", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const m = await mountainById(String(req.body?.mountainId ?? ""));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const date = String(req.body?.date ?? "");
    // 그날 낮 12시(한국 시각). 앞날은 받지 않는다
    const atMs = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00+09:00`) : Date.now();
    if (!Number.isFinite(atMs) || atMs > Date.now() + 3_600_000 || atMs < Date.parse("1950-01-01T00:00:00Z")) return sendError(res, 400, "날짜를 다시 골라 주세요");
    const added = await addSummit(req.userId!, m.id, { atMs, verified: false, bucket: null });
    return sendSuccess(res, { added });
}));

/** 인증 없는 기록 지우기 — 본인 것만. 인증 도장은 지우지 않는다 */
router.delete("/summits/:id", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return sendError(res, 404, "없는 기록이에요");
    const ok = await removeRecord(req.userId!, String(req.params.id));
    return ok ? sendSuccess(res, { removed: true }) : sendError(res, 404, "없는 기록이에요");
}));

// ── 산행(길 띠를 마치고 남기는 요약) ─────────────────────────────────────
const outTrip = (t: { id: string; mountainId: string; courseId: string | null; startedAt: Date; endedAt: Date; km: number; gainM: number; reachedSummit: boolean }) =>
    ({ id: t.id, mountainId: t.mountainId, courseId: t.courseId, startedAt: t.startedAt.toISOString(), endedAt: t.endedAt.toISOString(), km: t.km, gainM: t.gainM, reachedSummit: t.reachedSummit });

/** 내 산행(새 것부터) — 읽기만 */
router.get("/me/trips", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { trips: (await listTrips(req.userId!)).map(outTrip) });
}));

/**
 * 산행 한 번을 남긴다 — **좌표를 받지 않는다**(본문에 실려 와도 읽지 않는다). 기기가 센 요약(시간 · 길 위의 거리 · 오른 높이)만 적는다.
 * 너무 짧거나 말이 안 되는 값은 적지 않고 saved:false 로 답한다(shared/hikingTrail.cleanTrip).
 */
router.post("/trips", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const b = req.body ?? {};
    const m = await mountainById(String(b.mountainId ?? ""));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const trip = cleanTrip({
        mountainId: m.id, courseId: typeof b.courseId === "string" && b.courseId ? b.courseId : null,
        startedAt: Date.parse(String(b.startedAt ?? "")), endedAt: Date.parse(String(b.endedAt ?? "")), km: Number(b.km), gainM: Number(b.gainM), reachedSummit: b.reachedSummit === true,
    }, Date.now());
    if (!trip) return sendSuccess(res, { saved: false });
    return sendSuccess(res, { saved: await addTrip(req.userId!, trip) });
}));

// ── 산행 사진 ────────────────────────────────────────────────────────
// 2026-10-13 오너: "사진 공개가 기본인데 본인이 공개 비공개 할 수 있게, 골프에 골프장 목록에 사진 올리는 것처럼."
// 올린 사진은 그 산의 화면에 바로 보인다(사전 승인 없음) — 그래서 신고 · 차단 · 자동 가림 · 이의제기가 같이 간다(신고는 POST /community/reports, 대상 hiking_photo).
const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 보는 사람(로그인했으면) — 서명된 쿠키만 믿는다. 누구나 여는 길이라 없어도 된다 */
const viewerOf = (req: any): string | null => req.signedCookies?.hiq_user_id ?? null;
/**
 * 공개로 내놓을 때만 보는 문 — 등산을 쓸 수 있는 회원인가 · 약관에 동의했는가(정지된 계정도 여기서 막힌다).
 * 비공개로 돌리기 · 지우기 · 이의제기(내 것을 거두거나 지키는 쪽)는 로그인만 본다 — 등산의 문이 닫혀도, 약관이 바뀌어도 올린 사람은 거둘 수 있어야 한다.
 */
const publishing = (req: AuthRequest) => req.body?.isPublic === true;
const hikingIfPublishing = (req: AuthRequest, res: Response, next: NextFunction) => { if (!publishing(req)) return next(); checkHiking(req, res, next).catch(next); };
const termsIfPublishing = (req: AuthRequest, res: Response, next: NextFunction) => { if (!publishing(req)) return next(); requireTermsAccepted(req, res, next).catch(next); };

/**
 * 이 산의 사진 — **누구에게나 열려 있다**(산 화면이 그렇다). 공개 · 안 가려진 것만, 새 것부터.
 * 보는 사람이 로그인했으면 그 사람이 차단한 회원의 사진을 뺀다 — 사람마다 답이 다르니 공용 캐시에 두지 않는다.
 * 올린 사람의 이름과 달까지의 날짜만 싣는다.
 */
router.get("/mountains/:slug/photos", asyncHandler(async (req: any, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || HIKING_GALLERY_LIMIT, 1), HIKING_GALLERY_MAX);
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, { photos: await listMountainPhotos(m.id, viewerOf(req), limit) });
}));

/** 내 사진(새 것부터) — ?mountainId= 를 주면 그 산의 것만. 올린 사람만 읽는다(비공개 · 가려진 것까지) */
router.get("/me/photos", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const mountainId = typeof req.query.mountainId === "string" && req.query.mountainId ? req.query.mountainId.slice(0, 60) : null;
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { photos: await listPhotos(req.userId!, mountainId) });
}));

/**
 * 내 사진첩 — 내가 올린 사진을 산마다 묶어 한 번에(새로 올린 산부터, 사진은 새 것부터). 올린 사람만 읽는다(비공개 · 가려진 것까지).
 * 산의 이름 · 높이 · 권역은 기억해 둔 산의 표에서 붙인다 — 자리는 싣지 않는다. 표에 없는 산의 사진은 뺀다(shared/hikingAlbum).
 * 끝(HIKING_ALBUM_MAX)보다 한 장 더 읽어, 넘쳤는지를 capped 로 알린다.
 */
router.get("/me/album", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const photos = await listPhotos(req.userId!, null, HIKING_ALBUM_MAX + 1);
    const known = new Map<string, AlbumMountainInfo>();
    for (const id of new Set(photos.map((p) => p.mountainId))) {
        const m = await mountainById(id);
        if (m) known.set(id, { id: m.id, slug: m.slug, name: m.name, heightM: m.heightM, region: m.region });
    }
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, groupHikingAlbum(photos, (id) => known.get(id)));
}));

/**
 * 사진 한 장을 적는다 — 파일은 화면이 먼저 POST /api/hiq/upload 로 올리고(서버가 사진 정보를 걷는다), 여기에는 그 주소 둘만 온다.
 * 우리 업로드 API 가 **이 회원에게** 만들어 준 등산 사진 주소만 받는다(남의 사진 · 바깥 주소를 적어 넣지 못하게). **좌표는 받지 않는다.**
 * 공개 여부: 화면이 isPublic 을 실어 보낸다(기본은 공개 — shared/hikingPhotos HIKING_PHOTO_DEFAULT_PUBLIC). 실려 오지 않은 요청은 비공개로 적는다 —
 * "내 사진첩에만 담겨요"라고 적힌 옛 화면이 아직 떠 있는 기기에서 온 것이다.
 */
router.post("/photos", ...requireHikingAccess, termsIfPublishing, asyncHandler(async (req: AuthRequest, res: any) => {
    const b = req.body ?? {};
    const m = await mountainById(String(b.mountainId ?? ""));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const width = Number(b.width), height = Number(b.height);
    if (!isOwnHikingPhotoUrl(b.url, req.userId!, HIKING_PHOTO_CATEGORY) || !isOwnHikingPhotoUrl(b.thumbUrl, req.userId!, HIKING_THUMB_CATEGORY) || !isOnOwnBlobHost(b.url) || !isOnOwnBlobHost(b.thumbUrl) || !validPhotoSize(width, height)) {
        return sendError(res, 400, "사진을 다시 올려 주세요");
    }
    // 못 적은 사진은 저장소에 남기지 않는다(내 것임을 위에서 확인했다). 서버리스라 기다린다
    const drop = () => deleteBlobs([b.url, b.thumbUrl]);
    const n = await photoCounts(req.userId!, m.id);
    if (n.mountain >= HIKING_PHOTO_PER_MOUNTAIN_MAX) { await drop(); return sendError(res, 409, HIKING_PHOTO_LABEL.full, "PHOTO_FULL"); }
    if (n.day >= HIKING_PHOTO_DAILY_MAX) { await drop(); return sendError(res, 429, HIKING_PHOTO_LABEL.daily, "PHOTO_DAILY"); }
    return sendSuccess(res, { photo: await addPhoto(req.userId!, { mountainId: m.id, url: b.url, thumbUrl: b.thumbUrl, width, height, isPublic: publishing(req) }) });
}));

/** 내 사진의 공개 · 비공개 — 올린 사람만, 언제든. 가려진 사진은 공개로 두어도 남에게 보이지 않는다(가림이 먼저다) */
router.patch("/photos/:id", requireAuth, hikingIfPublishing, termsIfPublishing, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!PHOTO_ID.test(String(req.params.id))) return sendError(res, 404, "없는 사진이에요");
    if (typeof req.body?.isPublic !== "boolean") return sendError(res, 400, "공개 여부를 골라 주세요");
    const photo = await setPhotoPublic(req.userId!, String(req.params.id), req.body.isPublic);
    if (!photo) return sendError(res, 404, "없는 사진이에요");
    return sendSuccess(res, { photo });
}));

/** 이의제기 — 신고로 가려진 내 사진에 한 번 누르기. 운영자 큐가 이 건을 다시 연다 */
router.post("/photos/:id/appeal", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!PHOTO_ID.test(String(req.params.id))) return sendError(res, 404, "없는 사진이에요");
    const text = String(req.body?.text || "").slice(0, 500) || "이의제기합니다";
    const ok = await appealPhoto(req.userId!, String(req.params.id), text);
    if (!ok) return sendError(res, 400, "가려진 내 사진에만 이의제기할 수 있어요");
    return sendSuccess(res, { appealed: true });
}));

/** 내 사진 한 장을 지운다 — 저장소의 파일도 같이 지운다. 공개 사진이면 산의 화면에서도 사라진다 */
router.delete("/photos/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!PHOTO_ID.test(String(req.params.id))) return sendError(res, 404, "없는 사진이에요");
    const gone = await removePhoto(req.userId!, String(req.params.id));
    if (!gone) return sendError(res, 404, "없는 사진이에요");
    // 서버리스는 응답 뒤에 멈출 수 있다 — 파일 정리를 기다린다(줄만 지우면 주소를 아는 사람에게 사진이 계속 열린다)
    await deleteBlobs([gone.url, gone.thumbUrl]);
    return sendSuccess(res, { removed: true });
}));

// ── 산악회가 함께 오른 산 ─────────────────────────────────────────────
/**
 * 산악회의 도장 — 같은 날 두 사람 이상이 정상에서 인증한 산. 산악회 화면이 그린다(크루 화면은 누구나 보므로 이것도 열려 있다).
 * 산 · 처음 함께 오른 날 · 횟수 · 모인 사람 수만 싣는다 — 누가 올랐는지는 싣지 않는다.
 */
router.get("/crews/:id/summits", asyncHandler(async (req: any, res: any) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.params.id))) return sendError(res, 404, "없는 산악회예요");
    const [list, all] = await Promise.all([crewSummits(String(req.params.id)), allMountains()]);
    const by = new Map(all.map((m) => [m.id, m]));
    res.set("Cache-Control", "public, max-age=60, s-maxage=120");
    return sendSuccess(res, {
        together: CREW_TOGETHER,
        mountains: list.flatMap((x) => { const m = by.get(x.mountainId); return m ? [{ ...x, name: m.name, slug: m.slug, heightM: m.heightM, region: m.region, sigungu: m.sigungu, kfs100: m.lists.includes("kfs100") }] : []; }),
    });
}));

export default router;
