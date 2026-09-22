import { render, localeOf, type I18nText } from "../lib/i18n.js";
import { Response } from "express";

export function sendSuccess(res: Response, data: any, status: number = 200) {
    return res.status(status).json({
        success: true,
        data
    });
}

/** message 는 문장, 사전 키("err.x.y"), 또는 msg(key, params) — 키·I18nText 는 요청 언어(res.locals.locale)로 푼다. */
export function sendError(res: Response, status: number, message: string | I18nText, code?: string) {
    return res.status(status).json({
        success: false,
        message: render(localeOf(res), message),
        code
    });
}
