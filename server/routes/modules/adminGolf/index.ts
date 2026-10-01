import { Router } from "express";
import { checkSuperAdmin } from "../../../middleware/adminAuth.js";
import overview from "./overview.js";
import listings from "./listings.js";
import rounds from "./rounds.js";
import photos from "./photos.js";
import courses from "./courses.js";

/**
 * 골프 관리 콘솔 API(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * /api/hiq/admin/golf/<화면> — 화면마다 라우터 파일을 따로 둔다. 전부 관리자 가드(checkSuperAdmin) 뒤.
 *   overview  골프 현황(숫자·피드 상태)      listings  조인·부킹·긴급 알림
 *   rounds    라운드(멈춘 방·기록 무효화)    photos    라운드 사진·이의제기
 *   courses   골프장 데이터(빈칸·파 입력)
 */
const router = Router();
router.use(checkSuperAdmin);
router.use("/overview", overview);
router.use("/listings", listings);
router.use("/rounds", rounds);
router.use("/photos", photos);
router.use("/courses", courses);

export default router;
