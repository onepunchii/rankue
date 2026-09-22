import { tr, type I18nText } from "../lib/i18n.js";
/**
 * AppError — a business/domain error that carries an HTTP status.
 *
 * The central asyncHandler reads `error.statusCode` to choose the response status,
 * so throwing AppError lets storage/service code surface client-correctable
 * conditions (room full, already joined, wrong password, not found) as proper 4xx
 * responses instead of a generic 500. The `.message` is preserved verbatim, so any
 * route-level `catch (err) { if (err.message === "...") }` translation still works.
 */
export class AppError extends Error {
    statusCode: number;
    /** 사용자에게 보일 문구의 언어 무관 꼴 — asyncHandler 가 요청 언어로 푼다. message 는 한국어(로그·옛 비교용). */
    i18n?: I18nText;
    constructor(message: string | I18nText, statusCode = 400) {
        super(typeof message === "string" ? message : tr("ko", message.key, message.params));
        this.name = "AppError";
        this.statusCode = statusCode;
        if (typeof message !== "string") this.i18n = message;
    }
}

export const badRequest = (message: string | I18nText) => new AppError(message, 400);
export const unauthorized = (message: string | I18nText) => new AppError(message, 401);
export const notFound = (message: string | I18nText) => new AppError(message, 404);
export const conflict = (message: string | I18nText) => new AppError(message, 409);
