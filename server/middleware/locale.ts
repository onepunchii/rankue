import type { Request, Response, NextFunction } from "express";
import { normalizeLocale } from "../lib/i18n.js";

/** 요청의 언어 — 화면이 보내는 x-locale 헤더, 없으면 Accept-Language 첫 항목, 그것도 없으면 한국어. */
export function localeMiddleware(req: Request, res: Response, next: NextFunction) {
    const h = req.headers["x-locale"];
    const al = typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"].split(",")[0] : "";
    res.locals.locale = normalizeLocale(typeof h === "string" && h ? h : al);
    next();
}
