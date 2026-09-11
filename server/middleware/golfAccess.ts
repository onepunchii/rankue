/**
 * 골프 라우트 문지기. shared/golfAccess.ts 의 허용 목록을 서버에서도 그대로 쓴다 —
 * 화면만 가리면 주소로 뚫린다(2026-09-09 프로덕션에서 실제로 뚫려 있었다).
 */
import type { Response, NextFunction } from "express";
import { storage } from "../storage/index.js";
import { requireAuth, AuthRequest } from "./auth.js";
import { sendError } from "../utils/response.js";
import { golfAllowed } from "../lib/golfAccess.js";

async function checkGolf(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const member = req.userId ? await storage.getMemberById(req.userId) : null;
    if (!golfAllowed(member)) {
        sendError(res, 403, "골프는 아직 준비 중이에요", "GOLF_NOT_AVAILABLE");
        return;
    }
    next();
}

/** requireAuth + 허용 목록. 골프 라우터 전체에 건다(읽기까지 막는다 — 시험 단계라 그게 맞다). */
export const requireGolfAccess = [requireAuth, checkGolf];
