/**
 * 등산 라우트 문지기(2026-10-13) — 로그인 + 등산을 쓸 수 있는 회원(server/lib/hikingAccess: 지금은 운영자와 시험 계정).
 * 화면만 가리면 주소로 뚫린다 — 쓰기(정상 인증 · 기록)와 내 도장 읽기에 건다. 공개 산 화면의 읽기에는 걸지 않는다.
 */
import type { Response, NextFunction } from "express";
import { storage } from "../storage/index.js";
import { requireAuth, AuthRequest } from "./auth.js";
import { sendError } from "../utils/response.js";
import { hikingAllowed } from "../lib/hikingAccess.js";

/** 등산을 쓸 수 있는 회원인가 — requireAuth 뒤에 둔다. 조건이 맞을 때만 문을 보는 길(사진을 공개로 내놓을 때)이 따로 부른다 */
export async function checkHiking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const member = req.userId ? await storage.getMemberById(req.userId) : null;
    const profile = member?.profileId ? await storage.getProfile(member.profileId) : null;
    if (!hikingAllowed(member, (profile as { role?: string | null } | null)?.role)) {
        sendError(res, 403, "등산은 아직 준비 중이에요", "HIKING_NOT_AVAILABLE");
        return;
    }
    next();
}

export const requireHikingAccess = [requireAuth, checkHiking];
