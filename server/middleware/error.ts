import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.js";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("❌ Unhandled Error:", err);

    // If headers are already sent, delegate to default Express error handler
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const code = err.code || "INTERNAL_ERROR";
    const details = process.env.NODE_ENV === "development" ? err.stack : undefined;

    return sendError(res, statusCode, message, code, details);
};
