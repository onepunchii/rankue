import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase.js";
import { authService, AuthUser } from "./services/authService.js";
import { sendSuccess, sendError } from "./utils/response.js";

// Global Auth Middleware (Soft - allows Guest)
export async function authMiddleware(req: any, res: any, next: any) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.['sb-access-token'];

    if (token) {
        try {
            const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);

            if (supabaseUser && !error) {
                const authUser = await authService.ensureProfileExists(supabaseUser);
                if (authUser) {
                    req.user = authUser;
                    return next();
                }
            }
        } catch (error) {
            console.error('🔑 [AuthMiddleware] Error:', error);
        }
    }

    // Fallback to guest
    req.user = await authService.getGuestUser();
    next();
}

// Strict Auth Middleware (Requires login)
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
    // If global middleware already authenticated a real user, just pass.
    if ((req as any).user && !(req as any).user.isGuest) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 401, "인증 토큰이 필요합니다.", "UNAUTHORIZED");
    }

    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return sendError(res, 401, "유효하지 않은 토큰입니다.", "INVALID_TOKEN");
        }

        const authUser = await authService.ensureProfileExists(user);

        if (!authUser) {
            return sendError(res, 500, "사용자 프로필 생성 실패");
        }

        (req as any).user = authUser;

        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return sendError(res, 500, "인증 처리 중 오류가 발생했습니다.");
    }
}

export function requireAuth(req: any, res: any, next: any) {
    if (!req.user || req.user.isGuest) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    next();
}

// 프로필 라우트 핸들러
export async function handleGetProfile(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user) return sendError(res, 401, "로그인이 필요합니다.");

    try {
        const profile = await authService.getUser(user.id);
        if (!profile) return sendError(res, 404, "프로필을 찾을 수 없습니다.");
        return sendSuccess(res, profile);
    } catch (err) {
        return sendError(res, 500, "프로필 조회 실패");
    }
}
