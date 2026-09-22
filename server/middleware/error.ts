import { Request, Response, NextFunction } from "express";
import { render, localeOf, tr } from "../lib/i18n.js";

export function errorHandler(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    const status = err.status || err.statusCode || 500;
    const locale = localeOf(res);
    const message = err.i18n ? render(locale, err.i18n) : (err.message ? render(locale, err.message) : tr(locale, "err.common.internal"));

    console.error("[Error Handler]", err);

    res.status(status).json({
        success: false,
        message
    });
}
