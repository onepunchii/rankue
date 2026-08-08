import { Router } from "express";
import { Response } from "express";
import { db } from "../../db.js";
import { storeListings, storeListingClaims, storeListingSuggestions, hiqCrews } from "../../../shared/schema.js";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// 매장 디렉터리 공개 API — 지역 검색("김해 당구장") SEO 대상이라 비로그인 읽기.
// 클레임·수정 제안은 사장님·방문자가 앱 계정 없이도 보낼 수 있어야 해서 비로그인 허용.
const router = Router();

// 비로그인 POST 남용 방어 — IP당 시간창 내 제출 횟수 제한.
// 서버리스 인스턴스별 메모리라 best-effort 지만, 단일 IP 루프 스팸(대기열 오염·스토리지
// 적재)은 이것으로 충분히 꺾인다. 분산 스팸까지 오면 그때 저장소 기반으로 승격.
const submitLog = new Map<string, { count: number; first: number }>();
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SUBMIT_MAX = 5;
function isSubmitLimited(ip: string): boolean {
    const now = Date.now();
    if (submitLog.size > 10_000) submitLog.clear(); // 메모리 상한
    const entry = submitLog.get(ip);
    if (!entry || now - entry.first > SUBMIT_WINDOW_MS) {
        submitLog.set(ip, { count: 1, first: now });
        return false;
    }
    entry.count += 1;
    return entry.count > SUBMIT_MAX;
}

router.use((_req, res, next) => {
    // 목록은 하루 단위로나 변하지만 상세에 활동 크루가 실리면서 10분으로 낮춤 — CDN이 흡수
    if (_req.method === "GET") {
        res.set("Cache-Control", "public, max-age=0, must-revalidate");
        res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    }
    next();
});

const CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

// GET /listings?region=&q=&limit=&offset= — 디렉터리 목록 + 지역별 집계
router.get("/", asyncHandler(async (req: any, res: Response) => {
    const region = typeof req.query.region === "string" ? req.query.region.slice(0, 10) : "";
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 40) : "";
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) return sendError(res, 400, "잘못된 페이지 값입니다");

    const conds: any[] = [];
    if (region) conds.push(eq(storeListings.region, region));
    if (q) conds.push(or(ilike(storeListings.name, `%${q}%`), ilike(storeListings.address, `%${q}%`)));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [{ total }], regions] = await Promise.all([
        db.select({
            code: storeListings.code, name: storeListings.name, region: storeListings.region,
            address: storeListings.address, phone: storeListings.phone, openHours: storeListings.openHours,
            tableLarge: storeListings.tableLarge, tableMedium: storeListings.tableMedium, tablePocket: storeListings.tablePocket,
            rate10Large: storeListings.rate10Large, rate10Medium: storeListings.rate10Medium,
            claimed: storeListings.claimed,
        }).from(storeListings).where(where).orderBy(asc(storeListings.name)).limit(limit).offset(offset),
        db.select({ total: sql<number>`count(*)::int` }).from(storeListings).where(where),
        db.select({ region: storeListings.region, count: sql<number>`count(*)::int` })
            .from(storeListings).groupBy(storeListings.region).orderBy(sql`count(*) DESC`),
    ]);
    return sendSuccess(res, { total, rows, regions });
}));

// GET /listings/:code — 매장 상세 (공개 컬럼만 명시 — id·claimedStoreId 등 내부 식별자 미노출)
router.get("/:code", asyncHandler(async (req: any, res: Response) => {
    if (!CODE_RE.test(req.params.code)) return sendError(res, 404, "매장을 찾을 수 없습니다");
    const [row] = await db.select({
        code: storeListings.code, name: storeListings.name, region: storeListings.region,
        address: storeListings.address, phone: storeListings.phone, openHours: storeListings.openHours,
        tableLarge: storeListings.tableLarge, tableMedium: storeListings.tableMedium, tablePocket: storeListings.tablePocket,
        rate10Large: storeListings.rate10Large, rate10Medium: storeListings.rate10Medium, rate10Pocket: storeListings.rate10Pocket,
        flatLarge: storeListings.flatLarge, flatMedium: storeListings.flatMedium, flatPocket: storeListings.flatPocket,
        claimed: storeListings.claimed, description: storeListings.description,
    }).from(storeListings).where(eq(storeListings.code, req.params.code));
    if (!row) return sendError(res, 404, "매장을 찾을 수 없습니다");

    // 이 매장을 베이스로 활동하는 크루 — 공개 필드만 (이름·엠블럼·종목·인원).
    // 매장 페이지를 "살아있는 프로필"로 만들어 사장님 클레임 유인이 되는 핵심 섹션.
    const crews = await db.select({
        id: hiqCrews.id,
        name: hiqCrews.name,
        emblem: hiqCrews.emblem,
        gameType: hiqCrews.gameType,
        // drizzle 은 sql`` 안 컬럼 참조를 비정규화 렌더링한다 — 서브쿼리에서 외부 컬럼이
        // 내부 테이블로 오해석되므로(실측: "crew_id" = "id" 가 멤버 테이블 id 와 비교됨) 풀 경로 raw 로 쓴다
        memberCount: sql<number>`(SELECT count(*)::int FROM hiq_crew_members m WHERE m.crew_id = hiq_crews.id AND m.role != 'pending')`,
    }).from(hiqCrews).where(eq(hiqCrews.baseListingCode, req.params.code)).limit(10);

    return sendSuccess(res, { ...row, crews });
}));

// POST /listings/:code/claim — 사장님 클레임 신청 (수동 승인 대기열)
router.post("/:code/claim", asyncHandler(async (req: any, res: Response) => {
    if (!CODE_RE.test(req.params.code)) return sendError(res, 404, "매장을 찾을 수 없습니다");
    const [listing] = await db.select({ code: storeListings.code }).from(storeListings).where(eq(storeListings.code, req.params.code));
    if (!listing) return sendError(res, 404, "매장을 찾을 수 없습니다");

    const name = String(req.body?.applicantName || "").trim().slice(0, 30);
    const phone = String(req.body?.applicantPhone || "").trim().slice(0, 20);
    if (!name || !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ""))) {
        return sendError(res, 400, "이름과 올바른 연락처를 입력해주세요");
    }
    if (isSubmitLimited(req.ip || "?")) return sendError(res, 429, "잠시 후 다시 시도해주세요");
    // 같은 매장에 이미 대기 중인 클레임이 있으면 중복 접수 방지
    const [pending] = await db.select({ id: storeListingClaims.id }).from(storeListingClaims)
        .where(and(eq(storeListingClaims.listingCode, req.params.code), eq(storeListingClaims.status, "pending")))
        .limit(1);
    if (pending) return sendError(res, 409, "이미 접수된 신청이 있습니다. 확인 후 연락드릴게요");
    await db.insert(storeListingClaims).values({
        listingCode: req.params.code,
        applicantName: name,
        applicantPhone: phone,
        message: String(req.body?.message || "").slice(0, 500) || null,
    });
    return sendSuccess(res, { submitted: true });
}));

// POST /listings/:code/suggest — 정보 수정 제안 (폐업·이전·오기)
router.post("/:code/suggest", asyncHandler(async (req: any, res: Response) => {
    if (!CODE_RE.test(req.params.code)) return sendError(res, 404, "매장을 찾을 수 없습니다");
    const message = String(req.body?.message || "").trim().slice(0, 500);
    if (message.length < 5) return sendError(res, 400, "수정할 내용을 입력해주세요");
    if (isSubmitLimited(req.ip || "?")) return sendError(res, 429, "잠시 후 다시 시도해주세요");
    await db.insert(storeListingSuggestions).values({
        listingCode: req.params.code,
        message,
        contact: String(req.body?.contact || "").slice(0, 50) || null,
    });
    return sendSuccess(res, { submitted: true });
}));

export default router;
