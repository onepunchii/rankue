/**
 * 골프 관리 — 골프장 데이터(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/courses 으로 붙인다.
 *
 * 왜: 골프장 페이지 490곳 중 로고 116·홈페이지 117·전화 194곳이 비어 있고(10/1 기준), 원장 코스(9홀) 중 파가 빈 줄은
 * 경기 화면에 '파 미확인'으로 뜬다(레귤러 온·버디 판정을 못 한다). 공식 사이트에서 파를 채우는 작업이 따로 돌지만
 * 이미지·차단 사이트는 사람이 손으로 넣어야 한다 — 그 손 입력 길이 여기다. 그래서 그 작업과 같은 방식으로 지킨다:
 * 고치기 전 값이 지금 값과 같을 때만 쓰고(낙관적 확인), 바꾼 뒤엔 그 골프장 페이지 courses 를 적재 스크립트와 같은 식으로 다시 만든다.
 *
 *   GET    /                        목록 + 빈칸 칩 숫자  ?missing=pars|logo|website|phone|coords|club|fees &q= &sort=popularity|watchers|rounds &limit= &offset=
 *   PUT    /nines/:rowId/pars       한 코스 파 { pars: number[9], expectedOld?, force? } — 합이 34~37 밖이면 force 가 있어야
 *   POST   /nines                   코스 추가 { clubId, name, pars?: number[9] | [], force? }
 *   PATCH  /clubs/:clubId/coords    원장 좌표 { lat, lng } — 현장 인증(2km)이 이 점을 본다. 한국 안(33~39N, 124~132E)만
 *   GET    /:slug                   한 곳 — 페이지 칸 + 원장 코스·파 + 원장 좌표 + 공식 로고 자료 여부
 *   PATCH  /:slug                   { website?, phone?, logo?: null, expected? } — 여기서 로고는 내리기만(올린 로고면 저장소의 파일도 지운다)
 *   POST   /logo/fetch              { url } — 다른 사이트의 그림을 대신 받아 화면에 넘긴다(끌어다 놓으면 주소만 온다). 저장하지 않는다
 *   POST   /:slug/logo              { png: base64, light?, expected? } — 로고 올리기(2026-10-07). 화면이 다시 그린 PNG 만 받는다
 *
 * 쓰기는 전부 adminLog 로 남긴다(전·후 값 — 되돌릴 때 이걸 본다).
 * ⚠️ 홈페이지·전화·로고는 golf_course_pages 칸이라 적재 스크립트(golf-course-pages.ts --write)를 다시 돌리면 원본 자료 값으로 덮인다.
 *    파·코스(rankue_golf_courses)와 원장 좌표(rankue_golf_clubs)는 적재 스크립트가 읽기만 해서 남는다.
 */
import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import {
    listCourseData, getCourseData, saveNinePars, addNine, patchCoursePage, setClubCoords, officialLogoFor,
    type AdminCourseRow, type PageField,
} from "../../../storage/adminGolfCourses.js";
import {
    MISSING_KEYS, NINES_PER_CLUB_MAX, NINE_SUM_MIN, NINE_SUM_MAX, type MissingKey,
    checkNinePars, isExpectedParsShape, cleanNineName, cleanWebsite, cleanPhone, checkKoreaCoords, logoOrigin,
} from "../../../../shared/golfParEdit.js";
import { GOLF_LOGO_MAX_BYTES, GOLF_LOGO_MAX_PX, cleanRemoteImageUrl, golfLogoBlobPath, isUploadedLogo } from "../../../../shared/golfLogo.js";
import { fetchRemoteImage, type RemoteImageResult } from "../../../lib/remoteImage.js";
import { stripImageMetadata } from "../../../utils/imageMeta.js";
import { deleteBlobs } from "../../../utils/blob.js";

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORTS = ["popularity", "watchers", "rounds"] as const;
type Sort = (typeof SORTS)[number];

/** 검색 열쇠 — 띄어쓰기·대소문자 무시("레이크 사이드" 로 "레이크사이드CC" 를 찾는다) */
const searchKey = (s: string | null | undefined) => String(s ?? "").normalize("NFC").replace(/\s+/g, "").toLowerCase();
const parsText = (v: unknown) => (Array.isArray(v) && v.length ? `${v.join("·")}` : "비어 있음");
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function sortRows(rows: AdminCourseRow[], sort: Sort) {
    const byPop = (a: AdminCourseRow, b: AdminCourseRow) => b.popularity - a.popularity || a.name.localeCompare(b.name, "ko");
    const key: Record<Sort, (r: AdminCourseRow) => number> = {
        popularity: () => 0,
        watchers: (r) => r.watchers,
        rounds: (r) => r.rounds90,
    };
    const k = key[sort];
    return [...rows].sort((a, b) => k(b) - k(a) || byPop(a, b));
}

// ── 목록 ───────────────────────────────────────────────────────────
router.get("/", asyncHandler(async (req: any, res: any) => {
    const missing = MISSING_KEYS.includes(req.query.missing) ? (req.query.missing as MissingKey) : null;
    const sort: Sort = SORTS.includes(req.query.sort) ? req.query.sort : "popularity";
    const qs = typeof req.query.q === "string" ? searchKey(req.query.q.slice(0, 40)) : "";
    const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit)) || 50));
    const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);

    const { rows, ledger } = await listCourseData();
    // 칩 숫자는 검색과 무관하게 전체 기준(회원 관리 칩과 같은 약속)
    const counts = Object.fromEntries([["all", rows.length], ...MISSING_KEYS.map((k) => [k, rows.filter((r) => r.missing.includes(k)).length])]) as Record<"all" | MissingKey, number>;
    const filtered = rows.filter((r) =>
        (!missing || r.missing.includes(missing))
        && (!qs || [r.name, r.slug, r.region, r.city].some((v) => searchKey(v).includes(qs))));
    const sorted = sortRows(filtered, sort);
    return sendSuccess(res, { total: sorted.length, limit, offset, counts, ledger, rows: sorted.slice(offset, offset + limit) });
}));

// ── 코스(9홀) 파 ────────────────────────────────────────────────────
router.put("/nines/:rowId/pars", asyncHandler(async (req: any, res: any) => {
    const rowId = String(req.params.rowId);
    if (!UUID.test(rowId)) return sendError(res, 404, "코스를 찾을 수 없습니다");
    const body = isPlainObject(req.body) ? req.body : {};
    const check = checkNinePars(body.pars);
    if (!check.ok) return sendError(res, 400, check.error);
    if (body.expectedOld !== undefined && !isExpectedParsShape(body.expectedOld)) return sendError(res, 400, "고치기 전 값(expectedOld)의 모양이 잘못됐습니다");
    if (body.force !== undefined && typeof body.force !== "boolean") return sendError(res, 400, "force 는 true/false 입니다");
    if (check.unusual && body.force !== true) {
        return sendError(res, 422, `합이 ${check.sum}입니다 — 9홀 파 합은 보통 ${NINE_SUM_MIN}~${NINE_SUM_MAX}입니다. 맞으면 한 번 더 확인하고 저장하세요`, "PAR_SUM_UNUSUAL");
    }

    const r = await saveNinePars(rowId, check.pars, body.expectedOld);
    if (!r.ok && r.reason === "gone") return sendError(res, 404, "코스를 찾을 수 없습니다");
    if (!r.ok && r.reason === "changed") {
        return sendError(res, 409, `다른 곳에서 먼저 바뀌었습니다(지금: ${parsText(r.current)}) — 새로 불러온 값을 확인하고 다시 저장하세요`, "PARS_CHANGED");
    }
    if (!r.ok) return sendError(res, 400, "저장하지 못했습니다");
    if (!r.unchanged) {
        adminLog(req, "golf.course.pars", {
            rowId, clubId: r.nine.clubId, name: r.nine.name, before: r.before, after: r.nine.pars,
            checked: body.expectedOld !== undefined, force: body.force === true, pagesUpdated: r.pagesUpdated,
        });
    }
    return sendSuccess(res, { ...r.nine, sum: check.sum, unchanged: r.unchanged, courses: r.courses, pagesUpdated: r.pagesUpdated });
}));

router.post("/nines", asyncHandler(async (req: any, res: any) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const clubId = String(body.clubId ?? "");
    if (!UUID.test(clubId)) return sendError(res, 400, "원장 골프장 번호가 잘못됐습니다");
    const name = cleanNineName(body.name);
    if (!name.ok) return sendError(res, 400, name.error);
    if (body.force !== undefined && typeof body.force !== "boolean") return sendError(res, 400, "force 는 true/false 입니다");
    // 파를 모르면 비워서 넣는다(경기 화면은 '파 미확인'으로 뜨고, 나중에 채운다). 넣으면 9칸 전부.
    let pars: number[] = [];
    if (body.pars !== undefined && !(Array.isArray(body.pars) && body.pars.length === 0)) {
        const check = checkNinePars(body.pars);
        if (!check.ok) return sendError(res, 400, check.error);
        if (check.unusual && body.force !== true) {
            return sendError(res, 422, `합이 ${check.sum}입니다 — 9홀 파 합은 보통 ${NINE_SUM_MIN}~${NINE_SUM_MAX}입니다. 맞으면 한 번 더 확인하고 저장하세요`, "PAR_SUM_UNUSUAL");
        }
        pars = check.pars;
    }

    const r = await addNine(clubId, name.name, pars);
    if (!r.ok) {
        if (r.reason === "gone") return sendError(res, 404, "원장 골프장을 찾을 수 없습니다");
        if (r.reason === "duplicate") return sendError(res, 409, "같은 이름의 코스가 이미 있습니다(띄어쓰기·대소문자만 달라도 같은 이름으로 봅니다)", "NINE_DUPLICATE");
        return sendError(res, 400, `한 골프장에 코스는 ${NINES_PER_CLUB_MAX}개까지입니다`, "NINE_LIMIT");
    }
    adminLog(req, "golf.course.nine.add", { clubId, clubName: r.clubName, rowId: r.nine.id, name: r.nine.name, pars: r.nine.pars, pagesUpdated: r.pagesUpdated });
    return sendSuccess(res, { ...r.nine, courses: r.courses, pagesUpdated: r.pagesUpdated }, 201);
}));

// ── 원장 좌표 ──────────────────────────────────────────────────────
router.patch("/clubs/:clubId/coords", asyncHandler(async (req: any, res: any) => {
    const clubId = String(req.params.clubId);
    if (!UUID.test(clubId)) return sendError(res, 404, "원장 골프장을 찾을 수 없습니다");
    const body = isPlainObject(req.body) ? req.body : {};
    const c = checkKoreaCoords(body.lat, body.lng);
    if (!c.ok) return sendError(res, 400, c.error);
    const r = await setClubCoords(clubId, c.lat, c.lng);
    if (!r.ok) return sendError(res, 404, "원장 골프장을 찾을 수 없습니다");
    adminLog(req, "golf.club.coords", { clubId, name: r.name, before: r.before, after: r.after });
    return sendSuccess(res, { clubId, lat: r.after.lat, lng: r.after.lng });
}));

// ── 한 곳 ──────────────────────────────────────────────────────────
router.get("/:slug", asyncHandler(async (req: any, res: any) => {
    const slug = String(req.params.slug).normalize("NFC");
    const d = await getCourseData(slug);
    if (!d) return sendError(res, 404, "골프장을 찾을 수 없습니다");
    return sendSuccess(res, { ...d, logoOrigin: logoOrigin(d.logo) });
}));

const PAGE_FIELDS: PageField[] = ["website", "phone", "logo"];
router.patch("/:slug", asyncHandler(async (req: any, res: any) => {
    const slug = String(req.params.slug).normalize("NFC");
    const body = isPlainObject(req.body) ? req.body : {};
    const unknown = Object.keys(body).filter((k) => !PAGE_FIELDS.includes(k as PageField) && k !== "expected");
    if (unknown.length) return sendError(res, 400, `고칠 수 없는 칸입니다: ${unknown.join(", ")}`);

    const changes: Partial<Record<PageField, string | null>> = {};
    if ("website" in body) {
        const w = cleanWebsite(body.website);
        if (!w.ok) return sendError(res, 400, w.error);
        changes.website = w.value;
    }
    if ("phone" in body) {
        const p = cleanPhone(body.phone);
        if (!p.ok) return sendError(res, 400, p.error);
        changes.phone = p.value;
    }
    if ("logo" in body) {
        if (body.logo !== null) return sendError(res, 400, "여기서는 로고를 내리기만 합니다 — 올리기는 POST /:slug/logo");
        changes.logo = null;
    }
    if (!Object.keys(changes).length) return sendError(res, 400, "고칠 칸이 없습니다");

    let expected: Partial<Record<PageField, string | null>> | undefined;
    if (body.expected !== undefined) {
        if (!isPlainObject(body.expected)) return sendError(res, 400, "고치기 전 값(expected)의 모양이 잘못됐습니다");
        expected = {};
        for (const [k, v] of Object.entries(body.expected)) {
            if (!PAGE_FIELDS.includes(k as PageField) || (v !== null && typeof v !== "string")) return sendError(res, 400, "고치기 전 값(expected)의 모양이 잘못됐습니다");
            expected[k as PageField] = v;
        }
    }

    const r = await patchCoursePage(slug, changes, expected);
    if (!r.ok && r.reason === "gone") return sendError(res, 404, "골프장을 찾을 수 없습니다");
    if (!r.ok) return sendError(res, 409, "다른 곳에서 먼저 바뀌었습니다 — 새로 불러온 값을 확인하고 다시 저장하세요", "PAGE_CHANGED");

    const logoCleared = r.changed.includes("logo") && !!r.before.logo;
    // 올린 로고를 내렸으면 저장소의 파일도 지운다(남겨 두면 주소를 아는 사람에게 계속 열린다). 정적 파일 로고는 건드리지 않는다
    if (logoCleared && isUploadedLogo(r.before.logo)) await deleteBlobs(r.before.logo);
    adminLog(req, "golf.course.page", {
        slug,
        before: Object.fromEntries(r.changed.map((k) => [k, r.before[k]])),
        after: Object.fromEntries(r.changed.map((k) => [k, r.after[k]])),
    });
    return sendSuccess(res, {
        slug, ...r.after, changed: r.changed,
        // 로고를 내렸으면 — 적재 스크립트를 다시 돌릴 때 어디서 다시 붙는지(공식 로고 자료 항목이 있으면 그 표에서도 빼야 한다)
        removedLogo: logoCleared ? { path: r.before.logo, origin: logoOrigin(r.before.logo) } : null,
        official: officialLogoFor(slug),
    });
}));

// ── 로고 올리기 ────────────────────────────────────────────────────
const FETCH_ERROR: Record<Exclude<RemoteImageResult, { ok: true }>["reason"], string> = {
    "bad-url": "그림 주소를 알아볼 수 없습니다",
    private: "받아 올 수 없는 주소입니다",
    dns: "그 사이트를 찾을 수 없습니다",
    http: "그 사이트가 그림을 내주지 않았습니다 — 그림을 저장하거나 복사해서 붙여넣어 주세요",
    "too-big": "그림이 너무 큽니다(2MB까지) — 로고 그림만 골라 주세요",
    "not-image": "그림이 아닙니다 — 로고 그림 자체를 끌어다 놓거나, 복사해서 붙여넣어 주세요",
    timeout: "그 사이트의 응답이 늦습니다 — 그림을 저장하거나 복사해서 붙여넣어 주세요",
    redirects: "주소가 계속 다른 곳으로 넘어갑니다",
    network: "그 사이트에 연결하지 못했습니다 — 그림을 저장하거나 복사해서 붙여넣어 주세요",
};

// 다른 사이트에서 로고를 끌어다 놓으면 파일이 아니라 주소만 온다. 화면은 다른 사이트의 그림을 읽지 못해(CORS) 서버가 대신 받아 넘긴다.
// 받은 것은 저장하지 않는다 — 화면이 PNG 로 다시 그려 아래 POST /:slug/logo 로 올린다.
router.post("/logo/fetch", asyncHandler(async (req: any, res: any) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const url = cleanRemoteImageUrl(body.url);
    if (!url) return sendError(res, 400, FETCH_ERROR["bad-url"]);
    const r = await fetchRemoteImage(url);
    if (!r.ok) return sendError(res, r.reason === "bad-url" || r.reason === "private" ? 400 : 422, FETCH_ERROR[r.reason], `LOGO_FETCH_${r.reason.replace(/-/g, "_").toUpperCase()}`);
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, { type: r.type, mime: r.mime, bytes: r.buffer.length, base64: r.buffer.toString("base64") });
}));

router.post("/:slug/logo", asyncHandler(async (req: any, res: any) => {
    const slug = String(req.params.slug).normalize("NFC");
    const body = isPlainObject(req.body) ? req.body : {};
    if (typeof body.png !== "string" || !body.png) return sendError(res, 400, "올릴 그림이 없습니다");
    if (body.light !== undefined && typeof body.light !== "boolean") return sendError(res, 400, "light 는 true/false 입니다");
    let expectedLogo: string | null | undefined;
    if (body.expected !== undefined) {
        if (!isPlainObject(body.expected) || !("logo" in body.expected) || (body.expected.logo !== null && typeof body.expected.logo !== "string")) {
            return sendError(res, 400, "고치기 전 값(expected)의 모양이 잘못됐습니다");
        }
        expectedLogo = body.expected.logo as string | null;
    }
    // 화면이 캔버스로 다시 그린 PNG 만 받는다 — 남의 사이트에서 온 원본(SVG·GIF·메타 정보가 든 파일)을 그대로 저장하지 않는다
    const b64 = body.png.replace(/^data:image\/png;base64,/, "");
    if (b64.length > Math.ceil(GOLF_LOGO_MAX_BYTES / 3) * 4 + 4) return sendError(res, 413, "로고 그림이 너무 큽니다");
    const raw = Buffer.from(b64, "base64");
    const clean = stripImageMetadata(raw);
    if (clean.type !== "png" || clean.buffer.length < 33) return sendError(res, 400, "PNG 그림만 올릴 수 있습니다");
    if (clean.buffer.length > GOLF_LOGO_MAX_BYTES) return sendError(res, 413, "로고 그림이 너무 큽니다");
    const width = clean.buffer.readUInt32BE(16), height = clean.buffer.readUInt32BE(20);
    if (width < 16 || height < 16 || width > GOLF_LOGO_MAX_PX || height > GOLF_LOGO_MAX_PX) {
        return sendError(res, 400, `로고 크기가 맞지 않습니다(한 변 16~${GOLF_LOGO_MAX_PX}px)`);
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return sendError(res, 503, "그림 저장소가 설정되지 않았습니다");

    const cur = await getCourseData(slug);
    if (!cur) return sendError(res, 404, "골프장을 찾을 수 없습니다");
    const before: string | null = cur.logo ?? null;
    if (expectedLogo !== undefined && expectedLogo !== before) {
        return sendError(res, 409, "다른 곳에서 먼저 바뀌었습니다 — 새로 불러온 값을 확인하고 다시 올리세요", "PAGE_CHANGED");
    }

    const light = body.light === true;
    const path = golfLogoBlobPath(createHash("sha1").update(slug).digest("hex"), randomBytes(6).toString("hex"), light);
    const saved = await put(path, clean.buffer, { access: "public", contentType: "image/png", addRandomSuffix: false, token });
    // 저장소가 준 주소가 '올린 로고' 꼴이 아니면 쓰지 않는다 — 그 꼴이어야 다시 적재해도 남고, 내릴 때 파일도 지운다
    if (!isUploadedLogo(saved.url)) {
        await deleteBlobs(saved.url);
        return sendError(res, 500, "로고를 저장하지 못했습니다");
    }
    const r = await patchCoursePage(slug, { logo: saved.url }, { logo: before });
    if (!r.ok) {
        await deleteBlobs(saved.url);
        if (r.reason === "gone") return sendError(res, 404, "골프장을 찾을 수 없습니다");
        return sendError(res, 409, "다른 곳에서 먼저 바뀌었습니다 — 새로 불러온 값을 확인하고 다시 올리세요", "PAGE_CHANGED");
    }
    // 바꿔 올렸으면 앞의 올린 파일은 지운다(정적 파일 로고는 건드리지 않는다)
    if (isUploadedLogo(before)) await deleteBlobs(before);
    adminLog(req, "golf.course.logo.upload", { slug, before, after: r.after.logo, bytes: clean.buffer.length, width, height, light });
    return sendSuccess(res, { slug, ...r.after, changed: r.changed, logoOrigin: logoOrigin(r.after.logo) }, 201);
}));

export default router;
