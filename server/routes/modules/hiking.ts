/**
 * 등산 — 공개 읽기(2026-10-13). 산 허브 · 목록 · 산 한 곳 · 산의 날씨. 로그인 없이 열리고 아무것도 쓰지 않는다.
 * 자료는 server/storage/hiking(표 hiking_*), 규칙은 shared/hikingMountains · hikingPage.
 * 당구 · 골프의 라우트와 섞지 않는다 — 등산은 /api/hiq/hiking 아래에만 산다.
 */
import { Router } from "express";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { allMountains, getMountainDetail, mountainById, mountainBySlug, nearbyMountains, type MountainSummary } from "../../storage/hiking.js";
import { addSummit, listHikingAwards, listSummits, removeRecord, syncHikingAwards, CREW_TOGETHER, crewSummits } from "../../storage/hikingStamps.js";
import { addTrip, listTrips } from "../../storage/hikingTrips.js";
import { cleanTrip } from "../../../shared/hikingTrail.js";
import { addPhoto, listPhotos, photoCounts, removePhoto } from "../../storage/hikingPhotos.js";
import { HIKING_PHOTO_CATEGORY, HIKING_PHOTO_DAILY_MAX, HIKING_PHOTO_LABEL, HIKING_PHOTO_PER_MOUNTAIN_MAX, HIKING_THUMB_CATEGORY, isHikingPhotoPath, validPhotoSize } from "../../../shared/hikingPhotos.js";
import { deleteBlobs, isOnOwnBlobHost } from "../../utils/blob.js";
import { requireHikingAccess } from "../../middleware/hikingAccess.js";
import type { AuthRequest } from "../../middleware/auth.js";
import { distM } from "../../../shared/hikingGeo.js";
import { judgeSummit, summitHint } from "../../../shared/hikingStamps.js";
import { getCourseWeather } from "../../services/golfWeather.js";
import { HIKING_LISTS, HIKING_REGIONS, HIKING_TRAITS, hikingGroup, hikingRegion, inHikingGroup } from "../../../shared/hikingMountains.js";

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

/** 산 한 곳 — 글 · 코스(선) · 지점 · 가까운 산 */
router.get("/mountains/:slug", asyncHandler(async (req: any, res: any) => {
    const d = await getMountainDetail(String(req.params.slug));
    if (!d) return sendError(res, 404, "없는 산이에요");
    const near = nearbyMountains(await allMountains(), d);
    res.set("Cache-Control", PUBLIC_CACHE);
    return sendSuccess(res, { ...d, nearby: near });
}));

/** 산의 날씨 — 정상 좌표의 격자(기상청 단기 · 중기). 받아 둔 것이 낡았으면 그 자리에서 새로 받는다 */
router.get("/mountains/:slug/weather", asyncHandler(async (req: any, res: any) => {
    const m = await mountainBySlug(String(req.params.slug));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const weather = m.lat != null && m.lng != null ? await getCourseWeather({ lat: m.lat, lng: m.lng }, { fetch: true }).catch((e) => { console.error("[HikingWeather]", e); return null; }) : null;
    res.set("Cache-Control", weather ? "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" : "no-store");
    return sendSuccess(res, weather);
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

// ── 산행 사진(내 사진첩) ──────────────────────────────────────────────
/** 내 사진(새 것부터) — ?mountainId= 를 주면 그 산의 것만. 올린 사람만 읽는다 */
router.get("/me/photos", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const mountainId = typeof req.query.mountainId === "string" && req.query.mountainId ? req.query.mountainId.slice(0, 60) : null;
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { photos: await listPhotos(req.userId!, mountainId) });
}));

/**
 * 사진 한 장을 적는다 — 파일은 화면이 먼저 POST /api/hiq/upload 로 올리고(서버가 사진 정보를 걷는다), 여기에는 그 주소 둘만 온다.
 * 우리 저장소의 등산 사진 폴더에 올린 주소만 받는다(남의 주소를 적어 넣지 못하게). **좌표는 받지 않는다.**
 */
router.post("/photos", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    const b = req.body ?? {};
    const m = await mountainById(String(b.mountainId ?? ""));
    if (!m) return sendError(res, 404, "없는 산이에요");
    const width = Number(b.width), height = Number(b.height);
    if (!isHikingPhotoPath(b.url, HIKING_PHOTO_CATEGORY) || !isHikingPhotoPath(b.thumbUrl, HIKING_THUMB_CATEGORY) || !isOnOwnBlobHost(b.url) || !isOnOwnBlobHost(b.thumbUrl) || !validPhotoSize(width, height)) {
        return sendError(res, 400, "사진을 다시 올려 주세요");
    }
    const n = await photoCounts(req.userId!, m.id);
    if (n.mountain >= HIKING_PHOTO_PER_MOUNTAIN_MAX) return sendError(res, 409, HIKING_PHOTO_LABEL.full, "PHOTO_FULL");
    if (n.day >= HIKING_PHOTO_DAILY_MAX) return sendError(res, 429, HIKING_PHOTO_LABEL.daily, "PHOTO_DAILY");
    return sendSuccess(res, { photo: await addPhoto(req.userId!, { mountainId: m.id, url: b.url, thumbUrl: b.thumbUrl, width, height }) });
}));

/** 내 사진 한 장을 지운다 — 저장소의 파일도 같이 지운다 */
router.delete("/photos/:id", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return sendError(res, 404, "없는 사진이에요");
    const gone = await removePhoto(req.userId!, String(req.params.id));
    if (!gone) return sendError(res, 404, "없는 사진이에요");
    void deleteBlobs([gone.url, gone.thumbUrl]);
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
