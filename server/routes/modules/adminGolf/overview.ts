import { Router } from "express";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/response.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { loadGolfOverview, judgePriceFeed } from "../../../storage/adminGolfOverview.js";
import { readGolfFeedRows, judgeGolfFeed } from "../../../services/feedHealth.js";
import { syncMembershipPrices } from "../../../services/golfPriceSync.js";

/**
 * 골프 관리 — 골프 현황(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/overview 로 붙인다.
 *
 * 그전엔 골프를 보려면 DB 를 직접 열어야 했다 — 멈춘 방이 몇 개인지, 사진 이의제기가 쌓였는지, 랭킹·시세 수집이
 * 멈췄는지(2026-10-01 실측: 회원권 시세는 9/24 뒤로 한 번도 안 들어왔다 — TGM 피드 404) 아무 화면에도 없었다.
 * 숫자는 전부 읽기만 한다.
 *
 *   GET  /                     골프 현황 숫자 한 묶음(라운드·조인/부킹·사진·골프장 데이터·회원권 접수·외부 자료 상태)
 *   POST /price-sync/dry-run   회원권 시세 동기화 **미리 보기** — 피드를 받아 짝만 지어 보고 아무것도 쓰지 않는다
 */
const router = Router();

router.get("/", asyncHandler(async (_req: any, res: any) => {
    const nowMs = Date.now();
    const [stats, feedRows] = await Promise.all([
        loadGolfOverview(nowMs),
        readGolfFeedRows().catch((e) => {
            console.error("[admin/golf/overview] rankings", (e as Error)?.message ?? e);
            return null;
        }),
    ]);
    const { priceRow, failed, ...groups } = stats;
    return sendSuccess(res, {
        generatedAt: new Date(nowMs).toISOString(),
        ...groups,
        feeds: {
            // 판정은 feedHealth 의 같은 함수 — 운영자 알림(크론)과 이 화면이 같은 기준을 쓴다
            rankings: feedRows ? feedRows.map((r) => judgeGolfFeed(r, nowMs)) : null,
            prices: priceRow ? judgePriceFeed(priceRow, nowMs) : null,
        },
        failed: feedRows ? failed : [...failed, "rankings"],
    });
}));

/** 못 붙은 종목 목록 상한 — 짝짓기가 통째로 깨지면 234줄이 다 온다. 화면엔 이 정도면 충분하다 */
const UNMATCHED_LIMIT = 300;

/**
 * 시세 동기화 미리 보기. syncMembershipPrices({ dryRun: true }) 는 피드를 받고(fetch) 짝을 지은 뒤(golf_course_pages
 * 읽기만) `if (!opts.dryRun) await writePrices(...)` 에서 멈춘다 — 실패 갈래도 전부 쓰기 전에 돌아온다. 그래서 쓰는 일이 없다.
 * 피드가 죽었으면 실패 이유를 그대로 돌려준다(200) — 화면이 그 이유를 카드 안에 남겨 보여 준다.
 */
router.post("/price-sync/dry-run", asyncHandler(async (req: any, res: any) => {
    const result = await syncMembershipPrices({ dryRun: true });
    const checkedAt = new Date().toISOString();
    if (!result.ok) {
        adminLog(req, "golf.price_sync.dry_run", { ok: false, reason: result.reason });
        return sendSuccess(res, { ok: false, reason: result.reason, feedItems: result.feedItems ?? null, checkedAt });
    }
    adminLog(req, "golf.price_sync.dry_run", { ok: true, feedItems: result.feedItems, wouldWrite: result.written, unmatched: result.unmatched.length });
    return sendSuccess(res, {
        ok: true,
        generatedAt: result.generatedAt,
        feedItems: result.feedItems,
        // 미리 보기라 written 은 '쓸 뻔한' 수다 — 골프장에 붙고 시세 값이 있는 종목
        wouldWrite: result.written,
        historyPoints: result.historyPoints,
        unmatchedCount: result.unmatched.length,
        unmatched: result.unmatched.slice(0, UNMATCHED_LIMIT),
        checkedAt,
    });
}));

export default router;
