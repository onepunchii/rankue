import { sendError } from "../utils/response.js";
import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
    userId?: string;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.cookies.hiq_user_id;
    if (!userId) {
        return sendError(res, 401, "로그인이 필요합니다");
    }
    req.userId = userId;
    next();
};
