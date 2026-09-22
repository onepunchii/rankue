import { Request, Response, NextFunction } from "express";
import { render, localeOf, tr } from "../lib/i18n.js";

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        console.error("[AsyncError]", error);

        // If response already sent, don't try to send again
        if (res.headersSent) {
            return next(error);
        }

        const status = (error as any).statusCode || (error as any).status || 500;
        const locale = localeOf(res);
        // AppError 가 I18nText 를 들고 있으면 요청 언어로, 아니면 문자열(키면 번역)
        const message = (error as any).i18n ? render(locale, (error as any).i18n) : (error.message ? render(locale, error.message) : tr(locale, "err.common.internal"));

        res.status(status).json({
            success: false,
            message: status === 500 && process.env.NODE_ENV === 'production'
                ? tr(locale, "err.common.internal")
                : message
        });
    });
};
