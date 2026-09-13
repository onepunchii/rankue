import { Router } from "express";
import golfRouter from "./modules/golf.js";
import { requireGolfAccess } from "../middleware/golfAccess.js";
import crewRouter from "./modules/crew.js";
import authRouter from "./modules/auth.js";
import adminRouter from "./modules/admin.js";
import partnerRouter from "./modules/partner.js";
import memberRouter from "./modules/member.js";
import gameRouter from "./modules/game.js";
import notificationRouter from "./modules/notification.js";
import simRouter from "./modules/sim.js";
import simMatchRouter from "./modules/simMatch.js";
import simDrillRouter from "./modules/simDrill.js";
import regionRouter from "./modules/region.js";
import communityRouter from "./modules/community.js";
import umbRouter from "./modules/umb.js";
import pbaRouter from "./modules/pba.js";
import golfRankRouter from "./modules/golfRank.js";
import listingsRouter from "./modules/listings.js";
import appMetaRouter from "./modules/appMeta.js";

const router = Router();

// --- Domain Modules ---

// 1. Golf (/golf)
// 골프는 시험 단계 — 허용 목록에 있는 사람만. 읽기까지 막는다(2026-09-09 오너: 두 플랫폼으로 완전히 가른다).
router.use("/golf", ...requireGolfAccess, golfRouter);

// 2. Crew (/crews)
router.use("/crews", crewRouter);

// 3. Admin (/admin)
// - Handles /admin/stats, /admin/users, etc.
router.use("/admin", adminRouter);

// 4. Partner (/partner)
// - Handles /partner/login, /partner/store, etc.
router.use("/partner", partnerRouter);

// --- Core / Root Modules ---

// 5. Auth (Root)
// - /login, /register, /push-token
router.use("/", authRouter);

// 6. Member (Root)
// - /me, /members/:id, /friends, /rankings
router.use("/", memberRouter);

// 7. Notification (Root)
// - /notifications, /test-notification
router.use("/", notificationRouter);

// 8. Game / Billiards / Core (Root)
// - /game, /history, /stores, /branding, /invite, /settlements
router.use("/", gameRouter);

// 시뮬레이터 v2: /sim/sessions, /sim/ladder — 서버가 shared/sim 으로 재시뮬해 정본을 만든다
router.use("/", simRouter);
router.use("/", simMatchRouter);
router.use("/", simDrillRouter);


// 9. Regions (/regions)
router.use("/regions", regionRouter);

// 10. Community (/community)
// - 전체 공개 게시판 4개 + 신고/차단/이의제기
router.use("/community", communityRouter);

// 11. UMB 세계랭킹 (/umb) — 공개 읽기 전용
router.use("/umb", umbRouter);

// 12. 매장 디렉터리 (/listings) — 공개 + 클레임·수정 제안 접수
router.use("/listings", listingsRouter);

// 13. PBA 투어 (/pba) — 공개 읽기 전용
router.use("/pba", pbaRouter);

// 13-1. 골프 랭킹 (/golf-rank) — 공개 읽기 전용(2026-09-13 오너: 골프는 공개 전체). 골프 접근 통제를 타지 않는다
router.use("/golf-rank", golfRankRouter);

// 14. 앱 메타 (/app) — 스토어에 올라가 있는 버전(옛 앱 업데이트 안내 자동 켜기용), 공개
router.use("/app", appMetaRouter);

export default router;
