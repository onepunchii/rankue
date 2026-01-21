import { Request, Response, NextFunction } from "express";
import { storage } from "../storage/index.js";
import { sendError } from "../utils/response.js";

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
    const slug = req.headers["x-store-slug"] as string || "hiq";

    try {
        const store = await storage.getStoreBySlug(slug);
        if (!store) {
            return sendError(res, 404, "등록되지 않은 매장입니다.", "STORE_NOT_FOUND");
        }

        // Request 객체에 store 정보 심기 (편의를 위해)
        (req as any).currentStore = store;
        next();
    } catch (error) {
        next(error);
    }
}
