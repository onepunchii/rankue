import { Router } from "express";
import golfRouter from "./modules/golf.js";
import crewRouter from "./modules/crew.js";
import authRouter from "./modules/auth.js";
import adminRouter from "./modules/admin.js";
import partnerRouter from "./modules/partner.js";
import memberRouter from "./modules/member.js";
import gameRouter from "./modules/game.js";
import notificationRouter from "./modules/notification.js";
import regionRouter from "./modules/region.js";
import communityRouter from "./modules/community.js";
import umbRouter from "./modules/umb.js";

const router = Router();

// --- Domain Modules ---

// 1. Golf (/golf)
router.use("/golf", golfRouter);

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


// 9. Regions (/regions)
router.use("/regions", regionRouter);

// 10. Community (/community)
// - 전체 공개 게시판 4개 + 신고/차단/이의제기
router.use("/community", communityRouter);

// 11. UMB 세계랭킹 (/umb) — 공개 읽기 전용
router.use("/umb", umbRouter);

export default router;
