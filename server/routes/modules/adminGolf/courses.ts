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
 *   PATCH  /:slug                   { website?, phone?, logo?: null, expected? } — 로고는 내리기만(올리기는 아직 없다)
 *
 * 쓰기는 전부 adminLog 로 남긴다(전·후 값 — 되돌릴 때 이걸 본다).
 * ⚠️ 홈페이지·전화·로고는 golf_course_pages 칸이라 적재 스크립트(golf-course-pages.ts --write)를 다시 돌리면 원본 자료 값으로 덮인다.
 *    파·코스(rankue_golf_courses)와 원장 좌표(rankue_golf_clubs)는 적재 스크립트가 읽기만 해서 남는다.
 */
import { Router } from "express";
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
        if (body.logo !== null) return sendError(res, 400, "로고는 내리기만 할 수 있습니다(올리기는 아직 없습니다)");
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

export default router;
