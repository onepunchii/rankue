import { sendError } from "../utils/response.js";
import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
    userId?: string;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    // Trust ONLY the signed cookie. An unsigned/forged hiq_user_id (e.g. a raw member UUID
    // set by an attacker) will not appear in signedCookies, so it is rejected.
    const userId = (req as any).signedCookies?.hiq_user_id;
    if (!userId) {
        return sendError(res, 401, "로그인이 필요합니다");
    }
    req.userId = userId;
    next();
};
